# Dvolada Online — backend Cloudflare Workers + D1
**Fase 2 de 3. Código de preparación, no producción. No requiere crear la cuenta de Cloudflare todavía.**

## Qué está implementado
- Worker modular: `src/index.js` (HTTP), `src/security.js` (seguridad), `src/orders.js` (operación).
- Base SQLite/D1 dedicada: `migrations/0001_core.sql` y `0002_checkout_guards.sql`.
- Usuarios y sesiones opacas con token aleatorio y digest HMAC en la base. Revocación inmediata por sesión; no guardar tokens en el navegador permanentemente.
- Aislamiento de restaurantes **por membresía activa en D1**, no por un rol declarado por el navegador; roles de personal owner, manager, kitchen, cashier, y perfil independiente de repartidor.
- Catálogo público, pedidos de clientes, listado/detalle/cambios para restaurante, asignación y seguimiento de repartidor, cancelación temprana, recogida y entrega con PIN de seis dígitos.
- Totales y precios calculados del catálogo del servidor en unidades menores (1 L = 100); el total NO se acepta del cliente.
- Idempotencia obligatoria de operaciones mutantes, versiones con detección de conflicto y auditoría por desencadenadores SQL atómicos. Máximo dos entregas activas por repartidor impuesto desde D1.
- CORS de origen exacto; límite de 60 mutaciones por sesión y minuto; cabeceras anti-caché y anti-filtración; mensajes de error genéricos.
- Guardia de negocio abierto/plan habilitado, producto activo/precio consistente incluso cuando cambia entre el SELECT y el INSERT de un checkout.
- `ORDER_CREATION_ENABLED=false` en el despliegue por defecto. No se abren pedidos reales sin la fase 3.

## Pruebas sin Cloudflare
Desde la raíz del repositorio:
```bash
node --experimental-sqlite --test backend/tests/worker.test.js
```
La suite utiliza `node:sqlite` para ejecutar **las mismas migraciones SQLite** y simula el contrato D1 de `prepare/bind/first/all/run/batch`. Incluye aislamiento entre negocios, precios del servidor, token y permisos, cambios simultáneos, reintentos, PIN, repartidor, cancelación, revocación y guardias de concurrencia.

**Limitación:** SQLite local no reemplaza pruebas de Worker ejecutándose en Cloudflare con D1 real. La compatibilidad final se validará en staging después de crear la cuenta.

## Antes de conectar Cloudflare, fase 3
El frontal actual de GitHub Pages usa datos locales/demostración. **Todavía NO consume esta API**. El prototipo `server/` usa Node.js + PostgreSQL y NO forma parte de este Worker. Mantener ambos aislados.

Faltan pasos esenciales:
1. **Alta e inicio de sesión real:** conectar un proveedor de identidad verificado (OTP/OIDC, consentimiento, recuperación), crear/cancelar sesiones en el servidor y vincular cuentas a negocios. No existe endpoint público para emitir tokens por diseño; no debe habilitarse sin esta integración. Las pruebas generan sesiones ficticias solo en memoria.
2. **Conectar las cuatro interfaces** cliente, restaurante/cocina, repartidor y administrador con `/api/v1`. No se permiten pedidos de verdad desde una demostración local.
3. **Tarifas y conciliación reales**: tarifas por distancia/zonas, comisión, impuestos, descuentos/cupones y pasarelas de pago; lo actual solo soporta importe de catálogo más tarifa fija configurada en base. No implementar cargo por tarjeta con esta API todavía.
4. **Seguridad operativa**: Cloudflare WAF/Turnstile si aplica, límites por IP fuera de la sesión, recuperación de PIN bloqueado, alertas de fraude, limpieza periódica de rate-buckets/sesiones, política de retención y copias de seguridad D1.
5. **Ciclo de vida**: estados de pickup/entrega, disponibilidad de repartidores en mapa, GPS y chat aún necesitan aprobación y QA del flujo real.
6. **Pruebas**: permisos por rol y cuenta, pruebas de carga, dos dispositivos, reconexión, corte de red, Cloudflare D1 real, PWA, S23/S24 e imágenes de productos.
7. **Puesta en marcha**: entornos de staging y producción con bases y credenciales diferentes; observabilidad, comprobación de datos y rollback. La fecha meta 1 diciembre requiere todas las pruebas críticas aprobadas.

## Contrato de API (v1)
Todas las rutas privadas requieren `Authorization: Bearer <token-de-sesion-de-32-bytes-base64url>`. Para rutas de restaurante se requiere `X-Restaurant-ID: <UUID>` y una membresía activa. Las escrituras exigen `Idempotency-Key: <UUID-v4>` y `Content-Type: application/json`.

| Método | Ruta | Acceso |
|---|---|---|
| GET | /health | Público, prueba DB |
| GET | /api/v1/catalog/restaurants | Público |
| GET | /api/v1/catalog/restaurants/:id/products | Público |
| GET | /api/v1/auth/me | Usuario con sesión |
| POST | /api/v1/auth/logout | Usuario con sesión |
| GET | /api/v1/customer/orders | Cliente |
| POST | /api/v1/customer/orders | Cliente; **apagado por defecto** |
| GET | /api/v1/customer/orders/:id | Solo propietario |
| POST | /api/v1/customer/orders/:id/cancel | Solo propietario; estado Pendiente |
| GET | /api/v1/restaurant/capabilities | Personal afiliado |
| GET | /api/v1/restaurant/products | Personal afiliado |
| GET | /api/v1/restaurant/orders | Personal afiliado; cursor |
| GET | /api/v1/restaurant/orders/changes?since=0 | Personal afiliado; cursor de eventos |
| GET | /api/v1/restaurant/orders/:id | Personal afiliado |
| PATCH | /api/v1/restaurant/orders/:id/status | Propietario/gerente/cocina |
| PATCH | /api/v1/restaurant/orders/:id/assign | Propietario/gerente |
| GET | /api/v1/courier/orders | Repartidor activado |
| PATCH | /api/v1/courier/orders/:id/status | Repartidor asignado |
| POST | /api/v1/courier/orders/:id/deliver | Repartidor asignado + PIN |

`PATCH .../status` requiere `{"status":"Preparando","expectedVersion":2}`. Si otro dispositivo ya cambió el pedido, devuelve `409 ORDER_CHANGED`, no reintentar automáticamente la acción. Los pedidos de reparto no se consideran entregados sin PIN. Los usuarios deben compartir el PIN únicamente con el repartidor al recibir su pedido.

## Preparación para Cloudflare, DESPUÉS de terminar fase 3 y crear la cuenta
`backend/cloudflare.config.ts` utiliza la CLI oficial `cf`, compatible con nuevas apps, con Worker y D1 distintos por modo. No incluye identificación de cuenta ni credenciales. La instancia de producción queda con origen `https://dvolada.example.invalid` y pedidos deshabilitados hasta configuración explícita.

1. `cd backend && npm install`
2. `npm test && npm run check && npm run deploy:dry` — el dry-run NO realiza peticiones de Cloudflare, según documentación de `cf`.
3. Después de crear la cuenta, seleccionar esa cuenta explícitamente con `cf auth login`. Verificar identidad/entorno; usar un perfil exclusivo Dvolada.
4. Crear **dos D1 separadas** (`dvolada-staging` y `dvolada-prod`), verificar sus IDs; migraciones con `cf d1 migrations apply <DATABASE_ID> --dir migrations` únicamente tras comprobar el objetivo correcto (puede usarse `--local` para pruebas).
5. Configurar `SESSION_PEPPER` y `PIN_SECRET` (secretos distintos de al menos 32 bytes; no se incluyen aquí). Establecer `CORS_ORIGINS` con dominios HTTPS exactos y sustituir la URL `.invalid` antes de prod.
6. Publicar primero `npm run deploy:staging`; ensayar con cuentas/pedidos ficticios; **solo con autorización y QA** valorar producción. Nunca encender `ORDER_CREATION_ENABLED` antes.
7. Crear backups/Time Travel de D1, establecer monitoreo WAF y límites de gasto y preparar rollback del Worker (las migraciones/los datos requieren plan de restauración separado).

Consulta API/CLI oficial: https://developers.cloudflare.com/cf/ y https://developers.cloudflare.com/d1/.

## Seguridad y datos
No registrar contraseñas, cookies, token bearer, PIN, DNI, teléfonos, direcciones ni medios de pago. No guardar secretos en GitHub, frontend público, tests o `localStorage`. Los archivos `.dev.vars*`, `.env*` y `.cloudflare/` están ignorados en `backend/.gitignore`.

Los nombres de restaurante/datos de las pruebas son ficticios y no forman parte del sistema publicado. Las bases de otros productos de Nexora Systems nunca deben usarse como origen de datos de Dvolada.

## Actualización — Fase 3 (20 noviembre 2026)
La antigua sección "Antes de conectar Cloudflare, fase 3" describe los pendientes de fase 2. **La rama `prelaunch/phase-3-live-integration` ya incorpora** autenticación con correo Firebase verificado, sesiones D1 revocables, vistas básicas reales de cliente/restaurante/repartidor/admin, respuestas de repartidores (aceptar/rechazar) y alta de restaurantes/productos.
Revisá `docs/DVOLADA-FASE3-CONECTAR-CLOUD.md` para el estado vigente, los seis scripts de migración y la secuencia segura de conexión. La configuración definitiva de Firebase y Cloudflare, QA real en producción y funciones comerciales completas siguen pendientes.
