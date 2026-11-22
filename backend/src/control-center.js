import {ApiError,idempotencyKey,readJson,requireInteger,requireKeys,requireRole,requireText,requireUuid,respond} from './security.js';

const clock=()=>Math.floor(Date.now()/1000);
const rows=async query=>(await query.all()).results||[];
const statuses=['Pendiente','Aceptado','Preparando','Listo','Recogido','En camino','En ubicación','Entregado','Cancelado','Rechazado'];
const closed=statuses.slice(-3);
const states=['active','suspended','locked','revoke'];
const claimStates=['open','review','resolved'];
export const controlAudit=(env,actor,action,subject,detail,restaurant=null)=>env.DB.prepare(`INSERT INTO control_audit
 (actor_id,restaurant_id,subject,action,detail) SELECT ?,?,?,?,? WHERE changes()>0`)
 .bind(actor.userId,restaurant,subject,action,JSON.stringify(detail));
function choice(value,values){
 if(!values.includes(value))throw new ApiError(400,'INVALID_INPUT');
 return value;
}
function filter(url,name,max){
 return requireText(url.searchParams.get(name)||'',0,max,name);
}

async function orders(env,url){
 const status=filter(url,'status',24),q=filter(url,'q',80),rid=filter(url,'restaurant',36);
 if(status)choice(status,['active',...statuses]);
 if(rid)requireUuid(rid);
 const before=filter(url,'cursor',52),cursor=before&&/^(\d{1,12}):([0-9a-f-]{36})$/.exec(before);
 if(before&&!cursor)throw new ApiError(400,'INVALID_CURSOR');
 const conditions=[],args=[];
 if(status==='active'){conditions.push('o.status NOT IN (?,?,?)');args.push(...closed)}
 else if(status){conditions.push('o.status=?');args.push(status)}
 if(rid){conditions.push('o.restaurant_id=?');args.push(rid)}
 if(q){conditions.push('(instr(lower(o.order_number),lower(?))>0 OR instr(lower(r.name),lower(?))>0)');args.push(q,q)}
 if(cursor){conditions.push('(o.created_at<? OR (o.created_at=? AND o.id<?))');args.push(Number(cursor[1]),Number(cursor[1]),requireUuid(cursor[2]))}
 const where=conditions.length?'WHERE '+conditions.join(' AND '):'';
 const result=await rows(env.DB.prepare(`SELECT o.id,o.order_number,o.status,o.version,o.delivery_method,
  o.total_minor-o.discount_minor AS total_minor,o.created_at,r.name AS restaurant_name,c.status AS claim_status,
  CASE WHEN o.courier_response='offered' AND o.courier_offer_expires_at<=unixepoch() AND o.status NOT IN ('Entregado','Cancelado','Rechazado')
   THEN 'offer_expired' WHEN o.pin_attempts>=5 AND o.status='En ubicación' THEN 'pin_locked' END AS alert
  FROM online_orders o JOIN restaurants r ON r.id=o.restaurant_id LEFT JOIN order_claims c ON c.order_id=o.id
  ${where} ORDER BY o.created_at DESC,o.id DESC LIMIT 51`).bind(...args));
 const page=result.slice(0,50),last=page.at(-1);
 const counts=await rows(env.DB.prepare('SELECT status,COUNT(*) AS total FROM online_orders GROUP BY status'));
 return {orders:page,counts,next:result.length>50?`${last.created_at}:${last.id}`:null};
}

async function accounts(env,url){
 const q=filter(url,'q',80),role=filter(url,'role',16);
 if(role)choice(role,['customer','courier']);
 const result=await rows(env.DB.prepare(`SELECT u.id,u.display_name,u.account_role,u.status,u.admin_locked,u.admin_version,
  c.active AS courier_active,
  (SELECT COUNT(*) FROM restaurant_memberships m WHERE m.user_id=u.id AND m.active=1) AS memberships,
  (SELECT COUNT(*) FROM auth_sessions s WHERE s.user_id=u.id AND s.revoked_at IS NULL AND s.expires_at>unixepoch()) AS sessions
  FROM users u LEFT JOIN courier_profiles c ON c.user_id=u.id
  WHERE u.account_role IN ('customer','courier') AND (?='' OR u.account_role=?)
  AND (?='' OR u.id=? OR instr(lower(u.display_name),lower(?))>0)
  ORDER BY u.created_at DESC,u.id LIMIT 51`).bind(role,role,q,q,q));
 return {accounts:result.slice(0,50),limited:result.length>50};
}

async function changeAccount(req,env,actor,id){
 id=requireUuid(id);
 const body=await readJson(req);
 requireKeys(body,['state','reason','version']);
 const next=choice(body.state,states),reason=requireText(body.reason,4,250,'reason');
 const version=requireInteger(body.version,1,2147483646,'version');
 const [account]=await env.DB.batch([
  env.DB.prepare(`UPDATE users SET status=CASE WHEN ?='revoke' THEN status WHEN ?='active' THEN 'active' ELSE 'suspended' END,
   admin_locked=CASE WHEN ?='locked' THEN 1 WHEN ? IN ('active','suspended') THEN 0 ELSE admin_locked END,admin_version=admin_version+1
   WHERE id=? AND id!=? AND account_role IN ('customer','courier') AND admin_version=?
     AND (admin_locked=0 OR ? IN ('active','locked','revoke'))`).bind(next,next,next,next,id,actor.userId,version,next),
  controlAudit(env,actor,'account_'+next,id,{reason,version:version+1}),
  env.DB.prepare(`UPDATE auth_sessions SET revoked_at=unixepoch() WHERE user_id=? AND revoked_at IS NULL
   AND changes()>0`).bind(id)
 ]);
 if(!account.meta.changes)throw new ApiError(409,'ADMIN_ACCOUNT_CHANGED');
 return {id,version:version+1};
}

async function claims(env,url){
 const state=filter(url,'status',10),q=filter(url,'q',80);
 if(state)choice(state,claimStates);
 const [claims,assignees]=await Promise.all([
  rows(env.DB.prepare(`SELECT c.*,o.order_number,r.name AS restaurant_name,u.display_name AS assignee_name
    FROM order_claims c JOIN online_orders o ON o.id=c.order_id JOIN restaurants r ON r.id=o.restaurant_id
    LEFT JOIN users u ON u.id=c.assignee_id WHERE (?='' OR c.status=?) AND (?='' OR instr(lower(o.order_number),lower(?))>0)
    ORDER BY (c.status='resolved'),c.updated_at DESC,c.order_id LIMIT 50`).bind(state,state,q,q)),
  rows(env.DB.prepare("SELECT id,display_name FROM users WHERE account_role='platform_admin' AND status='active' ORDER BY display_name,id LIMIT 100"))
 ]);
 return {claims,assignees};
}

async function changeClaim(req,env,actor,id){
 id=requireUuid(id);
 const data=await readJson(req);
 requireKeys(data,['version','status','assigneeId','resolution']);
 const state=choice(data.status,['review','resolved']),assignee=requireUuid(data.assigneeId);
 const version=requireInteger(data.version,1,2147483646,'version');
 const resolution=state==='resolved'?requireText(data.resolution,8,800,'resolution'):null;
 const [changed]=await env.DB.batch([
  env.DB.prepare(`UPDATE order_claims SET status=?,assignee_id=?,resolution=?,updated_at=unixepoch(),version=version+1
   WHERE order_id=? AND status!='resolved' AND version=?
   AND EXISTS(SELECT 1 FROM users WHERE id=? AND account_role='platform_admin' AND status='active')`).bind(state,assignee,resolution,id,version,assignee),
  controlAudit(env,actor,'claim_'+state,id,{assignee,resolution,version:version+1})
 ]);
 if(!changed.meta.changes)throw new ApiError(409,'ADMIN_CLAIM_CHANGED');
 return {version:version+1};
}

const codePattern=/^[A-Z0-9-]{4,24}$/;
async function coupons(req,env,actor,id){
 if(req.method==='GET')return {coupons:await rows(env.DB.prepare(`SELECT c.*,r.name AS restaurant_name,
  (SELECT COUNT(*) FROM online_orders o WHERE o.coupon_code=c.code) AS used
  FROM client_coupons c JOIN restaurants r ON r.id=c.restaurant_id ORDER BY c.ends_at DESC,c.code LIMIT 100`))};
 const data=await readJson(req);
 if(id){
  requireKeys(data,['active']);
  if(!codePattern.test(id)||typeof data.active!=='boolean')throw new ApiError(400,'INVALID_INPUT');
  const existing=await env.DB.prepare('SELECT restaurant_id,active,ends_at FROM client_coupons WHERE code=?').bind(id).first();
  if(!existing)throw new ApiError(404,'NOT_FOUND');
  if(data.active&&existing.ends_at<=clock())throw new ApiError(409,'COUPON_UNAVAILABLE');
  await env.DB.batch([
   env.DB.prepare('UPDATE client_coupons SET active=? WHERE code=? AND active!=?')
    .bind(Number(data.active),id,Number(data.active)),
   controlAudit(env,actor,'coupon_state',id,{active:data.active},existing.restaurant_id)
  ]);
  return {code:id,active:data.active};
 }
 requireKeys(data,['code','restaurantId','discountMinor','startsAt','endsAt','globalLimit']);
 const code=typeof data.code==='string'?data.code.trim().toUpperCase():'';
 if(!codePattern.test(code))throw new ApiError(400,'INVALID_COUPON');
 const rid=requireUuid(data.restaurantId),discount=requireInteger(data.discountMinor,1,100000000,'discountMinor');
 const start=requireInteger(data.startsAt,1,2147483646,'startsAt');
 const end=requireInteger(data.endsAt,Math.max(start+1,clock()+1),2147483647,'endsAt');
 const limit=requireInteger(data.globalLimit,1,100000,'globalLimit');
 const [created]=await env.DB.batch([
  env.DB.prepare(`INSERT INTO client_coupons(code,restaurant_id,discount_minor,starts_at,ends_at,global_limit)
   SELECT ?,id,?,?,?,? FROM restaurants WHERE id=? AND plan IN ('ONLINE','PLUS') ON CONFLICT(code) DO NOTHING`)
   .bind(code,discount,start,end,limit,rid),
  controlAudit(env,actor,'coupon_created',code,{discount,start,end,limit},rid)
 ]);
 if(!created.meta.changes)throw new ApiError(409,'ADMIN_COUPON_EXISTS');
 return {code};
}

const zoneName=value=>{
 const zone=requireText(value,1,50,'zone').toLowerCase();
 if(!/^[a-z0-9-]+$/.test(zone))throw new ApiError(400,'INVALID_ZONE');
 return zone;
};
const minor=(value,field)=>requireInteger(value,0,100000000,field);
async function deliveryRates(req,env,actor,simulation){
 const url=new URL(req.url);
 if(req.method==='GET'){
  const rid=requireUuid(url.searchParams.get('restaurant'));
  return {rates:await rows(env.DB.prepare(`SELECT id,zone,effective_at,base_minor,zone_minor,km_minor
   FROM control_delivery_rates WHERE restaurant_id=? ORDER BY effective_at DESC,id LIMIT 100`).bind(rid))};
 }
 const data=await readJson(req),rid=requireUuid(data.restaurantId),zone=zoneName(data.zone);
 if(simulation){
  requireKeys(data,['restaurantId','zone','meters','at']);
  const meters=requireInteger(data.meters,0,500000,'meters');
  const at=requireInteger(data.at,1,2147483647,'at');
  const row=await env.DB.prepare(`SELECT id,base_minor,zone_minor,km_minor,effective_at FROM control_delivery_rates
   WHERE restaurant_id=? AND zone=? AND effective_at<=? ORDER BY effective_at DESC LIMIT 1`).bind(rid,zone,at).first();
  if(!row)throw new ApiError(409,'ADMIN_RATE_MISSING');
  const distanceMinor=Math.floor((row.km_minor*meters+500)/1000),totalMinor=row.base_minor+row.zone_minor+distanceMinor;
  if(totalMinor>2000000000)throw new ApiError(400,'INVALID_TOTAL');
  return {...row,distanceMinor,totalMinor};
 }
 requireKeys(data,['restaurantId','zone','effectiveAt','baseMinor','zoneMinor','kmMinor']);
 const id=idempotencyKey(req),effective=requireInteger(data.effectiveAt,clock()+1,2147483647,'effectiveAt');
 const base=minor(data.baseMinor,'baseMinor'),surcharge=minor(data.zoneMinor,'zoneMinor'),km=minor(data.kmMinor,'kmMinor');
 try{
  const [created]=await env.DB.batch([
   env.DB.prepare(`INSERT INTO control_delivery_rates(id,restaurant_id,zone,effective_at,base_minor,zone_minor,km_minor,author_id)
    SELECT ?,id,?,?,?,?,?,? FROM restaurants WHERE id=? AND plan IN ('ONLINE','PLUS') ON CONFLICT DO NOTHING`)
    .bind(id,zone,effective,base,surcharge,km,actor.userId,rid),
   controlAudit(env,actor,'delivery_rate_created',id,{zone,effective,base,surcharge,km},rid)
  ]);
  if(!created.meta.changes)throw new ApiError(409,'ADMIN_RATE_EXISTS');
 }catch(err){if(String(err).includes('RATE_RETROACTIVE'))throw new ApiError(409,'ADMIN_RATE_RETROACTIVE');throw err}
 return {id};
}

async function courierRules(req,env,actor,url){
 if(req.method==='GET'){
  const rid=requireUuid(url.searchParams.get('restaurant'));
  return {courierRules:await rows(env.DB.prepare(`SELECT p.id,p.courier_id,u.display_name,p.effective_at,p.courier_bps
   FROM control_courier_rules p JOIN users u ON u.id=p.courier_id WHERE p.restaurant_id=?
   ORDER BY p.effective_at DESC,p.id LIMIT 100`).bind(rid))};
 }
 const input=await readJson(req);
 requireKeys(input,['restaurantId','courierId','effectiveAt','courierBps']);
 const rid=requireUuid(input.restaurantId),courier=requireUuid(input.courierId),id=idempotencyKey(req);
 const start=requireInteger(input.effectiveAt,clock()+1,2147483647,'effectiveAt');
 const share=requireInteger(input.courierBps,0,10000,'courierBps');
 try{
  const [changed]=await env.DB.batch([
   env.DB.prepare(`INSERT INTO control_courier_rules(id,restaurant_id,courier_id,effective_at,courier_bps,author_id)
    SELECT ?,r.id,c.user_id,?,?,? FROM restaurants r JOIN courier_profiles c ON c.user_id=? AND c.active=1
    WHERE r.id=? AND r.plan IN ('ONLINE','PLUS')
    AND NOT EXISTS(SELECT 1 FROM restaurant_settlements t WHERE t.restaurant_id=r.id AND t.status!='pending' AND t.until_at>?)
    ON CONFLICT DO NOTHING`).bind(id,start,share,actor.userId,courier,rid,start),
   controlAudit(env,actor,'courier_rule_created',id,{courier,start,share},rid)
  ]);
  if(!changed.meta.changes)throw new ApiError(409,'ADMIN_RATE_EXISTS');
 }catch(err){if(String(err).includes('RATE_RETROACTIVE'))throw new ApiError(409,'ADMIN_RATE_RETROACTIVE');throw err}
 return {id};
}

async function reports(env,url){
 const a=requireInteger(Number(url.searchParams.get('from')),1,2147483647,'from');
 const b=requireInteger(Number(url.searchParams.get('until')),a+1,Math.min(a+93*86400,2147483647),'until');
 const rid=filter(url,'restaurant',36);
 if(rid)requireUuid(rid);
 const [orders,sales,allocations,balances]=await Promise.all([
  rows(env.DB.prepare(`SELECT status,COUNT(*) AS orders FROM online_orders WHERE created_at>=? AND created_at<?
   AND (?='' OR restaurant_id=?) GROUP BY status ORDER BY status`).bind(a,b,rid,rid)),
  rows(env.DB.prepare(`SELECT r.id,r.name,s.method,COUNT(*) AS sales,SUM(s.total_minor) AS total_minor,SUM(s.discount_minor) AS discount_minor
   FROM restaurant_sales s JOIN restaurants r ON r.id=s.restaurant_id WHERE s.paid_at>=? AND s.paid_at<?
   AND (?='' OR r.id=?) GROUP BY r.id,s.method ORDER BY r.name,r.id,s.method LIMIT 501`).bind(a,b,rid,rid)),
  rows(env.DB.prepare(`SELECT t.id,r.name,t.from_at,t.until_at,t.status,SUM(a.restaurant_minor) AS restaurant_minor,
   SUM(a.courier_minor) AS courier_minor,SUM(a.dvolada_minor) AS dvolada_minor,SUM(a.commission_minor) AS commission_minor,
   SUM(a.adjustment_minor) AS adjustment_minor
   FROM restaurant_settlements t JOIN restaurants r ON r.id=t.restaurant_id LEFT JOIN (
    SELECT settlement_id,restaurant_minor,courier_minor,dvolada_minor,commission_minor,0 AS adjustment_minor FROM restaurant_settlement_lines
    UNION ALL SELECT settlement_id,restaurant_minor,courier_minor,dvolada_minor,0,restaurant_minor+courier_minor+dvolada_minor FROM restaurant_settlement_adjustments
   ) a ON a.settlement_id=t.id
   WHERE t.from_at<? AND t.until_at>? AND (?='' OR r.id=?) GROUP BY t.id ORDER BY t.from_at DESC,t.id LIMIT 501`).bind(b,a,rid,rid)),
  rows(env.DB.prepare(`SELECT a.courier_id,u.display_name,t.status,SUM(a.amount) AS courier_minor
   FROM (
    SELECT l.settlement_id,o.courier_id,l.courier_minor AS amount FROM restaurant_settlement_lines l JOIN online_orders o ON o.id=l.order_id
    UNION ALL SELECT a.settlement_id,o.courier_id,a.courier_minor FROM restaurant_settlement_adjustments a JOIN online_orders o ON o.id=a.order_id
   ) a JOIN users u ON u.id=a.courier_id JOIN restaurant_settlements t ON t.id=a.settlement_id
   WHERE t.from_at<? AND t.until_at>? AND (?='' OR t.restaurant_id=?) GROUP BY a.courier_id,t.status
   ORDER BY u.display_name,a.courier_id,t.status LIMIT 501`).bind(b,a,rid,rid))
 ]);
 return {orders,sales:sales.slice(0,500),allocations:allocations.slice(0,500),balances:balances.slice(0,500),
  truncated:[sales,allocations,balances].some(list=>list.length>500)};
}
export async function controlRoute(req,env,actor,path){
 requireRole(actor,'platform_admin');
 const url=new URL(req.url),method=req.method;
 let data;
 if(path==='orders'&&method==='GET')data=await orders(env,url);
 else if(path==='accounts'&&method==='GET')data=await accounts(env,url);
 else if(path.startsWith('accounts/')&&method==='PATCH')data=await changeAccount(req,env,actor,path.slice(9));
 else if(path==='claims'&&method==='GET')data=await claims(env,url);
 else if(path.startsWith('claims/')&&method==='PATCH')data=await changeClaim(req,env,actor,path.slice(7));
 else if(path==='coupons'&&['GET','POST'].includes(method))data=await coupons(req,env,actor);
 else if(path.startsWith('coupons/')&&method==='PATCH')data=await coupons(req,env,actor,path.slice(8));
 else if(path==='rates'&&['GET','POST'].includes(method)||path==='rates/simulate'&&method==='POST')
  data=await deliveryRates(req,env,actor,path.endsWith('/simulate'));
 else if(path==='courier-rules'&&['GET','POST'].includes(method))data=await courierRules(req,env,actor,url);
 else if(path==='reports'&&method==='GET')data=await reports(env,url);
 else if(path==='audit'&&method==='GET'){
  const subject=filter(url,'subject',82);
  data={events:await rows(env.DB.prepare(`SELECT a.*,u.display_name AS actor_name FROM control_audit a JOIN users u ON u.id=a.actor_id
   WHERE (?='' OR a.subject=?) ORDER BY a.id DESC LIMIT 100`).bind(subject,subject))};
 }else throw new ApiError(404,'NOT_FOUND');
 return respond(req,env,200,data);
}
