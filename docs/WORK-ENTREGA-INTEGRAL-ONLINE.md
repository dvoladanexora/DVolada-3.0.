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

**No declarar «100% listo para ventas» ni anunciar servicio de entrega real con la web de demostración.** La meta de esta auditoría es preparar una base limpia para que **Work ejecute QA real y documente incidencias**, sin desplegar ni modificar código salvo autorización. Implementar el backend comercial será un alcance distinto.

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
La API Node/PostgreSQL en `server/` es un esqueleto **incompleto y aislado**. Sus estados solo cubren una parte del flujo (por ejemplo, no tiene todas las transiciones de programados, cancelaciones y repartidores) y no está integrada con React. Tras terminar el QA, el usuario decidirá si se continúa esta API o se desarrolla **Workers + D1 + R2 + autenticación** en la cuenta Cloudflare independiente de Dvolada. No migrar ni desplegar en la cuenta de SIAC o Sindex. **No crear ni configurar Cloudflare hasta recibir la indicación del usuario.**

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


## 13. Persistencia segura de demo y recuperación de catálogo — 19/11/2026

**Pruebas verificadas:** [GitHub Actions #44613519622](https://github.com/dvoladanexora/DVolada-3.0./actions/runs/44613519622): **137/137 aprobadas**, 0 fallos, 0 omitidas, verificación de servidor preliminar y compilación Vite exitosa.

### Cliente, Caja y Repartidor
- `persistDemoOrders` en `src/order-demo-operations.js` centraliza el guardado previo de órdenes de demostración (`dv_orders`), con validación mínima, máximo 500 registros y límite de 3.5 MB compatible con la recepción de eventos entre pestañas.
- Si el navegador niega acceso o no tiene espacio, la operación devuelve error; **no se muestra aceptación, cancelación ni recogida como exitosa** si la orden no quedó persistida.
- Integración realizada en `placeOrder`, `confirmCancelOrder`, `updateOrder` (Caja/Cocina) y `handleCourierAction`. Conserva las referencias de estado y carrito hasta que haya escritura válida.
- Test añadido para cuota agotada, ausencia de storage, array inválido, registro excesivo y límites; otro test comprueba el orden guardado → actualización de interfaz.

### Recuperación de datos entre pestañas
- `validStoredRestaurants` valida objetos de restaurante y productos antes de usar `dv_places` del localStorage, previniendo fallos de renderizado con productos `null`, identificadores ausentes, nombres inválidos o importes no numéricos.
- `decodeDemoStorageEvent` rechaza actualizaciones dañadas de `dv_places` y `dv_orders`; se conservan los registros legítimos.
- Pruebas cubren datos locales heredados y eventos entre pestañas válidos e inválidos.

### Restricciones importantes para Work
- **No equivale a sincronización real.** `localStorage` no ofrece transacciones para cambios concurrentes entre dispositivos; varias pestañas pueden pisarse si escriben al mismo tiempo. La API real debe incorporar versión del pedido, autorización por restaurante, idempotencia, límites, persistencia transaccional y reconciliación.
- Las órdenes de prueba no deben contener datos de pacientes/clientes reales ni convertirse en ventas sin implementar el servidor y controles de privacidad y pagos.
- Revisar aceptación visual en Android, iOS y PC, restablecimiento tras almacenamiento lleno y varios pedidos simultáneos.
- Mantener PR #74 como borrador. **Sin cambios en main ni despliegue Cloudflare** hasta aprobar integraciones reales.
- Las metas **Cliente 98% y Restaurante/Caja 99%** siguen siendo objetivos de preparación de frontend; no porcentajes validados de producto comercial.


## 14. Fase 1 — Estabilidad del código de demostración (19/11/2026)

**Corte auditado:** [GitHub Actions #44638054358](https://github.com/dvoladanexora/DVolada-3.0./actions/runs/44638054358) — **150/150 pruebas de nueve suites aprobadas**, sin fallos ni pruebas omitidas, comprobación preliminar del servidor y compilación Vite exitosa.

### Cambios de estabilidad
1. `mutateDemoOrders`: Cliente, Caja/Cocina, Repartidor, administración, pedidos ficticios, solicitud opcional y calificación parten del último lote guardado, no de un cierre de React desactualizado. Exige guardado completo antes de anunciar éxito. Las acciones sobre tarjetas antiguas se rechazan mediante las guardas de estado, sin modificar el lote actual.
2. Confirmación de compra: `checkoutCommittedRef` impide una segunda confirmación de la misma sesión tras el éxito, hasta iniciar una nueva compra. Se conserva el carrito si la escritura falla.
3. `changeCartQuantity`: reducir o eliminar un producto afecta **únicamente la línea seleccionada**; no descarta otras líneas antiguas o inválidas.
4. `mutateDemoPlaces`: guardado de ficha, horarios, abierto/pausado/cerrado, menú y edición rápida de precios sobre el catálogo más reciente. Las ediciones obsoletas del **mismo menú, ficha o estado** reciben un conflicto visible, en lugar de sobrescribir la otra pestaña. Los cambios en apartados distintos se conservan.
5. `validStoredOrders` y `validStoredRestaurants`: rechazan órdenes de IDs duplicados, entradas dañadas, productos con identificadores repetidos, negocios sin nombre y catálogos demasiado grandes, tanto al restaurar como en eventos entre pestañas.
6. Arranque: `corruptDemoSnapshot` detecta lotes `dv_orders`/`dv_places` dañados; la demo puede mostrar datos temporales, pero **no los reemplaza automáticamente al iniciar**. El usuario recibe aviso.
7. Preferencias y avisos: escrituras `localStorage` no esenciales quedan protegidas ante bloqueo de almacenamiento.
8. Sembrador del repartidor: identificadores aleatorizados, límite de pedidos ficticios activos comprobado sobre el lote más reciente, guardado antes de notificar.
9. Operaciones de administración, calificación y pedido opcional: eliminadas las escrituras ciegas de `setOrders(previous => ...)` que podían pisar actualizaciones.

### Pruebas incorporadas y escenarios comprobados
- Dos pestañas secuenciales actualizando pedidos diferentes preservan ambos cambios.
- Aceptación duplicada, estado desactualizado, cancelación y orden ya cambiada devuelven error, sin modificar el archivo local.
- Pedido repetido en la misma sesión no se vuelve a guardar; cesta conserva productos no seleccionados.
- Restauración y notificaciones entre pestañas descartan registros malformados e IDs repetidos.
- Guardado simultáneo de nombre + catálogo conserva apartados independientes; choque sobre el mismo menú se rechaza.
- Denegación de permisos, cuota llena, lotes corruptos, excedentes y excepciones dejan las modificaciones sin aplicar.
- Cambios de catálogo, estados de negocio y administración utilizan el guardado compartido.

### Restricciones conocidas que solo resuelve la integración real
- `localStorage` no ofrece transacciones ni bloqueo atómico entre pestañas. La lectura antes de escribir **mitiga conflictos secuenciales**, pero **no garantiza operaciones simultáneas**. La API debe implementar control de versión, idempotencia de checkout, restricciones de dos entregas por repartidor, PIN y operaciones transaccionales.
- No hay sesiones comerciales autenticadas, sincronización multi-dispositivo, comprobación real de GPS, cobro de tarjetas ni servidor de producción comprobado.
- GitHub Actions ejecuta pruebas de código/compilación, **no** certifica UX, impresoras, redes intermitentes o compatibilidad iPhone/Android/PC. Estas son pruebas funcionales y visuales de Work.
- No se implementaron pagos reales ni se desplegó en `main` / Cloudflare.

**Criterio de cierre de la Fase 1 de tres:** se aplicaron las correcciones detectadas en el alcance local; 150/150 pruebas aprobadas y compilación válida. La fase 2 se concentrará en rendimiento, interfaz, accesibilidad y compatibilidad, y la fase 3 en auditoría integral y entrega. No afirmar “100% de producción” ni los porcentajes 98/99 como certificados.


## 15. Fase 2 — Optimización, navegación y accesibilidad (19/11/2026)

**Último CI verde:** [GitHub Actions #44640791510](https://github.com/dvoladanexora/DVolada-3.0./actions/runs/44640791510) — **158/158 pruebas automatizadas en nueve suites**, 0 fallos, 0 omitidas y compilación Vite correcta. No se publicó en `main`.

### Indicadores de compilación (sin comprimir)
| Recurso | Después de Fase 1 | Después de Fase 2 | Reducción aprox. |
| --- | ---: | ---: | ---: |
| JavaScript inicial | 412.92 kB | 375.90 kB | 9.0% |
| CSS inicial | 271.38 kB | 229.28 kB | 15.5% |
| JavaScript inicial comprimido gzip | 119.64 kB | 109.98 kB | 8.1% |
| CSS inicial comprimido gzip | 48.44 kB | 41.85 kB | 13.6% |

Esto reduce transferencia/procesamiento inicial, **pero no demuestra FPS ni tiempo real de carga en dispositivos**. Además, desde el primer corte de la auditoría online (538.52 kB JS / 347.22 kB CSS) la reducción acumulada es aproximadamente 30% JS y 34% CSS.

### Mejoras por panel
- **Cocina:** `kitchenVisibleBatch` limita las tarjetas a 20 por etapa; botón accesible para mostrar 20 más; el total real y los contadores de retrasos permanecen completos; se reinicia el lote al cambiar negocio o búsqueda. Se añadió una prueba con 81 órdenes.
- **Restaurante/Caja:** lista de pendientes ya paginada; las órdenes programadas vencidas aparecen en lotes de 10 y las futuras en lotes de 5 con opciones de cargar más. La búsqueda también filtra programadas y pedidos con fecha inválida; no quedan futuras inaccesibles tras el quinto registro. Los botones de comanda incluyen el número de pedido en su nombre accesible.
- **Menú del restaurante:** tarjetas por bloques de 24 y reinicio de paginación al filtrar; error de formulario anunciado con `role="alert"`, campos inválidos correctamente marcados, foco dirigido al primer campo incorrecto, fotografías con decodificación asíncrona, controles táctiles de tamaño mínimo.
- **Repartidor:** ofertas visibles en lotes de 15 e historial en lotes de 20, con reinicio de límites cuando cambia identidad/búsqueda. Mapa, llegada GPS y diálogo de aceptación se cargan bajo demanda con `React.lazy` y estado accesible de carga. Se amplían controles táctiles y foco de teclado.
- **Cliente:** invitaciones/instalación, beneficios, promociones, contacto comercial y login interno del repartidor se cargan al abrir esas secciones; se eliminaron imports no utilizados que podían incrementar el paquete inicial. Se añadió enlace visible con foco **«Saltar al contenido principal»**, ID del `main`, indicación `aria-current` en navegación móvil y foco visible consistente.
- **Checkout:** el control deslizante anuncia estado/progreso, importe total e instrucciones de teclado mediante `aria-describedby`/`aria-valuetext`; si hay error se anuncia sin afirmar que el pedido fue confirmado.

### Pruebas añadidas
- Paginación de 81 pedidos por etapa, límites y recálculo por filtros.
- Búsqueda y carga por lotes de programados futuros/vencidos en Caja.
- Paginación del menú y foco en campos inválidos.
- Carga bajo demanda del mapa/GPS/modal en Repartidor, paginación de ofertas/historial.
- Estado del deslizador para lectores de pantalla, acceso por teclado, botón de comanda distinguible.
- Rutas diferidas de Cliente con pantalla de carga accesible, navegación móvil y enlace para saltar cabecera.

### Lista de aceptación manual para Work — Fase 3
1. Abrir en iPhone 6S, Android y PC con caché vacía. Registrar tiempo de primer render, interacción de botones, consumo de RAM y recarga.
2. Caja: crear más de 40 pendientes, 15 programados vencidos y 15 futuros. Buscar por número/nombre/producto, cargar más, activar, imprimir y verificar que no se pierdan filas ni se mezclen negocios.
3. Cocina: probar más de 80 órdenes distribuidas en las tres columnas, filtrar, cargar más, pasar Aceptado → Preparando → Listo y comprobar alertas y comandas 58/80 mm.
4. Menú: cargar 100 productos, filtrar categoría/agotados, agregar/editar/eliminar, cargar una fotografía, comprobar foco/errores con teclado físico y lector de pantalla.
5. Repartidor: más de 30 ofertas, más de 40 históricas, acceso a mapa/GPS y aceptación, PIN y modo sin conexión. Confirmar que solo dos entregas activas están permitidas.
6. Cliente: acceso directo a invitaciones, instalación, promociones, checkout inmediato/programado, navegación con Tab, Enter, flechas y móvil. Probar modo oscuro, texto grande, contraste, preferencia de menos movimiento, teclado en pantalla y rotación.
7. Cargar paneles diferidos sin red o con conexión muy lenta; asegurar que el usuario vea estado de carga y no una página en blanco. Repetir con actualización de PWA y una versión vieja cacheada.

**Nota importante:** el resultado es preparación de frontend y pruebas automatizadas; **no equivale a certificación de operación real ni sustituye backend seguro, transacciones, pagos y sincronización multi-dispositivo.** Fase 3 debe auditar la integración y preparar entrega para Work; no fusionar/publicar este PR sin autorización.


## 16. Fase 3 — Auditoría final de código y transferencia para pruebas reales (20/11/2026)

**Validación más reciente de código:** [GitHub Actions #44671145386](https://github.com/dvoladanexora/DVolada-3.0./actions/runs/44671145386), **168 pruebas aprobadas (nueve suites), cero fallos/omitidas**, compilación Vite y sintaxis del servidor preliminar correctas. La auditoría no incluye navegador real, operación comercial ni autenticación real.

### Errores encontrados y corregidos en la Fase 3
- **Identificador UUID de producto:** antes, el carrito y «Volvé a pedir» podían convertir un ID con guiones en su primer segmento, haciendo que un producto creado en Menú apareciera como inexistente. Ahora `resolveCartProduct` busca por ID exacto y solo habilita compatibilidad con productos numéricos antiguos. Se persiste `productId` en todas las líneas nuevas.
- **Límite de extras:** el editor rechazará nueve o más extras distintos en vez de recortarlos silenciosamente a ocho. Mensaje accesible y prueba de regresión.
- **Respuestas y cortes de API:** el cliente `online-api.js` rechaza JSON inválido o nulo, captura fallos de conexión y no repite automáticamente un `PATCH` cuyo resultado podría haberse perdido. La persona debe releer el estado.
- **Servidor preliminar:** `server/src/request-validation.js` comprueba tamaño del cuerpo JSON en **bytes UTF‑8** (no caracteres) y rechaza cuerpos nulos, arrays, versiones inválidas y solicitudes sin `Content-Type: application/json` controladamente.
- **Cargas diferidas:** `LazyPanelBoundary` muestra una recuperación accionable cuando falla una descarga JS, sin pantalla blanca. En Repartidor se aísla el fallo de GPS/mapa/diálogo para conservar el panel.
- **Carga de 120 pedidos:** prueba integrada de tres negocios, aceptación y preparación por Caja/Cocina, límite estricto de dos entregas, recogida, ruta, llegada por GPS de demo y validación de PIN. Comprobación de que no se mezclan las colas.
- **Modo producción:** no se habilitaron pagos, repartidores reales, tokens ni paneles internos públicos.

### Estado de entrega
- **Fase 1:** estabilidad de órdenes/catálogos y localStorage.
- **Fase 2:** listas grandes, carga diferida, teclado, lector de pantalla, optimización.
- **Fase 3:** correcciones de integración, seguridad de solicitudes y plan de pruebas reales.

**Archivo principal para Work:** `docs/WORK-FASE3-PRUEBAS-REALES.md`. Contiene pasos, 20 escenarios E01–E20, dispositivos, datos ficticios, prioridades P0/P1/P2 y formato de evidencias. Work debe **probar y reportar**: no implementar backend, no arreglar código, no publicar ni fusionar sin una nueva autorización del usuario.

### Advertencia de límites
No es correcto afirmar «100% listo para vender» ni que los cuatro paneles se sincronizan entre dispositivos. Los resultados de Actions validan **reglas y compilación del prototipo local**, no la experiencia real de usuario. En producción siguen pendientes arquitectura de identidad, API, transacciones, cobros, asignación y PIN confiables. El PR #74 continúa como borrador.
