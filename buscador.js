// ============================================================
//  buscador.js
//  Buscador global — solo productos.json (Pokémon TCG fuera del índice).
//  Se inyecta automáticamente en todas las páginas.
// ============================================================

(function() {

    // ── Cache de productos ────────────────────────────────────
    let _productos = null; // se carga una sola vez

    async function obtenerProductos() {
        if (_productos) return _productos;

        const [resp, resReservas] = await Promise.all([
            fetch('productos.json').catch(() => null),
            fetch('reservas.json').catch(() => null)
        ]);
        const idsReserva = new Set();
        if (resReservas && resReservas.ok) {
            const listaReserva = await resReservas.json();
            listaReserva.forEach(function (e) {
                if (e && e.id) idsReserva.add(e.id);
            });
        }

        const lista = [];

        if (resp && resp.ok) {
            const datos = await resp.json();
            datos.forEach(p => {
                if (idsReserva.has(p.id)) return;
                lista.push({
                    id:      p.id,
                    nombre:  p.nombre,
                    tag:     p.parte || p.serie || 'JoJo',
                    precio:  p.precio,
                    imagen:  p.imagen || null,
                    gradiente: p.gradiente,
                    placeholder: p.placeholder || '',
                    tipo:    'jojo'
                });
            });
        }

        _productos = lista;
        return lista;
    }

    // ── Búsqueda ─────────────────────────────────────────────
    function urlResultados(query) {
        return 'busqueda.html?q=' + encodeURIComponent(String(query || '').trim());
    }

    function irAResultados(query) {
        const q = String(query || '').trim();
        if (q.length < 2) return false;
        window.location.href = urlResultados(q);
        return true;
    }

    function buscar(query, productos) {
        if (!query || query.trim().length < 2) return [];
        const q = query.trim().toLowerCase();
        const palabras = q.split(/\s+/);

        return productos
            .filter(p => {
                const texto = (p.nombre + ' ' + p.tag).toLowerCase();
                return palabras.every(pal => texto.includes(pal));
            })
            .slice(0, 8); // máximo 8 resultados en el panel
    }

    // ── Resaltar coincidencias ────────────────────────────────
    function resaltar(texto, query) {
        if (!query) return texto;
        const palabras = query.trim().split(/\s+/).filter(Boolean);
        let resultado = texto;
        palabras.forEach(pal => {
            const regex = new RegExp(`(${pal.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi');
            resultado = resultado.replace(regex, '<mark>$1</mark>');
        });
        return resultado;
    }

    // ── Formato precio ────────────────────────────────────────
    function formatPrecio(n) {
        return '$' + n.toLocaleString('es-CL');
    }

    // ── Render de un resultado ────────────────────────────────
    function renderItem(p, query) {
        const thumbStyle = p.imagen
            ? ''
            : `background:${p.gradiente};`;

        const thumbContenido = p.imagen
            ? `<img src="${encodeURI(p.imagen)}" alt="${p.nombre}">`
            : (p.placeholder || '').split('\\n').join('<br>');

        return `
        <a class="buscador-item" href="producto.html?id=${p.id}">
            <div class="buscador-item-thumb" style="${thumbStyle}">
                ${thumbContenido}
            </div>
            <div class="buscador-item-info">
                <div class="buscador-item-tag">${p.tag}</div>
                <div class="buscador-item-nombre">${resaltar(p.nombre, query)}</div>
            </div>
            <div class="buscador-item-precio">${formatPrecio(p.precio)}</div>
        </a>`;
    }

    // ── Actualizar panel ──────────────────────────────────────
    function actualizarPanel(panel, resultados, query, totalProductos) {
        const header = panel.querySelector('.buscador-panel-header');
        const lista  = panel.querySelector('.buscador-resultados');
        const footer = panel.querySelector('.buscador-panel-footer');
        const count  = panel.querySelector('.buscador-panel-count');

        if (!query || query.trim().length < 2) {
            panel.classList.remove('visible');
            return;
        }

        panel.classList.add('visible');

        if (resultados.length === 0) {
            lista.innerHTML = `
                <div class="buscador-vacio">
                    <div class="buscador-vacio-icon">🔍</div>
                    <p>SIN RESULTADOS</p>
                    <span>Intenta con otro término</span>
                </div>`;
            footer.style.display = 'none';
            if (count) count.textContent = '0 resultados';
        } else {
            lista.innerHTML = resultados.map(p => renderItem(p, query)).join('');
            footer.style.display = 'block';
            if (count) count.textContent = `${resultados.length}${resultados.length >= 8 ? '+' : ''} resultado${resultados.length !== 1 ? 's' : ''}`;
        }
    }

    // ── Construir HTML del buscador ───────────────────────────
    function buildBuscadorHTML(id) {
        return `
        <div class="buscador-wrap" id="${id}">
            <form class="buscador-form" action="busqueda.html" method="get" role="search">
                <span class="buscador-icono">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none"
                         stroke="currentColor" stroke-width="2.5"
                         stroke-linecap="round" stroke-linejoin="round">
                        <circle cx="11" cy="11" r="8"/>
                        <line x1="21" y1="21" x2="16.65" y2="16.65"/>
                    </svg>
                </span>
                <input class="buscador-input" type="text" name="q"
                       placeholder="Buscar productos..." autocomplete="off"
                       aria-label="Buscar productos">
                <button class="buscador-limpiar" type="button" aria-label="Limpiar búsqueda">✕</button>
                <button class="buscador-submit" type="submit" aria-label="Buscar">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none"
                         stroke="currentColor" stroke-width="2.4"
                         stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                        <circle cx="11" cy="11" r="8"/>
                        <line x1="21" y1="21" x2="16.65" y2="16.65"/>
                    </svg>
                </button>
            </form>
            <div class="buscador-panel">
                <div class="buscador-panel-header">
                    <span class="buscador-panel-label">RESULTADOS</span>
                    <span class="buscador-panel-count"></span>
                </div>
                <div class="buscador-resultados"></div>
                <div class="buscador-panel-footer" style="display:none;">
                    <button class="buscador-ver-todos" type="button">
                        VER TODOS LOS RESULTADOS →
                    </button>
                </div>
            </div>
        </div>`;
    }

    // ── Conectar un buscador ──────────────────────────────────
    function conectarBuscador(wrap) {
        const form   = wrap.querySelector('.buscador-form');
        const input  = wrap.querySelector('.buscador-input');
        const panel  = wrap.querySelector('.buscador-panel');
        const limpiar = wrap.querySelector('.buscador-limpiar');
        const verTodos = wrap.querySelector('.buscador-ver-todos');

        let timeout = null;

        input.addEventListener('input', async () => {
            const q = input.value;

            // Mostrar/ocultar botón limpiar
            limpiar.classList.toggle('visible', q.length > 0);

            clearTimeout(timeout);

            if (q.trim().length < 2) {
                panel.classList.remove('visible');
                return;
            }

            timeout = setTimeout(async () => {
                const todos = await obtenerProductos();
                const resultados = buscar(q, todos);
                actualizarPanel(panel, resultados, q, todos.length);
            }, 180); // debounce 180ms
        });

        // Limpiar búsqueda
        limpiar.addEventListener('click', () => {
            input.value = '';
            limpiar.classList.remove('visible');
            panel.classList.remove('visible');
            input.focus();
        });

        // Cerrar panel al hacer click fuera
        document.addEventListener('click', (e) => {
            if (!wrap.contains(e.target)) {
                panel.classList.remove('visible');
            }
        });

        // Navegación con teclado
        input.addEventListener('keydown', (e) => {
            const items = panel.querySelectorAll('.buscador-item');
            const actual = panel.querySelector('.buscador-item.destacado');

            if (e.key === 'ArrowDown') {
                e.preventDefault();
                if (!actual) {
                    items[0]?.classList.add('destacado');
                } else {
                    actual.classList.remove('destacado');
                    const siguiente = actual.nextElementSibling;
                    if (siguiente && siguiente.classList.contains('buscador-item')) {
                        siguiente.classList.add('destacado');
                    } else {
                        items[0]?.classList.add('destacado');
                    }
                }
            } else if (e.key === 'ArrowUp') {
                e.preventDefault();
                if (actual) {
                    actual.classList.remove('destacado');
                    const anterior = actual.previousElementSibling;
                    if (anterior && anterior.classList.contains('buscador-item')) {
                        anterior.classList.add('destacado');
                    } else {
                        items[items.length - 1]?.classList.add('destacado');
                    }
                }
            } else if (e.key === 'Enter') {
                e.preventDefault();
                irAResultados(input.value);
            } else if (e.key === 'Escape') {
                panel.classList.remove('visible');
                input.blur();
            }
        });

        form?.addEventListener('submit', (e) => {
            e.preventDefault();
            irAResultados(input.value);
        });

        verTodos?.addEventListener('click', () => {
            irAResultados(input.value);
        });
    }

    // ── Inyectar en el header ─────────────────────────────────
    function inyectarBuscador() {
        const headerContent = document.querySelector('.header-content');
        if (!headerContent || document.getElementById('buscador-desktop')) return;

        // 1. Buscador desktop — entre logo y nav
        const nav = headerContent.querySelector('.nav');
        if (nav) {
            nav.insertAdjacentHTML('beforebegin', buildBuscadorHTML('buscador-desktop'));
        }

        // 2. Botón lupa en móvil (antes del botón menú)
        const mobileBtn = headerContent.querySelector('.mobile-menu-btn');
        if (mobileBtn) {
            mobileBtn.insertAdjacentHTML('beforebegin', `
                <button class="buscador-toggle-mobile" id="buscador-lupa-mobile"
                        aria-label="Buscar">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none"
                         stroke="currentColor" stroke-width="2.5"
                         stroke-linecap="round" stroke-linejoin="round">
                        <circle cx="11" cy="11" r="8"/>
                        <line x1="21" y1="21" x2="16.65" y2="16.65"/>
                    </svg>
                </button>
            `);
        }

        // 3. Barra móvil expandida (fuera del header, fixed)
        document.body.insertAdjacentHTML('afterbegin', `
            <div class="buscador-mobile-bar" id="buscador-mobile-bar">
                ${buildBuscadorHTML('buscador-mobile')}
                <button class="buscador-mobile-cancelar" id="buscador-cancelar">CANCELAR</button>
            </div>
        `);

        // Conectar buscador desktop
        const wrapDesktop = document.getElementById('buscador-desktop');
        if (wrapDesktop) conectarBuscador(wrapDesktop);

        // Conectar buscador móvil
        const wrapMobile = document.getElementById('buscador-mobile');
        if (wrapMobile) conectarBuscador(wrapMobile);

        // Toggle barra móvil
        const lupaBtn = document.getElementById('buscador-lupa-mobile');
        const mobileBar = document.getElementById('buscador-mobile-bar');
        const cancelarBtn = document.getElementById('buscador-cancelar');

        lupaBtn?.addEventListener('click', () => {
            mobileBar.classList.add('visible');
            setTimeout(() => {
                mobileBar.querySelector('.buscador-input')?.focus();
            }, 50);
        });

        cancelarBtn?.addEventListener('click', () => {
            mobileBar.classList.remove('visible');
            const input = mobileBar.querySelector('.buscador-input');
            if (input) input.value = '';
            mobileBar.querySelector('.buscador-panel')?.classList.remove('visible');
            mobileBar.querySelector('.buscador-limpiar')?.classList.remove('visible');
        });

        const qActual = new URLSearchParams(window.location.search).get('q');
        if (qActual && /busqueda\.html/i.test(window.location.pathname)) {
            document.querySelectorAll('.buscador-input').forEach(function (input) {
                input.value = qActual;
                input.closest('.buscador-form')
                    ?.querySelector('.buscador-limpiar')
                    ?.classList.add('visible');
            });
        }
    }

    // ── Init ─────────────────────────────────────────────────
    document.addEventListener('DOMContentLoaded', inyectarBuscador);

})();
