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


## Ampliación para Work — menú, ficha comercial y dispositivos (19/11/2026)
El panel ahora tiene Caja/Recepción, Cocina/KDS y Mi menú, además de ficha del negocio en Configuración. Todo es **demostración local**, no backend compartido.
- Mi menú: crear, editar, buscar, filtrar, borrar y agotar productos; fotos JPEG/PNG/WebP optimizadas o URL HTTPS, categorías, descripción, precios L y extras. Extras en demo cuestan L 10 cada uno; precios propios requieren integración en cliente/backend.
- Ficha comercial: nombre, especialidad, dirección, teléfono, fotografía y horarios semanales validados. Solo se guardan en dv_places del navegador.
- Caja: búsqueda global funcional, advertencia de capacidad y estados con guardias; Cocina: carriles exclusivamente aceptados, preparando y listos, retrasos, búsqueda, notas, extras y vista ampliada.
- Impresión manual: comanda de preparación 58/80 mm; sin teléfono, dirección, PIN, precio ni datos bancarios.
- Acceso de preview solo en Vite DEV mediante VITE_DVOLADA_INTERNAL_PREVIEW=true. No hay contraseña incrustada ni autenticación real.
- Compatibilidad CSS con Safari antiguo y UI adaptable a móvil/tablet/PC; Work deberá confirmar con prueba visual en hardware real.
- Backend a implementar: autorización del restaurante y de empleado, fotos persistentes, CRUD de menú/profile, cola en tiempo real, versión/idempotencia al aceptar y avanzar, reconexión, asignación de delivery, seguridad por restaurante, auditoría, respaldos.
- No se debe declarar este panel «98% operativo» hasta completar pruebas en dispositivos distintos y configurar el servidor.

### Comandos de verificación
```bash
npm install --no-audit --no-fund
npm run test:online
npm run test:preview
npm run test:share
npm run test:restaurant
npm run test:menu
npm run test:business
npm run build
```

### Contratos propuestos (no implementados)
- Autenticación: GET /me devuelve restaurante, rol, permisos; solo el servidor determina restaurante_id.
- Catálogo: GET /restaurants/:id/menu; POST/PATCH/DELETE /restaurants/:id/products con versionado, validaciones y carga de fotos a almacenamiento remoto.
- Perfil: PATCH /restaurants/:id con horarios, imagen, nombre y datos de contacto; auditoría de modificaciones.
- Pedidos: creación del cliente, lista paginada, eventos incrementales, aceptar/rechazar desde Caja y cambios Aceptado→Preparando→Listo solo por Cocina.
- Entregas: asignación y confirmación por repartidor del restaurante; el cliente observa estados.
- Work debe decidir la arquitectura definitiva (la API actual usa PostgreSQL y aún no está conectada; la futura cuenta Cloudflare será independiente).

Para aprobar, probar con A cliente, B caja, C cocina, D repartidor, incluyendo pedidos simultáneos, conflictos, fallos de red, cancelaciones, stock agotado, fotos, alertas y reimpresiones. La sincronización B/C todavía NO existe.
