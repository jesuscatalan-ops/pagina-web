// ============================================================
//  catalogo.js
//  Lee productos.json y genera dinámicamente las tarjetas
//  del catálogo. También maneja el filtrado por parte.
// ============================================================

let todosLosProductos = [];
let filtroActivo = 'Todos';
let ordenActivo   = 'default';

// ── Ordenamiento ─────────────────────────────────────────────

function ordenar(lista, orden) {
    const copia = [...lista];
    switch (orden) {
        case 'az':          return copia.sort((a,b) => a.nombre.localeCompare(b.nombre, 'es'));
        case 'za':          return copia.sort((a,b) => b.nombre.localeCompare(a.nombre, 'es'));
        case 'precio-asc':  return copia.sort((a,b) => a.precio - b.precio);
        case 'precio-desc': return copia.sort((a,b) => b.precio - a.precio);
        case 'antiguos':    return copia;
        case 'nuevos':      return copia.reverse();
        default:            return copia;
    }
}

window.toggleSortMenu = function(cat) {
    const btn      = document.getElementById(`sort-btn-${cat}`);
    const dropdown = document.getElementById(`sort-dropdown-${cat}`);
    const abierto  = dropdown.classList.contains('visible');
    dropdown.classList.toggle('visible', !abierto);
    btn.classList.toggle('abierto', !abierto);
};

window.aplicarOrden = function(cat, orden, el) {
    ordenActivo = orden;
    document.querySelectorAll(`#sort-dropdown-${cat} .sort-option`).forEach(o => o.classList.remove('activa'));
    el.classList.add('activa');
    const labels = { default:'ORDENAR', az:'A → Z', za:'Z → A',
                     'precio-asc':'MENOR PRECIO', 'precio-desc':'MAYOR PRECIO',
                     antiguos:'ANTIGUOS', nuevos:'NUEVOS' };
    const btn = document.getElementById(`sort-btn-${cat}`);
    btn.childNodes[0].textContent = labels[orden] || 'ORDENAR';
    document.getElementById(`sort-dropdown-${cat}`).classList.remove('visible');
    btn.classList.remove('abierto');
    const filtrados = filtroActivo === 'Todos'
        ? todosLosProductos
        : todosLosProductos.filter(p => p.parte === filtroActivo);
    renderGrid(ordenar(filtrados, orden));
};

document.addEventListener('click', function(e) {
    const dropdown = document.getElementById('sort-dropdown-jojo');
    const btn      = document.getElementById('sort-btn-jojo');
    if (dropdown && !dropdown.contains(e.target) && !btn?.contains(e.target)) {
        dropdown.classList.remove('visible');
        btn?.classList.remove('abierto');
    }
});

// ── Utilidades ───────────────────────────────────────────────

function formatearPrecio(numero) {
    return '$' + numero.toLocaleString('es-CL');
}

// ── Render de una tarjeta individual ────────────────────────

function crearTarjeta(producto) {
    const lineas = producto.placeholder.split('\n');

    // Badge especial (BESTSELLER / VILLANO / NUEVO)
    let badgeHTML = '';
    if (producto.badge) {
        const clases = {
            'VILLANO':   'catalog-badge villain',
            'NUEVO':     'catalog-badge new',
            'NUEVO SET': 'catalog-badge new',
        };
        const clase = clases[producto.badge] || 'catalog-badge';
        badgeHTML = `<div class="${clase}">${producto.badge}</div>`;
    }

    // Estado de stock
    const stockClase = {
        'in-stock':  'in-stock',
        'low-stock': 'low-stock',
        'out-stock': 'out-stock',
    }[producto.stock] || 'in-stock';

    // Botón carrito
    const btnDisabled  = producto.stock === 'out-stock';
    const btnTexto     = btnDisabled ? 'AGOTADO' : '+ CARRITO';
    const btnAtributos = btnDisabled
        ? 'disabled style="opacity:0.5; cursor:not-allowed;"'
        : `data-carrito-id="${producto.id}"
           onclick="event.preventDefault(); agregarAlCarrito('${producto.id}', '${producto.nombre.replace(/'/g, "\'")}', ${producto.precio}, '${producto.imagen || ''}')"`;

    // Imagen: real o placeholder
    const imagenHTML = producto.imagen
        ? `<img
               class="catalog-img-real"
               src="${producto.imagen}"
               alt="${producto.nombre}"
               loading="lazy">`
        : `<div class="catalog-img-placeholder"
                style="background:${producto.gradiente}; width:100%; height:100%;
                       display:flex; align-items:center; justify-content:center;">
               <span class="placeholder-text">${lineas.join('<br>')}</span>
           </div>`;

    return `
    <a href="producto.html?id=${producto.id}"
       style="text-decoration:none; color:inherit; display:block;">
        <article class="catalog-card">
            ${badgeHTML}
            <div class="catalog-image">
                ${imagenHTML}
            </div>
            <div class="catalog-info">
                <div class="catalog-meta">
                    <span class="catalog-series">${producto.parte}</span>
                    <span class="catalog-stock ${stockClase}">${producto.stockLabel}</span>
                </div>
                <h3 class="catalog-name">${producto.nombre}</h3>
                <p class="catalog-detail">${producto.descripcionCorta}</p>
                <div class="catalog-bottom">
                    <div class="catalog-price">${formatearPrecio(producto.precio)}</div>
                    <button class="add-to-cart-btn catalog-cart-btn"
                            ${btnAtributos}>
                        ${btnTexto}
                    </button>
                </div>
            </div>
        </article>
    </a>`;
}

// ── Render del grid completo ─────────────────────────────────

function renderGrid(productos) {
    const grid = document.getElementById('catalogo-grid');
    const contador = document.getElementById('catalogo-contador');

    if (!grid) return;

    if (productos.length === 0) {
        grid.innerHTML = `
            <div style="grid-column:1/-1; text-align:center; padding:4rem 2rem;">
                <div style="font-size:3rem; margin-bottom:1rem;">🔍</div>
                <p style="font-family:'Bebas Neue',sans-serif; font-size:1.5rem;
                           letter-spacing:2px; color:var(--gray);">
                    NO HAY PRODUCTOS EN ESTA PARTE
                </p>
            </div>`;
    } else {
        grid.innerHTML = productos.map(crearTarjeta).join('');
    }

    if (contador) {
        contador.textContent = `${productos.length} producto${productos.length !== 1 ? 's' : ''}`;
    }
}

// ── Filtrado ─────────────────────────────────────────────────

function aplicarFiltro(parte) {
    filtroActivo = parte;

    // Actualizar botones activos
    document.querySelectorAll('.filter-btn').forEach(btn => {
        btn.classList.toggle('active', btn.textContent.trim() === parte);
    });

    // Filtrar y renderizar respetando el orden activo
    const filtrados = parte === 'Todos'
        ? todosLosProductos
        : todosLosProductos.filter(p => p.parte === parte);

    renderGrid(ordenar(filtrados, ordenActivo));
}

// ── Conectar botones de filtro ────────────────────────────────

function conectarFiltros() {
    document.querySelectorAll('.filter-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            aplicarFiltro(btn.textContent.trim());
        });
    });
}

// ── Arranque ─────────────────────────────────────────────────

async function init() {
    const grid = document.getElementById('catalogo-grid');
    if (!grid) return; // No estamos en el catálogo

    // Mostrar estado de carga
    grid.innerHTML = `
        <div style="grid-column:1/-1; text-align:center; padding:4rem 2rem;">
            <p style="font-family:'Anton',sans-serif; font-size:2rem;
                       background:var(--gradient); -webkit-background-clip:text;
                       -webkit-text-fill-color:transparent; background-clip:text;
                       letter-spacing:2px;">
                CARGANDO CATÁLOGO...
            </p>
        </div>`;

    try {
        const respuesta = await fetch('productos.json');
        if (!respuesta.ok) throw new Error('No se pudo cargar productos.json');

        todosLosProductos = await respuesta.json();

        conectarFiltros();
        renderGrid(todosLosProductos);

    } catch (error) {
        console.error('Error cargando el catálogo:', error);
        grid.innerHTML = `
            <div style="grid-column:1/-1; text-align:center; padding:4rem 2rem;">
                <p style="color:var(--gray);">
                    Error al cargar los productos. Recarga la página.
                </p>
            </div>`;
    }
}

document.addEventListener('DOMContentLoaded', init);
