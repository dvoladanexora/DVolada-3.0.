# Dvolada — preparación para Cloudflare en tres fases
Fecha: 2026-11-20. Rama de trabajo: `prelaunch/phase-1-audit-theme`.

> Objetivo: preparar el código y las pruebas **antes de que el propietario cree su cuenta nueva de Cloudflare**, sin publicar datos reales ni alterar el despliegue vigente de GitHub Pages. "Listo para conectar" no significa "producción validada".

## Fase 1 — Inventario, seguridad base e identidad visual (trabajo de esta rama)
- [x] Identificado repositorio real: `dvoladanexora/DVolada-3.0.` (incluye el punto final). Rama principal: `main`.
- [x] Confirmado que el workflow actual publica una aplicación Vite/React estática en **GitHub Pages**, no en Cloudflare.
- [x] Identificada una API **separada y no desplegada** en `server/` (Node.js + PostgreSQL). No es un Worker/D1; no confundirla con el backend futuro.
- [x] Confirmado que `src/online-api.js` es un cliente HTTP preliminar con pruebas, pero **no sustituye** las sesiones, la base de datos y la integración de los paneles.
- [x] Detectado origen posible de disparidad visual: `dv_brand` persistido por navegador, sin declaración explícita de `color-scheme`, barra del navegador con color diferente y una regla de pie de página dependiente del modo del sistema.
- [x] Fijado `#f26732` como acento público, respetando el tema claro/oscuro y reservando ajustes de acento al preview interno local. Controles y barra del navegador sincronizados; reaccionan a cambios de tema del sistema.
- [x] Añadidas pruebas de política visual y nuevas puertas de CI para PR y publicación futura.
- [ ] Validación automatizada de la rama/PR y QA visual en navegadores reales. Los cambios de esta rama **no están desplegados** por defecto.

### Hallazgos prioritarios
| Prioridad | Hallazgo comprobado | Consecuencia |
|---|---|---|
| P0 | Datos de pedidos, carrito, perfiles y otros registros de demostración se manejan en el navegador/localStorage en `src/main.jsx` | No equivalen a pedidos multiusuario persistentes; no habilitar transacciones reales |
| P0 | Backend `server/` usa `pg` y `DATABASE_URL` para PostgreSQL | No es compatible directamente con Cloudflare D1; decidir y construir versión Worker/D1 sin migrar secretos |
| P0 | `server/README.md` declara pendiente el emisor de identidad, revocación, CORS, rate limiting y pruebas | No existe autenticación real completa comprobada |
| P0 | Cliente de API Online todavía no integrado con los paneles como fuente de verdad | No hay sincronización real ni permisos efectivos en los cuatro paneles |
| P1 | Esquema SQL solo contempla parte de pedidos y eventos; faltan usuario/rol, artículos, repartidores, entrega, etc. | Esquema no cubre el ciclo de vida completo |
| P1 | No hay credenciales ni cuenta de Cloudflare de Dvolada disponibles | El despliegue final es imposible todavía; la preparación local no lo requiere |
| P1 | Colores de marca podían persistir distintos por dispositivo | Corregido en esta rama; requiere prueba S23/S24 y navegadores |
| P2 | La metadata y manifest mantienen rutas específicas de GitHub Pages | Planear una ruta/base futura para Workers sin romper la demo existente |

## Fase 2 — Backend preparado sin cuenta Cloudflare
**No iniciar producción ni crear recursos de nube en esta etapa.**
1. Implementar backend sobre **Cloudflare Workers + D1** (nueva base dedicada a Dvolada; usar la CLI `cf` para un proyecto nuevo y documentar las variables/secretos requeridos, nunca sus valores).
2. Migraciones D1 versionadas para usuarios/sesiones, negocios y empleados, menús/precios, pedidos/items, eventos, repartidores, entrega/PIN, pagos de referencia y auditoría. Los cobros reales requieren pasarela y conciliación antes de lanzarse.
3. Autorización server-side por rol y restaurante, estado de suscripción, revocación de sesiones, CORS permitido, rate limiting, validación de payloads y protección de datos.
4. Operaciones atómicas con idempotencia y versión por pedido para evitar cobros/cambios duplicados; no confiar en cálculos del cliente.
5. Pruebas automatizadas de aislamiento entre restaurantes, estados, PIN, concurrencia, reconexión y fallos de API. Usar identidades y pedidos ficticios.
6. API y datos locales de desarrollo totalmente separados del modo demostración/publicación actual.

**Cierre fase 2:** código backend y migraciones preparados, pruebas locales del servicio superadas y documentación de puesta en marcha sin secretos.

### Avance verificado de fase 2 (2026-11-20)
- [x] Implementación nueva, aislada en `backend/`: Worker, tablas D1, sesiones revocables y permisos por negocio.
- [x] Flujo técnico para clientes, restaurante y repartidores, idempotencia, auditoría, PIN, dos pedidos por repartidor y totales calculados en servidor.
- [x] Se agregaron pruebas de integración sobre SQLite ejecutando las migraciones D1, y build `cf deploy --mode staging --dry-run` sin conectar a ninguna cuenta.
- [x] `ORDER_CREATION_ENABLED` permanece en `false`; archivos de secretos excluidos del repositorio.
- [ ] Probar en **D1 real** cuando exista la cuenta, y sustituir sesiones de prueba por alta/login verificado antes de usar datos reales.
- [ ] Integrar los cuatro paneles, tarifario real, cobros, disponibilidad y sincronización — fase 3.
- [ ] Revisión de seguridad adicional y QA real en dispositivos.

**Importante:** se logró un backend funcional y compilable como cimiento, NO un servicio comercial desplegado. Las pruebas actuales no demuestran funcionamiento de D1 remoto, pasarelas de cobro ni app móvil final.

## Fase 3 — Integración, pruebas de aceptación y paquete de conexión
1. Conectar cliente, restaurante, cocina, repartidor y Centro de Control a la API oficial para las operaciones reales, con una única fuente de verdad.
2. Sustituir los mecanismos de demo por permisos reales. Deshabilitar compra/confirmación reales cuando no haya servidor autenticado, sin inventar estados.
3. Validar secuencias completas: restaurante A/B aislados; comprador → preparación → repartidor → entrega PIN; cancelar; doble clic/reintentos; offline; múltiples dispositivos.
4. Pruebas de compilación y seguridad, UX móvil claro/oscuro, PWA y S23/S24. Revisar que la carga de fotos y las reglas de publicidad sean consistentes.
5. Preparar el paquete de conexión: comandos `cf`, D1 migraciones, secretos requeridos (nombres, no valores), entornos staging/prod aislados, pasos de rollback y monitorización.
6. **Puerta de salida:** PR verificado, pruebas críticas aprobadas y documentación clara. Después el propietario crea/conecta su cuenta Cloudflare separada. Solo entonces: desplegar staging, probarlo, habilitar producción y evaluar lanzamiento público.

## Reglas de seguridad y publicación
- No almacenar contraseñas, tokens o datos personales reales en el repositorio, CI, ejemplos de tests, archivos estáticos ni localStorage como sustituto de sesión.
- No interpretar `navigator.onLine` como estado confiable del servicio de pedidos.
- No mezclar bases de datos ni permisos con SIAC, Lotigest o Nexora Control.
- No publicar automáticamente esta rama ni fusionar a `main` antes de revisar las pruebas.
- El servicio Online es la prioridad de lanzamiento. Las características Local/Plus deben conservar fronteras explícitas; no prometer funcionalidades no validadas.
- Fecha objetivo solicitada: 2026-12-01, **condicionada** a aprobación de seguridad y pruebas reales posteriores a Cloudflare.

## Pruebas visibles en el repositorio
- `npm run test:online` — cliente API de pedidos.
- `npm run test:preview` — navegación y visibilidad de demos.
- `npm run test:share` — compartir, PWA, sonido.
- `npm run test:theme` — acento oficial, modo claro/oscuro, overrides locales.
- `npm run build` — compilación Vite.
- `node --check server/src/server.js` — sintaxis del prototipo Node, **no** valida backend Cloudflare.

Para cerrar fase 1 validar las comprobaciones en GitHub Actions sobre un PR. Una compilación verde **no implica** que un flujo comercial real esté listo.
