# Dvolada — separación de cliente, repartidor, negocio y administración

## Lanzamiento cliente (esta rama)
Se muestran Inicio, catálogo, restaurantes, pedidos, favoritos, perfil, ayuda, actualización, apariencia y los spots publicitarios. La bienvenida conserva accesos de consulta comercial/registro separados.

Se ocultan del menú, Más, descubrimiento y pie las rutas de Mandados, Express, Club, invitaciones con recompensas, pedidos grupales, panel de repartidor de demostración y administración no autenticada. El guardia de navegación evita la entrada accidental, pero **no equivale a una frontera de seguridad**.

Los formularios y pedidos que aún indican «demostración» continúan pendientes de integrar al backend antes de abrir pedidos reales al público.

## Prototipo de administración
El panel administrativo que existe dentro de `src/main.jsx` usa `localStorage`, por eso no sirve para cambios globales ni almacena datos centrales. Los cambios efectuados ahí **solo se ven en el navegador de pruebas**. En producción ni siquiera se ofrece esa ruta en el flujo cliente.

Para probarlo **únicamente en Vite local**: definir `VITE_DVOLADA_INTERNAL_PREVIEW=true` y ejecutar `npm run dev`. En la bienvenida aparecerá «Centro de Control · Solo pruebas locales». No desplegar el preview como sitio público. Un enlace oculto, un hash, un PIN en frontend o una variable pública no garantizan privacidad.

## Arquitectura de administración recomendada
Separar aplicaciones:
- App cliente pública con navegación y API de lectura/pedidos.
- Portal independiente de Nexora/Dvolada protegido con Cloudflare Access, controlando identidades autorizadas (ej. Gerardo y Dani).
- API en Cloudflare Workers con autorización **del lado del servidor**, comprobación de rol por recurso y trazabilidad. Access no sustituye autorización específica de API.
- D1 para registros compartidos (restaurantes, catálogo, publicidad, promociones, altas, solicitudes comerciales, configuración general y auditoría).
- R2 para imágenes de productos y publicidad cuando se habiliten cargas.
- Panel de restaurantes y de repartidores con roles propios, no acceso a funciones del admin global.

## Pantallas propuestas para Centro de Control
1. Inicio operativo: alertas, tareas pendientes, actividad reciente (sin saturar de estadísticas).
2. Restaurantes: altas, permisos, estados, horarios, menús y productos.
3. Publicidad: campañas, creativos, fechas, pausas, solicitudes y métricas agregadas.
4. Solicitudes: afiliaciones, repartidores y publicidad con estado de atención.
5. Configuración: módulos públicos activados, mensajes, categorías y aspecto global.
6. Pedidos/soporte, auditoría y permisos.
7. Botón «Ver como cliente» que abre la app pública; botón al portal administrativo protegido que exige sesión Access válida.

Todas las modificaciones globales deben validarse en el servidor y guardarse en D1. Definir historial y reversión, minimizar los permisos, y nunca confiar en que ocultar un botón impide acceso.

## Pendiente de lanzamiento real
Autenticación real para usuarios de negocios y repartidores; pruebas en navegadores reales; definición de precios de los planes y textos comerciales; revisión de simulaciones en pedidos, facturación, envío de formularios y pagos.
