/** Lectura segura de datos guardados por versiones anteriores.
 * La vista previa usa localStorage; no sustituye migraciones de servidor.
 */
const idLists=new Set(['dv_orders','dv_places','dv_cart']);
/** Valida la estructura mínima antes de usar datos heredados o emitidos por otra pestaña.
 * No sustituye la validación del catálogo ni la autorización del servidor.
 */
export function validStoredRestaurants(rows){
 if(!Array.isArray(rows)||rows.length>500)return false;
 const businessIds=new Set();
 return rows.every(place=>{
  if(!place||typeof place!=='object'||Array.isArray(place)
   ||!['number','string'].includes(typeof place.id)||!String(place.id).trim()
   ||typeof place.name!=='string'||!place.name.trim()||!Array.isArray(place.items)
   ||place.items.length>150)return false;
  const businessId=String(place.id);
  if(businessIds.has(businessId))return false;
  businessIds.add(businessId);
  const productIds=new Set();
  return place.items.every(item=>{
   if(!item||typeof item!=='object'||Array.isArray(item)
    ||!['number','string'].includes(typeof item.id)||!String(item.id).trim()
    ||typeof item.name!=='string'||!item.name.trim()
    ||item.price===null||item.price===undefined||item.price===''
    ||!Number.isFinite(Number(item.price)))return false;
   const id=String(item.id);
   if(productIds.has(id))return false;
   productIds.add(id);
   return true;
  });
 });
}
/** Rechaza IDs repetidos o filas dañadas: la UI y las transiciones buscan por ID. */
export function validStoredOrders(rows){
 if(!Array.isArray(rows)||rows.length>500)return false;
 const ids=new Set();
 return rows.every(row=>{
  if(!row||typeof row!=='object'||Array.isArray(row)
    ||row.id==null||!['number','string'].includes(typeof row.id)
    ||typeof row.status!=='string'||!row.status.trim()||row.status.length>60)return false;
  const id=String(row.id);
  if(!id.trim()||id.length>150||ids.has(id))return false;
  ids.add(id);
  return true;
 });
}
export function safeReadStored(storage,key,fallback){
 try{
  const raw=storage?.getItem?.(key);
  if(typeof raw!=='string')return fallback;
  const value=JSON.parse(raw);
  if(value===null)return fallback;
  if(Array.isArray(fallback)){
   if(!Array.isArray(value))return fallback;
   if(idLists.has(key)&&!value.every(row=>row&&typeof row==='object'&&!Array.isArray(row)&&row.id!==null&&row.id!==undefined))
    return fallback;
   if(key==='dv_orders'&&!validStoredOrders(value))return fallback;
   if(key==='dv_places'&&!validStoredRestaurants(value))return fallback;
   return value;
  }
  if(fallback&&typeof fallback==='object')return value&&typeof value==='object'&&!Array.isArray(value)?value:fallback;
  if(typeof value!==typeof fallback)return fallback;
  return value;
 }catch{return fallback}
}
