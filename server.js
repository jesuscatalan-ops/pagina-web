/**
 * server.js — Anime2Chile
 * Express + Mercado Pago Checkout Pro + Firebase Admin + contacto SMTP
 *
 * Flujo de pago:
 *  1. POST /api/crear-preferencia → valida precios, crea pedido en Firestore,
 *     crea preferencia MP y devuelve init_point
 *  2. El cliente paga en el checkout oficial de Mercado Pago
 *  3. POST /api/webhook → verifica el pago real, marca el pedido como "pagado"
 *     y envía correos de confirmación al comprador y al vendedor
 *
 * Contacto:
 *  POST /api/contacto → valida el formulario y envía el correo vía SMTP
 */

require('dotenv').config();

const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const express = require('express');
const nodemailer = require('nodemailer');
const admin = require('firebase-admin');
const { MercadoPagoConfig, Preference, Payment } = require('mercadopago');

// ══════════════════════════════════════════════════════════════
// Configuración
// ══════════════════════════════════════════════════════════════

const PORT = Number(process.env.PORT) || 3000;
const BASE_URL = (process.env.BASE_URL || `http://localhost:${PORT}`).replace(/\/$/, '');
const MP_ACCESS_TOKEN = process.env.MP_ACCESS_TOKEN || '';
const MP_PUBLIC_KEY = process.env.MP_PUBLIC_KEY || '';
// true → el sitio pide SITE_PASSWORD para entrar (webhook y health siguen públicos)
const COMING_SOON = String(process.env.COMING_SOON || '').toLowerCase() === 'true';
const SITE_PASSWORD = process.env.SITE_PASSWORD || '';
// false (por defecto) → productos Pokémon no se venden y sus páginas/JSON responden 404
const POKEMON_HABILITADO = String(process.env.POKEMON_HABILITADO || '').toLowerCase() === 'true';
const ACCESO_COOKIE = 'a2c_acceso';
const ADMIN_COOKIE = 'a2c_admin';
const ACCESO_TTL_SEG = 7 * 24 * 60 * 60;
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || '';
const MP_WEBHOOK_SECRET = (process.env.MP_WEBHOOK_SECRET || '').trim();
const IS_PRODUCTION = String(process.env.NODE_ENV || '').toLowerCase() === 'production';
const ADMIN_REMITENTE = {
  nombre: (process.env.ADMIN_REMITENTE_NOMBRE || '').trim(),
  rut: (process.env.ADMIN_REMITENTE_RUT || '').trim(),
  telefono: (process.env.ADMIN_REMITENTE_TELEFONO || '').trim(),
  email: (process.env.ADMIN_REMITENTE_EMAIL || '').trim(),
};
const ESTADOS_FULFILLMENT = new Set(['pendiente', 'enviado', 'entregado']);
const ESTADOS_PRE_PAGO = new Set(['pendiente_pago', 'error_preferencia']);
// Primer número visible de pedido. El contador en Firestore sigue desde aquí.
const NUMERO_PEDIDO_INICIAL = 2907;

if (!MP_ACCESS_TOKEN) {
  console.warn('⚠️  MP_ACCESS_TOKEN no está definido. Configúralo en .env');
}

const SMTP_HOST = (process.env.SMTP_HOST || '').trim();
const SMTP_PORT = Number(process.env.SMTP_PORT) || 465;
const SMTP_USER = (process.env.SMTP_USER || '').trim();
const SMTP_PASS = process.env.SMTP_PASS || '';
const CONTACT_TO = (process.env.CONTACT_TO || SMTP_USER || 'contacto@anime2chile.cl').trim();
const ORDERS_TO = (process.env.ORDERS_TO || 'ventas@anime2chile.cl')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);

const ASUNTOS_CONTACTO = new Set([
  'Consulta sobre producto',
  'Estado de mi pedido',
  'Devolución o cambio',
  'Solicitar reserva',
  'Otro',
]);

let mailer = null;

function initMailer() {
  if (!SMTP_HOST || !SMTP_USER || !SMTP_PASS) {
    console.warn('⚠️  SMTP no está configurado. Contacto y correos de pedido no se enviarán.');
    return;
  }

  mailer = nodemailer.createTransport({
    host: SMTP_HOST,
    port: SMTP_PORT,
    secure: SMTP_PORT === 465,
    auth: { user: SMTP_USER, pass: SMTP_PASS },
  });

  mailer.verify()
    .then(() => {
      console.log(`✅ SMTP listo (${SMTP_HOST}:${SMTP_PORT} → ${CONTACT_TO})`);
    })
    .catch((err) => {
      console.warn('⚠️  SMTP no se pudo verificar:', err && err.message ? err.message : err);
    });
}

initMailer();

// ── Reglas de envío (fuente de verdad del servidor) ──────────
const METODOS_ENVIO = {
  starken:   { id: 'starken',   nombre: 'Starken',            costoBase: 5000 },
  chilexpress: { id: 'chilexpress', nombre: 'Chilexpress',    costoBase: 4490 },
  correos:   { id: 'correos',   nombre: 'Correos de Chile',   costoBase: 3990 },
  retiro:    { id: 'retiro',    nombre: 'Retiro en Santiago', costoBase: 0, esRetiro: true },
};

// Tarifas Starken por región (CLP). porPagar: se muestra el estimado y no se cobra en checkout.
const TARIFAS_ENVIO_REGION = [
  { nombre: 'Arica y Parinacota', zona: 'Extremo Norte', costo: 10000, porPagar: false },
  { nombre: 'Tarapacá', zona: 'Extremo Norte', costo: 10000, porPagar: false },
  { nombre: 'Antofagasta', zona: 'Extremo Norte', costo: 10000, porPagar: false },
  { nombre: 'Atacama', zona: 'Centro/Sur', costo: 8000, porPagar: false },
  { nombre: 'Coquimbo', zona: 'Centro/Sur', costo: 8000, porPagar: false },
  { nombre: 'Valparaíso', zona: 'Centro/Sur', costo: 7000, porPagar: false },
  { nombre: 'Metropolitana de Santiago', zona: 'Misma ciudad', costo: 6000, porPagar: false },
  { nombre: "O'Higgins", zona: 'Centro/Sur', costo: 7000, porPagar: false },
  { nombre: 'Maule', zona: 'Centro/Sur', costo: 8000, porPagar: false },
  { nombre: 'Ñuble', zona: 'Centro/Sur', costo: 8000, porPagar: false },
  { nombre: 'Biobío', zona: 'Centro/Sur', costo: 8000, porPagar: false },
  { nombre: 'La Araucanía', zona: 'Centro/Sur', costo: 8000, porPagar: false },
  { nombre: 'Los Ríos', zona: 'Centro/Sur', costo: 8000, porPagar: false },
  { nombre: 'Los Lagos', zona: 'Centro/Sur', costo: 8000, porPagar: false },
  { nombre: 'Aysén', zona: 'Extremo Austral', costo: 13000, porPagar: true },
  { nombre: 'Magallanes', zona: 'Extremo Austral', costo: 13000, porPagar: true },
];

const ALIAS_REGION_ENVIO = {
  metropolitana: 'metropolitana de santiago',
  'rm metropolitana': 'metropolitana de santiago',
  'region metropolitana': 'metropolitana de santiago',
  santiago: 'metropolitana de santiago',
  'o higgins': 'ohiggins',
  'libertador general bernardo o higgins': 'ohiggins',
  araucania: 'la araucania',
  'aysen del general carlos ibanez del campo': 'aysen',
  'magallanes y de la antartica chilena': 'magallanes',
};

function normalizarRegion(valor) {
  return String(valor || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[''`´]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function tarifaEnvioPorRegion(regionRaw) {
  const normalizada = normalizarRegion(regionRaw);
  if (!normalizada) return null;
  const clave = ALIAS_REGION_ENVIO[normalizada] || normalizada;
  return TARIFAS_ENVIO_REGION.find((t) => {
    const nombreNorm = normalizarRegion(t.nombre);
    return nombreNorm === clave || nombreNorm === normalizada;
  }) || null;
}

// ── Cupones (fuente de verdad del servidor) ──────────────────
// tipo: 'porcentaje' | 'fijo' | 'envio_gratis'
// minimoCompra: subtotal mínimo en CLP (0 = sin mínimo)
// vigenteHasta: ISO date string o null = sin vencimiento
const CUPONES = {
  ANIME2CHILE: {
    codigo: 'ANIME2CHILE',
    tipo: 'porcentaje',
    valor: 10,
    minimoCompra: 0,
    vigenteHasta: null,
  },
};

// ══════════════════════════════════════════════════════════════
// Catálogo — fuente de precios (productos.json + pokemon)
// ══════════════════════════════════════════════════════════════

const ROOT = __dirname;

function cargarCatalogo() {
  const figuras = JSON.parse(
    fs.readFileSync(path.join(ROOT, 'productos.json'), 'utf8')
  );
  const pokemon = POKEMON_HABILITADO
    ? JSON.parse(fs.readFileSync(path.join(ROOT, 'productos-pokemon.json'), 'utf8'))
    : [];

  const mapa = new Map();
  for (const p of [...figuras, ...pokemon]) {
    if (!p || !p.id) continue;
    mapa.set(String(p.id), {
      id: String(p.id),
      nombre: String(p.nombre || p.id),
      precio: Math.round(Number(p.precio) || 0),
      imagen: p.imagen || '',
      stock: p.stock || null,
      maxCantidad: Math.max(1, Math.min(99, Number.parseInt(p.maxCantidad, 10) || 1)),
    });
  }
  return mapa;
}

function adelantoPctDe(valor) {
  const n = Number(valor);
  if (!Number.isFinite(n) || n <= 0 || n > 100) return 50;
  return n;
}

function precioAbono(precioTotal, adelantoPct) {
  return Math.round(Number(precioTotal || 0) * adelantoPctDe(adelantoPct) / 100);
}

function cargarReservas() {
  try {
    const lista = JSON.parse(
      fs.readFileSync(path.join(ROOT, 'reservas.json'), 'utf8')
    );
    const ids = new Set();
    const adelantos = new Map();
    for (const e of Array.isArray(lista) ? lista : []) {
      if (!e || !e.id) continue;
      const id = String(e.id);
      ids.add(id);
      adelantos.set(id, adelantoPctDe(e.adelantoPct));
    }
    return { ids, adelantos };
  } catch {
    return { ids: new Set(), adelantos: new Map() };
  }
}

function nombreConReserva(nombre) {
  const n = String(nombre || '').trim();
  if (/^\(RESERVA\)\s*/i.test(n)) return n.replace(/^\(RESERVA\)\s*/i, '(RESERVA) ');
  return '(RESERVA) ' + n;
}

let CATALOGO = cargarCatalogo();
let RESERVAS = cargarReservas();
let IDS_RESERVA = RESERVAS.ids;
let ADELANTOS_RESERVA = RESERVAS.adelantos;

// Recarga opcional en desarrollo sin reiniciar (útil al editar JSON)
function refrescarCatalogo() {
  CATALOGO = cargarCatalogo();
  RESERVAS = cargarReservas();
  IDS_RESERVA = RESERVAS.ids;
  ADELANTOS_RESERVA = RESERVAS.adelantos;
  return CATALOGO.size;
}

// ══════════════════════════════════════════════════════════════
// Firebase Admin
// ══════════════════════════════════════════════════════════════

let db = null;

function initFirebase() {
  const accountPath = (process.env.FIREBASE_SERVICE_ACCOUNT_PATH || '').trim();
  const accountJson = (process.env.FIREBASE_SERVICE_ACCOUNT || '').trim();
  const accountB64 = (process.env.FIREBASE_SERVICE_ACCOUNT_B64 || '').trim();

  let creds;
  try {
    if (accountPath) {
      // Local: leer el JSON desde un archivo (no subir al repo)
      const resolved = path.isAbsolute(accountPath)
        ? accountPath
        : path.join(ROOT, accountPath);
      creds = JSON.parse(fs.readFileSync(resolved, 'utf8'));
      console.log(`✅ Firebase Admin: credenciales desde archivo (${resolved})`);
    } else if (accountJson) {
      // Hostinger / prod: JSON completo en la variable de entorno
      creds = JSON.parse(accountJson);
      console.log('✅ Firebase Admin: credenciales desde FIREBASE_SERVICE_ACCOUNT');
    } else if (accountB64) {
      creds = JSON.parse(Buffer.from(accountB64, 'base64').toString('utf8'));
      console.log('✅ Firebase Admin: credenciales desde FIREBASE_SERVICE_ACCOUNT_B64');
    } else {
      console.warn(
        '⚠️  Define FIREBASE_SERVICE_ACCOUNT_PATH (archivo) o FIREBASE_SERVICE_ACCOUNT (JSON). Firestore no estará disponible.'
      );
      return;
    }
  } catch (err) {
    console.error('❌ No se pudieron cargar las credenciales de Firebase:', err.message);
    return;
  }

  admin.initializeApp({
    credential: admin.credential.cert(creds),
  });
  db = admin.firestore();
  console.log('✅ Firebase Admin inicializado');
}

initFirebase();

/**
 * Reserva el siguiente número de pedido (2907, 2908, …).
 * Transacción atómica: dos checkouts simultáneos no reciben el mismo número.
 * Si Mercado Pago falla después, el número no se reutiliza (puede haber huecos).
 */
async function reservarNumeroPedido() {
  const counterRef = db.collection('counters').doc('pedidos');
  return db.runTransaction(async (tx) => {
    const snap = await tx.get(counterRef);
    const stored = snap.exists ? Number(snap.data().siguiente) : NaN;
    const numero = Number.isInteger(stored) && stored >= NUMERO_PEDIDO_INICIAL
      ? stored
      : NUMERO_PEDIDO_INICIAL;
    tx.set(counterRef, {
      siguiente: numero + 1,
      actualizado: admin.firestore.FieldValue.serverTimestamp(),
    }, { merge: true });
    return numero;
  });
}

// ══════════════════════════════════════════════════════════════
// Mercado Pago
// ══════════════════════════════════════════════════════════════

const mpClient = new MercadoPagoConfig({
  accessToken: MP_ACCESS_TOKEN,
  options: { timeout: 15000 },
});

const preferenceClient = new Preference(mpClient);
const paymentClient = new Payment(mpClient);

function esCredencialTest() {
  return String(MP_ACCESS_TOKEN).startsWith('TEST-');
}

// ══════════════════════════════════════════════════════════════
// Utilidades de validación / sanitización
// ══════════════════════════════════════════════════════════════

function sanitizarTexto(valor, max = 200) {
  return String(valor ?? '')
    .trim()
    .replace(/[\u0000-\u001F\u007F]/g, '')
    .slice(0, max);
}

function sanitizarEmail(valor) {
  const email = sanitizarTexto(valor, 120).toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return null;
  return email;
}

function sanitizarMensaje(valor, max = 4000) {
  return String(valor ?? '')
    .replace(/\r\n/g, '\n')
    .replace(/[\u0000-\u0009\u000B\u000C\u000E-\u001F\u007F]/g, '')
    .trim()
    .slice(0, max);
}

function escapeHtml(valor) {
  return String(valor ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function formatoPeso(n) {
  return `$${Number(n || 0).toLocaleString('es-CL')}`;
}

function etiquetaPedido(pedido) {
  const n = Number(pedido && pedido.numero);
  return Number.isInteger(n) && n > 0 ? `#${n}` : 'sin número';
}

function nombreClienteDePedido(pedido) {
  const c = (pedido && pedido.cliente) || {};
  return `${c.nombre || ''} ${c.apellido || ''}`.trim() || 'Cliente';
}

function textoDireccionPedido(pedido) {
  const d = (pedido && pedido.direccion) || {};
  return [d.calle, d.depto, d.comuna, d.ciudad, d.region, d.postal].filter(Boolean).join(', ') || '—';
}

const TIPOS_DESTINO = new Set(['domicilio', 'sucursal']);

function etiquetaTipoDestino(tipo) {
  return tipo === 'sucursal' ? 'Sucursal Starken' : 'Domicilio';
}

function lineasDireccionPedido(pedido) {
  const d = (pedido && pedido.direccion) || {};
  const calle = [d.calle, d.depto].filter(Boolean).join(', ');
  const lineas = [];
  if (d.tipo) lineas.push(['Entrega en', etiquetaTipoDestino(d.tipo)]);
  if (calle) lineas.push(['Dirección', calle]);
  if (d.ciudad) lineas.push(['Ciudad', d.ciudad]);
  if (d.comuna) lineas.push(['Comuna', d.comuna]);
  if (d.region) lineas.push(['Región', d.region]);
  if (d.postal) lineas.push(['Código postal', d.postal]);
  return lineas;
}

function bloqueDireccionTexto(pedido, textoRetiro) {
  if (esRetiroPedido(pedido)) return textoRetiro;
  const lineas = lineasDireccionPedido(pedido);
  return lineas.length
    ? lineas.map(([label, valor]) => `${label}: ${valor}`).join('\n')
    : `Dirección: ${textoDireccionPedido(pedido)}`;
}

function bloqueDireccionHtml(pedido, textoRetiro) {
  if (esRetiroPedido(pedido)) {
    return `<p style="margin:0 0 16px;">${escapeHtml(textoRetiro)}</p>`;
  }
  const lineas = lineasDireccionPedido(pedido);
  if (!lineas.length) {
    return `<p style="margin:0 0 16px;"><strong>Dirección:</strong> ${escapeHtml(textoDireccionPedido(pedido))}</p>`;
  }
  return lineas.map(([label, valor], i) => {
    const margin = i === lineas.length - 1 ? '16px' : '4px';
    return `<p style="margin:0 0 ${margin};"><strong>${escapeHtml(label)}:</strong> ${escapeHtml(valor)}</p>`;
  }).join('');
}

function esRetiroPedido(pedido) {
  return !!(pedido && pedido.envio && pedido.envio.metodoId === 'retiro');
}

function lineasProductosTexto(pedido) {
  const lineas = (pedido.productos || []).map((p) => {
    const cant = p.cantidad || 1;
    const nombre = p.nombre || p.id || 'Producto';
    const sub = p.subtotal != null ? p.subtotal : (Number(p.precio) || 0) * cant;
    return `  ${cant}× ${nombre} — ${formatoPeso(sub)}`;
  });
  return lineas.length ? lineas.join('\n') : '  (sin productos)';
}

function filasProductosHtml(pedido) {
  const filas = (pedido.productos || []).map((p) => {
    const cant = p.cantidad || 1;
    const nombre = escapeHtml(p.nombre || p.id || 'Producto');
    const sub = p.subtotal != null ? p.subtotal : (Number(p.precio) || 0) * cant;
    return `<tr>
      <td style="padding:8px 0;border-bottom:1px solid #f0f0f0;color:#1a1a2e;">${cant}× ${nombre}</td>
      <td style="padding:8px 0;border-bottom:1px solid #f0f0f0;text-align:right;white-space:nowrap;color:#1a1a2e;">${escapeHtml(formatoPeso(sub))}</td>
    </tr>`;
  });
  return filas.join('') || '<tr><td colspan="2" style="color:#8a8a8a;">Sin productos</td></tr>';
}

function textoCostoEnvio(pedido) {
  const envio = (pedido && pedido.envio) || {};
  if (envio.porPagar) {
    const est = envio.estimado != null ? envio.estimado : envio.costo;
    return est ? `Por pagar (est. ${formatoPeso(est)})` : 'Por pagar';
  }
  const monto = pedido && pedido.totales ? pedido.totales.envio : envio.costo;
  if (Number(monto) === 0) return 'Gratis';
  return formatoPeso(monto);
}

function bloqueTotalesTexto(pedido) {
  const t = (pedido && pedido.totales) || {};
  const lineas = [`Subtotal: ${formatoPeso(t.subtotal)}`];
  if (t.descuentoMonto) {
    lineas.push(`Descuento${t.cupon ? ` (${t.cupon})` : ''}: −${formatoPeso(t.descuentoMonto)}`);
  }
  lineas.push(`Envío: ${textoCostoEnvio(pedido)}`);
  lineas.push(`Total: ${formatoPeso(t.total)}`);
  return lineas.join('\n');
}

function bloqueTotalesHtml(pedido) {
  const t = (pedido && pedido.totales) || {};
  const filas = [
    `<tr><td style="padding:4px 0;color:#6b7280;">Subtotal</td><td style="padding:4px 0;text-align:right;">${escapeHtml(formatoPeso(t.subtotal))}</td></tr>`,
  ];
  if (t.descuentoMonto) {
    const cupon = t.cupon ? ` (${escapeHtml(t.cupon)})` : '';
    filas.push(`<tr><td style="padding:4px 0;color:#6b7280;">Descuento${cupon}</td><td style="padding:4px 0;text-align:right;">−${escapeHtml(formatoPeso(t.descuentoMonto))}</td></tr>`);
  }
  filas.push(`<tr><td style="padding:4px 0;color:#6b7280;">Envío</td><td style="padding:4px 0;text-align:right;">${escapeHtml(textoCostoEnvio(pedido))}</td></tr>`);
  filas.push(`<tr><td style="padding:10px 0 0;font-weight:bold;color:#1a1a2e;">Total</td><td style="padding:10px 0 0;text-align:right;font-weight:bold;color:#ff6b35;">${escapeHtml(formatoPeso(t.total))}</td></tr>`);
  return filas.join('');
}

function urlLogoCorreo() {
  const base = BASE_URL.startsWith('https://') ? BASE_URL : 'https://anime2chile.cl';
  return `${base.replace(/\/$/, '')}/anime2chile_logo.png`;
}

function envolturaCorreo(titulo, cuerpoHtml) {
  const logo = escapeHtml(urlLogoCorreo());
  return `<!DOCTYPE html>
<html lang="es">
<head><meta charset="utf-8"><title>${escapeHtml(titulo)}</title></head>
<body style="margin:0;padding:0;background:#f4f4f5;font-family:Arial,Helvetica,sans-serif;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f4f4f5;padding:24px 12px;">
    <tr><td align="center">
      <table role="presentation" width="560" cellspacing="0" cellpadding="0" style="max-width:560px;width:100%;background:#ffffff;border-radius:16px;overflow:hidden;border:1px solid #ececec;">
        <tr>
          <td style="background:#ffffff;padding:20px 28px 16px;">
            <table role="presentation" cellspacing="0" cellpadding="0">
              <tr>
                <td style="vertical-align:middle;padding-right:12px;">
                  <img src="${logo}" alt="Anime2Chile" width="48" height="48" style="display:block;width:48px;height:48px;border:0;">
                </td>
                <td style="vertical-align:middle;">
                  <span style="font-family:Arial Black,Impact,Arial,sans-serif;font-size:22px;letter-spacing:2px;color:#1a1a2e;">ANIME</span><span style="font-family:Arial Black,Impact,Arial,sans-serif;font-size:28px;letter-spacing:1px;color:#ff6b35;">2</span><span style="font-family:Arial Black,Impact,Arial,sans-serif;font-size:22px;letter-spacing:2px;color:#1a1a2e;">CHILE</span>
                </td>
              </tr>
            </table>
          </td>
        </tr>
        <tr>
          <td style="height:4px;line-height:4px;font-size:0;background:#ff6b35;">&nbsp;</td>
        </tr>
        <tr>
          <td style="padding:28px;font-size:15px;line-height:1.55;color:#1a1a2e;">
            ${cuerpoHtml}
          </td>
        </tr>
        <tr>
          <td style="padding:0 28px 24px;color:#8a8a8a;font-size:12px;line-height:1.5;">
            Anime2Chile · Figuras originales en Chile<br>
            contacto@anime2chile.cl
          </td>
        </tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

async function enviarCorreoConfirmacionCliente(pedido) {
  if (!mailer) {
    console.warn('SMTP no configurado: se omite correo al comprador');
    return;
  }
  const email = sanitizarEmail(pedido.cliente && pedido.cliente.email);
  if (!email) {
    throw new Error('Pedido sin email de comprador válido');
  }

  const etiqueta = etiquetaPedido(pedido);
  const nombre = nombreClienteDePedido(pedido);
  const envio = (pedido.envio && pedido.envio.metodo) || '—';
  const asunto = `Pedido ${etiqueta} confirmado — Anime2Chile`;
  const bloqueDirTexto = bloqueDireccionTexto(pedido, 'Te contactaremos para coordinar el retiro.');
  const bloqueDirHtml = bloqueDireccionHtml(pedido, 'Te contactaremos para coordinar el retiro.');

  const texto = [
    `Hola ${nombre},`,
    '',
    `Recibimos tu pago y tu pedido ${etiqueta} quedó confirmado.`,
    '',
    'Productos:',
    lineasProductosTexto(pedido),
    '',
    `Envío: ${envio}`,
    bloqueDirTexto,
    '',
    bloqueTotalesTexto(pedido),
    '',
    'Pronto coordinaremos el despacho. Guarda este número de pedido por si nos escribes.',
    '',
    'Anime2Chile',
  ].join('\n');

  const html = envolturaCorreo(asunto, `
    <p style="margin:0 0 12px;">Hola ${escapeHtml(nombre)},</p>
    <p style="margin:0 0 20px;">Recibimos tu pago y tu pedido <strong>${escapeHtml(etiqueta)}</strong> quedó confirmado.</p>
    <p style="margin:0 0 8px;font-size:12px;letter-spacing:1px;color:#8a8a8a;text-transform:uppercase;">Productos</p>
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin-bottom:16px;">
      ${filasProductosHtml(pedido)}
    </table>
    <p style="margin:0 0 4px;"><strong>Envío:</strong> ${escapeHtml(envio)}</p>
    ${bloqueDirHtml}
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border-top:1px solid #f0f0f0;padding-top:8px;">
      ${bloqueTotalesHtml(pedido)}
    </table>
    <p style="margin:20px 0 0;color:#6b7280;font-size:14px;">Pronto coordinaremos el despacho. Guarda este número de pedido por si nos escribes.</p>
  `);

  await mailer.sendMail({
    from: `"Anime2Chile" <${SMTP_USER}>`,
    to: email,
    replyTo: CONTACT_TO || SMTP_USER,
    subject: asunto,
    text: texto,
    html,
  });
  console.log(`📧 Confirmación enviada al comprador (${email}) ${etiqueta}`);
}

async function enviarCorreoAvisoAdmin(pedido, pago) {
  if (!mailer) {
    console.warn('SMTP no configurado: se omite correo al vendedor');
    return;
  }
  if (!ORDERS_TO.length) {
    throw new Error('ORDERS_TO / CONTACT_TO no está definido');
  }

  const etiqueta = etiquetaPedido(pedido);
  const cliente = (pedido && pedido.cliente) || {};
  const nombre = nombreClienteDePedido(pedido);
  const emailCliente = cliente.email || '—';
  const envio = (pedido.envio && pedido.envio.metodo) || '—';
  const total = formatoPeso(pedido.totales && pedido.totales.total);
  const paymentId = pago && pago.id != null ? String(pago.id) : '—';
  const medioPago = (pago && pago.payment_method_id) || '—';
  const notas = (pedido && pedido.notas) || '';
  const asunto = `Nueva venta ${etiqueta} — ${total}`;
  const bloqueDirTexto = bloqueDireccionTexto(pedido, 'Retiro en Santiago');
  const bloqueDirHtml = bloqueDireccionHtml(pedido, 'Retiro en Santiago');

  const texto = [
    `Nueva venta ${etiqueta}`,
    '',
    `Cliente: ${nombre}`,
    `Email: ${emailCliente}`,
    `Teléfono: ${cliente.telefono || '—'}`,
    `RUT: ${cliente.rut || '—'}`,
    `Envío: ${envio}`,
    bloqueDirTexto,
    notas ? `Notas: ${notas}` : null,
    `Pago MP: ${paymentId}`,
    `Medio: ${medioPago}`,
    '',
    'Productos:',
    lineasProductosTexto(pedido),
    '',
    bloqueTotalesTexto(pedido),
  ].filter((linea) => linea != null).join('\n');

  const html = envolturaCorreo(asunto, `
    <p style="margin:0 0 16px;">Nueva venta <strong>${escapeHtml(etiqueta)}</strong></p>
    <p style="margin:0 0 4px;"><strong>Cliente:</strong> ${escapeHtml(nombre)}</p>
    <p style="margin:0 0 4px;"><strong>Email:</strong> ${escapeHtml(emailCliente)}</p>
    <p style="margin:0 0 4px;"><strong>Teléfono:</strong> ${escapeHtml(cliente.telefono || '—')}</p>
    <p style="margin:0 0 4px;"><strong>RUT:</strong> ${escapeHtml(cliente.rut || '—')}</p>
    <p style="margin:0 0 4px;"><strong>Envío:</strong> ${escapeHtml(envio)}</p>
    ${bloqueDirHtml}
    ${notas ? `<p style="margin:0 0 4px;"><strong>Notas:</strong> ${escapeHtml(notas)}</p>` : ''}
    <p style="margin:0 0 16px;"><strong>Pago MP:</strong> ${escapeHtml(paymentId)} · ${escapeHtml(medioPago)}</p>
    <p style="margin:0 0 8px;font-size:12px;letter-spacing:1px;color:#8a8a8a;text-transform:uppercase;">Productos</p>
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin-bottom:16px;">
      ${filasProductosHtml(pedido)}
    </table>
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border-top:1px solid #f0f0f0;padding-top:8px;">
      ${bloqueTotalesHtml(pedido)}
    </table>
  `);

  const replyTo = sanitizarEmail(emailCliente);
  await mailer.sendMail({
    from: `"Anime2Chile" <${SMTP_USER}>`,
    to: ORDERS_TO.join(', '),
    replyTo: replyTo || undefined,
    subject: asunto,
    text: texto,
    html,
  });
  console.log(`📧 Aviso de venta enviado a ${ORDERS_TO.join(', ')} ${etiqueta}`);
}

const STARKEN_SEGUIMIENTO_URL = 'https://www.starken.cl/seguimiento';
const TRACKING_RE = /^[A-Z0-9-]{6,40}$/;

function normalizarTracking(valor) {
  return sanitizarTexto(valor, 60).replace(/\s+/g, '').toUpperCase();
}

async function enviarCorreoDespachoCliente(pedido) {
  if (!mailer) {
    console.warn('SMTP no configurado: se omite correo de despacho al comprador');
    return;
  }
  const cliente = (pedido && pedido.cliente) || {};
  const email = sanitizarEmail(cliente.email);
  if (!email) {
    throw new Error('El pedido no tiene un email de cliente válido');
  }

  const etiqueta = etiquetaPedido(pedido);
  const nombre = nombreClienteDePedido(pedido);
  const tracking = pedido.despacho.tracking;
  const asunto = `Tu pedido ${etiqueta} fue despachado`;
  const bloqueDirTexto = bloqueDireccionTexto(pedido, '—');
  const bloqueDirHtml = bloqueDireccionHtml(pedido, '—');

  const texto = [
    `Hola ${nombre},`,
    '',
    `Tu pedido ${etiqueta} acaba de ser despachado por Starken.`,
    '',
    `Número de seguimiento: ${tracking}`,
    `Puedes seguir tu envío en: ${STARKEN_SEGUIMIENTO_URL}`,
    '',
    'Productos:',
    lineasProductosTexto(pedido),
    '',
    bloqueDirTexto,
    '',
    'Si tienes cualquier duda, responde este correo indicando tu número de pedido.',
    '',
    'Anime2Chile',
  ].join('\n');

  const html = envolturaCorreo(asunto, `
    <p style="margin:0 0 12px;">Hola ${escapeHtml(nombre)},</p>
    <p style="margin:0 0 20px;">Tu pedido <strong>${escapeHtml(etiqueta)}</strong> acaba de ser despachado por <strong>Starken</strong>.</p>
    <p style="margin:0 0 8px;font-size:12px;letter-spacing:1px;color:#8a8a8a;text-transform:uppercase;">Número de seguimiento</p>
    <p style="margin:0 0 16px;font-size:22px;font-weight:bold;letter-spacing:2px;">${escapeHtml(tracking)}</p>
    <p style="margin:0 0 24px;">
      <a href="${STARKEN_SEGUIMIENTO_URL}" style="display:inline-block;padding:12px 20px;background:#ff6b35;color:#ffffff;text-decoration:none;border-radius:8px;font-weight:bold;">Seguir mi envío en Starken</a>
    </p>
    <p style="margin:0 0 8px;font-size:12px;letter-spacing:1px;color:#8a8a8a;text-transform:uppercase;">Productos</p>
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin-bottom:16px;">
      ${filasProductosHtml(pedido)}
    </table>
    ${bloqueDirHtml}
    <p style="margin:20px 0 0;color:#6b7280;font-size:14px;">Si tienes cualquier duda, responde este correo indicando tu número de pedido.</p>
  `);

  await mailer.sendMail({
    from: `"Anime2Chile" <${SMTP_USER}>`,
    to: email,
    replyTo: CONTACT_TO || SMTP_USER,
    subject: asunto,
    text: texto,
    html,
  });
  console.log(`📧 Aviso de despacho enviado al comprador (${email}) ${etiqueta} — ${tracking}`);
}

async function enviarCorreoAvisoDespachoAdmin(pedido) {
  if (!mailer || !ORDERS_TO.length) return;

  const etiqueta = etiquetaPedido(pedido);
  const nombre = nombreClienteDePedido(pedido);
  const email = (pedido.cliente && pedido.cliente.email) || '—';
  const tracking = pedido.despacho.tracking;
  const asunto = `Despacho notificado ${etiqueta} — ${tracking}`;

  const texto = [
    `Se envió correctamente el aviso de despacho del pedido ${etiqueta}.`,
    '',
    `Cliente: ${nombre} (${email})`,
    `Tracking Starken: ${tracking}`,
  ].join('\n');

  const html = envolturaCorreo(asunto, `
    <p style="margin:0 0 16px;">Se envió correctamente el aviso de despacho del pedido <strong>${escapeHtml(etiqueta)}</strong>.</p>
    <p style="margin:0 0 4px;"><strong>Cliente:</strong> ${escapeHtml(nombre)} (${escapeHtml(email)})</p>
    <p style="margin:0;"><strong>Tracking Starken:</strong> ${escapeHtml(tracking)}</p>
  `);

  await mailer.sendMail({
    from: `"Anime2Chile" <${SMTP_USER}>`,
    to: ORDERS_TO.join(', '),
    subject: asunto,
    text: texto,
    html,
  });
  console.log(`📧 Confirmación de despacho enviada a ${ORDERS_TO.join(', ')} ${etiqueta}`);
}

async function notificarPedidoPagado(pedidoRef, pedido, pago) {
  const notif = (pedido && pedido.notificaciones) || {};
  const updates = {};

  if (!notif.correoCliente) {
    try {
      await enviarCorreoConfirmacionCliente(pedido);
      if (mailer) updates['notificaciones.correoCliente'] = true;
    } catch (err) {
      console.error('❌ Correo al comprador:', err && err.message ? err.message : err);
    }
  }

  if (!notif.correoAdmin) {
    try {
      await enviarCorreoAvisoAdmin(pedido, pago);
      if (mailer) updates['notificaciones.correoAdmin'] = true;
    } catch (err) {
      console.error('❌ Correo al vendedor:', err && err.message ? err.message : err);
    }
  }

  if (Object.keys(updates).length === 0) return;

  try {
    await pedidoRef.update(updates);
  } catch (err) {
    console.error('❌ No se pudo marcar notificaciones de correo:', err);
  }
}

function ipCliente(req) {
  return req.ip || req.socket.remoteAddress || 'unknown';
}

const CONTACT_RATE = { windowMs: 15 * 60 * 1000, max: 5 };
const contactHits = new Map();
const PREFERENCIA_RATE = { windowMs: 15 * 60 * 1000, max: 20 };
const preferenciaHits = new Map();
const ADMIN_RATE = { windowMs: 15 * 60 * 1000, max: 8 };
const adminHits = new Map();

function contactoDentroDeLimite(ip) {
  const now = Date.now();
  let entry = contactHits.get(ip);
  if (!entry || now > entry.resetAt) {
    entry = { count: 0, resetAt: now + CONTACT_RATE.windowMs };
    contactHits.set(ip, entry);
  }
  entry.count += 1;
  if (contactHits.size > 2000) {
    for (const [key, value] of contactHits) {
      if (now > value.resetAt) contactHits.delete(key);
    }
  }
  return entry.count <= CONTACT_RATE.max;
}

function sanitizarTelefono(valor) {
  // Espera 9 dígitos chilenos (sin +56) o con prefijo
  let digitos = String(valor ?? '').replace(/\D/g, '');
  if (digitos.startsWith('56') && digitos.length === 11) {
    digitos = digitos.slice(2);
  }
  if (!/^[9]\d{8}$/.test(digitos)) return null;
  return digitos;
}

function sanitizarCantidad(valor) {
  const n = Number.parseInt(valor, 10);
  if (!Number.isFinite(n) || n < 1 || n > 99) return null;
  return n;
}

/**
 * Valida cupón contra la lista del servidor.
 * Devuelve { ok, cupon|null, mensaje }
 */
function validarCupon(codigoRaw, subtotal) {
  const codigo = sanitizarTexto(codigoRaw, 40).toUpperCase();
  if (!codigo) {
    return { ok: true, cupon: null, mensaje: null, descuentoMonto: 0, envioGratis: false };
  }

  const cupon = CUPONES[codigo];
  if (!cupon) {
    return { ok: false, cupon: null, mensaje: 'Código de cupón inválido', descuentoMonto: 0, envioGratis: false };
  }

  if (cupon.vigenteHasta) {
    const hasta = new Date(cupon.vigenteHasta);
    if (Number.isFinite(hasta.getTime()) && Date.now() > hasta.getTime()) {
      return { ok: false, cupon: null, mensaje: 'Este cupón ya expiró', descuentoMonto: 0, envioGratis: false };
    }
  }

  if (subtotal < (cupon.minimoCompra || 0)) {
    return {
      ok: false,
      cupon: null,
      mensaje: `Este cupón requiere una compra mínima de $${(cupon.minimoCompra).toLocaleString('es-CL')}`,
      descuentoMonto: 0,
      envioGratis: false,
    };
  }

  let descuentoMonto = 0;
  if (cupon.tipo === 'porcentaje') {
    const pct = Number(cupon.valor) > 1 ? Number(cupon.valor) / 100 : Number(cupon.valor);
    descuentoMonto = Math.round(subtotal * pct);
  } else if (cupon.tipo === 'fijo') {
    descuentoMonto = Math.round(cupon.valor);
  }

  descuentoMonto = Math.max(0, Math.min(descuentoMonto, subtotal));

  return {
    ok: true,
    cupon,
    mensaje: null,
    descuentoMonto,
    envioGratis: cupon.tipo === 'envio_gratis',
  };
}

/**
 * Calcula costo de envío según región. Retiro siempre es 0.
 * Aysén y Magallanes son por pagar: el estimado se informa y el cobro en checkout es 0.
 */
function calcularEnvio(tipoEnvioRaw, _subtotal, regionRaw) {
  const tipo = sanitizarTexto(tipoEnvioRaw, 40).toLowerCase();
  const metodo = METODOS_ENVIO[tipo];
  if (!metodo) {
    return { ok: false, mensaje: 'Método de envío inválido' };
  }

  if (metodo.esRetiro) {
    return {
      ok: true,
      metodo: {
        id: metodo.id,
        nombre: metodo.nombre,
        costo: 0,
        estimado: 0,
        porPagar: false,
        zona: null,
        region: null,
        esRetiro: true,
      },
    };
  }

  const tarifa = tarifaEnvioPorRegion(regionRaw);
  if (!tarifa) {
    return { ok: false, mensaje: 'Selecciona una región válida para calcular el envío' };
  }

  const porPagar = !!tarifa.porPagar;
  return {
    ok: true,
    metodo: {
      id: metodo.id,
      nombre: porPagar ? `${metodo.nombre} (por pagar)` : metodo.nombre,
      costo: porPagar ? 0 : tarifa.costo,
      estimado: tarifa.costo,
      porPagar,
      zona: tarifa.zona,
      region: tarifa.nombre,
      esRetiro: false,
    },
  };
}

/**
 * Reparte el descuento proporcionalmente entre unit_price de los ítems.
 * CLP sin decimales: enteros + residuo en el último ítem.
 * Si el residuo no es divisible por la cantidad del último ítem, se absorbe
 * en shipments.cost para que:
 *   sum(unit_price × cantidad) + envío === subtotal - descuento + envíoOriginal
 */
function construirItemsMp(items, descuentoMonto, costoEnvio) {
  const subtotal = items.reduce((s, i) => s + i.precio * i.cantidad, 0);
  const targetItems = subtotal - descuentoMonto;
  const totalEsperado = targetItems + costoEnvio;

  if (items.length === 0) {
    throw new Error('No hay ítems para la preferencia');
  }

  const toMpItem = (item, unitPrice, quantity) => ({
    id: item.id,
    title: String(item.nombre).slice(0, 256),
    quantity,
    unit_price: Math.max(0, unitPrice),
    currency_id: 'CLP',
  });

  // Sin descuento: precios del catálogo tal cual
  if (descuentoMonto === 0) {
    return {
      mpItems: items.map((i) => toMpItem(i, i.precio, i.cantidad)),
      costoEnvioFinal: costoEnvio,
      itemsSum: subtotal,
      total: totalEsperado,
    };
  }

  // Totales de línea proporcionales (método del resto mayor) → suman targetItems
  const weights = items.map((i) => i.precio * i.cantidad);
  const exact = weights.map((w) => (w / subtotal) * targetItems);
  const lineTotals = exact.map((e) => Math.floor(e));
  let rem = targetItems - lineTotals.reduce((a, b) => a + b, 0);
  const orderFrac = exact
    .map((e, i) => ({ i, frac: e - Math.floor(e) }))
    .sort((a, b) => b.frac - a.frac);
  for (let k = 0; k < rem; k++) {
    lineTotals[orderFrac[k].i] += 1;
  }

  const mpItems = [];
  let assigned = 0;

  for (let i = 0; i < items.length - 1; i++) {
    const item = items[i];
    // Línea divisible por cantidad
    const line = Math.floor(lineTotals[i] / item.cantidad) * item.cantidad;
    const unit = line / item.cantidad;
    mpItems.push(toMpItem(item, unit, item.cantidad));
    assigned += line;
  }

  // Último ítem absorbe todo el residual del target
  const last = items[items.length - 1];
  let lastLine = targetItems - assigned;

  if (lastLine < 0) {
    throw new Error('Residuo de descuento inválido');
  }

  let costoEnvioFinal = costoEnvio;

  if (lastLine % last.cantidad === 0) {
    mpItems.push(toMpItem(last, lastLine / last.cantidad, last.cantidad));
  } else {
    // No divisible: unit_price entero; pesos sobrantes → envío
    const unit = Math.floor(lastLine / last.cantidad);
    const lineUsada = unit * last.cantidad;
    const pesosSobrantes = lastLine - lineUsada;
    mpItems.push(toMpItem(last, unit, last.cantidad));
    costoEnvioFinal = costoEnvio + pesosSobrantes;
  }

  const itemsSum = mpItems.reduce((s, it) => s + it.unit_price * it.quantity, 0);
  const total = itemsSum + costoEnvioFinal;

  if (total !== totalEsperado) {
    throw new Error(
      `No se pudo cuadrar el total MP (${total}) con el esperado (${totalEsperado})`
    );
  }

  return { mpItems, costoEnvioFinal, itemsSum, total: totalEsperado };
}

// ══════════════════════════════════════════════════════════════
// Express
// ══════════════════════════════════════════════════════════════

const app = express();

app.disable('x-powered-by');
app.set('trust proxy', 1);

app.use(express.json({ limit: '256kb' }));
app.use(express.urlencoded({ extended: true, limit: '64kb' }));

app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  if (BASE_URL.startsWith('https://')) {
    res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  }
  next();
});

function esRutaSensible(pathname) {
  const p = String(pathname || '');
  return (
    /^\/server\.js$/i.test(p)
    || /^\/package(-lock)?\.json$/i.test(p)
    || /^\/node_modules(\/|$)/i.test(p)
    || /^\/\.git(\/|$)/i.test(p)
    || /^\/\.env/i.test(p)
    || /firebase-adminsdk/i.test(p)
    || /serviceAccount/i.test(p)
    || /firebase-service-account/i.test(p)
    || /^\/firestore\.rules$/i.test(p)
    || /^\/\.gitignore$/i.test(p)
    || /\.(md|log)$/i.test(p)
    || /^\/Anime2Chile\.zip$/i.test(p)
  );
}

app.use((req, res, next) => {
  if (esRutaSensible(req.path)) {
    return res.status(404).type('text/plain').send('Not found');
  }
  next();
});

function esRutaPokemon(pathname) {
  return /^\/(productos-pokemon\.json|pokemon(-tcg)?(\.html)?|pokemon-tcg\.js|catalogo-pokemon(\.html|\.js)?|pokemon-destacados\.js)$/i
    .test(String(pathname || ''));
}

if (!POKEMON_HABILITADO) {
  app.use((req, res, next) => {
    if (esRutaPokemon(req.path)) {
      return res.status(404).type('text/plain').send('Not found');
    }
    next();
  });
}

// ── Acceso previo al lanzamiento (COMING_SOON + SITE_PASSWORD) ─
const RUTAS_PUBLICAS_PREVIEW = new Set([
  '/api/acceso',
  '/api/webhook',
  '/api/health',
  '/proximamente.html',
  '/anime2chile_logo.png',
  '/favicon.png',
  '/favicon.ico',
  '/apple-touch-icon.png',
]);

const ACCESO_RATE = { windowMs: 15 * 60 * 1000, max: 8 };
const accesoHits = new Map();

function leerCookie(req, nombre) {
  const header = String(req.headers.cookie || '');
  for (const parte of header.split(';')) {
    const i = parte.indexOf('=');
    if (i === -1) continue;
    if (parte.slice(0, i).trim() !== nombre) continue;
    try {
      return decodeURIComponent(parte.slice(i + 1).trim());
    } catch {
      return parte.slice(i + 1).trim();
    }
  }
  return '';
}

function secretosIguales(a, b) {
  const ha = crypto.createHash('sha256').update(String(a ?? '')).digest();
  const hb = crypto.createHash('sha256').update(String(b ?? '')).digest();
  return crypto.timingSafeEqual(ha, hb);
}

function firmaAcceso() {
  return crypto.createHmac('sha256', SITE_PASSWORD).update('anime2chile-acceso-v1').digest('hex');
}

function tieneAccesoSitio(req) {
  if (!COMING_SOON) return true;
  if (!SITE_PASSWORD) return false;
  return secretosIguales(leerCookie(req, ACCESO_COOKIE), firmaAcceso());
}

function cookieEsSegura(req) {
  if (BASE_URL.startsWith('https://')) return true;
  return String(req.headers['x-forwarded-proto'] || '').split(',')[0].trim() === 'https';
}

function ponerCookieAcceso(req, res) {
  const secure = cookieEsSegura(req) ? '; Secure' : '';
  res.setHeader(
    'Set-Cookie',
    `${ACCESO_COOKIE}=${firmaAcceso()}; HttpOnly; Path=/; Max-Age=${ACCESO_TTL_SEG}; SameSite=Lax${secure}`
  );
}

function dentroDeLimite(hitsMap, windowMs, max, ip) {
  const now = Date.now();
  let entry = hitsMap.get(ip);
  if (!entry || now > entry.resetAt) {
    entry = { count: 0, resetAt: now + windowMs };
    hitsMap.set(ip, entry);
  }
  entry.count += 1;
  if (hitsMap.size > 2000) {
    for (const [key, value] of hitsMap) {
      if (now > value.resetAt) hitsMap.delete(key);
    }
  }
  return entry.count <= max;
}

function accesoDentroDeLimite(ip) {
  return dentroDeLimite(accesoHits, ACCESO_RATE.windowMs, ACCESO_RATE.max, ip);
}

function preferenciaDentroDeLimite(ip) {
  return dentroDeLimite(preferenciaHits, PREFERENCIA_RATE.windowMs, PREFERENCIA_RATE.max, ip);
}

function adminDentroDeLimite(ip) {
  return dentroDeLimite(adminHits, ADMIN_RATE.windowMs, ADMIN_RATE.max, ip);
}

function firmaAdmin() {
  return crypto.createHmac('sha256', ADMIN_PASSWORD).update('anime2chile-admin-v1').digest('hex');
}

function tieneAccesoAdmin(req) {
  if (!ADMIN_PASSWORD) return false;
  return secretosIguales(leerCookie(req, ADMIN_COOKIE), firmaAdmin());
}

function ponerCookieAdmin(req, res) {
  const secure = cookieEsSegura(req) ? '; Secure' : '';
  res.append(
    'Set-Cookie',
    `${ADMIN_COOKIE}=${firmaAdmin()}; HttpOnly; Path=/; Max-Age=${ACCESO_TTL_SEG}; SameSite=Lax${secure}`
  );
}

function borrarCookieAdmin(req, res) {
  const secure = cookieEsSegura(req) ? '; Secure' : '';
  res.append(
    'Set-Cookie',
    `${ADMIN_COOKIE}=; HttpOnly; Path=/; Max-Age=0; SameSite=Lax${secure}`
  );
}

function exigirAdmin(req, res, next) {
  if (!tieneAccesoAdmin(req)) {
    return res.status(401).json({ ok: false, message: 'No autorizado.' });
  }
  next();
}

function timestampJson(ts) {
  if (!ts) return null;
  if (typeof ts.toDate === 'function') return ts.toDate().toISOString();
  if (typeof ts.toJSON === 'function') return ts.toJSON();
  if (ts.seconds != null) return new Date(Number(ts.seconds) * 1000).toISOString();
  return ts;
}

function estadoFulfillment(pedido) {
  if (!pedidoPagoAprobado(pedido)) return 'sin_pagar';
  const e = pedido && pedido.estado ? String(pedido.estado) : 'pendiente';
  if (e === 'pagado' || ESTADOS_PRE_PAGO.has(e)) return 'pendiente';
  return e;
}

function pedidoPagoAprobado(pedido) {
  const mp = (pedido && pedido.mercadopago) || {};
  return mp.status === 'approved' || !!mp.paidAt || pedido.estado === 'pagado';
}

function pedidoParaAdmin(id, pedido) {
  return {
    id,
    numero: pedido.numero ?? null,
    estado: estadoFulfillment(pedido),
    fecha: timestampJson(pedido.fecha),
    cliente: pedido.cliente || {},
    direccion: pedido.direccion || {},
    envio: pedido.envio || {},
    productos: pedido.productos || [],
    totales: pedido.totales || {},
    notas: pedido.notas || null,
    despacho: pedido.despacho
      ? { tracking: pedido.despacho.tracking || null, correoCliente: !!pedido.despacho.correoCliente }
      : null,
    pagoAprobado: pedidoPagoAprobado(pedido),
    alertaPago: (pedido.mercadopago && pedido.mercadopago.alerta) || null,
  };
}

function verificarFirmaWebhookMp(req) {
  if (!MP_WEBHOOK_SECRET) return { ok: true, skipped: true };

  const xSignature = String(req.headers['x-signature'] || '');
  const xRequestId = String(req.headers['x-request-id'] || '');
  const parts = {};
  for (const parte of xSignature.split(',')) {
    const i = parte.indexOf('=');
    if (i === -1) continue;
    parts[parte.slice(0, i).trim()] = parte.slice(i + 1).trim();
  }
  const ts = parts.ts;
  const v1 = parts.v1;
  const dataId = String(
    (req.query && req.query['data.id'])
    || (req.body && req.body.data && req.body.data.id)
    || ''
  ).toLowerCase();

  if (!ts || !v1 || !dataId || !xRequestId) return { ok: false };

  const manifest = `id:${dataId};request-id:${xRequestId};ts:${ts};`;
  const esperado = crypto.createHmac('sha256', MP_WEBHOOK_SECRET).update(manifest).digest('hex');
  return { ok: secretosIguales(esperado, v1) };
}

function montosPagoCoinciden(pago, pedido) {
  // transaction_amount excluye shipments.cost; MP lo informa aparte en shipping_amount
  const cobrado = Math.round(
    Number(pago && pago.transaction_amount) + Number((pago && pago.shipping_amount) || 0)
  );
  const esperado = Math.round(Number(pedido && pedido.totales && pedido.totales.total));
  return Number.isFinite(cobrado) && Number.isFinite(esperado) && cobrado === esperado;
}

function aceptaJson(req) {
  return String(req.headers.accept || '').includes('application/json') || !!req.is('application/json');
}

if (COMING_SOON) {
  app.use((req, res, next) => {
    if (tieneAccesoSitio(req)) return next();
    if (RUTAS_PUBLICAS_PREVIEW.has(req.path)) return next();
    if (req.path.startsWith('/api/')) {
      return res.status(401).json({ ok: false, message: 'Acceso restringido.' });
    }
    return res.sendFile(path.join(ROOT, 'proximamente.html'));
  });
}

app.post('/api/acceso', (req, res) => {
  const json = aceptaJson(req);

  if (!COMING_SOON) {
    return json ? res.json({ ok: true }) : res.redirect('/');
  }

  const ip = ipCliente(req);
  if (!accesoDentroDeLimite(ip)) {
    if (json) {
      return res.status(429).json({ ok: false, message: 'Demasiados intentos. Espera unos minutos.' });
    }
    return res.redirect('/?error=rate');
  }

  const password = String((req.body && req.body.password) || '');
  if (!SITE_PASSWORD || !secretosIguales(password, SITE_PASSWORD)) {
    if (json) {
      return res.status(401).json({ ok: false, message: 'Contraseña incorrecta.' });
    }
    return res.redirect('/?error=1');
  }

  ponerCookieAcceso(req, res);
  return json ? res.json({ ok: true }) : res.redirect('/');
});

// Public Key para el frontend (sin secretos)
app.get('/api/config', (_req, res) => {
  res.json({
    publicKey: MP_PUBLIC_KEY,
    baseUrl: BASE_URL,
    metodosEnvio: Object.values(METODOS_ENVIO).map((m) => ({
      id: m.id,
      nombre: m.nombre,
      costoBase: m.costoBase,
      esRetiro: !!m.esRetiro,
    })),
    tarifasEnvioRegion: TARIFAS_ENVIO_REGION,
  });
});

/**
 * POST /api/crear-preferencia
 * Body esperado:
 * {
 *   items: [{ id, cantidad }],
 *   cupon?: string,
 *   tipoEnvio: 'starken'|'chilexpress'|'correos'|'retiro',
 *   cliente: { nombre, apellido, email, telefono, rut },
 *   direccion?: { region, ciudad, comuna, postal, calle, depto, tipo: 'domicilio'|'sucursal' },
 *   notas?: string
 * }
 */
app.post('/api/crear-preferencia', async (req, res) => {
  try {
    const body = req.body || {};
    const itemsRaw = Array.isArray(body.items) ? body.items : null;
    if (!itemsRaw || itemsRaw.length === 0) {
      return res.status(400).json({ error: 'El carrito está vacío' });
    }
    if (itemsRaw.length > 50) {
      return res.status(400).json({ error: 'Demasiados ítems en el carrito' });
    }

    // ── Validar ítems contra el catálogo (NO confiar en precios del cliente) ──
    const cantidadesPorId = new Map();
    for (const raw of itemsRaw) {
      const id = sanitizarTexto(raw && raw.id, 80);
      const cantidad = sanitizarCantidad(raw && raw.cantidad);
      if (!id || !cantidad) {
        return res.status(400).json({ error: 'Ítem inválido en el carrito' });
      }
      cantidadesPorId.set(id, (cantidadesPorId.get(id) || 0) + cantidad);
    }

    const itemsValidados = [];
    for (const [id, cantidadRaw] of cantidadesPorId) {
      const cantidad = sanitizarCantidad(cantidadRaw);
      if (!cantidad) {
        return res.status(400).json({ error: 'Cantidad inválida en el carrito' });
      }
      const producto = CATALOGO.get(id);
      if (!producto || producto.precio <= 0) {
        return res.status(400).json({ error: `Producto no encontrado o sin precio: ${id}` });
      }
      if (producto.stock === 'out-stock') {
        return res.status(400).json({ error: `${producto.nombre} está agotado` });
      }
      if (cantidad > producto.maxCantidad) {
        return res.status(400).json({
          error: `Solo puedes comprar ${producto.maxCantidad} unidad${producto.maxCantidad === 1 ? '' : 'es'} de ${producto.nombre}`,
        });
      }
      const esReserva = IDS_RESERVA.has(producto.id);
      const adelantoPct = esReserva
        ? (ADELANTOS_RESERVA.get(producto.id) || 50)
        : null;
      const precioCobrado = esReserva
        ? precioAbono(producto.precio, adelantoPct)
        : producto.precio;
      itemsValidados.push({
        id: producto.id,
        nombre: esReserva ? nombreConReserva(producto.nombre) : producto.nombre,
        precio: precioCobrado,
        precioTotal: producto.precio,
        adelantoPct,
        reserva: esReserva,
        cantidad,
        imagen: producto.imagen,
      });
    }

    if (!preferenciaDentroDeLimite(ipCliente(req))) {
      return res.status(429).json({ error: 'Demasiados intentos de pago. Espera unos minutos.' });
    }
    if (!MP_ACCESS_TOKEN) {
      return res.status(500).json({ error: 'Mercado Pago no está configurado en el servidor' });
    }
    if (!db) {
      return res.status(500).json({ error: 'Firestore no está configurado en el servidor' });
    }

    const subtotal = itemsValidados.reduce((s, i) => s + i.precio * i.cantidad, 0);

    // ── Cupón ──
    const resultadoCupon = validarCupon(body.cupon, subtotal);
    // Si el código viene y es inválido: se ignora el descuento y se avisa
    let avisoCupon = null;
    let descuentoMonto = 0;
    let cuponAplicado = null;
    if (body.cupon && String(body.cupon).trim()) {
      if (!resultadoCupon.ok) {
        avisoCupon = resultadoCupon.mensaje || 'Cupón no aplicado';
      } else {
        descuentoMonto = resultadoCupon.descuentoMonto;
        cuponAplicado = resultadoCupon.cupon ? resultadoCupon.cupon.codigo : null;
      }
    }

    // ── Cliente ──
    const clienteIn = body.cliente || {};
    const nombre = sanitizarTexto(clienteIn.nombre, 80);
    const apellido = sanitizarTexto(clienteIn.apellido, 80);
    const email = sanitizarEmail(clienteIn.email);
    const telefono = sanitizarTelefono(clienteIn.telefono);
    const rut = sanitizarTexto(clienteIn.rut, 20);

    if (nombre.length < 2 || apellido.length < 2) {
      return res.status(400).json({ error: 'Nombre y apellido son obligatorios' });
    }
    if (!email) {
      return res.status(400).json({ error: 'Email inválido' });
    }
    if (!telefono) {
      return res.status(400).json({ error: 'Teléfono inválido (9 dígitos, inicia con 9)' });
    }

    const dirIn = body.direccion || {};
    const direccion = {
      region: sanitizarTexto(dirIn.region, 80),
      ciudad: sanitizarTexto(dirIn.ciudad, 80),
      comuna: sanitizarTexto(dirIn.comuna, 80),
      postal: sanitizarTexto(dirIn.postal, 20),
      calle: sanitizarTexto(dirIn.calle, 160),
      depto: sanitizarTexto(dirIn.depto, 80),
      tipo: TIPOS_DESTINO.has(dirIn.tipo) ? dirIn.tipo : null,
    };

    // ── Envío (tarifa según región) ──
    const resultadoEnvio = calcularEnvio(body.tipoEnvio, subtotal, direccion.region);
    if (!resultadoEnvio.ok) {
      return res.status(400).json({ error: resultadoEnvio.mensaje });
    }
    const envio = resultadoEnvio.metodo;
    if (resultadoCupon.ok && resultadoCupon.envioGratis && !envio.esRetiro && !envio.porPagar) {
      envio.costo = 0;
    }

    if (!envio.esRetiro) {
      if (!direccion.region || direccion.ciudad.length < 2 || direccion.comuna.length < 2 || direccion.calle.length < 5) {
        return res.status(400).json({ error: 'Dirección incompleta para el envío' });
      }
      if (!direccion.tipo) {
        return res.status(400).json({ error: 'Indica si envías a un domicilio o a una sucursal Starken' });
      }
    }

    const notas = sanitizarTexto(body.notas, 500) || null;
    const total = subtotal - descuentoMonto + envio.costo;

    // ── Construir ítems MP con descuento repartido ──
    const { mpItems, costoEnvioFinal, total: totalMp } = construirItemsMp(
      itemsValidados,
      descuentoMonto,
      envio.costo
    );

    if (totalMp !== total) {
      console.error('Descuadre de total:', { total, totalMp });
      return res.status(500).json({ error: 'Error interno al calcular el total' });
    }

    // ── 1) Crear pedido en Firestore (estado pendiente_pago) ──
    const pedidoRef = db.collection('pedidos').doc();
    const pedidoId = pedidoRef.id;
    const numero = await reservarNumeroPedido();

    const pedido = {
      fecha: admin.firestore.FieldValue.serverTimestamp(),
      numero,
      estado: 'pendiente_pago',
      cliente: {
        nombre,
        apellido,
        telefono: `+56${telefono}`,
        email,
        rut: rut || null,
      },
      direccion,
      envio: {
        metodo: envio.nombre,
        metodoId: envio.id,
        costo: envio.costo,
        estimado: envio.estimado,
        porPagar: !!envio.porPagar,
        zona: envio.zona || null,
        region: envio.region || direccion.region || null,
      },
      productos: itemsValidados.map((i) => ({
        id: i.id,
        nombre: i.nombre,
        precio: i.precio,
        precioTotal: i.precioTotal,
        adelantoPct: i.adelantoPct,
        reserva: !!i.reserva,
        cantidad: i.cantidad,
        subtotal: i.precio * i.cantidad,
        imagen: i.imagen || '',
      })),
      totales: {
        subtotal,
        descuentoMonto,
        cupon: cuponAplicado,
        envio: envio.costo,
        total,
      },
      notas,
      mercadopago: {
        preferenceId: null,
        paymentId: null,
      },
      creadoDesde: 'server',
    };

    await pedidoRef.set(pedido);

    // ── 2) Crear preferencia Checkout Pro ──
    const preferenceBody = {
      items: mpItems,
      payer: {
        name: nombre,
        surname: apellido,
        email,
        phone: {
          area_code: '56',
          number: telefono,
        },
      },
      back_urls: {
        success: `${BASE_URL}/compra-exitosa.html?pedido=${numero}`,
        failure: `${BASE_URL}/compra-fallida.html`,
        pending: `${BASE_URL}/compra-pendiente.html?pedido=${numero}`,
      },
      external_reference: pedidoId,
      metadata: {
        pedido_id: pedidoId,
        numero,
        tipo_envio: envio.id,
        cupon: cuponAplicado || '',
      },
      statement_descriptor: 'ANIME2CHILE',
    };

    // auto_return exige HTTPS en la práctica (falla con localhost)
    if (BASE_URL.startsWith('https://')) {
      preferenceBody.auto_return = 'approved';
    }

    // notification_url solo si MP puede alcanzarnos (no localhost)
    if (!/localhost|127\.0\.0\.1/i.test(BASE_URL)) {
      preferenceBody.notification_url = `${BASE_URL}/api/webhook`;
    }

    // Envío: shipments.cost (no como ítem)
    if (costoEnvioFinal > 0 || envio.esRetiro) {
      preferenceBody.shipments = {
        cost: costoEnvioFinal,
        mode: 'not_specified',
      };
    } else if (costoEnvioFinal === 0) {
      preferenceBody.shipments = {
        cost: 0,
        mode: 'not_specified',
      };
    }

    let preferencia;
    try {
      preferencia = await preferenceClient.create({ body: preferenceBody });
    } catch (mpErr) {
      console.error('❌ Error creando preferencia MP:', mpErr);
      await pedidoRef.update({
        estado: 'error_preferencia',
        'mercadopago.error': String(mpErr && mpErr.message ? mpErr.message : mpErr),
      });
      return res.status(502).json({
        error: 'No se pudo crear el checkout de Mercado Pago. Intenta nuevamente.',
      });
    }

    const preferenceId = preferencia.id;
    const initPoint = esCredencialTest()
      ? (preferencia.sandbox_init_point || preferencia.init_point)
      : preferencia.init_point;

    await pedidoRef.update({
      'mercadopago.preferenceId': preferenceId,
    });

    return res.json({
      id: preferenceId,
      init_point: initPoint,
      pedidoId,
      numero,
      totales: {
        subtotal,
        descuentoMonto,
        envio: envio.costo,
        total,
      },
      cuponAplicado,
      avisoCupon,
    });
  } catch (err) {
    console.error('❌ Error en /api/crear-preferencia:', err);
    return res.status(500).json({ error: 'Error interno al crear la preferencia' });
  }
});

/**
 * POST|GET /api/webhook
 * Notificaciones de Mercado Pago.
 * IDEMPOTENTE: si el pago ya está approved, no pisa estados de despacho.
 * Los correos se reintentan si aún no quedaron registrados como enviados.
 */
app.all('/api/webhook', async (req, res) => {
  const responderOk = () => {
    if (!res.headersSent) res.status(200).send('OK');
  };
  const responderNoAutorizado = () => {
    if (!res.headersSent) res.status(401).send('Unauthorized');
  };

  try {
    const firma = verificarFirmaWebhookMp(req);
    if (!firma.ok) {
      console.warn('Webhook con firma inválida o incompleta');
      responderNoAutorizado();
      return;
    }

    const topic =
      (req.query && (req.query.type || req.query.topic)) ||
      (req.body && (req.body.type || req.body.topic)) ||
      '';

    let paymentId =
      (req.query && req.query['data.id']) ||
      (req.body && req.body.data && req.body.data.id) ||
      (req.body && req.body.id) ||
      null;

    if (!paymentId && req.query && req.query.id && String(topic).includes('payment')) {
      paymentId = req.query.id;
    }

    if (paymentId && (String(topic).includes('payment') || req.body?.action?.includes('payment') || !topic)) {
      // Continuar
    } else if (String(topic).includes('merchant_order')) {
      responderOk();
      return;
    } else if (!paymentId) {
      responderOk();
      return;
    }

    responderOk();

    const pago = await paymentClient.get({ id: String(paymentId) });
    const status = pago && pago.status;
    const externalReference = pago && pago.external_reference;

    console.log('📩 Webhook pago:', {
      paymentId,
      status,
      external_reference: externalReference,
      transaction_amount: pago && pago.transaction_amount,
    });

    if (pago && pago.live_mode != null) {
      const pagoLive = !!pago.live_mode;
      const credencialLive = !esCredencialTest();
      if (pagoLive !== credencialLive) {
        console.warn('Webhook ignorado: live_mode no coincide con las credenciales MP');
        return;
      }
    }

    if (!externalReference) {
      console.warn('Webhook sin external_reference, se ignora');
      return;
    }

    if (!db) {
      console.warn('Webhook recibido pero Firestore no está configurado');
      return;
    }

    const pedidoRef = db.collection('pedidos').doc(String(externalReference));
    let pedidoParaNotificar = null;
    let pagoRecienAprobado = false;

    await db.runTransaction(async (tx) => {
      const pedidoSnap = await tx.get(pedidoRef);
      if (!pedidoSnap.exists) {
        throw new Error(`Pedido no encontrado: ${externalReference}`);
      }

      const pedido = pedidoSnap.data() || {};
      const mp = pedido.mercadopago || {};
      const yaAprobado = mp.status === 'approved' || !!mp.paidAt || pedido.estado === 'pagado';

      if (yaAprobado) {
        pedidoParaNotificar = pedido;
        return;
      }

      if (status === 'approved') {
        if (!montosPagoCoinciden(pago, pedido)) {
          tx.update(pedidoRef, {
            'mercadopago.paymentId': String(paymentId),
            'mercadopago.status': status,
            'mercadopago.transactionAmount': pago.transaction_amount ?? null,
            'mercadopago.alerta': 'monto_no_coincide',
            'mercadopago.montoEsperado': (pedido.totales && pedido.totales.total) || null,
          });
          console.error('❌ Webhook: monto MP no coincide con el pedido', {
            paymentId,
            cobrado: pago.transaction_amount,
            esperado: pedido.totales && pedido.totales.total,
          });
          return;
        }

        const updates = {
          'mercadopago.paymentId': String(paymentId),
          'mercadopago.status': status,
          'mercadopago.paidAt': admin.firestore.FieldValue.serverTimestamp(),
          'mercadopago.transactionAmount': pago.transaction_amount ?? null,
          'mercadopago.paymentMethodId': pago.payment_method_id ?? null,
        };
        if (ESTADOS_PRE_PAGO.has(pedido.estado) || !pedido.estado) {
          updates.estado = 'pendiente';
        }
        tx.update(pedidoRef, updates);
        pedidoParaNotificar = { ...pedido, estado: updates.estado || pedido.estado, mercadopago: { ...mp, status } };
        pagoRecienAprobado = true;
        return;
      }

      tx.update(pedidoRef, {
        'mercadopago.paymentId': String(paymentId),
        'mercadopago.status': status || null,
      });
    });

    if (status === 'approved' && pedidoParaNotificar) {
      if (pagoRecienAprobado) {
        const ventaLog = {
          pedidoId: externalReference,
          numero: pedidoParaNotificar.numero ?? null,
          paymentId: String(paymentId),
          email: pedidoParaNotificar.cliente && pedidoParaNotificar.cliente.email,
          nombre: pedidoParaNotificar.cliente
            ? `${pedidoParaNotificar.cliente.nombre} ${pedidoParaNotificar.cliente.apellido}`
            : null,
          total: pedidoParaNotificar.totales && pedidoParaNotificar.totales.total,
          productos: (pedidoParaNotificar.productos || []).map((p) => ({
            id: p.id,
            nombre: p.nombre,
            cantidad: p.cantidad,
          })),
        };
        console.log('✅ Venta aprobada:', JSON.stringify(ventaLog, null, 2));
      }
      await notificarPedidoPagado(pedidoRef, pedidoParaNotificar, pago);
    } else if (status && status !== 'approved') {
      console.log(`Pago ${paymentId} con estado "${status}" — pedido ${externalReference} sin marcar como pagado`);
    }
  } catch (err) {
    if (err && /Pedido no encontrado/.test(String(err.message))) {
      console.warn(err.message);
      responderOk();
      return;
    }
    console.error('❌ Error en webhook:', err);
    responderOk();
  }
});

/**
 * POST /api/contacto
 * Body: { nombre, email, asunto, mensaje, website? }
 * Envía el mensaje a CONTACT_TO vía SMTP. website es honeypot.
 */
app.post('/api/contacto', async (req, res) => {
  try {
    const body = req.body || {};

    // Honeypot: bots llenan este campo; fingimos éxito y no enviamos
    if (sanitizarTexto(body.website, 80)) {
      return res.json({ ok: true, message: '¡Mensaje enviado! Te responderemos pronto.' });
    }

    const ip = ipCliente(req);
    if (!contactoDentroDeLimite(ip)) {
      return res.status(429).json({
        ok: false,
        message: 'Demasiados mensajes. Espera unos minutos o escríbenos por Instagram.',
      });
    }

    const nombre = sanitizarTexto(body.nombre, 80);
    const email = sanitizarEmail(body.email);
    const asunto = sanitizarTexto(body.asunto, 80);
    const mensaje = sanitizarMensaje(body.mensaje, 4000);

    if (nombre.length < 2) {
      return res.status(400).json({ ok: false, message: 'Ingresa tu nombre (mín. 2 caracteres).' });
    }
    if (!email) {
      return res.status(400).json({ ok: false, message: 'Ingresa un correo válido.' });
    }
    if (!ASUNTOS_CONTACTO.has(asunto)) {
      return res.status(400).json({ ok: false, message: 'Selecciona un asunto.' });
    }
    if (mensaje.length < 10) {
      return res.status(400).json({ ok: false, message: 'Cuéntanos un poco más (mín. 10 caracteres).' });
    }

    if (!mailer) {
      console.error('Formulario de contacto recibido pero SMTP no está configurado');
      return res.status(503).json({
        ok: false,
        message: 'El correo no está configurado todavía. Escríbenos por Instagram o a contacto@anime2chile.cl.',
      });
    }

    const texto = [
      `Nombre: ${nombre}`,
      `Correo: ${email}`,
      `Asunto: ${asunto}`,
      '',
      mensaje,
    ].join('\n');

    const html = `
      <p><strong>Nombre:</strong> ${escapeHtml(nombre)}</p>
      <p><strong>Correo:</strong> ${escapeHtml(email)}</p>
      <p><strong>Asunto:</strong> ${escapeHtml(asunto)}</p>
      <p><strong>Mensaje:</strong></p>
      <p>${escapeHtml(mensaje).replace(/\n/g, '<br>')}</p>
    `;

    await mailer.sendMail({
      from: `"Anime2Chile" <${SMTP_USER}>`,
      to: CONTACT_TO,
      replyTo: `"${nombre.replace(/"/g, '')}" <${email}>`,
      subject: `[Contacto] ${asunto} — ${nombre}`,
      text: texto,
      html,
    });

    return res.json({ ok: true, message: '¡Mensaje enviado! Te responderemos pronto.' });
  } catch (err) {
    console.error('❌ Error en /api/contacto:', err);
    return res.status(500).json({
      ok: false,
      message: 'No pudimos enviar el mensaje. Intenta de nuevo o escríbenos por Instagram.',
    });
  }
});

// Endpoint de salud (útil en Hostinger)
app.get('/api/health', (_req, res) => {
  res.json({ ok: true });
});

app.get('/api/admin/sesion', exigirAdmin, (_req, res) => {
  res.json({ ok: true });
});

app.post('/api/admin/login', (req, res) => {
  if (!ADMIN_PASSWORD) {
    return res.status(503).json({ ok: false, message: 'Admin no configurado. Define ADMIN_PASSWORD.' });
  }
  const ip = ipCliente(req);
  if (!adminDentroDeLimite(ip)) {
    return res.status(429).json({ ok: false, message: 'Demasiados intentos. Espera unos minutos.' });
  }
  const password = String((req.body && req.body.password) || '');
  if (!secretosIguales(password, ADMIN_PASSWORD)) {
    return res.status(401).json({ ok: false, message: 'Contraseña incorrecta.' });
  }
  ponerCookieAdmin(req, res);
  return res.json({ ok: true });
});

app.post('/api/admin/logout', (req, res) => {
  borrarCookieAdmin(req, res);
  return res.json({ ok: true });
});

app.get('/api/admin/config', exigirAdmin, (_req, res) => {
  res.json({
    ok: true,
    remitente: {
      nombre: ADMIN_REMITENTE.nombre,
      rut: ADMIN_REMITENTE.rut,
      telefono: ADMIN_REMITENTE.telefono,
      email: ADMIN_REMITENTE.email,
    },
  });
});

app.get('/api/admin/pedidos', exigirAdmin, async (_req, res) => {
  try {
    if (!db) {
      return res.status(500).json({ ok: false, message: 'Firestore no está configurado.' });
    }
    const snap = await db.collection('pedidos').orderBy('fecha', 'desc').limit(500).get();
    const pedidos = snap.docs.map((docSnap) => pedidoParaAdmin(docSnap.id, docSnap.data() || {}));
    return res.json({ ok: true, pedidos });
  } catch (err) {
    console.error('❌ Error listando pedidos admin:', err);
    return res.status(500).json({ ok: false, message: 'No se pudieron cargar los pedidos.' });
  }
});

app.patch('/api/admin/pedidos/:id', exigirAdmin, async (req, res) => {
  try {
    if (!db) {
      return res.status(500).json({ ok: false, message: 'Firestore no está configurado.' });
    }
    const pedidoId = sanitizarTexto(req.params && req.params.id, 80);
    const estado = sanitizarTexto(req.body && req.body.estado, 40).toLowerCase();
    if (!pedidoId || !ESTADOS_FULFILLMENT.has(estado)) {
      return res.status(400).json({ ok: false, message: 'Estado inválido.' });
    }
    const pedidoRef = db.collection('pedidos').doc(pedidoId);
    const snap = await pedidoRef.get();
    if (!snap.exists) {
      return res.status(404).json({ ok: false, message: 'Pedido no encontrado.' });
    }
    const pedido = snap.data() || {};
    if (!pedidoPagoAprobado(pedido)) {
      return res.status(409).json({ ok: false, message: 'El pedido no tiene un pago aprobado.' });
    }

    if (estado !== 'enviado') {
      await pedidoRef.update({ estado });
      return res.json({ ok: true, estado });
    }

    const tracking = normalizarTracking(req.body && req.body.tracking);
    const trackingConfirmacion = normalizarTracking(req.body && req.body.trackingConfirmacion);
    if (!TRACKING_RE.test(tracking)) {
      return res.status(400).json({ ok: false, message: 'Número de seguimiento inválido (6 a 40 letras, números o guiones).' });
    }
    if (tracking !== trackingConfirmacion) {
      return res.status(400).json({ ok: false, message: 'Los números de seguimiento no coinciden.' });
    }

    const despachoPrevio = pedido.despacho || {};
    const emailCliente = (pedido.cliente && pedido.cliente.email) || null;

    if (despachoPrevio.tracking === tracking && despachoPrevio.correoCliente) {
      await pedidoRef.update({ estado });
      return res.json({ ok: true, estado, tracking, correoCliente: 'ya_enviado', emailCliente });
    }

    await pedidoRef.update({
      estado,
      despacho: {
        tracking,
        courier: 'Starken',
        enviadoEn: admin.firestore.FieldValue.serverTimestamp(),
        correoCliente: false,
      },
    });

    const pedidoDespachado = { ...pedido, estado, despacho: { tracking, courier: 'Starken' } };
    let correoCliente = false;
    if (mailer) {
      try {
        await enviarCorreoDespachoCliente(pedidoDespachado);
        correoCliente = true;
        await pedidoRef.update({ 'despacho.correoCliente': true });
      } catch (err) {
        console.error('❌ Correo de despacho al comprador:', err && err.message ? err.message : err);
      }
    } else {
      console.warn('SMTP no configurado: se omite correo de despacho al comprador');
    }

    let correoAdmin = false;
    if (correoCliente) {
      try {
        await enviarCorreoAvisoDespachoAdmin(pedidoDespachado);
        correoAdmin = true;
      } catch (err) {
        console.error('❌ Aviso de despacho al vendedor:', err && err.message ? err.message : err);
      }
    }

    return res.json({ ok: true, estado, tracking, correoCliente, correoAdmin, emailCliente });
  } catch (err) {
    console.error('❌ Error actualizando pedido admin:', err);
    return res.status(500).json({ ok: false, message: 'No se pudo actualizar el estado.' });
  }
});

if (!IS_PRODUCTION) {
  app.post('/api/dev/reload-catalogo', (_req, res) => {
    const n = refrescarCatalogo();
    res.json({ ok: true, productos: n });
  });
}

app.use(express.static(ROOT, {
  extensions: ['html'],
  index: 'index.html',
  dotfiles: 'deny',
  setHeaders(res, filePath) {
    if (/\.(html|js|json)$/i.test(filePath)) {
      res.setHeader('Cache-Control', 'no-store');
    }
  },
}));

app.listen(PORT, () => {
  console.log(`🚀 Anime2Chile escuchando en ${BASE_URL} (port ${PORT})`);
  console.log(`   Catálogo cargado: ${CATALOGO.size} productos`);
  console.log(`   MP test mode: ${esCredencialTest()}`);
  console.log(`   SMTP: ${mailer ? `configurado → ventas a ${ORDERS_TO.join(', ') || '(sin destino)'}` : 'NO configurado'}`);
  console.log(`   Webhook MP: ${MP_WEBHOOK_SECRET ? 'firma activada' : 'sin MP_WEBHOOK_SECRET (se acepta sin firma)'}`);
  if (ADMIN_PASSWORD) {
    console.log('   🔐 Panel admin en /admin.html (requiere ADMIN_PASSWORD)');
  } else {
    console.warn('   🔐 ADMIN_PASSWORD vacío: el panel admin no podrá iniciar sesión');
  }
  if (COMING_SOON) {
    if (SITE_PASSWORD) {
      console.log('   🔒 COMING_SOON=true → el sitio pide contraseña para entrar');
    } else {
      console.warn('   🔒 COMING_SOON=true pero SITE_PASSWORD está vacío: nadie podrá entrar');
    }
  }
});
