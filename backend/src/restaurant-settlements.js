import {ApiError,idempotencyKey,readJson,requireInteger,requireKeys,requireRole,requireStaff,requireText,requireUuid} from './security.js';

const step={calculate:['pending','calculated','calculated'],approve:['calculated','approved','approved'],
 markPaid:['approved','paid','paid']};
const rows=async query=>(await query.all()).results||[];
const now=()=>Math.floor(Date.now()/1000);
const statusError=error=>{
 const code=/SETTLEMENT_(OVERLAP|PERIOD_OPEN|SHIFT_OPEN|RULE_MISSING|ADJUSTMENT_INVALID)/.exec(String(error))?.[0];
 if(code)throw new ApiError(409,code);
 throw error;
};

export async function settlementRule(req,env,actor,restaurant){
 requireRole(actor,'platform_admin');
 const id=requireUuid(restaurant);
 if(req.method==='GET')return {rules:await rows(env.DB.prepare(`SELECT id,effective_at,commission_bps,courier_bps FROM restaurant_settlement_rules
  WHERE restaurant_id=? ORDER BY effective_at DESC LIMIT 50`).bind(id))};
 const data=await readJson(req);
 requireKeys(data,['effectiveAt','commissionBps','courierBps']);
 const start=requireInteger(data.effectiveAt,1,4102444800,'effectiveAt');
 const commission=requireInteger(data.commissionBps,0,10000,'commissionBps');
 const courier=requireInteger(data.courierBps,0,10000,'courierBps');
 const present=await env.DB.prepare("SELECT 1 FROM restaurants WHERE id=? AND plan IN ('ONLINE','PLUS')").bind(id).first();
 if(!present)throw new ApiError(404,'RESTAURANT_NOT_FOUND');
 await env.DB.prepare(`INSERT INTO restaurant_settlement_rules(id,restaurant_id,effective_at,commission_bps,courier_bps,author_id)
  VALUES(?,?,?,?,?,?) ON CONFLICT(restaurant_id,effective_at) DO NOTHING`).bind(crypto.randomUUID(),id,start,commission,courier,actor.userId).run();
 const existing=await env.DB.prepare('SELECT id,commission_bps,courier_bps FROM restaurant_settlement_rules WHERE restaurant_id=? AND effective_at=?')
  .bind(id,start).first();
 if(existing.commission_bps!==commission||existing.courier_bps!==courier)throw new ApiError(409,'SETTLEMENT_RULE_EXISTS');
 return {id:existing.id};
}

async function detail(env,settlement){
 const id=settlement.id;
 const [lines,adjustments,byMethod,shifts,split]=await Promise.all([
  rows(env.DB.prepare(`SELECT l.*,o.order_number,o.courier_id,s.shift_id,s.paid_at FROM restaurant_settlement_lines l
   JOIN online_orders o ON o.id=l.order_id JOIN restaurant_sales s ON s.order_id=l.order_id
   WHERE l.settlement_id=? ORDER BY s.paid_at,l.order_id LIMIT 501`).bind(id)),
  rows(env.DB.prepare(`SELECT a.*,o.order_number FROM restaurant_settlement_adjustments a
   JOIN online_orders o ON o.id=a.order_id WHERE a.settlement_id=? ORDER BY a.created_at,a.id LIMIT 501`).bind(id)),
  rows(env.DB.prepare(`SELECT method,COUNT(*) AS orders,SUM(total_minor) AS total_minor,SUM(discount_minor) AS discount_minor,
   SUM(delivery_minor) AS delivery_minor FROM restaurant_settlement_lines WHERE settlement_id=? GROUP BY method`).bind(id)),
  rows(env.DB.prepare(`SELECT DISTINCT h.id,h.opened_at,h.closed_at,h.expected_cash_minor,h.counted_minor
   FROM restaurant_settlement_lines l JOIN restaurant_sales s ON s.order_id=l.order_id
   JOIN restaurant_shifts h ON h.id=s.shift_id WHERE l.settlement_id=? ORDER BY h.closed_at LIMIT 501`).bind(id)),
  env.DB.prepare(`SELECT COALESCE(SUM(restaurant_minor),0) AS restaurant_minor,
    COALESCE(SUM(courier_minor),0) AS courier_minor,COALESCE(SUM(dvolada_minor),0) AS dvolada_minor FROM (
     SELECT restaurant_minor,courier_minor,dvolada_minor FROM restaurant_settlement_lines WHERE settlement_id=?
     UNION ALL SELECT restaurant_minor,courier_minor,dvolada_minor FROM restaurant_settlement_adjustments WHERE settlement_id=?
    )`).bind(id,id).first()
 ]);
 return {settlement,lines:lines.slice(0,500),adjustments:adjustments.slice(0,500),byMethod,shifts:shifts.slice(0,500),split,
  truncated:lines.length>500||adjustments.length>500||shifts.length>500};
}

export async function settlements(req,env,actor,restaurant,id,operation,central=false){
 const get=()=>env.DB.prepare('SELECT * FROM restaurant_settlements WHERE id=? AND restaurant_id=?').bind(id,restaurant).first();
 if(req.method==='GET'){
  if(!id)return {settlements:await rows(env.DB.prepare(`SELECT * FROM restaurant_settlements WHERE restaurant_id=?
   ORDER BY from_at DESC,id LIMIT 50`).bind(restaurant)),
   configured:Boolean(await env.DB.prepare('SELECT 1 FROM restaurant_settlement_rules WHERE restaurant_id=? AND effective_at<=? LIMIT 1').bind(restaurant,now()).first())};
  const record=await get();
  if(!record)throw new ApiError(404,'SETTLEMENT_NOT_FOUND');
  return detail(env,record);
 }
 const data=await readJson(req);
 if(!id){
  requireKeys(data,['from','until']);
  if(central&&!await env.DB.prepare("SELECT 1 FROM restaurants WHERE id=? AND plan IN ('ONLINE','PLUS')")
   .bind(restaurant).first())throw new ApiError(404,'RESTAURANT_NOT_FOUND');
  const from=requireInteger(data.from,1,4102444800,'from');
  const until=requireInteger(data.until,from+1,Math.min(from+93*86400,now()),'until');
  try{await env.DB.prepare(`INSERT INTO restaurant_settlements(id,restaurant_id,from_at,until_at,created_by)
    VALUES(?,?,?,?,?) ON CONFLICT(restaurant_id,from_at,until_at) DO NOTHING`)
   .bind(crypto.randomUUID(),restaurant,from,until,actor.userId).run()}catch(error){statusError(error)}
  const settlement=await env.DB.prepare('SELECT * FROM restaurant_settlements WHERE restaurant_id=? AND from_at=? AND until_at=?')
   .bind(restaurant,from,until).first();
  return {settlement};
 }
 if(operation==='adjust'){
  if(!central)throw new ApiError(403,'ROLE_FORBIDDEN');
  requireKeys(data,['orderId','reason','kind','restaurantMinor','courierMinor','dvoladaMinor']);
  const key=idempotencyKey(req),orderId=requireUuid(data.orderId);
  const reason=requireText(data.reason,8,250,'reason');
  const kind=data.kind;
  if(!['refund','adjustment'].includes(kind))throw new ApiError(400,'INVALID_INPUT');
  const split=['restaurantMinor','courierMinor','dvoladaMinor'].map(name=>requireInteger(data[name],-2000000000,2000000000,name));
  if(!split.some(Boolean))throw new ApiError(400,'INVALID_INPUT');
  if(!await get())throw new ApiError(404,'SETTLEMENT_NOT_FOUND');
  const lookup=()=>env.DB.prepare('SELECT * FROM restaurant_settlement_adjustments WHERE id=? AND settlement_id=?').bind(key,id).first();
  let saved=await lookup();
  if(!saved){
   try{await env.DB.prepare(`INSERT INTO restaurant_settlement_adjustments
    (id,settlement_id,order_id,author_id,reason,kind,restaurant_minor,courier_minor,dvolada_minor) VALUES(?,?,?,?,?,?,?,?,?)`)
    .bind(key,id,orderId,actor.userId,reason,kind,...split).run()}
   catch(error){if(!await lookup())statusError(error)}
   saved=await lookup();
  }
  if(saved.order_id!==orderId||saved.reason!==reason||saved.kind!==kind||
   ['restaurant_minor','courier_minor','dvolada_minor'].some((name,index)=>saved[name]!==split[index]))
   throw new ApiError(409,'IDEMPOTENCY_KEY_REUSED');
  return {adjustment:saved};
 }
 const next=step[operation];
 if(!next)throw new ApiError(404,'NOT_FOUND');
 const [previous,status,prefix]=next;
 if(!central&&status!=='calculated')throw new ApiError(403,'ROLE_FORBIDDEN');
 requireKeys(data,status==='paid'?['reference']:[]);
 const reference=status==='paid'?requireText(data.reference,4,120,'reference'):null;
 try{
  const guard=status==='approved'? `AND (EXISTS(SELECT 1 FROM restaurant_settlement_lines WHERE settlement_id=restaurant_settlements.id)
    OR EXISTS(SELECT 1 FROM restaurant_settlement_adjustments WHERE settlement_id=restaurant_settlements.id))`:'';
  await env.DB.prepare(`UPDATE restaurant_settlements SET status=?,${prefix}_by=?,${prefix}_at=unixepoch(),
    external_reference=COALESCE(?,external_reference) WHERE id=? AND restaurant_id=? AND status=? ${guard}`)
   .bind(status,actor.userId,reference,id,restaurant,previous).run();
 }catch(error){statusError(error)}
 const saved=await get();
 if(!saved)throw new ApiError(404,'SETTLEMENT_NOT_FOUND');
 if(saved.status!==status||(status==='paid'&&saved.external_reference!==reference))throw new ApiError(409,'SETTLEMENT_STATE');
 return {settlement:saved};
}

export const requireSettlementStaff=access=>requireStaff(access.staff_role,['owner','manager']);
