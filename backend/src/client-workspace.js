import {ApiError,idempotencyKey,readJson,requireKeys,requireRole,requireText,requireUuid,respond} from './security.js';

export async function favorites(req,env,actor,restaurantId) {
 requireRole(actor,'customer');
 if (req.method === 'GET') {
  const {results=[]}=await env.DB.prepare(`SELECT f.restaurant_id FROM client_favorites f
   JOIN restaurants r ON r.id=f.restaurant_id WHERE f.user_id=? AND r.subscription_status='active'
   AND r.plan IN ('ONLINE','PLUS') ORDER BY r.name LIMIT 100`).bind(actor.userId).all();
  return respond(req,env,200,{ids:results.map(r=>r.restaurant_id)});
 }
 const id=requireUuid(restaurantId), body=await readJson(req);
 requireKeys(body,['favorite']);
 if(typeof body.favorite!=='boolean') throw new ApiError(400,'INVALID_INPUT');
 if (body.favorite) {
  await env.DB.prepare(`INSERT OR IGNORE INTO client_favorites(user_id,restaurant_id)
   SELECT ?,r.id FROM restaurants r WHERE r.id=? AND r.subscription_status='active' AND r.plan IN ('ONLINE','PLUS')
   AND (SELECT COUNT(*) FROM client_favorites WHERE user_id=?)<100`).bind(actor.userId,id,actor.userId).run();
 } else {
  await env.DB.prepare('DELETE FROM client_favorites WHERE user_id=? AND restaurant_id=?').bind(actor.userId,id).run();
 }
 const saved=await env.DB.prepare('SELECT 1 FROM client_favorites WHERE user_id=? AND restaurant_id=?').bind(actor.userId,id).first();
 if (body.favorite&&!saved) throw new ApiError(409,'FAVORITE_UNAVAILABLE');
 return respond(req,env,200,{favorite:Boolean(saved)});
}

export async function clientProfile(req,env,actor) {
 requireRole(actor,'customer');
 if (req.method==='PATCH') {
  const body=await readJson(req);
  requireKeys(body,['displayName']);
  await env.DB.prepare('UPDATE users SET display_name=? WHERE id=?').bind(requireText(body.displayName,2,80,'displayName'),actor.userId).run();
 }
 const row=await env.DB.prepare('SELECT display_name,phone_e164,phone_verified_at FROM users WHERE id=?').bind(actor.userId).first();
 return respond(req,env,200,{displayName:row.display_name,phone:row.phone_e164,phoneVerified:Boolean(row.phone_verified_at)});
}

export async function conversation(req,env,actor,orderId,channel,customerOnly=false) {
 const order=await env.DB.prepare(`SELECT o.id,o.customer_id,o.courier_id,o.courier_response,o.status,
  EXISTS(SELECT 1 FROM restaurant_memberships m WHERE m.restaurant_id=o.restaurant_id AND m.user_id=?
  AND m.active=1 AND m.staff_role IN ('owner','manager')) AS staff,
  EXISTS(SELECT 1 FROM courier_profiles c WHERE c.user_id=? AND c.active=1) AS active_courier
  FROM online_orders o WHERE o.id=?`).bind(actor.userId,actor.userId,requireUuid(orderId)).first();
 const customer=order?.customer_id===actor.userId;
 const courier=channel==='courier'&&order?.courier_response==='accepted'&&order?.courier_id;
 const authorized=channel==='restaurant'?(customer||order?.staff):
  (courier&&(customer||(actor.role==='courier'&&order.active_courier&&courier===actor.userId)));
 if (!authorized||(customerOnly&&!customer)) throw new ApiError(404,'CONVERSATION_NOT_FOUND');
 const participant=courier||null;
 if (req.method==='POST') {
  const body=await readJson(req);
  requireKeys(body,['message']);
  const message=requireText(body.message,1,600,'message'),key=idempotencyKey(req);
  const result=await env.DB.prepare(`INSERT OR IGNORE INTO order_messages(order_id,channel,courier_id,sender_id,request_key,body)
   SELECT id,?,?,?,?,? FROM online_orders WHERE id=? AND status NOT IN ('Entregado','Cancelado','Rechazado')
   AND (?='restaurant' OR (courier_id=? AND courier_response='accepted'))
   AND (customer_id=? OR (?='restaurant' AND EXISTS(SELECT 1 FROM restaurant_memberships
    WHERE restaurant_id=online_orders.restaurant_id AND user_id=? AND active=1 AND staff_role IN ('owner','manager')))
    OR (?='courier' AND courier_id=? AND EXISTS(SELECT 1 FROM courier_profiles WHERE user_id=? AND active=1)))`)
   .bind(channel,participant,actor.userId,key,message,order.id,channel,participant,
    actor.userId,channel,actor.userId,channel,actor.userId,actor.userId).run();
  if (!result.meta.changes) {
   const existing=await env.DB.prepare(`SELECT 1 FROM order_messages WHERE sender_id=? AND request_key=?
    AND order_id=? AND channel=? AND courier_id IS ? AND body=?`).bind(actor.userId,key,order.id,channel,participant,message).first();
   if(!existing) throw new ApiError(409,'MESSAGE_NOT_ACCEPTED');
  }
 }
 const {results=[]}=await env.DB.prepare(`SELECT id,body,created_at,sender_id=? AS mine FROM order_messages
  WHERE order_id=? AND channel=? AND courier_id IS ? ORDER BY id DESC LIMIT 50`)
  .bind(actor.userId,order.id,channel,participant).all();
 return respond(req,env,200,{messages:results.reverse(),writable:!['Entregado','Cancelado','Rechazado'].includes(order.status)});
}

export async function orderClaim(req,env,actor,orderId) {
 const id=requireUuid(orderId);
 const order=await env.DB.prepare('SELECT customer_id FROM online_orders WHERE id=?').bind(id).first();
 if(!order||(order.customer_id!==actor.userId&&actor.role!=='platform_admin')) throw new ApiError(404,'ORDER_NOT_FOUND');
 if(req.method==='POST'){
  if(order.customer_id!==actor.userId)throw new ApiError(403,'ROLE_FORBIDDEN');
  const body=await readJson(req);
  requireKeys(body,['category','message']);
  if(!['pedido','entrega','otro'].includes(body.category))throw new ApiError(400,'INVALID_INPUT');
  const message=requireText(body.message,8,800,'message');
  const result=await env.DB.prepare('INSERT OR IGNORE INTO order_claims(order_id,category,body) VALUES(?,?,?)').bind(id,body.category,message).run();
  if(!result.meta.changes){
   const existing=await env.DB.prepare('SELECT 1 FROM order_claims WHERE order_id=? AND category=? AND body=?').bind(id,body.category,message).first();
   if(!existing)throw new ApiError(409,'CLAIM_EXISTS');
  }
 }
 if(req.method==='PATCH'){
  requireRole(actor,'platform_admin');
  const body=await readJson(req);
  requireKeys(body,['status','resolution']);
  if(!['review','resolved'].includes(body.status))throw new ApiError(400,'INVALID_INPUT');
  const resolution=body.status==='resolved'?requireText(body.resolution,8,800,'resolution'):null;
  const result=await env.DB.prepare(`UPDATE order_claims SET status=?,resolution=?,updated_at=unixepoch()
   WHERE order_id=? AND status IN ('open','review')`).bind(body.status,resolution,id).run();
  if(!result.meta.changes)throw new ApiError(409,'CLAIM_CLOSED');
 }
 const claim=await env.DB.prepare('SELECT category,body,status,resolution,created_at,updated_at FROM order_claims WHERE order_id=?').bind(id).first();
 return respond(req,env,200,{claim});
}
