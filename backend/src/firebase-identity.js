import {ApiError,readJson,requireKeys,requireText,hmacHex} from './security.js';

const jwksUrl='https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com';
const decoder=new TextDecoder();
function base64url(value){
  if(typeof value!=='string'||value.length>8000||!/^[A-Za-z0-9_-]+$/.test(value))throw new ApiError(401,'FIREBASE_TOKEN_INVALID');
  let standard=value.replace(/-/g,'+').replace(/_/g,'/');
  standard+='='.repeat((4-standard.length%4)%4);
  const bytes=Uint8Array.from(atob(standard),x=>x.charCodeAt(0));
  return bytes;
}
function jwtPart(part){
  try{return JSON.parse(decoder.decode(base64url(part)))}
  catch{throw new ApiError(401,'FIREBASE_TOKEN_INVALID')}
}
export async function verifyFirebaseIdToken(token,projectId,{fetchImpl=fetch,now=Math.floor(Date.now()/1000)}={}){
  if(typeof projectId!=='string'||!/^[a-z][a-z0-9-]{4,62}$/.test(projectId)||projectId.includes('not-configured'))
    throw new ApiError(503,'FIREBASE_NOT_CONFIGURED');
  if(typeof token!=='string'||token.length>8000)throw new ApiError(401,'FIREBASE_TOKEN_INVALID');
  const parts=token.split('.');
  if(parts.length!==3)throw new ApiError(401,'FIREBASE_TOKEN_INVALID');
  const header=jwtPart(parts[0]),payload=jwtPart(parts[1]);
  if(header.alg!=='RS256'||header.typ&&header.typ!=='JWT'||typeof header.kid!=='string'||header.kid.length>256)
    throw new ApiError(401,'FIREBASE_TOKEN_INVALID');
  const validClaims=
    payload.aud===projectId&&payload.iss==='https://securetoken.google.com/'+projectId&&
    typeof payload.sub==='string'&&payload.sub.length>0&&payload.sub.length<=128&&
    Number.isInteger(payload.exp)&&payload.exp>now&&Number.isInteger(payload.iat)&&payload.iat<=now+60&&
    Number.isInteger(payload.auth_time)&&payload.auth_time<=now+60&&payload.auth_time>0&&
    payload.email_verified===true&&typeof payload.email==='string'&&
    /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(payload.email)&&payload.email.length<=254&&
    payload.firebase?.sign_in_provider!=='anonymous';
  if(!validClaims)throw new ApiError(401,'FIREBASE_IDENTITY_UNVERIFIED');
  let keys;
  try{
    const response=await fetchImpl(jwksUrl,{headers:{accept:'application/json'},cf:{cacheEverything:true,cacheTtl:300}});
    if(!response.ok)throw Error('JWKS_FETCH_FAILED');
    keys=await response.json();
  }catch{throw new ApiError(503,'FIREBASE_KEYS_UNAVAILABLE')}
  if(!Array.isArray(keys.keys)||keys.keys.length>30)throw new ApiError(503,'FIREBASE_KEYS_UNAVAILABLE');
  const jwk=keys.keys.find(k=>k.kid===header.kid&&k.kty==='RSA'&&k.alg==='RS256'&&k.use==='sig');
  if(!jwk)throw new ApiError(401,'FIREBASE_TOKEN_INVALID');
  let verified=false;
  try{
    const key=await crypto.subtle.importKey('jwk',jwk,{name:'RSASSA-PKCS1-v1_5',hash:'SHA-256'},false,['verify']);
    verified=await crypto.subtle.verify('RSASSA-PKCS1-v1_5',key,base64url(parts[2]),new TextEncoder().encode(parts[0]+'.'+parts[1]));
  }catch{throw new ApiError(401,'FIREBASE_TOKEN_INVALID')}
  if(!verified)throw new ApiError(401,'FIREBASE_TOKEN_INVALID');
  return {firebaseUid:payload.sub,email:payload.email.toLowerCase(),name:
    typeof payload.name==='string'&&payload.name.trim()?payload.name.trim().slice(0,120):payload.email.split('@')[0].slice(0,120)};
}
export async function loginAttemptLimit(req,env){
  // CF-Connecting-IP is set by Cloudflare on deployed Workers, never trust X-Forwarded-For.
  const ip=req.headers.get('cf-connecting-ip');
  if(!ip||ip.length>64)throw new ApiError(429,'LOGIN_SOURCE_UNAVAILABLE');
  const ipHash=await hmacHex(env.SESSION_PEPPER,'login-ip:'+ip);
  const bucket=Math.floor(Date.now()/300000);
  await env.DB.prepare(`INSERT INTO auth_login_attempts(ip_hash,window_5m,attempts) VALUES(?,?,1)
    ON CONFLICT(ip_hash,window_5m) DO UPDATE SET attempts=attempts+1`).bind(ipHash,bucket).run();
  const row=await env.DB.prepare('SELECT attempts FROM auth_login_attempts WHERE ip_hash=? AND window_5m=?')
    .bind(ipHash,bucket).first();
  if(row.attempts>10)throw new ApiError(429,'LOGIN_RATE_LIMITED');
}
export async function exchangeFirebase(req,env,{verify=verifyFirebaseIdToken}={}){
  await loginAttemptLimit(req,env);
  const body=await readJson(req,8500);
  requireKeys(body,['idToken','deviceLabel']);
  const idToken=requireText(body.idToken,100,8000,'idToken');
  const deviceLabel=typeof body.deviceLabel==='string'?body.deviceLabel.trim().slice(0,70):'Dispositivo';
  const claims=await verify(idToken,env.FIREBASE_PROJECT_ID);
  // Roles from client-side JWT/custom claims can NEVER assign staff or admin privileges.
  await env.DB.prepare(`INSERT INTO users(id,display_name,account_role,firebase_uid,verified_email)
    VALUES(?,?,'customer',?,?) ON CONFLICT(firebase_uid) DO NOTHING`)
    .bind(crypto.randomUUID(),claims.name,claims.firebaseUid,claims.email).run();
  const user=await env.DB.prepare('SELECT id,account_role,status FROM users WHERE firebase_uid=?')
    .bind(claims.firebaseUid).first();
  if(!user||user.status!=='active')throw new ApiError(403,'ACCOUNT_DISABLED');
  const sessionId=crypto.randomUUID();
  const random=crypto.getRandomValues(new Uint8Array(32));
  const token=Array.from(random,b=>String.fromCharCode(b)).join('');
  const bearer=btoa(token).replace(/\+/g,'-').replace(/\//g,'_').replace(/=/g,'');
  const tokenHash=await hmacHex(env.SESSION_PEPPER,'session:v1:'+bearer);
  // Short-lived app session: disabled Firebase accounts do not revoke D1 automatically.
  const expiresAt=Math.floor(Date.now()/1000)+12*3600;
  await env.DB.prepare(`INSERT INTO auth_sessions(id,user_id,token_hash,device_label,expires_at)
    VALUES(?,?,?,?,?)`).bind(sessionId,user.id,tokenHash,deviceLabel||'Dispositivo',expiresAt).run();
  return {sessionToken:bearer,expiresAt,role:user.account_role};
}
