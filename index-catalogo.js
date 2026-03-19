// ============================================================
//  index-catalogo.js
//  Renderiza exactamente estos 8 productos en el inicio.
//  Para cambiar qué productos aparecen, edita PRODUCTOS_INICIO.
//  El número nunca cambia automáticamente.
// ============================================================

const PRODUCTOS_INICIO = [
    'star-platinum',
    'jotaro-kujo',
    'king-crimson-blue',
    'guido-mista',
    'bruno-bucciarati',
    'whitesnake',
    'enrico-pucci',
    'johnny-joestar-second'
];

function formatearPrecio(numero) {
    return '$' + numero.toLocaleString('es-CL');
}

function crearTarjetaInicio(producto) {
    const lineas = producto.placeholder.split('\n');

    // Badge
    let badgeHTML = '';
    if (producto.badge) {
        const clases = { 'VILLANO': 'catalog-badge villain', 'NUEVO': 'catalog-badge new' };
        const clase = clases[producto.badge] || 'catalog-badge';
        badgeHTML = `<div class="${clase}">${producto.badge}</div>`;
    }

    // Stock
    const stockClase = { 'in-stock': 'in-stock', 'low-stock': 'low-stock', 'out-stock': 'out-stock' }[producto.stock] || 'in-stock';

    // Botón
    const agotado = producto.stock === 'out-stock';
    const imagenEscape = (producto.imagen || '').replace(/'/g, "\\'");
    const nombreEscape = producto.nombre.replace(/'/g, "\\'");
    const btnHTML = agotado
        ? `<button class="add-to-cart-btn catalog-cart-btn" disabled style="opacity:0.5;cursor:not-allowed;">AGOTADO</button>`
        : `<button class="add-to-cart-btn catalog-cart-btn"
               data-carrito-id="${producto.id}"
               onclick="event.preventDefault(); agregarAlCarrito('${producto.id}', '${nombreEscape}', ${producto.precio}, '${imagenEscape}')">
               + CARRITO
           </button>`;

    // Imagen real o placeholder
    const imagenHTML = producto.imagen
        ? `<img class="catalog-img-real" src="${producto.imagen}" alt="${producto.nombre}" loading="lazy">`
        : `<div class="catalog-img-placeholder"
                style="background:${producto.gradiente}; width:100%; height:100%;
                       display:flex; align-items:center; justify-content:center;">
               <span class="placeholder-text">${lineas.join('<br>')}</span>
           </div>`;

    return `
        <a href="producto.html?id=${producto.id}" style="text-decoration:none; color:inherit; display:block;">
            <article class="catalog-card">
                ${badgeHTML}
                <div class="catalog-image">${imagenHTML}</div>
                <div class="catalog-info">
                    <div class="catalog-meta">
                        <span class="catalog-series">${producto.parte}</span>
                        <span class="catalog-stock ${stockClase}">${producto.stockLabel}</span>
                    </div>
                    <h3 class="catalog-name">${producto.nombre}</h3>
                    <p class="catalog-detail">${producto.descripcionCorta}</p>
                    <div class="catalog-bottom">
                        <div class="catalog-price">${formatearPrecio(producto.precio)}</div>
                        ${btnHTML}
                    </div>
                </div>
            </article>
        </a>`;
}

async function init() {
    const grid = document.getElementById('index-catalog-grid');
    if (!grid) return;

    try {
        const res = await fetch('productos.json');
        const todos = await res.json();

        // Mantiene el orden exacto de PRODUCTOS_INICIO
        const productos = PRODUCTOS_INICIO
            .map(id => todos.find(p => p.id === id))
            .filter(Boolean);

        grid.innerHTML = productos.map(crearTarjetaInicio).join('');

    } catch (e) {
        console.error('Error cargando productos del inicio:', e);
    }
}

document.addEventListener('DOMContentLoaded', init);
