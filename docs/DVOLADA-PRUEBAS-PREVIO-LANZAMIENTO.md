# Dvolada · Pruebas para decidir el lanzamiento

El candidato se publica solo en [React QA](https://dvolada-qa.dvoladanexora.workers.dev/). Usá cuentas y pedidos ficticios. No pegues códigos, claves, JWT o PIN en capturas ni en el PR.

## Confirmación en dispositivos físicos

Hacé la ronda en Samsung Galaxy S23 Ultra y S24 Ultra con Chrome, iPhone con Safari y Chrome de escritorio. Registrá modelo, sistema, versión de navegador, hora de Honduras, número de orden ficticio, resultado y captura sin datos sensibles.

1. Abrí React QA desde el navegador. En Android y escritorio, buscá Instalar aplicación en el navegador. En iPhone, usá Compartir → Añadir a pantalla de inicio. Abrí Dvolada desde el ícono.
2. Cambiá a Claro y Oscuro. Confirmá naranja y blanco en Claro, naranja y fondo azul oscuro en Oscuro. Verificá que el texto, el importe y el botón de regresar sean legibles. Repetí con el tema automático.
3. Agregá un producto, volvé al catálogo y revisá que el envío se mantenga. Apagá Wi-Fi y datos, recargá la app y comprobá que abre la pantalla y bloquea acciones de red. Reconectá y comprobá que se actualiza el catálogo. Ante una nueva compilación, aceptá Actualizar ahora y verificá que se cargue una sola vez.
4. En sesiones separadas, asigná Cliente A, Gerencia A, Cocina A, Repartidor A y Admin. Creá un pedido, revisá que aparezca en Restaurante, aceptalo, preparalo, asigná al repartidor, completá la entrega y comprobá el contador. Repetí con un pedido cancelado. Cocina debe poder leer la comanda y no editar el menú. Repetí el acceso de cliente y negocio con las cuentas B para confirmar que no aparece el pedido A.
5. Intentá abrir con una sesión vencida. La pantalla debe pedir un acceso válido. Cerrá sesión, volvé a entrar con el otro cliente y verificá que no se muestran pedidos ni datos de la sesión anterior. En la misma pestaña, recargá y volvé a ingresar con la misma cuenta: debe aparecer su borrador. Entrá con otra cuenta y comprobá que su carrito sea independiente. El borrador guarda productos y la referencia de un intento, sin guardar teléfono, dirección, PIN ni token de sesión.

## Notificaciones de pedido

La suscripción de cada cuenta se vincula a la identidad firmada de QA. El envío automático exige un secreto REST de la app OneSignal específica de QA y un interruptor independiente en ese Worker. Sin estos dos parámetros, la cola registra los eventos y no entrega notificaciones. No usar claves de la app de Pages ni de producción.

1. En el dispositivo A, iniciá Cliente A y tocá Activar notificaciones. En el dispositivo B o un perfil separado, repetí con Cliente B. Suscribí también Gerencia A y Repartidor A en perfiles distintos cuando se valide su aviso.
2. Solo después de recibir autorización y habilitar `QA_PUSH_ALLOWED` y el envío de QA, confirmá un pedido ficticio de A. Gerencia A debe recibir un aviso, Gerencia B ninguno. Al aceptar el pedido, la notificación debe llegar solo a Cliente A. Al asignarlo, debe avisar solo a Repartidor A. Verificá en OneSignal una entrega y su destinatario contra D1. El conteo de duplicados esperado por evento es cero.
3. Repetí con la PWA abierta, en segundo plano y cerrada normalmente. En Android distinguí ver el aviso en el panel de notificaciones de que Android muestre un banner. Registrá ambos resultados.
4. Cerrá sesión de A en su dispositivo, entrá con B y comprobá que las siguientes transiciones de A no aparezcan en el dispositivo de B. Revocá el permiso del sitio y repetí. Dejá pendiente cualquier caso que no cuente con confirmación del dispositivo y del proveedor.

## Validación del checkout y gestión

- Abrí dos menús. El cambio de menú conserva el carrito. Agregar desde otro negocio debe pedir confirmación para reemplazarlo.
- Si se pierde la respuesta tras confirmar, usá **Buscar confirmación**. Si el servidor confirma el pedido, se limpia el borrador. Si todavía no aparece, reintentá con los mismos datos desde esa pestaña.
- En un pedido entregado, pulsá **Volvé a pedir** y revisá los precios del menú vigente y los productos que ya no están disponibles.
- En Cocina, abrí una comanda y usá **Imprimir comanda**. En la vista previa deben salir el negocio, número de pedido, artículos y cantidades. Comprobá el papel en el dispositivo de operación.
- En Centro de Control, cambiá la tarifa de un negocio ficticio y verificá el nuevo importe en el catálogo. Revisá que **Consultar actividad** muestre la modificación.

## Condiciones para GO

Acceso comercial y recuperación comprobados mediante un proveedor autorizado para usuarios reales de prueba. Verificación visual de los cinco paneles y de la PWA en los dispositivos anteriores. Entrega OneSignal aislada y sin duplicados si forma parte del lanzamiento. Migraciones revisadas en QA, CI aprobada y autorización explícita para fusionar y publicar.
