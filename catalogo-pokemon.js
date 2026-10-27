// ============================================================
//  catalogo-pokemon.js
//  Lee productos-pokemon.json y genera las tarjetas del
//  catálogo Pokémon TCG. Filtra por "categoria".
// ============================================================

const PRODUCTOS_POR_PAGINA = 16;

let todosLosProductos = [];
let productosVisibles = [];
let filtroActivo = 'Todos';
let ordenActivo  = 'default';
let paginaActual = 1;

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

function sincronizarGridLayoutSingles() {
    const grid = document.getElementById('catalogo-grid');
    if (!grid) return;
    grid.classList.toggle('catalog-page-grid--pokemon-singles', filtroActivo === 'Singles');
}

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
    paginaActual = 1;
    sincronizarGridLayoutSingles();
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

function escapeHtml(text) {
    if (text == null || text === '') return '';
    return String(text)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

function srcImagen(path) {
    if (!path) return '';
    return escapeHtml(encodeURI(String(path)));
}

function crearTarjeta(producto) {
    const lineas = (producto.placeholder || producto.nombre).split('\n').map(escapeHtml);

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
        badgeHTML = `<div class="${clase}">${escapeHtml(producto.badge)}</div>`;
    }

    const btnDisabled  = producto.stock === 'out-stock';
    const btnTexto     = btnDisabled ? 'AGOTADO' : '+ CARRITO';
    const btnAtributos = btnDisabled ? 'disabled style="opacity:0.5; cursor:not-allowed;"' : '';

    const imagenHTML = producto.imagen
        ? `<img class="catalog-img-real" src="${srcImagen(producto.imagen)}" alt="${escapeHtml(producto.nombre)}" loading="lazy">`
        : `<div class="catalog-img-placeholder"
                style="background:${escapeHtml(producto.gradiente || '')}; width:100%; height:100%;
                       display:flex; align-items:center; justify-content:center;">
               <span class="placeholder-text">${lineas.join('<br>')}</span>
           </div>`;

    const cardMod =
        producto.categoria === 'Singles' ? ' catalog-card--singles' : '';

    return `
    <a href="producto.html?id=${encodeURIComponent(producto.id)}"
       style="text-decoration:none; color:inherit; display:block;">
        <article class="catalog-card${cardMod}">
            ${badgeHTML}
            <div class="catalog-image">
                ${imagenHTML}
            </div>
            <div class="catalog-info">
                <h3 class="catalog-name">${escapeHtml(producto.nombre)}</h3>
                
                <div class="catalog-bottom">
                    <div class="catalog-price">${formatearPrecio(producto.precio)}</div>
                    <button class="add-to-cart-btn catalog-cart-btn"
                            data-carrito-id="${escapeHtml(producto.id)}"
                            data-nombre="${escapeHtml(producto.nombre)}"
                            data-precio="${Number(producto.precio) || 0}"
                            data-imagen="${escapeHtml(producto.imagen || '')}"
                            data-max="${Number(producto.maxCantidad) > 0 ? Number(producto.maxCantidad) : 1}"
                            ${btnAtributos}
                            onclick="event.preventDefault(); if(!this.disabled) agregarAlCarritoConFeedback(this.dataset.carritoId, this.dataset.nombre, Number(this.dataset.precio), this.dataset.imagen || '', this, Number(this.dataset.max) || 1)">
                        ${btnTexto}
                    </button>
                </div>
            </div>
        </article>
    </a>`;
}

function agregarAlCarritoConFeedback(id, nombre, precio, imagen, btn, maxCantidad) {
    agregarAlCarrito(id, nombre, precio, imagen, maxCantidad);
}

// ── Paginación ───────────────────────────────────────────────

function paginaDesdeURL() {
    const n = parseInt(new URLSearchParams(window.location.search).get('pagina'), 10);
    return Number.isInteger(n) && n > 0 ? n : 1;
}

function actualizarURL() {
    const params = new URLSearchParams(window.location.search);
    if (filtroActivo && filtroActivo !== 'Todos') {
        params.set('categoria', filtroActivo);
    } else {
        params.delete('categoria');
    }
    if (paginaActual > 1) {
        params.set('pagina', String(paginaActual));
    } else {
        params.delete('pagina');
    }
    const qs = params.toString();
    const next = qs ? `${location.pathname}?${qs}` : location.pathname;
    if (`${location.pathname}${location.search}` !== next) {
        history.replaceState(null, '', next);
    }
}

function numerosDePagina(pagina, total) {
    if (total <= 7) {
        return Array.from({ length: total }, (_, i) => i + 1);
    }
    const set = new Set([1, total, pagina - 1, pagina, pagina + 1]);
    if (pagina <= 3) {
        set.add(2);
        set.add(3);
        set.add(4);
    }
    if (pagina >= total - 2) {
        set.add(total - 3);
        set.add(total - 2);
        set.add(total - 1);
    }
    return [...set].filter(n => n >= 1 && n <= total).sort((a, b) => a - b);
}

function renderPaginacion(totalItems) {
    const nav = document.getElementById('catalogo-paginacion');
    if (!nav) return;

    const total = Math.ceil(totalItems / PRODUCTOS_POR_PAGINA);
    if (totalItems === 0 || total <= 1) {
        nav.hidden = true;
        nav.innerHTML = '';
        return;
    }

    nav.hidden = false;
    const nums = numerosDePagina(paginaActual, total);
    let html = `<button type="button" class="catalog-pagination-btn catalog-pagination-btn--nav" data-pagina="${paginaActual - 1}" ${paginaActual <= 1 ? 'disabled' : ''} aria-label="Página anterior">Anterior</button>`;
    let prev = 0;
    nums.forEach(n => {
        if (prev && n - prev > 1) {
            html += '<span class="catalog-pagination-ellipsis" aria-hidden="true">…</span>';
        }
        const activa = n === paginaActual;
        html += `<button type="button" class="catalog-pagination-btn${activa ? ' active' : ''}" data-pagina="${n}" ${activa ? 'aria-current="page"' : ''} aria-label="Página ${n}">${n}</button>`;
        prev = n;
    });
    html += `<button type="button" class="catalog-pagination-btn catalog-pagination-btn--nav" data-pagina="${paginaActual + 1}" ${paginaActual >= total ? 'disabled' : ''} aria-label="Página siguiente">Siguiente</button>`;
    nav.innerHTML = html;
}

function irAPagina(n) {
    const total = Math.max(1, Math.ceil(productosVisibles.length / PRODUCTOS_POR_PAGINA));
    paginaActual = Math.min(Math.max(1, n), total);
    renderGrid(productosVisibles, { scroll: true });
}

function conectarPaginacion() {
    const nav = document.getElementById('catalogo-paginacion');
    if (!nav || nav.dataset.bound === '1') return;
    nav.dataset.bound = '1';
    nav.addEventListener('click', function (e) {
        const btn = e.target.closest('[data-pagina]');
        if (!btn || btn.disabled) return;
        const n = parseInt(btn.getAttribute('data-pagina'), 10);
        if (!Number.isInteger(n)) return;
        irAPagina(n);
    });
}

function scrollAlCatalogo() {
    const destino = document.querySelector('.catalog-page-filters') || document.getElementById('catalogo-grid');
    if (destino) destino.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

// ── Render del grid ──────────────────────────────────────────

function renderGrid(productos, opciones) {
    productosVisibles = productos;
    const grid     = document.getElementById('catalogo-grid');
    const contador = document.getElementById('catalogo-contador');
    if (!grid) return;

    const total = productos.length;
    const totalPaginas = Math.max(1, Math.ceil(total / PRODUCTOS_POR_PAGINA));
    if (paginaActual > totalPaginas) paginaActual = totalPaginas;
    if (paginaActual < 1) paginaActual = 1;

    const inicio = (paginaActual - 1) * PRODUCTOS_POR_PAGINA;
    const pagina = productos.slice(inicio, inicio + PRODUCTOS_POR_PAGINA);

    if (total === 0) {
        grid.innerHTML = `
            <div style="grid-column:1/-1; text-align:center; padding:4rem 2rem;">
                <div style="font-size:3rem; margin-bottom:1rem;">🔍</div>
                <p style="font-family:'Bebas Neue',sans-serif; font-size:1.5rem;
                           letter-spacing:2px; color:var(--gray);">
                    NO HAY PRODUCTOS EN ESTA CATEGORÍA
                </p>
            </div>`;
    } else {
        grid.innerHTML = pagina.map(crearTarjeta).join('');
    }

    if (contador) {
        if (total === 0) {
            contador.textContent = '0 productos';
        } else if (total <= PRODUCTOS_POR_PAGINA) {
            contador.textContent = `${total} producto${total !== 1 ? 's' : ''}`;
        } else {
            contador.textContent = `${inicio + 1}–${inicio + pagina.length} de ${total} productos`;
        }
    }

    renderPaginacion(total);
    actualizarURL();

    if (opciones && opciones.scroll) {
        scrollAlCatalogo();
    }
}

// ── Filtrado ─────────────────────────────────────────────────

function aplicarFiltro(categoria, opciones) {
    filtroActivo = categoria;

    document.querySelectorAll('.filter-btn').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.filtro === categoria);
    });

    if (!opciones || !opciones.conservarPagina) paginaActual = 1;

    sincronizarGridLayoutSingles();

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
            <p style="font-family:'Bebas Neue',sans-serif; font-size:2rem;
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
        conectarPaginacion();

        paginaActual = paginaDesdeURL();

        // Aplicar filtro de URL si existe
        const catURL = categoriaDesdeURL();
        aplicarFiltro(catURL, { conservarPagina: true });

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
