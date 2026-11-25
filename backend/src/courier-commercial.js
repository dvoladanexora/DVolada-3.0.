import {ApiError,readJson,requireKeys,requireRole,requireText,requireUuid,requireInteger,respond} from './security.js';
import {randomSecret} from './client-access.js';
import {loginPattern,recoveryHash,retiredAccessHash} from './privileged-access.js';
import {validDate} from './commercial-control.js';
const now=()=>Math.floor(Date.now()/1000),today=()=>new Date(Date.now()-21600000).toISOString().slice(0,10);
const rows=async q=>(await q.all()).results||[];
const invalid=()=>{throw new ApiError(400,'INVALID_INPUT')};
const audit=(env,actor,action,subject,detail)=>env.DB.prepare('INSERT INTO control_audit(actor_id,subject,action,detail) SELECT ?,?,?,? WHERE changes()>0').bind(actor.userId,subject,action,JSON.stringify(detail));
const money=v=>requireInteger(v,1,100000000,'amountMinor');
const transports=['motorcycle','car','bicycle','walking','other'];
async function invite(req,env,actor){
 const d=await readJson(req);requireKeys(d,['id','login','displayName','phone','transport','zone']);
 const id=requireUuid(d.id),login=typeof d.login==='string'?d.login.trim().toLowerCase():'',name=requireText(d.displayName,2,80,'displayName'),zone=requireText(d.zone,2,120,'zone');
 if(!loginPattern.test(login))throw new ApiError(400,'CLIENT_CREDENTIAL_FORMAT');
 if(typeof d.phone!=='string'||!/^\+504[0-9]{8}$/.test(d.phone))throw new ApiError(400,'PHONE_REQUIRED');
 if(!transports.includes(d.transport))return invalid();
 const code=randomSecret(),expiresAt=now()+86400;
 try{await env.DB.batch([
  env.DB.prepare("INSERT INTO users(id,display_name,account_role,phone_e164) VALUES(?,?,'courier',?)").bind(id,name,d.phone),
  env.DB.prepare('INSERT INTO client_credentials(user_id,login_name,access_hash,recovery_hash) VALUES(?,?,?,?)').bind(id,login,await retiredAccessHash(env),await recoveryHash(env,code)),
  env.DB.prepare('INSERT INTO courier_profiles(user_id,active,max_active_orders,available) VALUES(?,1,2,0)').bind(id),
  env.DB.prepare('INSERT INTO courier_manual_invites(user_id,expires_at,transport,service_zone,created_by) VALUES(?,?,?,?,?)').bind(id,expiresAt,d.transport,zone,actor.userId),
  audit(env,actor,'courier_manual_invited',id,{expiresAt})
 ])}catch(e){if(/UNIQUE constraint failed: (users.id|client_credentials.login_name)/.test(String(e)))throw new ApiError(409,'CLIENT_LOGIN_UNAVAILABLE');throw e}
 return {userId:id,login,invitation:code,expiresAt};
}
async function renew(req,env,actor,id){
 const d=await readJson(req);requireKeys(d,[]);
 const code=randomSecret(),expiresAt=now()+86400,hash=await recoveryHash(env,code);
 const [changed]=await env.DB.batch([
  env.DB.prepare(`UPDATE client_credentials SET recovery_hash=?,revision=revision+1 WHERE user_id=? AND password_hash IS NULL
   AND EXISTS(SELECT 1 FROM courier_manual_invites i JOIN users u ON u.id=i.user_id JOIN courier_profiles c ON c.user_id=u.id WHERE i.user_id=client_credentials.user_id AND i.claimed_at IS NULL AND u.status='active' AND u.admin_locked=0 AND c.active=1)`).bind(hash,id),
  env.DB.prepare('UPDATE courier_manual_invites SET expires_at=? WHERE user_id=? AND claimed_at IS NULL AND changes()=1').bind(expiresAt,id),
  audit(env,actor,'courier_invitation_renewed',id,{expiresAt})
 ]);
 if(!changed.meta.changes)throw new ApiError(409,'COURIER_INVITE_UNAVAILABLE');
 const c=await env.DB.prepare('SELECT login_name FROM client_credentials WHERE user_id=?').bind(id).first();
 return {userId:id,login:c.login_name,invitation:code,expiresAt};
}
async function fees(req,env,actor,id){
 const courier=await env.DB.prepare("SELECT u.id FROM users u JOIN courier_profiles c ON c.user_id=u.id WHERE u.id=? AND u.account_role='courier'").bind(id).first();
 if(!courier)throw new ApiError(404,'NOT_FOUND');
 if(req.method==='GET'){
  const charges=await rows(env.DB.prepare(`SELECT c.*,o.order_number,COALESCE((SELECT SUM(amount_minor) FROM courier_fee_receipts r WHERE r.charge_id=c.id),0) AS paid_minor FROM courier_fee_charges c JOIN online_orders o ON o.id=c.id WHERE c.courier_id=? ORDER BY c.created_at DESC,c.id DESC LIMIT 200`).bind(id));
  const payments=await rows(env.DB.prepare('SELECT r.id,r.charge_id,r.amount_minor,r.paid_date,r.method,r.reference,c.period,o.order_number FROM courier_fee_receipts r JOIN courier_fee_charges c ON c.id=r.charge_id JOIN online_orders o ON o.id=c.id WHERE c.courier_id=? ORDER BY r.paid_date DESC,r.created_at DESC LIMIT 200').bind(id));
  return {charges,payments};
 }
 throw new ApiError(405,'METHOD_NOT_ALLOWED');
}
async function pay(req,env,actor,id,charge){
 const d=await readJson(req);requireKeys(d,['id','version','amountMinor','paidDate','method','reference']);
 const key=requireUuid(d.id),version=requireInteger(d.version,1,2147483646,'version'),amount=money(d.amountMinor),date=validDate(d.paidDate),reference=requireText(d.reference??'',0,100,'reference');
 if(date>today()||!['cash','transfer','external_card'].includes(d.method))return invalid();
 const c=await env.DB.prepare('SELECT id FROM courier_fee_charges WHERE id=? AND courier_id=?').bind(charge,id).first();if(!c)throw new ApiError(404,'NOT_FOUND');
 const replay=async()=>{const p=await env.DB.prepare('SELECT * FROM courier_fee_receipts WHERE id=?').bind(key).first();if(!p)return null;if(p.charge_id!==charge||p.amount_minor!==amount||p.paid_date!==date||p.method!==d.method||p.reference!==reference)throw new ApiError(409,'IDEMPOTENCY_KEY_REUSED');return {ok:true,replayed:true}};
 const prior=await replay();if(prior)return prior;
 const [saved]=await env.DB.batch([
  env.DB.prepare(`INSERT INTO courier_fee_receipts(id,charge_id,amount_minor,paid_date,method,reference,actor_id)
   SELECT ?,c.id,?,?,?,?,? FROM courier_fee_charges c WHERE c.id=? AND c.courier_id=? AND c.version=?
   AND c.amount_minor-COALESCE((SELECT SUM(amount_minor) FROM courier_fee_receipts r WHERE r.charge_id=c.id),0)>=? ON CONFLICT(id) DO NOTHING`).bind(key,amount,date,d.method,reference,actor.userId,charge,id,version,amount),
  env.DB.prepare('UPDATE courier_fee_charges SET version=version+1 WHERE id=? AND version=? AND changes()=1').bind(charge,version),
  audit(env,actor,'courier_fee_payment',charge,{paymentId:key,courierId:id,amount,date,method:d.method})
 ]);
 if(!saved.meta.changes){const existing=await replay();if(existing)return existing;throw new ApiError(409,'FINANCE_BALANCE_CHANGED')}
 return {ok:true};
}
export async function courierCommercial(req,env,actor,path){
 requireRole(actor,'platform_admin');
 if(path==='courier-commercial/invite'&&req.method==='POST')return respond(req,env,201,await invite(req,env,actor));
 const match=/^courier-commercial\/([0-9a-f-]{36})\/(renew|fees)(?:\/([0-9a-f-]{36})\/payments)?$/.exec(path);
 if(!match)throw new ApiError(404,'NOT_FOUND');
 const id=requireUuid(match[1]);
 if(match[2]==='renew'&&!match[3]&&req.method==='POST')return respond(req,env,200,await renew(req,env,actor,id));
 if(match[2]==='fees'&&!match[3]&&req.method==='GET')return respond(req,env,200,await fees(req,env,actor,id));
 if(match[2]==='fees'&&match[3]&&req.method==='POST')return respond(req,env,200,await pay(req,env,actor,id,requireUuid(match[3])));
 throw new ApiError(405,'METHOD_NOT_ALLOWED');
}
