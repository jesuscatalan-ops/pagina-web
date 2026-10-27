// ============================================================
//  busqueda.js
//  Página de resultados: misma grilla y tarjetas del catálogo.
// ============================================================

(function () {
    let resultadosBase = [];
    let idsReserva = new Set();
    let ordenActivo = 'default';

    function escapeText(text) {
        if (typeof escapeHtml === 'function') return escapeHtml(text);
        return String(text == null ? '' : text)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');
    }

    function coincide(producto, query) {
        const q = String(query || '').trim().toLowerCase();
        if (q.length < 2) return false;
        const palabras = q.split(/\s+/).filter(Boolean);
        const extra = producto.continuacionTitulo || '';
        const partes = Array.isArray(producto.partes)
            ? producto.partes.join(' ')
            : (producto.parte || '');
        const texto = [
            producto.nombre,
            extra,
            partes,
            producto.serie,
            producto.fabricante,
            producto.tipo
        ].join(' ').toLowerCase();
        return palabras.every(function (pal) { return texto.includes(pal); });
    }

    function ordenarLista(lista, orden) {
        if (typeof ordenar === 'function') return ordenar(lista, orden);
        return lista.slice();
    }

    function setTitulo(query) {
        const titulo = document.getElementById('busqueda-titulo');
        if (!titulo) return;
        const desc = document.querySelector('meta[name="description"]');
        if (!query) {
            titulo.textContent = 'Escribe algo para buscar';
            document.title = 'Búsqueda — Anime2Chile';
            if (desc) desc.setAttribute('content', 'Busca figuras originales y preventas en Anime2Chile.');
            return;
        }
        titulo.textContent = '“' + query + '”';
        document.title = 'Búsqueda: ' + query + ' — Anime2Chile';
        if (desc) {
            desc.setAttribute('content', 'Resultados de búsqueda para “' + query + '” en Anime2Chile.');
        }
    }

    function setContador(n) {
        const el = document.getElementById('busqueda-contador');
        if (!el) return;
        el.textContent = n === 1 ? '1 producto' : n + ' productos';
    }

    function htmlVacio(query) {
        if (!query) {
            return `
                <div class="busqueda-empty">
                    <p class="busqueda-empty-title">¿QUÉ ESTÁS BUSCANDO?</p>
                    <p class="busqueda-empty-text">Usa el buscador o ve al catálogo completo.</p>
                    <a href="catalogo.html" class="banner-btn" style="text-decoration:none;margin-top:1.25rem;display:inline-block;">VER CATÁLOGO</a>
                </div>`;
        }
        return `
            <div class="busqueda-empty">
                <p class="busqueda-empty-title">SIN RESULTADOS</p>
                <p class="busqueda-empty-text">No encontramos productos para “${escapeText(query)}”.</p>
                <a href="catalogo.html" class="banner-btn" style="text-decoration:none;margin-top:1.25rem;display:inline-block;">VER CATÁLOGO</a>
            </div>`;
    }

    function renderResultados(lista, query) {
        const grid = document.getElementById('busqueda-grid');
        if (!grid) return;

        if (!lista.length || typeof crearTarjeta !== 'function') {
            grid.innerHTML = htmlVacio(query);
            setContador(lista.length);
            return;
        }

        grid.innerHTML = lista.map(crearTarjeta).join('');
        setContador(lista.length);
    }

    function aplicarOrdenLocal(orden, el) {
        ordenActivo = orden;
        document.querySelectorAll('#sort-dropdown-busqueda .sort-option').forEach(function (o) {
            o.classList.remove('activa');
        });
        if (el) el.classList.add('activa');

        const labels = {
            default: 'ORDENAR',
            az: 'A → Z',
            za: 'Z → A',
            'precio-asc': 'MENOR PRECIO',
            'precio-desc': 'MAYOR PRECIO',
            antiguos: 'ANTIGUOS',
            nuevos: 'NUEVOS'
        };
        const btn = document.getElementById('sort-btn-busqueda');
        if (btn) btn.childNodes[0].textContent = labels[orden] || 'ORDENAR';

        document.getElementById('sort-dropdown-busqueda')?.classList.remove('visible');
        btn?.classList.remove('abierto');

        const query = new URLSearchParams(window.location.search).get('q') || '';
        renderResultados(ordenarLista(resultadosBase, ordenActivo), query.trim());
    }

    function conectarOrden() {
        const btn = document.getElementById('sort-btn-busqueda');
        const dropdown = document.getElementById('sort-dropdown-busqueda');
        if (!btn || !dropdown) return;

        btn.addEventListener('click', function (e) {
            e.stopPropagation();
            const abierto = dropdown.classList.contains('visible');
            dropdown.classList.toggle('visible', !abierto);
            btn.classList.toggle('abierto', !abierto);
        });

        dropdown.querySelectorAll('.sort-option').forEach(function (opt) {
            opt.addEventListener('click', function () {
                aplicarOrdenLocal(opt.getAttribute('data-sort'), opt);
            });
        });

        document.addEventListener('click', function (e) {
            if (!dropdown.contains(e.target) && !btn.contains(e.target)) {
                dropdown.classList.remove('visible');
                btn.classList.remove('abierto');
            }
        });
    }

    function conectarCarrito() {
        const grid = document.getElementById('busqueda-grid');
        if (!grid || grid.dataset.carritoBound === '1') return;
        grid.dataset.carritoBound = '1';
        grid.addEventListener('click', function (e) {
            const btn = e.target.closest('.series-card-buy-btn');
            if (!btn || btn.disabled) return;
            e.preventDefault();
            const id = btn.getAttribute('data-id');
            if (!id) return;
            if (idsReserva.has(id)) {
                window.location.href = 'producto.html?id=' + encodeURIComponent(id);
                return;
            }
            const p = resultadosBase.find(function (x) { return x.id === id; });
            if (!p || typeof agregarAlCarrito !== 'function') return;
            agregarAlCarrito(p.id, p.nombre, p.precio, p.imagen || '', p.maxCantidad);
        });
    }

    async function init() {
        const grid = document.getElementById('busqueda-grid');
        if (!grid) return;

        const query = (new URLSearchParams(window.location.search).get('q') || '').trim();
        setTitulo(query);
        conectarOrden();
        conectarCarrito();

        if (query.length < 2) {
            resultadosBase = [];
            renderResultados([], '');
            return;
        }

        grid.innerHTML = `
            <div class="busqueda-empty">
                <p class="busqueda-empty-title">BUSCANDO…</p>
            </div>`;

        try {
            const [resProductos, resReservas] = await Promise.all([
                fetch('productos.json'),
                fetch('reservas.json').catch(function () { return null; })
            ]);
            if (!resProductos.ok) throw new Error('productos');

            if (resReservas && resReservas.ok) {
                const listaReserva = await resReservas.json();
                listaReserva.forEach(function (e) {
                    if (e && e.id) idsReserva.add(e.id);
                });
            }

            const productos = await resProductos.json();
            resultadosBase = productos.filter(function (p) {
                return !idsReserva.has(p.id) && coincide(p, query);
            });
            renderResultados(ordenarLista(resultadosBase, ordenActivo), query);
        } catch (err) {
            console.error('[busqueda]', err);
            grid.innerHTML = `
                <div class="busqueda-empty">
                    <p class="busqueda-empty-title">NO SE PUDO BUSCAR</p>
                    <p class="busqueda-empty-text">Recarga la página e inténtalo de nuevo.</p>
                </div>`;
            setContador(0);
        }
    }

    document.addEventListener('DOMContentLoaded', init);
})();
