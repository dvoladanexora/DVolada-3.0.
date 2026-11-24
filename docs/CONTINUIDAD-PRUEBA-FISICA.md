# Dvolada Online · prueba física del 24 de noviembre de 2026

La línea de desarrollo es `main`. El original de Pages y el Worker comparten el componente principal. El cliente autenticado monta ese componente con un controlador de pedidos, perfil, favoritos y carrito conectado. En el Worker la barra móvil tiene Inicio, Restaurantes, Pedidos y Más. Favoritos e Invitar amigos están en Más.

El Worker para la ronda privada es `dvolada-qa`, con D1 `dvolada-staging`. Verificar el SHA activo en `/version.json` y el manifiesto del artefacto preparado por GitHub Actions antes de modificar un despliegue. Conservar los bindings y el origen WebAuthn. La versión Cloudflare del commit `066ae0e` es `2d197185-9a27-4233-be28-a308eedc818e`. El anterior `a03dc85` es `a2660cc2-38b7-400f-a68f-b07dde1b1366`.

## Recorrido de prueba

1. Ingresar en `/cuenta?mode=login` con la llave del administrador. En **Alta y afiliación** crear un negocio con plan Dvolada Cloud y activar su suscripción.
2. En **Participantes y cuentas**, seleccionar ese negocio e invitar al propietario con un alias propio. Entregar la invitación en privado. El propietario activa la llave en `/cuenta?mode=recover`, publica comida con foto y abre el negocio.
3. Cliente y repartidor registran cuentas distintas. El futuro repartidor solicita su afiliación desde su perfil. El administrador la aprueba en **Participantes y cuentas**. El repartidor vuelve a entrar y activa su disponibilidad.
4. Registrar un pedido de prueba, contrastar el número desde los tres perfiles, aceptar, preparar, asignar, confirmar recogida y entregar con PIN. Verificar la caja y el historial. Guardar evidencias sin el PIN ni información de acceso.

## Evidencia y alcance

La prueba de servidor de cuatro sesiones usa SQLite aislada y llaves WebAuthn virtuales. Verifica la invitación del propietario, foto, extra, cupón, reintento, chat, recogida, PIN, caja e historial de liquidación. La cocina reutiliza el tablero original con artículos, extras y notas de las comandas autorizadas. Los permisos y las transiciones permanecen en el servidor. Los navegadores usan respuestas de API controladas para revisar presentación y navegación sin crear ventas en la D1 compartida.

GitHub Actions guarda 50 capturas del inicio de Cliente, Restaurante, Cocina, Repartidor y Centro de Control en cinco anchos y dos temas. La matriz no mide teclado nativo, colores forzados por el fabricante ni recepción de notificaciones con el teléfono bloqueado.

El siguiente punto de continuación es la paridad restante de Restaurante, Repartidor y Centro de Control con los componentes originales, las calificaciones persistentes del cliente y la verificación de PWA en teléfonos. El historial de gastos mostrado en el cliente incluye los pedidos entregados de la lista reciente. Push externo sigue deshabilitado.

## Infraestructura

`dvolada-api-staging` y `dvolada-qa-visual-runner` comparten la D1 de Online. El segundo además tiene un binding de navegador. `dvolada-beta` tiene su propia D1 y conserva invitaciones anteriores. Antes de retirarlos, verificar el uso de cada origen y las dependencias externas y ensayar la recuperación de su estado. Las dos D1 de restauración existentes se documentan en RECUPERACION-D1-ONLINE.md. Dvolada Local queda fuera de la intervención.
