# Dvolada · Fase 3 y preparación para una cuenta Cloudflare independiente
Actualizado: 20 noviembre 2026.

**Destino:** Nexora Systems / Dvolada, independiente de SIAC, Sindex, Lotigest y Nexora Control.
**Objetivo:** preparar código y CI sin cuentas, desplegar staging solo cuando el propietario cree las cuentas, y mantener cerradas las operaciones reales hasta QA.

## Qué existe ahora (sin crear cuentas)
- GitHub Pages conserva la **demostración** actual. No usarla para pedidos reales.
- Rama `prelaunch/phase-1-audit-theme`: colores oficiales uniformes y pruebas visuales automatizadas.
- Rama `prelaunch/phase-2-worker-d1`: Worker API + tablas SQLite/D1, verificación de permisos, sesiones, productos, pedidos, PIN, idempotencia y pruebas.
- Rama `prelaunch/phase-3-live-integration`: integración alternativa para el modo real, autenticación Firebase email verificado, cuatro vistas por rol, centro de control, incorporación de negocios y menús, repartidores independientes aceptan/rechazan, construcción PWA en raíz.
- PR #75, #76 y #77 en borrador. **No fusionar ni desplegar a producción** antes de terminar verificación de staging; #77 incluye cambios anteriores porque deriva de ellos.
- El backend se construye con `cf deploy --mode staging --dry-run` desde `backend/`. CI ejecuta migraciones con SQLite real y pruebas de cada endpoint, además de la compilación de demo y modo real.
- **Sin cuentas conectadas:** no hay ningún Worker, D1 ni Firebase de Dvolada aprovisionado, y no se ha validado una sesión de cliente real.

## Primera sesión después de crear las cuentas
1. Crear una **cuenta Cloudflare exclusiva de Dvolada**, confirmar el correo y habilitar MFA en administradores. No reutilizar la cuenta/bases de datos de otro software Nexora.
2. Crear un **proyecto Firebase exclusivo de Dvolada**, habilitar Authentication → correo/contraseña y verificación por correo. Autorizar el dominio de staging y, después, el dominio real. Nunca reutilizar el Firebase de Nexora Control.
3. Conectar ambos servicios a ChatGPT/Work si está disponible y otorgar acceso a GitHub `dvoladanexora/DVolada-3.0.`; verificar que la cuenta seleccionada es la correcta antes de cualquier escritura.
4. Crear D1 independientes **dvolada-staging** y **dvolada-prod**. Documentar ambos IDs en una configuración segura, no en textos públicos. Mantener producción vacía hasta pasar staging.
5. En `backend/cloudflare.config.ts`, reemplazar `FIREBASE_PROJECT_ID='dvolada-not-configured'` por el ID del proyecto correcto; configurar `CORS_ORIGINS` para los orígenes HTTPS autorizados. No usar comodines ni `https://dvolada.example.invalid`.
6. Configurar por separado los secretos **SESSION_PEPPER** y **PIN_SECRET** mediante el panel Cloudflare o el mecanismo seguro `cf`. Generar valores aleatorios distintos de al menos 32 bytes, sin mostrarlos aquí, sin pegarlos en GitHub o archivos públicos.
7. Aplicar migraciones sobre **staging únicamente primero**, verificando siempre ID de base y resultado. El esquema está en `backend/migrations/0001..` a `0006..`. El comando de referencia `cf d1 migrations apply <DATABASE_ID> --dir migrations` se ejecuta desde `backend/` y **usa el ID real**; probar cambios localmente con `--local` cuando corresponda.
8. Ejecutar `npm install`, `npm test`, `npm run deploy:dry` en `backend/`; después publicar **solo staging** con `npm run deploy:staging` para la cuenta verificada.
9. Configurar el frontend con las variables públicas de `.env.example`: `VITE_DVOLADA_LIVE_MODE=true`, `VITE_DVOLADA_API_URL` (Worker staging HTTPS), `VITE_DVOLADA_FIREBASE_API_KEY`, `VITE_DVOLADA_FIREBASE_AUTH_DOMAIN`, `VITE_DVOLADA_FIREBASE_PROJECT_ID`, `VITE_DVOLADA_FIREBASE_APP_ID`. Son identificadores públicos de configuración, no los secretos del Worker. Para construir: `npm run build`. Su modo real usa `/` y `manifest-live.webmanifest`; la demo mantiene `/DVolada-3.0./`.
10. Publicar la **PWA real de staging** en un host estático separado con HTTPS. No reemplazar GitHub Pages de la demo mientras se validan las cuentas, CORS, manifest, service worker y navegación.

## Aprovisionamiento autorizado
- Una cuenta nueva de Firebase puede registrarse y verificar su email; el Worker le otorga solo rol **customer**. No puede convertirse a sí misma en gerente, repartidor o admin.
- **Primeros dos administradores de Nexora:** después de verificar correo y obtener su ID UUID en `/api/v1/auth/me`, un operador confiable con acceso a la **base D1 staging** debe autorizar el rol `platform_admin` de cada cuenta mediante una migración/procedimiento de bootstrap auditado. No habilitar este privilegio por una petición pública de cliente.
- Desde Centro de Control: crear restaurante (inactivo/cerrado por defecto); verificar condiciones contractuales; activar suscripción; vincular dueño o empleados mediante UUID de usuario verificado; habilitar repartidor independiente.
- El dueño/gerente carga productos y precios en centavos de lempira, administra disponibilidad y abre el restaurante para vender. La API calcula totales y comprueba cambios de precio en la base de datos.
- Un restaurante asigna un repartidor; el repartidor debe **aceptar o rechazar** antes de recoger. Máximo dos pedidos activos, impuesto desde D1.
- Cliente solo ve su historial y su PIN de entrega. El repartidor recibe el PIN del cliente al llegar. Para recogida en mostrador, un empleado autorizado confirma la entrega.

## Pruebas obligatorias en Cloudflare REAL antes de producción
- [ ] Registro e inicio de sesión Firebase con correo verificado en Android, iPhone y PC.
- [ ] Correo no verificado/usuario suspendido no puede obtener sesión; bloqueo por rate limit; revocación de sesión.
- [ ] Dos restaurantes sin acceso cruzado a pedidos, clientes, menús, miembros ni tarifas.
- [ ] Dos empleados simultáneos y conflicto 409; idempotencia al perder internet/reintentar; cero pedidos duplicados.
- [ ] Cliente crea pedido con precio de servidor, ve historial, cancela a tiempo; cocina acepta y prepara.
- [ ] Un repartidor puede aceptar/rechazar; límite de dos pedidos; recogida, trayecto y PIN; no se puede eludir confirmación.
- [ ] Pickup completo sin un repartidor.
- [ ] Cloudflare API y D1 real (SQL de 6 migraciones, aislamiento, errores, índices, logs sin datos sensibles).
- [ ] Samsung S23 Ultra y S24 Ultra: **mismo naranja oficial**, y tema claro/oscuro idéntico.
- [ ] Experiencia real de PWA (instalación y reconexión), menús, fotos de productos, botones, búsqueda y capacidad de cocina.
- [ ] Conexiones cortadas, Worker caído, pedidos pendientes de sincronización y cierres/reaperturas; comprobar comportamiento sin datos inventados.
- [ ] Pruebas de carga, costos, alertas, respaldos D1, permisos CI y rollback.
- [ ] Validación comercial: pagos, transferencias, reparto de comisiones, cupones, tarifario por zona y conciliación. **No hay cobro electrónico real implementado aún**.
- [ ] Aprobación de ambos administradores de Nexora y revisión final con Work.

## Operaciones bloqueadas
- `ORDER_CREATION_ENABLED` permanece en **false** por defecto. Solo habilitarlo después de completar pruebas críticas en staging.
- El modo real no se activa automáticamente por usar GitHub Pages. Necesita `VITE_DVOLADA_LIVE_MODE=true` en una compilación explícita.
- Los datos de demo (`localStorage`) y el prototipo Node/PostgreSQL (`server/`) **no se migran automáticamente** a la base D1 real.
- No procesar tarjetas, cobros, comisiones automáticas ni datos personales reales sin reglas y pruebas completadas.
- Los tokens de sesión son volátiles en memoria; al recargar la web se vuelve a verificar Firebase. No copiar tokens a `localStorage`.
- El backend no consulta la revocación remota de Firebase en cada petición; sesiones Worker duran máximo 12 horas. Ante cuentas comprometidas, revocar sesiones D1 y desactivar al usuario.

## ¿Cuándo Dvolada está verdaderamente al 100%?
La meta de lanzamiento es el **1 diciembre 2026**, pero NO es una promesa técnica. La fase 3 entrega integración y documentación listas para conectarse y probarse; **sin cuenta Cloudflare y Firebase todavía no existe validación real en internet**, y la integración actual cubre los flujos básicos Online (no todos los módulos Local/Plus, anuncios, chat, facturación o pasarela). Una compilación CI verde no sustituye esas pruebas.

Referencias técnicas: Cloudflare cf y D1 https://developers.cloudflare.com/cf/ y https://developers.cloudflare.com/d1/ ; Firebase Auth https://firebase.google.com/docs/auth/admin/verify-id-tokens .
