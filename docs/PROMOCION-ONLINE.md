# Promoción de Dvolada Online

1. Construir desde el SHA exacto del PR con scripts/build-online-release.sh. Conservar el módulo, SHA y SHA256SUMS. Ejecutar el verificador de artefactos y el ensayo de migración y restauración. Comparar el WebP, el formulario y el selector del Worker empaquetado con la beta antes de sustituirla.
2. Publicar esos mismos bytes en dvolada-qa, conservando bindings y secretos. Consultar /version.json y /health. Registrar huella del módulo y versión de Cloudflare. Probar cambios de permisos con cuentas sintéticas.
3. Para beta, confirmar BETA_DB y origen exactos y comparar las migraciones contra el último candidato. Conservar las invitaciones, cookies, secretos y datos existentes. Guardar la versión anterior del Worker. Verificar la página de activación, el bloqueo anónimo del selector y API, así como la huella del módulo remoto. Mantener push externo deshabilitado.
4. Para producción se requiere autorización separada, dominio HTTPS definitivo y recursos independientes dvolada-online y dvolada-online-db. Seguir el respaldo, restauración y reversión de DVOLADA-ENSAYO-COMERCIAL.md aplicando las migraciones del SHA aprobado. Mantener cerrado el alta de pedidos hasta validar origen WebAuthn, D1, monitoreo de errores y accesos. No reutilizar secretos ni identificadores de usuarios de beta.
5. Si la verificación falla, detener la promoción. Revertir solo a una versión compatible con el esquema que mantenga el control de acceso y las rutas antiguas retiradas. Conservar las escrituras y la evidencia de la ronda.

## Decisiones comerciales antes de abrir

Confirmar cuota y vigencia por restaurante, reglas de envío fijo, reparto de ingresos, medios aceptados, responsable y plazo de devoluciones, periodicidad y aprobación de liquidaciones. Dejar distancia y zonas desactivadas hasta autorizar su cálculo. Las cifras del ensayo beta son exclusivamente ficticias.

## Continuidad del PR 77 · 23 de noviembre de 2026

El candidato de aplicación es 7675749cc209021a3243a7f9599140457d14d096. QA sirve la versión aa9e874f-9a15-4a67-9b78-ba6c15223652 y Beta la versión f73f4eb4-c182-44d5-a8e2-30492eabe350, al 100 %. La huella SHA-256 del módulo de ambos es 715356dbedff9a6218aaedcc167535607a1970957ba02d02a6033865e4575d56. La Beta anterior cab99b23-b014-4c7c-8eba-8dede1f3721b se reconstruyó desde e96077f, huella 5b36240743340db57a0a7630aa4f047b5240042c82d4e3ef27ac434a32895c5e. Es el punto de rollback del Worker. Ambos módulos originales coincidieron byte a byte con compilaciones limpias del repositorio. Los formularios y el WebP coincidieron antes de la promoción.

Para verificar una promoción futura, construir cada revisión en su propio checkout y ejecutar desde el candidato:

    node scripts/check-beta-upgrade.mjs /ruta/anterior/dvolada-online.mjs /ruta/candidata/dvolada-online.mjs

La prueba usa exclusivamente SQLite en memoria. Pasó con estos dos módulos. Conservó la cookie anterior, el selector y el rechazo al segundo canje. Se heredaron y compararon los seis bindings de Beta entre versiones antes de dirigir tráfico. La promoción no requiere migraciones. Se verificaron 244 pruebas de aplicación y 44 de Worker y el ensayo local de 21 migraciones, respaldo y restauración. GitHub Actions 944 pasó para el candidato de aplicación.

Continuar con el mismo número de pedido ficticio en Cliente, Restaurante, Cocina, Repartidor y Control en los teléfonos admitidos. Registrar primer plano, reconexión, colores, teclado y PWA en S23 Ultra, S24 Ultra e iPhone. Push externo requiere consentimiento y autorización antes del ensayo en segundo plano o cerrada. El ensayo SQLite no demuestra una restauración remota de D1. La apertura pública continúa pendiente de esa verificación, la ronda física y la autorización comercial.
