// ============================================================
//  index-catalogo.js
//  Carruseles del home: figuras articuladas + manga/artbooks.
// ============================================================

function formatearPrecio(numero) {
    return '$' + Number(numero).toLocaleString('es-CL');
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

function isMobileLayout() {
    return window.matchMedia('(max-width: 768px), (max-width: 1200px) and (orientation: portrait)').matches;
}

function visibleCount() {
    if (window.matchMedia('(min-width: 600px) and (max-width: 1200px) and (orientation: portrait)').matches) {
        return 3;
    }
    return isMobileLayout() ? 2 : 4;
}

function crearTarjetaSerie(producto, idsReserva) {
    const agotado = producto.stock === 'out-stock';
    const esReserva = idsReserva.has(producto.id);
    const nombre = producto.nombre || '';
    const extraTitulo = (producto.continuacionTitulo && String(producto.continuacionTitulo).trim())
        ? ` ${String(producto.continuacionTitulo).trim()}`
        : '';

    let badgeHTML = '';
    if (esReserva) {
        badgeHTML = '<span class="series-card-badge series-card-badge--preventa">Preventa</span>';
    } else if (agotado) {
        badgeHTML = '<span class="series-card-badge series-card-badge--agotado">Agotado</span>';
    } else if (producto.badge) {
        badgeHTML = `<span class="series-card-badge">${escapeHtml(producto.badge)}</span>`;
    }

    const imagenHTML = producto.imagen
        ? `<img src="${srcImagen(producto.imagen)}" alt="${escapeHtml(nombre)}" loading="lazy">`
        : `<div class="series-card-placeholder" style="background:${escapeHtml(producto.gradiente || 'linear-gradient(135deg,#333,#111)')}">
               <span>${escapeHtml((producto.placeholder || nombre).replace(/\n/g, ' '))}</span>
           </div>`;

    const btnDisabled = agotado ? 'disabled' : '';
    const reservaAttr = esReserva ? 'data-reserva="1"' : '';
    const btnTexto = agotado ? 'AGOTADO' : '+ COMPRAR';
    const fabricante = producto.fabricante || 'Medicos Entertainment';

    return `
        <article class="series-card">
            <div class="series-card-body">
            <a class="series-card-top" href="producto.html?id=${encodeURIComponent(producto.id)}">
                <div class="series-card-image">
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
                    ${reservaAttr}
                    ${btnDisabled}>
                ${btnTexto}
            </button>
        </article>`;
}

function aplicarSnap(track) {
    const n = visibleCount();
    const cards = track.querySelectorAll('.series-card');
    cards.forEach(function (card, i) {
        card.style.scrollSnapAlign = (i % n === 0) ? 'start' : 'none';
    });
}

function initCarousel(root, productosById) {
    const viewport = root.querySelector('.series-carousel-viewport');
    const track = root.querySelector('.series-carousel-track');
    const btnPrev = root.querySelector('.series-arrow-prev');
    const btnNext = root.querySelector('.series-arrow-next');
    if (!viewport || !track) return;

    let index = 0;

    function cards() {
        return Array.from(track.querySelectorAll('.series-card'));
    }

    function maxIndex() {
        const list = cards();
        return Math.max(0, list.length - visibleCount());
    }

    function updateArrows() {
        const list = cards();
        const needsNav = list.length > visibleCount();
        if (btnPrev) {
            btnPrev.disabled = !needsNav || index <= 0;
        }
        if (btnNext) {
            btnNext.disabled = !needsNav || index >= maxIndex();
        }
    }

    function goTo(i) {
        const list = cards();
        if (!list.length) return;
        index = Math.max(0, Math.min(i, maxIndex()));
        const first = list[0];
        const target = list[index];
        const left = target.offsetLeft - first.offsetLeft;
        viewport.scrollTo({ left: left, behavior: 'smooth' });
        updateArrows();
    }

    function syncFromScroll() {
        const list = cards();
        if (!list.length) return;
        const first = list[0];
        const sl = viewport.scrollLeft;
        let best = 0;
        let minDist = Infinity;
        const n = visibleCount();
        for (let i = 0; i < list.length; i += n) {
            const dist = Math.abs((list[i].offsetLeft - first.offsetLeft) - sl);
            if (dist < minDist) {
                minDist = dist;
                best = i;
            }
        }
        index = Math.min(best, maxIndex());
        updateArrows();
    }

    if (btnPrev) {
        btnPrev.addEventListener('click', function () {
            goTo(index - visibleCount());
        });
    }
    if (btnNext) {
        btnNext.addEventListener('click', function () {
            goTo(index + visibleCount());
        });
    }

    let scrollTimer;
    viewport.addEventListener('scroll', function () {
        clearTimeout(scrollTimer);
        scrollTimer = setTimeout(syncFromScroll, 80);
    }, { passive: true });

    window.addEventListener('resize', function () {
        aplicarSnap(track);
        index = Math.min(index, maxIndex());
        const list = cards();
        if (!list.length) return;
        const first = list[0];
        const target = list[index] || list[0];
        viewport.scrollTo({ left: target.offsetLeft - first.offsetLeft, behavior: 'auto' });
        updateArrows();
    });

    viewport.addEventListener('click', function (e) {
        const btn = e.target.closest('.series-card-buy-btn');
        if (!btn || btn.disabled) return;
        e.preventDefault();
        e.stopPropagation();

        const id = btn.getAttribute('data-id');
        if (btn.getAttribute('data-reserva') === '1') {
            window.location.href = 'producto.html?id=' + encodeURIComponent(id);
            return;
        }
        const p = productosById[id];
        if (!p || typeof agregarAlCarrito !== 'function') return;
        agregarAlCarrito(p.id, p.nombre, p.precio, p.imagen || '', p.maxCantidad);
    });

    aplicarSnap(track);
    updateArrows();
}

async function init() {
    const wrap = document.querySelector('.series-carousels-wrap');
    if (!wrap) return;

    const figurasTrack = document.getElementById('carousel-figuras-track');
    const librosTrack = document.getElementById('carousel-libros-track');
    if (!figurasTrack || !librosTrack) return;

    try {
        const [resProductos, resReservas] = await Promise.all([
            fetch('productos.json'),
            fetch('reservas.json').catch(function () { return null; })
        ]);
        if (!resProductos.ok) throw new Error('No se pudo cargar productos.json');

        const todos = await resProductos.json();
        const idsReserva = new Set();
        if (resReservas && resReservas.ok) {
            const listaReserva = await resReservas.json();
            listaReserva.forEach(function (e) {
                if (e && e.id) idsReserva.add(e.id);
            });
        }

        const productosById = {};
        todos.forEach(function (p) {
            if (p && p.id) productosById[p.id] = p;
        });

        const figuras = todos.filter(function (p) {
            return p.tipo === 'Figura articulada';
        });
        const libros = todos.filter(function (p) {
            return p.tipo === 'Libro de arte';
        }).concat(todos.filter(function (p) {
            return p.tipo === 'Manga';
        }));

        figurasTrack.innerHTML = figuras.map(function (p) {
            return crearTarjetaSerie(p, idsReserva);
        }).join('');
        librosTrack.innerHTML = libros.map(function (p) {
            return crearTarjetaSerie(p, idsReserva);
        }).join('');

        document.querySelectorAll('.series-carousel').forEach(function (root) {
            initCarousel(root, productosById);
        });
    } catch (e) {
        console.error('Error cargando carruseles del inicio:', e);
    }
}

window.crearTarjetaSerie = crearTarjetaSerie;
window.initSeriesCarousel = initCarousel;

document.addEventListener('DOMContentLoaded', init);
