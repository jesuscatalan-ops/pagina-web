// ============================================================
//  producto.js
//  Lee ?id=PRODUCTO_ID de la URL, carga productos.json
//  y renderiza la página de producto dinámica.
// ============================================================

/** false = la pestaña DESCRIPCIÓN no se muestra. Pon true para volver a activarla en todos los productos. */
const MOSTRAR_DESCRIPCION = false;

/** false = los productos Pokémon no se muestran (la ficha responde "no encontrado"). Debe coincidir con POKEMON_HABILITADO del servidor. */
const POKEMON_HABILITADO = false;

// ── Utilidades ──────────────────────────────────────────────

/** Formatea un número como precio chileno: 89990 → "$89.990" */
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

/** Devuelve la clase CSS correcta para el badge de stock */
function stockClass(stock) {
    const mapa = {
        'in-stock':  'stock-ok',
        'low-stock': 'stock-low',
        'out-stock': 'stock-out'
    };
    return mapa[stock] || 'stock-ok';
}


/** Cambia de tab en la sección de descripción */
function switchTab(btn, panelId) {
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
    btn.classList.add('active');
    document.getElementById(panelId).classList.add('active');
}

// ── Estados de la UI ─────────────────────────────────────────

function mostrarCargando() {
    document.getElementById('estado-cargando').style.display  = 'flex';
    document.getElementById('estado-error').style.display     = 'none';
    document.getElementById('producto-contenido').style.display = 'none';
}

function mostrarError() {
    document.getElementById('estado-cargando').style.display  = 'none';
    document.getElementById('estado-error').style.display     = 'flex';
    document.getElementById('producto-contenido').style.display = 'none';
    document.title = 'Producto no encontrado — Anime2Chile';
    setMetaSeo('name', 'robots', 'noindex, follow');
    setCanonicalSeo(SEO_ORIGIN + '/catalogo.html');
}

function mostrarContenido() {
    document.getElementById('estado-cargando').style.display  = 'none';
    document.getElementById('estado-error').style.display     = 'none';
    document.getElementById('producto-contenido').style.display = 'block';
}

// ── Render principal ─────────────────────────────────────────

function partesLlegada(str) {
    const raw = String(str || 'Por confirmar').trim();
    const match = raw.match(/^([A-Za-záéíóúñÁÉÍÓÚÑ.]+)\s+(\d{4})$/);
    if (match) {
        return {
            mes: match[1].replace('.', '').toUpperCase(),
            anio: match[2]
        };
    }
    return { mes: raw.toUpperCase(), anio: '' };
}

function adelantoPctDe(valor) {
    const n = Number(valor);
    if (!Number.isFinite(n) || n <= 0 || n > 100) return 50;
    return n;
}

const SEO_ORIGIN = 'https://anime2chile.cl';

function absUrlSeo(path) {
    if (!path) return SEO_ORIGIN + '/anime2chile_logo.png';
    const s = String(path);
    if (/^https?:\/\//i.test(s)) return s;
    return SEO_ORIGIN + '/' + s.replace(/^\//, '');
}

function setMetaSeo(attr, key, content) {
    if (!content) return;
    let el = document.querySelector('meta[' + attr + '="' + key + '"]');
    if (!el) {
        el = document.createElement('meta');
        el.setAttribute(attr, key);
        document.head.appendChild(el);
    }
    el.setAttribute('content', content);
}

function setCanonicalSeo(href) {
    let el = document.querySelector('link[rel="canonical"]');
    if (!el) {
        el = document.createElement('link');
        el.rel = 'canonical';
        document.head.appendChild(el);
    }
    el.href = href;
}

function setJsonLdSeo(id, data) {
    let el = document.getElementById(id);
    if (!el) {
        el = document.createElement('script');
        el.type = 'application/ld+json';
        el.id = id;
        document.head.appendChild(el);
    }
    el.textContent = JSON.stringify(data);
}

function disponibilidadSeo(stock) {
    if (stock === 'out-stock') return 'https://schema.org/OutOfStock';
    if (stock === 'low-stock') return 'https://schema.org/LimitedAvailability';
    return 'https://schema.org/InStock';
}

function aplicarSeoProducto(producto, esPokemon, esReserva, adelantoPct) {
    const titulo = producto.nombre + ' — Anime2Chile';
    const descFuente = producto.descripcionCorta || producto.descripcion || producto.nombre;
    const desc = String(descFuente).replace(/\s+/g, ' ').trim().slice(0, 160);
    const canonical = SEO_ORIGIN + '/producto.html?id=' + encodeURIComponent(producto.id);
    const imagen = absUrlSeo(producto.imagen);
    const precio = esReserva
        ? precioAbono(producto.precio, adelantoPct)
        : Number(producto.precio) || 0;

    document.title = titulo;
    setCanonicalSeo(canonical);
    setMetaSeo('name', 'description', desc);
    setMetaSeo('name', 'robots', 'index, follow');
    setMetaSeo('property', 'og:type', 'product');
    setMetaSeo('property', 'og:title', titulo);
    setMetaSeo('property', 'og:description', desc);
    setMetaSeo('property', 'og:url', canonical);
    setMetaSeo('property', 'og:image', imagen);
    setMetaSeo('name', 'twitter:card', 'summary_large_image');
    setMetaSeo('name', 'twitter:title', titulo);
    setMetaSeo('name', 'twitter:description', desc);
    setMetaSeo('name', 'twitter:image', imagen);

    const seccion = esPokemon ? 'Pokémon TCG' : (esReserva ? 'Reservas' : 'Catálogo');
    const seccionUrl = esPokemon
        ? SEO_ORIGIN + '/'
        : (esReserva ? SEO_ORIGIN + '/reservas.html' : SEO_ORIGIN + '/catalogo.html');

    setJsonLdSeo('jsonld-product', {
        '@context': 'https://schema.org',
        '@type': 'Product',
        name: producto.nombre,
        sku: String(producto.id),
        image: imagen,
        description: desc,
        brand: { '@type': 'Brand', name: producto.fabricante || 'Anime2Chile' },
        offers: {
            '@type': 'Offer',
            url: canonical,
            priceCurrency: 'CLP',
            price: String(precio),
            availability: disponibilidadSeo(producto.stock),
            itemCondition: 'https://schema.org/NewCondition',
            seller: { '@type': 'Organization', name: 'Anime2Chile' }
        }
    });
    setJsonLdSeo('jsonld-breadcrumb', {
        '@context': 'https://schema.org',
        '@type': 'BreadcrumbList',
        itemListElement: [
            { '@type': 'ListItem', position: 1, name: 'Inicio', item: SEO_ORIGIN + '/' },
            { '@type': 'ListItem', position: 2, name: seccion, item: seccionUrl },
            { '@type': 'ListItem', position: 3, name: producto.nombre, item: canonical }
        ]
    });
}

function precioAbono(precioTotal, adelantoPct) {
    return Math.round(Number(precioTotal || 0) * adelantoPctDe(adelantoPct) / 100);
}

function renderProducto(producto, todosLosProductos, esPokemon = false, esReserva = false, idsReserva, llegadaEstimada, adelantoPct) {

    aplicarSeoProducto(producto, esPokemon, esReserva, adelantoPct);

    /* ---------- Imagen principal ---------- */
    const imgEl = document.getElementById('producto-imagen-principal');

    if (producto.imagen) {
        // Imagen real: fondo neutro, imagen con object-fit contain
        imgEl.className = 'product-main-img';
        imgEl.style.cssText = '';
        imgEl.innerHTML = `<img
            class="product-img-real"
            src="${escapeHtml(encodeURI(producto.imagen))}"
            alt="${escapeHtml(producto.nombre)}"
            loading="lazy">`;
    } else {
        // Placeholder con gradiente
        imgEl.className = 'product-main-img tiene-placeholder';
        imgEl.style.cssText = `background:${escapeHtml(producto.gradiente || '')}`;
        const lineas = String(producto.placeholder || '').split('\n').map(escapeHtml);
        imgEl.innerHTML = lineas.join('<br>');
    }

    /* ---------- Thumbnails / Carrusel ---------- */
    const thumbsEl = document.getElementById('producto-thumbnails');

    // Soporte para múltiples imágenes: campo "imagenes" (array) o "imagen" (string)
    const listaImagenes = producto.imagenes
        ? producto.imagenes                      // array con varias fotos
        : (producto.imagen ? [producto.imagen] : []); // convierte imagen única a array

    if (listaImagenes.length > 0) {

        // ── Carrusel unificado (todos los productos con imágenes) ──
        document.querySelector('.product-gallery').classList.add('has-carousel');

        // Tira de thumbnails desplazable
        thumbsEl.classList.add('carousel-thumbs');
        thumbsEl.innerHTML = listaImagenes.map((src, i) => `
            <div class="product-thumb ${i === 0 ? 'active' : ''}" data-idx="${i}">
                <img src="${escapeHtml(encodeURI(src))}" alt="${escapeHtml(producto.nombre)} — foto ${i + 1}" loading="lazy">
            </div>`).join('');

        // Envolvemos la imagen principal para anclar las flechas
        const mainImgEl = document.getElementById('producto-imagen-principal');
        const carouselWrap = document.createElement('div');
        carouselWrap.className = 'carousel-img-wrap';
        mainImgEl.parentNode.insertBefore(carouselWrap, mainImgEl);
        carouselWrap.appendChild(mainImgEl);

        // Flechas solo si hay más de 1 imagen
        if (listaImagenes.length > 1) {
            carouselWrap.insertAdjacentHTML('beforeend', `
                <button class="carousel-arrow carousel-arrow-prev" aria-label="Anterior">&#8249;</button>
                <button class="carousel-arrow carousel-arrow-next" aria-label="Siguiente">&#8250;</button>
            `);
        }

        // ── Estado y navegación ──────────────────────────────────
        let currentIdx = 0;

        function irASlide(idx) {
            currentIdx = ((idx % listaImagenes.length) + listaImagenes.length) % listaImagenes.length;

            // Actualizar imagen principal
            const imgReal = mainImgEl.querySelector('.product-img-real');
            if (imgReal) imgReal.src = listaImagenes[currentIdx];

            // Marcar thumbnail activo
            thumbsEl.querySelectorAll('.product-thumb').forEach((t, i) =>
                t.classList.toggle('active', i === currentIdx));

            // Desplazar thumb activo a la vista
            const activeThumb = thumbsEl.querySelectorAll('.product-thumb')[currentIdx];
            if (activeThumb) activeThumb.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
        }

        // Clic en thumbnail
        thumbsEl.addEventListener('click', e => {
            const thumb = e.target.closest('.product-thumb');
            if (thumb) irASlide(parseInt(thumb.dataset.idx));
        });

        // Flechas prev / next
        const btnPrev = carouselWrap.querySelector('.carousel-arrow-prev');
        const btnNext = carouselWrap.querySelector('.carousel-arrow-next');
        if (btnPrev) btnPrev.addEventListener('click', () => irASlide(currentIdx - 1));
        if (btnNext) btnNext.addEventListener('click', () => irASlide(currentIdx + 1));

        // Swipe táctil en la imagen principal
        let touchStartX = 0;
        mainImgEl.addEventListener('touchstart', e => {
            touchStartX = e.changedTouches[0].clientX;
        }, { passive: true });
        mainImgEl.addEventListener('touchend', e => {
            const dx = e.changedTouches[0].clientX - touchStartX;
            if (Math.abs(dx) > 40) irASlide(currentIdx + (dx < 0 ? 1 : -1));
        }, { passive: true });

    } else {
        // Sin imagen: thumb del placeholder + slots vacíos
        const lineas = String(producto.placeholder || '').split('\n').map(escapeHtml);
        thumbsEl.innerHTML = `
            <div class="product-thumb active"
                 style="background:${escapeHtml(producto.gradiente || '')}; opacity:0.85;
                        font-family:'Anton',sans-serif; font-size:0.6rem;
                        color:rgba(255,255,255,0.4); letter-spacing:2px;
                        text-align:center; line-height:1.2; cursor:default;">
                ${lineas.join('<br>')}
            </div>
            <div class="product-thumb" style="background:#f0f0f0; color:#ccc;
                 font-size:0.7rem; font-family:'Bebas Neue',sans-serif;
                 letter-spacing:1px; cursor:default;">PRÓX.</div>
            <div class="product-thumb" style="background:#f0f0f0; color:#ccc;
                 font-size:0.7rem; font-family:'Bebas Neue',sans-serif;
                 letter-spacing:1px; cursor:default;">PRÓX.</div>
        `;
    }

    /* ---------- Badges de serie / tipo / stock ---------- */
    /*
    if (esPokemon) {
        document.getElementById('producto-badges').innerHTML = `
            <span class="product-badge-tag serie">${producto.categoria || ''}</span>
            <span class="product-badge-tag tipo">${producto.tipo || ''}</span>
            <span class="product-badge-tag ${stockClass(producto.stock)}">${producto.stockLabel}</span>
        `;
    } else {
        document.getElementById('producto-badges').innerHTML = `
            <span class="product-badge-tag serie">${producto.serie}</span>
            <span class="product-badge-tag tipo">${producto.tipo}</span>
            <span class="product-badge-tag ${stockClass(producto.stock)}">${producto.stockLabel}</span>
        `;
    }
        */

    /* ---------- Badge especial (BESTSELLER / VILLANO / NUEVO) ---------- */
    const badgeEl = document.getElementById('producto-badge-especial');
    if (producto.badge) {
        const clases = {
            'VILLANO': 'catalog-badge villain',
            'NUEVO':   'catalog-badge new',
            'NUEVO SET': 'catalog-badge new',
        };
        const clase = clases[producto.badge] || 'catalog-badge';
        badgeEl.innerHTML = `<div class="${clase}"
            style="position:static; display:inline-block; margin-bottom:0.5rem;">
            ${escapeHtml(producto.badge)}
        </div>`;
    } else {
        badgeEl.innerHTML = '';
    }

    /* ---------- Nombre, parte, precio ---------- */
    document.getElementById('producto-nombre').textContent = producto.nombre;
    document.getElementById('producto-parte').textContent  = esPokemon
        ? (producto.descripcionCorta || '')
        : (producto.parte || '');
    document.getElementById('producto-precio').textContent = formatearPrecio(producto.precio);

    const fechaReservaEl = document.getElementById('producto-reserva-fecha');
    if (fechaReservaEl) {
        if (esReserva) {
            const p = partesLlegada(llegadaEstimada);
            const anio = p.anio ? `<span class="reservas-fecha-anio">${escapeHtml(p.anio)}</span>` : '';
            fechaReservaEl.hidden = false;
            fechaReservaEl.innerHTML = `
                <span class="reservas-fecha-label">Llegada estimada</span>
                <span class="reservas-fecha-valor">
                    <em>${escapeHtml(p.mes)}</em>
                    ${anio}
                </span>`;
        } else {
            fechaReservaEl.hidden = true;
            fechaReservaEl.innerHTML = '';
        }
    }

    const pctReserva = adelantoPctDe(adelantoPct);
    const abonoReserva = precioAbono(producto.precio, pctReserva);
    const precioLabel = document.getElementById('producto-precio-label');
    const abonoBlock = document.getElementById('producto-abono-block');
    const abonoValor = document.getElementById('producto-abono');
    if (precioLabel) precioLabel.hidden = !esReserva;
    if (abonoBlock) {
        abonoBlock.hidden = !esReserva;
        const labelAbono = abonoBlock.querySelector('.product-page-price-label');
        if (labelAbono) labelAbono.textContent = 'Abono para reservar (' + pctReserva + '%)';
    }
    if (abonoValor) {
        abonoValor.textContent = esReserva ? formatearPrecio(abonoReserva) : '';
    }

    const precioNota = document.getElementById('producto-precio-nota');
    precioNota.textContent = esReserva
        ? 'Hoy pagas solo el abono para asegurar tu reserva. El saldo restante se cobra cuando el pedido esté listo para despacho.'
        : 'Envío calculado en el checkout';

    /* ---------- Botón carrito / reserva ---------- */
    const btnCarrito = document.getElementById('btn-carrito');
    if (esReserva) {
        btnCarrito.textContent = 'HACER UNA RESERVA';
        btnCarrito.removeAttribute('data-carrito-id');
        btnCarrito.disabled = false;
        btnCarrito.addEventListener('click', function (e) {
            e.preventDefault();
            if (typeof iniciarCheckoutConProducto === 'function') {
                iniciarCheckoutConProducto(
                    producto.id,
                    producto.nombre,
                    producto.precio,
                    producto.imagen || '',
                    { maxCantidad: producto.maxCantidad, adelantoPct: pctReserva }
                );
            } else {
                window.location.href = 'checkout.html';
            }
        });
    } else if (producto.stock === 'out-stock') {
        btnCarrito.textContent = 'AGOTADO';
        btnCarrito.disabled    = true;
        btnCarrito.style.opacity = '0.5';
        btnCarrito.style.cursor  = 'not-allowed';
    } else {
        btnCarrito.setAttribute('data-carrito-id', producto.id);
        btnCarrito.addEventListener('click', () => {
            agregarAlCarrito(producto.id, producto.nombre, producto.precio, producto.imagen || '', producto.maxCantidad);
        });
    }

    /* ---------- Bonus Wonder Festival (solo artículos WF) ---------- */
    const wfBonusEl = document.getElementById('producto-wf-bonus');
    const esWF = /WF\s*(?:20\d{2}|Exclusive)/i.test(producto.nombre || '');
    if (esWF) {
        wfBonusEl.hidden = false;
        document.getElementById('producto-wf-bonus-texto').textContent =
            (producto.bonus && String(producto.bonus).trim()) || '';
    } else {
        wfBonusEl.hidden = true;
        document.getElementById('producto-wf-bonus-texto').textContent = '';
    }

    /* ---------- Tabla de especificaciones ---------- */
    // Si el producto tiene campo "idioma" es Pokémon → idioma (+ condición para Singles)
    const esProd = typeof producto.idioma !== 'undefined';
    const specsPokemon = [
        { label: 'IDIOMA', value: producto.idioma || 'Por confirmar' },
    ];
    if (producto.categoria === 'Singles') {
        specsPokemon.push({
            label: 'CONDICIÓN',
            value: producto.condicionCarta || 'Por confirmar',
        });
    }
    const tipoNorm = String(producto.tipo || '').toLowerCase();
    const esMangaOLibro = tipoNorm === 'manga' || tipoNorm.includes('libro');
    const specsJojo = [
        { label: 'SERIE',              value: producto.serie },
        { label: 'PARTE',              value: producto.parte },
        { label: 'TIPO',               value: producto.tipo },
        { label: 'FABRICANTE',         value: producto.fabricante },
        { label: 'ALTURA',             value: producto.altura },
        { label: 'MATERIAL',           value: producto.material },
        { label: 'ORIGEN',             value: producto.origen },
        { label: 'BASE DE EXHIBICIÓN', value: producto.baseExhibicion },
        { label: 'ARTICULACIONES',     value: producto.articulaciones },
        { label: 'PÁGINAS',            value: producto.paginas },
    ];
    const ocultarEnMangaOLibro = ['ALTURA', 'MATERIAL', 'ORIGEN', 'BASE DE EXHIBICIÓN', 'ARTICULACIONES'];
    const ocultarEnFigura = ['PÁGINAS', 'ALTURA'];
    const specs = esProd
        ? specsPokemon
        : specsJojo.filter(s => esMangaOLibro
            ? !ocultarEnMangaOLibro.includes(s.label)
            : !ocultarEnFigura.includes(s.label));
    document.getElementById('producto-specs').innerHTML = specs
        .map(s => `
            <div class="product-spec-row">
                <span class="spec-label">${escapeHtml(s.label)}</span>
                <span class="spec-value">${escapeHtml(s.value || 'Por confirmar')}</span>
            </div>
        `).join('');

    /* ---------- Tab Descripción ---------- */
    document.getElementById('tab-desc-texto').textContent = producto.descripcion;
    const mostrarDescripcion = MOSTRAR_DESCRIPCION || producto.id === 'soft-wet';
    if (!mostrarDescripcion) {
        const btnDesc = document.querySelector('.product-tabs-nav .tab-btn');
        const panelDesc = document.getElementById('tab-desc');
        const btnSpecs = document.querySelector('.product-tabs-nav .tab-btn:nth-child(2)');
        const panelSpecs = document.getElementById('tab-specs');
        if (btnDesc) btnDesc.hidden = true;
        if (panelDesc) {
            panelDesc.hidden = true;
            panelDesc.classList.remove('active');
        }
        if (btnSpecs) btnSpecs.classList.add('active');
        if (panelSpecs) panelSpecs.classList.add('active');
    }

    /* ---------- Tab Especificaciones (lista) ---------- */
    document.getElementById('tab-specs-lista').innerHTML = specs
        .map(s => `<li>${escapeHtml(s.label.charAt(0) + s.label.slice(1).toLowerCase())}: ${escapeHtml(s.value || 'Por confirmar')}</li>`)
        .join('');

    /* ---------- Productos relacionados ---------- */
    const relWrap = document.getElementById('relacionados-wrap');
    const relTrack = document.getElementById('carousel-relacionados-track');
    const relTitle = document.querySelector('#relacionados-wrap .related-section-title');

    function ocultarRelacionados() {
        if (relWrap) relWrap.hidden = true;
        if (relTrack) relTrack.innerHTML = '';
    }

    if (esReserva) {
        ocultarRelacionados();
        return;
    }

    const idsSoloReserva = idsReserva instanceof Set ? idsReserva : new Set();
    const relacionados = (producto.relacionados || [])
        .map(rid => todosLosProductos.find(p => p.id === rid))
        .filter(p => p && !idsSoloReserva.has(p.id));

    if (!relWrap || !relTrack || relacionados.length === 0 || typeof crearTarjetaSerie !== 'function') {
        ocultarRelacionados();
        return;
    }

    const productosById = {};
    relacionados.forEach(function (p) {
        productosById[p.id] = p;
    });

    relWrap.hidden = false;
    if (relTitle) relTitle.style.display = '';
    relTrack.innerHTML = relacionados.map(function (p) {
        return crearTarjetaSerie(p, idsSoloReserva);
    }).join('');

    const carouselRoot = relWrap.querySelector('.series-carousel');
    if (carouselRoot && typeof initSeriesCarousel === 'function') {
        initSeriesCarousel(carouselRoot, productosById);
    }
}

// ── Arranque ─────────────────────────────────────────────────

async function init() {
    mostrarCargando();

    // 1. Leer el parámetro ?id= de la URL
    const params     = new URLSearchParams(window.location.search);
    const productoId = params.get('id');

    if (!productoId) {
        mostrarError();
        return;
    }

    try {
        // 2. Buscar el producto en ambos JSONs
        let producto = null;
        let productos = [];
        let esPokemon = false;

        const [respJojo, respPoke, respReservas] = await Promise.all([
            fetch('productos.json').catch(() => null),
            POKEMON_HABILITADO ? fetch('productos-pokemon.json').catch(() => null) : null,
            fetch('reservas.json').catch(() => null)
        ]);

        const idsReserva = new Set();
        const llegadasReserva = {};
        const adelantosReserva = {};
        if (respReservas && respReservas.ok) {
            const listaReserva = await respReservas.json();
            listaReserva.forEach(function (e) {
                if (e && e.id) {
                    idsReserva.add(e.id);
                    llegadasReserva[e.id] = e.llegadaEstimada || '';
                    adelantosReserva[e.id] = e.adelantoPct;
                }
            });
        }

        if (respJojo && respJojo.ok) {
            const lista = await respJojo.json();
            const encontrado = lista.find(p => p.id === productoId);
            if (encontrado) { producto = encontrado; productos = lista; esPokemon = false; }
        }

        if (!producto && respPoke && respPoke.ok) {
            const lista = await respPoke.json();
            const encontrado = lista.find(p => p.id === productoId);
            if (encontrado) { producto = encontrado; productos = lista; esPokemon = true; }
        }

        if (!producto) { mostrarError(); return; }

        // 4. Renderizar
        renderProducto(
            producto,
            productos,
            esPokemon,
            idsReserva.has(producto.id),
            idsReserva,
            llegadasReserva[producto.id] || '',
            adelantosReserva[producto.id]
        );
        mostrarContenido();

    } catch (error) {
        console.error('Error cargando el producto:', error);
        mostrarError();
    }
}

// Ejecutar cuando el DOM esté listo
document.addEventListener('DOMContentLoaded', init);
