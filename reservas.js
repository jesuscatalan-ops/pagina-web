// ============================================================
//  reservas.js
//  Vitrina de preventas → mismas tarjetas del catálogo,
//  con acento de reserva y fecha estimada de llegada.
//
//  Para publicar una preventa, agrega una entrada en reservas.json:
//  { "id": "id-del-producto", "llegadaEstimada": "Octubre 2026", "adelantoPct": 50 }
//  El id debe existir en productos.json. Ese producto se oculta
//  del catálogo principal y aparece aquí.
// ============================================================

const ADELANTO_DEFAULT = 50;
const IDS_25TH = new Set(['joseph-joestar-25th']);
const RE_WF = /WF\s*(?:20\d{2}|Exclusive)/i;

function formatearPrecio(numero) {
    return '$' + Number(numero || 0).toLocaleString('es-CL');
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

function partesLlegada(str) {
    const raw = String(str || 'Por confirmar').trim() || 'Por confirmar';
    const match = raw.match(/^([A-Za-záéíóúñÁÉÍÓÚÑ.]+)\s+(\d{4})$/);
    if (match) {
        return {
            mes: match[1].replace('.', '').toUpperCase(),
            anio: match[2],
            raw: raw
        };
    }
    return { mes: raw.toUpperCase(), anio: '', raw: raw };
}

function htmlFechaCard(str) {
    const p = partesLlegada(str);
    const anio = p.anio
        ? `<span class="reservas-fecha-anio">${escapeHtml(p.anio)}</span>`
        : '';
    return `
        <div class="series-card-llegada">
            <span class="series-card-llegada-icon" aria-hidden="true">
                <svg viewBox="0 0 24 24" fill="none">
                    <rect x="3.2" y="5.2" width="17.6" height="15.6" rx="2.2" stroke="currentColor" stroke-width="1.6"/>
                    <path d="M3.2 10h17.6" stroke="currentColor" stroke-width="1.6"/>
                    <path d="M8 3.2v3.6M16 3.2v3.6" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/>
                </svg>
            </span>
            <div class="series-card-llegada-copy">
                <span class="reservas-fecha-label">Llegada estimada</span>
                <span class="reservas-fecha-valor">
                    <em>${escapeHtml(p.mes)}</em>
                    ${anio}
                </span>
            </div>
        </div>`;
}

function setContador(n) {
    const el = document.getElementById('reservas-contador');
    if (!el) return;
    el.textContent = n === 1 ? '1 FIGURA' : n + ' FIGURAS';
}

function crearCard(item) {
    const nombre = item.nombre || '';
    const extraTitulo = (item.continuacionTitulo && String(item.continuacionTitulo).trim())
        ? ` ${String(item.continuacionTitulo).trim()}`
        : '';

    const logo25thHTML = IDS_25TH.has(item.id)
        ? `<img class="catalog-25th-logo"
                src="${srcImagen('imagenes/Emblemas/logos especiales/25th Anniversary (2012) - Logo.png')}"
                alt="25th Anniversary 2012">`
        : '';

    const logoWfHTML = RE_WF.test(item.nombre || '')
        ? `<img class="catalog-wf-logo"
                src="${srcImagen('imagenes/Emblemas/logos especiales/wonder festival logo.png')}"
                alt="Wonder Festival">`
        : '';

    const imagenHTML = item.imagen
        ? `<img src="${srcImagen(item.imagen)}" alt="${escapeHtml(nombre)}" loading="lazy">`
        : `<div class="series-card-placeholder" style="background:${escapeHtml(item.gradiente || 'linear-gradient(135deg,#333,#111)')}">
               <span>${escapeHtml((item.placeholder || nombre).replace(/\n/g, ' '))}</span>
           </div>`;

    const llegada = (item.llegadaEstimada && String(item.llegadaEstimada).trim())
        ? item.llegadaEstimada
        : 'Por confirmar';

    return `
        <article class="series-card series-card--catalog series-card--reserva">
            <div class="series-card-body">
                <a class="series-card-top" href="producto.html?id=${encodeURIComponent(item.id)}">
                    <div class="series-card-image">
                        ${logo25thHTML}
                        ${logoWfHTML}
                        ${imagenHTML}
                    </div>
                    <h3 class="series-card-name">${escapeHtml(nombre + extraTitulo)}</h3>
                </a>
                <div class="series-card-actions">
                    <span class="series-card-price">${formatearPrecio(item.precio)}</span>
                </div>
                ${htmlFechaCard(llegada)}
            </div>
            <button type="button"
                    class="series-card-buy-btn"
                    data-id="${escapeHtml(item.id)}">
                RESERVAR
            </button>
        </article>`;
}

function renderVitrina(items) {
    const grid = document.getElementById('reservas-grid');
    if (!grid) return;

    if (!items.length) {
        grid.innerHTML = `
            <div class="reservas-empty">
                <p class="reservas-empty-title">NO HAY PREVENTAS ABIERTAS</p>
                <p class="reservas-empty-text">Vuelve pronto o escríbenos si buscas una figura específica.</p>
            </div>`;
        return;
    }

    grid.innerHTML = items.map(crearCard).join('');
}

function conectarClicks() {
    const grid = document.getElementById('reservas-grid');
    if (!grid || grid.dataset.reservasBound === '1') return;
    grid.dataset.reservasBound = '1';
    grid.addEventListener('click', function (e) {
        const btn = e.target.closest('.series-card-buy-btn');
        if (!btn) return;
        e.preventDefault();
        const id = btn.getAttribute('data-id');
        if (id) window.location.href = 'producto.html?id=' + encodeURIComponent(id);
    });
}

async function initReservas() {
    const grid = document.getElementById('reservas-grid');
    if (!grid) return;

    conectarClicks();

    grid.innerHTML = `
        <div class="reservas-empty">
            <p class="reservas-empty-title">CARGANDO PREVENTAS…</p>
        </div>`;

    try {
        const [resLista, resProductos] = await Promise.all([
            fetch('reservas.json'),
            fetch('productos.json')
        ]);
        if (!resLista.ok || !resProductos.ok) throw new Error('No se pudieron cargar los datos');

        const lista = await resLista.json();
        const productos = await resProductos.json();
        const porId = new Map(productos.map(function (p) { return [p.id, p]; }));

        const preventas = lista.map(function (entry) {
            const base = porId.get(entry.id);
            if (!base) return null;
            return Object.assign({}, base, {
                llegadaEstimada: entry.llegadaEstimada || '',
                adelantoPct: entry.adelantoPct || ADELANTO_DEFAULT
            });
        }).filter(Boolean);

        setContador(preventas.length);
        renderVitrina(preventas);
    } catch (err) {
        console.error('[reservas]', err);
        setContador(0);
        grid.innerHTML = `
            <div class="reservas-empty">
                <p class="reservas-empty-title">NO SE PUDIERON CARGAR LAS PREVENTAS</p>
                <p class="reservas-empty-text">Recarga la página e inténtalo de nuevo.</p>
            </div>`;
    }
}

document.addEventListener('DOMContentLoaded', initReservas);
