/** Lectura segura de datos guardados por versiones anteriores.
 * La vista previa usa localStorage; no sustituye migraciones de servidor.
 */
const idLists=new Set(['dv_orders','dv_places','dv_cart']);
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
   if(key==='dv_orders'&&!value.every(row=>typeof row.status==='string'))return fallback;
   if(key==='dv_places'&&!value.every(row=>Array.isArray(row.items)))return fallback;
   return value;
  }
  if(fallback&&typeof fallback==='object')return value&&typeof value==='object'&&!Array.isArray(value)?value:fallback;
  if(typeof value!==typeof fallback)return fallback;
  return value;
 }catch{return fallback}
}
