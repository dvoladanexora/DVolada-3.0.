# Promoción de Dvolada Online

1. Construir desde el SHA exacto del PR con scripts/build-online-release.sh. Conservar el módulo, SHA y SHA256SUMS. Ejecutar el verificador de artefactos y el ensayo de migración y restauración. Comparar el WebP, el formulario y el selector del Worker empaquetado con la beta antes de sustituirla.
2. Publicar esos mismos bytes en dvolada-qa, conservando bindings y secretos. Consultar /version.json y /health. Registrar huella del módulo y versión de Cloudflare. Probar cambios de permisos con cuentas sintéticas.
3. Para beta, confirmar BETA_DB y origen exactos y comparar las migraciones contra el último candidato. Conservar las invitaciones, cookies, secretos y datos existentes. Guardar la versión anterior del Worker. Verificar la página de activación, el bloqueo anónimo del selector y API, así como la huella del módulo remoto. Mantener push externo deshabilitado.
4. Para producción se requiere autorización separada, dominio HTTPS definitivo y recursos independientes dvolada-online y dvolada-online-db. Seguir el respaldo, restauración y reversión de DVOLADA-ENSAYO-COMERCIAL.md aplicando las migraciones del SHA aprobado. Mantener cerrado el alta de pedidos hasta validar origen WebAuthn, D1, monitoreo de errores y accesos. No reutilizar secretos ni identificadores de usuarios de beta.
5. Si la verificación falla, detener la promoción. Revertir solo a una versión compatible con el esquema que mantenga el control de acceso y las rutas antiguas retiradas. Conservar las escrituras y la evidencia de la ronda.

## Decisiones comerciales antes de abrir

Confirmar cuota y vigencia por restaurante, reglas de envío fijo, reparto de ingresos, medios aceptados, responsable y plazo de devoluciones, periodicidad y aprobación de liquidaciones. Dejar distancia y zonas desactivadas hasta autorizar su cálculo. Las cifras del ensayo beta son exclusivamente ficticias.
