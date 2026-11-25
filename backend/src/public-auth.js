import {ApiError,hmacHex,readJson,requireKeys,requireText,requireUuid,respond} from './security.js';
import {clientAccessEnabled,randomSecret,secretCookie,secretPattern,changeClientCookie,sessionSeconds} from './client-access.js';
import {loginPattern,recoveryHash,retiredAccessHash} from './privileged-access.js';
import {verifyGoogleIdentity} from './google-admin-identity.js';
import {generateRegistrationOptions,verifyRegistrationResponse} from '@simplewebauthn/server';
import {isoBase64URL} from '@simplewebauthn/server/helpers';

const now=()=>Math.floor(Date.now()/1000),encoder=new TextEncoder();
const qa='https://dvolada-qa.dvoladanexora.workers.dev';
const nonceCookie='__Host-dvolada-google-client-nonce';
const algorithms=[-7,-257];
const credentialError=()=>new ApiError(401,'PUBLIC_CREDENTIAL_INVALID');
const allowed=`u.status='active' AND u.admin_locked=0 AND u.account_role IN ('customer','courier')
 AND NOT EXISTS(SELECT 1 FROM privileged_passkey_accounts a WHERE a.user_id=u.id)
 AND NOT EXISTS(SELECT 1 FROM restaurant_memberships m WHERE m.user_id=u.id)
 AND (u.account_role='customer' OR EXISTS(SELECT 1 FROM courier_profiles p WHERE p.user_id=u.id AND p.active=1))`;
const accountQuery=`SELECT u.id,u.display_name,u.admin_version,c.login_name,c.password_hash,c.revision
 FROM users u JOIN client_credentials c ON c.user_id=u.id WHERE ${allowed} AND `;
export function publicAuthEnabled(req,env){return new URL(req.url).origin===qa&&clientAccessEnabled(req,env)&&env.QA_PUBLIC_AUTH==='true'}
export function googleCustomerEnabled(req,env){return publicAuthEnabled(req,env)&&typeof env.GOOGLE_CUSTOMER_CLIENT_ID==='string'&&/^[A-Za-z0-9._-]+\.apps\.googleusercontent\.com$/.test(env.GOOGLE_CUSTOMER_CLIENT_ID)&&env.GOOGLE_CUSTOMER_CLIENT_ID!==env.GOOGLE_ADMIN_CLIENT_ID}
function assertOrigin(req,env){if(!publicAuthEnabled(req,env))throw new ApiError(404,'NOT_FOUND');if(req.method!=='GET'&&req.headers.get('origin')!==new URL(req.url).origin)throw new ApiError(403,'ORIGIN_FORBIDDEN')}
function normalizeLogin(v){const login=typeof v==='string'?v.trim().toLowerCase():'';if(!loginPattern.test(login))throw new ApiError(400,'CLIENT_CREDENTIAL_FORMAT');return login}
function passwordValue(v){if(typeof v!=='string'||v.length<12||v.length>128||encoder.encode(v).length>512)throw new ApiError(400,'PUBLIC_PASSWORD_FORMAT');return v}
async function limit(env,req,key,threshold){
 const source=await hmacHex(env.SESSION_PEPPER,'public-auth-rate:v1:'+key);
 const r=await env.DB.prepare(`INSERT INTO client_auth_throttle(source_hash,time_bucket,attempts) VALUES(?,?,1)
 ON CONFLICT(source_hash) DO UPDATE SET attempts=CASE WHEN time_bucket=excluded.time_bucket THEN attempts+1 ELSE 1 END,time_bucket=excluded.time_bucket RETURNING attempts`).bind(source,Math.floor(now()/600)).first();
 if(r.attempts>threshold)throw new ApiError(429,'LOGIN_RATE_LIMITED');
}
const ip=req=>req.headers.get('cf-connecting-ip')||'unknown';
const hex=bytes=>Array.from(new Uint8Array(bytes),v=>v.toString(16).padStart(2,'0')).join('');
// Pepper protects against offline DB-only attacks; independent random salts, bounded cost for Workers.
// QA feature remains off until deployment validation. Never accept legacy password_hash values.
export async function passwordHash(env,password,salt=randomSecret()){
 passwordValue(password);
 const material=await hmacHex(env.SESSION_PEPPER,'public-password:v1:'+password);
 const key=await crypto.subtle.importKey('raw',encoder.encode(material),'PBKDF2',false,['deriveBits']);
 const derived=await crypto.subtle.deriveBits({name:'PBKDF2',hash:'SHA-256',salt:encoder.encode(salt),iterations:100000},key,256);
 return 'p2$100000$'+salt+'$'+hex(derived);
}
function same(a,b){if(typeof a!=='string'||typeof b!=='string'||a.length!==b.length)return false;let diff=0;for(let i=0;i<a.length;i++)diff|=a.charCodeAt(i)^b.charCodeAt(i);return diff===0}
async function verifyPassword(env,password,stored){
 const format=/^p2\$100000\$([A-Za-z0-9_-]{43})\$[a-f0-9]{64}$/;
 const match=typeof stored==='string'&&format.exec(stored);
 const derived=await passwordHash(env,password,match?match[1]:'A'.repeat(43));
 return Boolean(match&&same(derived,stored));
}
async function session(env,user,token,revision,adminVersion,recovery=null){
 return env.DB.prepare(`INSERT INTO auth_sessions(id,user_id,token_hash,device_label,expires_at)
 SELECT ?,u.id,?,'Dvolada',? FROM users u JOIN client_credentials c ON c.user_id=u.id
 WHERE u.id=? AND c.revision=? AND u.admin_version=? AND ${allowed} ${recovery?'AND c.recovery_hash=?':''}`).bind(crypto.randomUUID(),await hmacHex(env.SESSION_PEPPER,'session:v1:'+token),now()+sessionSeconds,user,revision,adminVersion,...(recovery?[recovery]:[]));
}
export async function publicPassword(req,env,action){
 assertOrigin(req,env);const body=await readJson(req,4096);
 requireKeys(body,action==='register'?['login','displayName','password','phone']:action==='recover'?['login','code','password']:['login','password']);
 const login=normalizeLogin(body.login),password=passwordValue(body.password);
 await limit(env,req,'ip:'+ip(req),20);await limit(env,req,'login:'+login,8);
 const token=randomSecret();
 if(action==='register'){
  const name=requireText(body.displayName,2,80,'displayName'),user=crypto.randomUUID(),recovery=randomSecret();
  const phone=typeof body.phone==='string'?body.phone.trim():'';
  if(!/^\+504[0-9]{8}$/.test(phone))throw new ApiError(400,'PHONE_REQUIRED');
  const verifier=await passwordHash(env,password);
  try{const results=await env.DB.batch([
   env.DB.prepare("INSERT INTO users(id,display_name,account_role,phone_e164) VALUES(?,?,'customer',?)").bind(user,name,phone),
   env.DB.prepare('INSERT INTO client_credentials(user_id,login_name,password_hash,access_hash,recovery_hash) VALUES(?,?,?,?,?)').bind(user,login,verifier,await retiredAccessHash(env),await recoveryHash(env,recovery)),
   await session(env,user,token,1,1)
  ]);if(results[2].meta.changes!==1)throw credentialError()}
  catch(e){if(/client_credentials.login_name|idx_client_login_name/.test(String(e)))throw new ApiError(409,'CLIENT_LOGIN_UNAVAILABLE');throw e}
  return changeClientCookie(respond(req,env,201,{login,recovery}),token);
 }
 const row=await env.DB.prepare(accountQuery+'c.login_name=?').bind(login).first();
 if(action==='login'){
  const ok=await verifyPassword(env,password,row?.password_hash);
  if(!row||!ok)throw credentialError();
  const result=await (await session(env,row.id,token,row.revision,row.admin_version)).run();
  if(result.meta.changes!==1)throw credentialError();
  return changeClientCookie(respond(req,env,204),token);
 }
 if(action!=='recover'||!row||typeof body.code!=='string'||!secretPattern.test(body.code))throw credentialError();
 const recovery=randomSecret(),next=await recoveryHash(env,recovery);
 const [updated]=await env.DB.batch([
  env.DB.prepare(`UPDATE client_credentials SET password_hash=?,recovery_hash=?,revision=revision+1 WHERE user_id=? AND revision=? AND recovery_hash=?
   AND NOT EXISTS(SELECT 1 FROM courier_manual_invites i WHERE i.user_id=client_credentials.user_id AND i.claimed_at IS NULL AND i.expires_at<=unixepoch())
   AND EXISTS(SELECT 1 FROM users u WHERE u.id=client_credentials.user_id AND u.admin_version=? AND ${allowed})`).bind(await passwordHash(env,password),next,row.id,row.revision,await recoveryHash(env,body.code),row.admin_version),
  env.DB.prepare('DELETE FROM client_passkeys WHERE user_id=? AND EXISTS(SELECT 1 FROM client_credentials WHERE user_id=? AND recovery_hash=?)').bind(row.id,row.id,next),
  env.DB.prepare('UPDATE auth_sessions SET revoked_at=? WHERE user_id=? AND revoked_at IS NULL AND EXISTS(SELECT 1 FROM client_credentials WHERE user_id=? AND recovery_hash=?)').bind(now(),row.id,row.id,next),
  env.DB.prepare('UPDATE courier_manual_invites SET claimed_at=? WHERE user_id=? AND claimed_at IS NULL AND EXISTS(SELECT 1 FROM client_credentials WHERE user_id=? AND recovery_hash=?)').bind(now(),row.id,row.id,next),
  await session(env,row.id,token,row.revision+1,row.admin_version,next)
 ]);
 if(updated.meta.changes!==1)throw credentialError();
 return changeClientCookie(respond(req,env,200,{login,recovery}),token);
}
const nonceHash=(env,v)=>hmacHex(env.SESSION_PEPPER,'public-google:v1:'+v);
export async function publicGoogle(req,env,action){
 assertOrigin(req,env);if(!googleCustomerEnabled(req,env))throw new ApiError(503,'GOOGLE_CUSTOMER_NOT_CONFIGURED');
 const t=now(),clientId=env.GOOGLE_CUSTOMER_CLIENT_ID;
 if(action==='challenge'){
  const nonce=randomSecret(),expires=t+300,sig=await nonceHash(env,nonce+':'+expires);
  return secretCookie(respond(req,env,200,{clientId,nonce}),nonceCookie,nonce+'.'+expires+'.'+sig,300);
 }
 await limit(env,req,'google:'+ip(req),20);
 const raw=(req.headers.get('cookie')||'').split(';').map(s=>s.trim()).find(s=>s.startsWith(nonceCookie+'='))?.slice(nonceCookie.length+1)||'';
 const m=/^([A-Za-z0-9_-]{43})\.([0-9]{10})\.([a-f0-9]{64})$/.exec(raw);
 if(!m||Number(m[2])<=t||Number(m[2])>t+300||!same(m[3],await nonceHash(env,m[1]+':'+m[2])))throw new ApiError(401,'GOOGLE_CUSTOMER_CHALLENGE_EXPIRED');
 const body=await readJson(req,18000);requireKeys(body,['credential']);
 const claims=await verifyGoogleIdentity(body.credential,clientId,m[1]);
 const subject='google-customer:'+claims.subject;
 const nonce=await nonceHash(env,'used:'+m[1]),user=crypto.randomUUID(),login='g.'+user.replaceAll('-',''),recovery=randomSecret(),token=randomSecret(),sessionId=crypto.randomUUID();
 const results=await env.DB.batch([
  env.DB.prepare("INSERT INTO users(id,display_name,account_role,firebase_uid,verified_email) VALUES(?,?,'customer',?,?) ON CONFLICT(firebase_uid) DO NOTHING").bind(user,claims.name,subject,claims.email),
  env.DB.prepare(`INSERT INTO client_credentials(user_id,login_name,access_hash,recovery_hash)
   SELECT u.id,?,?,? FROM users u WHERE u.firebase_uid=? AND u.id=? AND ${allowed} ON CONFLICT(user_id) DO NOTHING`).bind(login,await retiredAccessHash(env),await recoveryHash(env,recovery),subject,user),
  env.DB.prepare('DELETE FROM google_admin_consumed_nonces WHERE nonce_hash IN (SELECT nonce_hash FROM google_admin_consumed_nonces WHERE expires_at<=? LIMIT 32)').bind(t),
  env.DB.prepare('INSERT INTO google_admin_consumed_nonces(nonce_hash,expires_at) VALUES(?,?) ON CONFLICT(nonce_hash) DO NOTHING').bind(nonce,Number(m[2])),
  env.DB.prepare(`INSERT INTO auth_sessions(id,user_id,token_hash,device_label,expires_at)
   SELECT ?,u.id,?,'Google Dvolada',? FROM users u JOIN client_credentials c ON c.user_id=u.id WHERE u.firebase_uid=? AND ${allowed} AND changes()=1`).bind(sessionId,await hmacHex(env.SESSION_PEPPER,'session:v1:'+token),t+sessionSeconds,subject)
 ]);
 if(results[4].meta.changes!==1)throw new ApiError(403,'PUBLIC_ACCOUNT_REJECTED');
 const payload=results[1].meta.changes===1?{login,recovery}:{};
 return secretCookie(changeClientCookie(respond(req,env,200,payload),token),nonceCookie,'',0);
}
export async function biometric(req,env,actor,stage){
 assertOrigin(req,env);
 if(actor.googleAdmin||actor.privilegedPasskey||actor.staffRestaurantId||!['customer','courier'].includes(actor.role))throw new ApiError(403,'ROLE_FORBIDDEN');
 const row=await env.DB.prepare(accountQuery+'u.id=?').bind(actor.userId).first();
 if(!row)throw credentialError();
 const t=now();
 if(stage==='status'){
  const registered=await env.DB.prepare('SELECT 1 FROM client_passkeys WHERE user_id=?').bind(row.id).first();
  return respond(req,env,200,{login:row.login_name,registered:Boolean(registered)});
 }
 const fresh=await env.DB.prepare('SELECT 1 FROM auth_sessions WHERE id=? AND user_id=? AND revoked_at IS NULL AND expires_at>? AND created_at>=?').bind(actor.sessionId,row.id,t,t-600).first();
 if(!fresh)throw new ApiError(403,'PUBLIC_REAUTH_REQUIRED');
 const origin=new URL(req.url),body=await readJson(req,32768);
 if(stage==='begin'){
  requireKeys(body,[]);
  const options=await generateRegistrationOptions({rpID:origin.hostname,rpName:'Dvolada',userID:encoder.encode(row.id),userName:row.login_name,userDisplayName:row.display_name,attestationType:'none',supportedAlgorithmIDs:algorithms,timeout:120000,authenticatorSelection:{residentKey:'required',userVerification:'required',authenticatorAttachment:'platform'}});
  const id=crypto.randomUUID();
  await env.DB.batch([env.DB.prepare('DELETE FROM client_biometric_challenges WHERE id IN (SELECT id FROM client_biometric_challenges WHERE expires_at<=? LIMIT 32)').bind(t),env.DB.prepare('INSERT INTO client_biometric_challenges(id,user_id,session_id,challenge,revision,admin_version,expires_at) VALUES(?,?,?,?,?,?,?)').bind(id,row.id,actor.sessionId,options.challenge,row.revision,row.admin_version,t+300)]);
  return respond(req,env,200,{id,options});
 }
 requireKeys(body,['id','response']);
 const flow=await env.DB.prepare('DELETE FROM client_biometric_challenges WHERE id=? AND user_id=? AND session_id=? AND expires_at>? RETURNING *').bind(requireUuid(body.id),row.id,actor.sessionId,t).first();
 if(!flow||flow.revision!==row.revision||flow.admin_version!==row.admin_version)throw credentialError();
 let verified;try{verified=await verifyRegistrationResponse({response:body.response,expectedChallenge:flow.challenge,expectedOrigin:origin.origin,expectedRPID:origin.hostname,requireUserVerification:true,supportedAlgorithmIDs:algorithms})}catch{throw new ApiError(401,'PASSKEY_INVALID')}
 if(!verified.verified||!verified.registrationInfo)throw credentialError();
 const c=verified.registrationInfo.credential;
 const result=await env.DB.prepare(`INSERT INTO client_passkeys(user_id,credential_id,public_key,counter)
 SELECT u.id,?,?,? FROM users u JOIN client_credentials c ON c.user_id=u.id WHERE u.id=? AND c.revision=? AND u.admin_version=? AND ${allowed}
 AND EXISTS(SELECT 1 FROM auth_sessions WHERE id=? AND revoked_at IS NULL AND expires_at>?)
 ON CONFLICT(user_id) DO UPDATE SET credential_id=excluded.credential_id,public_key=excluded.public_key,counter=excluded.counter`).bind(c.id,isoBase64URL.fromBuffer(c.publicKey),c.counter,row.id,row.revision,row.admin_version,actor.sessionId,t).run();
 if(result.meta.changes!==1)throw credentialError();
 return respond(req,env,200,{registered:true,login:row.login_name});
}
