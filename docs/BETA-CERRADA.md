# Beta cerrada de Dvolada Online

Entregá el origen HTTPS a los participantes únicamente después de confirmar el SHA en el dispositivo admitido, el rechazo anónimo de la API y una entrega completa en D1 beta. El nombre reservado en código es dvolada-beta.dvoladanexora.workers.dev. La activación se hace en /beta/activar. Cada persona necesita un código individual y luego su cuenta WebAuthn.

## Preparación por el operador

Usá un Worker independiente, sin disparadores programados, con DVOLADA_BETA_HOST igual al nombre reservado, BETA_DB apuntando exclusivamente a una D1 beta vacía, CORS_ORIGINS igual al origen HTTPS y secretos SESSION_PEPPER y PIN_SECRET independientes de QA y entre sí. Aplicá las migraciones en orden. Mantené push y pagos desactivados. Verificá el inventario de bindings y secretos antes de publicar. Activá ORDER_CREATION_ENABLED únicamente en el Worker beta después de verificar la barrera privada y el binding de la base sintética. Guardá la versión anterior del Worker y un respaldo privado de D1 antes de migrar.

Por participante, ejecutá `node scripts/prepare-beta-invitation.mjs /ruta/privada/unica.json`. Aplicá solo la sentencia sql del archivo a D1 beta y entregá el código por canal privado. El código admite un navegador una vez y vence a los siete días de su generación. La llave de acceso controla el rol. Para revocar, aplicá revokeSql a esa misma D1 y suspendé la cuenta y sus sesiones. Para reemplazar un teléfono, revocá primero el acceso anterior. Si la PWA instalada usa otro contenedor de cookies, activala con un código separado y registrá ambas invitaciones para revocarlas juntas.

## Prueba con cuatro personas

| Participante | Recorrido y evidencia esperada |
|---|---|
| Gerardo, administrador | Usá el alta privada inicial y la llave. Habilitá un restaurante ficticio, invitá al propietario, aprobá el repartidor. Revisá el mismo número de pedido, liquidación y reclamo, resolvelo y verificá el historial. |
| Propietario | Activá la llave con la invitación de propietario. Publicá un producto con extra. Recibí la orden, aceptala, abrí Cocina, preparala y marcala lista. Verificá producto, extra y total en caja. |
| Cliente | Registrá una llave, guardá el código de recuperación en privado. Agregá el producto y el extra, recargá, confirmá una sola vez y anotá el número de orden. Seguí el estado, chateá y creá un reclamo ficticio. |
| Repartidor | Registrá tu cuenta y solicitá el alta de repartidor. Tras aprobación, conectate, aceptá, confirmá recogida y abrí la ruta de prueba. Probá una vez un PIN incorrecto y luego el correcto facilitado por el cliente. Verificá una entrega y una ganancia. |

Usá alias, direcciones ficticias y métodos de pago simulados. Repetí una vez el envío tras una desconexión y compará el número de orden en los cuatro teléfonos. Verificá caducidad, rechazo a una segunda entrega y aislamiento con un segundo negocio sintético.

## Instalación y prueba física

En Android abrí el origen en Chrome, menú ⋮, Instalar aplicación o Agregar a la pantalla principal. En iPhone usá Safari, Compartir, Agregar a inicio. Abrí desde el icono y verificá acceso, instalación y recuperación de sesión. En S23 y S24 compará blanco y naranja en claro y azul oscuro y naranja en oscuro. Probá teclado abierto, rotación, tamaño de texto aumentado y cierre de modales. En modo avión conservá el carrito, intentá confirmar y reconectá. Registrá si aparece exactamente una orden. Probá GPS con permiso aceptado y denegado sin publicar coordenadas.

Con push desactivado, medí cuánto tarda una orden nueva en aparecer en primer plano. Para una ronda posterior de push, documentá consentimiento y probá app abierta, segundo plano y cerrada, permiso denegado y cambio de usuario. Registrá el número de avisos y el pedido que abre cada uno.

## Incidencias y reinicio

Reportá en privado: alias y rol, pantalla, SHA, modelo y navegador, hora de Honduras, referencia del pedido ficticio, último estado, acción, resultado esperado y observado, estado de red y código visible de error. Adjuntá captura voluntaria con PIN, dirección, códigos y datos de cuenta ocultos.

Antes de reiniciar exportá la D1 beta, guardá huella y SHA, comprobá la restauración e integridad en una base aislada. Conservá la base anterior y el registro de incidencias; iniciá la siguiente ronda en una base vacía migrada con nuevas invitaciones. Ante un fallo cerrá el acceso al Worker beta antes de revertir y comprobá que la versión restaurada siga rechazando visitantes anónimos.
