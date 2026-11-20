# Dvolada Online API — primera implementación aislada

**No desplegado ni conectado al frontend.** API de prueba con Node.js + PostgreSQL, separada del plan Local. La web estática de GitHub Pages no ejecuta este servidor.

## Preparación
1. Crear una base PostgreSQL de pruebas y aplicar **en orden** `sql/001_online_core.sql`, `sql/002_restaurant_membership.sql`, `sql/003_idempotency_retention.sql` y `sql/004_online_event_integrity.sql`. Sin la segunda migración la API no puede autenticar empleados.
2. En `server/`, ejecutar `npm install`.
3. Configurar `DATABASE_URL`, `DVOLADA_JWT_SECRET` (mínimo 32 bytes aleatorios), `DVOLADA_JWT_ISSUER`, `DVOLADA_JWT_AUDIENCE`, `DVOLADA_ALLOWED_ORIGINS` (orígenes HTTPS del frontend separados por comas) y `PORT`. No guardar secretos en Git ni en variables `VITE_*`.
4. Ejecutar `npm run check` y `npm start`.
5. Un servicio de identidad **todavía pendiente** debe emitir JWT HS256 con `sub` UUID de usuario, `restaurant_id` UUID, `iat` y `exp` (vigencia máxima de 1 hora), además de `iss` y `aud`. **No se autorizan acciones con permisos escritos en el JWT**: para cada solicitud se consulta `restaurant_users` y el plan activo en PostgreSQL. Un empleado debe estar `active=true` y tener un rol permitido (`owner`, `manager`, `cashier` o `kitchen`). Las cuentas nuevas comienzan `active=false` y requieren alta autorizada en la base. No emitir tokens en el frontend.

## Implementado en este primer corte
- `GET /health` comprueba la conexión SQL.
- `GET /api/v1/restaurant/capabilities` comprueba membresía activa, rol y plan Online/Plus.
- `GET /api/v1/restaurant/orders` devuelve hasta 100 pedidos del restaurante autenticado.
- `PATCH /api/v1/restaurant/orders/:id/status` exige versión, clave de idempotencia, permisos del rol **en la base de datos**, transición permitida y restaurante del pedido; usa transacción/bloqueo de fila, devuelve 403/409/422 según error. Registra eventos.

## Pendiente antes de producción
- Implementación del proveedor real de identidades, altas/bajas de empleados, recuperación de cuentas, sesiones y rotación de claves. La **revocación de membresía y rol del restaurante** ya se comprueba desde base de datos en cada solicitud.
- Despliegue seguro HTTPS/TLS, protección DDoS/WAF y limitación de solicitudes por cuenta/IP desde el borde, alertas, métricas y auditoría operacional. CORS allowlist y límites de tiempo de solicitud ya están configurados en la API, pero NO reemplazan WAF ni autenticación.
- Cursor paginado real, consulta de eventos y sincronización SSE/polling, recuperación offline, esquema completo de items y pedidos, integración con frontend.
- Pruebas automatizadas, pruebas con dos dispositivos y despliegue del servicio.
- Las rutas de transición de estado son iniciales; revisar flujos de cancelación, entrega y repartidor antes de usarlas en producción.

**No introducir credenciales reales ni datos de clientes en pruebas.**


## Seguridad y alcance antes de cualquier despliegue

- Las migraciones y el código de autorización de este repositorio son **preliminares**; no se han probado con PostgreSQL multiusuario real ni se han conectado a la app React. Ningún endpoint sirve todavía el flujo completo de pedidos y repartidores.
- Empezar con tabla `restaurant_users` **sin usuarios activos**. Crear y revocar membresías únicamente por un panel de gestión autenticado por desarrollar. Cambiar de restaurante debe crear una nueva identidad autorizada; jamás aceptar un ID de restaurante libre enviado desde una pantalla.
- El JWT debe incluir `iat` y `exp`, con vigencia máxima de 3600 s, firma HS256 con secreto aleatorio, emisor/audiencia validada. La membresía y el rol se comprueban **en cada solicitud** en SQL, no en el JWT.
- La matriz inicial limita **Caja** a Pendiente → Aceptado/Rechazado; **Cocina** a Aceptado → Preparando → Listo; propietarios/gerentes a las transiciones implementadas. Repartidores, cancelaciones reales y PIN de entrega todavía no están autorizados por esta API.
- El servicio de mapas carga Leaflet con firmas SRI verificadas en la página oficial; el GPS y rutas externas requerirán consentimiento y una política de privacidad antes de la comercialización.
- Generar y versionar lockfiles de dependencias (frontend y servidor) antes del despliegue, activar controles de vulnerabilidades y CI de auditoría. La rama de auditoría ya contiene `package-lock.json` y `server/package-lock.json`; el CI emplea `npm ci` y audita ambos árboles. No confundir esta validación con integración PostgreSQL real.


## Protección de arranque en producción

- Por defecto la API escucha únicamente en `127.0.0.1:8080` (o `PORT`), **nunca en todas las interfaces**. Para el entorno definitivo, solo después de configurar un proxy HTTPS de confianza, se podrá definir `DVOLADA_BIND_HOST=0.0.0.0` si la arquitectura lo requiere.
- Al usar `NODE_ENV=production` **o al enlazar a una interfaz distinta de loopback**, se obliga a configurar `DVOLADA_PUBLIC_API_ORIGIN` como origen HTTPS público **exacto** (por ejemplo, `https://api.dvolada.example.com`) y `DVOLADA_ALLOWED_ORIGINS` como lista no vacía de orígenes HTTPS del frontend. La API rechaza el arranque sin ambos.
- Esta verificación es **defensa adicional**: una variable de entorno HTTPS no cifra el puerto HTTP de Node por sí sola. Un proxy seguro debe garantizar TLS, autenticación y reglas de borde; impedir que el puerto HTTP quede accesible directamente desde Internet.
- Las pruebas de seguridad de la revisión están en `npm run test:security`; GitHub Actions también ejecuta `npm audit` para impedir publicar dependencias con alertas de severidad alta o crítica.
- El endpoint `GET /health` consolida consultas y usa una caché corta por instancia; no registrar JWT, PIN, direcciones ni mensajes SQL en logs. Los errores 500 incluyen un `requestId` correlacionable con el registro del servidor.
- **No apto todavía para uso comercial:** quedan por integrar el proveedor de identidad, la base multiusuario de pedidos, sincronización, seguridad del PIN y del pago, WAF, backup/restauración y pruebas reales de autorización.

## Mantenimiento de idempotencia y datos
- La migración `003_idempotency_retention.sql` crea `expires_at` con retención inicial de **7 días** e índice de expiración.
- `sql/maintenance_idempotency_cleanup.sql` elimina como máximo 1,000 claves expiradas por ejecución usando `FOR UPDATE SKIP LOCKED`. Debe ejecutarse en una tarea autorizada y monitorizada, nunca desde una solicitud HTTP.
- No elimina pedidos ni eventos; probar la migración y el mantenimiento en PostgreSQL antes de automatizarlos.
- El CI con `npm ci` y auditoría no sustituye pruebas de carga, control de acceso multiusuario ni respaldo/restauración.


## Pruebas de base de datos y aislamiento entre negocios

La rama de auditoría incorpora `npm --prefix server run test:db`: en GitHub Actions inicia **PostgreSQL 16 descartable**, aplica las migraciones y comprueba HTTP real con JWT firmados de prueba. La base está restringida por código a `dvolada_security_test` en `localhost`. Cubre accesos revocados, CORS, aislamiento entre restaurantes, concurrencia, idempotencia, roles y prevención de modificaciones a precios/restaurante.

La migración `004_online_event_integrity.sql` también obliga a que cada evento pertenezca **al mismo restaurante que su pedido** y bloquea versiones de eventos duplicadas mediante índices/clave foránea. Los ensayos intentan insertar explícitamente ambos tipos de datos corruptos y verifican que PostgreSQL los rechace.

**No ejecutar estas pruebas en producción** ni cambiar la condición de la base descartable para apuntarlas a cuentas reales. No confundir estos tests de servidor preliminar con una auditoría de la app comercial integrada.
