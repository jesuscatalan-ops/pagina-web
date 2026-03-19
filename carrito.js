// ============================================================
//  carrito.js
//  Sistema de carrito de compras persistente (localStorage)
//  Incluye: sidebar, contador, agregar/quitar/eliminar, total
// ============================================================

const CARRITO_KEY = 'anime2chile_carrito';

// ── Persistencia ─────────────────────────────────────────────

function obtenerCarrito() {
    try {
        return JSON.parse(localStorage.getItem(CARRITO_KEY)) || [];
    } catch {
        return [];
    }
}

function guardarCarrito(carrito) {
    localStorage.setItem(CARRITO_KEY, JSON.stringify(carrito));
}

// ── Operaciones del carrito ──────────────────────────────────

function agregarAlCarrito(id, nombre, precio, imagen) {
    const carrito = obtenerCarrito();
    const existente = carrito.find(item => item.id === id);

    if (existente) {
        existente.cantidad += 1;
    } else {
        carrito.push({ id, nombre, precio, imagen, cantidad: 1 });
    }

    guardarCarrito(carrito);
    actualizarContador();
    renderSidebar();
    abrirSidebar();
    mostrarFeedback(id);
}

function cambiarCantidadCarrito(id, delta) {
    const carrito = obtenerCarrito();
    const item = carrito.find(i => i.id === id);
    if (!item) return;

    item.cantidad = Math.max(1, item.cantidad + delta);
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

function vaciarCarrito() {
    guardarCarrito([]);
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

function mostrarFeedback(id) {
    const btn = document.querySelector(`[data-carrito-id="${id}"]`);
    if (!btn) return;
    const textoOriginal = btn.textContent;
    btn.textContent = '✓ AGREGADO';
    btn.style.background = 'linear-gradient(135deg, #00d9a3, #00b087)';
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

    contenido.innerHTML = carrito.map(item => `
        <div class="carrito-item" data-id="${item.id}">
            <div class="carrito-item-img">
                ${item.imagen
                    ? `<img src="${item.imagen}" alt="${item.nombre}" onerror="this.style.display='none'">`
                    : `<div class="carrito-item-placeholder">🎌</div>`
                }
            </div>
            <div class="carrito-item-info">
                <p class="carrito-item-nombre">${item.nombre}</p>
                <p class="carrito-item-precio">${formatearPrecioCarrito(item.precio)}</p>
                <div class="carrito-item-qty">
                    <button class="carrito-qty-btn" onclick="cambiarCantidadCarrito('${item.id}', -1)">−</button>
                    <span>${item.cantidad}</span>
                    <button class="carrito-qty-btn" onclick="cambiarCantidadCarrito('${item.id}', 1)">+</button>
                </div>
            </div>
            <div class="carrito-item-subtotal">
                <p>${formatearPrecioCarrito(item.precio * item.cantidad)}</p>
                <button class="carrito-eliminar" onclick="eliminarDelCarrito('${item.id}')" title="Eliminar">✕</button>
            </div>
        </div>
    `).join('');

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
                <button class="carrito-vaciar-btn" onclick="vaciarCarrito()">
                    Vaciar carrito
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
