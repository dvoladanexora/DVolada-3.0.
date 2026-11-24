// Isolated Google administrator sessions. No client or restaurant credentials are reused.
import {ApiError,hmacHex,readJson,requireKeys,respond} from './security.js';
import {randomSecret,secretCookie,readSecretCookie} from './client-access.js';
import {googleAdminConfiguration,verifyGoogleAdminIdentity} from './google-admin-identity.js';

const cookie='__Host-dvolada-control',nonceCookie='__Host-dvolada-control-nonce';
const clock=()=>Math.floor(Date.now()/1000);
const sessionSeconds=8*3600;
const hash=(env,value)=>hmacHex(env.SESSION_PEPPER,'google-control:v1:'+value);
const hostAllowed=(req,env)=>new URL(req.url).origin==='https://dvolada-qa.dvoladanexora.workers.dev'&&env.DVOLADA_QA_HOST==='dvolada-qa.dvoladanexora.workers.dev';
export function googleControlRequired(req,env){return hostAllowed(req,env)&&env.GOOGLE_ADMIN_ONLY==='true'}
export function clearControlCookie(res){return secretCookie(res,cookie,'',0)}
function assertControlOrigin(req,env){
 if(!hostAllowed(req,env))throw new ApiError(404,'NOT_FOUND');
 if(req.method!=='GET'&&req.headers.get('origin')!==new URL(req.url).origin)throw new ApiError(403,'ORIGIN_FORBIDDEN');
}
function rawCookie(req,name){
 return (req.headers.get('cookie')||'').split(';').map(s=>s.trim()).find(s=>s.startsWith(name+'='))?.slice(name.length+1)||'';
}
async function rateLimit(req,env,now){
 const ip=await hash(env,'ip:'+(req.headers.get('cf-connecting-ip')||'unknown'));
 const result=await env.DB.prepare(`INSERT INTO client_auth_throttle(source_hash,time_bucket,attempts)
 VALUES(?,?,1) ON CONFLICT(source_hash) DO UPDATE SET attempts=CASE WHEN time_bucket=excluded.time_bucket
 THEN attempts+1 ELSE 1 END,time_bucket=excluded.time_bucket RETURNING attempts`).bind(ip,Math.floor(now/600)).first();
 if(result.attempts>20)throw new ApiError(429,'LOGIN_RATE_LIMITED');
}
export async function googleControlAuth(req,env,action){
 assertControlOrigin(req,env);
 const {clientId}=googleAdminConfiguration(env);
 const now=clock();
 if(req.method!=='POST')throw new ApiError(405,'METHOD_NOT_ALLOWED');
 if(action==='challenge'){
  const nonce=randomSecret(),expires=now+300;
  const signature=await hash(env,'nonce:'+nonce+':'+expires);
  return secretCookie(respond(req,env,200,{clientId,nonce}),nonceCookie,nonce+'.'+expires+'.'+signature,300);
 }
 if(action!=='login')throw new ApiError(404,'NOT_FOUND');
 await rateLimit(req,env,now);
 const raw=rawCookie(req,nonceCookie);
 const match=/^([A-Za-z0-9_-]{43})\.([0-9]{10})\.([a-f0-9]{64})$/.exec(raw);
 if(!match||Number(match[2])<=now||Number(match[2])>now+300||match[3]!==await hash(env,'nonce:'+match[1]+':'+match[2]))
  throw new ApiError(401,'GOOGLE_ADMIN_TOKEN_INVALID');
 const body=await readJson(req,18000);requireKeys(body,['credential']);
 const claims=await verifyGoogleAdminIdentity(body.credential,env,match[1]);
 const subject='google-admin:'+claims.subject;
 const token=randomSecret(),sessionId=crypto.randomUUID();
 const nonceHash=await hash(env,'consumed-nonce:'+match[1]);
 // Keep the legacy admin and customer identities untouched. The Google subject is immutable.
 // Session hash has its own namespace, so the normal auth cookie/bearer cannot use it.
 const results=await env.DB.batch([
  env.DB.prepare(`INSERT INTO users(id,display_name,account_role,firebase_uid,verified_email)
    VALUES(?,?,'platform_admin',?,?) ON CONFLICT(firebase_uid) DO NOTHING`).bind(crypto.randomUUID(),claims.email,subject,claims.email),
  env.DB.prepare(`DELETE FROM google_admin_consumed_nonces WHERE nonce_hash IN
    (SELECT nonce_hash FROM google_admin_consumed_nonces WHERE expires_at<=? LIMIT 32)`).bind(now),
  env.DB.prepare(`INSERT INTO google_admin_consumed_nonces(nonce_hash,expires_at)
    SELECT ?,? WHERE NOT EXISTS(SELECT 1 FROM auth_sessions WHERE id=?)
    ON CONFLICT(nonce_hash) DO NOTHING`).bind(nonceHash,Number(match[2]),nonceHash),
  env.DB.prepare(`INSERT INTO auth_sessions(id,user_id,token_hash,device_label,expires_at)
    SELECT ?,id,?,'Centro de Control Google',? FROM users WHERE firebase_uid=? AND verified_email=?
    AND account_role='platform_admin' AND status='active' AND admin_locked=0 AND changes()=1
    ON CONFLICT(id) DO NOTHING`).bind(sessionId,await hash(env,'session:'+token),now+sessionSeconds,subject,claims.email),
  env.DB.prepare(`INSERT INTO control_audit(actor_id,subject,action,detail)
    SELECT user_id,user_id,'google_admin_login','{}' FROM auth_sessions WHERE id=? AND changes()>0`).bind(sessionId)
 ]);
 if(results[3].meta.changes!==1)throw new ApiError(403,'GOOGLE_ADMIN_FORBIDDEN');
 return secretCookie(secretCookie(respond(req,env,204),cookie,token,sessionSeconds),nonceCookie,'',0);
}

export async function googleControlActor(req,env){
 assertControlOrigin(req,env);
 const {emails}=googleAdminConfiguration(env);
 const token=readSecretCookie(req,cookie);
 if(!token)throw new ApiError(401,'SESSION_REQUIRED');
 const row=await env.DB.prepare(`SELECT s.id AS session_id,u.id,u.display_name,u.verified_email,u.firebase_uid
 FROM auth_sessions s JOIN users u ON u.id=s.user_id WHERE s.token_hash=? AND s.expires_at>? AND s.revoked_at IS NULL
 AND u.account_role='platform_admin' AND u.status='active' AND u.admin_locked=0 AND s.staff_restaurant_id IS NULL
 AND u.firebase_uid LIKE 'google-admin:%'`).bind(await hash(env,'session:'+token),clock()).first();
 if(!row||!emails.has(row.verified_email))throw new ApiError(401,'SESSION_INVALID');
 return {sessionId:row.session_id,userId:row.id,displayName:row.display_name,role:'platform_admin',staffRestaurantId:null,googleAdmin:true};
}
