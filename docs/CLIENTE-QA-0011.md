# Panel Cliente en QA

La migración 0011 agrega tablas. Las cuentas y los pedidos anteriores conservan sus identificadores. El acceso de cliente se habilita únicamente en el origen HTTPS de React QA mediante `QA_CLIENT_ACCESS`. Las cuentas existentes de pruebas conservan su acceso con código de sesión.

El registro genera una clave de acceso y otra de recuperación de 256 bits. Guardá ambas al registrarte con datos ficticios. La recuperación consume el código anterior, rota las dos claves y revoca las sesiones anteriores. La cookie de sesión se conserva entre recargas y caduca a los siete días. El servidor exige el origen exacto para operaciones de escritura con cookie y vincula la pestaña a su cuenta para evitar escrituras cruzadas.

Los favoritos se sincronizan en D1. El carrito de invitado se puede importar explícitamente a una cuenta que tenga el carrito vacío. Las conversaciones están asociadas a un pedido. El chat de repartidor se habilita tras la aceptación de la asignación. Los pedidos cerrados conservan historial y cierran el envío de mensajes. Cada propietario puede registrar un reclamo y consultar su estado. El cambio de estado está disponible por la API de plataforma.

Verificación física pendiente en Samsung S23 Ultra, S24 Ultra e iPhone: registro con datos ficticios, recarga, rotación, cierre, importación de carrito, chat con teclado móvil, estados de carga, foco, navegación, modo claro/oscuro y comportamiento tras reconexión.

## Variantes, extras y cupones en QA

La migración 0012 agrega opciones de producto y cupones de importe fijo. El checkout permite una variante y varios extras por producto, con una configuración por línea. El Worker recalcula los importes y D1 comprueba los precios de las opciones al confirmar. El recibo conserva nombres e importes de opciones vigentes al comprar. El pedido repetido verifica las opciones y sus precios contra el menú actual.

El cupón tiene vigencia, negocio y un uso por cuenta. La cancelación conserva el uso registrado. La tarifa y el subtotal se guardan por separado del descuento para mantener compatibilidad con pedidos históricos. El total de la API descuenta el cupón. Campañas Flash, regalos y una interfaz comercial de gestión de promociones siguen pendientes.
