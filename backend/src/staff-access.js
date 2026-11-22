import {ApiError,hmacHex,idempotencyKey,readJson,requireKeys,requireStaff,requireText,requireUuid,respond} from './security.js';
import {clientAccessEnabled,changeClientCookie} from './client-access.js';

const roles=['manager','kitchen','cashier'];
const secretPattern=/^[A-Za-z0-9_-]{43}$/;
const secret=()=>btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(32))))
 .replaceAll('+','-').replaceAll('/','_').replace(/=+$/,'');
const clock=()=>Math.floor(Date.now()/1000);
const digest=(env,type,code)=>hmacHex(env.SESSION_PEPPER,'staff-'+type+':v1:'+code);
const rows=async query=>(await query.all()).results||[];

export async function staffAccess(req,env,actor,access,user,action){
 requireStaff(access.staff_role,['owner']);
 const restaurant=access.restaurantId;
 const event=(name,subject)=>env.DB.prepare(`INSERT INTO restaurant_operation_log(restaurant_id,actor_id,action,subject_id)
  SELECT ?,?,?,? WHERE changes()>0`).bind(restaurant,actor.userId,name,subject);
 if(req.method==='GET'){
  const staff=await rows(env.DB.prepare(`SELECT a.user_id,u.display_name,m.staff_role,m.active,a.invitation_expires_at,
   a.credential_hash IS NOT NULL AS has_credential FROM restaurant_staff_access a
   JOIN users u ON u.id=a.user_id JOIN restaurant_memberships m ON m.restaurant_id=a.restaurant_id AND m.user_id=a.user_id
   WHERE a.restaurant_id=? ORDER BY u.display_name,a.user_id LIMIT 100`).bind(restaurant));
  const history=await rows(env.DB.prepare(`SELECT l.id,l.action,l.happened_at,u.display_name AS target_name,author.display_name AS actor_name
   FROM restaurant_operation_log l JOIN users u ON u.id=l.subject_id JOIN users author ON author.id=l.actor_id
   WHERE l.restaurant_id=? AND l.action IN ('staff_invited','staff_reset','staff_revoked','staff_enabled','staff_disabled','staff_role_changed','staff_claimed')
   ORDER BY l.id DESC LIMIT 100`).bind(restaurant));
  return {staff,history};
 }
 const input=await readJson(req);
 if(!user){
  requireKeys(input,['displayName','role']);
  const role=input.role;
  if(!roles.includes(role))throw new ApiError(400,'INVALID_STAFF_ROLE');
  const name=requireText(input.displayName,2,80,'displayName'),id=idempotencyKey(req);
  const invite=secret(),expires=clock()+24*3600;
  try{await env.DB.batch([
   env.DB.prepare("INSERT INTO users(id,display_name,account_role) VALUES(?,?,'customer')").bind(id,name),
   env.DB.prepare('INSERT INTO restaurant_memberships(restaurant_id,user_id,staff_role,active) VALUES(?,?,?,0)').bind(restaurant,id,role),
   env.DB.prepare('INSERT INTO restaurant_staff_access(user_id,restaurant_id,invitation_hash,invitation_expires_at) VALUES(?,?,?,?)')
    .bind(id,restaurant,await digest(env,'invite',invite),expires),
   event('staff_invited',id)
  ])}catch(error){
   if(/users.id/.test(String(error)))throw new ApiError(409,'STAFF_INVITATION_EXISTS');
   throw error;
  }
  return {userId:id,invitation:invite,expiresAt:expires};
 }
 const id=requireUuid(user);
 if(id===actor.userId)throw new ApiError(403,'ROLE_FORBIDDEN');
 const owned=await env.DB.prepare('SELECT user_id FROM restaurant_staff_access WHERE restaurant_id=? AND user_id=?').bind(restaurant,id).first();
 if(!owned)throw new ApiError(404,'STAFF_NOT_FOUND');
 const revoke=env.DB.prepare('UPDATE auth_sessions SET revoked_at=? WHERE staff_restaurant_id=? AND user_id=? AND revoked_at IS NULL')
  .bind(clock(),restaurant,id);
 if(action==='reset'){
  requireKeys(input,[]);
  const invite=secret(),expires=clock()+24*3600;
  await env.DB.batch([
   env.DB.prepare(`UPDATE restaurant_staff_access SET invitation_hash=?,invitation_expires_at=?,credential_hash=NULL,revision=revision+1
    WHERE restaurant_id=? AND user_id=?`).bind(await digest(env,'invite',invite),expires,restaurant,id),
   event('staff_reset',id),
   env.DB.prepare('UPDATE restaurant_memberships SET active=0 WHERE restaurant_id=? AND user_id=?').bind(restaurant,id),revoke
  ]);
  return {userId:id,invitation:invite,expiresAt:expires};
 }
 if(action==='revoke'){
  requireKeys(input,[]);
  await env.DB.batch([
   env.DB.prepare('UPDATE restaurant_staff_access SET revision=revision+1 WHERE restaurant_id=? AND user_id=?').bind(restaurant,id),
   event('staff_revoked',id),revoke
  ]);
  return {ok:true};
 }
 if(action==='state'){
  requireKeys(input,['active']);
  if(typeof input.active!=='boolean')throw new ApiError(400,'INVALID_INPUT');
  const result=await env.DB.batch([
   env.DB.prepare(`UPDATE restaurant_memberships SET active=? WHERE restaurant_id=? AND user_id=?
    AND staff_role IN ('manager','kitchen','cashier') AND (
     ?=0 OR EXISTS(SELECT 1 FROM restaurant_staff_access a WHERE a.restaurant_id=? AND a.user_id=? AND a.credential_hash IS NOT NULL))`)
    .bind(+input.active,restaurant,id,+input.active,restaurant,id),
   event(input.active?'staff_enabled':'staff_disabled',id),
   ...(input.active?[]:[env.DB.prepare('UPDATE restaurant_staff_access SET revision=revision+1,invitation_hash=NULL,invitation_expires_at=NULL WHERE restaurant_id=? AND user_id=?').bind(restaurant,id),revoke])
  ]);
  if(!result[0].meta.changes)throw new ApiError(409,'STAFF_ACTIVATION_REQUIRES_CLAIM');
  return {ok:true};
 }
 if(action==='role'){
  requireKeys(input,['role']);
  if(!roles.includes(input.role))throw new ApiError(400,'INVALID_STAFF_ROLE');
  await env.DB.batch([
   env.DB.prepare("UPDATE restaurant_memberships SET staff_role=? WHERE restaurant_id=? AND user_id=? AND staff_role IN ('manager','kitchen','cashier')")
    .bind(input.role,restaurant,id),event('staff_role_changed',id),
   env.DB.prepare('UPDATE restaurant_staff_access SET revision=revision+1 WHERE restaurant_id=? AND user_id=?').bind(restaurant,id),revoke
  ]);
  return {ok:true};
 }
 throw new ApiError(404,'NOT_FOUND');
}

export async function staffAuthenticate(req,env,operation){
 if(!clientAccessEnabled(req,env))throw new ApiError(404,'NOT_FOUND');
 if(req.headers.get('origin')!==new URL(req.url).origin)throw new ApiError(403,'ORIGIN_FORBIDDEN');
 const at=clock(),source=await digest(env,'rate',req.headers.get('cf-connecting-ip')||'unknown');
 const counter=await env.DB.prepare(`INSERT INTO client_auth_throttle(source_hash,time_bucket,attempts)
  VALUES(?,?,1) ON CONFLICT(source_hash) DO UPDATE SET
  attempts=CASE WHEN time_bucket=excluded.time_bucket THEN attempts+1 ELSE 1 END,time_bucket=excluded.time_bucket RETURNING attempts`)
  .bind(source,Math.floor(at/600)).first();
 if(counter.attempts>12)throw new ApiError(429,'LOGIN_RATE_LIMITED');
 const input=await readJson(req);
 requireKeys(input,['code']);
 if(typeof input.code!=='string'||!secretPattern.test(input.code))throw new ApiError(401,'STAFF_CODE_INVALID');
 const claim=operation==='claim',hash=await digest(env,claim?'invite':'credential',input.code);
 const active=`JOIN restaurant_memberships m ON m.user_id=a.user_id AND m.restaurant_id=a.restaurant_id
   JOIN restaurants r ON r.id=a.restaurant_id JOIN users u ON u.id=a.user_id
   WHERE u.status='active' AND r.subscription_status='active' AND r.plan IN ('ONLINE','PLUS')
    AND m.staff_role IN ('manager','kitchen','cashier') AND `;
 const query=claim?'a.invitation_hash=? AND a.invitation_expires_at>?':'a.credential_hash=? AND m.active=1';
 const account=await env.DB.prepare('SELECT a.user_id,a.restaurant_id,a.revision,u.admin_version FROM restaurant_staff_access a '+active+query)
  .bind(...(claim?[hash,at]:[hash])).first();
 if(!account)throw new ApiError(401,'STAFF_CODE_INVALID');
 const token=secret(),credential=claim?secret():null;
 const tokenHash=await hmacHex(env.SESSION_PEPPER,'session:v1:'+token);
 const next=claim?await digest(env,'credential',credential):hash;
 const session=env.DB.prepare(`INSERT INTO auth_sessions(id,user_id,token_hash,expires_at,staff_restaurant_id)
  SELECT ?,a.user_id,?,?,a.restaurant_id FROM restaurant_staff_access a ${active}
  a.user_id=? AND a.restaurant_id=? AND a.credential_hash=? AND a.revision=? AND u.admin_version=? AND m.active=1`).bind(
  crypto.randomUUID(),tokenHash,at+7*86400,account.user_id,account.restaurant_id,next,account.revision+(claim?1:0),account.admin_version);
 let result;
 if(claim){
  const outcomes=await env.DB.batch([
   env.DB.prepare(`UPDATE restaurant_staff_access SET invitation_hash=NULL,invitation_expires_at=NULL,credential_hash=?,revision=revision+1
    WHERE user_id=? AND restaurant_id=? AND invitation_hash=? AND invitation_expires_at>? AND revision=?
      AND EXISTS(SELECT 1 FROM users u WHERE u.id=restaurant_staff_access.user_id AND u.status='active' AND u.admin_version=?)`)
    .bind(next,account.user_id,account.restaurant_id,hash,at,account.revision,account.admin_version),
   env.DB.prepare(`INSERT INTO restaurant_operation_log(restaurant_id,actor_id,action,subject_id)
    SELECT ?,?,'staff_claimed',? WHERE changes()>0`).bind(account.restaurant_id,account.user_id,account.user_id),
   env.DB.prepare(`UPDATE restaurant_memberships SET active=1 WHERE user_id=? AND restaurant_id=? AND EXISTS(
    SELECT 1 FROM restaurant_staff_access WHERE user_id=? AND restaurant_id=? AND credential_hash=?)`)
    .bind(account.user_id,account.restaurant_id,account.user_id,account.restaurant_id,next),
   session
  ]);
  result=outcomes.at(-1);
 }else result=await session.run();
 if(!result.meta.changes)throw new ApiError(401,'STAFF_CODE_INVALID');
 return changeClientCookie(respond(req,env,claim?200:204,claim?{credential}:undefined),token);
}
