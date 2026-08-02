/**
 * server.js — Anime2Chile
 * Express + Mercado Pago Checkout Pro + Firebase Admin
 *
 * Flujo de pago:
 *  1. POST /api/crear-preferencia → valida precios, crea pedido en Firestore,
 *     crea preferencia MP y devuelve init_point
 *  2. El cliente paga en el checkout oficial de Mercado Pago
 *  3. POST /api/webhook → verifica el pago real y marca el pedido como "pagado"
 */

require('dotenv').config();

const path = require('path');
const fs = require('fs');
const express = require('express');
const admin = require('firebase-admin');
const { MercadoPagoConfig, Preference, Payment } = require('mercadopago');

// ══════════════════════════════════════════════════════════════
// Configuración
// ══════════════════════════════════════════════════════════════

const PORT = Number(process.env.PORT) || 3000;
const BASE_URL = (process.env.BASE_URL || `http://localhost:${PORT}`).replace(/\/$/, '');
const MP_ACCESS_TOKEN = process.env.MP_ACCESS_TOKEN || '';
const MP_PUBLIC_KEY = process.env.MP_PUBLIC_KEY || '';

if (!MP_ACCESS_TOKEN) {
  console.warn('⚠️  MP_ACCESS_TOKEN no está definido. Configúralo en .env');
}

// ── Reglas de envío (fuente de verdad del servidor) ──────────
const ENVIO_GRATIS_DESDE = 80000;

const METODOS_ENVIO = {
  starken:   { id: 'starken',   nombre: 'Starken',            costoBase: 4990 },
  chilexpress: { id: 'chilexpress', nombre: 'Chilexpress',    costoBase: 4490 },
  correos:   { id: 'correos',   nombre: 'Correos de Chile',   costoBase: 3990 },
  retiro:    { id: 'retiro',    nombre: 'Retiro en Santiago', costoBase: 0, esRetiro: true },
};

// ── Cupones (fuente de verdad del servidor) ──────────────────
// tipo: 'porcentaje' | 'fijo'
// minimoCompra: subtotal mínimo en CLP (0 = sin mínimo)
// vigenteHasta: ISO date string o null = sin vencimiento
const CUPONES = {
  JOJO10: {
    codigo: 'JOJO10',
    tipo: 'porcentaje',
    valor: 0.10,
    minimoCompra: 0,
    vigenteHasta: null,
  },
  ANIME15: {
    codigo: 'ANIME15',
    tipo: 'porcentaje',
    valor: 0.15,
    minimoCompra: 0,
    vigenteHasta: null,
  },
  BIENVENIDO: {
    codigo: 'BIENVENIDO',
    tipo: 'porcentaje',
    valor: 0.05,
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
  const pokemon = JSON.parse(
    fs.readFileSync(path.join(ROOT, 'productos-pokemon.json'), 'utf8')
  );

  const mapa = new Map();
  for (const p of [...figuras, ...pokemon]) {
    if (!p || !p.id) continue;
    mapa.set(String(p.id), {
      id: String(p.id),
      nombre: String(p.nombre || p.id),
      precio: Math.round(Number(p.precio) || 0),
      imagen: p.imagen || '',
      stock: p.stock || null,
    });
  }
  return mapa;
}

let CATALOGO = cargarCatalogo();

// Recarga opcional en desarrollo sin reiniciar (útil al editar JSON)
function refrescarCatalogo() {
  CATALOGO = cargarCatalogo();
  return CATALOGO.size;
}

// ══════════════════════════════════════════════════════════════
// Firebase Admin
// ══════════════════════════════════════════════════════════════

let db = null;

function initFirebase() {
  const accountPath = (process.env.FIREBASE_SERVICE_ACCOUNT_PATH || '').trim();
  const accountJson = (process.env.FIREBASE_SERVICE_ACCOUNT || '').trim();

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
    return { ok: true, cupon: null, mensaje: null, descuentoMonto: 0 };
  }

  const cupon = CUPONES[codigo];
  if (!cupon) {
    return { ok: false, cupon: null, mensaje: 'Código de cupón inválido', descuentoMonto: 0 };
  }

  if (cupon.vigenteHasta) {
    const hasta = new Date(cupon.vigenteHasta);
    if (Number.isFinite(hasta.getTime()) && Date.now() > hasta.getTime()) {
      return { ok: false, cupon: null, mensaje: 'Este cupón ya expiró', descuentoMonto: 0 };
    }
  }

  if (subtotal < (cupon.minimoCompra || 0)) {
    return {
      ok: false,
      cupon: null,
      mensaje: `Este cupón requiere una compra mínima de $${(cupon.minimoCompra).toLocaleString('es-CL')}`,
      descuentoMonto: 0,
    };
  }

  let descuentoMonto = 0;
  if (cupon.tipo === 'porcentaje') {
    descuentoMonto = Math.round(subtotal * cupon.valor);
  } else if (cupon.tipo === 'fijo') {
    descuentoMonto = Math.round(cupon.valor);
  }

  descuentoMonto = Math.max(0, Math.min(descuentoMonto, subtotal));

  return { ok: true, cupon, mensaje: null, descuentoMonto };
}

/**
 * Calcula costo de envío según reglas del servidor.
 * Gratis desde ENVIO_GRATIS_DESDE (excepto retiro, que siempre es 0).
 */
function calcularEnvio(tipoEnvioRaw, subtotal) {
  const tipo = sanitizarTexto(tipoEnvioRaw, 40).toLowerCase();
  const metodo = METODOS_ENVIO[tipo];
  if (!metodo) {
    return { ok: false, mensaje: 'Método de envío inválido' };
  }

  let costo = metodo.costoBase;
  if (!metodo.esRetiro && subtotal >= ENVIO_GRATIS_DESDE) {
    costo = 0;
  }

  return {
    ok: true,
    metodo: {
      id: metodo.id,
      nombre: metodo.nombre,
      costo,
      esRetiro: !!metodo.esRetiro,
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

app.use(express.json({ limit: '256kb' }));
app.use(express.urlencoded({ extended: true }));

// Public Key para el frontend (sin secretos)
app.get('/api/config', (_req, res) => {
  res.json({
    publicKey: MP_PUBLIC_KEY,
    baseUrl: BASE_URL,
    envioGratisDesde: ENVIO_GRATIS_DESDE,
    metodosEnvio: Object.values(METODOS_ENVIO).map((m) => ({
      id: m.id,
      nombre: m.nombre,
      costoBase: m.costoBase,
      esRetiro: !!m.esRetiro,
    })),
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
 *   direccion?: { region, ciudad, postal, calle, depto },
 *   notas?: string
 * }
 */
app.post('/api/crear-preferencia', async (req, res) => {
  try {
    if (!MP_ACCESS_TOKEN) {
      return res.status(500).json({ error: 'Mercado Pago no está configurado en el servidor' });
    }
    if (!db) {
      return res.status(500).json({ error: 'Firestore no está configurado en el servidor' });
    }

    const body = req.body || {};
    const itemsRaw = Array.isArray(body.items) ? body.items : null;
    if (!itemsRaw || itemsRaw.length === 0) {
      return res.status(400).json({ error: 'El carrito está vacío' });
    }
    if (itemsRaw.length > 50) {
      return res.status(400).json({ error: 'Demasiados ítems en el carrito' });
    }

    // ── Validar ítems contra el catálogo (NO confiar en precios del cliente) ──
    const itemsValidados = [];
    for (const raw of itemsRaw) {
      const id = sanitizarTexto(raw && raw.id, 80);
      const cantidad = sanitizarCantidad(raw && raw.cantidad);
      if (!id || !cantidad) {
        return res.status(400).json({ error: 'Ítem inválido en el carrito' });
      }
      const producto = CATALOGO.get(id);
      if (!producto || producto.precio <= 0) {
        return res.status(400).json({ error: `Producto no encontrado o sin precio: ${id}` });
      }
      itemsValidados.push({
        id: producto.id,
        nombre: producto.nombre,
        precio: producto.precio,
        cantidad,
        imagen: producto.imagen,
      });
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

    // ── Envío ──
    const resultadoEnvio = calcularEnvio(body.tipoEnvio, subtotal);
    if (!resultadoEnvio.ok) {
      return res.status(400).json({ error: resultadoEnvio.mensaje });
    }
    const envio = resultadoEnvio.metodo;

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
      postal: sanitizarTexto(dirIn.postal, 20),
      calle: sanitizarTexto(dirIn.calle, 160),
      depto: sanitizarTexto(dirIn.depto, 80),
    };

    if (!envio.esRetiro) {
      if (!direccion.region || direccion.ciudad.length < 2 || direccion.calle.length < 5) {
        return res.status(400).json({ error: 'Dirección incompleta para el envío' });
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

    const pedido = {
      fecha: admin.firestore.FieldValue.serverTimestamp(),
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
      },
      productos: itemsValidados.map((i) => ({
        id: i.id,
        nombre: i.nombre,
        precio: i.precio,
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
        success: `${BASE_URL}/compra-exitosa.html`,
        failure: `${BASE_URL}/compra-fallida.html`,
        pending: `${BASE_URL}/compra-pendiente.html`,
      },
      external_reference: pedidoId,
      metadata: {
        pedido_id: pedidoId,
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
 * IDEMPOTENTE: si el pedido ya está "pagado", responde 200 y no hace nada más.
 */
app.all('/api/webhook', async (req, res) => {
  // Responder 200 rápido evita reintentos agresivos; el trabajo sigue abajo.
  // (Si falla la verificación, igual respondemos 200 tras loguear para no ciclar
  //  notificaciones inválidas; los pagos reales se reintentan por MP.)
  const responderOk = () => {
    if (!res.headersSent) res.status(200).send('OK');
  };

  try {
    const topic =
      (req.query && (req.query.type || req.query.topic)) ||
      (req.body && (req.body.type || req.body.topic)) ||
      '';

    let paymentId =
      (req.query && req.query['data.id']) ||
      (req.body && req.body.data && req.body.data.id) ||
      (req.body && req.body.id) ||
      null;

    // Formato clásico: topic=payment&id=123
    if (!paymentId && req.query && req.query.id && String(topic).includes('payment')) {
      paymentId = req.query.id;
    }

    // Solo procesamos notificaciones de pago
    if (paymentId && (String(topic).includes('payment') || req.body?.action?.includes('payment') || !topic)) {
      // Continuar
    } else if (String(topic).includes('merchant_order')) {
      // Opcional: ignorar merchant_order por ahora (el payment llega aparte)
      responderOk();
      return;
    } else if (!paymentId) {
      responderOk();
      return;
    }

    responderOk();

    // ── Consultar el pago REAL con el SDK (no confiar solo en el payload) ──
    const pago = await paymentClient.get({ id: String(paymentId) });
    const status = pago && pago.status;
    const externalReference = pago && pago.external_reference;

    console.log('📩 Webhook pago:', {
      paymentId,
      status,
      external_reference: externalReference,
      transaction_amount: pago && pago.transaction_amount,
    });

    if (!externalReference) {
      console.warn('Webhook sin external_reference, se ignora');
      return;
    }

    if (!db) {
      console.warn('Webhook recibido pero Firestore no está configurado');
      return;
    }

    const pedidoRef = db.collection('pedidos').doc(String(externalReference));
    const pedidoSnap = await pedidoRef.get();

    if (!pedidoSnap.exists) {
      console.warn(`Pedido no encontrado: ${externalReference}`);
      return;
    }

    const pedido = pedidoSnap.data();

    // ── IDEMPOTENCIA ──
    if (pedido.estado === 'pagado') {
      console.log(`Pedido ${externalReference} ya estaba pagado — idempotencia OK`);
      return;
    }

    if (status === 'approved') {
      await pedidoRef.update({
        estado: 'pagado',
        'mercadopago.paymentId': String(paymentId),
        'mercadopago.status': status,
        'mercadopago.paidAt': admin.firestore.FieldValue.serverTimestamp(),
        'mercadopago.transactionAmount': pago.transaction_amount ?? null,
        'mercadopago.paymentMethodId': pago.payment_method_id ?? null,
      });

      // Datos de la venta para log (y futuros correos)
      const ventaLog = {
        pedidoId: externalReference,
        paymentId: String(paymentId),
        email: pedido.cliente && pedido.cliente.email,
        nombre: pedido.cliente
          ? `${pedido.cliente.nombre} ${pedido.cliente.apellido}`
          : null,
        total: pedido.totales && pedido.totales.total,
        productos: (pedido.productos || []).map((p) => ({
          id: p.id,
          nombre: p.nombre,
          cantidad: p.cantidad,
        })),
      };

      console.log('✅ Venta aprobada:', JSON.stringify(ventaLog, null, 2));

      // ────────────────────────────────────────────────────────────
      // TODO (siguiente etapa): enviar correos de confirmación con
      // Nodemailer — uno al cliente y uno al administrador.
      // Enganchar aquí usando `ventaLog` + datos completos de `pedido`.
      // Ejemplo futuro:
      //   await enviarCorreoConfirmacionCliente(pedido, pago);
      //   await enviarCorreoAvisoAdmin(pedido, pago);
      // ────────────────────────────────────────────────────────────
    } else {
      // Otros estados: pending, rejected, cancelled, etc.
      await pedidoRef.update({
        'mercadopago.paymentId': String(paymentId),
        'mercadopago.status': status || null,
      });
      console.log(`Pago ${paymentId} con estado "${status}" — pedido ${externalReference} sin marcar como pagado`);
    }
  } catch (err) {
    console.error('❌ Error en webhook:', err);
    responderOk();
  }
});

// Endpoint de salud (útil en Hostinger)
app.get('/api/health', (_req, res) => {
  res.json({
    ok: true,
    firebase: !!db,
    mp: !!MP_ACCESS_TOKEN,
    catalogo: CATALOGO.size,
  });
});

// Solo desarrollo: recargar catálogo sin reiniciar
if (process.env.NODE_ENV !== 'production') {
  app.post('/api/dev/reload-catalogo', (_req, res) => {
    const n = refrescarCatalogo();
    res.json({ ok: true, productos: n });
  });
}

// Archivos estáticos del sitio (después de las rutas /api)
app.use(express.static(ROOT, {
  extensions: ['html'],
  index: 'index.html',
}));

app.listen(PORT, () => {
  console.log(`🚀 Anime2Chile escuchando en ${BASE_URL} (port ${PORT})`);
  console.log(`   Catálogo cargado: ${CATALOGO.size} productos`);
  console.log(`   MP test mode: ${esCredencialTest()}`);
});
