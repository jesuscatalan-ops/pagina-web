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
        : todosLosProductos.filter(p => partesDe(p).includes(filtroActivo));
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

/** Partes en las que aparece un producto al filtrar. Usa `partes` si existe; si no, `parte`. */
function partesDe(producto) {
    if (Array.isArray(producto.partes) && producto.partes.length) return producto.partes;
    return producto.parte ? [producto.parte] : [];
}

// ── Render de una tarjeta individual ────────────────────────

const IDS_25TH = new Set(['joseph-joestar-25th']);
const RE_WF = /WF\s*(?:20\d{2}|Exclusive)/i;

function crearTarjeta(producto) {
    const agotado = producto.stock === 'out-stock';
    const nombre = producto.nombre || '';
    const extraTitulo = (producto.continuacionTitulo && String(producto.continuacionTitulo).trim())
        ? ` ${String(producto.continuacionTitulo).trim()}`
        : '';

    const logo25thHTML = IDS_25TH.has(producto.id)
        ? `<img class="catalog-25th-logo"
                src="${srcImagen('imagenes/Emblemas/logos especiales/25th Anniversary (2012) - Logo.png')}"
                alt="25th Anniversary 2012">`
        : '';

    const logoWfHTML = RE_WF.test(producto.nombre || '')
        ? `<img class="catalog-wf-logo"
                src="${srcImagen('imagenes/Emblemas/logos especiales/wonder festival logo.png')}"
                alt="Wonder Festival">`
        : '';

    let badgeHTML = '';
    if (producto.badge) {
        badgeHTML = `<span class="series-card-badge">${escapeHtml(producto.badge)}</span>`;
    }

    const imagenHTML = producto.imagen
        ? `<img src="${srcImagen(producto.imagen)}" alt="${escapeHtml(nombre)}" loading="lazy">`
        : `<div class="series-card-placeholder" style="background:${escapeHtml(producto.gradiente || 'linear-gradient(135deg,#333,#111)')}">
               <span>${escapeHtml((producto.placeholder || nombre).replace(/\n/g, ' '))}</span>
           </div>`;

    const btnDisabled = agotado ? 'disabled' : '';
    const btnTexto = agotado ? 'AGOTADO' : '+ COMPRAR';
    const fabricante = producto.fabricante || 'Medicos Entertainment';

    return `
        <article class="series-card series-card--catalog">
            <div class="series-card-body">
                <a class="series-card-top" href="producto.html?id=${encodeURIComponent(producto.id)}">
                    <div class="series-card-image">
                        ${logo25thHTML}
                        ${logoWfHTML}
                        ${badgeHTML}
                        ${imagenHTML}
                    </div>
                    <h3 class="series-card-name">${escapeHtml(nombre + extraTitulo)}</h3>
                </a>
                <div class="series-card-actions">
                    <span class="series-card-price">${formatearPrecio(producto.precio)}</span>
                </div>
                <div class="series-card-footer">
                    <div class="series-card-official">
                        <svg viewBox="0 0 24 24" aria-hidden="true">
                            <circle cx="12" cy="12" r="10" fill="none" stroke="currentColor" stroke-width="1.6"/>
                            <path d="M8 12.5l2.4 2.4L16.5 9" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>
                        </svg>
                        <div>
                            <span>Productos oficiales de Japón</span>
                            <span>Mercancía licenciada</span>
                        </div>
                    </div>
                    <div class="series-card-maker">
                        <span class="series-card-maker-name">${escapeHtml(fabricante)}</span>
                        <span class="series-card-maker-label">Fabricante</span>
                    </div>
                </div>
            </div>
            <button type="button"
                    class="series-card-buy-btn"
                    data-id="${escapeHtml(producto.id)}"
                    ${btnDisabled}>
                ${btnTexto}
            </button>
        </article>`;
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

    // Actualizar botón "Todos"
    const todosBtn = document.querySelector('.filter-todos-btn');
    if (todosBtn) todosBtn.classList.toggle('active', parte === 'Todos');

    // Actualizar emblemas de parte
    document.querySelectorAll('.parte-emblem-btn').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.parte === parte);
    });

    // Filtrar y renderizar respetando el orden activo
    const filtrados = parte === 'Todos'
        ? todosLosProductos
        : todosLosProductos.filter(p => partesDe(p).includes(parte));

    renderGrid(ordenar(filtrados, ordenActivo));
}

// ── Conectar botones de filtro ────────────────────────────────

function conectarFiltros() {
    const todosBtn = document.querySelector('.filter-todos-btn');
    if (todosBtn) {
        todosBtn.addEventListener('click', () => aplicarFiltro('Todos'));
    }

    document.querySelectorAll('.parte-emblem-btn').forEach(btn => {
        btn.addEventListener('click', () => aplicarFiltro(btn.dataset.parte));
    });
}

function conectarCarritoCatalogo() {
    const grid = document.getElementById('catalogo-grid');
    if (!grid || grid.dataset.carritoBound === '1') return;
    grid.dataset.carritoBound = '1';
    grid.addEventListener('click', function (e) {
        const btn = e.target.closest('.series-card-buy-btn');
        if (!btn || btn.disabled) return;
        e.preventDefault();
        const id = btn.getAttribute('data-id');
        const p = todosLosProductos.find(function (x) { return x.id === id; });
        if (!p || typeof agregarAlCarrito !== 'function') return;
        agregarAlCarrito(p.id, p.nombre, p.precio, p.imagen || '', p.maxCantidad);
    });
}

// ── Arranque ─────────────────────────────────────────────────

async function init() {
    const grid = document.getElementById('catalogo-grid');
    if (!grid) return; // No estamos en el catálogo

    // Mostrar estado de carga
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
        const [respuesta, resReservas] = await Promise.all([
            fetch('productos.json'),
            fetch('reservas.json').catch(function () { return null; })
        ]);
        if (!respuesta.ok) throw new Error('No se pudo cargar productos.json');

        const idsReserva = new Set();
        if (resReservas && resReservas.ok) {
            const listaReserva = await resReservas.json();
            listaReserva.forEach(function (e) { if (e && e.id) idsReserva.add(e.id); });
        }

        todosLosProductos = (await respuesta.json()).filter(function (p) {
            return !idsReserva.has(p.id);
        });

        conectarFiltros();
        conectarCarritoCatalogo();

        // Soporte deep-link desde Quiénes Somos: catalogo.html?parte=Golden%20Wind
        const parteURL = new URLSearchParams(window.location.search).get('parte');
        if (parteURL && parteURL !== 'Todos') {
            aplicarFiltro(parteURL);
        } else {
            renderGrid(todosLosProductos);
        }

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
