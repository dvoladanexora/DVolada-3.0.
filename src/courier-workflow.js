/** Dvolada Online · reglas puras del panel repartidor (solo demostración local).
 * En producción TODAS estas reglas se repetirán en la API con autorización,
 * control transaccional del máximo de dos pedidos e identidad por sesión.
 */
import {applyOrderStatus} from './restaurant-order-flow.js';

export const MAX_ACTIVE_DELIVERIES=2;
export const RIDER_OFFER_STATUSES=Object.freeze(['Aceptado','Preparando','Listo']);
export const RIDER_ACTIVE_STATUSES=Object.freeze(['Aceptado','Preparando','Listo','Recogido','En camino','En ubicación','Cancelación solicitada']);
export const RIDER_TERMINAL_STATUSES=Object.freeze(['Entregado','Cancelado','Rechazado']);
export const DEMO_RIDERS=Object.freeze([
 {id:'demo-rider-1',name:'Repartidor demo 1'},
 {id:'demo-rider-2',name:'Repartidor demo 2'},
]);
export const riderKey=id=>'dv_rider_online_'+String(id||'');
export const riderIssueKey=id=>'dv_rider_issues_'+String(id||'');

export const isFoodDelivery=order=>order?.kind==='food'&&order?.delivery==='delivery';
export const isRiderOwner=(order,riderId)=>Boolean(riderId&&isFoodDelivery(order)&&String(order.courierId||'')===String(riderId)&&order.courierAccepted===true);
export const isCourierOffer=(order,riderId)=>Boolean(
 riderId&&isFoodDelivery(order)&&RIDER_OFFER_STATUSES.includes(order.status)
 &&!order.courierAccepted&&!order.courierId
 &&!(Array.isArray(order.courierDeclinedBy)&&order.courierDeclinedBy.includes(String(riderId)))
);
export const isCourierActive=(order,riderId)=>isRiderOwner(order,riderId)&&RIDER_ACTIVE_STATUSES.includes(order.status);
export function courierQueues(orders,riderId){
 const rows=Array.isArray(orders)?orders:[];
 const offers=rows.filter(o=>isCourierOffer(o,riderId));
 const active=rows.filter(o=>isCourierActive(o,riderId));
 const history=rows.filter(o=>isRiderOwner(o,riderId)&&RIDER_TERMINAL_STATUSES.includes(o.status));
 const byNewest=(a,b)=>(Date.parse(b.courierAssignedAt||b.createdAt||b.date||'')||0)-(Date.parse(a.courierAssignedAt||a.createdAt||a.date||'')||0);
 const byOldest=(a,b)=>(Date.parse(a.courierAssignedAt||a.createdAt||a.date||'')||0)-(Date.parse(b.courierAssignedAt||b.createdAt||b.date||'')||0);
 return {offers:offers.sort(byOldest),active:active.sort(byOldest),history:history.sort(byNewest),slotsRemaining:Math.max(0,MAX_ACTIVE_DELIVERIES-active.length)};
}
/** Resumen operativo, nunca inventa tiempos ni distancias. */
export function courierNextTask(orders,riderId){
 const priority={'En ubicación':0,'En camino':1,'Recogido':2,'Listo':3,'Preparando':4,'Aceptado':5,'Cancelación solicitada':6};
 const labels={'En ubicación':'Solicitar PIN y finalizar entrega','En camino':'Confirmar llegada al cliente','Recogido':'Iniciar recorrido al cliente',
 'Listo':'Recoger en el restaurante','Preparando':'Esperar preparación en cocina',
 'Aceptado':'Esperar que el restaurante marque Listo','Cancelación solicitada':'Esperar respuesta del restaurante'};
 const active=courierQueues(orders,riderId).active;
 if(!active.length)return null;
 const order=[...active].sort((a,b)=>(priority[a.status]??99)-(priority[b.status]??99))[0];
 return {orderId:order.id,orderNo:order.orderNo||order.id,status:order.status,
  restaurant:order.placeName||'Restaurante',next:labels[order.status]||'Revisar pedido'};
}
export const COURIER_NEXT=Object.freeze({
 pickup:{from:'Listo',to:'Recogido'},
 route:{from:'Recogido',to:'En camino'},
 arrive:{from:'En camino',to:'En ubicación'},
 deliver:{from:'En ubicación',to:'Entregado'},
});
export function validateCourierAction(orders,orderId,action,riderId,options={}){
 const rows=Array.isArray(orders)?orders:[];
 const order=rows.find(o=>String(o.id)===String(orderId));
 if(!order)return {ok:false,reason:'La orden ya no está disponible.'};
 if(!riderId)return {ok:false,reason:'Seleccioná una identidad de prueba.'};
 if(action==='decline'){
  if(!isCourierOffer(order,riderId))return {ok:false,reason:'La oferta ya no está disponible para vos.'};
  return {ok:true,order};
 }
 if(action==='accept'){
  if(!options.online)return {ok:false,reason:'Activá tu disponibilidad antes de aceptar.'};
  if(!isCourierOffer(order,riderId))return {ok:false,reason:'El restaurante todavía no aceptó el pedido, o ya fue asignado.'};
  if(courierQueues(rows,riderId).slotsRemaining===0)return {ok:false,reason:'Ya tenés dos entregas activas. Terminá una antes de aceptar otra.'};
  return {ok:true,order};
 }
 if(!isRiderOwner(order,riderId))return {ok:false,reason:'Esta entrega no está asignada a tu cuenta.'};
 const transition=COURIER_NEXT[action];
 if(!transition||order.status!==transition.from)return {ok:false,reason:'Esta acción no corresponde al estado actual del pedido.'};
 if(action==='arrive'&&!options.gpsVerified&&!options.demoSimulation)return {ok:false,reason:'Confirmá la llegada con GPS o la simulación local autorizada.'};
 if(action==='deliver'){
  const pin=String(options.pin||'').trim();
  if(!/^\d{6}$/.test(pin))return {ok:false,reason:'Ingresá los seis dígitos del PIN entregados por el cliente.'};
  if(pin!==String(order.pin||''))return {ok:false,reason:'PIN incorrecto. Consultá al cliente; no revelamos el PIN.'};
 }
 return {ok:true,order};
}
export function applyCourierAction(orders,orderId,action,riderId,options={},at=new Date()){
 const verdict=validateCourierAction(orders,orderId,action,riderId,options);
 if(!verdict.ok)return {ok:false,reason:verdict.reason,orders};
 const stamp=at instanceof Date&&!Number.isNaN(+at)?at.toISOString():new Date().toISOString();
 const next=(Array.isArray(orders)?orders:[]).map(o=>{
  if(String(o.id)!==String(orderId))return o;
  if(action==='decline'){
   return {...o,courierDeclinedBy:[...new Set([...(Array.isArray(o.courierDeclinedBy)?o.courierDeclinedBy:[]),String(riderId)])].slice(-40)};
  }
  if(action==='accept'){
   return {...o,courierId:String(riderId),courierAccepted:true,courierAssignedAt:stamp};
  }
  const updated=applyOrderStatus(o,COURIER_NEXT[action].to,{},at);
  if(action==='pickup')return {...updated,courierPickedUpAt:stamp};
  if(action==='arrive')return {...updated,courierArrivalAt:stamp};
  if(action==='deliver')return {...updated,courierDeliveredAt:stamp};
  return updated;
 });
 return {ok:true,orders:next,order:next.find(o=>String(o.id)===String(orderId))};
}
/** Proyección mínima para que la UI de ofertas no reciba datos de clientes.
 * El navegador de demostración conserva los originales para validar acciones;
 * en producción la API debe devolver esta proyección desde el servidor.
 */
/** Campos explícitos permitidos en la vista asignada. No usar ...rest:
 * un futuro campo sensible (PIN, documento, secreto, auditoría) no debe
 * aparecer automáticamente en el panel repartidor.
 */
export const COURIER_ASSIGNED_FIELDS=Object.freeze([
 'id','orderNo','kind','delivery','status','placeId','placeName',
 'createdAt','date','name','phone','address','notes','payment','total','items',
 'courierAssignedAt','courierAccepted','courierId','courierPickedUpAt',
 'courierArrivalAt','courierDeliveredAt','cancelReason',
 'deliveryCoordinates','customerCoords','customerLocation','location','deliveryLat','deliveryLng'
]);
export function courierPublicOrder(order){
 if(!order||typeof order!=='object')return null;
 const result={};
 for(const key of COURIER_ASSIGNED_FIELDS){
  if(!Object.hasOwn(order,key))continue;
  if(key==='items'){
   result.items=Array.isArray(order.items)?order.items.slice(0,200).map(item=>({
    id:item?.id,qty:item?.qty,name:item?.name
   })):[];
  }else result[key]=order[key];
 }
 return result;
}
export function courierViewOrder(order,riderId){
 if(isRiderOwner(order,riderId))return courierPublicOrder(order);
 if(!isCourierOffer(order,riderId))return null;
 const {id,orderNo,kind,delivery,status,placeId,placeName,createdAt,date,items}=order;
 return {id,orderNo,kind,delivery,status,placeId,placeName,createdAt,date,
  items:Array.isArray(items)?items.map(item=>({qty:Math.min(50,Math.max(1,Number(item?.qty)||1))})):[]};
}
export const courierViewOrders=(orders,riderId)=>(Array.isArray(orders)?orders:[]).map(order=>courierViewOrder(order,riderId)).filter(Boolean);
export const pinAttemptKey=id=>'dv_courier_pin_attempts_'+String(id||'');
export function sanitizePinAttempts(value){
 if(!value||typeof value!=='object'||Array.isArray(value))return {};
 const entries=Object.entries(value).filter(([key,count])=>key.length>0&&key.length<120&&Number.isInteger(count)&&count>0);
 return Object.fromEntries(entries.slice(-100).map(([key,count])=>[key,Math.min(3,count)]));
}
export function incrementPinAttempt(value,orderId){
 const previous=sanitizePinAttempts(value),key=String(orderId||'');
 if(!key||key.length>=120)return previous;
 return sanitizePinAttempts({...previous,[key]:Math.min(3,(previous[key]||0)+1)});
}
export function courierOrderCoords(order){
 const value=order?.deliveryCoordinates||order?.customerCoords||order?.customerLocation||order?.location;
 const lat=Number(value?.lat??value?.latitude??order?.deliveryLat);
 const lng=Number(value?.lng??value?.longitude??value?.lon??order?.deliveryLng);
 return Number.isFinite(lat)&&Number.isFinite(lng)&&Math.abs(lat)<=90&&Math.abs(lng)<=180&&(lat!==0||lng!==0)?{lat,lng}:null;
}
export function courierRestaurantCoords(place){
 const value=place?.coordinates||place?.location||place;
 const lat=Number(value?.lat??value?.latitude);
 const lng=Number(value?.lng??value?.longitude??value?.lon);
 return Number.isFinite(lat)&&Number.isFinite(lng)&&Math.abs(lat)<=90&&Math.abs(lng)<=180&&(lat!==0||lng!==0)?{lat,lng}:null;
}
export const COURIER_INCIDENT_CATEGORIES=Object.freeze([
 'No encuentro al cliente',
 'Problema con la dirección',
 'Pedido incorrecto o dañado',
 'Avería o accidente',
 'Otro',
]);
export const cleanCourierIssue=message=>{
 const note=String(message||'').trim().replace(/\s+/g,' ');
 if(note.length<8||note.length>300)throw Error('Describí el problema en 8 a 300 caracteres.');
 return note;
};
export function buildCourierIssue(order,riderId,message,at=new Date(),category='Otro'){
 if(!isRiderOwner(order,riderId))throw Error('Solo podés reportar problemas de tus entregas.');
 if(!COURIER_INCIDENT_CATEGORIES.includes(category))throw Error('Seleccioná una categoría válida de incidencia.');
 return {id:'inc-'+Date.now()+'-'+Math.random().toString(36).slice(2,7),orderId:String(order.id),courierId:String(riderId),category,note:cleanCourierIssue(message),createdAt:at.toISOString(),status:'Borrador local · sin enviar'};
}
