// ============================================================
//  carrito.js
//  Sistema de carrito de compras persistente (localStorage)
//  Incluye: sidebar, contador, agregar/quitar/eliminar, total
// ============================================================

const CARRITO_KEY = 'anime2chile_carrito';
const PREFIJO_RESERVA = '(RESERVA) ';
const ADELANTO_DEFAULT = 50;

function adelantoPctDe(valor) {
    const n = Number(valor);
    if (!Number.isFinite(n) || n <= 0 || n > 100) return ADELANTO_DEFAULT;
    return n;
}

function precioAbono(precioTotal, adelantoPct) {
    return Math.round(Number(precioTotal || 0) * adelantoPctDe(adelantoPct) / 100);
}

function nombreConReserva(nombre) {
    const n = String(nombre || '').trim();
    if (!n) return PREFIJO_RESERVA.trim();
    if (/^\(RESERVA\)\s*/i.test(n)) {
        return PREFIJO_RESERVA + n.replace(/^\(RESERVA\)\s*/i, '');
    }
    return PREFIJO_RESERVA + n;
}

// ── Persistencia ─────────────────────────────────────────────

function obtenerCarrito() {
    try {
        return normalizarCarrito(JSON.parse(localStorage.getItem(CARRITO_KEY)) || []);
    } catch {
        return [];
    }
}

function maxCantidadDe(valor) {
    const n = Number.parseInt(valor, 10);
    if (!Number.isFinite(n) || n < 1) return 1;
    return Math.min(n, 99);
}

function guardarCarrito(carrito) {
    localStorage.setItem(CARRITO_KEY, JSON.stringify(carrito));
}

function normalizarCarrito(carrito) {
    let changed = false;
    for (const item of carrito) {
        const max = maxCantidadDe(item.maxCantidad);
        if (item.maxCantidad !== max) {
            item.maxCantidad = max;
            changed = true;
        }
        if (item.cantidad > max) {
            item.cantidad = max;
            changed = true;
        }
        if (item.cantidad < 1) {
            item.cantidad = 1;
            changed = true;
        }
    }
    if (changed) guardarCarrito(carrito);
    return carrito;
}

// ── Operaciones del carrito ──────────────────────────────────

function agregarAlCarrito(id, nombre, precio, imagen, maxCantidad) {
    const limite = maxCantidadDe(maxCantidad);
    const carrito = obtenerCarrito();
    const existente = carrito.find(item => item.id === id);

    if (existente) {
        const max = maxCantidadDe(existente.maxCantidad || limite);
        existente.maxCantidad = max;
        if (existente.cantidad >= max) {
            guardarCarrito(carrito);
            actualizarContador();
            renderSidebar();
            abrirSidebar();
            mostrarFeedback(id, 'limite');
            return { ok: false, enLimite: true };
        }
        existente.cantidad += 1;
    } else {
        carrito.push({ id, nombre, precio, imagen, cantidad: 1, maxCantidad: limite });
    }

    guardarCarrito(carrito);
    actualizarContador();
    renderSidebar();
    abrirSidebar();
    mostrarFeedback(id, 'ok');
    return { ok: true, enLimite: false };
}

function asegurarEnCarrito(id, nombre, precio, imagen, opts) {
    const esReserva = !!(opts && opts.reserva);
    const limite = maxCantidadDe(opts && opts.maxCantidad);
    const adelantoPct = esReserva ? adelantoPctDe(opts && opts.adelantoPct) : null;
    const precioTotal = Number(precio) || 0;
    const precioCobrado = esReserva ? precioAbono(precioTotal, adelantoPct) : precioTotal;
    const nombreFinal = esReserva ? nombreConReserva(nombre) : nombre;
    const carrito = obtenerCarrito();
    const existente = carrito.find(item => item.id === id);
    if (!existente) {
        carrito.push({
            id,
            nombre: nombreFinal,
            precio: precioCobrado,
            precioTotal: esReserva ? precioTotal : undefined,
            adelantoPct,
            imagen,
            cantidad: 1,
            maxCantidad: limite,
            reserva: esReserva
        });
    } else {
        existente.maxCantidad = maxCantidadDe(existente.maxCantidad || limite);
        if (existente.cantidad > existente.maxCantidad) {
            existente.cantidad = existente.maxCantidad;
        }
        if (esReserva) {
            existente.nombre = nombreConReserva(nombre);
            existente.reserva = true;
            existente.precio = precioCobrado;
            existente.precioTotal = precioTotal;
            existente.adelantoPct = adelantoPct;
        }
    }
    guardarCarrito(carrito);
    actualizarContador();
    renderSidebar();
}

function iniciarCheckoutConProducto(id, nombre, precio, imagen, opts) {
    asegurarEnCarrito(id, nombre, precio, imagen, {
        reserva: true,
        maxCantidad: opts && opts.maxCantidad,
        adelantoPct: opts && opts.adelantoPct
    });
    window.location.href = 'checkout.html';
}

function cambiarCantidadCarrito(id, delta) {
    const carrito = obtenerCarrito();
    const item = carrito.find(i => i.id === id);
    if (!item) return;

    const max = maxCantidadDe(item.maxCantidad);
    item.maxCantidad = max;
    item.cantidad = Math.max(1, Math.min(max, item.cantidad + delta));
    guardarCarrito(carrito);
    actualizarContador();
    renderSidebar();
}

function eliminarDelCarrito(id) {
    const carrito = obtenerCarrito().filter(i => i.id !== id);
    guardarCarrito(carrito);
    actualizarContador();
    renderSidebar();
}

// ── Contador en el header ────────────────────────────────────

function actualizarContador() {
    const carrito = obtenerCarrito();
    const total = carrito.reduce((sum, i) => sum + i.cantidad, 0);
    const badge = document.getElementById('carrito-contador');
    if (!badge) return;

    badge.textContent = total;
    badge.style.display = total > 0 ? 'flex' : 'none';
}

// ── Feedback visual en el botón ──────────────────────────────

function mostrarFeedback(id, tipo) {
    const btn = document.querySelector(`[data-carrito-id="${id}"]`)
        || document.querySelector(`.series-card-buy-btn[data-id="${id}"]`)
        || document.querySelector(`.poke-prod-btn[onclick*="${id}"]`);
    if (!btn) return;
    const textoOriginal = btn.dataset.textoOriginal || btn.textContent;
    btn.dataset.textoOriginal = textoOriginal;
    if (tipo === 'limite') {
        btn.textContent = 'YA EN EL CARRITO';
        btn.style.background = 'linear-gradient(135deg, #6b6b6b, #4a4a4a)';
    } else {
        btn.textContent = '✓ AGREGADO';
        btn.style.background = 'linear-gradient(135deg, #00d9a3, #00b087)';
    }
    setTimeout(() => {
        btn.textContent = textoOriginal;
        btn.style.background = '';
    }, 1500);
}

// ── Sidebar ──────────────────────────────────────────────────

function abrirSidebar() {
    document.getElementById('carrito-sidebar').classList.add('abierto');
    document.getElementById('carrito-overlay').classList.add('visible');
    document.body.style.overflow = 'hidden';
}

function cerrarSidebar() {
    document.getElementById('carrito-sidebar').classList.remove('abierto');
    document.getElementById('carrito-overlay').classList.remove('visible');
    document.body.style.overflow = '';
}

function formatearPrecioCarrito(numero) {
    return '$' + numero.toLocaleString('es-CL');
}

function escapeHtmlCarrito(text) {
    return String(text ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function renderSidebar() {
    const carrito = obtenerCarrito();
    const contenido = document.getElementById('carrito-contenido');
    const footer = document.getElementById('carrito-footer');
    if (!contenido) return;

    if (carrito.length === 0) {
        contenido.innerHTML = `
            <div class="carrito-vacio">
                <div class="carrito-vacio-icono">🛒</div>
                <p>Tu carrito está vacío</p>
                <span>Agrega productos desde el catálogo</span>
            </div>`;
        footer.style.display = 'none';
        return;
    }

    const total = carrito.reduce((sum, i) => sum + i.precio * i.cantidad, 0);

    contenido.innerHTML = carrito.map(item => {
        const max = maxCantidadDe(item.maxCantidad);
        const plusDisabled = item.cantidad >= max ? 'disabled' : '';
        const plusTitle = item.cantidad >= max ? `Máximo ${max} por pedido` : 'Aumentar cantidad';
        const idAttr = escapeHtmlCarrito(item.id);
        const idJs = String(item.id ?? '').replace(/\\/g, '\\\\').replace(/'/g, "\\'");
        return `
        <div class="carrito-item" data-id="${idAttr}">
            <div class="carrito-item-img">
                ${item.imagen
                    ? `<img src="${escapeHtmlCarrito(encodeURI(item.imagen))}" alt="${escapeHtmlCarrito(item.nombre)}" onerror="this.style.display='none'">`
                    : ''
                }
            </div>
            <div class="carrito-item-info">
                <p class="carrito-item-nombre">${escapeHtmlCarrito(item.nombre)}</p>
                <p class="carrito-item-precio">${formatearPrecioCarrito(item.precio)}${item.reserva ? ` <span class="carrito-item-abono">Abono ${adelantoPctDe(item.adelantoPct)}%</span>` : ''}</p>
                ${item.reserva && item.precioTotal
                    ? `<p class="carrito-item-precio-total">Precio total ${formatearPrecioCarrito(item.precioTotal)}</p>`
                    : ''}
                <div class="carrito-item-qty">
                    <button class="carrito-qty-btn" onclick="cambiarCantidadCarrito('${idJs}', -1)" ${item.cantidad <= 1 ? 'disabled' : ''} title="Disminuir cantidad">−</button>
                    <span>${item.cantidad}</span>
                    <button class="carrito-qty-btn" onclick="cambiarCantidadCarrito('${idJs}', 1)" ${plusDisabled} title="${plusTitle}">+</button>
                </div>
            </div>
            <div class="carrito-item-subtotal">
                <p>${formatearPrecioCarrito(item.precio * item.cantidad)}</p>
                <button class="carrito-eliminar" onclick="eliminarDelCarrito('${idJs}')" title="Eliminar">✕</button>
            </div>
        </div>`;
    }).join('');

    footer.style.display = 'block';
    document.getElementById('carrito-total-valor').textContent = formatearPrecioCarrito(total);
}

// ── Inyectar HTML del sidebar en el DOM ──────────────────────

function inyectarSidebar() {
    if (document.getElementById('carrito-sidebar')) return; // ya existe

    document.body.insertAdjacentHTML('beforeend', `
        <!-- Overlay -->
        <div id="carrito-overlay" onclick="cerrarSidebar()"></div>

        <!-- Sidebar -->
        <aside id="carrito-sidebar">
            <div class="carrito-header">
                <h2>MI CARRITO</h2>
                <button class="carrito-cerrar" onclick="cerrarSidebar()">✕</button>
            </div>
            <div id="carrito-contenido" class="carrito-contenido"></div>
            <div id="carrito-footer" class="carrito-footer" style="display:none;">
                <div class="carrito-total">
                    <span>TOTAL</span>
                    <span id="carrito-total-valor">$0</span>
                </div>
                <button class="carrito-checkout-btn" onclick="window.location='checkout.html'">
                    FINALIZAR COMPRA
                </button>
            </div>
        </aside>
    `);
}

// ── Inyectar botón del carrito en el header ──────────────────

function inyectarBotonHeader() {
    const mobileBtn = document.querySelector('.mobile-menu-btn');
    if (!mobileBtn || document.getElementById('carrito-btn-header')) return;

    mobileBtn.insertAdjacentHTML('beforebegin', `
        <button id="carrito-btn-header" onclick="abrirSidebar()" aria-label="Carrito de compras">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <circle cx="9" cy="21" r="1"></circle>
                <circle cx="20" cy="21" r="1"></circle>
                <path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"></path>
            </svg>
            <span id="carrito-contador" style="display:none;">0</span>
        </button>
    `);
}

// ── Init ─────────────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', () => {
    inyectarSidebar();
    inyectarBotonHeader();
    actualizarContador();
    renderSidebar();
});
