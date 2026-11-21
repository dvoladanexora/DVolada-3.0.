/** Eliminación explícita de datos de la DEMOSTRACIÓN del cliente.
 * Solo afecta este navegador; no simula una solicitud de borrado al servidor.
 * El usuario debe cerrar otras pestañas Dvolada para evitar que escriban otra vez.
 */
export const CUSTOMER_STORAGE_KEYS=Object.freeze([
 'dv_local_profile','dv_cart','dv_orders','dv_reviews','dv_favorites',
 'dv_favorite_orders','dv_addresses','dv_support_reports','dv_chat_messages',
 'dv_invite_code'
]);
export function clearLocalCustomerData(storage){
 if(!storage||typeof storage.removeItem!=='function')return {ok:false,removed:0,failed:[...CUSTOMER_STORAGE_KEYS]};
 let removed=0,failed=[];
 for(const key of CUSTOMER_STORAGE_KEYS){
  try{storage.removeItem(key);removed++}
  catch{failed.push(key)}
 }
 return {ok:failed.length===0,removed,failed};
}
