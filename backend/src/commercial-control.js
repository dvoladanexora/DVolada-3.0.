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
async function spots(req,env,actor,id){
 if(req.method==='GET'&&!id)return {spots:(await rows(env.DB.prepare('SELECT '+spotFields+' FROM commercial_spots ORDER BY created_at DESC LIMIT 200')))};
 if(id&&req.method==='POST'){
  const body=await readJson(req);requireKeys(body,['action','version']);const version=requireInteger(body.version,1,2147483646,'version');
  const action=choice(body.action,['activate','pause','delete']);
  const stmt=action==='delete'?env.DB.prepare('DELETE FROM commercial_spots WHERE id=? AND version=?').bind(id,version):env.DB.prepare('UPDATE commercial_spots SET active=?,version=version+1 WHERE id=? AND version=?').bind(action==='activate'?1:0,id,version);
  const [r]=await env.DB.batch([stmt,audit(env,actor,'spot_'+action,id,{version})]);if(!r.meta.changes)throw new ApiError(409,'ADMIN_ACCOUNT_CHANGED');return {ok:true};
 }
 if((req.method!=='POST'||id)&&(req.method!=='PATCH'||!id))throw new ApiError(405,'METHOD_NOT_ALLOWED');
 const d=await readJson(req,165000);requireKeys(d,['advertiser','title','placement','startsAt','endsAt','durationSeconds','link','imageBase64','priceMinor','paidMinor','version']);
 const advertiser=requireText(d.advertiser,2,120,'advertiser'),title=requireText(d.title,2,120,'title'),placement=choice(d.placement,['carousel','feed','restaurants']);
 const start=requireInteger(d.startsAt,1,4102444800,'start'),end=requireInteger(d.endsAt,start+1,4102444800,'end');
 const duration=requireInteger(d.durationSeconds,5,30,'duration'),link=safeLink(d.link),price=amount(d.priceMinor),paid=requireInteger(d.paidMinor,0,price,'paid');
 let mime=null;if(d.imageBase64!==undefined){try{if(typeof d.imageBase64==='string'&&d.imageBase64.length<=163840)mime=photoType(atob(d.imageBase64))}catch{}if(!mime)throw new ApiError(400,'INVALID_PHOTO')}
 if(!id&&!mime)throw new ApiError(400,'INVALID_PHOTO');
 const key=id||crypto.randomUUID();let stmt;
 if(id){const version=requireInteger(d.version,1,2147483646,'version');stmt=env.DB.prepare('UPDATE commercial_spots SET advertiser=?,title=?,placement=?,starts_at=?,ends_at=?,duration_seconds=?,link=?,price_minor=?,paid_minor=?,image_base64=COALESCE(?,image_base64),mime=COALESCE(?,mime),version=version+1 WHERE id=? AND version=?').bind(advertiser,title,placement,start,end,duration,link,price,paid,d.imageBase64??null,mime,key,version)}
 else stmt=env.DB.prepare('INSERT INTO commercial_spots(id,advertiser,title,placement,starts_at,ends_at,duration_seconds,link,price_minor,paid_minor,image_base64,mime) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)').bind(key,advertiser,title,placement,start,end,duration,link,price,paid,d.imageBase64,mime);
 const [r]=await env.DB.batch([stmt,audit(env,actor,id?'spot_updated':'spot_created',key,{price,paid,placement,start,end})]);if(!r.meta.changes)throw new ApiError(409,'ADMIN_ACCOUNT_CHANGED');return {id:key};
}
async function contract(req,env,actor,id,payment){
 const restaurant=await env.DB.prepare('SELECT id,plan FROM restaurants WHERE id=?').bind(id).first();if(!restaurant)throw new ApiError(404,'RESTAURANT_NOT_FOUND');
 const current=await env.DB.prepare('SELECT * FROM restaurant_contracts WHERE restaurant_id=?').bind(id).first();
 if(req.method==='GET'&&!payment){
  const payments=await rows(env.DB.prepare('SELECT id,due_date,amount_minor,paid_date,method,reference FROM restaurant_contract_payments WHERE restaurant_id=? ORDER BY paid_date DESC,created_at DESC LIMIT 200').bind(id));
  return {contract:current,payments,plan:restaurant.plan};
 }
 if(payment&&req.method==='POST'){
  const d=await readJson(req);requireKeys(d,['id','version','paidDate','method','reference']);
  const paymentId=requireUuid(d.id),version=requireInteger(d.version,1,2147483646,'version'),paidDate=validDate(d.paidDate);
  const today=new Date(Date.now()-21600000).toISOString().slice(0,10);
  if(paidDate>today)return fail();
  const method=choice(d.method,['cash','transfer','external_card']),reference=requireText(d.reference??'',0,100,'reference');
  const prior=await env.DB.prepare('SELECT restaurant_id,paid_date,method,reference FROM restaurant_contract_payments WHERE id=?').bind(paymentId).first();
  if(prior){if(prior.restaurant_id!==id||prior.paid_date!==paidDate||prior.method!==method||prior.reference!==reference)throw new ApiError(409,'IDEMPOTENCY_KEY_REUSED');return {ok:true,replayed:true}}
  if(!current?.next_due)throw new ApiError(409,'CONTRACT_NO_PAYMENT_DUE');
  if(paidDate<current.start_date)return fail();
  const next=nextBillingDate(current.next_due,current.frequency,current.billing_day);
  const [saved]=await env.DB.batch([
   env.DB.prepare('INSERT INTO restaurant_contract_payments(id,restaurant_id,due_date,amount_minor,paid_date,method,reference,actor_id) SELECT ?,restaurant_id,next_due,amount_minor,?,?,?,? FROM restaurant_contracts WHERE restaurant_id=? AND version=? AND next_due=? ON CONFLICT(restaurant_id,due_date) DO NOTHING').bind(paymentId,paidDate,method,reference,actor.userId,id,version,current.next_due),
   env.DB.prepare('UPDATE restaurant_contracts SET next_due=?,version=version+1,updated_at=unixepoch() WHERE restaurant_id=? AND version=? AND changes()=1').bind(next,id,version),
   audit(env,actor,'contract_payment',id,{paymentId,amount:current.amount_minor,dueDate:current.next_due,paidDate},id)
  ]);
  if(!saved.meta.changes)throw new ApiError(409,'ADMIN_ACCOUNT_CHANGED');return {ok:true};
 }
 if(req.method!=='PATCH'||payment)throw new ApiError(405,'METHOD_NOT_ALLOWED');
 const d=await readJson(req);requireKeys(d,['plan','startDate','nextDue','frequency','amountMinor','version']);
 const plan=choice(d.plan,['ONLINE','LOCAL','PLUS']),start=validDate(d.startDate),due=validDate(d.nextDue),frequency=choice(d.frequency,['monthly','quarterly','semiannual','annual','once']);
 if(due<start)return fail();
 const price=amount(d.amountMinor,1),version=requireInteger(d.version,0,2147483646,'version');
 const billing=Number(due.slice(-2));
 const already=await env.DB.prepare('SELECT 1 FROM restaurant_contract_payments WHERE restaurant_id=? AND due_date=?').bind(id,due).first();
 if(already)throw new ApiError(409,'CONTRACT_PERIOD_PAID');
 const stmt=current?env.DB.prepare('UPDATE restaurant_contracts SET start_date=?,next_due=?,frequency=?,billing_day=?,amount_minor=?,version=version+1,updated_at=unixepoch() WHERE restaurant_id=? AND version=?').bind(start,due,frequency,billing,price,id,version):env.DB.prepare('INSERT INTO restaurant_contracts(restaurant_id,start_date,next_due,frequency,billing_day,amount_minor) SELECT ?,?,?,?,?,? WHERE ?=0 ON CONFLICT(restaurant_id) DO NOTHING').bind(id,start,due,frequency,billing,price,version);
 const [changed]=await env.DB.batch([stmt,env.DB.prepare("UPDATE restaurants SET plan=?,online_state=CASE WHEN ?='LOCAL' THEN 'closed' ELSE online_state END WHERE id=? AND changes()=1").bind(plan,plan,id),audit(env,actor,'contract_saved',id,{plan,start,due,frequency,price},id)]);
 if(!changed.meta.changes)throw new ApiError(409,'ADMIN_ACCOUNT_CHANGED');return {ok:true};
}
export async function commercialControl(req,env,actor,path){
 requireRole(actor,'platform_admin');
 const s=/^spots(?:\/([0-9a-f-]{36}))?$/.exec(path);
 if(s)return respond(req,env,200,await spots(req,env,actor,s[1]?requireUuid(s[1]):null));
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
