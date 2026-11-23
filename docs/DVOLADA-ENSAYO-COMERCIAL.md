# Dvolada Online · Preparación del entorno comercial

El candidato binario es `05808d7a7ed84ac2c75ad3a205f7b3057497ace6` del PR #77. El SHA-256 de `dvolada-online.mjs` es `d22be6579ba60500f83f62405571a6332784b106822049e830ca39ce4ca43c29`. Este procedimiento autoriza ensayos locales. Crear recursos comerciales, incorporar personal real y abrir el servicio son decisiones independientes.

## Inventario y configuración propuesta

| Recurso | Existe | Propuesta comercial |
| --- | --- | --- |
| Worker Online | `dvolada-qa` usa el artefacto aprobado. `dvolada-api-staging` es un entorno previo. | Worker nuevo `dvolada-online`, sin tráfico público en la primera etapa. Deshabilitar `workers.dev` y previews públicas. |
| D1 Online | `dvolada-staging` es de QA. `dvolada-local-qa` pertenece a Local. | D1 nueva `dvolada-online-db`. Vincular solo su ID como `DB`. Cero datos o cuentas de QA importados. |
| Dominio | La cuenta Cloudflare inspeccionada no enumera zonas. | Aprobar la zona y el nombre duradero `app.<dominio-aprobado>`. Verificar control de DNS y TLS antes de registrar llaves reales. El Worker sirve UI y API en ese origen. |
| Publicación | GitHub Actions guarda `dvolada-online.mjs`, `SHA` y `SHA256SUMS`. Pages sirve un build distinto. | Conservar y promover el mismo módulo verificado por su huella SHA-256. Descargar desde la ejecución aprobada y retener una copia privada junto con el origen y los identificadores del despliegue. |
| Identidad | QA ofrece llaves de Cliente y Repartidor, sesiones de prueba y acceso de personal condicionado. | Llaves de Cliente y Repartidor y acceso comercial privado para Administrador y Propietario. El acceso comercial de estos dos roles necesita implementación y validación. |

| Configuración | Valor comercial inicial |
| --- | --- |
| `DB` | ID verificado de la nueva D1. |
| `DVOLADA_ONLINE_HOST`, `CORS_ORIGINS` | Host exacto sin esquema en la primera variable. Un solo origen `https://app.<dominio-aprobado>` en la segunda. |
| `DVOLADA_ONLINE_SERVE`, `CLIENT_PASSKEYS_ENABLED` | `false` al aprovisionar. Activar ambos para ensayos únicamente detrás de una restricción de acceso independiente del Worker. |
| `ORDER_CREATION_ENABLED`, `RESTAURANT_COMMERCIAL_ENABLED`, `FLASH_ENABLED` | `false`. Habilitar funciones comerciales solo después de revisar los permisos y contar con autorización. La invitación de Cocina requiere el área comercial habilitada durante la prueba privada. |
| `SESSION_PEPPER`, `PIN_SECRET` | Dos secretos nuevos, aleatorios e independientes de 32 bytes o más. Provisionar en el gestor de secretos. Verificar nombres, nunca valores. La rotación de `SESSION_PEPPER` afecta sesiones y códigos existentes. La de `PIN_SECRET` requiere gestionar pedidos con PIN activos. |
| Variables `QA_*`, OneSignal y pagos | Omitir los bindings de QA y las credenciales de push y pagos. Mantener apagados los proveedores. |

El RP ID del candidato es el hostname exacto y el origen esperado es HTTPS en ese host. Elegir primero el host definitivo evita obligar a registrar otra llave por un cambio de dominio. Las llaves y sesiones de QA quedan en su entorno. Antes de iniciar una ceremonia, redirigir cualquier alias aprobado al host canónico. No añadir comodines a CORS.

## Migración, publicación y reversión

1. Después de recibir autorización, provisionar Worker y D1 cerrados. Confirmar cuenta, Worker, binding D1 y control de la zona por dos operadores. Registrar el SHA del artefacto, la versión y la configuración antes de cada cambio. Mantener una restricción independiente en el perímetro durante la prueba privada o no publicar ruta.
2. Descargar el artefacto de [GitHub Actions](https://github.com/dvoladanexora/DVolada-3.0./actions/runs/45076317804/artifacts/14775097655). Verificar `sha256sum -c SHA256SUMS`, el SHA esperado y la huella fijada arriba. No recompilar para promocionarlo.
3. Ejecutar `node --experimental-sqlite scripts/rehearse-online-cutover.mjs /ruta/dvolada-online.mjs`. El ensayo prueba las 19 migraciones, la copia desde el esquema 0018 con registros sintéticos, el paso a 0019, la restauración de la copia, 12 comprobaciones de rutas retiradas y el host comercial cerrado por defecto. Es un ensayo SQLite local.
4. Con escrituras detenidas, capturar un bookmark D1 y conservar un respaldo cifrado si hay datos. En D1 vacía aplicar 0001–0019 en orden. En una base preexistente autorizada, contrastar bitácora, esquema, índices y triggers para aplicar solo lo pendiente. Verificar conteos, relaciones y consistencia previo a abrir. Time Travel restaura la misma base. Para ensayar con una copia remota, importar un respaldo aprobado en una D1 independiente.
5. Subir los bytes verificados con los bindings comerciales. Registrar el ID de versión, validar `/version.json`, `/health`, `/cuenta`, `/pruebas` (404), `/push-config` (apagado) y las tres rutas antiguas (410 en el origen habilitado). Confirmar pedido bloqueado, permisos, registro y recuperación físicos. No emitir identidades reales antes de la aprobación. Registrar latencia separando conexión, TLS y respuesta.
6. Si hay incidente, cerrar primero las escrituras y el acceso al host mediante el control independiente. Solo volver a una versión incluida en la lista aprobada que retire las tres rutas antiguas, sea compatible con el esquema D1 y apunte al binding correcto. Si no existe, mantener el servicio cerrado. Un rollback previo a WebAuthn queda excluido aunque una versión nueva tenga banderas de seguridad.
7. Si se necesita restaurar D1, iniciar una ventana autorizada con escrituras congeladas, registrar el bookmark actual y reconciliar eventos posteriores al punto de restauración antes de tocar datos. Conservar el historial de llaves cuando sea viable. Si una restauración revierte revocaciones, cambios de rol o recuperación, mantener el acceso cerrado hasta reconciliar identidades y volver a revocar las sesiones afectadas. Validar las rutas retiradas con el origen habilitado antes de reabrir.

Referencias [versionado de Workers](https://developers.cloudflare.com/workers/versions-and-deployments/) y [respaldo D1](https://developers.cloudflare.com/d1/reference/time-travel/).

## Primeros accesos e aislamiento

| Rol | Alta prevista y verificación |
| --- | --- |
| Administrador global | Dos operadores autorizan una identidad nominativa. Habilitar un proveedor de identidad privado con MFA resistente al phishing. Validar la identidad firmada en servidor y vincularla en D1 al rol global mediante un alta auditable de un solo uso, fuera del HTTP público. Probar revocación, intento de escalado y una identidad ajena. El candidato carece de este acceso usable en `/cuenta`. |
| Propietario | Administrador valida al titular, crea el restaurante y asigna el usuario previamente autenticado al negocio concreto. Probar que la sesión de Propietario no lee ni opera en un segundo negocio. El acceso por llave de Cliente no abre la sesión de restaurante y las invitaciones actuales no emiten rol de Propietario. Falta integrar el acceso privado comercial. |
| Cocina | Propietario autenticado emite una invitación de 24 horas a una persona y negocio concretos. Entregar por canal autenticado y confirmar la aceptación. Verificar que solo realiza pasos de preparación y que pierde acceso al revocar o desactivar. El acceso de personal usa una credencial sensible que requiere custodia y validación separada de WebAuthn de Cliente. |
| Repartidor | Registro como Cliente con llave. Solicitud desde su cuenta y validación administrada. Aprobación eleva el mismo ID a Repartidor. Volver a iniciar sesión y verificar que solo accede a sus asignaciones y que la suspensión bloquea sesiones existentes. |
| Cliente | Registro con llave en el host definitivo, custodia del código y confirmación de que solo ve sus propios pedidos. El registro público nunca concede privilegios. |

Los cinco paneles se ensayaron con identidades sintéticas en Chromium usando el artefacto aprobado. Sus roles y aislamiento tienen regresión de Worker. El código de ingreso de `/pruebas` sirve exclusivamente para ensayos QA y queda excluido del alta comercial. No usar roles enviados por el navegador, sesiones compartidas, contraseñas improvisadas ni accesos directos a D1 como sustituto del ingreso comercial.

## Llaves, cambio de equipo y recuperación

- En el mismo dominio, probar ingreso con llave sincronizada o autenticación entre dispositivos cuando el proveedor del equipo lo admita. Si el equipo nuevo no tiene la llave, el código permite registrar el reemplazo. El producto guarda una llave por cuenta. El reemplazo revoca las sesiones previas y rota el código. Perder un dispositivo sin perder la llave sincronizada permite iniciar sesión en otro equipo. Si se sospecha que alguien obtuvo acceso, reemplazar la llave desde un dispositivo seguro.
- Una cuenta anterior con código válido recupera su mismo ID y sus pedidos. Registrar la nueva llave en el dominio comercial con el código previamente verificado de una cuenta autorizada en la D1 comercial. Si la D1 nace vacía, registrar cuentas nuevas. Nunca copiar credenciales, sesiones o códigos de QA.
- **Sin llave ni código, dejar la cuenta protegida.** El candidato no tiene un canal alternativo de identidad validado. Por ahora, soporte puede abrir un caso, dar instrucciones y ofrecer una cuenta nueva sin transferir pedidos, historial, saldos o roles. Un teléfono que solo figura en un pedido, su PIN, un ID de pedido, capturas de pantalla o datos de domicilio no verifican identidad.
- **Procedimiento de recuperación asistida propuesto, pendiente de implementación.** Exigir un factor independiente registrado y verificado antes de la pérdida, por ejemplo una segunda llave de respaldo, con prueba criptográfica en el propio sistema. Separar recepción y aprobación, aplicar límite de intentos y una ventana de espera, y avisar a los canales ya registrados sin revelar datos. Soporte no podrá cambiar el canal, ver códigos, emitir sesiones ni poner una llave a nombre del cliente. Tras validar el factor y las aprobaciones, el sistema emite una autorización de un solo uso, de corta vigencia y vinculada a cuenta y caso. El cliente registra su llave directamente. Revocar las sesiones y la llave anterior, rotar el código y auditar el resultado sin guardar secretos. Si falta el factor preexistente, denegar la recuperación. Para roles privilegiados, usar además la revalidación nominativa por Operaciones y retirar privilegios hasta completar la revisión.

Referencias [WebAuthn](https://www.w3.org/TR/webauthn/) y [compatibilidad Android y Chrome](https://developers.google.com/identity/passkeys/supported-environments).

## Validación física pendiente

Registrar dispositivo, versión de SO y navegador, SHA servido y resultado de cada paso. Usar datos ficticios en QA y en el entorno comercial cerrado hasta autorizar la apertura.

| Prueba | Pasos y aceptación |
| --- | --- |
| Instalación | Galaxy S23 Ultra y S24 Ultra con Chrome y Samsung Internet, iPhone con Safari, y escritorio Chrome. Instalar o añadir a Inicio, cerrar, relanzar y verificar que abre el host correcto con icono, versión y tema. |
| Inicio y cambio de equipo | Registrar con verificación local, salir, ingresar desde navegador y PWA, y verificar la identidad. Probar el proveedor sincronizado o el método entre dispositivos si está disponible. En otro perfil vacío recuperar con el código, comprobar ingreso con llave nueva y revocación de la sesión anterior. |
| GPS | Con un Repartidor asignado a pedido ficticio, denegar y después permitir ubicación. Confirmar mensaje, recuperación y apertura a la dirección de prueba. Verificar que otro repartidor no obtiene esa dirección. |
| Reconexión | Simular modo avión en carrito y seguimiento. Intentar una acción crítica sin red, reconectar y reintentar. Debe haber un solo pedido y recuperación de estado. Repetir tras suspensión de una cuenta o revocación. |
| Notificaciones | Con OneSignal apagado, comprobar actualización en pantalla abierta y al volver al primer plano, ausencia de solicitudes automáticas de permiso y ausencia de push. Dejar como pendiente el envío real en segundo plano y con la app cerrada. Para ensayarlo en iPhone cuando se autorice, usar la PWA instalada en la pantalla de inicio. |

Referencia [Web Push en iOS y iPadOS](https://webkit.org/blog/13878/web-push-for-web-apps-on-ios-and-ipados/).

## Evidencia de este ensayo

- 244 pruebas de aplicación y 42 del Worker. La diferencia con 245 es la eliminación de una sola prueba de `tests/client-password.test.js` que comprobaba la derivación PBKDF2 estable del flujo retirado. El Worker conserva pruebas de autorización y cubre WebAuthn, caducidad, revocación y recuperación concurrente.
- Chromium con dos contextos y dos autenticadores virtuales contra el artefacto en un origen comercial simulado. Registro, recuperación, rotación del código, conservación del ID, revocación del primer dispositivo e ingreso nuevo aprobados. Los cinco paneles abrieron con credenciales sintéticas de QA en cinco tamaños y ambos temas. Falta validación física.
- Repetición contra QA con siete conexiones. `/version.json` tardó 2,97–4,44 s con conexión nueva. La fase previa a finalizar TLS acumuló 2,87–4,30 s. El catálogo en las conexiones reutilizadas tardó 87–163 ms. Esto reproduce un pico sin consultar D1 y señala la fase de conexión desde este entorno. No es una medición de latencia comercial ni prueba que todos los picos tengan esa causa.

Apto para aprovisionamiento cerrado cuando se autoricen cuenta, zona y presupuesto. La apertura comercial requiere el acceso privado de Administrador y Propietario, pruebas físicas y en el dominio definitivo, y autorización explícita.

## Acceso privilegiado implementado

La migración `0020_privileged_passkeys.sql` añade la asignación de acceso privilegiado y una marca de sesión. A partir de esta versión, el ingreso de Administrador y Propietario se realiza en `/cuenta` con WebAuthn. Esta sección sustituye las referencias anteriores al acceso privilegiado como pendiente de implementación. La validación física y en el dominio definitivo sigue siendo necesaria.

- **Primer Administrador.** Dos operadores autorizan un alta nominativa y verifican cuenta Cloudflare, Worker y D1. En una estación confiable, usar `node scripts/prepare-first-admin.mjs <usuario> <nombre> <archivo-privado>` con `DVOLADA_BOOTSTRAP_PEPPER` suministrado desde el gestor de secretos del entorno. El archivo local se crea con permisos 0600 y contiene el SQL y la invitación. Aplicar el SQL completo en una operación D1 transaccional en la base autorizada, con claves foráneas activas. El SQL deja un registro en `control_audit` e impide repetir el alta inicial. Entregar la invitación de 30 minutos por un canal verificado al titular y eliminar el archivo temporal conforme a la política de secretos. No hay alta inicial por HTTP.
- **Propietario.** Un Administrador que inició sesión con WebAuthn selecciona el restaurante y usa «Invitar propietario» en el Centro de Control. El Worker emite la invitación de 30 minutos para un usuario nuevo y un único restaurante. Entregar el código en privado. El titular elige «Recuperar acceso», introduce su usuario y la invitación, registra una llave y guarda su nuevo código. Una invitación consumida nunca vuelve a activar la cuenta.
- **Sesiones.** Las sesiones privilegiadas caducan en ocho horas en el servidor. La recuperación reemplaza la llave, rota el código y cierra todas las sesiones anteriores. La opción «Cerrar todas mis sesiones» las revoca sin reemplazar la llave. Un Propietario no puede elegir el restaurante autorizado mediante encabezados o datos del formulario. Si pierde la llave y el código, se aplica el proceso de verificación separado descrito en esta guía.
- **Configuración.** Habilitar `CLIENT_PASSKEYS_ENABLED` en el origen definitivo, conservar `ORDER_CREATION_ENABLED=false` durante la prueba privada y habilitar `RESTAURANT_COMMERCIAL_ENABLED` para validar la gestión de personal. El origen comercial usa cookies para la API. El acceso bearer de pruebas queda en QA. Cliente y Repartidor conservan el registro y acceso WebAuthn previos.
