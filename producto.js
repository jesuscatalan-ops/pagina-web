// ============================================================
//  producto.js
//  Lee ?id=PRODUCTO_ID de la URL, carga productos.json
//  y renderiza la página de producto dinámica.
// ============================================================

// ── Utilidades ──────────────────────────────────────────────

/** Formatea un número como precio chileno: 89990 → "$89.990" */
function formatearPrecio(numero) {
    return '$' + numero.toLocaleString('es-CL');
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
}

function mostrarContenido() {
    document.getElementById('estado-cargando').style.display  = 'none';
    document.getElementById('estado-error').style.display     = 'none';
    document.getElementById('producto-contenido').style.display = 'block';
}

// ── Render principal ─────────────────────────────────────────

function renderProducto(producto, todosLosProductos, esPokemon = false) {

    /* ---------- <title> ---------- */
    document.title = producto.nombre + ' — Anime2Chile';

    /* ---------- Breadcrumb ---------- */
    document.getElementById('breadcrumb-nombre').textContent = producto.nombre;

    /* ---------- Imagen principal ---------- */
    const imgEl = document.getElementById('producto-imagen-principal');

    if (producto.imagen) {
        // Imagen real: fondo neutro, imagen con object-fit contain
        imgEl.className = 'product-main-img';
        imgEl.style.cssText = '';
        imgEl.innerHTML = `<img
            class="product-img-real"
            src="${producto.imagen}"
            alt="${producto.nombre}"
            loading="lazy">`;
    } else {
        // Placeholder con gradiente
        imgEl.className = 'product-main-img tiene-placeholder';
        imgEl.style.cssText = `background:${producto.gradiente};`;
        const lineas = producto.placeholder.split('\n');
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
                <img src="${src}" alt="${producto.nombre} — foto ${i + 1}" loading="lazy">
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
        const lineas = producto.placeholder.split('\n');
        thumbsEl.innerHTML = `
            <div class="product-thumb active"
                 style="background:${producto.gradiente}; opacity:0.85;
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
            ${producto.badge}
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

    const precioNota = document.getElementById('producto-precio-nota');
    precioNota.textContent = producto.precio >= 80000
        ? '✓ Envío gratis sobre $80.000'
        : 'Envío calculado en el checkout';
    precioNota.style.color = producto.precio >= 80000
        ? 'var(--success)'
        : 'var(--gray)';

    /* ---------- Botón carrito ---------- */
    const btnCarrito = document.getElementById('btn-carrito');
    if (producto.stock === 'out-stock') {
        btnCarrito.textContent = 'AGOTADO';
        btnCarrito.disabled    = true;
        btnCarrito.style.opacity = '0.5';
        btnCarrito.style.cursor  = 'not-allowed';
    } else {
        btnCarrito.setAttribute('data-carrito-id', producto.id);
        btnCarrito.addEventListener('click', () => {
            agregarAlCarrito(producto.id, producto.nombre, producto.precio, producto.imagen || '');
        });
    }

    /* ---------- Tabla de especificaciones ---------- */
    // Si el producto tiene campo "idioma" es Pokémon → solo mostrar idioma
    const esProd = typeof producto.idioma !== 'undefined';
    const specs = esProd
        ? [
            { label: 'IDIOMA', value: producto.idioma || 'Por confirmar' },
          ]
        : [
            { label: 'SERIE',              value: producto.serie },
            { label: 'PARTE',              value: producto.parte },
            { label: 'TIPO',               value: producto.tipo },
            { label: 'FABRICANTE',         value: producto.fabricante },
            { label: 'ALTURA',             value: producto.altura },
            { label: 'MATERIAL',           value: producto.material },
            { label: 'ORIGEN',             value: producto.origen },
            { label: 'BASE DE EXHIBICIÓN', value: producto.baseExhibicion },
            { label: 'ARTICULACIONES',     value: producto.articulaciones },
          ];
    document.getElementById('producto-specs').innerHTML = specs
        .map(s => `
            <div class="product-spec-row">
                <span class="spec-label">${s.label}</span>
                <span class="spec-value">${s.value || 'Por confirmar'}</span>
            </div>
        `).join('');

    /* ---------- Tab Descripción ---------- */
    document.getElementById('tab-desc-texto').textContent = producto.descripcion;

    /* ---------- Tab Especificaciones (lista) ---------- */
    document.getElementById('tab-specs-lista').innerHTML = specs
        .map(s => `<li>${s.label.charAt(0) + s.label.slice(1).toLowerCase()}: ${s.value || 'Por confirmar'}</li>`)
        .join('');

    /* ---------- Productos relacionados ---------- */
    const relGrid = document.getElementById('productos-relacionados');
    const relacionados = (producto.relacionados || [])
        .map(rid => todosLosProductos.find(p => p.id === rid))
        .filter(Boolean)
        .slice(0, 4);

    if (relacionados.length > 0) {
        relGrid.innerHTML = relacionados.map(p => {
            const lineas = p.placeholder.split('\n');
            return `
            <a href="producto.html?id=${p.id}" style="text-decoration:none; color:inherit; display:block;">
                <article class="catalog-card">
                    <div class="catalog-image">
                        <div class="catalog-img-placeholder"
                             style="background:${p.gradiente}; width:100%; height:100%;
                                    display:flex; align-items:center; justify-content:center;">
                            <span class="placeholder-text">${lineas.join('<br>')}</span>
                        </div>
                    </div>
                    <div class="catalog-info">
                        <div class="catalog-meta">
                            <span class="catalog-series">${p.parte}</span>
                            <span class="catalog-stock ${p.stock === 'in-stock' ? 'in-stock' : 'low-stock'}">
                                ${p.stockLabel}
                            </span>
                        </div>
                        <h3 class="catalog-name">${p.nombre}</h3>
                        <p class="catalog-detail">${p.descripcionCorta}</p>
                        <div class="catalog-bottom">
                            <div class="catalog-price">${formatearPrecio(p.precio)}</div>
                        </div>
                    </div>
                </article>
            </a>`;
        }).join('');
    } else {
        document.querySelector('.related-section-title').style.display = 'none';
        relGrid.style.display = 'none';
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

        const [respJojo, respPoke] = await Promise.all([
            fetch('productos.json').catch(() => null),
            fetch('productos-pokemon.json').catch(() => null)
        ]);

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
        renderProducto(producto, productos, esPokemon);
        mostrarContenido();

    } catch (error) {
        console.error('Error cargando el producto:', error);
        mostrarError();
    }
}

// Ejecutar cuando el DOM esté listo
document.addEventListener('DOMContentLoaded', init);
