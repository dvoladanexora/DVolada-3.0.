import {controlAudit} from './control-center.js';
import {ApiError,requireInteger,idempotencyKey,readJson,requireKeys,requireRole,requireText,requireUuid,respond} from './security.js';

export async function courierProfile(env,actor){
 requireRole(actor,'courier');
 const profile=await env.DB.prepare('SELECT active,available,MIN(max_active_orders,2) AS capacity FROM courier_profiles WHERE user_id=?')
  .bind(actor.userId).first();
 if(!profile?.active)throw new ApiError(403,'COURIER_INACTIVE');
 return profile;
}

export async function courierAvailability(req,env,actor){
 await courierProfile(env,actor);
 const data=await readJson(req);
 requireKeys(data,['available']);
 if(typeof data.available!=='boolean')throw new ApiError(400,'INVALID_INPUT');
 const result=await env.DB.prepare('UPDATE courier_profiles SET available=? WHERE user_id=? AND active=1')
  .bind(Number(data.available),actor.userId).run();
 if(!result.meta.changes)throw new ApiError(403,'COURIER_INACTIVE');
 return {available:data.available};
}

export async function courierApplication(req,env,actor){
 requireRole(actor,'customer');
 if(req.method==='POST'){
  const body=await readJson(req,2048);
  requireKeys(body,['phone','transport','zone']);
  const detail=body.phone!==undefined||body.transport!==undefined||body.zone!==undefined;
  const zone=detail?requireText(body.zone,2,100,'zone'):null;
  if(detail&&(!/^\+504[0-9]{8}$/.test(body.phone)||!['motorcycle','car','bicycle','walking','other'].includes(body.transport)))
   throw new ApiError(400,'INVALID_INPUT');
  const result=await env.DB.prepare(`INSERT INTO courier_applications(user_id,contact_phone,transport,service_zone)
   SELECT id,?,?,? FROM users WHERE id=? AND status='active' AND account_role='customer'
    AND NOT EXISTS(SELECT 1 FROM restaurant_memberships WHERE user_id=users.id AND active=1)
   ON CONFLICT(user_id) DO UPDATE SET
    contact_phone=excluded.contact_phone,transport=excluded.transport,service_zone=excluded.service_zone
   WHERE courier_applications.contact_phone IS NULL AND excluded.contact_phone IS NOT NULL`)
   .bind(body.phone??null,body.transport??null,zone,actor.userId).run();
  if(!result.meta.changes&&!await env.DB.prepare('SELECT 1 FROM courier_applications WHERE user_id=?').bind(actor.userId).first())
   throw new ApiError(403,'ROLE_FORBIDDEN');
 }
 const request=await env.DB.prepare('SELECT contact_phone FROM courier_applications WHERE user_id=?').bind(actor.userId).first();
 const rejected=!request&&await env.DB.prepare("SELECT 1 FROM control_audit WHERE subject=? AND action='courier_application_rejected' LIMIT 1").bind(actor.userId).first();
 return {requested:Boolean(request),needsDetails:Boolean(request&&!request.contact_phone),status:request?'pending':rejected?'rejected':'none'};
}

export async function rejectCourierApplication(req,env,actor){
 requireRole(actor,'platform_admin');
 const data=await readJson(req);
 requireKeys(data,['userId','createdAt']);
 const id=requireUuid(data.userId);
 const createdAt=requireInteger(data.createdAt,1,Number.MAX_SAFE_INTEGER,'createdAt');
 const [removed]=await env.DB.batch([
  env.DB.prepare(`DELETE FROM courier_applications WHERE user_id=? AND created_at=?
   AND EXISTS(SELECT 1 FROM users WHERE id=? AND account_role='customer' AND status='active')`).bind(id,createdAt,id),
  controlAudit(env,actor,'courier_application_rejected',id,{createdAt})
 ]);
 if(!removed.meta.changes)throw new ApiError(409,'APPLICATION_CHANGED');
 return {rejected:true};
}

export async function pendingCouriers(env,actor){
 requireRole(actor,'platform_admin');
 const {results=[]}=await env.DB.prepare(`SELECT a.user_id,u.display_name,a.created_at,a.contact_phone,a.transport,a.service_zone FROM courier_applications a JOIN users u ON u.id=a.user_id
  WHERE u.account_role='customer' AND u.status='active' ORDER BY a.created_at,a.user_id LIMIT 100`).all();
 return {applications:results};
}

export async function revokeCourierSessions(req,env,actor){
 await courierProfile(env,actor);
 await env.DB.batch([
  env.DB.prepare('UPDATE users SET admin_version=admin_version+1 WHERE id=?').bind(actor.userId),
  env.DB.prepare('UPDATE auth_sessions SET revoked_at=unixepoch() WHERE user_id=? AND revoked_at IS NULL').bind(actor.userId),
  env.DB.prepare('UPDATE courier_profiles SET available=0 WHERE user_id=? AND active=1').bind(actor.userId)
 ]);
 return respond(req,env,204);
}

export async function courierHistory(env,actor,url){
 await courierProfile(env,actor);
 const cursor=url.searchParams.get('cursor');
 const found=cursor&&/^(\d{1,12}):([0-9a-f-]{36})$/.exec(cursor);
 if(cursor&&!found)throw new ApiError(400,'INVALID_CURSOR');
 const params=[actor.userId];
 if(found)params.push(Number(found[1]),Number(found[1]),requireUuid(found[2]));
 const {results=[]}=await env.DB.prepare(`SELECT o.id,o.order_number AS orderNumber,o.updated_at AS deliveredAt,r.name AS restaurantName,
  l.courier_minor AS earningsMinor,fee.amount_minor AS commissionMinor,CASE WHEN fee.id IS NULL THEN NULL ELSE COALESCE((SELECT SUM(amount_minor) FROM courier_fee_receipts p WHERE p.charge_id=fee.id),0) END AS commissionPaidMinor,t.id AS settlementId,t.from_at AS periodFrom,t.until_at AS periodUntil,t.status AS settlementStatus
  FROM online_orders o JOIN restaurants r ON r.id=o.restaurant_id LEFT JOIN restaurant_settlement_lines l ON l.order_id=o.id
  LEFT JOIN restaurant_settlements t ON t.id=l.settlement_id LEFT JOIN courier_fee_charges fee ON fee.id=o.id AND fee.courier_id=o.courier_id
  WHERE o.courier_id=? AND o.courier_response='accepted' AND o.status='Entregado'
  ${found?'AND (o.updated_at<? OR (o.updated_at=? AND o.id<?))':''}
  ORDER BY o.updated_at DESC,o.id DESC LIMIT 51`).bind(...params).all();
 const orders=results.slice(0,50);
 const last=orders.at(-1);
 const {results:periods=[]}=await env.DB.prepare(`SELECT t.id,r.name AS restaurantName,t.from_at AS periodFrom,
  t.until_at AS periodUntil,t.status AS settlementStatus,SUM(m.amount) AS earningsMinor,SUM(m.adjustment) AS adjustmentMinor
  FROM (
   SELECT l.settlement_id,l.courier_minor AS amount,0 AS adjustment
   FROM online_orders o JOIN restaurant_settlement_lines l ON l.order_id=o.id WHERE o.courier_id=? AND o.status='Entregado'
   UNION ALL
   SELECT a.settlement_id,a.courier_minor,a.courier_minor FROM online_orders o JOIN restaurant_settlement_adjustments a ON a.order_id=o.id
   WHERE o.courier_id=? AND o.status='Entregado' AND a.courier_minor!=0
  ) m JOIN restaurant_settlements t ON t.id=m.settlement_id JOIN restaurants r ON r.id=t.restaurant_id
  GROUP BY t.id ORDER BY t.from_at DESC,t.id DESC LIMIT 50`).bind(actor.userId,actor.userId).all();
 const commissions=await env.DB.prepare(`SELECT COUNT(*) AS deliveries,COALESCE(SUM(amount_minor),0) AS chargedMinor,COALESCE(SUM(paid),0) AS paidMinor,COALESCE(SUM(amount_minor-paid),0) AS outstandingMinor FROM (SELECT c.amount_minor,COALESCE((SELECT SUM(r.amount_minor) FROM courier_fee_receipts r WHERE r.charge_id=c.id),0) AS paid FROM courier_fee_charges c WHERE c.courier_id=?)`).bind(actor.userId).first();
 return {orders,periods,commissions,nextCursor:results.length>50?`${last.deliveredAt}:${last.id}`:null};
}

export async function courierRestaurantChat(req,env,actor,orderId){
 const id=requireUuid(orderId);
 const permitted=`o.id=? AND o.courier_response='accepted' AND EXISTS(
  SELECT 1 FROM courier_profiles c JOIN users u ON u.id=c.user_id
  WHERE c.user_id=o.courier_id AND c.active=1 AND u.status='active'
 ) AND ((o.courier_id=? AND ?='courier') OR EXISTS(
  SELECT 1 FROM restaurant_memberships m WHERE m.restaurant_id=o.restaurant_id AND m.user_id=?
   AND m.active=1 AND m.staff_role IN ('owner','manager') AND (? IS NULL OR m.restaurant_id=?)
 ))`;
 const values=[id,actor.userId,actor.role,actor.userId,actor.staffRestaurantId,actor.staffRestaurantId];
 const order=await env.DB.prepare(`SELECT o.courier_id,o.status FROM online_orders o WHERE ${permitted}`).bind(...values).first();
 if(!order)throw new ApiError(404,'CONVERSATION_NOT_FOUND');
 const open="o.status NOT IN ('Entregado','Cancelado','Rechazado')";
 if(req.method==='POST'){
  const input=await readJson(req);
  requireKeys(input,['message']);
  const body=requireText(input.message,1,600,'message'),key=idempotencyKey(req);
  const written=await env.DB.prepare(`INSERT INTO courier_restaurant_messages(order_id,courier_id,sender_id,request_key,body)
   SELECT o.id,o.courier_id,?,?,? FROM online_orders o WHERE ${permitted} AND o.courier_id=? AND ${open}
   ON CONFLICT(sender_id,request_key) DO NOTHING`).bind(actor.userId,key,body,...values,order.courier_id).run();
  if(!written.meta.changes&&!await env.DB.prepare(`SELECT 1 FROM courier_restaurant_messages
   WHERE order_id=? AND courier_id=? AND sender_id=? AND request_key=? AND body=?`).bind(id,order.courier_id,actor.userId,key,body).first())
   throw new ApiError(409,'MESSAGE_NOT_ACCEPTED');
 }
 const {results=[]}=await env.DB.prepare(`SELECT m.id,m.body,m.sender_id=? AS mine,m.created_at FROM courier_restaurant_messages m
   JOIN online_orders o ON o.id=m.order_id AND o.courier_id=m.courier_id WHERE ${permitted}
   ORDER BY m.id DESC LIMIT 50`).bind(actor.userId,...values).all();
 return respond(req,env,200,{messages:results.reverse(),writable:!['Entregado','Cancelado','Rechazado'].includes(order.status)});
}
