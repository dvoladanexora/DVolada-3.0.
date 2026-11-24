# Centro de Control comercial — alcance aprobado 24/11/2026

Única línea de desarrollo: main. Worker existente y D1 principal de Online; no tocar Local, Beta ni crear otro Worker. La interfaz comercial de cliente, restaurante y repartidor no debe rediseñarse.

## Módulos
- Inicio: pedidos por día local Honduras (UTC−06), cuentas registradas, usuarios con sesión iniciada hoy, afiliados activos, repartidores y alertas operativas. Las alertas técnicas de Cloudflare requieren telemetría autorizada; no presentar indicadores inventados.
- Afiliados: directorio, alta de negocio, solicitud de afiliación desde formulario público con teléfono normalizado y protección antiabuso, contacto WhatsApp, estados y seguimiento, invitación segura de propietario Cloud, personal, suscripción, plan y cobros.
- Repartidores: directorio con entregas confirmadas, capacidad, disponibilidad y estado, solicitudes, aprobación o rechazo; alta iniciada por administrador con invitación privada; datos de contacto, calificaciones persistentes, plan y cobros. No inventar estrellas ni generar contraseñas compartidas.
- Publicidad: registro de anunciantes, contacto, contrato, imagen y destino permitido, fechas de vigencia, monto y estado de cobro; duración comercial del contrato independiente de los segundos de rotación del carrusel. Publicar exclusivamente spots vigentes y habilitados; retirar automáticamente al vencer, sin eliminar el historial. Cupones y Flash siguen siendo herramientas separadas.
- Estadísticas: ingresos cobrados por afiliados, repartidores, publicidad y comisiones; cuentas por cobrar; crecimiento y actividad por fechas. Distinguir ventas de restaurantes, liquidaciones y facturación propia de Nexora. Los ingresos se calculan a partir de pagos efectivamente registrados, no de multiplicar afiliados por un precio supuesto.
- Administrador: usuarios, auditoría, catálogo central de planes y tarifas, parámetros, seguridad, sesión y recuperación, salud del servicio. No exponer secretos.

## Acceso Google
Usar un acceso administrativo separado de los roles comerciales. Solamente las dos cuentas Google confirmadas de los socios; lista exacta controlada en el servidor, no confiada al frontend. Dvolada no tiene proveedor Google configurado y Cloudflare Access no está habilitado en esta cuenta. Se requiere configurar el cliente OAuth web de Dvolada (preferentemente separado de Nexora Control); nunca copiar secretos de otro proyecto. Verificar token del proveedor, issuer/audience, email verificado, nonce/state, vinculación por subject y sesiones seguras. Ningún token cliente asigna roles. Prueba de ambos socios, rechazo de tercer correo, revocación, expiración y prueba de que cliente no accede a endpoints admin. Conservar llave actual como recuperación de transición hasta validación de ambos; después deshabilitar método anterior para administración por decisión del propietario. No habilitar una ruta que acepte solo correo escrito.

## Protección de cambios
Reautenticación o contraseña administrativa individual (no contraseña compartida), con validación del servidor, hash seguro, rate limit, autorización de corta duración y auditoría del actor. Exigir para cambios de planes, cuotas, estado de cobros, tarifas, campañas publicitarias y suspensión. Registrar monto, moneda, período, fecha y referencia; conservar historia, no recalcular cobros históricos al cambiar plan. No asumir que suscripción activa equivale a pago al día.

## Estado de implementación
Primera etapa: navegación reorganizada, indicadores diarios y alertas operativas con datos D1, directorio real de repartidores y operaciones existentes agrupadas. Sin esquema de facturación, solicitudes de afiliados persistentes, rating ni publicidad contratada: quedan por implementar y probar. No declarar terminado ni autorizar lanzamiento por esta etapa.
