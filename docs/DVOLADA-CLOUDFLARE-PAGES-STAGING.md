# Dvolada — PWA HTTPS para OneSignal (21 noviembre 2026)

## Resultado real en Cloudflare

- Cuenta: **dvoladanexora@gmail.com** (exclusiva de Dvolada).
- Proyecto Pages creado en modo **Direct Upload**: `dvolada-web-staging`.
- **URL estable para OneSignal Site URL**: `https://dvolada-web-staging.pages.dev`.
- Despliegue confirmado por Cloudflare API: `db7d6d0f-7737-434a-9333-51061595da65`.
- URL inmutable de despliegue: `https://db7d6d0f.dvolada-web-staging.pages.dev`.
- Cloudflare API confirmó fase de despliegue `success` el 21 noviembre 2026.
- Cloudflare Pages rechazó la creación con integración Git por error 8000011 (Git installation issue), así que se creó el **sitio de staging por Direct Upload**. Este proyecto **no tiene CI/CD automático con GitHub**; actualizar `staging/onesignal-site-worker.js` no actualiza el Pages publicado hasta efectuar otro Direct Upload.
- No se pudo verificar la respuesta HTTPS pública del sitio desde el navegador de las herramientas; debe probarse en Chrome/Samsung antes de registrar notificaciones.

## Qué hay en la PWA desplegada

Se publicó la **vista preliminar de staging**, implementada en `staging/onesignal-site-worker.js`, NO el bundle final React de Dvolada. No se publicó `main`; no hay activación de pedidos.

- Pantalla móvil y escritorio con branding de Dvolada y aviso explícito **PRELANZAMIENTO**.
- Lectura del catálogo remoto desde `dvolada-api-staging.dvoladanexora.workers.dev`, con estados de conexión y menús de negocios.
- Manifest instalable `/manifest.webmanifest` y SW PWA raíz `/sw.js`, sin cobros ni checkout.
- OneSignal SW `/push/onesignal/OneSignalSDKWorker.js`, con scope separado `/push/onesignal/`.
- Botón de permiso push preparado, **desactivado** hasta colocar el App ID público de OneSignal.
- Endpoint `/push-config` que obtiene el App ID de `ONESIGNAL_APP_ID` como variable **no secreta** de Cloudflare Pages.
- `/health` devuelve `checkoutEnabled:false`.
- Los íconos y el logo se solicitan desde los assets oficiales de la versión GitHub Pages de Dvolada. Comprobar que las rutas devuelvan imágenes en Chrome antes de activarlas en el dashboard de OneSignal.

## CORS y seguridad

- Worker `dvolada-api-staging` actualizado (vía Cloudflare API) para permitir `http://localhost:5173` y exactamente `https://dvolada-web-staging.pages.dev`.
- Binding `DB` sigue apuntando exclusivamente a `dvolada-staging`; secretos `SESSION_PEPPER` y `PIN_SECRET` permanecen en el Worker; `ORDER_CREATION_ENABLED=false`.
- CORS también persistido en `backend/cloudflare.config.ts` de la rama de pruebas.
- La vista pública no permite introducir PIN, credenciales ni crear pedidos; nunca agrega pedidos ficticios en D1.
- `/robots` tiene meta `noindex,nofollow`; el sitio puede verse públicamente si alguien conoce el enlace. No almacena datos personales.

## OneSignal: paso que falta al propietario

El propietario ya creó la organización y la aplicación **Dvolada App** en OneSignal Free.

En el formulario **Site setup**:

1. **Site name**: Dvolada App.
2. **Site URL**: `https://dvolada-web-staging.pages.dev`.
3. **Default icon URL**: opcional. Usar logo oficial servido por HTTPS si se valida su disponibilidad. No generar otro logo.
4. **Auto resubscribe**: activado.
5. **Safari certificate**: desactivado (a menos que se necesite Safari 15 o anterior).
6. Pulsar **Save**.
7. Abrir **Settings > Keys & IDs** y copiar SOLO el **App ID** (identificador público). No compartir claves REST API ni de cuenta.

Cuando el App ID esté disponible, almacenarlo como variable de texto `ONESIGNAL_APP_ID` en el proyecto Pages, completar la vinculación OneSignal al backend y probar permisos en Chrome Samsung. Si se usara otro dominio para producción, debe planificarse la migración de suscriptores y el cambio de Site URL; no debe asumirse que el origen es intercambiable.

## Pendiente para lanzamiento

- Reemplazar la vista preliminar por el bundle **completo** de React del modo Live y su mismo origen, tras solucionar la conexión Git o automatizar compilado + Direct Upload.
- Implementar acceso propio de clientes, invitados, repartidores y restaurantes; teléfono obligatorio al comprar. **No usar SMS/OTP pagado por ahora**. La antigua regla D1 de `0007_customer_phones.sql` aún **bloquea compras sin teléfono verificado** y debe actualizarse en una migración posterior con controles antiabuso antes de habilitar pedidos.
- Unir identidad de la sesión con cada OneSignal Subscription ID; no enviar alertas de pedidos a usuarios ajenos.
- Vincular los eventos de pedidos al despacho push desde Worker, incluyendo idempotencia, reintentos y controles de entrega.
- Configurar de manera segura clave REST API en servidor solamente, si la integración lo necesita, y probar en dispositivos.
- Comprobar URL pública de Pages, /health, /manifest.webmanifest y servicio OneSignal desde un navegador real.
- No activar `ORDER_CREATION_ENABLED` ni `PUSH_NOTIFICATIONS_ENABLED` hasta terminar pruebas end-to-end.

No se fusionó a main. No se realizó ningún cobro ni se conectó OneSignal todavía.
