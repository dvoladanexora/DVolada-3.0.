/** Visibilidad de funciones en el lanzamiento público.
 * Estos indicadores son de UX, NO sustituyen autenticación ni permisos del servidor.
 * Para inspeccionar el panel de demostración en un entorno LOCAL de Vite:
 * VITE_DVOLADA_INTERNAL_PREVIEW=true npm run dev
 * No habilitar acceso interno en producción ni publicar un build de demostración.
 */
export const INTERNAL_PREVIEW_ENABLED=Boolean(import.meta.env.DEV&&import.meta.env.VITE_DVOLADA_INTERNAL_PREVIEW==='true');
export const CUSTOMER_HIDDEN_PAGES=Object.freeze([
 'groceries', // Dvolada Mandados: pendiente de lanzamiento
 'express',   // Dvolada Express: pendiente de lanzamiento
 'rewards',   // Dvolada Club: todavía sin reglas definitivas
 'group',     // Pedidos grupales: sin sincronización multiusuario
 'driver',    // Pruebas de repartidor
 'admin',     // Panel administrativo local no autenticado
 'delivery-panel' // Panel de repartidor local no autenticado
]);
export const isPubliclyHidden=page=>CUSTOMER_HIDDEN_PAGES.includes(page)&&
 !(INTERNAL_PREVIEW_ENABLED&&['driver','admin','delivery-panel'].includes(page));

/** Protege la web pública: NO registrar órdenes locales como si las recibiera un negocio.
 * El checkout comercial debe quedar habilitado exclusivamente tras integrar una API
 * autenticada con confirmación persistente, versión y idempotencia en el servidor.
 * Una variable Vite del build de producción NO puede activar esta demostración.
 */
export const DEMO_ORDER_WRITES_ENABLED=INTERNAL_PREVIEW_ENABLED;
