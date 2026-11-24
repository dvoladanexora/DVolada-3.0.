# Invitación privada de operador

En la cuenta Cloudflare de Dvolada, verificar el binding DB de dvolada-qa y el UUID indicado por el archivo generado. El operador de infraestructura ejecuta scripts/prepare-qa-admin-invitation.mjs con --confirm-dvolada-qa, usuario, nombre y una ruta privada fuera del repositorio. El script genera 32 bytes aleatorios. Aplicar las cuatro sentencias como una transacción exclusivamente a esa D1. Comprobar el rol, la caducidad y el registro de auditoría sin consultar secretos. Entregar solamente el código al titular por un canal privado.

El titular abre /cuenta?mode=recover en el origen de QA, introduce usuario y código, pulsa «Recuperar acceso con llave» y confirma la verificación local de su dispositivo. Guarda el código de recuperación nuevo. La invitación dura 30 minutos. El servidor admite el verificador de infraestructura exclusivamente en QA y en el primer registro de llave de una cuenta administrativa preautorizada. El canje lo sustituye por recuperación protegida con el secreto habitual. El portal público carece de una operación para emitir invitaciones administrativas.

Si caduca, el operador verifica la identidad del titular y el estado de la cuenta antes de reemitir. Conservar las cuentas con llave registrada. Descartar los archivos temporales de aprovisionamiento después de entregar el código.
