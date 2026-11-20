# Dvolada Online — auditoría de seguridad preventiva

**Fecha:** 20/11/2026. **Rama:** audit/online-integral-work-2026-11, **PR:** #74 (borrador). **Alcance:** revisión estática, nuevas reglas de autorización, pruebas Node y compilación. No hubo prueba de penetración de un despliegue real, evaluación de nube ni base de datos con usuarios efectivos.

## Veredicto

**NO autorizar todavía la plataforma comercial pública con pedidos reales.** Se reforzó el prototipo y el servidor preliminar, pero la identidad real, la sincronización, el pago y la protección de operaciones deben implementarse y probarse de forma integrada. Una web de catálogo sin transacciones es otro tipo de lanzamiento que puede evaluarse después del QA.

## Riesgos y controles

| Prioridad | Hallazgo | Estado y acción |
|---|---|---|
| P0 | El JWT declaraba identidad/permiso sin verificar membresía del empleado en la BD. Riesgo de acceso después de revocación o a negocio incorrecto. | **Corregido en código preliminar:** migración 002 con restaurant_users, activo por defecto en false, consulta SQL cada solicitud y roles de Caja/Cocina/Gerencia separados. **Pendiente:** probar con PostgreSQL y proveedor de identidad reales. |
| P0 | Pedidos y PIN de demostración viven en localStorage y pueden manipularse con DevTools. | **No es seguro para comercio**. Protección pública actual impide confirmar órdenes ficticias. En producción órdenes y PIN solamente en backend con autorización y auditoría. |
| P0 | Backend de pedidos, repartidores, chat, identidad y pagos no integrado con paneles. | **Pendiente de implementación y QA transaccional**. No publicar con pedidos habilitados. |
| P1 | Sesiones JWT sin política de caducidad fuerte y firmas inválidas podían generar error interno. | **Corregido en servidor preliminar:** JWT con firma HS256, issuer, audience, iat, exp obligatorios, vida hasta 1 h, token limitado en tamaño; errores de validación devuelven 401. |
| P1 | Rol de usuario podía usarse para acciones de Caja/Cocina no correspondientes. | **Corregido en reglas de API:** cada transición se comprueba por estado y rol real consultado en SQL; acceso denegado por defecto. |
| P1 | Abuso de solicitudes autenticadas. | **Mitigación local:** límite por empleado de lecturas y escritura, Retry-After y timeouts de solicitudes/SQL; **pendiente WAF y límites distribuidos en Cloudflare**. |
| P1 | Una avalancha de llamadas a /health podía provocar una consulta SQL por petición. | **Corregido:** caché y deduplicación de sondas de base de datos durante 5 s por instancia; prueba con 100 llamadas simultáneas. No reemplaza WAF. |
| P1 | El módulo de mapa descargaba JS/CSS del CDN sin comprobar integridad. | **Corregido:** hashes SRI oficiales de Leaflet 1.9.4 y CORS anónimo. Mantener proveedores y versiones auditados. |
| P1 | Datos futuros de la orden podían filtrarse al repartidor mediante copia de objeto. | **Corregido:** lista blanca explícita, ítems mínimos y coordenadas normalizadas; jamás enviar PIN por API de repartidor. |
| P1 | Herramientas de generación de comandas admiten cadenas del usuario. | **Mitigación:** entidades HTML escapadas, CSP en documento impreso y window.opener anulado. Seguir probando XSS en UI real. |
| P1 | Vulnerabilidad alta real en sharp 0.34.x/libvips detectada con npm audit. | **Corregido:** sharp actualizado a >=0.35.5. CI volvió a aprobar compilación y npm audit informó **0 vulnerabilidades** en ambos árboles en el corte actual. Dependabot agregado. **Pendiente:** lockfiles versionados y revisiones periódicas. |
| P1 | Web pública sin CSP HTTP, HSTS, frame-ancestors ni cabeceras definitivas del hosting. | **Pendiente:** aplicar políticas en Cloudflare/hosting definitivo; el CSP preliminar solo cubre los recibos de Cocina. |
| P1 | No hay prueba transaccional de clientes, repartidores y negocios en dispositivos diferentes. | **Pendiente:** pruebas de autorización horizontal/vertical, reintentos, idempotencia, PIN, límite global de dos entregas, concurrencia y fraude. |
| P1 | Riesgo de filtración de datos en fotos, chat, historial o GPS. | **Pendiente:** uploads validados en backend, almacenamiento privado, acceso por rol, retención, consentimiento, borrado y política de privacidad. |
| P2 | Datos y cuentas de la demostración no representan identidad segura. | **Aislados del build de producción** mediante bandera Vite DEV. No hacer públicas vistas de pruebas ni credenciales en código. |

## Verificaciones que Work deberá hacer

1. **Identidades:** cliente, restaurante A/B, Caja, Cocina y repartidor; intentar acceder con sesiones cruzadas y usuarios revocados. Esperar 403 sin datos ajenos.
2. **Pedidos y precios:** modificar ID, versión, precio, restaurante, total y estado desde el navegador; el servidor no debe aceptar campos confiados sin validarlos.
3. **PIN:** jamás entregarlo a una cuenta de repartidor, no mostrarlo en logs, límite global de intentos y recuperación controlada.
4. **Abuso:** muchas consultas, cambio de estado repetido, claves de idempotencia reutilizadas, JSON anómalo y límites de tasa sin derribar el servicio.
5. **Frontend:** probar inyecciones en nombres, observaciones, imágenes, chat y comandas; verificar que no aparece HTML/JS ejecutable.
6. **Dependencias:** comprobar alertas npm y GitHub, no subir tokens/secretos ni a Git ni a variables Vite, validar lockfiles al publicar.
7. **Infra:** WAF, DDoS, TLS/HSTS, CSP, CORS, backups, restauración, logs de seguridad sin datos sensibles, alarmas y pruebas periódicas.

**Reglas operativas:** no ejecutar ataques activos contra la aplicación pública ni cuentas ajenas. Los ensayos deben ser autorizados, aislados, con datos ficticios y límites de tráfico. La auditoría no certifica seguridad total ni garantiza ausencia de vulnerabilidades futuras.

**Fuentes de referencia:** OWASP Authorization Cheat Sheet (https://cheatsheetseries.owasp.org/cheatsheets/Authorization_Cheat_Sheet.html); guía oficial Leaflet 1.9 (https://leafletjs.com/examples-v1/quick-start/).

## Corte final verificado

- **GitHub Actions:** https://github.com/dvoladanexora/DVolada-3.0./actions/runs/44675822648
- **182/182 pruebas aprobadas**, cero fallos/omitidas y compilación exitosa.
- **npm audit frontend completo:** 0 vulnerabilidades conocidas en el árbol resuelto en esa ejecución.
- **npm audit servidor preliminar:** 0 vulnerabilidades conocidas en el árbol resuelto en esa ejecución.
- **El resultado de npm audit NO demuestra ausencia de fallas de lógica, abuso comercial, configuración incorrecta ni vulnerabilidades de día cero.**
- **Bloqueadores de publicación de pedidos:** autenticación y membresías reales, API integrada, PIN y pagos seguros, control antifraude, WAF distribuido, lockfiles versionados, HTTPS/CSP/HSTS del dominio y pruebas de seguridad con Work sobre varios dispositivos.

**Estado del PR:** borrador sin fusión ni despliegue. Esta documentación autoriza únicamente la auditoría de código, NO operar clientes reales.
