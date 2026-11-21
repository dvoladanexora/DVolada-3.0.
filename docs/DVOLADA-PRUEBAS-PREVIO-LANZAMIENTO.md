# Dvolada · Pruebas para decidir el lanzamiento

El candidato se publica solo en [React QA](https://dvolada-qa.dvoladanexora.workers.dev/). Usá cuentas y pedidos ficticios. No pegues códigos, claves, JWT o PIN en capturas ni en el PR.

## Confirmación en dispositivos físicos

Hacé la ronda en Samsung Galaxy S23 Ultra y S24 Ultra con Chrome, iPhone con Safari y Chrome de escritorio. Registrá modelo, sistema, versión de navegador, hora de Honduras, número de orden ficticio, resultado y captura sin datos sensibles.

1. Abrí React QA desde el navegador. En Android y escritorio, buscá Instalar aplicación en el navegador. En iPhone, usá Compartir → Añadir a pantalla de inicio. Abrí Dvolada desde el ícono.
2. Cambiá a Claro y Oscuro. Confirmá naranja y blanco en Claro, naranja y fondo azul oscuro en Oscuro. Verificá que el texto, el importe y el botón de regresar sean legibles. Repetí con el tema automático.
3. Agregá un producto, volvé al catálogo y revisá que el envío se mantenga. Apagá Wi-Fi y datos, recargá la app y comprobá que abre la pantalla y bloquea acciones de red. Reconectá y comprobá que se actualiza el catálogo. Ante una nueva compilación, aceptá Actualizar ahora y verificá que se cargue una sola vez.
4. En sesiones separadas, asigná Cliente A, Gerencia A, Cocina A, Repartidor A y Admin. Creá un pedido, revisá que aparezca en Restaurante, aceptalo, preparalo, asigná al repartidor, completá la entrega y comprobá el contador. Repetí con un pedido cancelado. Cocina debe poder leer la comanda y no editar el menú. Repetí el acceso de cliente y negocio con las cuentas B para confirmar que no aparece el pedido A.
5. Intentá abrir con una sesión vencida. La pantalla debe pedir un acceso válido. Cerrá sesión, volvé a entrar con el otro cliente y verificá que no se muestran pedidos ni datos de la sesión anterior. El carrito de QA vive en memoria y puede perderse en una recarga o al cerrar sesión.

## Notificaciones de pedido

La suscripción de cada cuenta se vincula a la identidad firmada de QA. El envío automático exige un secreto REST de la app OneSignal específica de QA y un interruptor independiente en ese Worker. Sin estos dos parámetros, la cola registra los eventos y no entrega notificaciones. No usar claves de la app de Pages ni de producción.

1. En el dispositivo A, iniciá Cliente A y tocá Activar notificaciones. En el dispositivo B o un perfil separado, repetí con Cliente B. Suscribí también Gerencia A y Repartidor A en perfiles distintos cuando se valide su aviso.
2. Con el envío de QA habilitado, confirmá un pedido ficticio de A. Gerencia A debe recibir un aviso, Gerencia B ninguno. Al aceptar el pedido, la notificación debe llegar solo a Cliente A. Al asignarlo, debe avisar solo a Repartidor A. Verificá en OneSignal una entrega y su destinatario contra D1. El conteo de duplicados esperado por evento es cero.
3. Repetí con la PWA abierta, en segundo plano y cerrada normalmente. En Android distinguí ver el aviso en el panel de notificaciones de que Android muestre un banner. Registrá ambos resultados.
4. Cerrá sesión de A en su dispositivo, entrá con B y comprobá que las siguientes transiciones de A no aparezcan en el dispositivo de B. Revocá el permiso del sitio y repetí. Dejá pendiente cualquier caso que no cuente con confirmación del dispositivo y del proveedor.

## Condiciones para GO

Acceso comercial y recuperación comprobados mediante un proveedor autorizado para usuarios reales de prueba. Verificación visual de los cinco paneles y de la PWA en los dispositivos anteriores. Entrega OneSignal aislada y sin duplicados si forma parte del lanzamiento. Migraciones revisadas en QA, CI aprobada y autorización explícita para fusionar y publicar.
