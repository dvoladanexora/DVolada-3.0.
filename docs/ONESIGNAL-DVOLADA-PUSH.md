# Dvolada – OneSignal Web Push gratis (20 noviembre 2026)

## Estado

Preparación en **rama prelaunch/phase-3-live-integration**, PR #77, **sin fusionar a main ni activar ningún envío**.
- [x] Cliente web SDK v16, cargado solo cuando el usuario pulsa el botón, sin solicitud automática.
- [x] Botón opt-in «Notificarme» y «Silenciar» para usuario.
- [x] Service Worker independiente: `/push/onesignal/OneSignalSDKWorker.js`, ámbito `/push/onesignal/`; **no sustituir `/sw.js`** de Dvolada.
- [x] Código servidor `backend/src/onesignal-push.js` para API REST, restringido a suscripciones explícitas autorizadas por servidor y eventos de pedido definidos. Sin broadcast y con clave de API únicamente en el Worker.
- [x] En la configuración Cloudflare `PUSH_NOTIFICATIONS_ENABLED=false` por defecto. Sin notificaciones ni gastos hasta autorización.
- [x] El propietario creó la cuenta OneSignal Free y la aplicación **Dvolada App**. Se desplegó la URL de pruebas `https://dvolada-web-staging.pages.dev`; resta guardarla como Site URL en OneSignal y copiar el App ID público.
- [ ] Configurar secreto REST API key **directamente** en Cloudflare (no en GitHub ni en chat), enlazar suscripciones a sesiones de usuario, restaurante y repartidor, y activar despachos solamente después de pruebas de propiedad.
- [ ] Conectar los eventos reales de pedido con la función de envío una vez que se terminen sesiones y checkout. Las transiciones NO emiten push automáticamente todavía.
- [ ] Comprobar en Chrome Android, Samsung Internet y iPhone con iOS >=16.4, PWA instalada; también revocación de permisos, logout, pérdida de red y duplicados.

## Pasos que debe hacer el propietario de Dvolada

1. Abrir https://onesignal.com/ y crear cuenta **Free** usando `dvoladanexora@gmail.com` (puede usar contraseña exclusiva y 2FA).
2. Crear aplicación OneSignal **Dvolada Web Staging**. Tipo de plataforma: **Web**. Integración: **Custom Code**.
3. URL HTTPS de la vista PWA de pruebas: **`https://dvolada-web-staging.pages.dev`**. El sitio no es la API `dvolada-api-staging.dvoladanexora.workers.dev`. Consultar `docs/DVOLADA-CLOUDFLARE-PAGES-STAGING.md`.
4. En OneSignal, formulario **Site setup**, introducir **Site URL** `https://dvolada-web-staging.pages.dev`, dejar Auto resubscribe activado y presionar Save. No configurar el enlace del Worker API como Site URL.
5. Copiar el **App ID público** (UUID) de Settings > Keys & IDs. Para compilar frontend Live, agregar: `VITE_ONESIGNAL_APP_ID=<APP_ID>`. Este ID no es secreto.
6. Crear una **REST API Key** de OneSignal de permisos mínimos, guardar el valor **únicamente** como secreto `ONESIGNAL_REST_API_KEY` dentro del Worker Cloudflare correspondiente. **Nunca enviar el valor por chat, subirlo a GitHub, guardar en localStorage ni ponerlo en `VITE_`**.
7. Al probar en un dominio de producción distinto, usar otra aplicación OneSignal con el origen de producción, para no mezclar suscriptores de pruebas y clientes.
8. Solo después de las pruebas de identidad, enviar la configuración de envío `ONESIGNAL_APP_ID` y habilitar `PUSH_NOTIFICATIONS_ENABLED=true` con aprobación explícita.

## Notificaciones Dvolada

- Al cliente: aceptado, preparando, listo, recogido, en camino, en ubicación, entregado/cancelado.
- Al restaurante: nuevo pedido o incidencia del pedido de su tienda.
- Al repartidor: solicitud nueva, asignación/cancelación y entrega.
- Reglas: cada evento se envía únicamente a dispositivos autorizados de ese usuario/negocio. **No fiarse de identificadores de suscripción que entregue el navegador**. Vincularlos con una sesión auténtica y autorización comprobada por servidor. Para usuarios invitados, establecer primero una sesión segura asociada a un pedido.
- Notificación contiene solo texto genérico y número de pedido; no teléfonos, dirección ni PIN.
- El usuario debe pulsar «Notificarme» y conceder permiso en el dispositivo. No mostrar permiso automáticamente al visitar el sitio.

## Requisitos técnicos y costes

- OneSignal Free: **10,000 suscriptores de web push como máximo por envío**, contactos registrados ilimitados, disponible para la PWA. El límite **no** es 10,000 notificaciones en total.
- OneSignal Growth: desde **US$19/mes** + **US$0.004 por suscriptor web push**, según https://onesignal.com/pricing consultado 2026-11-20.
- iOS: Web Push solo desde iOS/iPadOS 16.4 y agregando el sitio a pantalla de inicio. La versión exacta del sistema y los permisos importan.
- OneSignal necesita HTTPS y el worker en **el mismo origen del frontend**.
- La PWA y el worker de API de Cloudflare pueden estar en distintos subdominios; el worker OneSignal vive con el frontend.

Documentación oficial:
- https://documentation.onesignal.com/docs/en/web-sdk-setup
- https://documentation.onesignal.com/docs/en/onesignal-service-worker
- https://documentation.onesignal.com/docs/en/web-sdk-reference
- https://documentation.onesignal.com/reference/create-message

## Importante

*No* activar notificaciones de pedidos reales hasta que Dvolada tenga autenticación/sesiones seguras para invitado, cliente, restaurante y repartidor. Se decidió no contratar OTP/SMS pagado por ahora. El teléfono puede recopilarse sin OTP, pero eso **no equivale a verificarlo** y se necesitan controles contra pedidos fraudulentos antes del lanzamiento. El staging permanece bloqueado a compras por la regla D1 de teléfono verificado; esta deberá cambiar con una migración auditada cuando exista el nuevo método seguro de pedidos.
