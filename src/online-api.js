/**
 * Dvolada Online API client.
 * No localStorage tokens or demo credentials. An authenticated session provider
 * must supply an access token before enabling real orders.
 */
export class OnlineApiError extends Error {
 constructor(message,status,details){super(message);this.name='OnlineApiError';this.status=status;this.details=details}
}
export function createOnlineApi({baseUrl,getAccessToken,fetchImpl=fetch}){
 let parsed;
 try{parsed=new URL(baseUrl)}catch{throw Error('Online API requires a valid HTTPS URL (or localhost for development)')}
 const local=parsed.protocol==='http:'&&parsed.hostname==='localhost';
 if(parsed.protocol!=='https:'&&!local)throw Error('Online API requires HTTPS (or localhost for development)');
 if(parsed.username||parsed.password||parsed.search||parsed.hash||parsed.pathname!=='/'&&parsed.pathname!=='')throw Error('Online API URL must be an origin without credentials, path, query or fragment');
 if(typeof getAccessToken!=='function')throw Error('Authenticated token provider required');
 const base=parsed.origin;
 async function request(path,{method='GET',body,signal,idempotencyKey}={}){
  const token=await getAccessToken();
  if(!token)throw new OnlineApiError('Sesión no disponible',401);
  let response;
  try{
   response=await fetchImpl(base+path,{
    method,signal,cache:'no-store',
    headers:{Authorization:'Bearer '+token,...(body?{'Content-Type':'application/json'}:{}),...(idempotencyKey?{'Idempotency-Key':idempotencyKey}:{})},
    ...(body?{body:JSON.stringify(body)}:{})
   });
  }catch(error){
   if(signal?.aborted)throw error;
   // Un PATCH pudo alcanzar al servidor aunque se perdiera la respuesta.
   // NO reintentar automáticamente: volver a leer el estado primero.
   throw new OnlineApiError(method==='PATCH'
    ?'Se interrumpió la conexión. Verificá el estado actual del pedido antes de intentar otra vez.'
    :'No se pudo conectar con el servidor. Revisá tu conexión e intentá nuevamente.',0);
  }
  let data;
  try{data=await response.json()}catch{}
  const valid=data&&typeof data==='object'&&!Array.isArray(data);
  if(!response.ok)throw new OnlineApiError(
   valid&&typeof data.error==='string'?data.error:'Error de servidor',
   response.status,valid?data:null
  );
  if(!valid)throw new OnlineApiError('El servidor respondió con datos inválidos. No se aplicó ningún cambio local.',502);
  return data;
 }
 return {
  capabilities:(signal)=>request('/api/v1/restaurant/capabilities',{signal}),
  listOrders:(signal)=>request('/api/v1/restaurant/orders',{signal}),
  getOrder:(id,signal)=>request('/api/v1/restaurant/orders/'+encodeURIComponent(id),{signal}),
  changes:(cursor='0',signal)=>request('/api/v1/restaurant/orders/changes?since='+encodeURIComponent(cursor),{signal}),
  async updateStatus(order,status){
   if(!order?.id||!Number.isSafeInteger(order.version))throw Error('Pedido sin versión del servidor');
   if(typeof crypto==='undefined'||typeof crypto.randomUUID!=='function')throw Error('Se requiere un navegador seguro para generar clave única');
   return request('/api/v1/restaurant/orders/'+encodeURIComponent(order.id)+'/status',{
    method:'PATCH',idempotencyKey:crypto.randomUUID(),
    body:{status,expectedVersion:order.version}
   });
  }
 };
}
/**
 * A 409 means another employee changed the order. Caller must show the latest
 * state and require a fresh explicit choice; never automatically retry a PATCH.
 */
export function conflictMessage(error){
 return error instanceof OnlineApiError&&error.status===409
  ?'Otro empleado modificó este pedido. Revisá el estado actualizado antes de continuar.'
  :null;
}
