# Anime2Chile — Mercado Pago Checkout Pro

Tienda estática + backend **Express** (Hostinger Node.js / localhost) con pago real vía **Mercado Pago Checkout Pro**.

## Requisitos

- Node.js 20 LTS o superior
- Cuenta de Mercado Pago (credenciales de prueba y luego producción)
- Proyecto Firebase con Firestore + **service account** (Admin SDK)

## Variables de entorno

Copia `.env.example` a `.env` y completa:

```bash
cp .env.example .env
```

| Variable | Uso |
|----------|-----|
| `MP_ACCESS_TOKEN` | Secreto. Solo backend. `TEST-...` en pruebas, `APP_USR-...` en prod |
| `MP_PUBLIC_KEY` | Pública. Se expone al frontend vía `GET /api/config` |
| `BASE_URL` | `http://localhost:3000` en local; `https://tudominio.cl` en prod (sin `/` final) |
| `PORT` | Puerto del servidor (Hostinger suele inyectarlo) |
| `FIREBASE_SERVICE_ACCOUNT_PATH` | Local: ruta al JSON de la service account (ej. `./serviceAccount.json`) |
| `FIREBASE_SERVICE_ACCOUNT` | Hostinger/prod: JSON completo en una sola línea (si no usas PATH) |

## Cómo correrlo en localhost

```bash
npm install
cp .env.example .env
# Edita .env con tus credenciales TEST y el JSON de Firebase
npm start
```

Abre [http://localhost:3000](http://localhost:3000).

Comprueba salud del servidor: [http://localhost:3000/api/health](http://localhost:3000/api/health).

### Webhooks en local

Mercado Pago no puede llamar a `localhost`. Para probar el webhook:

1. Expón el puerto con [ngrok](https://ngrok.com/) u similar: `ngrok http 3000`
2. Pon esa URL HTTPS en `BASE_URL` (ej. `https://abc123.ngrok-free.app`)
3. Reinicia el servidor para que `notification_url` y `back_urls` usen esa base

Sin ngrok aún puedes probar la **creación de preferencia** y el checkout; el marcado a `pagado` llegará cuando el webhook sea alcanzable.

Notas técnicas en local (`http://`):

- `notification_url` solo se envía a MP si `BASE_URL` no es localhost (MP no puede llamarte)
- `auto_return: "approved"` solo se envía si `BASE_URL` usa `https://` (con ngrok queda activo)

## Credenciales de prueba (TEST-)

1. Entra a [Mercado Pago Developers](https://www.mercadopago.cl/developers)
2. Crea o elige tu aplicación
3. En **Credenciales de prueba** copia:
   - Access Token → `MP_ACCESS_TOKEN`
   - Public Key → `MP_PUBLIC_KEY`

### Tarjetas de prueba (Chile)

Usa las tarjetas documentadas por Mercado Pago para el país (pueden actualizarse). Referencia oficial:

[Tarjetas de prueba — Mercado Pago](https://www.mercadopago.cl/developers/es/docs/checkout-pro/additional-content/test-cards)

Ejemplos habituales (verifica en la doc vigente):

- **Aprobado:** Mastercard `5031 7557 3454 0604`, CVV `123`, vencimiento cualquier fecha futura
- **Rechazado:** usa las variantes de rechazo de la misma documentación
- Titular / DNI: los que indique el simulador de prueba

En sandbox el servidor redirige a `sandbox_init_point` cuando el Access Token empieza con `TEST-`.

## Flujo de pago

1. El frontend envía solo `id`, `cantidad`, cupón, tipo de envío y datos del cliente
2. El servidor recalcula precios desde `productos.json` + `productos-pokemon.json`
3. Crea el pedido en Firestore con estado `pendiente_pago` (Firebase Admin)
4. Crea la preferencia Checkout Pro y devuelve `init_point`
5. El cliente paga en Mercado Pago
6. El webhook consulta el pago real; si `approved` y el pedido no estaba `pagado`, lo marca `pagado` (idempotente)

Los correos con Nodemailer están preparados como comentario en el webhook (siguiente etapa).

## Qué cambiar al pasar a producción

1. Sustituye `MP_ACCESS_TOKEN` y `MP_PUBLIC_KEY` por las **credenciales de producción** (`APP_USR-...`)
2. `BASE_URL=https://tudominio.cl` (HTTPS, sin barra final)
3. En el panel de Mercado Pago, configura la URL de notificaciones si aplica: `https://tudominio.cl/api/webhook`
4. Restringe las reglas de Firestore: **deja de permitir escrituras de pedidos desde el cliente**; solo el Admin SDK del servidor debe crear/actualizar pedidos
5. Prueba un pago real de monto bajo antes de anunciar

## Despliegue en Hostinger (Node.js Web App)

1. Sube el proyecto (Git o file manager), **sin** subir `.env` ni el JSON de la service account como archivo
2. En el panel de la app Node.js:
   - **Entry point / start:** `npm start` (o `node server.js`)
   - Define las mismas variables de entorno del `.env`
   - Local: `FIREBASE_SERVICE_ACCOUNT_PATH=./serviceAccount.json`
   - Hostinger: pega el JSON en `FIREBASE_SERVICE_ACCOUNT` (una línea); no hace falta el archivo
3. Asegúrate de que el puerto use `process.env.PORT` (ya está en `server.js`)
4. `BASE_URL` debe ser la URL pública HTTPS de tu sitio
5. Reinicia la app y visita `/api/health`

No uses carpeta `/api` estilo Vercel ni serverless: este proyecto es un **proceso Express persistente**.

## Estructura relevante

```
server.js                 # Express: estáticos + preferencia + webhook
productos.json            # Fuente de precios (figuras)
productos-pokemon.json    # Fuente de precios (Pokémon)
checkout.html             # Formulario → POST /api/crear-preferencia
compra-exitosa.html
compra-fallida.html
compra-pendiente.html
gracias.html              # Redirección a compra-exitosa.html
```

## Seguridad

- El Access Token **nunca** va al frontend ni al repo
- Los precios, envío y cupones se validan **solo** en el servidor
- El descuento se reparte en los `unit_price` (CLP entero); el envío va en `shipments.cost`
