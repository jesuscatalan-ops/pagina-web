// ============================================================
//  pokemon-destacados.js
//  Renderiza los dos carruseles de productos en pokemon.html
//  leyendo desde productos-pokemon.json.
//  Listas: PRODUCTOS_DESTACADOS (primer carrusel), PRODUCTOS_RECOMENDADOS (segundo).
// ============================================================

const PRODUCTOS_DESTACADOS = [
    'poke-cynthia-garchomp-pc',
    'poke-korean-bb-super-electric-breaker',
    'poke-mini-tin-crown-zenith-es',
    'poke-mini-tin-prismatic',
    'poke-etb-twilight-es',
    'poke-trick-or-trade-50',
    'poke-team-rocket-mewtwo-deck',
    'poke-calyrex-shadow-deck'
];

/** Misma cantidad de ítems que PRODUCTOS_DESTACADOS; segundo carrusel en pokemon.html */
const PRODUCTOS_RECOMENDADOS = [
    'ambipom-full-art',
    'flygon',
    'heliolisk-full-art',
    'hops-trevenant-full-art',
    'ludicolo-full-art',
    'medicham-full-art',
    'galarian-obstagoon-full-art',
    'team-rockets-dugtrio-full-art',

];

function formatearPrecio(numero) {
    return '$' + numero.toLocaleString('es-CL');
}

function crearTarjetaDestacada(producto) {
    const lineas = (producto.placeholder || producto.nombre).split('\n');

    // Badge
    let badgeHTML = '';
    if (producto.badge) {
        const clases = {
            'BESTSELLER': 'poke-prod-badge',
            'POPULAR':    'poke-prod-badge',
            'JAPONÉS':    'poke-prod-badge',
            'NUEVO SET':  'poke-prod-badge',
            'STOCK BAJO': 'poke-prod-badge agotado',
        };
        const clase = clases[producto.badge] || 'poke-prod-badge';
        badgeHTML = `<div class="${clase}">${producto.badge}</div>`;
    }

    // Imagen real o placeholder con gradiente
    const imagenHTML = producto.imagen
        ? `<img src="${producto.imagen}" alt="${producto.nombre}"
               style="width:100%; height:100%; object-fit:contain; padding:0.5rem; display:block;"
               onerror="this.style.display='none'; this.nextElementSibling.style.display='flex';">
           <span style="display:none; align-items:center; justify-content:center;
                        width:100%; height:100%; font-size:3.5rem; position:absolute; inset:0;">
               ${lineas.join('<br>')}
           </span>`
        : `<span style="display:flex; align-items:center; justify-content:center;
                        width:100%; height:100%; font-size:1.1rem; font-family:'Bebas Neue',sans-serif;
                        color:rgba(255,255,255,0.5); letter-spacing:2px; text-align:center;
                        line-height:1.3; padding:0.5rem;">
               ${lineas.join('<br>')}
           </span>`;

    // Stock
    const agotado = producto.stock === 'out-stock';
    const btnTexto = agotado ? 'AGOTADO' : '+ CARRITO';
    const btnAttr  = agotado ? 'disabled style="opacity:0.5;cursor:not-allowed;"' : '';
    const nombreEsc = producto.nombre.replace(/'/g, "\\'");
    const btnOnclick = agotado ? '' :
        `onclick="event.stopPropagation(); agregarAlCarrito('${producto.id}','${nombreEsc}',${producto.precio},'${producto.imagen || ''}')"`;

    return `
    <a href="producto.html?id=${producto.id}" style="text-decoration:none; color:inherit;">
        <div class="poke-prod-card">
            <div class="poke-prod-img" style="background:${producto.gradiente}; position:relative;">
                ${badgeHTML}
                ${imagenHTML}
            </div>
            <div class="poke-prod-info">
                <h3 class="poke-prod-name">${producto.nombre}</h3>
                
                <div class="poke-prod-bottom">
                    <span class="poke-prod-price">${formatearPrecio(producto.precio)}</span>
                    <button class="poke-prod-btn" ${btnAttr} ${btnOnclick}>
                        ${btnTexto}
                    </button>
                </div>
            </div>
        </div>
    </a>`;
}

function llenarTrack(track, ids, todos) {
    if (!track) return;
    const productos = ids
        .map(id => todos.find(p => p.id === id))
        .filter(Boolean);
    track.innerHTML = productos.map(crearTarjetaDestacada).join('');
}

async function initPokemonDestacados() {
    const track = document.getElementById('carrusel-track');
    const track2 = document.getElementById('carrusel-track-2');
    if (!track && !track2) return;

    try {
        const resp = await fetch('productos-pokemon.json');
        if (!resp.ok) throw new Error('No se pudo cargar productos-pokemon.json');
        const todos = await resp.json();

        llenarTrack(track, PRODUCTOS_DESTACADOS, todos);
        llenarTrack(track2, PRODUCTOS_RECOMENDADOS, todos);

        setTimeout(() => {
            if (typeof window.refrescarCarouselesPokemon === 'function') {
                window.refrescarCarouselesPokemon();
            }
        }, 50);

    } catch (e) {
        console.error('Error cargando productos destacados Pokémon:', e);
    }
}

document.addEventListener('DOMContentLoaded', initPokemonDestacados);
