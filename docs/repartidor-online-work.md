# Dvolada Online · Panel de repartidor (entrega a Work)

**Estado:** implementación de frontend y lógica de DEMOSTRACIÓN LOCAL sobre la rama `feature/restaurante-caja-cocina-2026-11`. No desplegar, fusionar con main ni habilitar al público hasta auditar seguridad e integrar el servidor.

## Modelo operativo
Dvolada conecta restaurantes, clientes y **repartidores independientes**. La plataforma no contrata repartidores ni posee una flota. Cada repartidor verificado podrá aceptar entregas ofrecidas dentro de su cobertura con límite de **2 activas**. Al completar una, se libera un cupo. Las condiciones de pagos/comisiones y liquidaciones serán configuradas en un backend, no se inventan tarifas en la interfaz.

## Experiencia implementada
- Acceso de pruebas exclusivo Vite DEV mediante `VITE_DVOLADA_INTERNAL_PREVIEW=true`. Selector de dos perfiles ficticios; se eliminaron usuario y clave hardcodeados.
- Hero `Tu ruta. Tu ritmo.`, disponibilidad independiente por identidad, modo claro/oscuro y tarjetas Liquid Glass compatibles con pantalla pequeña.
- Tres vistas: **Disponibles**, **Mis entregas** e **Historial**. Búsqueda de restaurante o número de orden.
- Ofertas: se muestran únicamente pedidos food/delivery ya aceptados por restaurante con estado `Aceptado`, `Preparando` o `Listo`, que no tengan otro repartidor. Antes de aceptarlos no se muestra nombre, teléfono ni dirección del cliente.
- Aceptar: límite de dos entregas por identidad y estado. Omitir no bloquea al resto de los repartidores; queda registrado como `courierDeclinedBy` para esa identidad local.
- Mis entregas: preparación, recogida, iniciar ruta, verificar llegada, confirmar entrega mediante PIN de seis dígitos (solo en el navegador de demostración).
- Estado `Cancelación solicitada` bloquea avance de entrega hasta que el restaurante lo resuelva.
- Rutas Google Maps para dirección/coord. confiable. Mapa Leaflet visible solo si se pulsa **Ver mapa**; GPS solo si se pulsa **Activar mi GPS**. Servicio público OSRM de demostración con aviso de privacidad.
- Confirmación GPS de llegada cuando existen coordenadas verificadas; botón separado **Simular llegada · SOLO DEMO LOCAL** para que Work pruebe el PIN sin depender de coordenadas ficticias.
- Sonido bip-bip solo tras gesto explícito; sin notificaciones push activas o permisos solicitados en segundo plano.
- Llamar restaurante/cliente solo tras aceptar y cuando exista teléfono válido; incidencias registradas solo en localStorage, claramente no enviadas al negocio.
- Historial de cada identidad sin prometer ingresos, comisiones o pagos inventados.
- No se transmite el PIN dentro de los objetos del panel; la validación de prueba se ejecuta en el estado padre, aunque ambos siguen siendo código cliente y **no ofrecen seguridad real**.

## Flujo de prueba (mismo navegador de DEV)
1. `VITE_DVOLADA_INTERNAL_PREVIEW=true npm run dev`.
2. Entrar al portal Repartidores local, elegir Repartidor demo 1 y activar disponibilidad.
3. Crear 2 pedidos ficticios listos mediante el botón interno, o aceptar desde Caja en el mismo navegador.
4. Abrir **Disponibles**, aceptar ambos; el tercero deberá quedar bloqueado. Cambiar a Repartidor demo 2 para validar separación.
5. En **Mis entregas**: **Confirmar recogida → Iniciar recorrido → Simular llegada (solo DEV) → Ingresar PIN del pedido visible únicamente en Mis pedidos del cliente → Entregado**.
6. Comprobar rechazo/omisión por repartidor, cancelaciones, historia, límite de dos, mapa y GPS con y sin coordenadas verificadas.
7. Si existen dos pestañas de Vite en el mismo origen, puede propagarse parte del estado por los eventos de `storage`. **Eso no sincroniza teléfonos o computadoras distintas**.

## Pruebas automatizadas
```bash
npm install --no-audit --no-fund
npm run test:online
npm run test:preview
npm run test:share
npm run test:restaurant
npm run test:menu
npm run test:business
npm run test:hardening
npm run test:courier
npm run build
```

## Prioridades bloqueantes antes del lanzamiento (Work)
1. Autenticación real de repartidores con verificación y aprobación; identidad de servidor, no selector ni bandera frontend.
2. API de ofertas de reparto y asignación transaccional **compare-and-swap**, límites globales en servidor (máximo 2), protección de doble aceptación y oferta con caducidad.
3. Estados auditable: aceptar → recoger → iniciar ruta → llegada → entregar. Solo transiciones autorizadas, idempotencia y control de versión.
4. Validación de PIN **del lado del servidor**, PIN no expuesto al cliente repartidor ni guardado en texto plano, límites de intentos y recuperación asistida. La demo actual puede ser manipulada por usuarios con acceso al JavaScript.
5. Asignación y comunicación con restaurante; verificar precio, dirección, medio de pago y cambio de estado. Flujo para error, cancelación, reclamo y reembolso.
6. Integrar GPS/mapas con consentimiento, privacidad y proveedor de rutas adecuado. Sin rastreo cuando el repartidor está fuera de servicio. No compartir coordenadas con terceros sin aviso.
7. Notificaciones reales con push/sonido condicionado a permisos y compatibilidad de iOS/Android.
8. Pruebas con múltiples repartidores compitiendo por una misma orden y dos dispositivos usando la misma cuenta, conexión intermitente, historial y expiraciones.
9. Revisión visual PC, tablets y móvil (incluido Safari antiguo) y pruebas de accesibilidad, teclado y lectores de pantalla.
10. Definir la arquitectura de la **cuenta Cloudflare exclusiva para Dvolada** solo cuando el usuario decida crearla. Dvolada Local/Plus están fuera del alcance.

**Criterio de entrega:** no declarar 98–99% de OPERACIÓN REAL hasta que servidor, identidad, sincronización, pruebas de campo y seguridad estén verificados. El porcentaje de frontend y el de producto operativo son métricas diferentes.


### Revisión final de UX y resistencia local
- Los pedidos ficticios ahora reciben números diferentes por tanda y la herramienta limita la creación masiva de pedidos activos.
- Una orden en preparación conserva la etapa visual de restaurante aceptado.
- Solo se registran como fallos de PIN los códigos realmente incorrectos, no errores de internet.
- Los registros locales de incidencias y disponibilidad se validan al leerlos para evitar datos corruptos o valores ajenos.
- El mapa solo solicita GPS tras pulsar el botón correspondiente. Los teléfonos válidos tienen 8 a 15 dígitos.


## Segunda auditoría del panel — edición adicional

### Mejoras realizadas y por qué
1. **Confirmación para aceptar ofertas.** Evita perder un cupo por tocar un botón involuntariamente; hoja modal accesible con Escape, trampa de foco y diseño adaptado a móvil.
2. **Privacidad previa a aceptación.** `courierViewOrders` envía a la interfaz ofertas con identificador, estado, restaurante, fecha y cantidades; no entrega nombre, dirección, teléfono, notas ni PIN del cliente antes de asignarlas. En producción esta reducción debe ocurrir en API, no en JavaScript.
3. **Doble toque y ofertas viejas.** El controlador local conserva inmediatamente el siguiente estado tras aceptar y rechaza un segundo intento sobre esa misma orden. Es una protección de demostración en una pestaña, no sustituye transacciones servidor.
4. **PIN protegido.** Introducción oculta por defecto y opción Mostrar/Ocultar, intentos erróneos limitados a tres y guardados localmente por identidad y orden. Los fallos de red no consumen intentos. Work debe reemplazarlo con límites de seguridad del servidor.
5. **Llegada GPS explícita.** La comprobación solo empieza si el usuario pulsa Activar GPS; comprueba frescura (30 segundos) y precisión y detiene seguimiento al cerrar o desactivar.
6. **Inicio útil.** Si hay entregas pendientes, se abre `Mis entregas` y se muestra `Siguiente paso` con la orden prioritaria; evita que el repartidor busque entre ofertas mientras ya va en ruta.
7. **Información de pago visible pero no operativa.** La tarjeta presenta método e importe referencial del pedido. No registra dinero, comisiones ni liquidaciones.
8. **Incidencias clasificadas.** Categorías de dirección, cliente, producto o avería, con observación y estado explícito `Borrador local · sin enviar`. No promete soporte remoto.
9. **Aislamiento de preferencias.** Cambio de repartidor no copia disponibilidad del repartidor anterior en el navegador.

### Riesgos abiertos para Work
- Red compartida y estado real: el navegador no puede garantizar asignación única ni máximo dos en varios dispositivos. Implementar bloqueo transaccional de orden y cupos por usuario.
- Identidad: todas las opciones de demo son no autenticadas; en producción el servidor debe obtener `rider_id` desde la sesión autorizada.
- PIN: la demo conserva el PIN en memoria/almacenamiento de cliente; no puede publicarse así. Verificación remota, bloqueo persistente, procedimientos de recuperación y auditoría.
- GPS/mapas: revisar términos de servicio, privacidad y opciones cuando falla ubicación; no inferir llegada sin coordenadas verificadas.
- Seguridad vial: botones grandes y minimizar interacción en movimiento; validar con usuarios de campo. La app no debe incentivar usar el teléfono mientras se conduce.
- Cobros: definir política real de efectivo, transferencias y conciliaciones antes del lanzamiento.
- Notificaciones, chat, soporte e incidentes son locales; conectar servidor, push y registro confiable.
- E2E visual móvil/tablet/PC y test real con múltiples repartidores, restaurante y cliente todavía requieren Work.

Para confirmar regresiones ejecutar `npm run test:courier`, todas las suites de PR y `npm run build`.
