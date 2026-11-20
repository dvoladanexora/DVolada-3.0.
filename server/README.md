# Dvolada Online API — primera implementación aislada

**No desplegado ni conectado al frontend.** API de prueba con Node.js + PostgreSQL, separada del plan Local. La web estática de GitHub Pages no ejecuta este servidor.

## Preparación
1. Crear una base PostgreSQL de pruebas y aplicar **en orden** `sql/001_online_core.sql` y `sql/002_restaurant_membership.sql`. Sin la segunda migración la API no puede autenticar empleados.
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
- Generar y versionar lockfiles de dependencias (frontend y servidor) antes del despliegue, activar controles de vulnerabilidades y CI de auditoría. El flujo CI actual usa `npm install` porque todavía no hay lockfile reproducible.
