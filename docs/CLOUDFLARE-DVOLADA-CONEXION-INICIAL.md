# Dvolada — Conexión inicial Cloudflare (20 noviembre 2026)

## Recursos creados y verificados

- Cuenta conectada: `dvoladanexora@gmail.com`; cuenta Cloudflare exclusiva de Dvolada.
- Cuenta ID: `71c40863ac92519c703ac546d0f1dbdf`.
- D1 de **staging**: `dvolada-staging`, UUID `8d9219a2-8f18-4e27-a313-803d42d2f3e1`.
- Migraciones **0001–0007** aplicadas a staging por API REST de D1; todas confirmaron éxito. Incluyen tablas de usuarios, pedidos, negocios, repartidores, auditoría, guardias de integridad y teléfono verificado.
- Worker de staging creado en Cloudflare: `dvolada-api-staging`, con binding `DB` a esa D1.
- Secretos `SESSION_PEPPER` y `PIN_SECRET` generados aleatoriamente y guardados en el almacén de secretos del Worker. Sus valores nunca se guardaron en GitHub.
- Subdominio de cuenta: `dvoladanexora.workers.dev`; acceso workers.dev habilitado para el Worker de staging.
- URL de API prevista: `https://dvolada-api-staging.dvoladanexora.workers.dev`. **No se ha confirmado aún la resolución pública DNS ni el resultado HTTPS del endpoint /health desde un cliente externo**; probar después de propagación.
- No existe una D1 de producción. No se activó ninguna integración de pagos o pedidos reales.
- El Worker de staging usa `ORDER_CREATION_ENABLED=false` y CORS permitido solo para `http://localhost:5173` y `https://dvolada-web-staging.pages.dev` (configuración realizada 21 noviembre 2026).

## Política de acceso acordada

- Visitar Dvolada y explorar catálogo **no requiere cuenta ni teléfono**.
- Al intentar confirmar un pedido se exige nombre, teléfono hondureño válido y dirección para envíos. Se bloqueará cualquier pedido si el teléfono no está **verificado por el servidor**.
- Firebase se retiró de la **ruta activa** de Worker y compilación web pública. No se necesita un proyecto Firebase para navegar. Quedan archivos históricos de fase 3 con Firebase, no invocados por el modo real abierto; se limpiarán cuando se complete la autenticación propia.
- **Cambio de política 21 noviembre 2026**: por costo, no se implementará SMS/OTP pagado por ahora. Debe diseñarse sesión segura de cliente o invitado sin OTP, controles antiabuso y una migración posterior que reemplace de forma explícita la regla D1 `0007_customer_phones.sql`. Mientras tanto, pedidos reales siguen bloqueados. Nunca afirmar que un teléfono no verificado está verificado.
- Centro de Control, restaurante y repartidor requieren el sistema de identidad propio; todavía no accesibles mediante la interfaz pública abierta. Sus APIs se mantienen protegidas.

## Pendiente antes de pruebas reales

1. Comprobar `/health` y catálogo con HTTPS en el dominio Worker después de la propagación DNS.
2. Diseñar controles antifraude y sesiones de pedido sin SMS/WhatsApp OTP pagados, conservando teléfono obligatorio al comprar.
3. Completar login y sesiones sin Firebase para invitados, clientes, repartidores y negocios; incluir recuperación y revocación.
4. `dvolada-web-staging.pages.dev` ya aloja una **vista preliminar** PWA read-only por Direct Upload, con CORS de staging; faltan pruebas de HTTPS externas y publicar el bundle React completo cuando sea viable.
5. Pruebas de dispositivos, estados, concurrencia, pago, tarifas, fotos, chat, GPS y presupuesto antes de lanzar.
6. Aprobar explícitamente producción, crear D1 prod aislada, configurar dominios, hacer backup/rollback y recién entonces valorar habilitar creación de pedidos.

**No fusionar a `main` ni activar ventas a partir de la sola creación de staging.**
