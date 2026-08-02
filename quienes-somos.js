// ============================================================
//  quienes-somos.js
//  Contadores, reveal, correo ofuscado y formulario de contacto.
//  No toca carrito ni buscador.
// ============================================================

(function () {
    'use strict';

    // ── Constantes editables ──────────────────────────────────
    // REEMPLAZAR: número real (solo dígitos, con código país, sin +)
    var WHATSAPP_NUMBER = '56912345678';
    // REEMPLAZAR: correo real (partes separadas anti-scraping)
    var CONTACT_EMAIL_USER = 'hola';
    var CONTACT_EMAIL_DOMAIN = 'anime2chile.cl';

    function prefersReducedMotion() {
        return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    }

    // ── WhatsApp + correo ofuscado ────────────────────────────

    function initContactChannels() {
        var waLink = document.getElementById('qs-whatsapp-link');
        var waDisplay = document.getElementById('qs-whatsapp-display');
        if (waLink) {
            waLink.href = 'https://wa.me/' + WHATSAPP_NUMBER;
        }
        if (waDisplay) {
            var digits = WHATSAPP_NUMBER.replace(/\D/g, '');
            var local = digits.slice(-8);
            var formatted = '+56 9 ' + local.slice(0, 4) + ' ' + local.slice(4);
            waDisplay.textContent = formatted;
        }

        var email = CONTACT_EMAIL_USER + '@' + CONTACT_EMAIL_DOMAIN;
        var emailLink = document.getElementById('qs-email-link');
        if (emailLink) {
            emailLink.textContent = email;
            emailLink.href = 'mailto:' + email;
        }
    }

    // ── Reveal on scroll ──────────────────────────────────────

    function initReveal() {
        var nodes = document.querySelectorAll('.qs-reveal');
        if (!nodes.length) return;

        if (prefersReducedMotion()) {
            nodes.forEach(function (el) { el.classList.add('qs-reveal--visible'); });
            return;
        }

        var observer = new IntersectionObserver(function (entries) {
            entries.forEach(function (entry) {
                if (entry.isIntersecting) {
                    entry.target.classList.add('qs-reveal--visible');
                    observer.unobserve(entry.target);
                }
            });
        }, { threshold: 0.12, rootMargin: '0px 0px -40px 0px' });

        nodes.forEach(function (el) { observer.observe(el); });
    }

    // ── FAQ accordion ─────────────────────────────────────────

    function initFaq() {
        var list = document.querySelector('.qs-faq-list');
        if (!list) return;

        var items = list.querySelectorAll('.qs-faq-item');

        function setOpen(item, open) {
            var btn = item.querySelector('.qs-faq-trigger');
            var panel = item.querySelector('.qs-faq-panel');
            if (!btn || !panel) return;

            btn.setAttribute('aria-expanded', open ? 'true' : 'false');

            if (open) {
                panel.hidden = false;
                // Forzar reflow para que la transición 0fr → 1fr se anime
                void panel.offsetHeight;
                item.classList.add('is-open');
            } else if (item.classList.contains('is-open')) {
                item.classList.remove('is-open');
                var delay = prefersReducedMotion() ? 0 : 320;
                window.setTimeout(function () {
                    if (!item.classList.contains('is-open')) panel.hidden = true;
                }, delay);
            }
        }

        items.forEach(function (item) {
            var btn = item.querySelector('.qs-faq-trigger');
            if (!btn) return;

            btn.addEventListener('click', function () {
                var willOpen = !item.classList.contains('is-open');
                // Una abierta a la vez
                items.forEach(function (other) {
                    setOpen(other, other === item ? willOpen : false);
                });
            });
        });
    }

    // ── Contadores animados ───────────────────────────────────

    function animateCount(el, target, suffix, duration) {
        if (prefersReducedMotion()) {
            el.textContent = target + (suffix || '');
            return;
        }

        var start = 0;
        var startTime = null;

        function tick(ts) {
            if (!startTime) startTime = ts;
            var progress = Math.min((ts - startTime) / duration, 1);
            var eased = 1 - Math.pow(1 - progress, 3);
            var value = Math.round(start + (target - start) * eased);
            el.textContent = value + (suffix || '');
            if (progress < 1) requestAnimationFrame(tick);
        }

        requestAnimationFrame(tick);
    }

    function initStats() {
        var stats = document.querySelectorAll('.qs-stat-value[data-target]');
        if (!stats.length) return;

        var observer = new IntersectionObserver(function (entries) {
            entries.forEach(function (entry) {
                if (!entry.isIntersecting) return;
                var el = entry.target;
                var target = parseInt(el.getAttribute('data-target'), 10) || 0;
                var suffix = el.getAttribute('data-suffix') || '';
                animateCount(el, target, suffix, 1400);
                observer.unobserve(el);
            });
        }, { threshold: 0.4 });

        stats.forEach(function (el) { observer.observe(el); });
    }

    // ── Formulario ────────────────────────────────────────────

    /**
     * Punto de envío aislado.
     * TODO: conectar backend (Formspree / Vercel Function / Resend).
     * Por ahora simula el envío con un timeout. No inventes endpoints.
     * @param {Object} payload
     * @returns {Promise<{ok: boolean, message?: string}>}
     */
    function submitContactForm(payload) {
        return new Promise(function (resolve) {
            // Honeypot: si viene lleno, fingimos éxito sin enviar
            if (payload.website) {
                setTimeout(function () {
                    resolve({ ok: true, message: '¡Mensaje enviado! Te responderemos pronto.' });
                }, 600);
                return;
            }

            // Simulación — reemplazar por fetch real cuando haya backend
            setTimeout(function () {
                console.info('[contacto] payload listo para backend:', payload);
                resolve({ ok: true, message: '¡Mensaje enviado! Te responderemos pronto.' });
            }, 900);
        });
    }

    function setFieldError(id, message) {
        var input = document.getElementById(id);
        var err = document.getElementById(id + '-error');
        if (input) input.classList.toggle('qs-invalid', !!message);
        if (err) err.textContent = message || '';
    }

    function validateForm(form) {
        var ok = true;
        var nombre = form.nombre.value.trim();
        var email = form.email.value.trim();
        var asunto = form.asunto.value;
        var mensaje = form.mensaje.value.trim();

        setFieldError('qs-nombre', '');
        setFieldError('qs-email', '');
        setFieldError('qs-asunto', '');
        setFieldError('qs-mensaje', '');

        if (nombre.length < 2) {
            setFieldError('qs-nombre', 'Ingresa tu nombre (mín. 2 caracteres).');
            ok = false;
        }

        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
            setFieldError('qs-email', 'Ingresa un correo válido.');
            ok = false;
        }

        if (!asunto) {
            setFieldError('qs-asunto', 'Selecciona un asunto.');
            ok = false;
        }

        if (mensaje.length < 10) {
            setFieldError('qs-mensaje', 'Cuéntanos un poco más (mín. 10 caracteres).');
            ok = false;
        }

        return ok;
    }

    function initForm() {
        var form = document.getElementById('qs-contact-form');
        if (!form) return;

        var btn = document.getElementById('qs-submit-btn');
        var label = btn && btn.querySelector('.qs-submit-label');
        var loading = btn && btn.querySelector('.qs-submit-loading');
        var status = document.getElementById('qs-form-status');

        ['qs-nombre', 'qs-email', 'qs-asunto', 'qs-mensaje'].forEach(function (id) {
            var el = document.getElementById(id);
            if (!el) return;
            el.addEventListener('input', function () { setFieldError(id, ''); });
            el.addEventListener('change', function () { setFieldError(id, ''); });
        });

        form.addEventListener('submit', function (e) {
            e.preventDefault();
            if (!validateForm(form)) return;

            var payload = {
                nombre: form.nombre.value.trim(),
                email: form.email.value.trim(),
                asunto: form.asunto.value,
                mensaje: form.mensaje.value.trim(),
                website: form.website ? form.website.value : ''
            };

            if (btn) {
                btn.disabled = true;
                btn.classList.add('is-loading');
            }
            if (label) label.hidden = true;
            if (loading) loading.hidden = false;
            if (status) {
                status.hidden = true;
                status.className = 'qs-form-status';
            }

            submitContactForm(payload).then(function (result) {
                if (status) {
                    status.hidden = false;
                    status.textContent = result.message || (result.ok
                        ? '¡Mensaje enviado! Te responderemos pronto.'
                        : 'No pudimos enviar el mensaje. Intenta de nuevo.');
                    status.className = 'qs-form-status ' + (result.ok ? 'qs-form-status--ok' : 'qs-form-status--err');
                }
                if (result.ok) form.reset();
            }).catch(function () {
                if (status) {
                    status.hidden = false;
                    status.textContent = 'No pudimos enviar el mensaje. Intenta de nuevo o escríbenos por WhatsApp.';
                    status.className = 'qs-form-status qs-form-status--err';
                }
            }).finally(function () {
                if (btn) {
                    btn.disabled = false;
                    btn.classList.remove('is-loading');
                }
                if (label) label.hidden = false;
                if (loading) loading.hidden = true;
            });
        });
    }

    document.addEventListener('DOMContentLoaded', function () {
        initContactChannels();
        initReveal();
        initStats();
        initFaq();
        initForm();
    });
})();
