// ============================================================
//  catalogo-pokemon.js
//  Lee productos-pokemon.json y genera las tarjetas del
//  catálogo Pokémon TCG. Filtra por "categoria".
// ============================================================

let todosLosProductos = [];
let filtroActivo = 'Todos';
let ordenActivo  = 'default';

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
        : todosLosProductos.filter(p => p.categoria === filtroActivo);
    renderGrid(ordenar(filtrados, orden));
};

document.addEventListener('click', function(e) {
    const dropdown = document.getElementById('sort-dropdown-poke');
    const btn      = document.getElementById('sort-btn-poke');
    if (dropdown && !dropdown.contains(e.target) && !btn?.contains(e.target)) {
        dropdown.classList.remove('visible');
        btn?.classList.remove('abierto');
    }
});

function formatearPrecio(numero) {
    return '$' + numero.toLocaleString('es-CL');
}

// ── Render de una tarjeta ────────────────────────────────────

function crearTarjeta(producto) {
    const lineas = (producto.placeholder || producto.nombre).split('\n');

    let badgeHTML = '';
    if (producto.badge) {
        const clases = {
            'BESTSELLER': 'catalog-badge',
            'POPULAR':    'catalog-badge',
            'JAPONÉS':    'catalog-badge',
            'NUEVO SET':  'catalog-badge new',
            'STOCK BAJO': 'catalog-badge villain',
        };
        const clase = clases[producto.badge] || 'catalog-badge';
        badgeHTML = `<div class="${clase}">${producto.badge}</div>`;
    }

    const stockClase = {
        'in-stock':  'in-stock',
        'low-stock': 'low-stock',
        'out-stock': 'out-stock',
    }[producto.stock] || 'in-stock';

    const btnDisabled  = producto.stock === 'out-stock';
    const btnTexto     = btnDisabled ? 'AGOTADO' : '+ CARRITO';
    const btnAtributos = btnDisabled ? 'disabled style="opacity:0.5; cursor:not-allowed;"' : '';

    const imagenHTML = producto.imagen
        ? `<img class="catalog-img-real" src="${producto.imagen}" alt="${producto.nombre}" loading="lazy">`
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
                    <span class="catalog-series">${producto.categoria}</span>
                    <span class="catalog-stock ${stockClase}">${producto.stockLabel}</span>
                </div>
                <h3 class="catalog-name">${producto.nombre}</h3>
                <p class="catalog-detail">${producto.descripcionCorta}</p>
                <div class="catalog-bottom">
                    <div class="catalog-price">${formatearPrecio(producto.precio)}</div>
                    <button class="add-to-cart-btn catalog-cart-btn"
                            data-carrito-id="${producto.id}"
                            ${btnAtributos}
                            onclick="event.preventDefault(); if(!this.disabled) agregarAlCarritoConFeedback('${producto.id}','${producto.nombre.replace(/'/g,"\\'")}',${producto.precio},'${producto.imagen || ''}', this)">
                        ${btnTexto}
                    </button>
                </div>
            </div>
        </article>
    </a>`;
}

function agregarAlCarritoConFeedback(id, nombre, precio, imagen, btn) {
    agregarAlCarrito(id, nombre, precio, imagen);
    const textoOriginal = btn.textContent;
    btn.textContent = '✓ AGREGADO';
    btn.style.background = 'linear-gradient(135deg,#00b894,#00d9a3)';
    setTimeout(() => {
        btn.textContent = textoOriginal;
        btn.style.background = '';
    }, 1500);
}

// ── Render del grid ──────────────────────────────────────────

function renderGrid(productos) {
    const grid     = document.getElementById('catalogo-grid');
    const contador = document.getElementById('catalogo-contador');
    if (!grid) return;

    if (productos.length === 0) {
        grid.innerHTML = `
            <div style="grid-column:1/-1; text-align:center; padding:4rem 2rem;">
                <div style="font-size:3rem; margin-bottom:1rem;">🔍</div>
                <p style="font-family:'Bebas Neue',sans-serif; font-size:1.5rem;
                           letter-spacing:2px; color:var(--gray);">
                    NO HAY PRODUCTOS EN ESTA CATEGORÍA
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

function aplicarFiltro(categoria) {
    filtroActivo = categoria;

    document.querySelectorAll('.filter-btn').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.filtro === categoria);
    });

    const filtrados = categoria === 'Todos'
        ? todosLosProductos
        : todosLosProductos.filter(p => p.categoria === categoria);

    renderGrid(ordenar(filtrados, ordenActivo));
}

function conectarFiltros() {
    document.querySelectorAll('.filter-btn').forEach(btn => {
        btn.addEventListener('click', () => aplicarFiltro(btn.dataset.filtro));
    });
}

// ── Leer ?categoria= de la URL ───────────────────────────────

function categoriaDesdeURL() {
    const params = new URLSearchParams(window.location.search);
    const cat = params.get('categoria');
    if (!cat) return 'Todos';
    // Capitalizar primera letra para coincidir con el JSON
    return cat.charAt(0).toUpperCase() + cat.slice(1);
}

// ── Arranque ─────────────────────────────────────────────────

async function init() {
    const grid = document.getElementById('catalogo-grid');
    if (!grid) return;

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
        const respuesta = await fetch('productos-pokemon.json');
        if (!respuesta.ok) throw new Error('No se pudo cargar productos-pokemon.json');

        todosLosProductos = await respuesta.json();
        conectarFiltros();

        // Aplicar filtro de URL si existe
        const catURL = categoriaDesdeURL();
        aplicarFiltro(catURL);

        // Marcar botón activo correspondiente
        document.querySelectorAll('.filter-btn').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.filtro === catURL);
        });

    } catch (error) {
        console.error('Error cargando el catálogo Pokémon:', error);
        grid.innerHTML = `
            <div style="grid-column:1/-1; text-align:center; padding:4rem 2rem;">
                <p style="color:var(--gray);">Error al cargar los productos. Recarga la página.</p>
            </div>`;
    }
}

document.addEventListener('DOMContentLoaded', init);
