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

## Corte previo verificado

- **GitHub Actions:** https://github.com/dvoladanexora/DVolada-3.0./actions/runs/44675822648
- **182/182 pruebas aprobadas**, cero fallos/omitidas y compilación exitosa.
- **npm audit frontend completo:** 0 vulnerabilidades conocidas en el árbol resuelto en esa ejecución.
- **npm audit servidor preliminar:** 0 vulnerabilidades conocidas en el árbol resuelto en esa ejecución.
- **El resultado de npm audit NO demuestra ausencia de fallas de lógica, abuso comercial, configuración incorrecta ni vulnerabilidades de día cero.**
- **Bloqueadores de publicación de pedidos:** autenticación y membresías reales, API integrada, PIN y pagos seguros, control antifraude, WAF distribuido, lockfiles versionados, HTTPS/CSP/HSTS del dominio y pruebas de seguridad con Work sobre varios dispositivos.

**Estado del PR:** borrador sin fusión ni despliegue. Esta documentación autoriza únicamente la auditoría de código, NO operar clientes reales.

## Ronda complementaria de endurecimiento — 20/11/2026

Esta revisión adicional se ejecutó **sin tocar main ni el despliegue público**. Cambios en la rama de auditoría:

1. **Solicitudes PATCH cerradas:** la API únicamente acepta `status` (de una lista controlada) y `expectedVersion`; rechaza campos adicionales como precio, ID de restaurante, PIN, permisos o repartidor. La autorización sigue siendo responsabilidad del servidor y la base de datos.
2. **Imágenes externas restringidas:** se rechazan direcciones IP directas, localhost, intranet y dominios internos como origen de fotos de producto; se admiten URLs HTTPS públicas válidas. **Límite restante:** el DNS de un dominio externo puede cambiar y las imágenes externas siguen revelando IP al proveedor. Antes de producción usar un host de medios controlado.
3. **PIN de demostración criptográfico:** se utiliza Web Crypto y se rechaza la ejecución si no hay fuente de aleatoriedad segura. **Nunca usar ese PIN client-side como mecanismo comercial**: el servidor deberá generar, almacenar de forma protegida y verificar PIN reales.
4. **Protección CSV también en Local/Plus:** el módulo anterior ahora usa `csvFromRows`, que neutraliza fórmulas con prefijos y controles Unicode. Las ventanas de impresión de Local/Plus no incluyen scripts y anulan `window.opener`.
5. **Procesamiento de fotos protegido:** tamaño máximo 5 MB, resolución máxima 30 megapíxeles, límite de espera de 18 segundos y revocación de referencias a archivos temporales.
6. **Privacidad de navegación:** `index.html` usa `referrer=no-referrer` para no transmitir rutas o parámetros del visitante a imágenes externas.
7. **Errores del servidor saneados:** respuesta con identificador único `X-Request-ID`; los logs internos registran códigos controlados, **no mensajes SQL, cuerpos, tokens ni PIN**.
8. **API segura al iniciar:** escucha únicamente en `127.0.0.1` por defecto. Si `NODE_ENV=production` o se solicita enlazar una interfaz de red externa, se exige origen público HTTPS y una lista de frontends HTTPS permitidos. **No prueba que exista el proxy TLS o WAF**.
9. **Servidor de desarrollo local:** Vite escucha en `127.0.0.1` por defecto para que la vista de administrador y las pruebas internas no se expongan accidentalmente en redes compartidas. El acceso de Work desde otro equipo requerirá abrir el puerto **solo en un entorno aislado de pruebas**.
10. **Artefacto público mínimo:** la página de pruebas `device-studio.html` se excluye de `dist` en producción y la CI falla si vuelve a aparecer.
11. **Puerta obligatoria de publicación:** el workflow Pages exige `package-lock.json` y `server/package-lock.json` verificados, `npm ci`, auditoría de dependencias y pruebas completas antes de desplegar. **Los lockfiles todavía no existen en el repositorio** y por tanto el despliegue futuro quedará deliberadamente bloqueado hasta generarlos y revisarlos.

### Bloqueos que siguen abiertos

- Generar/verificar lockfiles de frontend y servidor a partir de un entorno Node de confianza y versionarlos. No omitir temporalmente la puerta de publicación.
- Habilitar identidades/roles reales, permisos comprobados en cada petición, backend y BD de pedidos con transacciones.
- Diseñar PIN comercial validado únicamente por servidor, protección antifraude, pago/conciliación, protección WAF/distribuida y límites de datos personales.
- Establecer headers reales `Content-Security-Policy`, `Strict-Transport-Security` y otros en el hosting definitivo y ejecutar QA de navegador, dispositivos y permisos.
- Evaluar privacidad del perfil local del cliente y proceso de eliminación de datos en dispositivos compartidos.

**Criterio:** cero fallos en los tests es evidencia de regresión, **no certificación de seguridad ni autorización para cobrar o publicar pedidos**.
