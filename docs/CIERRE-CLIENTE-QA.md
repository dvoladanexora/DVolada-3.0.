# Cierre del Panel Cliente en QA

## Acceso

Usá un nombre ficticio, un usuario único y una contraseña de al menos 15 caracteres. El navegador valida la confirmación y deriva un comprobante con PBKDF2-HMAC-SHA-256 a 600 000 iteraciones, con una sal estable ligada al usuario de Dvolada. El Worker recibe el comprobante por HTTPS, verifica su formato y solo guarda su HMAC con el secreto del servidor. El comprobante es una credencial: evitá copiarlo a registros, evidencias o herramientas de terceros. El servidor no puede medir la longitud de la contraseña original porque no la recibe. El acceso está limitado por origen, IP y cuenta en QA. El modo de clave anterior conserva las cuentas de pruebas existentes.

Guardá el código de recuperación de un solo uso para las pruebas. Al recuperar, el Worker reemplaza el comprobante y el código y revoca las sesiones anteriores. Probá el código anterior de nuevo y comprobá que falla. Probá también recargar y cerrar la sesión.

## Campañas

El Centro de Control autoriza una campaña por restaurante con descuento fijo o regalo de su menú. Puede requerir un producto específico y programa inicio y fin en hora de Honduras. El checkout permite un cupón o una campaña Flash. El límite por cuenta y el total se comprueban en D1 durante la escritura. Las órdenes canceladas o rechazadas liberan el cupo. Una orden fallida revierte su transacción completa y los pedidos entregados conservan el uso. El regalo se conserva en el recibo y la comanda, se verifica como disponible al confirmar y no suma al precio del pedido.

Verificá favoritos, importación del carrito de invitado, extras, cupón y Flash en pedidos separados. Completá el recorrido con la cuenta ficticia y conservá el número de pedido. Los Samsung S23 Ultra, S24 Ultra y iPhone necesitan validación física de teclado, temas, reconexión y apertura desde la PWA.
