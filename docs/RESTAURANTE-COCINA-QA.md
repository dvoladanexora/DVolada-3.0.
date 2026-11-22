# Restaurante Cloud y Cocina en QA

## Accesos y operación

Centro de Control crea el restaurante y vincula a su propietario. El personal ingresa por su acceso autorizado. El propietario puede vincular, retirar o restaurar los roles Gerencia, Cocina y Caja, sin cambiar el rol de otro propietario. Los horarios publicados usan hora de Honduras. El control Abrir, Pausar y Cerrar determina la disponibilidad de pedidos; publicar un horario no cambia ese estado automáticamente.

En **Menú** se gestionan precio, categoría, disponibilidad y opciones de cada producto. La foto admite JPG, PNG y WebP de hasta 120 KB. La pestaña **Historial** pagina pedidos terminados. En un pedido entregado se puede imprimir un comprobante operativo, con productos, descuento, envío y total.

Cocina recibe únicamente comandas aceptadas, en orden de llegada. Puede marcar **Preparando** y **Listo**. La comanda muestra cantidades, variantes, extras, regalo y observaciones. No incluye dirección ni importes. La vista de impresión se puede probar en Chromium y conviene comprobar el corte de papel en la impresora de destino.

## Caja y reportes

Abrí la jornada con un fondo inicial. Registrá el método realmente recibido para un pedido entregado. Dvolada no procesa el pago. Solo hay una venta por pedido y una jornada abierta por restaurante. Al cerrar se conserva el contado, el efectivo esperado y la diferencia. Los reportes agrupan método, subtotal, descuentos, envío y total. El CSV está disponible para períodos de hasta 93 días con un máximo de 500 ventas detalladas por descarga.

Las tarifas que aparecen son las del pedido original. Esta versión no calcula comisiones ni emite comprobantes fiscales. No se incluye alta autónoma de propietarios ni emisión de nuevas credenciales para el personal desde el panel del restaurante.
