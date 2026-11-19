# Dvolada Online · Separación de Caja/Recepción y Cocina (KDS)
**Estado:** desarrollo visual y funcional, pendiente de integración con servidor. Esta rama NO representa un lanzamiento de producción.

## Objetivo
Un restaurante puede tener:
- **PC de Caja/Recepción**: recibe solicitudes nuevas, revisa detalle y acepta/rechaza (con confirmación desde el detalle).
- **Tablet/monitor en Cocina**: ve únicamente pedidos **Aceptado**, **Preparando** y **Listo** (sin pendientes ni rechazados), los tiempos y las instrucciones; imprime una comanda y marca cambios de preparación.
- **Repartidor del restaurante**: recoge una orden ya lista y confirma entrega desde su futuro panel, nunca desde la cocina.

## Implementación de esta rama
- `RestaurantCashierConsole.jsx`: nueva bandeja de pedidos pendientes con aprobación, resumen por etapa y acceso visible a Cocina.
- `RestaurantKitchenDisplay.jsx`: KDS de tres carriles, lectura sencilla, contadores, notas, extras y cronómetro de antigüedad, con estados que solo avanzan.
- `kitchen-operations.js`: separación de pedidos por restaurante y estado, orden cronológico, ticket HTML escapado e impresión solo de pedidos aceptados.
- `OnlineWorkspace.jsx`: integra ambas pantallas conservando Mi menú, Mensajes, Historial, Estadísticas, Relevo, Configuración y mensajes de conectividad.
- Entrada de demostración **solo local**: iniciar Vite con `VITE_DVOLADA_INTERNAL_PREVIEW=true`. El acceso no debe publicarse para usuarios sin autenticación.
- CSS para PC, tablet, monitor, móvil, modo oscuro y vista ampliada.

## Flujo para probar sin servidor
1. Abrir panel Restaurante Online en entorno local autorizado, con datos ficticios.
2. Crear un pedido de prueba desde el cliente del mismo navegador; Caja muestra el pendiente.
3. Caja revisa y pulsa **Aceptar y enviar a cocina**.
4. Abrir Cocina: aparece en **Por comenzar**.
5. Pulsar **Comenzar preparación** → se mueve a **Preparando**.
6. Pulsar **Marcar como listo** → se mueve a **Listos**.
7. Pulsar **Comanda**; seleccionar impresora 80 mm o tamaño configurado. El papel muestra número de orden, productos/cantidades, extras, notas, modalidad y hora. **No contiene** dirección, teléfono, PIN, precio ni datos de pago.

## LO QUE TODAVÍA NO FUNCIONA ENTRE EQUIPOS
**No hay sincronización real de una PC de caja con otra tablet.** La versión actual recibe datos `orders` como props desde el frontend local y los cambios se guardan en el mismo dispositivo. El indicador de servidor actual solo comprueba salud HTTPS, no sincroniza los pedidos.

**Work debe implementar antes de producción**:
- Sesión real del restaurante y autorizaciones de servidor; no confiar en filtros de frontend.
- Persistencia de pedidos y productos en la base de datos, usando IDs de negocio autenticados.
- Suscripción o consulta incremental de órdenes y estados (SSE/WebSocket/polling con cursor). Reconexión, orden de eventos, deduplicación e idempotencia.
- Recepción de pedido en Caja → aceptación transaccional → actualización inmediata en Cocina.
- Evitar dos aceptaciones simultáneas, conflictos de edición, pedidos perdidos, reimpresiones no autorizadas; conservar bitácora.
- Permisos por empleado: caja puede aceptar/rechazar, cocina solo comenzar/marcar listo. La pantalla de cocina en tablet debe iniciar sesión con su rol, nunca con acceso público anónimo.
- Notificaciones y audio con consentimiento y límites por dispositivo, no beep infinito.
- Módulo de catálogo real: alta/edición/fotos (almacenamiento remoto), stock, precios, extras, publicación; sincronizar al cliente.
- Pruebas reales con tres dispositivos (cliente, caja, cocina) y otro para repartidor.
- Impresión manual probada en 58/80 mm y papel A4; impresora Bluetooth depende de la configuración del dispositivo. Integración ESC/POS automática es una función separada, no se promete aquí.

## Criterios de aceptación antes de lanzamiento
- Una orden nueva aparece solo en Caja del restaurante correcto.
- La orden aceptada aparece en Cocina de otro dispositivo sin recargar manualmente.
- Cocina no ve ni puede aceptar órdenes pendientes; solo cambia a Preparando/Lista.
- El cliente ve los cambios a tiempo y el repartidor recibe la asignación cuando corresponda.
- No hay fugas entre restaurantes ni en tickets; las reimpresiones son trazables.
- Sin internet, los cambios no se confirman ficticiamente; al reconectar se resincroniza el estado real.
- Work revisa accesibilidad móvil, contraste, contenido largo, impresoras, concurrencia y seguridad.

**Dvolada Local/Plus son proyectos separados; esta UI corresponde únicamente a Dvolada Online.**
