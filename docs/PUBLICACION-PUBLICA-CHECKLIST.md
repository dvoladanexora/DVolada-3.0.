# Dvolada Online — criterios para publicación pública

**Corte:** 20 de noviembre de 2026. **Rama de preparación:** `audit/online-integral-work-2026-11`, PR #74. Documento de ingeniería; no es autorización para publicar.

## Decisión de producto: dos lanzamientos diferentes

### A. Web pública informativa y catálogo (sin pedidos reales)
Puede evaluarse tras pasar QA visual y resolver incidencias. Se pueden mostrar restaurantes, productos y explicar el servicio **sin confirmar compras**. El código del PR protege los pedidos ficticios de modo que `DEMO_ORDER_WRITES_ENABLED` solo funciona en desarrollo con `VITE_DVOLADA_INTERNAL_PREVIEW=true`. En producción debe seguir desactivado. No mostrar pagos verificados, entregas garantizadas ni afiliaciones operativas sin backend.

**Riesgo residual:** algunas pantallas son demostración y podrían sugerir funcionalidades aún no disponibles; Work debe verificar que mensajes y botones del público sean inequívocos antes de publicar cualquier landing.

### B. Plataforma de pedidos comercial abierta al público
**No está lista.** Falta implementar, integrar y someter a pruebas reales:

| Puerta | Bloqueante para venta | Criterio comprobable |
|---|---|---|
| Identidad | Sí | Sesiones reales cliente/negocio/caja/cocina/repartidor, roles validados por servidor |
| Pedidos | Sí | Checkout crea exactamente una orden por restaurante, persiste DB y se confirma desde servidor |
| Precios | Sí | Totales, extras, promociones y tarifas calculados/validados en servidor |
| Disponibilidad | Sí | Estado de abierto/pausado/cerrado, horarios y menú autorizados por restaurante |
| Concurrencia | Sí | Idempotencia, versiones y transacciones en aceptación, cancelación y estados |
| Sincronización | Sí | Cliente/Caja/Cocina/Repartidor ven la misma orden desde *dispositivos diferentes* |
| Repartidor | Sí | Asignación única y máximo dos entregas activas globales, no solo localStorage |
| Entrega | Sí | PIN generado y validado en servidor, protección contra intentos, GPS y auditoría autorizada |
| Pagos | Sí, según modalidades elegidas | Efectivo/transferencia/tarjeta con reglas claras, conciliación y confirmación; nunca mostrar «pagado» sin verificación |
| Mensajes | Según alcance de lanzamiento | Chat e incidencias sincronizados, controles de privacidad y consentimientos |
| Seguridad | Sí | TLS, CORS allowlist, controles de acceso, limites de petición, logs sin PIN ni secretos, backup/restauración |
| Infraestructura | Sí | Hosting, dominio, base de datos, protección de credenciales, alertas y límites de consumo |
| QA | Sí | Work completa E01–E20 en navegadores/dispositivos reales, sin incidencias P0 y con P1 resueltas |
| Legal/soporte | Sí | Condiciones y privacidad aplicables en Honduras, contacto, datos de responsables y políticas operativas |

### Ajustes de API preparados, no conectados
El servidor Node/PostgreSQL `server/` tiene comprobaciones preliminares de identidad y cambios versionados, límites de bytes JSON y ahora CORS con allowlist `DVOLADA_ALLOWED_ORIGINS`. Ejemplo de **entorno local**: `DVOLADA_ALLOWED_ORIGINS=http://localhost:5173`. Para producción, configurar exclusivamente el **origen HTTPS real** del frontend; no aceptar `*`, HTTP de dominios públicos, rutas ni credenciales en URLs.

**Advertencia:** esa API aún no representa todos los estados de Dvolada (incluidas cancelaciones y repartidores), y React no la usa para pedidos. No desplegarla como servicio comercial ni abrir el checkout únicamente porque `/health` responda correctamente.

## Ruta de decisión después de Work
1. Terminar QA visual y de flujo local usando `docs/WORK-FASE3-PRUEBAS-REALES.md`.
2. Corregir P0/P1 en rama auditada; verificar de nuevo CI y QA.
3. Definir la arquitectura final separada para Dvolada (Cloudflare Workers/D1/R2 o servidor Node/PostgreSQL), precios, roles y operaciones.
4. Implementar API comercial y conectar todas las pantallas; probar datos multiusuario y límites de autorización.
5. Simular transacciones simultáneas, pedidos duplicados, caídas de red, reintentos, PIN y pago/conciliación.
6. Decidir expresamente con el usuario qué versión se publicará primero: **catálogo informativo sin pedidos** o **plataforma comercial con servidor**.

**Regla obligatoria:** no fusionar PR #74 ni publicar o activar cobros en la web hasta tener autorización expresa del usuario y haber completado las puertas correspondientes.


## Puerta obligatoria añadida en la auditoría de seguridad

**Estado actual: BLOQUEADO PARA PUBLICACIÓN COMERCIAL.** Los archivos `package-lock.json` y `server/package-lock.json` ya fueron generados, validados y versionados **solo en la rama de auditoría**. Antes de fusionar, deben pasar revisión final de cambios y dependencias. El workflow de Pages ahora utiliza `npm ci` y rechaza automáticamente los despliegues que no tengan esos archivos o que fallen las pruebas/auditorías.

La rama de auditoría incluye defensas adicionales: rechazo de operaciones de menú con imágenes locales/internas, PIN demo con Web Crypto, CSV de Local/Plus sin fórmulas ejecutables, impresión sin JavaScript, archivos internos de QA excluidos del build y API que se niega a iniciar públicamente sin HTTPS y CORS permitido. **Eso no reemplaza la API comercial, el WAF ni pruebas de penetración.** Ver `docs/SEGURIDAD-PUBLICACION-AUDITORIA.md`.

## Corte de seguridad complementario — dependencias y privacidad
Se verificó en la rama de auditoría el uso de `npm ci` para frontend y servidor con los lockfiles versionados. La autorización por restaurante ahora tiene una única función probada con respuestas SQL simuladas, y las transacciones bloquean permisos activos antes de modificar el pedido. El servidor y el navegador evitan enviar cookies cross-origin en llamadas a la API Bearer.

Los despliegues manuales quedan restringidos a `main`. El perfil de Cliente incorpora borrado voluntario de sus datos locales en este dispositivo con confirmación. Se preparó la retención de claves de idempotencia del servidor, sujeta a pruebas en PostgreSQL.

**No habilitar pedidos reales:** sigue faltando servidor comercial integrado, pruebas de cuenta/rol en varios dispositivos, protección del PIN y pago, WAF, privacidad legal y pruebas de penetración.
