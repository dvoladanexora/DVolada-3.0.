import { sendOrderPush } from './onesignal-push.js';
import { qaPushAppId } from './qa-push-identity.js';

const qaUrl = 'https://dvolada-qa.dvoladanexora.workers.dev/';
export function qaOrderPushConfigured(env) {
 return env.QA_ORDER_PUSH_ENABLED === 'true' && Boolean(env.QA_ONESIGNAL_REST_API_KEY) &&
  Boolean(qaPushAppId(new Request(qaUrl), env));
}

export async function qaPushAudience(db, job) {
 const order = await db.prepare(`SELECT o.customer_id,o.courier_id,o.courier_response,o.restaurant_id,
   o.order_number,o.id,o.status,e.created_at
   FROM online_order_events e JOIN online_orders o ON o.id=e.order_id WHERE e.id=?`)
  .bind(job.event_id).first();
 if (!order || order.created_at < Math.floor(Date.now()/1000)-3600) return null;
 let rows;
 if (job.audience === 'restaurant') {
  rows = await db.prepare(`SELECT DISTINCT u.id FROM restaurant_memberships m JOIN users u ON u.id=m.user_id
   JOIN restaurants r ON r.id=m.restaurant_id
   WHERE m.restaurant_id=? AND m.active=1 AND u.status='active' AND r.subscription_status='active'
   AND m.staff_role IN ('owner','manager','kitchen') ORDER BY u.id LIMIT 25`).bind(order.restaurant_id).all();
 } else if (job.audience === 'courier' && order.courier_response === 'offered' &&
   ['Aceptado','Preparando','Listo'].includes(order.status)) {
  rows = await db.prepare(`SELECT u.id FROM online_order_events e JOIN order_assignments a
   ON a.order_id=e.order_id AND a.expected_version+1=e.version
   JOIN courier_profiles c ON c.user_id=a.courier_id AND c.active=1
   JOIN users u ON u.id=c.user_id AND u.status='active'
   WHERE e.id=? AND a.courier_id=?`).bind(job.event_id,order.courier_id).all();
 } else if (job.audience === 'customer') {
  rows = await db.prepare("SELECT id FROM users WHERE id=? AND status='active'").bind(order.customer_id).all();
 }
 const externalIds = (rows?.results ?? []).map(row => 'dvolada-qa:' + row.id);
 return externalIds.length ? {externalIds,orderId:order.id,orderNumber:order.order_number} : null;
}

export async function drainQaOrderPush(env, fetcher=fetch) {
 if (!qaOrderPushConfigured(env)) return;
 for (let i=0;i<8;i++) {
  const job = await env.DB.prepare(`UPDATE order_push_outbox
   SET available_at=unixepoch()+120,attempts=attempts+1
   WHERE event_id=(SELECT event_id FROM order_push_outbox WHERE finished_at IS NULL
    AND available_at<=unixepoch() ORDER BY event_id LIMIT 1)
   RETURNING event_id,kind,audience,attempts`).first();
  if (!job) return;
  const target = await qaPushAudience(env.DB, job);
  let outcome = target ? 'failed' : 'skipped';
  if (target) {
   try {
    const result = await sendOrderPush({
     PUSH_NOTIFICATIONS_ENABLED:'true', ONESIGNAL_APP_ID:env.QA_ONESIGNAL_APP_ID,
     ONESIGNAL_REST_API_KEY:env.QA_ONESIGNAL_REST_API_KEY,
    },{...target,eventId:job.event_id,kind:job.kind,fetcher});
    if (result.sent) outcome='sent';
    else if (result.reason==='provider-rejected') outcome='skipped';
   } catch {/* Retry the same event after the lease expires. */}
  }
  if (outcome!=='failed'||job.attempts>=3) {
   await env.DB.prepare('UPDATE order_push_outbox SET finished_at=unixepoch(),outcome=? WHERE event_id=? AND attempts=?')
    .bind(outcome,job.event_id,job.attempts).run();
  }
 }
}
