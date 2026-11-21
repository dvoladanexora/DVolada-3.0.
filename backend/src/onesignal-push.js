// Server-only OneSignal sending helper. No user-controlled audience or public route.
// Call only from authenticated, validated order transitions AFTER linking subscriptions
// to the order's customer, restaurant staff, and courier on the trusted backend.
const DESTINATION='https://api.onesignal.com/notifications';
const UUID=/^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i;
const ALLOWED_KINDS=new Set(['order_created','order_accepted','order_preparing',
 'order_ready','courier_assigned','order_collected','order_on_the_way','order_arrived',
 'order_delivered','order_cancelled']);

async function eventKey(orderId, kind, eventId){
 const digest = new Uint8Array(await crypto.subtle.digest('SHA-256',
  new TextEncoder().encode('dvolada:push:'+orderId+':'+kind+':'+(eventId??''))));
 digest[6]=(digest[6]&0x0f)|0x40;
 digest[8]=(digest[8]&0x3f)|0x80;
 const hex=Array.from(digest.slice(0,16),byte=>byte.toString(16).padStart(2,'0')).join('');
 return [hex.slice(0,8),hex.slice(8,12),hex.slice(12,16),hex.slice(16,20),hex.slice(20)].join('-');
}

export async function sendOrderPush(env,{subscriptionIds,externalIds,eventId,kind,orderNumber,orderId,fetcher=fetch}={}){
 if(env.PUSH_NOTIFICATIONS_ENABLED!=='true')return {sent:false,reason:'disabled'};
 if(!env.ONESIGNAL_APP_ID||!env.ONESIGNAL_REST_API_KEY)return {sent:false,reason:'unconfigured'};
 if(!UUID.test(env.ONESIGNAL_APP_ID))throw new Error('Invalid OneSignal app configuration');
 if(!ALLOWED_KINDS.has(kind)||!UUID.test(orderId)||typeof orderNumber!=='string'||
   !/^[\p{L}\p{N} #_-]{1,32}$/u.test(orderNumber))throw new Error('Invalid event');
 const useAlias=externalIds!==undefined;
 if(useAlias&&subscriptionIds!==undefined)throw new Error('Exactly one audience is allowed');
 const values=useAlias?externalIds:subscriptionIds;
 if(!Array.isArray(values)||!values.length||values.length>25||
   values.some(id=>typeof id!=='string'||!(useAlias?id.startsWith('dvolada-qa:')&&UUID.test(id.slice(11)):UUID.test(id))))
  throw new Error('Invalid authorized subscriptions');
 if(useAlias&&(!Number.isSafeInteger(eventId)||eventId<1))throw new Error('Invalid event ID');
 const ids=[...new Set(values)];
 const audience=useAlias?{include_aliases:{external_id:ids}}:{include_subscription_ids:ids};
 const titles={
  order_created:'Nuevo pedido en Dvolada',
  order_accepted:'¡Tu pedido fue aceptado!',
  order_preparing:'Tu pedido está en preparación',
  order_ready:'Tu pedido está listo',
  courier_assigned:'Nueva solicitud de entrega',
  order_collected:'El pedido fue recogido',
  order_on_the_way:'¡Tu pedido va en camino!',
  order_arrived:'Tu repartidor llegó',
  order_delivered:'Pedido entregado',
  order_cancelled:'Actualización de pedido'
 };
 const response=await fetcher(DESTINATION,{
  method:'POST',headers:{Authorization:'Key '+env.ONESIGNAL_REST_API_KEY,
   'Content-Type':'application/json'},
  body:JSON.stringify({
   app_id:env.ONESIGNAL_APP_ID,
   ...audience,
   idempotency_key:await eventKey(orderId,kind,eventId),
   target_channel:'push',
   headings:{es:titles[kind]},
   contents:{es:useAlias?'Abrí Dvolada para consultar el estado.':'Pedido '+orderNumber+'. Consultá su estado en Dvolada.'},
   data:useAlias?{type:kind}:{type:kind,orderId},
   ...(useAlias?{url:'https://dvolada-qa.dvoladanexora.workers.dev/pruebas'}:{}),
   ttl:3600
  })
 });
 if(!response.ok){
  // Do not log response bodies or authorization headers; avoid leaking provider details.
  return {sent:false,reason:'provider-error',status:response.status};
 }
 const result=await response.json().catch(()=>({}));
 return {sent:Boolean(result.id),reason:result.id?'accepted':'provider-rejected'};
}
