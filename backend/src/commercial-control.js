import {ApiError,readJson,requireKeys,requireRole,requireText,requireInteger,requireUuid,respond} from './security.js';
import {photoType} from './restaurant-operations.js';
const now=()=>Math.floor(Date.now()/1000);
const rows=async q=>(await q.all()).results||[];
const fail=()=>{throw new ApiError(400,'INVALID_INPUT')};
const choice=(v,choices)=>choices.includes(v)?v:fail();
const amount=(v,min=0)=>requireInteger(v,min,100000000,'amount');
const audit=(env,actor,action,subject,detail,restaurant=null)=>env.DB.prepare('INSERT INTO control_audit(actor_id,restaurant_id,subject,action,detail) SELECT ?,?,?,?,? WHERE changes()>0').bind(actor.userId,restaurant,subject,action,JSON.stringify(detail));
const spotFields='id,advertiser,title,placement,starts_at,ends_at,duration_seconds,link,price_minor,paid_minor,active,version,created_at';
export function validDate(value){
 if(typeof value!=='string'||!/^20[0-9]{2}-[0-9]{2}-[0-9]{2}$/.test(value))return fail();
 const parsed=new Date(value+'T00:00:00Z');
 if(!Number.isFinite(parsed.getTime())||parsed.toISOString().slice(0,10)!==value)return fail();
 return value;
}
export function nextBillingDate(date,frequency,anchor){
 validDate(date);requireInteger(anchor,1,31,'billingDay');
 if(frequency==='once')return null;
 const months={monthly:1,quarterly:3,semiannual:6,annual:12}[frequency];
 if(!months)return fail();
 const d=new Date(date+'T00:00:00Z');d.setUTCDate(1);d.setUTCMonth(d.getUTCMonth()+months);
 const last=new Date(Date.UTC(d.getUTCFullYear(),d.getUTCMonth()+1,0)).getUTCDate();
 d.setUTCDate(Math.min(anchor,last));return d.toISOString().slice(0,10);
}
function safeLink(value){
 const link=requireText(value??'',0,400,'link');
 if(!link)return '';
 let u;try{u=new URL(link)}catch{return fail()}
 if(u.protocol!=='https:'||u.username||u.password)return fail();
 return u.href;
}
export async function publicSpots(req,env,id){
 const t=now();
 if(id){
  const row=await env.DB.prepare('SELECT mime,image_base64,ends_at FROM commercial_spots WHERE id=? AND active=1 AND starts_at<=? AND ends_at>?').bind(requireUuid(id),t,t).first();
  if(!row)throw new ApiError(404,'NOT_FOUND');
  const binary=Uint8Array.from(atob(row.image_base64),x=>x.charCodeAt(0));
  return new Response(binary,{headers:{'Content-Type':row.mime,'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});
 }
 const data=await rows(env.DB.prepare('SELECT id,advertiser,title,placement,starts_at,ends_at,duration_seconds,link FROM commercial_spots WHERE active=1 AND starts_at<=? AND ends_at>? ORDER BY created_at DESC LIMIT 100').bind(t,t));
 return respond(req,env,200,{spots:data.map(x=>({...x,imageUrl:'/api/v1/catalog/spots/'+x.id+'/image'}))});
}
const hondurasToday=()=>new Date(Date.now()-21600000).toISOString().slice(0,10);
function paymentFields(d){
 const paymentId=requireUuid(d.id),version=requireInteger(d.version,1,2147483646,'version'),paidDate=validDate(d.paidDate);
 if(paidDate>hondurasToday())return fail();
 const method=choice(d.method,['cash','transfer','external_card']),reference=requireText(d.reference??'',0,100,'reference');
 return {paymentId,version,paidDate,method,reference};
}
function matchReceipt(prior,owner,id,fields,requested){
 if(prior[owner]!==id||prior.paid_date!==fields.paidDate||prior.method!==fields.method||prior.reference!==fields.reference||(requested!==undefined&&prior.amount_minor!==requested))throw new ApiError(409,'IDEMPOTENCY_KEY_REUSED');
 return {ok:true,replayed:true};
}
async function spotPayments(req,env,actor,id){
 if(req.method==='GET'){
  const spot=await env.DB.prepare('SELECT paid_minor,price_minor FROM commercial_spots WHERE id=?').bind(id).first();
  if(!spot)throw new ApiError(404,'NOT_FOUND');
  const payments=await rows(env.DB.prepare('SELECT id,amount_minor,paid_date,method,reference FROM spot_receipts WHERE spot_id=? ORDER BY paid_date DESC,created_at DESC,id DESC LIMIT 200').bind(id));
  const total=await env.DB.prepare('SELECT COALESCE(SUM(amount_minor),0) AS amount FROM spot_receipts WHERE spot_id=?').bind(id).first();
  return {payments,undatedMinor:spot.paid_minor-total.amount};
 }
 if(req.method!=='POST')throw new ApiError(405,'METHOD_NOT_ALLOWED');
 const d=await readJson(req);requireKeys(d,['id','version','paidDate','method','reference','amountMinor']);
 const fields=paymentFields(d),{paymentId,version,paidDate,method,reference}=fields,paid=amount(d.amountMinor,1);
 const prior=await env.DB.prepare('SELECT * FROM spot_receipts WHERE id=?').bind(paymentId).first();
 if(prior)return matchReceipt(prior,'spot_id',id,fields,paid);
 const [saved]=await env.DB.batch([
  env.DB.prepare('INSERT INTO spot_receipts(id,spot_id,amount_minor,paid_date,method,reference,actor_id) SELECT ?,id,?,?,?,?,? FROM commercial_spots WHERE id=? AND version=? AND price_minor-paid_minor>=? ON CONFLICT(id) DO NOTHING').bind(paymentId,paid,paidDate,method,reference,actor.userId,id,version,paid),
  env.DB.prepare('UPDATE commercial_spots SET paid_minor=paid_minor+?,version=version+1 WHERE id=? AND version=? AND changes()=1').bind(paid,id,version),
  audit(env,actor,'spot_payment',id,{paymentId,amount:paid,paidDate,method,reference})
 ]);
 if(!saved.meta.changes){const existing=await env.DB.prepare('SELECT * FROM spot_receipts WHERE id=?').bind(paymentId).first();if(existing)return matchReceipt(existing,'spot_id',id,fields,paid);throw new ApiError(409,'FINANCE_BALANCE_CHANGED')}
 return {ok:true};
}
async function spots(req,env,actor,id){
 if(req.method==='GET'&&!id)return {spots:(await rows(env.DB.prepare('SELECT '+spotFields+' FROM commercial_spots ORDER BY created_at DESC LIMIT 200')))};
 if(id&&req.method==='GET'){
  const row=await env.DB.prepare('SELECT mime,image_base64 FROM commercial_spots WHERE id=?').bind(id).first();
  if(!row)throw new ApiError(404,'NOT_FOUND');
  return {mime:row.mime,imageBase64:row.image_base64};
 }
 if(id&&req.method==='POST'){
  const body=await readJson(req);requireKeys(body,['action','version']);const version=requireInteger(body.version,1,2147483646,'version');
  const action=choice(body.action,['activate','pause','delete']);
  const stmt=action==='delete'?env.DB.prepare('DELETE FROM commercial_spots WHERE id=? AND version=? AND price_minor=0 AND paid_minor=0').bind(id,version):env.DB.prepare('UPDATE commercial_spots SET active=?,version=version+1 WHERE id=? AND version=?').bind(action==='activate'?1:0,id,version);
  const [r]=await env.DB.batch([stmt,audit(env,actor,'spot_'+action,id,{version})]);if(!r.meta.changes){if(action==='delete'&&await env.DB.prepare('SELECT 1 FROM commercial_spots WHERE id=? AND version=? AND (price_minor>0 OR paid_minor>0)').bind(id,version).first())throw new ApiError(409,'SPOT_FINANCIAL_HISTORY');throw new ApiError(409,'ADMIN_ACCOUNT_CHANGED')}return {ok:true};
 }
 if((req.method!=='POST'||id)&&(req.method!=='PATCH'||!id))throw new ApiError(405,'METHOD_NOT_ALLOWED');
 const d=await readJson(req,165000);requireKeys(d,['advertiser','title','placement','startsAt','endsAt','durationSeconds','link','imageBase64','priceMinor','paidMinor','version']);
 const advertiser=requireText(d.advertiser,2,120,'advertiser'),title=requireText(d.title,2,120,'title'),placement=choice(d.placement,['carousel','feed','restaurants']);
 const start=requireInteger(d.startsAt,1,4102444800,'start'),end=requireInteger(d.endsAt,start+1,4102444800,'end');
 const duration=requireInteger(d.durationSeconds,5,30,'duration'),link=safeLink(d.link),price=amount(d.priceMinor),paid=requireInteger(d.paidMinor,0,price,'paid');
 let mime=null;if(d.imageBase64!==undefined){try{if(typeof d.imageBase64==='string'&&d.imageBase64.length<=163840)mime=photoType(atob(d.imageBase64))}catch{}if(!mime)throw new ApiError(400,'INVALID_PHOTO')}
 if(!id&&!mime)throw new ApiError(400,'INVALID_PHOTO');
 const key=id||crypto.randomUUID();let stmt;
 if(id){const version=requireInteger(d.version,1,2147483646,'version');stmt=env.DB.prepare('UPDATE commercial_spots SET advertiser=?,title=?,placement=?,starts_at=?,ends_at=?,duration_seconds=?,link=?,price_minor=?,paid_minor=?,image_base64=COALESCE(?,image_base64),mime=COALESCE(?,mime),version=version+1 WHERE id=? AND version=? AND paid_minor=?').bind(advertiser,title,placement,start,end,duration,link,price,paid,d.imageBase64??null,mime,key,version,paid)}
 else stmt=env.DB.prepare('INSERT INTO commercial_spots(id,advertiser,title,placement,starts_at,ends_at,duration_seconds,link,price_minor,paid_minor,image_base64,mime) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)').bind(key,advertiser,title,placement,start,end,duration,link,price,paid,d.imageBase64,mime);
 const [r]=await env.DB.batch([stmt,audit(env,actor,id?'spot_updated':'spot_created',key,{price,paid,placement,start,end})]);if(!r.meta.changes){if(id&&await env.DB.prepare('SELECT 1 FROM commercial_spots WHERE id=? AND version=? AND paid_minor>?').bind(id,d.version,paid).first())throw new ApiError(409,'SPOT_PAYMENT_REDUCTION');if(id&&await env.DB.prepare('SELECT 1 FROM commercial_spots WHERE id=? AND version=? AND paid_minor<?').bind(id,d.version,paid).first())throw new ApiError(409,'SPOT_USE_RECEIPT');throw new ApiError(409,'ADMIN_ACCOUNT_CHANGED')}return {id:key};
}
async function contract(req,env,actor,id,payment){
 const restaurant=await env.DB.prepare('SELECT id,plan FROM restaurants WHERE id=?').bind(id).first();if(!restaurant)throw new ApiError(404,'RESTAURANT_NOT_FOUND');
 const current=await env.DB.prepare('SELECT * FROM restaurant_contracts WHERE restaurant_id=?').bind(id).first();
 const fixed=Boolean(await env.DB.prepare('SELECT 1 FROM launch_pricing WHERE id=1').first());
 const partial=async()=>current?.next_due?(await env.DB.prepare('SELECT COALESCE(SUM(amount_minor),0) AS amount FROM contract_receipts WHERE restaurant_id=? AND due_date=?').bind(id,current.next_due).first()).amount:0;
 if(req.method==='GET'&&!payment){
  const payments=await rows(env.DB.prepare('SELECT id,due_date,amount_minor,paid_date,method,reference,created_at FROM restaurant_contract_payments WHERE restaurant_id=? UNION ALL SELECT id,due_date,amount_minor,paid_date,method,reference,created_at FROM contract_receipts WHERE restaurant_id=? ORDER BY paid_date DESC,created_at DESC,id DESC LIMIT 200').bind(id,id));
  const activation=await env.DB.prepare('SELECT a.*,COALESCE((SELECT SUM(amount_minor) FROM restaurant_activation_receipts p WHERE p.restaurant_id=a.restaurant_id),0) AS paid_minor FROM restaurant_activation_charges a WHERE restaurant_id=?').bind(id).first();
  const activationPayments=await rows(env.DB.prepare('SELECT id,amount_minor,paid_date,method,reference FROM restaurant_activation_receipts WHERE restaurant_id=? ORDER BY paid_date DESC,created_at DESC LIMIT 200').bind(id));
  return {contract:current,payments,plan:restaurant.plan,currentPaidMinor:await partial(),activation,activationPayments,fixed};
 }
 if(payment&&req.method==='POST'){
  const d=await readJson(req);requireKeys(d,['id','version','paidDate','method','reference','amountMinor']);
  const fields=paymentFields(d),{paymentId,version,paidDate,method,reference}=fields;
  const requested=d.amountMinor===undefined?undefined:amount(d.amountMinor,1);
  const old=await env.DB.prepare('SELECT * FROM restaurant_contract_payments WHERE id=?').bind(paymentId).first();
  const prior=old||await env.DB.prepare('SELECT * FROM contract_receipts WHERE id=?').bind(paymentId).first();
  if(prior)return matchReceipt(prior,'restaurant_id',id,fields,requested);
  if(!current?.next_due)throw new ApiError(409,'CONTRACT_NO_PAYMENT_DUE');
  if(paidDate<current.start_date)return fail();
  const balance=current.amount_minor-await partial(),paid=requested??balance;
  if(paid<=0||paid>balance)throw new ApiError(409,'FINANCE_BALANCE_CHANGED');
  const next=nextBillingDate(current.next_due,current.frequency,current.billing_day);
  const [saved]=await env.DB.batch([
   env.DB.prepare(`INSERT INTO contract_receipts(id,restaurant_id,due_date,amount_minor,paid_date,method,reference,actor_id)
    SELECT ?,restaurant_id,next_due,?,?,?,?,? FROM restaurant_contracts c WHERE restaurant_id=? AND version=? AND next_due=?
    AND amount_minor-COALESCE((SELECT SUM(amount_minor) FROM contract_receipts r WHERE r.restaurant_id=c.restaurant_id AND r.due_date=c.next_due),0)>=?
    AND NOT EXISTS(SELECT 1 FROM restaurant_contract_payments p WHERE p.id=? OR (p.restaurant_id=c.restaurant_id AND p.due_date=c.next_due)) ON CONFLICT(id) DO NOTHING`).bind(paymentId,paid,paidDate,method,reference,actor.userId,id,version,current.next_due,paid,paymentId),
   env.DB.prepare(`UPDATE restaurant_contracts SET next_due=CASE WHEN amount_minor=(SELECT SUM(amount_minor) FROM contract_receipts r WHERE r.restaurant_id=restaurant_contracts.restaurant_id AND r.due_date=restaurant_contracts.next_due) THEN ? ELSE next_due END,version=version+1,updated_at=unixepoch() WHERE restaurant_id=? AND version=? AND changes()=1`).bind(next,id,version),
   audit(env,actor,'contract_payment',id,{paymentId,amount:paid,dueDate:current.next_due,paidDate,method,reference},id)
  ]);
  if(!saved.meta.changes){const existing=await env.DB.prepare('SELECT * FROM contract_receipts WHERE id=?').bind(paymentId).first();if(existing)return matchReceipt(existing,'restaurant_id',id,fields,requested);throw new ApiError(409,'FINANCE_BALANCE_CHANGED')}return {ok:true};
 }
 if(req.method!=='PATCH'||payment)throw new ApiError(405,'METHOD_NOT_ALLOWED');
 const d=await readJson(req);requireKeys(d,['plan','startDate','nextDue','frequency','amountMinor','version']);
 const plan=choice(d.plan,['ONLINE','LOCAL','PLUS']),start=validDate(d.startDate),due=validDate(d.nextDue),frequency=choice(d.frequency,['monthly','quarterly','semiannual','annual','once']);
 if(due<start)return fail();
 const price=amount(d.amountMinor,1),version=requireInteger(d.version,0,2147483646,'version');
 if(fixed&&plan==='ONLINE'&&(price!==50000||frequency!=='monthly'))throw new ApiError(409,'LAUNCH_PRICING_FIXED');
 const billing=Number(due.slice(-2));
 const already=await env.DB.prepare('SELECT 1 FROM restaurant_contract_payments WHERE restaurant_id=? AND due_date>=? UNION ALL SELECT 1 FROM contract_receipts WHERE restaurant_id=? AND due_date>=? LIMIT 1').bind(id,due,id,due).first();
 if(await partial()>0)throw new ApiError(409,'CONTRACT_PARTIAL_LOCK');
 if(already)throw new ApiError(409,'CONTRACT_PERIOD_PAID');
 const stmt=current?env.DB.prepare('UPDATE restaurant_contracts SET start_date=?,next_due=?,frequency=?,billing_day=?,amount_minor=?,version=version+1,updated_at=unixepoch() WHERE restaurant_id=? AND version=? AND NOT EXISTS(SELECT 1 FROM contract_receipts r WHERE r.restaurant_id=restaurant_contracts.restaurant_id AND r.due_date=restaurant_contracts.next_due)').bind(start,due,frequency,billing,price,id,version):env.DB.prepare('INSERT INTO restaurant_contracts(restaurant_id,start_date,next_due,frequency,billing_day,amount_minor) SELECT ?,?,?,?,?,? WHERE ?=0 ON CONFLICT(restaurant_id) DO NOTHING').bind(id,start,due,frequency,billing,price,version);
 const [changed]=await env.DB.batch([stmt,env.DB.prepare("UPDATE restaurants SET plan=?,online_state=CASE WHEN ?='LOCAL' THEN 'closed' ELSE online_state END WHERE id=? AND changes()=1").bind(plan,plan,id),audit(env,actor,'contract_saved',id,{plan,start,due,frequency,price},id),env.DB.prepare("INSERT INTO restaurant_activation_charges(restaurant_id,amount_minor) SELECT ?,150000 WHERE ?='ONLINE' AND EXISTS(SELECT 1 FROM launch_pricing WHERE id=1) AND changes()=1 ON CONFLICT DO NOTHING").bind(id,plan)]);
 if(!changed.meta.changes)throw new ApiError(409,'ADMIN_ACCOUNT_CHANGED');return {ok:true};
}
async function activationPayment(req,env,actor,id){
 if(req.method!=='POST')throw new ApiError(405,'METHOD_NOT_ALLOWED');
 const d=await readJson(req);requireKeys(d,['id','version','amountMinor','paidDate','method','reference']);
 const fields=paymentFields(d),{paymentId,version,paidDate,method,reference}=fields,paid=amount(d.amountMinor,1);
 const prior=await env.DB.prepare('SELECT * FROM restaurant_activation_receipts WHERE id=?').bind(paymentId).first();
 if(prior)return matchReceipt(prior,'restaurant_id',id,fields,paid);
 const [saved]=await env.DB.batch([
  env.DB.prepare(`INSERT INTO restaurant_activation_receipts(id,restaurant_id,amount_minor,paid_date,method,reference,actor_id)
   SELECT ?,restaurant_id,?,?,?,?,? FROM restaurant_activation_charges a WHERE restaurant_id=? AND version=? AND amount_minor-COALESCE((SELECT SUM(amount_minor) FROM restaurant_activation_receipts p WHERE p.restaurant_id=a.restaurant_id),0)>=? ON CONFLICT(id) DO NOTHING`).bind(paymentId,paid,paidDate,method,reference,actor.userId,id,version,paid),
  env.DB.prepare('UPDATE restaurant_activation_charges SET version=version+1 WHERE restaurant_id=? AND version=? AND changes()=1').bind(id,version),
  audit(env,actor,'restaurant_activation_payment',id,{paymentId,amount:paid,paidDate,method,reference},id)
 ]);
 if(!saved.meta.changes){const existing=await env.DB.prepare('SELECT * FROM restaurant_activation_receipts WHERE id=?').bind(paymentId).first();if(existing)return matchReceipt(existing,'restaurant_id',id,fields,paid);throw new ApiError(409,'FINANCE_BALANCE_CHANGED')}
 return {ok:true};
}
async function financeSummary(env,req){
 const day=hondurasToday(),params=new URL(req.url).searchParams;
 const from=params.get('from'),until=params.get('until');
 if((from===null)!==(until===null))return fail();
 if(from!==null){validDate(from);validDate(until);if(from>until)return fail()}
 const start=from||'2000-01-01',end=until||'2099-12-31';
 const total=await env.DB.prepare(`SELECT
 (SELECT COALESCE(SUM(amount_minor),0) FROM restaurant_contract_payments WHERE paid_date BETWEEN ? AND ?)+(SELECT COALESCE(SUM(amount_minor),0) FROM contract_receipts WHERE paid_date BETWEEN ? AND ?) AS affiliationReceived,
 (SELECT COALESCE(SUM(paid_minor),0) FROM commercial_spots) AS advertisingRecorded,
 (SELECT COALESCE(SUM(price_minor-paid_minor),0) FROM commercial_spots) AS advertisingOutstanding,
 (SELECT COALESCE(SUM(amount_minor),0) FROM spot_receipts WHERE paid_date BETWEEN ? AND ?) AS advertisingPeriod,
 (SELECT COALESCE(SUM(paid_minor),0) FROM commercial_spots)-(SELECT COALESCE(SUM(amount_minor),0) FROM spot_receipts) AS advertisingUndated,
 (SELECT COALESCE(SUM(l.dvolada_minor),0) FROM restaurant_settlement_lines l JOIN restaurant_settlements s ON s.id=l.settlement_id WHERE s.status='paid' AND date(s.paid_at-21600,'unixepoch') BETWEEN ? AND ?)+
 (SELECT COALESCE(SUM(a.dvolada_minor),0) FROM restaurant_settlement_adjustments a JOIN restaurant_settlements s ON s.id=a.settlement_id WHERE s.status='paid' AND date(s.paid_at-21600,'unixepoch') BETWEEN ? AND ?) AS settledDvolada`).bind(start,end,start,end,start,end,start,end,start,end).first();
 const contracts=await rows(env.DB.prepare(`SELECT c.*,COALESCE((SELECT SUM(amount_minor) FROM contract_receipts r WHERE r.restaurant_id=c.restaurant_id AND r.due_date=c.next_due),0) AS partial FROM restaurant_contracts c WHERE next_due IS NOT NULL`));
 let affiliationNextDue=0,affiliationOverdue=0,affiliationDueToday=0;
 for(const c of contracts){
  let due=c.next_due,balance=c.amount_minor-c.partial;affiliationNextDue+=balance;
  // Current obligation plus all subsequent scheduled installments before today.
  for(let n=0;due&&due<=day&&n<1200;n++){
   if(due===day)affiliationDueToday+=balance;else affiliationOverdue+=balance;
   due=nextBillingDate(due,c.frequency,c.billing_day);balance=c.amount_minor;
  }
 }
 const courier=await env.DB.prepare(`SELECT (SELECT COALESCE(SUM(amount_minor),0) FROM courier_fee_receipts WHERE paid_date BETWEEN ? AND ?) AS courierFeesReceived,(SELECT COALESCE(SUM(c.amount_minor-COALESCE((SELECT SUM(amount_minor) FROM courier_fee_receipts r WHERE r.charge_id=c.id),0)),0) FROM courier_fee_charges c) AS courierFeesOutstanding`).bind(start,end).first();
 const activation=await env.DB.prepare(`SELECT (SELECT COALESCE(SUM(amount_minor),0) FROM restaurant_activation_receipts WHERE paid_date BETWEEN ? AND ?) AS activationReceived,(SELECT COALESCE(SUM(a.amount_minor-COALESCE((SELECT SUM(amount_minor) FROM restaurant_activation_receipts r WHERE r.restaurant_id=a.restaurant_id),0)),0) FROM restaurant_activation_charges a) AS activationOutstanding`).bind(start,end).first();
 const advertisingReceived=from===null?total.advertisingRecorded:total.advertisingPeriod;
 return {...total,...courier,...activation,advertisingReceived,affiliationNextDue,affiliationOverdue,affiliationDueToday,
  totalReceived:total.affiliationReceived+advertisingReceived+total.settledDvolada+courier.courierFeesReceived+activation.activationReceived,asOf:day,from,until};
}
export async function commercialControl(req,env,actor,path){
 requireRole(actor,'platform_admin');
 if(path==='finance'&&req.method==='GET')return respond(req,env,200,await financeSummary(env,req));
 const pay=/^spots\/([0-9a-f-]{36})\/payments$/.exec(path);
 if(pay)return respond(req,env,200,await spotPayments(req,env,actor,requireUuid(pay[1])));
 const s=/^spots(?:\/([0-9a-f-]{36}))?$/.exec(path);
 if(s)return respond(req,env,200,await spots(req,env,actor,s[1]?requireUuid(s[1]):null));
 const activation=/^contracts\/([0-9a-f-]{36})\/activation$/.exec(path);
 if(activation)return respond(req,env,200,await activationPayment(req,env,actor,requireUuid(activation[1])));
 const c=/^contracts\/([0-9a-f-]{36})(\/payments)?$/.exec(path);
 if(c)return respond(req,env,200,await contract(req,env,actor,requireUuid(c[1]),Boolean(c[2])));
 throw new ApiError(404,'NOT_FOUND');
}
export async function rateCourier(req,env,actor,id){
 requireRole(actor,'customer');id=requireUuid(id);
 const d=await readJson(req);requireKeys(d,['stars']);const stars=requireInteger(d.stars,1,5,'stars');
 const result=await env.DB.prepare("INSERT INTO courier_ratings(order_id,customer_id,courier_id,stars) SELECT id,customer_id,courier_id,? FROM online_orders WHERE id=? AND customer_id=? AND status='Entregado' AND delivery_method='delivery' AND courier_id IS NOT NULL ON CONFLICT(order_id) DO NOTHING").bind(stars,id,actor.userId).run();
 if(!result.meta.changes){const old=await env.DB.prepare('SELECT stars FROM courier_ratings WHERE order_id=? AND customer_id=?').bind(id,actor.userId).first();if(old?.stars===stars)return {stars,replayed:true};throw new ApiError(409,'RATING_NOT_AVAILABLE')}
 return {stars};
}
