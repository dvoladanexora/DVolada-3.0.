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


## Auditoría adicional · Disponibilidad y aislamiento de restaurantes (19/11/2026)
- El botón **Abierto / Pausado / Cerrado** del Restaurante Online ahora guarda el estado dentro del restaurante seleccionado en `dv_places` del mismo navegador; no es solo una etiqueta.
- En la demo local el catálogo y la validación de checkout impiden nuevas órdenes cuando el negocio se encuentra pausado o cerrado. Si tiene horarios configurados, los pedidos inmediatos fuera de horario se rechazan; pedidos programados solo pasan si están dentro de la agenda configurada y el negocio no está pausado ni cerrado.
- Otros negocios permanecen independientes. La capacidad de cocina, sonido, preferencias y controles de espera se almacenan por ID de restaurante, no en una sola configuración compartida. La preferencia personal de tema/sidebar sigue siendo del navegador.
- Cambiar el restaurante de demostración reinicia el estado visual de su panel, evitando arrastrar parámetros de otra cuenta local.
- **Importante:** estos cambios NO sincronizan dispositivos distintos, NO autentican usuarios y NO convierten el indicador de red en servidor conectado. Work debe replicar estas verificaciones en el backend y ejecutarlas de nuevo con cliente, caja y cocina en diferentes equipos.


### Última validación automatizada de la rama integral
**118 de 118 pruebas aprobadas, 0 fallos, compilación Vite y sintaxis preliminar del servidor verificadas** en GitHub Actions:
https://github.com/dvoladanexora/DVolada-3.0./actions/runs/44522783117

La revisión adicional corrigió un defecto que podía dar una sensación engañosa de funcionamiento: el estado operativo del restaurante ya no se limita al encabezado. En el navegador de demostración, cambiarlo a *Pausado* o *Cerrado* impide confirmar pedidos nuevos, de cualquier fecha. Los horarios configurados bloquean pedidos inmediatos fuera de turno, pero permiten programar a una fecha/hora permitida si el restaurante está habilitado. El encabezado avisa *Fuera de horario* cuando la apertura manual está activa, pero el turno ha terminado.

Las preferencias de capacidad, avisos, espera e impresión se almacenan por identificador de restaurante. La experiencia se reinicia al cambiar de negocio ficticio para impedir que los ajustes operativos de uno queden visibles en otro. Work debe comprobar los mismos escenarios con tres dispositivos y autoridad del servidor; **localStorage no es el origen de verdad de producción**.


### Verificación final ampliada (120 pruebas, 19/11/2026)
La suite de regresiones volvió a aprobar: **120/120, 0 fallos y compilación Vite correcta**, ejecución GitHub Actions https://github.com/dvoladanexora/DVolada-3.0./actions/runs/44523400502.

Se agregó validación contra precios nulos, vacíos, negativos, infinitos, por encima del límite del editor o con más de dos decimales en el catálogo y en el carrito. Esto previene que versiones anteriores de datos locales den lugar a cobros incorrectos de demostración. No sustituye la validación obligatoria del backend en una venta real.

Se corrigió igualmente que Caja indique *Fuera de horario* cuando un restaurante está marcado abierto, pero ya terminó su horario configurado. El cliente no podrá confirmar pedidos inmediatos en ese caso. Las operaciones de apertura/cierre y la capacidad de Cocina se mantienen aisladas por negocio ficticio en el mismo navegador.

**Evidencia de prueba:** los tests del repositorio comprueban reglas de negocio y la compilación; no equivalen a un E2E visual real ni a un backend transaccional operativo. Work tiene que cerrar esos bloqueantes antes de realizar una venta pública.


## 10. Refuerzo Cliente y Caja/Recepción — 19/11/2026, después de las 120 pruebas anteriores

Esta tanda mejora la **preparación del frontend** de Cliente y Restaurante/Caja para Work; **no representa un backend operativo ni un porcentaje certificado**.

### Cliente
- La cantidad y las instrucciones del carrito ahora identifican la línea por **ID de restaurante + ID de producto**. Dos negocios pueden usar el mismo identificador de plato sin afectarse mutuamente.
- En la bandeja lateral se usan claves compuestas para evitar colisiones de React; muestra la cantidad de restaurantes en lugar del nombre engañoso del primero cuando el carrito es múltiple.
- Antes de vaciar el carrito, el checkout de demostración debe persistir el lote de órdenes en localStorage. Si falla por cuota/bloqueo, devuelve error, mantiene el carrito y no anuncia un pedido registrado.
- El efecto de persistencia no marca una escritura fallida como exitosa: podrá reintentarse en el siguiente cambio de estado.
- Pedidos programados utilizan `withinBusinessHours` (la regla compartida del restaurante), incluyendo rechazo de horas inválidas o días cerrados.
- «Volver a pedir» comprueba extras y precios vigentes; si un extra desapareció, identifica el artículo para revisión en vez de asumir que puede venderse.
- La dirección para envío debe tener al menos 8 caracteres y se generan identificadores de variantes únicos con UUID cuando esté disponible.

### Restaurante / Caja
- La bandeja de pendientes incorpora filtros «Todos», «A domicilio» y «Retiro en local», más orden por antigüedad, con botones accesibles y presentación móvil.
- Se aclaró el estado vacío para que nunca implique que ya existe conexión autenticada al servidor.
- El CI `.github/workflows/validate-pr.yml` se configuró para ramas apiladas y para pushes de **esta rama de auditoría solamente**. El flujo de despliegue continúa limitado a `main`.

### Evidencia y restricciones
- **Referencia anterior confirmada:** 120/120 tests + compilación en el commit anterior a esta tanda (ejecución #44523400502).
- **Después de esta tanda (VERIFICADO):** 123/123 tests de nueve suites, 0 fallos, 0 omitidos y compilación Vite exitosa en GitHub Actions [run #44577129733](https://github.com/dvoladanexora/DVolada-3.0./actions/runs/44577129733), 19/11/2026. Se añadieron 3 pruebas a `tests/online-integration.test.js`.
- Las verificaciones de CI en PR apilados pueden depender de la configuración de la rama base; el evento `push` de la rama integral se añadió para proporcionar validación independiente.
- **Work debe repetir**: dos restaurantes con el mismo SKU; carrito multinegocio; cuota local llena durante checkout; horarios de pedidos programados; extras eliminados al repetir; filtros de Caja en tablet y móvil; orden antigua aceptada desde otra Caja; desconexión y restablecimiento.
- **Bloqueos no resueltos por esta tanda:** cuentas, permisos, precios y PIN en servidor, persistencia transaccional, sincronización multidispositivo, fotos reales, pagos, chat y notificaciones. No fusionar en `main` ni desplegar Cloudflare antes de aprobación expresa.

**Meta del usuario:** dejar Cliente cercano al 98% y Restaurante/Caja cercano al 99% de preparación del frontend para Work. Estas cifras son **objetivos** y deben validarse con criterios de aceptación y pruebas visuales, nunca inferirse solo de los tests unitarios.


## 11. Refuerzo de horarios nocturnos y relevos — 19/11/2026

Esta etapa refuerza la demostración de Cliente, Restaurante y Caja sin agregar un servidor real.

- El editor permite horarios que cruzan medianoche: jueves 18:00–01:30 significa abrir el jueves a las 18:00 y cerrar el viernes a la 01:30. Horas iguales se rechazan; no se admiten horas malformadas.
- El cálculo compartido `withinBusinessHours` contempla el turno del día actual y la continuación del día anterior; esto se utiliza en la disponibilidad de Caja y en el checkout inmediato/programado de Cliente.
- Se corrigió una diferencia peligrosa del catálogo del Cliente: el distintivo de restaurante ya no contradice la validación de checkout cuando hay pausa, cierre o un turno nocturno.
- La ficha del Cliente indica cuándo el horario corresponde a un turno iniciado ayer y cuándo el restaurante cierra mañana.
- Las notas de relevo guardadas en un navegador se normalizan al leerlas: registros dañados, de otros restaurantes o con fechas inválidas se descartan en lugar de provocar fallos de renderizado. Se conservan hasta 25 notas válidas por negocio.
- Pruebas añadidas a `tests/online-integration.test.js`, `tests/restaurant-business.test.js` y `tests/restaurant-hardening.test.js` para horarios nocturnos, límites de minutos, estados pausado/cerrado y recuperación de relevos.
- **Pendiente de Work:** horario y zona horaria aplicados por servidor, festivos y excepciones, notificaciones/órdenes multiusuario, aislamiento de datos con permisos reales y aceptación visual en dispositivos. La hora local del navegador no es una fuente autorizada de producción.
- Se mantiene la prohibición de fusionar `main` o publicar el servicio sin validación y aprobación del usuario.

**CI verificado:** 128/128 pruebas, 0 fallos, compilación Vite exitosa en [#44592860064](https://github.com/dvoladanexora/DVolada-3.0./actions/runs/44592860064).

### Ajuste final de distintivos del Cliente
- En las tarjetas de restaurantes, «En pausa», «Cerrado» y «Fuera de horario» aparecen como situaciones distintas. «Horario por confirmar» se mantiene cuando el negocio está abierto manualmente pero carece de horarios publicados.
- El aviso de disponibilidad en la ficha del restaurante también distingue «En pausa» en vez de llamarlo cerrado.
- Se añadió una prueba específica de esta diferencia en el catálogo.
- **Última validación: 129/129 pruebas aprobadas, cero fallos, cero omitidas y compilación Vite correcta**, [GitHub Actions #44593179149](https://github.com/dvoladanexora/DVolada-3.0./actions/runs/44593179149).
- Avisos técnicos no bloqueantes para Work: chunk de JS grande en Vite y avisos de deprecación de dependencias de GitHub Actions / `punycode`. Priorizar comprobación de rendimiento de iPhone antiguo y actualización responsable de herramientas.


## 12. Optimización de inicio, Cliente y Caja — 19/11/2026

**Último CI verificado:** [GitHub Actions #44609596145](https://github.com/dvoladanexora/DVolada-3.0./actions/runs/44609596145): **133/133 pruebas de nueve suites aprobadas**, 0 fallos, 0 omitidas, validación de servidor preliminar y compilación Vite correctas.

### Peso y carga de la aplicación
- Antes: JS inicial **538.52 kB**, CSS inicial **347.22 kB** (medidas sin comprimir del build previo).
- Después: JS inicial **412.92 kB** (119.64 kB gzip), CSS inicial **271.38 kB** (48.44 kB gzip).
- Los paneles internos usan `React.lazy` y `React.Suspense`: Restaurante/Caja, login de restaurante y Repartidor se cargan al abrirse. En el build aparecen chunks separados `AffiliateOnline` (~89.79 kB JS y ~73.46 kB CSS) y `CourierOnlineDashboard` (~36.43 kB JS y ~2.89 kB CSS).
- Resultado: aproximadamente **23% menos JS inicial** y **22% menos CSS inicial**. Esto no acredita la velocidad en iPhone 6S; medir en dispositivos reales, con red lenta y caché vacía.

### Compra y pedidos programados
- `SlideConfirm` utiliza la etiqueta específica del pedido inmediato/programado y muestra el monto informado. Nunca debe mostrar éxito si `onConfirm` no devuelve `true`.
- La tecla de flecha mueve el control sin enviar el pedido. Enter/Espacio siguen disponibles como alternativa accesible para confirmar; no sustituye la validación del pedido.
- Work debe comprobar pérdida de conexión, doble toque, prevención de pedidos repetidos y respuestas lentas en teléfonos reales.

### Restaurante/Caja y fotografía
- Bandeja de Caja: muestra hasta 20 pendientes por lote, con carga de 20 más, preservando filtros y búsqueda; evita renderizar cientos de tarjetas de una sola vez. Distingue lista vacía de búsqueda sin resultados.
- Editor del menú: invalida el resultado de una fotografía si se cerró el formulario o cambió el producto durante el procesamiento. El resultado tardío no reabre el editor ni contamina otro producto.
- Pruebas específicas agregadas en `tests/online-integration.test.js` y `tests/restaurant-menu.test.js`.

### Pendientes de aceptación por Work
- Medir primer render, interacción y memoria en iPhone 6S, Android y PC, con caché vacía y conectividad intermitente.
- Probar carga diferida de restaurante/repartidor (incluido error de descarga), y que no aparezca una página en blanco.
- Confirmación de pedido programado e inmediato por deslizamiento y teclado; error de cuota local; estados de Caja al recibir 100+ órdenes; fotografías JPG/PNG/WebP.
- Revisar tamaño de otras dependencias e imágenes, migrar el servidor de demo a API autenticada, aplicar cuotas, reconciliación y seguridad del lado servidor.
- **No asumir que 98%/99% están certificados**; son metas de preparación frontend y requieren aceptación funcional y visual.
- No fusionar a `main`, ni activar publicación de Cloudflare o pagos reales sin autorización expresa.
