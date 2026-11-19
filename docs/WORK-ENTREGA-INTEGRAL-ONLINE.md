# Dvolada Online — entrega integral de código para Work
**Fecha de corte:** 19 de noviembre de 2026  
**Alcance exclusivo:** Dvolada Online (Cliente + Restaurante/Caja + Cocina + Repartidor independiente). **Dvolada Local y Plus quedan fuera de esta entrega.**

## 1. Estado verificable
Este corte integra las ramas de frontend:
- Cliente y PWA de la previsualización pública en `main`.
- Restaurante Online: `feature/restaurante-caja-cocina-2026-11`, PR #72.
- Repartidor Online: `feature/repartidor-online-work-2026-11`, PR #73.
- Auditoría conjunta: `audit/online-integral-work-2026-11`, PR de entrega integral.

La rama integral es la que Work debe **revisar en conjunto**. Los otros PR permanecen sin fusionar y los cambios no están desplegados. `main` contiene una previsualización pública del Cliente y no representa la aplicación comercial operativa.

### Lo que funciona en el navegador de demostración
- Cliente: catálogo de comidas/restaurantes, extras, carrito de múltiples restaurantes, validación contra menú, total por restaurante, pedidos ficticios, recibos y PWA.
- Restaurante: gestionar menú y fotos *locales*, ficha y horarios, Caja, Cocina/KDS, comandas 58/80 mm, rechazos y cancelaciones revisables, notas de relevo.
- Repartidor: ofertas tras aceptación por restaurante, disponibilidad, hasta 2 pedidos activos por identidad ficticia, recogida, ruta, comprobación GPS opt-in, entrega PIN local, historial e incidencias.
- CI: varias suites Node para reglas de los tres paneles, además de comprobación de sintaxis del servidor preliminar y compilación Vite.
- La PWA guarda un shell público para ayudar a reabrir la app sin conexión, pero **no confirma pedidos offline ni sincroniza eventos remotamente**.

### Lo que NO está implementado (bloquea la venta como servicio operativo)
- Cuenta y permisos reales de restaurante, empleados y repartidores aprobados.
- Backend central multiusuario. Los datos actuales se guardan en `localStorage`, no se propagan entre PC de Caja y tablet de Cocina ni entre teléfonos distintos.
- Creación y sincronización de órdenes reales, trazabilidad confiable, asignación atómica a un solo repartidor, bloqueo global de dos pedidos y resolución real de conflictos.
- Validación de precios, promociones y PIN en servidor.
- Almacenamiento persistente de fotos; cobro, transferencias, liquidaciones y comprobantes fiscales reales.
- Chat, avisos, notificaciones push y recepción de incidencias en un servidor.
- Pruebas visuales/E2E con múltiples dispositivos y simulación de fallos bajo una API real.

**No declarar «100% listo para ventas» ni anunciar servicio de entrega real con la web de demostración.** La meta de esta auditoría es preparar una base limpia y una especificación de aceptación que permita a Work implementar lo faltante.

## 2. Iniciar revisión local

```bash
git fetch --all --prune
git checkout audit/online-integral-work-2026-11
npm install --no-audit --no-fund
npm run test:all
npm run check:server
npm run build
VITE_DVOLADA_INTERNAL_PREVIEW=true npm run dev
```

En el portal DEV, seleccionar un restaurante ficticio desde el acceso Restaurante y una identidad ficticia desde Repartidores. **No reutilizar estos accesos en producción.**

### Arquitectura sugerida (por decidir con Work)
La API Node/PostgreSQL en `server/` es un esqueleto **incompleto y aislado**. Sus estados solo cubren una parte del flujo (por ejemplo, no tiene todas las transiciones de programados, cancelaciones y repartidores) y no está integrada con React. Work debe definir si conviene continuarla o diseñar **Workers + D1 + R2 + autenticación** en la cuenta Cloudflare independiente de Dvolada. No migrar ni desplegar en la cuenta de SIAC o Sindex. **No crear ni configurar Cloudflare hasta recibir la indicación del usuario.**

## 3. Contratos operativos mínimos
1. **Identidad**. La API determina `userId`, `restaurantId` y `riderId` a partir de sesión validada; no acepta esos valores libres del navegador. Roles separados: cliente, administrador negocio, Caja, Cocina y repartidor.
2. **Catálogo**. Productos con `id`, `restaurantId`, `name`, `priceMinor` (centavos), `available`, extras/opciones con precios propios, fotos verificadas, versiones. Guardado transaccional e imágenes en storage.
3. **Carrito**. Un checkout puede contener varios restaurantes; genera una orden distinta para cada uno con tarifa por restaurante, total reconciliado y clave de idempotencia. Se validan precios y stock desde servidor antes de registrar.
4. **Estados**. `Programado → Pendiente → Aceptado → Preparando → Listo → Recogido → En camino → En ubicación → Entregado`. También `Rechazado`, `Cancelado`, `Cancelación solicitada`. La transición depende del rol, estado/version actual y reglas de negocio.
5. **Repartidor**. Solo ofertas elegibles según zona y disponibilidad; asignación única transaccional; máximo dos activas por repartidor en todos sus dispositivos; recoger solo cuando esté Listo.
6. **PIN**. Generación del servidor, no persistir secreto en frontend del repartidor ni registrar en logs. Validar exclusivamente en servidor, con bloqueo por intentos, recuperación controlada y auditoría. Protección adicional para fraudes.
7. **Sincronización**. Actualizaciones por eventos/SSE/WebSocket o sondeo incremental con cursor; recuperación después de desconexión, idempotencia, orden de eventos y snapshot consistente.
8. **Mensajería e incidentes**. Chats ligados a orden y participantes autorizados; moderación de reportes, retención, privacidad, avisos y confirmación de recepción. No afirmar que se avisó si el servidor no guardó la comunicación.
9. **GPS y direcciones**. Consentimiento y revocación explícita; precisión y frescura; no inventar destino si faltan coordenadas. Proveedor cartográfico adecuado y políticas de conservación/privacidad.
10. **Pagos y conciliación**. Efectivo, transferencia y tarjeta solo cuando estén configurados; distinguir monto de orden, cobro efectuado, cargo de plataforma y liquidación a restaurante/repartidor. No usar porcentajes o cuotas sin decisión comercial.

## 4. Matriz de aceptación que Work debe ejecutar

| ID | Área | Escenario | Resultado para aprobar |
|---|---|---|---|
| C01 | Cliente | Buscar platos y restaurantes; filtrar categorías | Muestra productos y negocio correctos sin saltar a otro inesperadamente |
| C02 | Cliente | Editar cantidades y extras | Totales exactos y opciones ofrecidas por el negocio |
| C03 | Cliente | Carrito con 2 restaurantes | Dos órdenes independientes, tarifas detalladas, total reconciliado |
| C04 | Cliente | Producto se agota o cambia precio en otro dispositivo | Checkout rechaza precio anterior sin perder carrito; permite reintentar |
| C05 | Cliente | Faltan teléfono, dirección o conexión | No crea un pedido real, conserva datos y explica cómo corregirlos |
| C06 | Cliente | Programar en horario válido/no válido | Admite solo fecha y horario permitido desde reloj del servidor |
| C07 | Cliente | PWA iPhone Safari/Android Chrome; actualizar con carrito | Instala y recarga sin confundir almacenamiento local con pedido enviado |
| R01 | Restaurante | Dos negocios con menús distintos | Jamás se mezclan pedidos, fotos ni información privada |
| R02 | Restaurante | Caja A acepta pedido | Se refleja exactamente una vez en Cocina B de otro dispositivo |
| R03 | Restaurante | Dos cajas intentan aceptar misma orden | Solo una operación válida; la otra recibe conflicto claro |
| R04 | Restaurante | Cocina cambia Aceptado→Preparando→Listo | Estado visible para Cliente y Repartidor, con marca de tiempo |
| R05 | Restaurante | Rechazar y cancelar con motivo | Se audita motivo y se comunica al cliente sin duplicación |
| R06 | Restaurante | Imprimir comanda 58/80 mm | Productos, extras e instrucciones completos; sin PIN/PII innecesaria |
| R07 | Restaurante | Guardar fotos/hora y recargar en otro dispositivo | Se conserva con respaldo del servidor; URLs seguras |
| D01 | Repartidor | Pedido Pendiente o de retiro local | Nunca aparece como entrega disponible |
| D02 | Repartidor | Dos repartidores aceptan a la vez | Uno obtiene la orden; otro ve que ya no está disponible |
| D03 | Repartidor | Intentar aceptar 3 entregas desde dos dispositivos | Tercera rechazada globalmente por servidor |
| D04 | Repartidor | Recogida antes de que Cocina marque Listo | Acción bloqueada con aviso |
| D05 | Repartidor | Ruta/GPS sin permiso o sin destino verificable | App mantiene dirección textual, no inventa mapa ni llegada |
| D06 | Repartidor | PIN erróneo 3 veces / PIN correcto | Bloqueo persistente, apoyo seguro y cierre solamente con PIN válido |
| D07 | Repartidor | Cancelación durante preparación/ruta | Pausa acciones, decisión del restaurante sincronizada |
| D08 | Repartidor | Reportar accidente/avería | Se registra y llega a soporte, sin inventar un mensaje enviado |
| S01 | Seguridad | Acceder a API de otro negocio o pedido | Respuestas 403/404, sin filtrar información del cliente |
| S02 | Seguridad | Sesión vencida, cambio de usuario y red inestable | Sin operaciones sin autorización, datos escritos protegidos |
| S03 | Respaldo | Restaurar base e imágenes desde backup de prueba | Registros y archivos recuperados con controles de integridad |
| S04 | Calidad | iPhone Safari, Android Chrome, tablet, PC; modo oscuro | Navegación y botones completos; sin desbordamientos ni controles ocultos |

## 5. Checkpoints de despliegue
- [ ] Work audita las tres interfaces en navegadores y teléfonos reales.
- [ ] Roles/autenticación validados desde servidor, sin credenciales hardcodeadas ni selector DEV público.
- [ ] Pasarela de pedidos real y reconciliación financiera configuradas.
- [ ] Prueba con Cliente A, Caja B, Cocina C, Repartidor D, además de repartidor E competidor.
- [ ] Pruebas negativas: fallos de red, orden duplicada, fraude de PIN, restaurante cerrado, precio cambiado, stock agotado.
- [ ] Logs sin secretos, monitoreo, recuperación de backup, política de privacidad y términos definidos.
- [ ] Revisión de contratos y costos Cloudflare; cuenta y límites independientes.
- [ ] Usuario verifica la demo funcional y aprueba fusión a `main` y lanzamiento controlado.

## 6. Registro de auditoría de esta rama
- El deslizador ahora devuelve al estado inicial cuando una validación de checkout falla, en vez de quedar como pedido confirmado sin orden.
- La validación y los totales del carrito se comparten entre Cliente y creación de pedidos por restaurante, incluyendo extras, cambios de catálogo y cargos por orden.
- El Service Worker cachea recursos del shell de la PWA y omite peticiones privadas/API, manteniendo advertencias de offline.
- Se añaden pruebas integrales con recorrido de pedido y escenarios de cancelación, agendamiento, asignación de repartidor, PIN y regresiones de PWA.
- Se extiende el flujo de CI y futura publicación para ejecutar todas las suites y comprobar la sintaxis del servidor preliminar.

**Esta auditoría no autoriza por sí sola el lanzamiento.** Work debe cerrar y evidenciar cada checkpoint bloqueante; únicamente entonces declarar el producto listo para ofrecer a restaurantes y repartidores reales.


### Privacidad de datos en la vista previa
La sección **Más opciones** tiene «Borrar datos de prueba de este dispositivo», con confirmación explícita. El control borra únicamente claves del dominio con prefijo `dv_` y reinicia la PWA; no borra cuentas o pedidos del servidor. Se ha añadido para que usuarios de QA puedan limpiar datos locales ficticios y preservar su privacidad. Work debe sustituir el borrado por gestión de derechos de datos y sesiones reales cuando exista backend.


## 7. Servicios externos y revisión antes de producción
El frontend de demostración utiliza algunos servicios externos. Work debe auditar qué se comparte y adoptar proveedores apropiados, contratos, políticas de retención y una CSP restrictiva antes de poner el producto en venta:
- **Mapas y rutas:** Leaflet desde un CDN público, teselas OpenStreetMap y rutas OSRM demo; no asumir disponibilidad garantizada ni enviar ubicación sin consentimiento.
- **Google Maps:** abrir navegación externa es una acción explícita del repartidor.
- **QR de invitaciones:** servicio público para generar QR de la URL pública; si se añaden códigos individuales conviene generarlos localmente, sin enviarlos a terceros.
- **Fuentes e imágenes:** Google Fonts e imágenes de demostración externas; sustituir fotografías de prueba por imágenes autorizadas y decidir una estrategia de hospedaje/optimización.
- **PWA:** el shell público puede estar en caché, pero los pedidos y operaciones requieren API autenticada y nunca deben darse por enviados offline.

## 8. Decisiones comerciales y operativas que faltan
- Cobertura geográfica por restaurante y repartidor, tarifa de envío por zona/distancia y quién cobra al cliente.
- Métodos de pago permitidos, comprobantes, reembolsos y conciliación del efectivo.
- Esquema definitivo de comisiones o suscripciones de repartidores independientes, sin simular ingresos inexistentes.
- Horarios y festivos, capacidad de cocina, pedidos programados, suspensión de servicio y límites de cancelación.
- Requisitos de afiliación, verificación y autorización de restaurantes y repartidores.
- Procedimiento ante incidentes de seguridad, accidente, pedido incompleto o cliente ausente.
- Términos, privacidad, retención de datos y soporte al consumidor conforme a las leyes aplicables.

### Semáforo de preparación
**Aprobado técnicamente mediante tests:** reglas del frontend y demostración local en GitHub Actions.  
**Pendiente de verificación Work:** navegadores y teléfonos reales, concurrencia, desconexiones, accesibilidad y operación del backend.  
**Bloqueante para lanzamiento público:** autenticación, datos compartidos, pedidos auténticos, permisos, PIN servidor, notificaciones y pruebas de extremo a extremo.

## 9. Auditoría adicional: acciones sobre estados desactualizados
Las pantallas de pedidos de demostración ahora vuelven a comprobar **el estado actual del pedido** antes de escribir una cancelación o confirmar una acción de Caja/Cocina. Se utiliza `src/order-demo-operations.js` para aplicar reglas puras:
- Cliente: una cancelación iniciada mientras el pedido estaba Pendiente y confirmada cuando ya está Aceptado pasa a **Cancelación solicitada**, no cancela automáticamente la preparación.
- Cliente: órdenes Listo, Recogido, En camino, Entregado, Cancelado y estados terminales no pueden cancelarse desde una tarjeta vieja.
- Caja: no se acepta dos veces la misma orden; no puede modificarse una orden de otro restaurante; los pedidos programados se activan solo cuando corresponde.
- Cocina: Aceptado → Preparando → Listo; nunca se salta una etapa ni se reactiva una orden cancelada.
- Rechazos y cancelaciones: deben incluir motivos válidos; al denegar cancelación se restaura exclusivamente el estado anterior permitido.
- Si la interfaz detecta conflicto, informa el error y **no muestra un mensaje de éxito engañoso**.

Estas barreras protegen la demostración dentro de una pestaña. **No resuelven la simultaneidad real entre dispositivos**: Work debe usar versiones del servidor, permisos, transacciones y reintentos explícitos.

### Pruebas nuevas de conflictos
`tests/online-integration.test.js` incluye ocho casos adicionales: cancelación competida, órdenes terminales, activación programada, dos cajas, etapas de cocina, aislamiento de negocio, rechazo con motivo y aviso de conflicto en pantalla.
