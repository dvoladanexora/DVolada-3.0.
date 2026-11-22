/* Authenticated Dvolada API client. Session tokens exist only in volatile memory. */
export class LiveApiError extends Error {
 constructor(code,status,details={}){super(code);this.name='LiveApiError';this.code=code;this.status=status;this.details=details}
}
export function validateApiOrigin(value){
 let parsed;
 try{parsed=new URL(value)}catch{throw new Error('Configurá la URL HTTPS de la API de Dvolada')}
 const local=parsed.protocol==='http:'&&['localhost','127.0.0.1'].includes(parsed.hostname);
 if(parsed.protocol!=='https:'&&!local||parsed.username||parsed.password||parsed.pathname!=='/'&&
  parsed.pathname!==''||parsed.search||parsed.hash)throw Error('La API requiere una dirección HTTPS segura');
 return parsed.origin;
}
export function createLiveApi({baseUrl,getSessionToken,getClientAccount=()=>null,fetchImpl=fetch}){
 const origin=validateApiOrigin(baseUrl);
 if(typeof getSessionToken!=='function')throw Error('Session provider required');
 async function request(path,{method='GET',body,auth=true,cookie=false,restaurantId,key,signal}={}){
  const token=auth?getSessionToken():null;
  const account=auth&&!token?getClientAccount():null;
  if(auth&&!token&&!account&&!cookie)throw new LiveApiError('SESSION_REQUIRED',401);
  const headers={Accept:'application/json'};
  if(body!==undefined)headers['Content-Type']='application/json';
  if(token)headers.Authorization='Bearer '+token;
  if(account)headers['X-Client-Account']=account;
  if(restaurantId)headers['X-Restaurant-ID']=restaurantId;
  if(key)headers['Idempotency-Key']=key;
  let res;
  try{res=await fetchImpl(origin+path,{method,headers,cache:'no-store',signal,
   ...(body===undefined?{}:{body:JSON.stringify(body)})})}
  catch{throw new LiveApiError('SIN_CONEXION',0)}
  let result={};
  try{if(res.status!==204)result=await res.json()}catch{throw new LiveApiError('RESPUESTA_INVALIDA',res.status)}
  if(!res.ok)throw new LiveApiError(result.error||'ERROR_SERVIDOR',res.status,result);
  return result;
 }
 const s=id=>encodeURIComponent(id);
 return {
  health:()=>request('/health',{auth:false}),
  restaurants:()=>request('/api/v1/catalog/restaurants',{auth:false}),
  products:id=>request('/api/v1/catalog/restaurants/'+s(id)+'/products',{auth:false}),
  searchProducts:(term,signal)=>request('/api/v1/catalog/search?q='+s(term),{auth:false,signal}),
  exchange:(idToken,deviceLabel)=>request('/api/v1/auth/exchange',{auth:false,method:'POST',body:{idToken,deviceLabel}}),
  me:(cookie=false)=>request('/api/v1/auth/me',{cookie}),
  clientAccess:()=>request('/api/v1/auth/client/config',{auth:false}),
  clientAuthenticate:(operation,body)=>request('/api/v1/auth/client/'+s(operation),{auth:false,method:'POST',body}),
  clientProfile:()=>request('/api/v1/customer/profile'),
  renameClient:displayName=>request('/api/v1/customer/profile',{method:'PATCH',body:{displayName}}),
  favorites:()=>request('/api/v1/customer/favorites'),
  setFavorite:(id,favorite)=>request('/api/v1/customer/favorites/'+s(id),{method:'PATCH',body:{favorite}}),
  chat:(id,channel)=>request('/api/v1/orders/'+s(id)+'/chat/'+s(channel)),
  sendMessage:(id,channel,message,key)=>request('/api/v1/orders/'+s(id)+'/chat/'+s(channel),{method:'POST',key,body:{message}}),
  claim:id=>request('/api/v1/orders/'+s(id)+'/claim'),
  sendClaim:(id,category,message)=>request('/api/v1/orders/'+s(id)+'/claim',{method:'POST',body:{category,message}}),
  pushIdentity:()=>request('/api/v1/push/identity',{method:'POST'}),
  logout:()=>request('/api/v1/auth/logout',{method:'POST'}),
  publicFlash:()=>request('/api/v1/catalog/flash',{auth:false}),
  customerFlash:()=>request('/api/v1/customer/flash'),
  adminFlash:()=>request('/api/v1/admin/flash'),
  flashProducts:id=>request('/api/v1/admin/flash?restaurant='+s(id)),
  createFlash:body=>request('/api/v1/admin/flash',{method:'POST',body}),
  stopFlash:id=>request('/api/v1/admin/flash/'+s(id),{method:'PATCH'}),
  customerOrders:()=>request('/api/v1/customer/orders'),
  customerOrder:id=>request('/api/v1/customer/orders/'+s(id)),
  coupon:(restaurantId,coupon)=>request('/api/v1/customer/coupon',{method:'POST',body:{restaurantId,coupon}}),
  createOrder:(body,key)=>request('/api/v1/customer/orders',{method:'POST',body,key}),
  checkoutStatus:key=>request('/api/v1/customer/orders/checkout',{key}),
  cancelOrder:(order,key)=>request('/api/v1/customer/orders/'+s(order.id)+'/cancel',{method:'POST',
   body:{expectedVersion:order.version},key}),
  restaurantOrders:(restaurantId,cursor)=>request('/api/v1/restaurant/orders'+
   (cursor?'?cursor='+encodeURIComponent(cursor):''),{restaurantId}),
  restaurantChanges:(restaurantId,cursor='0')=>request('/api/v1/restaurant/orders/changes?since='+s(cursor),{restaurantId}),
  restaurantOrder:(restaurantId,id)=>request('/api/v1/restaurant/orders/'+s(id),{restaurantId}),
  restaurantCapabilities:restaurantId=>request('/api/v1/restaurant/capabilities',{restaurantId}),
  eligibleCouriers:restaurantId=>request('/api/v1/restaurant/couriers',{restaurantId}),
  restaurantProducts:restaurantId=>request('/api/v1/restaurant/products',{restaurantId}),
  createProduct:(restaurantId,body)=>request('/api/v1/restaurant/products',
    {method:'POST',restaurantId,body}),
  updateProduct:(restaurantId,id,body)=>request('/api/v1/restaurant/products/'+s(id),
    {method:'PATCH',restaurantId,body}),
  updateAvailability:(restaurantId,state)=>request('/api/v1/restaurant/availability',
    {method:'PATCH',restaurantId,body:{state}}),
  restaurantStatus:(restaurantId,order,status,key)=>request('/api/v1/restaurant/orders/'+s(order.id)+'/status',
   {restaurantId,method:'PATCH',key,body:{expectedVersion:order.version,status}}),
  assignCourier:(restaurantId,order,courierId,key)=>request('/api/v1/restaurant/orders/'+s(order.id)+'/assign',
   {restaurantId,method:'PATCH',key,body:{courierId,expectedVersion:order.version}}),
  courierOrders:()=>request('/api/v1/courier/orders'),
  courierOffer:(order,action,key)=>request('/api/v1/courier/orders/'+s(order.id)+'/offer',
   {method:'POST',key,body:{action,expectedVersion:order.version}}),
  courierStatus:(order,status,key)=>request('/api/v1/courier/orders/'+s(order.id)+'/status',
   {method:'PATCH',key,body:{status,expectedVersion:order.version}}),
  courierDeliver:(order,pin,key)=>request('/api/v1/courier/orders/'+s(order.id)+'/deliver',
   {method:'POST',key,body:{expectedVersion:order.version,pin}}),
  adminAudit:()=>request('/api/v1/admin/audit'),
  adminOverview:()=>request('/api/v1/admin/overview'),
  adminRestaurants:()=>request('/api/v1/admin/restaurants'),
  adminCreateRestaurant:body=>request('/api/v1/admin/restaurants',{method:'POST',body}),
  adminUpdateRestaurant:(id,body)=>request('/api/v1/admin/restaurants/'+s(id),{method:'PATCH',body}),
  adminAssignMember:(id,body)=>request('/api/v1/admin/restaurants/'+s(id)+'/members',{method:'POST',body}),
  adminEnrollCourier:userId=>request('/api/v1/admin/couriers',{method:'POST',body:{userId}})
 };
}
