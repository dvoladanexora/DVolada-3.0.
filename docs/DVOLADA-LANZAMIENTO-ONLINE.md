# Dvolada Online · Operación de lanzamiento

Fecha objetivo 1 de diciembre de 2026. Este procedimiento requiere autorización para cualquier cambio en producción.

## Condiciones para abrir pedidos comerciales

- Confirmar cuenta, dominio y Worker de producción. La cuenta revisada durante la auditoría enumera D1 de QA y Local QA. Hace falta el recurso D1 exclusivo de Online producción, con bindings separados de QA y Local.
- Preparar el build comercial y su origen autorizado. El flujo probado de credenciales y los paneles autenticados se sirven hoy con controles específicos de QA. El workflow manual de GitHub Pages actual publica un build público, distinto del Worker QA con cinco paneles.
- Confirmar el acceso comercial en el dominio final. El candidato sustituye el comprobante PBKDF2 por llaves WebAuthn. Validar emisión y recuperación en dispositivos físicos y decidir el alta privilegiada antes de abrir el servicio.
- Autorizar tarifa fija por restaurante, modalidad de cobro, comisión del restaurante, remuneración del repartidor, participación de Dvolada, tratamiento de descuentos y devoluciones, y períodos y responsables de liquidación. Mantener las reglas de zona y distancia en el simulador hasta verificar la ubicación y aprobar las tarifas.
- Confirmar el protocolo de atención de restaurantes y repartidores. Las pantallas abiertas consultan al servidor periódicamente. Al volver al primer plano se vuelve a consultar. Con la PWA cerrada o en segundo plano no se garantiza recepción de avisos. OneSignal queda apagado. Para una operación que necesita avisos con la aplicación cerrada, esa limitación bloquea la apertura.
- Aprobar las pruebas físicas y revisar consentimiento, tratamiento de direcciones y atención de reclamos.

## Despliegue autorizado

1. Fijar los SHA exactos, versión de Worker anterior, origen y bindings esperados, y completitud de CI. Anotar responsables y una ventana sin nuevas escrituras.
2. Inventariar las migraciones por esquema y por la bitácora existente. QA ha aplicado cambios también por API SQL. Confirmar columnas, índices y triggers en vez de deducir la versión solo de una tabla de migraciones.
3. Ensayar sobre una D1 aislada con el esquema equivalente y datos ficticios. Validar claves foráneas, conteos por tabla, estados de pedidos y totales de liquidaciones antes y después. Registrar migraciones aplicadas en orden y verificar compatibilidad con el Worker anterior.
4. Solo durante una ventana autorizada, comprobar los identificadores del Worker y D1 productivos y capturar el bookmark de D1 Time Travel. Registrar versión y bindings previos. Cualquier respaldo exportado con datos reales debe quedar cifrado en el almacenamiento operativo aprobado y fuera del repositorio y de esta sesión.
5. Aplicar las migraciones pendientes de forma ordenada con las escrituras detenidas. Mantener cerrada la creación real durante la validación. Confirmar salud, SHA, lista de orígenes, banderas, lectura y permisos con cuentas controladas. Publicar el build comercial y habilitar pedidos únicamente tras la autorización expresa.
6. Monitorizar errores, latencia, consumo Workers/D1 y órdenes por estado. Confirmar la primera conciliación y revisar la auditoría. Mantener desactivados los pagos automáticos y OneSignal en este alcance.

## Reversión

Desactivar la creación de pedidos si aparecen fallos de integridad o permisos. Volver primero a la versión anterior del Worker y frontend si el esquema sigue siendo compatible. Si falla la integridad del esquema, congelar escrituras y evaluar restauración D1 al bookmark con autorización explícita. Conciliar los eventos posteriores al bookmark antes de restaurar, ya que la restauración puede descartar esos cambios. Confirmar bindings, conteos, salud y flujos antes de reabrir. En esta ronda no se exportaron ni restauraron datos productivos.

## Guía física breve

- En Galaxy S23 Ultra, Galaxy S24 Ultra y iPhone con Safari, abrir QA y verificar claro, oscuro, rotación, teclado, navegación en formularios y que el naranja se conserve. Repetir en una tablet y escritorio.
- Instalar la PWA desde el navegador, cerrar y volver a abrir. Cambiar temporalmente a modo avión, verificar la apertura de la interfaz y el carrito, e intentar una acción crítica con datos ficticios. La pantalla debe bloquear la operación hasta recuperar internet. Al reconectar, verificar un único pedido, la actualización y el estado de la sesión.
- Con Cliente, Restaurante, Cocina y Repartidor en pantallas separadas, observar el pedido abierto y comprobar sincronización al recuperar el foco. Validar recogida, apertura de mapas, un PIN incorrecto controlado y entrega con PIN válido. Registrar dónde cambia el comportamiento con la aplicación cerrada.
- Confirmar cierre de Caja, conciliación, reporte y exportación del Centro de Control. Anotar modelo, sistema, navegador, SHA, pasos y evidencia sin datos personales.

Referencia de respaldo y restauración: https://developers.cloudflare.com/d1/reference/time-travel/

## Adenda · Llaves de acceso y promoción del artefacto

Las cuentas de Cliente y Repartidor usan WebAuthn, con verificación del usuario, origen y RP ID exactos. El desafío dura cinco minutos, está vinculado a una cookie del navegador y se consume atómicamente antes de verificar. Las rutas anteriores de contraseña y código de ingreso devuelven HTTP 410. Para conservar el usuario y sus datos, quien tenga una cuenta anterior debe elegir «Recuperar acceso» con su código de recuperación. El registro de una nueva llave rota ese código, limpia el verificador anterior de esa cuenta y revoca las sesiones. Si no se conserva el código, hace falta un procedimiento de verificación de identidad aprobado. Las passkeys de QA se vinculan al dominio QA y se deben emitir nuevamente en el dominio comercial. El acceso de pruebas por bearer se muestra en /pruebas y requiere una sesión ya provisionada. El alta privilegiada del dominio comercial se debe acordar y probar antes de abrirlo.

- Construir con Node 22, el checkout exacto y `npm ci`; ejecutar `bash scripts/build-online-release.sh`. El job `qa-smoke` guarda `dvolada-online.mjs`, `SHA` y `SHA256SUMS` juntos. Es el mismo Worker con el frontend incrustado para QA y Online comercial. GitHub Pages conserva su build informativo distinto y no es el canal para activar pedidos.
- Verificar `sha256sum -c SHA256SUMS` antes de subir y usar el mismo archivo, sin recompilar para producción. Contrastar el SHA de /version.json y el identificador de la versión Cloudflare. La compilación verifica que el dominio incorrecto y el servicio comercial sin bandera devuelvan 404. La ruta /pruebas queda reservada a QA.
- Cuenta autorizada: QA usa `dvolada-qa` con la D1 `dvolada-staging`. Para comercial aprovisionar por separado Worker Online, D1 Online, dominio HTTPS y secretos criptográficos independientes `SESSION_PEPPER` y `PIN_SECRET`. Bindings del candidato: `DVOLADA_ONLINE_HOST`, `DVOLADA_ONLINE_SERVE`, `CLIENT_PASSKEYS_ENABLED`, `CORS_ORIGINS` y `DB`. Mantener `ORDER_CREATION_ENABLED=false` hasta la validación comercial, `RESTAURANT_COMMERCIAL_ENABLED` y `FLASH_ENABLED` apagados salvo autorización, y OneSignal desactivado. QA y Local conservan sus recursos separados.
- La migración `0019_client_passkeys.sql` añade dos tablas y un índice. Antes de aplicar en producción comprobar las 19 migraciones contra una copia aislada, registrar bookmark y versión previa. Si se vuelve a un Worker de antes de WebAuthn, desactivar primero el acceso cliente y el checkout para impedir que reaparezcan las rutas antiguas. Conservar las tablas añadidas para facilitar una recuperación hacia adelante. Las recuperaciones y las sesiones de QA no se transfieren al entorno comercial.
