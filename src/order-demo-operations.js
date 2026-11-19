/** Transiciones de la demostración en una sola pestaña.
 * La versión comercial debe ejecutar cada operación como transacción autorizada
 * en el servidor y usar la versión del pedido; este módulo NO autentica usuarios.
 */
import {applyOrderStatus} from './restaurant-order-flow.js';
import {canMoveRestaurantOrder,scheduledOrderState} from './kitchen-operations.js';

const foodOrder=o=>o&&o.kind==='food';
const immutableStatuses=new Set(['Cancelado','Rechazado','Entregado']);
const cancellable=new Set(['Programado','Pendiente','Aceptado','Preparando']);
const rejectionReason=message=>typeof message==='string'&&message.trim().length>=5&&message.trim().length<=220;
const stamp=at=>at instanceof Date&&!Number.isNaN(+at)?at.toISOString():new Date().toISOString();

export function cancelDemoOrder(orders,orderId,reason,at=new Date()){
 const rows=Array.isArray(orders)?orders:[];
 const message=String(reason||'').trim();
 if(message.length<5||message.length>220)return {ok:false,reason:'Escribí un motivo de 5 a 220 caracteres.',orders:rows};
 const order=rows.find(o=>String(o.id)===String(orderId));
 if(!foodOrder(order))return {ok:false,reason:'Ese pedido ya no está disponible.',orders:rows};
 if(!cancellable.has(order.status))return {ok:false,reason:'El estado del pedido cambió. Revisá su estado actual antes de cancelar.',orders:rows};
 const immediate=order.status==='Pendiente'||order.status==='Programado';
 const timestamp=stamp(at);
 const status=immediate?'Cancelado':'Cancelación solicitada';
 const updated={...applyOrderStatus(order,status,{},at),cancelReason:message,
  cancelRequestedAt:timestamp,cancelRequestedBy:'Cliente',
  statusBeforeCancellation:order.status};
 return{ok:true,orders:rows.map(o=>o===order?updated:o),order:updated,immediate};
}

/** El estado esperado evita actuar sobre tarjetas desactualizadas.
 * `area` proviene de la pantalla local; es una guía de UX, NO un permiso.
 */
export function changeDemoRestaurantOrder(orders,{orderId,restaurantId,expectedStatus,toStatus,area='cashier',metadata={}},at=new Date()){
 const rows=Array.isArray(orders)?orders:[];
 const order=rows.find(o=>String(o.id)===String(orderId));
 if(!foodOrder(order)||String(order.placeId)!==String(restaurantId))
  return {ok:false,reason:'Este pedido no pertenece al restaurante seleccionado.',orders:rows};
 if(!expectedStatus||order.status!==expectedStatus)
  return {ok:false,reason:'El pedido cambió desde que abriste la tarjeta. Actualizá el estado y reintentá.',orders:rows};
 if(immutableStatuses.has(order.status))
  return {ok:false,reason:'La orden ya está finalizada y no puede reabrirse.',orders:rows};
 if(area!=='cashier'&&area!=='kitchen')
  return {ok:false,reason:'Esta operación debe realizarse desde Caja o Cocina.',orders:rows};
 if(area==='cashier'&&order.status==='Programado'&&toStatus==='Pendiente'){
  if(scheduledOrderState(order,at.getTime())!=='due')
   return {ok:false,reason:'Este pedido programado todavía no alcanzó su hora.',orders:rows};
 }else if(area==='cashier'&&order.status==='Pendiente'&&toStatus==='Rechazado'){
  if(!rejectionReason(metadata.rejectionReason))
   return {ok:false,reason:'Ingresá un motivo válido para rechazar el pedido.',orders:rows};
 }else if(area==='cashier'&&order.status==='Cancelación solicitada'){
  if(toStatus==='Cancelado'){} // aprobación con motivo del cliente ya registrado
  else if(toStatus===order.statusBeforeCancellation&&['Aceptado','Preparando'].includes(toStatus)){
   if(!rejectionReason(metadata.cancelResponseReason))
    return {ok:false,reason:'Explicá por qué no se puede cancelar.',orders:rows};
  }else return {ok:false,reason:'La resolución de cancelación no corresponde al estado anterior.',orders:rows};
 }else if(!canMoveRestaurantOrder(order.status,toStatus,area)){
  return {ok:false,reason:'La transición no corresponde al estado actual de la orden o al área.',orders:rows};
 }
 const updated=applyOrderStatus(order,toStatus,metadata,at);
 return{ok:true,orders:rows.map(o=>o===order?updated:o),order:updated};
}


/** Guarda el lote antes de anunciar éxito o actualizar los paneles de prueba.
 * Protege frente a cuota/almacenamiento bloqueado, pero NO resuelve concurrencia
 * entre pestañas o dispositivos: Work debe usar transacciones e idempotencia API.
 */
export function persistDemoOrders(storage,nextOrders){
 if(!Array.isArray(nextOrders)||nextOrders.length>500
  ||!nextOrders.every(row=>row&&typeof row==='object'&&!Array.isArray(row)&&row.id!=null&&typeof row.status==='string'))
  return {ok:false,reason:'Hay demasiados pedidos de prueba o un registro inválido. No se guardaron los cambios.'};
 try{
  if(typeof storage?.setItem!=='function')throw Error('Almacenamiento no disponible');
  const serialized=JSON.stringify(nextOrders);
  if(serialized.length>3_500_000)throw Error('Capacidad de demostración excedida');
  storage.setItem('dv_orders',serialized);
  return {ok:true};
 }catch{
  return {ok:false,reason:'No se pudo guardar el pedido de prueba en este dispositivo. Revisá el espacio disponible; los cambios no se aplicaron.'};
 }
}
