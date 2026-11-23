import {ApiError,hmacHex,idempotencyKey,readJson,requireKeys,requireRole,requireText} from './security.js';
import {controlAudit} from './control-center.js';
import {randomSecret} from './client-access.js';

export const loginPattern=/^[a-z0-9][a-z0-9._-]{3,39}$/;
export const recoveryHash=(env,code)=>hmacHex(env.SESSION_PEPPER,'client-recover:v1:'+code);
export const retiredAccessHash=env=>hmacHex(env.SESSION_PEPPER,'retired-client-access:'+randomSecret());

export async function inviteOwner(req,env,actor,restaurantId){
 requireRole(actor,'platform_admin');
 if(!actor.privilegedPasskey)throw new ApiError(403,'ROLE_FORBIDDEN');
 const input=await readJson(req);
 requireKeys(input,['login','displayName']);
 const name=requireText(input.displayName,2,80,'displayName');
 const login=typeof input.login==='string'?input.login.trim().toLowerCase():'';
 if(!loginPattern.test(login))throw new ApiError(400,'CLIENT_CREDENTIAL_FORMAT');
 const restaurant=await env.DB.prepare("SELECT id FROM restaurants WHERE id=? AND plan IN ('ONLINE','PLUS')").bind(restaurantId).first();
 if(!restaurant)throw new ApiError(404,'RESTAURANT_NOT_FOUND');
 const id=idempotencyKey(req),invitation=randomSecret(),expiresAt=Math.floor(Date.now()/1000)+1800;
 try{
  await env.DB.batch([
   env.DB.prepare("INSERT INTO users(id,display_name,account_role) VALUES(?,?,'customer')").bind(id,name),
   env.DB.prepare('INSERT INTO client_credentials(user_id,access_hash,recovery_hash,login_name) VALUES(?,?,?,?)')
    .bind(id,await retiredAccessHash(env),await recoveryHash(env,invitation),login),
   env.DB.prepare("INSERT INTO restaurant_memberships(restaurant_id,user_id,staff_role) VALUES(?,?,'owner')")
    .bind(restaurantId,id),
   env.DB.prepare("INSERT INTO privileged_passkey_accounts(user_id,access_role,restaurant_id,invitation_expires_at) VALUES(?,'owner',?,?)")
    .bind(id,restaurantId,expiresAt),
   controlAudit(env,actor,'owner_invited',id,{expiresAt},restaurantId)
  ]);
 }catch(error){
  if(/client_credentials.login_name|users.id/.test(String(error)))throw new ApiError(409,'CLIENT_LOGIN_UNAVAILABLE');
  throw error;
 }
 return {userId:id,login,invitation,expiresAt};
}
