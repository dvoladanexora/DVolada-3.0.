import {generateAuthenticationOptions,generateRegistrationOptions,verifyAuthenticationResponse,verifyRegistrationResponse} from '@simplewebauthn/server';
import {isoBase64URL} from '@simplewebauthn/server/helpers';
import {ApiError,hmacHex,readJson,requireKeys,requireText,requireUuid,respond} from './security.js';
import {clientAccessEnabled,readSecretCookie,randomSecret,secretCookie,secretPattern,sessionSeconds,changeClientCookie} from './client-access.js';

import {loginPattern,recoveryHash,retiredAccessHash} from './privileged-access.js';

const browserCookie='__Host-dvolada-passkey';
const challengeSeconds=300;
const algorithms=[-7,-257];
const privilegedEligibility=`(SELECT 1 FROM privileged_passkey_accounts a WHERE a.user_id=u.id AND
 (a.invitation_expires_at IS NULL OR a.invitation_expires_at>unixepoch()) AND (
 (a.access_role='platform_admin' AND u.account_role='platform_admin') OR
 (a.access_role='owner' AND u.account_role='customer' AND EXISTS(SELECT 1 FROM restaurant_memberships m
  WHERE m.user_id=u.id AND m.restaurant_id=a.restaurant_id AND m.staff_role='owner' AND m.active=1))))`;
const eligible=`u.status='active' AND (EXISTS${privilegedEligibility} OR (
 NOT EXISTS(SELECT 1 FROM privileged_passkey_accounts WHERE user_id=u.id) AND
 (u.account_role='customer' OR (u.account_role='courier' AND EXISTS(
 SELECT 1 FROM courier_profiles p WHERE p.user_id=u.id AND p.active=1)))))`;
const accountQuery=`SELECT c.user_id,c.login_name,c.revision,u.admin_version,u.display_name,a.invitation_expires_at
 FROM client_credentials c JOIN users u ON u.id=c.user_id
 LEFT JOIN privileged_passkey_accounts a ON a.user_id=u.id WHERE ${eligible} AND `;
const now=()=>Math.floor(Date.now()/1000);
const browserHash=(env,secret)=>hmacHex(env.SESSION_PEPPER,'client-passkey-browser:v1:'+secret);

async function begin(req,env,mode,input,rpID){
 requireKeys(input,mode==='register'?['login','displayName']:mode==='recover'?['login','code']:['login']);
 const login=typeof input.login==='string'?input.login.trim().toLowerCase():'';
 if(!loginPattern.test(login))throw new ApiError(400,'CLIENT_CREDENTIAL_FORMAT');
 const birth=now();
 const ip=await hmacHex(env.SESSION_PEPPER,'client-passkey-rate:v1:'+(req.headers.get('cf-connecting-ip')||'unknown'));
 const limit=await env.DB.prepare(`INSERT INTO client_auth_throttle(source_hash,time_bucket,attempts)
  VALUES(?,?,1) ON CONFLICT(source_hash) DO UPDATE SET attempts=CASE WHEN time_bucket=excluded.time_bucket
  THEN attempts+1 ELSE 1 END,time_bucket=excluded.time_bucket RETURNING attempts`).bind(ip,Math.floor(birth/600)).first();
 if(limit.attempts>24)throw new ApiError(429,'LOGIN_RATE_LIMITED');

 let account=null,name=null;
 if(mode==='register'){
  name=requireText(input.displayName,2,80,'displayName');
  if(await env.DB.prepare('SELECT 1 FROM client_credentials WHERE login_name=?').bind(login).first())
   throw new ApiError(409,'CLIENT_LOGIN_UNAVAILABLE');
 }else if(mode==='recover'){
  if(typeof input.code!=='string'||!secretPattern.test(input.code))throw new ApiError(401,'CLIENT_CODE_INVALID');
  account=await env.DB.prepare(accountQuery+'c.recovery_hash=? AND (c.login_name=? OR c.login_name IS NULL)')
   .bind(await recoveryHash(env,input.code),login).first();
  if(!account)throw new ApiError(401,'CLIENT_CODE_INVALID');
  name=account.display_name;
 }
 const userID=account?.user_id||(mode==='register'?crypto.randomUUID():null);
 const options=mode==='login'
  ?await generateAuthenticationOptions({rpID,userVerification:'required',timeout:120000})
  :await generateRegistrationOptions({rpID,rpName:'Dvolada',userID:new TextEncoder().encode(userID),
   userName:login,userDisplayName:name,attestationType:'none',supportedAlgorithmIDs:algorithms,timeout:120000,
   authenticatorSelection:{residentKey:'required',userVerification:'required'}});
 const id=crypto.randomUUID(),browser=readSecretCookie(req,browserCookie)||randomSecret();
 await env.DB.batch([
  env.DB.prepare('DELETE FROM client_passkey_challenges WHERE id IN (SELECT id FROM client_passkey_challenges WHERE expires_at<=? LIMIT 32)').bind(birth),
  env.DB.prepare(`INSERT INTO client_passkey_challenges(id,browser_hash,mode,challenge,user_id,login_name,display_name,revision,admin_version,expires_at)
   VALUES(?,?,?,?,?,?,?,?,?,?)`).bind(id,await browserHash(env,browser),mode,options.challenge,userID,login,name,
   account?.revision??null,account?.admin_version??null,Math.min(birth+challengeSeconds,account?.invitation_expires_at??Infinity))
 ]);
 return secretCookie(respond(req,env,200,{id,options}),browserCookie,browser,challengeSeconds);
}

async function verifyLogin(env,assertion,expected,login){
 const row=await env.DB.prepare(`SELECT p.*,c.revision,u.admin_version FROM client_passkeys p
  JOIN client_credentials c ON c.user_id=p.user_id JOIN users u ON u.id=p.user_id
  WHERE p.credential_id=? AND c.login_name=? AND ${eligible}`).bind(assertion.id,login).first();
 if(!row)throw new ApiError(401,'PASSKEY_INVALID');
 let verified;
 try{
  verified=await verifyAuthenticationResponse({...expected,response:assertion,
   credential:{id:row.credential_id,publicKey:isoBase64URL.toBuffer(row.public_key),counter:row.counter}});
 }catch{throw new ApiError(401,'PASSKEY_INVALID')}
 if(!verified.verified)throw new ApiError(401,'PASSKEY_INVALID');
 return {...row,newCounter:verified.authenticationInfo.newCounter};
}

async function session(env,user,token,credentialId,revision,adminVersion,issued,{guardChanges=false,recovery=null}={}){
 return env.DB.prepare(`INSERT INTO auth_sessions(id,user_id,token_hash,expires_at,staff_restaurant_id,privileged_passkey)
  SELECT ?,u.id,?,?+CASE WHEN a.user_id IS NULL THEN ${sessionSeconds} ELSE 28800 END,
   a.restaurant_id, a.user_id IS NOT NULL FROM users u JOIN client_credentials c ON c.user_id=u.id
   JOIN client_passkeys p ON p.user_id=u.id LEFT JOIN privileged_passkey_accounts a ON a.user_id=u.id
  WHERE u.id=? AND p.credential_id=? AND c.revision=? AND u.admin_version=? AND ${eligible} ${guardChanges?'AND changes()>0':''} ${recovery?'AND c.recovery_hash=?':''}`)
  .bind(crypto.randomUUID(),await hmacHex(env.SESSION_PEPPER,'session:v1:'+token),issued,
   user,credentialId,revision,adminVersion,...(recovery?[recovery]:[]));
}

async function setupPasskey(env,flow,assertion,expected,token,issued){
 let verified;
 try{verified=await verifyRegistrationResponse({...expected,response:assertion,supportedAlgorithmIDs:algorithms})}
 catch{throw new ApiError(401,'PASSKEY_INVALID')}
 if(!verified.verified||!verified.registrationInfo)throw new ApiError(401,'PASSKEY_INVALID');
 const credential=verified.registrationInfo.credential;
 const pub=isoBase64URL.fromBuffer(credential.publicKey),recovery=randomSecret();
 const nextRecovery=await recoveryHash(env,recovery),retired=await retiredAccessHash(env);
 const user=flow.user_id;
 try{
  if(flow.mode==='register'){
   await env.DB.batch([
    env.DB.prepare("INSERT INTO users(id,display_name,account_role) VALUES(?,?,'customer')").bind(user,flow.display_name),
    env.DB.prepare('INSERT INTO client_credentials(user_id,access_hash,recovery_hash,login_name) VALUES(?,?,?,?)')
     .bind(user,retired,nextRecovery,flow.login_name),
    env.DB.prepare('INSERT INTO client_passkeys(user_id,credential_id,public_key,counter) VALUES(?,?,?,?)')
     .bind(user,credential.id,pub,credential.counter),
    await session(env,user,token,credential.id,1,1,issued)
   ]);
  }else{
   const [updated]=await env.DB.batch([
    env.DB.prepare(`UPDATE client_credentials SET login_name=?,password_hash=NULL,access_hash=?,recovery_hash=?,revision=revision+1
     WHERE user_id=? AND revision=? AND EXISTS(SELECT 1 FROM users u WHERE u.id=client_credentials.user_id
      AND u.admin_version=? AND ${eligible})`).bind(flow.login_name,retired,nextRecovery,user,flow.revision,flow.admin_version),
    env.DB.prepare(`INSERT INTO client_passkeys(user_id,credential_id,public_key,counter)
     SELECT user_id,?,?,? FROM client_credentials WHERE user_id=? AND recovery_hash=?
     ON CONFLICT(user_id) DO UPDATE SET credential_id=excluded.credential_id,public_key=excluded.public_key,counter=excluded.counter`)
     .bind(credential.id,pub,credential.counter,user,nextRecovery),
    env.DB.prepare(`UPDATE auth_sessions SET revoked_at=? WHERE user_id=? AND revoked_at IS NULL
     AND EXISTS(SELECT 1 FROM client_credentials WHERE user_id=? AND recovery_hash=?)`).bind(issued,user,user,nextRecovery),
    env.DB.prepare(`UPDATE privileged_passkey_accounts SET invitation_expires_at=NULL WHERE user_id=?
     AND EXISTS(SELECT 1 FROM client_credentials WHERE user_id=? AND recovery_hash=?)`).bind(user,user,nextRecovery),
    await session(env,user,token,credential.id,flow.revision+1,flow.admin_version,issued,{recovery:nextRecovery})
   ]);
   if(!updated.meta.changes)throw new ApiError(401,'CLIENT_CODE_INVALID');
  }
 }catch(error){
  if(/UNIQUE constraint failed: client_credentials.login_name/.test(String(error)))throw new ApiError(409,'CLIENT_LOGIN_UNAVAILABLE');
  if(/UNIQUE constraint failed: client_passkeys.credential_id/.test(String(error)))throw new ApiError(409,'PASSKEY_ALREADY_REGISTERED');
  throw error;
 }
 return {recovery};
}

export async function clientPasskey(req,env,operation,stage){
 if(!clientAccessEnabled(req,env))throw new ApiError(404,'NOT_FOUND');
 const url=new URL(req.url);
 if(req.headers.get('origin')!==url.origin)throw new ApiError(403,'ORIGIN_FORBIDDEN');
 const input=await readJson(req,32768);
 if(stage==='begin')return begin(req,env,operation,input,url.hostname);
 requireKeys(input,['id','response']);
 const id=requireUuid(input.id),browser=readSecretCookie(req,browserCookie);
 if(!browser)throw new ApiError(401,'PASSKEY_CHALLENGE_INVALID');
 const issued=now(),assertion=input.response;
 if(!assertion||typeof assertion.id!=='string'||assertion.id.length>2048)throw new ApiError(400,'PASSKEY_INVALID');
 const flow=await env.DB.prepare(`DELETE FROM client_passkey_challenges WHERE id=? AND mode=? AND browser_hash=? AND expires_at>?
  RETURNING *`).bind(id,operation,await browserHash(env,browser),issued).first();
 if(!flow)throw new ApiError(401,'PASSKEY_CHALLENGE_INVALID');
 const expected={expectedChallenge:flow.challenge,expectedOrigin:url.origin,expectedRPID:url.hostname,requireUserVerification:true};
 const token=randomSecret();
 if(operation==='login'){
  const row=await verifyLogin(env,assertion,expected,flow.login_name);
  const [changed,created]=await env.DB.batch([
   env.DB.prepare(`UPDATE client_passkeys SET counter=? WHERE user_id=? AND credential_id=? AND counter=?
    AND EXISTS(SELECT 1 FROM client_credentials c JOIN users u ON u.id=c.user_id
     WHERE c.user_id=client_passkeys.user_id AND c.revision=? AND u.admin_version=? AND ${eligible})`)
    .bind(row.newCounter,row.user_id,row.credential_id,row.counter,row.revision,row.admin_version),
   await session(env,row.user_id,token,row.credential_id,row.revision,row.admin_version,issued,{guardChanges:true})
  ]);
  if(!changed.meta.changes||!created.meta.changes)throw new ApiError(401,'PASSKEY_INVALID');
  return changeClientCookie(respond(req,env,204),token);
 }
 const codes=await setupPasskey(env,flow,assertion,expected,token,issued);
 return changeClientCookie(respond(req,env,operation==='register'?201:200,codes),token);
}
