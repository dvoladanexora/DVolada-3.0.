# Dvolada Online · Operación de lanzamiento

Fecha objetivo 1 de diciembre de 2026. Este procedimiento requiere autorización para cualquier cambio en producción.

## Condiciones para abrir pedidos comerciales

- Confirmar cuenta, dominio y Worker de producción. La cuenta revisada durante la auditoría enumera D1 de QA y Local QA. Hace falta el recurso D1 exclusivo de Online producción, con bindings separados de QA y Local.
- Preparar el build comercial y su origen autorizado. El flujo probado de credenciales y los paneles autenticados se sirven hoy con controles específicos de QA. El workflow manual de GitHub Pages actual publica un build público, distinto del Worker QA con cinco paneles.
- Definir el acceso comercial. El comprobante PBKDF2 de QA es un secreto equivalente a la contraseña ante el endpoint. La recuperación ya rota credenciales y revoca sesiones. Antes de abrir el servicio, resolver el riesgo de reutilización del comprobante mediante autenticación comercial o un protocolo revisado con pruebas de repetición.
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
