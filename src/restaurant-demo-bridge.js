import {validStoredRestaurants,validStoredOrders} from './browser-storage.js';
/** Sincronización limitada a otras pestañas del MISMO navegador/origen de la demo.
 * No sustituye API, autenticación, sincronización entre equipos ni base de datos.
 */
const supported=new Set(['dv_orders','dv_places']);
export function decodeDemoStorageEvent(event){
 if(!event||!supported.has(event.key)||typeof event.newValue!=='string'||event.newValue.length>3_500_000)return null;
 try{
  const rows=JSON.parse(event.newValue);
  if(!Array.isArray(rows)||rows.length>500||!rows.every(v=>v&&typeof v==='object'&&!Array.isArray(v)&&v.id!==undefined))return null;
  if(event.key==='dv_places'&&!validStoredRestaurants(rows))return null;
  if(event.key==='dv_orders'&&!validStoredOrders(rows))return null;
  return {key:event.key,rows};
 }catch{return null}
}
export function recordRestaurantShift(businessId,note,orders=[],now=new Date()){
 const clean=String(note||'').trim().replace(/\s+/g,' ');
 if(!businessId&&businessId!==0)throw Error('No se ha seleccionado un restaurante.');
 if(clean.length<5||clean.length>400)throw Error('Escribí una nota de relevo entre 5 y 400 caracteres.');
 const relevant=(Array.isArray(orders)?orders:[]).filter(o=>String(o.placeId)===String(businessId)&&!['Entregado','Rechazado','Cancelado'].includes(o.status));
 return {
  id:typeof crypto!=='undefined'&&crypto.randomUUID?crypto.randomUUID():'shift-'+Date.now()+'-'+Math.random().toString(36).slice(2,7),
  restaurantId:String(businessId),note:clean,
  at:(now instanceof Date&&!Number.isNaN(+now)?now:new Date()).toISOString(),
  activeOrders:relevant.length,
 };
}
export const shiftLogKey=id=>'dv_online_shiftLog_'+String(id??'');

/** Evita bloquear Caja si una versión antigua dejó datos de relevo dañados.
 * No trata los registros locales como datos autenticados.
 */
export function normalizeRestaurantShiftLog(raw,businessId){
 if(!Array.isArray(raw))return [];
 return raw.filter(record=>
  record&&typeof record==='object'&&!Array.isArray(record)
  &&(typeof record.id==='string'||typeof record.id==='number')
  &&String(record.restaurantId)===String(businessId)
  &&typeof record.note==='string'&&record.note.trim().length>=5&&record.note.length<=400
  &&typeof record.at==='string'&&Number.isFinite(Date.parse(record.at))
  &&Number.isSafeInteger(Number(record.activeOrders))&&Number(record.activeOrders)>=0
 ).slice(0,25).map(record=>({
  id:String(record.id),restaurantId:String(businessId),note:record.note.trim(),
  at:record.at,activeOrders:Number(record.activeOrders)
 }));
}


/** Aplica cambios de ficha/menú/estado sobre el catálogo local MÁS RECIENTE.
 * Solo evita sobrescrituras secuenciales entre pestañas, no es atomicidad real.
 */
export function mutateDemoPlaces(storage,fallbackPlaces,change){
 if(typeof storage?.getItem!=='function'||typeof storage?.setItem!=='function')
  return {ok:false,reason:'El almacenamiento del navegador no está disponible.'};
 let latest;
 try{
  const raw=storage.getItem('dv_places');
  latest=raw===null?(Array.isArray(fallbackPlaces)?fallbackPlaces:[]):JSON.parse(raw);
 }catch{return {ok:false,reason:'El catálogo local no se pudo leer. No se aplicaron cambios.'}}
 if(!validStoredRestaurants(latest)||latest.length>500)
  return {ok:false,reason:'El catálogo guardado está dañado o excede el límite permitido.'};
 let next;
 try{next=change(latest)}catch{
  return {ok:false,reason:'No se pudo validar la modificación del restaurante.'};
 }
 if(!validStoredRestaurants(next)||next.length>500)
  return {ok:false,reason:'La modificación contiene productos inválidos. No se guardó.'};
 try{
  const content=JSON.stringify(next);
  if(content.length>3_200_000)throw Error('Almacenamiento local lleno');
  storage.setItem('dv_places',content);
  return {ok:true,places:next};
 }catch{return {ok:false,reason:'No se pudo guardar el catálogo en este navegador. Revisá el espacio.'}}
}
