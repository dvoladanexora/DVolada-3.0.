import {courierProfile} from './courier-workspace.js';
import {resolveFlash} from './flash.js';
import {
 ApiError,requireUuid,requireInteger,requireText,requireKeys,readJson,sha256,
 idempotencyKey,sqlConflict,requireRole,requireStaff,deliveryPin
} from './security.js';

const CLOSED=['Entregado','Cancelado','Rechazado'];
const staffMoves={
 Pendiente:['Aceptado','Rechazado'],
 Aceptado:['Preparando','Cancelado'],
 Preparando:['Listo','Cancelado'],
 Listo:['Entregado']
};
const courierMoves={
 Listo:['Recogido'],
 Recogido:['En camino'],
 'En camino':['En ubicación']
};
const dataOrder=`SELECT id,restaurant_id,customer_id,courier_id,order_number,delivery_method,
 delivery_address,customer_note,status,version,courier_response,courier_offer_expires_at,subtotal_minor,delivery_fee_minor,total_minor,discount_minor,flash_gift_name,pin_attempts,
 created_at,updated_at FROM online_orders`;
const briefOrder=`SELECT id,restaurant_id,courier_id,order_number,delivery_method,status,version,courier_response,courier_offer_expires_at,
 subtotal_minor,delivery_fee_minor,total_minor,discount_minor,flash_gift_name,created_at,updated_at FROM online_orders`;
function orderDto(order,{includeAddress=false}={}){
 if(!order)return null;
 const expired=order.courier_response==='offered'&&order.courier_offer_expires_at<=Math.floor(Date.now()/1000);
 const data={id:order.id,restaurantId:order.restaurant_id,orderNumber:order.order_number,
   status:order.status,version:order.version,courierResponse:expired?'unassigned':order.courier_response,deliveryMethod:order.delivery_method,
   courierId:expired?null:order.courier_id,subtotalMinor:order.subtotal_minor,
   deliveryFeeMinor:order.delivery_fee_minor,discountMinor:order.discount_minor||0,flashGiftName:order.flash_gift_name||null,totalMinor:order.total_minor-(order.discount_minor||0),
   createdAt:order.created_at,updatedAt:order.updated_at};
 if(order.courier_response==='offered'&&!expired)data.offerExpiresAt=order.courier_offer_expires_at;
 if(includeAddress)data.deliveryAddress=order.delivery_address;
 return data;
}
function assertStatusMove(from,to,moves){
 if(!(moves[from]||[]).includes(to))throw new ApiError(422,'INVALID_TRANSITION');
}
async function priorAction(env,actor,key,hash){
 const p=await env.DB.prepare(`SELECT id,order_id,request_hash,expected_version,to_status
   FROM order_actions WHERE actor_id=? AND request_key=?`).bind(actor.userId,key).first();
 if(!p)return null;
 if(p.request_hash!==hash)throw new ApiError(409,'IDEMPOTENCY_KEY_REUSED');
 return {order:{id:p.order_id,status:p.to_status,version:p.expected_version+1},replayed:true};
}
export async function transition(env,actor,{orderId,restaurantId,expectedVersion,status,key}){
 orderId=requireUuid(orderId,'orderId');restaurantId=requireUuid(restaurantId,'restaurantId');
 requireInteger(expectedVersion,1,2147483646,'expectedVersion');
 if(typeof status!=='string'||status.length>32)throw new ApiError(400,'INVALID_STATUS');
 const hash=await sha256(JSON.stringify({orderId,restaurantId,expectedVersion,status}));
 const previous=await priorAction(env,actor,key,hash);
 if(previous)return previous;
 const existing=await env.DB.prepare(`${dataOrder} WHERE id=? AND restaurant_id=?`)
   .bind(orderId,restaurantId).first();
 if(!existing)throw new ApiError(404,'ORDER_NOT_FOUND');
 if(existing.version!==expectedVersion)throw new ApiError(409,'ORDER_CHANGED');
 if(existing.courier_id&&status==='Cancelado'&&(existing.courier_response!=='offered'||existing.courier_offer_expires_at>Math.floor(Date.now()/1000)))throw new ApiError(409,'COURIER_ASSIGNED');
 const actionId=crypto.randomUUID();
 try{
  await env.DB.prepare(`INSERT INTO order_actions(id,order_id,restaurant_id,actor_id,request_key,
   request_hash,expected_version,from_status,to_status) VALUES(?,?,?,?,?,?,?,?,?)`)
   .bind(actionId,orderId,restaurantId,actor.userId,key,hash,expectedVersion,existing.status,status).run();
 }catch(error){
  const repeated=await priorAction(env,actor,key,hash);
  if(repeated)return repeated;
  throw sqlConflict(error);
 }
 return {order:{id:orderId,status,version:expectedVersion+1},replayed:false};
}
export async function restaurantOrders(req,env,access,url){
 const cursor=url.searchParams.get('cursor');
 let where='restaurant_id=?',args=[access.restaurantId];
 const view=url.searchParams.get('view');
 if(view&&!['active','history','unrecorded'].includes(view))throw new ApiError(400,'INVALID_INPUT');
 if(access.staff_role==='kitchen')where+=" AND status IN ('Aceptado','Preparando','Listo')";
 else if(view==='active')where+=" AND status NOT IN ('Entregado','Cancelado','Rechazado')";
 else if(view==='unrecorded'){
  requireStaff(access.staff_role,['owner','manager','cashier']);
  where+=" AND status='Entregado' AND NOT EXISTS(SELECT 1 FROM restaurant_sales s WHERE s.order_id=online_orders.id)";
 }
 else if(view==='history')where+=" AND status IN ('Entregado','Cancelado','Rechazado')";
 if(cursor){
  const found=/^([1-9]\d{0,11}):([0-9a-f-]{36})$/i.exec(cursor);
  if(!found)throw new ApiError(400,'INVALID_CURSOR');
  const time=requireInteger(Number(found[1]),1,999999999999,'cursor');
  const id=requireUuid(found[2],'cursor id');
  where+=' AND (updated_at<? OR (updated_at=? AND id<?))';
  args.push(time,time,id);
 }
 const {results=[]}=await env.DB.prepare(`${briefOrder} WHERE ${where}
   ORDER BY updated_at DESC,id DESC LIMIT 51`).bind(...args).all();
 const orders=results.slice(0,50);
 const end=orders.at(-1);
 const publicOrders=access.staff_role==='kitchen'?orders.map(order=>({id:order.id,orderNumber:order.order_number,
  status:order.status,version:order.version,deliveryMethod:order.delivery_method,flashGiftName:order.flash_gift_name,
  createdAt:order.created_at,updatedAt:order.updated_at})):orders.map(order=>orderDto(order));
 return {orders:publicOrders,hasMore:results.length>50,
   nextCursor:results.length>50&&end?`${end.updated_at}:${end.id}`:null,
   serverTime:new Date().toISOString()};
}
export async function restaurantOrder(env,access,orderId){
 const order=await env.DB.prepare(`${dataOrder} WHERE id=? AND restaurant_id=?`)
   .bind(requireUuid(orderId),access.restaurantId).first();
 if(!order)throw new ApiError(404,'ORDER_NOT_FOUND');
 const {results=[]}=await env.DB.prepare(`SELECT name_snapshot,quantity,unit_price_minor,options_json,options_minor,line_total_minor+options_minor*quantity AS line_total_minor
   FROM online_order_items WHERE order_id=? ORDER BY id`).bind(order.id).all();
 if(access.staff_role==='kitchen'){
  if(!['Aceptado','Preparando','Listo'].includes(order.status))throw new ApiError(404,'ORDER_NOT_FOUND');
  return {order:{id:order.id,orderNumber:order.order_number,status:order.status,
   flashGiftName:order.flash_gift_name,note:order.customer_note,
   items:results.map(({name_snapshot,quantity,options_json})=>({name_snapshot,quantity,
    optionNames:JSON.parse(options_json).map(option=>option.name)}))}};
 }
 return {order:{...orderDto(order,{includeAddress:true}),note:order.customer_note,items:results}};
}
export async function changes(env,access,url){
 const since=url.searchParams.get('since')??'0';
 if(!/^(0|[1-9]\d{0,15})$/.test(since)||!Number.isSafeInteger(Number(since)))
   throw new ApiError(400,'INVALID_CURSOR');
 const {results=[]}=await env.DB.prepare(`SELECT id AS cursor,order_id,event_kind,from_status,to_status,version,created_at
    FROM online_order_events WHERE restaurant_id=? AND id>? ORDER BY id LIMIT 101`)
   .bind(access.restaurantId,Number(since)).all();
 const events=results.slice(0,100);
 return {events,nextCursor:String(events.at(-1)?.cursor??since),hasMore:results.length>100,serverTime:new Date().toISOString()};
}
export async function restaurantStatus(req,env,actor,access,orderId){
 requireStaff(access.staff_role,['owner','manager','kitchen']);
 const body=await readJson(req);
 requireKeys(body,['status','expectedVersion']);
 const status=requireText(body.status,1,32,'status');
 const key=idempotencyKey(req);
 const current=await env.DB.prepare('SELECT status,delivery_method FROM online_orders WHERE id=? AND restaurant_id=?')
  .bind(requireUuid(orderId),access.restaurantId).first();
 if(!current)throw new ApiError(404,'ORDER_NOT_FOUND');
 // A prior success must replay even after the order advances. transition() checks the key first.
 const prior=await env.DB.prepare('SELECT request_key FROM order_actions WHERE actor_id=? AND request_key=?')
  .bind(actor.userId,key).first();
 if(!prior){
  if(access.staff_role==='kitchen'&&!['Preparando','Listo'].includes(status))
   throw new ApiError(403,'ROLE_FORBIDDEN');
  if(current.status==='Listo'&&status==='Entregado'&&current.delivery_method!=='pickup')
   throw new ApiError(422,'COURIER_DELIVERY_REQUIRED');
  assertStatusMove(current.status,status,staffMoves);
 }
 return transition(env,actor,{orderId,restaurantId:access.restaurantId,expectedVersion:body.expectedVersion,status,key});
}
export async function assignCourier(req,env,actor,access,orderId){
 requireStaff(access.staff_role,['owner','manager']);
 const body=await readJson(req);
 requireKeys(body,['courierId','expectedVersion']);
 const courierId=requireUuid(body.courierId,'courierId');
 const expectedVersion=requireInteger(body.expectedVersion,1,2147483646,'expectedVersion');
 const id=requireUuid(orderId,'orderId');
 const key=idempotencyKey(req);
 const hash=await sha256(JSON.stringify({id,restaurantId:access.restaurantId,courierId,expectedVersion}));
 const previous=await env.DB.prepare('SELECT order_id,courier_id,request_hash,expected_version FROM order_assignments WHERE actor_id=? AND request_key=?')
  .bind(actor.userId,key).first();
 if(previous){
  if(previous.request_hash!==hash)throw new ApiError(409,'IDEMPOTENCY_KEY_REUSED');
  return {order:{id:previous.order_id,courierId:previous.courier_id,version:previous.expected_version+1},replayed:true};
 }
 try{
  await env.DB.prepare(`INSERT INTO order_assignments(id,order_id,restaurant_id,actor_id,courier_id,request_key,request_hash,expected_version)
    VALUES(?,?,?,?,?,?,?,?)`)
   .bind(crypto.randomUUID(),id,access.restaurantId,actor.userId,courierId,key,hash,expectedVersion).run();
 }catch(error){
  const repeat=await env.DB.prepare('SELECT order_id,courier_id,request_hash,expected_version FROM order_assignments WHERE actor_id=? AND request_key=?')
    .bind(actor.userId,key).first();
  if(repeat){
   if(repeat.request_hash!==hash)throw new ApiError(409,'IDEMPOTENCY_KEY_REUSED');
   return {order:{id:repeat.order_id,courierId:repeat.courier_id,version:repeat.expected_version+1},replayed:true};
  }
  throw sqlConflict(error);
 }
 return {order:{id,courierId,version:expectedVersion+1},replayed:false};
}
export async function courierOffer(req,env,actor,orderId){
 await courierProfile(env,actor);
 const body=await readJson(req);
 requireKeys(body,['action','expectedVersion']);
 if(!['accept','reject'].includes(body.action))throw new ApiError(400,'INVALID_COURIER_ACTION');
 const expectedVersion=requireInteger(body.expectedVersion,1,2147483646,'expectedVersion');
 const id=requireUuid(orderId),key=idempotencyKey(req);
 const hash=await sha256(JSON.stringify({id,courierId:actor.userId,action:body.action,expectedVersion}));
 const replay=async()=>{
  const previous=await env.DB.prepare(`SELECT order_id,action,request_hash,expected_version
    FROM courier_offer_responses WHERE courier_id=? AND request_key=?`)
   .bind(actor.userId,key).first();
  if(!previous)return null;
  if(previous.request_hash!==hash)throw new ApiError(409,'IDEMPOTENCY_KEY_REUSED');
  return {order:{id:previous.order_id,version:previous.expected_version+1,
   courierResponse:previous.action==='accept'?'accepted':'unassigned'},replayed:true};
 };
 const previous=await replay();if(previous)return previous;
 const current=await env.DB.prepare('SELECT courier_response FROM online_orders WHERE id=? AND courier_id=?')
  .bind(id,actor.userId).first();
 if(!current)throw new ApiError(404,'ORDER_NOT_FOUND');
 if(current.courier_response!=='offered')throw new ApiError(409,'OFFER_CHANGED');
 try{
  await env.DB.prepare(`INSERT INTO courier_offer_responses(id,order_id,courier_id,request_key,
    request_hash,expected_version,action) VALUES(?,?,?,?,?,?,?)`)
   .bind(crypto.randomUUID(),id,actor.userId,key,hash,expectedVersion,body.action).run();
 }catch(e){const repeated=await replay();if(repeated)return repeated;throw sqlConflict(e)}
 return {order:{id,version:expectedVersion+1,courierResponse:body.action==='accept'?'accepted':'unassigned'},
  replayed:false};
}
export async function courierOrders(env,actor){
 const profile=await courierProfile(env,actor);
 const {results=[]}=await env.DB.prepare(`SELECT o.*,r.name AS pickup_name,p.address AS pickup_address,p.latitude,p.longitude
  FROM online_orders o JOIN restaurants r ON r.id=o.restaurant_id LEFT JOIN restaurant_profiles p ON p.restaurant_id=r.id
  WHERE o.courier_id=? AND o.status NOT IN ('Entregado','Cancelado','Rechazado')
   AND (o.courier_response='accepted' OR (o.courier_response='offered' AND o.courier_offer_expires_at>unixepoch()))
  ORDER BY o.created_at DESC,o.id LIMIT 20`).bind(actor.userId).all();
 return {profile,orders:results.map(order=>{
  const accepted=order.courier_response==='accepted';
  return {...orderDto(order,{includeAddress:accepted}),restaurantName:order.pickup_name,
   ...(accepted?{pickupAddress:order.pickup_address,pickupLatitude:order.latitude,pickupLongitude:order.longitude}:{})};
 })};
}
export async function courierStatus(req,env,actor,orderId){
 await courierProfile(env,actor);
 const body=await readJson(req);requireKeys(body,['status','expectedVersion']);
 const id=requireUuid(orderId);const status=requireText(body.status,1,32,'status');
 const order=await env.DB.prepare(`${dataOrder} WHERE id=? AND courier_id=?`).bind(id,actor.userId).first();
 if(!order)throw new ApiError(404,'ORDER_NOT_FOUND');
 const key=idempotencyKey(req);
 const prior=await env.DB.prepare('SELECT request_key FROM order_actions WHERE actor_id=? AND request_key=?')
  .bind(actor.userId,key).first();
 if(!prior)assertStatusMove(order.status,status,courierMoves);
 return transition(env,actor,{orderId:id,restaurantId:order.restaurant_id,expectedVersion:body.expectedVersion,status,key});
}
export async function confirmDelivery(req,env,actor,orderId){
 await courierProfile(env,actor);
 const body=await readJson(req);requireKeys(body,['expectedVersion','pin']);
 const id=requireUuid(orderId);const v=requireInteger(body.expectedVersion,1,2147483646,'expectedVersion');
 if(typeof body.pin!=='string'||!/^[0-9]{6}$/.test(body.pin))throw new ApiError(400,'INVALID_PIN');
 const key=idempotencyKey(req);
 const order=await env.DB.prepare(`${dataOrder} WHERE id=? AND courier_id=?`).bind(id,actor.userId).first();
 if(!order)throw new ApiError(404,'ORDER_NOT_FOUND');
 if(order.delivery_method!=='delivery')throw new ApiError(422,'DELIVERY_REQUIRED');
 const correct=await deliveryPin(env.PIN_SECRET,id);
 const same=correct.length===body.pin.length&&[...correct].reduce((diff,ch,i)=>diff|(ch.charCodeAt(0)^body.pin.charCodeAt(i)),0)===0;
 if(order.pin_attempts>=5)throw new ApiError(423,'PIN_LOCKED');
 if(!same){
  await env.DB.prepare(`INSERT INTO courier_pin_rejections(courier_id,request_key,order_id)
   SELECT courier_id,?,id FROM online_orders WHERE id=? AND courier_id=? AND version=? AND status='En ubicación'
    AND courier_response='accepted' AND pin_attempts<5 ON CONFLICT(courier_id,request_key) DO NOTHING`)
   .bind(key,id,actor.userId,v).run();
  throw new ApiError(403,'PIN_INVALID');
 }
 if(await env.DB.prepare('SELECT 1 FROM courier_pin_rejections WHERE courier_id=? AND request_key=?').bind(actor.userId,key).first())
  throw new ApiError(409,'IDEMPOTENCY_KEY_REUSED');
 // PIN is never stored in mutation records or logs.
 return transition(env,actor,{orderId:id,restaurantId:order.restaurant_id,expectedVersion:v,status:'Entregado',key});
}
function couponCode(code){
 const normalized=typeof code==='string'?code.trim().toUpperCase():'';
 if(!/^[A-Z0-9-]{4,24}$/.test(normalized))throw new ApiError(400,'INVALID_COUPON');
 return normalized;
}
async function validCoupon(env,actor,restaurantId,code){
 const row=await env.DB.prepare(`SELECT discount_minor FROM client_coupons c WHERE code=? AND restaurant_id=?
  AND active=1 AND starts_at<=unixepoch() AND ends_at>unixepoch()
  AND (global_limit IS NULL OR global_limit>(SELECT COUNT(*) FROM online_orders WHERE coupon_code=c.code))
  AND NOT EXISTS(SELECT 1 FROM online_orders WHERE customer_id=? AND coupon_code=c.code)`)
  .bind(code,restaurantId,actor.userId).first();
 if(!row)throw new ApiError(409,'COUPON_UNAVAILABLE');
 return row.discount_minor;
}
export async function customerCoupon(req,env,actor){
 requireRole(actor,'customer');
 const body=await readJson(req);
 requireKeys(body,['restaurantId','coupon']);
 const code=couponCode(body.coupon);
 const discountMinor=await validCoupon(env,actor,requireUuid(body.restaurantId),code);
 return {code,discountMinor};
}
export async function customerCreate(req,env,actor){
 requireRole(actor,'customer');
 if(env.ORDER_CREATION_ENABLED!=='true')throw new ApiError(503,'ORDER_CREATION_DISABLED');
 const body=await readJson(req,16384);
 requireKeys(body,['restaurantId','items','deliveryMethod','deliveryAddress','phone','expectedTotalMinor','coupon','flashId','note']);
 const phone=typeof body.phone==='string'?body.phone.replace(/[\s()-]/g,''):'';
 if(!/^\+504[0-9]{8}$/.test(phone))throw new ApiError(400,'PHONE_REQUIRED');
 const restaurantId=requireUuid(body.restaurantId,'restaurantId');
 const deliveryMethod=body.deliveryMethod;
 if(!['delivery','pickup'].includes(deliveryMethod))throw new ApiError(400,'INVALID_DELIVERY_METHOD');
 const deliveryAddress=deliveryMethod==='delivery'
  ?requireText(body.deliveryAddress,8,300,'deliveryAddress'):'';
 if(!Array.isArray(body.items)||body.items.length<1||body.items.length>20)throw new ApiError(400,'INVALID_ITEMS');
 const items=body.items.map(x=>{
  requireKeys(x,['productId','quantity','optionIds']);
  if(x.optionIds!==undefined&&(!Array.isArray(x.optionIds)||x.optionIds.length>8))
   throw new ApiError(400,'INVALID_OPTIONS');
  const optionIds=x.optionIds?.map(id=>requireUuid(id)).sort();
  if(optionIds&&new Set(optionIds).size!==optionIds.length)throw new ApiError(400,'INVALID_OPTIONS');
  return {productId:requireUuid(x.productId,'productId'),quantity:requireInteger(x.quantity,1,25,'quantity'),
   ...(optionIds?.length?{optionIds}:{})};
 });
 if(new Set(items.map(x=>x.productId)).size!==items.length)throw new ApiError(400,'DUPLICATE_PRODUCT');
 const key=idempotencyKey(req);
 const expectedTotalMinor=body.expectedTotalMinor===undefined?undefined:
  requireInteger(body.expectedTotalMinor,0,2000000000,'expectedTotalMinor');
 const coupon=body.coupon===undefined?undefined:couponCode(body.coupon);
 const flashId=body.flashId===undefined?undefined:requireUuid(body.flashId,'flashId');
 if(flashId&&coupon)throw new ApiError(400,'PROMOTIONS_EXCLUSIVE');
 if(flashId&&env.QA_FLASH!=='true')throw new ApiError(409,'FLASH_UNAVAILABLE');
 const note=body.note===undefined?undefined:requireText(body.note,0,300,'note')||undefined;
 const intent={restaurantId,deliveryMethod,deliveryAddress,phone,items,expectedTotalMinor,coupon,flashId,note};
 const hash=await sha256(JSON.stringify(intent));
 const replay=async()=>{
  const prev=await env.DB.prepare(`SELECT c.request_hash,o.* FROM order_create_requests c
    JOIN online_orders o ON o.id=c.order_id WHERE c.user_id=? AND c.request_key=?`)
    .bind(actor.userId,key).first();
  if(!prev)return null;
  if(prev.request_hash!==hash)throw new ApiError(409,'IDEMPOTENCY_KEY_REUSED');
  return {order:orderDto(prev),deliveryPin:deliveryMethod==='delivery'&&!CLOSED.includes(prev.status)
    ?await deliveryPin(env.PIN_SECRET,prev.id):null,replayed:true};
 };
 const prior=await replay();if(prior)return prior;
 const restaurant=await env.DB.prepare(`SELECT delivery_fee_minor FROM restaurants WHERE id=?
   AND plan IN ('ONLINE','PLUS') AND subscription_status='active' AND online_state='open'`)
   .bind(restaurantId).first();
 if(!restaurant)throw new ApiError(409,'RESTAURANT_NOT_ACCEPTING');
 const {results=[]}=await env.DB.prepare(`SELECT id,name,price_minor FROM products
  WHERE restaurant_id=? AND available=1 AND id IN (${items.map(()=>'?').join(',')})`)
  .bind(restaurantId,...items.map(item=>item.productId)).all();
 const catalog=new Map(results.map(product=>[product.id,product]));
 const productIds=items.filter(item=>item.optionIds).map(item=>item.productId);
 const optionsById=new Map();
 if(productIds.length){
  const {results:options=[]}=await env.DB.prepare(`SELECT id,product_id,name,kind,price_minor FROM product_options
   WHERE available=1 AND product_id IN (${productIds.map(()=>'?').join(',')})`).bind(...productIds).all();
  options.forEach(option=>optionsById.set(option.id,option));
 }
 const resolved=items.map(item=>{
  const p=catalog.get(item.productId);
  if(!p)throw new ApiError(409,'PRODUCT_UNAVAILABLE');
  const options=(item.optionIds||[]).map(id=>{
   const option=optionsById.get(id);
   if(!option||option.product_id!==p.id)throw new ApiError(409,'PRODUCT_UNAVAILABLE');
   return {id,name:option.name,kind:option.kind,price_minor:option.price_minor};
  });
  if(options.filter(option=>option.kind==='variant').length>1)throw new ApiError(400,'INVALID_OPTIONS');
  return {...p,quantity:item.quantity,options,optionsMinor:options.reduce((total,option)=>total+option.price_minor,0)};
 });
 const subtotal=resolved.reduce((sum,p)=>sum+(p.price_minor+p.optionsMinor)*p.quantity,0);
 const fee=deliveryMethod==='delivery'?restaurant.delivery_fee_minor:0;
 if(!Number.isSafeInteger(subtotal)||subtotal+fee>2000000000)
  throw new ApiError(400,'INVALID_TOTAL');
 const flash=flashId?await resolveFlash(env,actor,flashId,restaurantId,resolved):null;
 const discount=flash?.discountMinor??(coupon?Math.min(subtotal,await validCoupon(env,actor,restaurantId,coupon)):0);
 if(coupon&&!discount)throw new ApiError(409,'COUPON_UNAVAILABLE');
 const total=subtotal+fee-discount;
 if(expectedTotalMinor!==undefined&&expectedTotalMinor!==total)
  throw new ApiError(409,'CHECKOUT_TOTAL_CHANGED');
 const id=crypto.randomUUID(),orderNumber='DV-'+id.replaceAll('-','').slice(0,12).toUpperCase();
 const stmts=[
  env.DB.prepare(`INSERT INTO online_orders(id,restaurant_id,customer_id,order_number,delivery_method,
   delivery_address,status,version,subtotal_minor,delivery_fee_minor,total_minor,customer_phone_e164,coupon_code,discount_minor,flash_id,flash_gift_name,customer_note) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`)
   .bind(id,restaurantId,actor.userId,orderNumber,deliveryMethod,deliveryAddress,'Pendiente',1,subtotal,fee,subtotal+fee,phone,coupon??null,discount,flashId??null,flash?.giftName??null,note??''),
  ...resolved.map(p=>env.DB.prepare(`INSERT INTO online_order_items(id,order_id,product_id,name_snapshot,
    unit_price_minor,quantity,line_total_minor,options_json,options_minor) VALUES(?,?,?,?,?,?,?,?,?)`)
    .bind(crypto.randomUUID(),id,p.id,p.name,p.price_minor,p.quantity,p.price_minor*p.quantity,JSON.stringify(p.options),p.optionsMinor)),
  env.DB.prepare(`INSERT INTO online_order_events(order_id,restaurant_id,actor_id,event_kind,to_status,version)
   VALUES(?,?,?,'created','Pendiente',1)`).bind(id,restaurantId,actor.userId),
  env.DB.prepare(`INSERT INTO order_create_requests(user_id,request_key,request_hash,order_id)
   VALUES(?,?,?,?)`).bind(actor.userId,key,hash,id)
 ];
 try{await env.DB.batch(stmts)}
 catch(error){const duplicated=await replay();if(duplicated)return duplicated;throw sqlConflict(error)}
 return {order:{id,restaurantId,orderNumber,status:'Pendiente',version:1,deliveryMethod,
  subtotalMinor:subtotal,deliveryFeeMinor:fee,discountMinor:discount,flashGiftName:flash?.giftName??null,totalMinor:total},
  deliveryPin:deliveryMethod==='delivery'?await deliveryPin(env.PIN_SECRET,id):null,replayed:false};
}
export async function customerOrders(env,actor){
 requireRole(actor,'customer');
 const {results=[]}=await env.DB.prepare(`${dataOrder} WHERE customer_id=? ORDER BY created_at DESC,id DESC LIMIT 30`)
  .bind(actor.userId).all();
 return {orders:results.map(x=>orderDto(x))};
}
export async function customerCheckoutStatus(req,env,actor){
 requireRole(actor,'customer');
 const key=idempotencyKey(req);
 const row=await env.DB.prepare(`SELECT o.id FROM order_create_requests c
   JOIN online_orders o ON o.id=c.order_id AND o.customer_id=c.user_id
   WHERE c.user_id=? AND c.request_key=?`).bind(actor.userId,key).first();
 if(!row)throw new ApiError(404,'CHECKOUT_NOT_FOUND');
 return customerOrder(env,actor,row.id);
}
export async function customerOrder(env,actor,orderId){
 requireRole(actor,'customer');
 const order=await env.DB.prepare(`${dataOrder} WHERE customer_id=? AND id=?`)
   .bind(actor.userId,requireUuid(orderId)).first();
 if(!order)throw new ApiError(404,'ORDER_NOT_FOUND');
 const {results=[]}=await env.DB.prepare(`SELECT product_id,name_snapshot,unit_price_minor,quantity,options_json,options_minor,line_total_minor+options_minor*quantity AS line_total_minor
    FROM online_order_items WHERE order_id=? ORDER BY id`).bind(order.id).all();
 return {order:{...orderDto(order,{includeAddress:true}),items:results},
  deliveryPin:order.delivery_method==='delivery'&&!CLOSED.includes(order.status)
    ?await deliveryPin(env.PIN_SECRET,order.id):null};
}
export async function customerCancel(req,env,actor,orderId){
 requireRole(actor,'customer');
 const body=await readJson(req);requireKeys(body,['expectedVersion']);
 const id=requireUuid(orderId);
 const order=await env.DB.prepare(`${dataOrder} WHERE customer_id=? AND id=?`).bind(actor.userId,id).first();
 if(!order)throw new ApiError(404,'ORDER_NOT_FOUND');
 const key=idempotencyKey(req);
 const prior=await env.DB.prepare('SELECT request_key FROM order_actions WHERE actor_id=? AND request_key=?')
  .bind(actor.userId,key).first();
 if(!prior&&order.status!=='Pendiente')throw new ApiError(422,'CANNOT_CANCEL');
 return transition(env,actor,{orderId:id,restaurantId:order.restaurant_id,
  expectedVersion:body.expectedVersion,status:'Cancelado',key});
}
