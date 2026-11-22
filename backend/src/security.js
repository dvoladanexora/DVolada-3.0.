/** Authentication, CORS, validation and error responses for the Dvolada API. */
export const uuidRE=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const encoder=new TextEncoder();
export class ApiError extends Error {
  constructor(status,code,message=code){super(message);this.name='ApiError';this.status=status;this.code=code}
}
export function requireUuid(value,field='id'){
  if(typeof value!=='string'||!uuidRE.test(value))throw new ApiError(400,'INVALID_ID',`Invalid ${field}`);
  return value.toLowerCase();
}
export function requireInteger(v,min,max,field){
  if(!Number.isSafeInteger(v)||v<min||v>max)throw new ApiError(400,'INVALID_INPUT',`Invalid ${field}`);
  return v;
}
export function requireText(v,min,max,field){
  if(typeof v!=='string'||v.trim().length<min||v.trim().length>max)throw new ApiError(400,'INVALID_INPUT',`Invalid ${field}`);
  return v.trim();
}
export function requireKeys(value,allowed){
  if(value===null||typeof value!=='object'||Array.isArray(value)||
    Object.keys(value).some(k=>!allowed.includes(k)))throw new ApiError(400,'INVALID_BODY');
}
export async function readJson(req,maxBytes=8192){
  if(!/^application\/json(?:\s*;|$)/i.test(req.headers.get('content-type')||''))throw new ApiError(415,'JSON_REQUIRED');
  const reader=req.body?.getReader();
  if(!reader)throw new ApiError(400,'INVALID_BODY');
  const chunks=[];let size=0;
  try{
    while(true){const {value,done}=await reader.read();if(done)break;size+=value.byteLength;
      if(size>maxBytes){await reader.cancel();throw new ApiError(413,'BODY_TOO_LARGE')}
      chunks.push(value);
    }
  }finally{reader.releaseLock()}
  const bytes=new Uint8Array(size);let offset=0;
  for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.byteLength}
  try{return JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes))}
  catch{throw new ApiError(400,'INVALID_JSON')}
}
function toHex(array){return [...new Uint8Array(array)].map(x=>x.toString(16).padStart(2,'0')).join('')}
export async function sha256(text){
  return toHex(await crypto.subtle.digest('SHA-256',encoder.encode(text)));
}
export async function hmacHex(secret,text){
  if(typeof secret!=='string'||encoder.encode(secret).length<32)throw new Error('Missing or weak secret binding');
  const key=await crypto.subtle.importKey('raw',encoder.encode(secret),{name:'HMAC',hash:'SHA-256'},false,['sign']);
  return toHex(await crypto.subtle.sign('HMAC',key,encoder.encode(text)));
}
export async function deliveryPin(secret,orderId){
  const hash=await hmacHex(secret,'delivery-pin:v1:'+orderId);
  const first=Number.parseInt(hash.slice(0,8),16);
  return String(first%1000000).padStart(6,'0');
}
export function securityHeaders(req,env){
  const h=new Headers({
    'content-type':'application/json; charset=utf-8',
    'cache-control':'no-store','x-content-type-options':'nosniff',
    'referrer-policy':'no-referrer','content-security-policy':"default-src 'none'",
    'vary':'Origin'
  });
  if(new URL(req.url).protocol==='https:')h.set('strict-transport-security','max-age=31536000; includeSubDomains');
  const origin=req.headers.get('origin');
  if(origin&&allowedOrigin(origin,env))h.set('access-control-allow-origin',origin);
  return h;
}
export function allowedOrigin(origin,env){
  return Boolean(origin&&typeof env.CORS_ORIGINS==='string'&&env.CORS_ORIGINS.split(',').map(x=>x.trim()).some(x=>x===origin&&/^https:\/\//.test(x)||x===origin&&/^http:\/\/localhost(?::\d+)?$/.test(x)));
}
export function respond(req,env,status,payload){
  return new Response(status===204?null:JSON.stringify(payload),{status,headers:securityHeaders(req,env)});
}
export function preflight(req,env){
  const origin=req.headers.get('origin');
  if(!allowedOrigin(origin,env))throw new ApiError(403,'ORIGIN_FORBIDDEN');
  const h=securityHeaders(req,env);
  h.set('access-control-allow-methods','GET,POST,PATCH,OPTIONS');
  h.set('access-control-allow-headers','Authorization,Content-Type,Idempotency-Key,X-Restaurant-ID');
  h.set('access-control-max-age','600');
  return new Response(null,{status:204,headers:h});
}
export function assertAllowedOrigin(req,env){
  const origin=req.headers.get('origin');
  if(origin&&!allowedOrigin(origin,env))throw new ApiError(403,'ORIGIN_FORBIDDEN');
}
export function assertConfiguration(env){
  if(!env?.DB||typeof env.DB.prepare!=='function')throw new Error('Missing D1 binding DB');
  for(const key of ['SESSION_PEPPER','PIN_SECRET']){
    if(typeof env[key]!=='string'||encoder.encode(env[key]).length<32)throw new Error('Missing secure '+key);
  }
  if(env.SESSION_PEPPER===env.PIN_SECRET)throw new Error('SESSION_PEPPER and PIN_SECRET must differ');
}
export async function identity(req,env){
  const header=req.headers.get('authorization')||'';
  const match=/^Bearer ([A-Za-z0-9_-]{43})$/.exec(header);
  if(!match)throw new ApiError(401,'SESSION_REQUIRED');
  const hash=await hmacHex(env.SESSION_PEPPER,'session:v1:'+match[1]);
  const s=await env.DB.prepare(`SELECT s.id AS session_id,s.user_id,u.display_name,u.account_role
    FROM auth_sessions s JOIN users u ON u.id=s.user_id
    WHERE s.token_hash=? AND s.expires_at>? AND s.revoked_at IS NULL AND u.status='active'`)
    .bind(hash,Math.floor(Date.now()/1000)).first();
  if(!s)throw new ApiError(401,'SESSION_INVALID');
  return {sessionId:s.session_id,userId:s.user_id,displayName:s.display_name,role:s.account_role};
}
export async function restaurantAccess(req,env,actor){
  const restaurantId=requireUuid(req.headers.get('x-restaurant-id'),'X-Restaurant-ID');
  const member=await env.DB.prepare(`SELECT m.staff_role,r.plan,r.subscription_status,r.online_state,r.name
    FROM restaurant_memberships m JOIN restaurants r ON r.id=m.restaurant_id
    WHERE m.user_id=? AND m.restaurant_id=? AND m.active=1`)
    .bind(actor.userId,restaurantId).first();
  if(!member)throw new ApiError(403,'RESTAURANT_FORBIDDEN');
  if(member.subscription_status!=='active'||!['ONLINE','PLUS'].includes(member.plan))
    throw new ApiError(403,'ONLINE_PLAN_INACTIVE');
  return {restaurantId,...member};
}
export function requireStaff(staffRole,roles){
  if(!roles.includes(staffRole))throw new ApiError(403,'ROLE_FORBIDDEN');
}
export function requireRole(actor,role){
  if(actor.role!==role)throw new ApiError(403,'ROLE_FORBIDDEN');
}
export async function mutationRateLimit(env,actor,max=60){
  const bucket=Math.floor(Date.now()/60000);
  await env.DB.prepare(`INSERT INTO request_rate_limits(session_id,window_minute,count) VALUES(?,?,1)
    ON CONFLICT(session_id,window_minute) DO UPDATE SET count=count+1`)
    .bind(actor.sessionId,bucket).run();
  const row=await env.DB.prepare('SELECT count FROM request_rate_limits WHERE session_id=? AND window_minute=?')
    .bind(actor.sessionId,bucket).first();
  if(row.count>max)throw new ApiError(429,'RATE_LIMITED');
}
export function idempotencyKey(req){
  const key=req.headers.get('idempotency-key');
  return requireUuid(key,'Idempotency-Key');
}
export function sqlConflict(error){
  const message=String(error?.message||error);
  if(/STALE_ORDER|STALE_ASSIGNMENT|OFFER_CHANGED/.test(message))return new ApiError(409,'ORDER_CHANGED');
  if(/RESTAURANT_CLOSED/.test(message))return new ApiError(409,'RESTAURANT_NOT_ACCEPTING');
  if(/PRODUCT_CHANGED/.test(message))return new ApiError(409,'PRODUCT_UNAVAILABLE');
  if(/FLASH_UNAVAILABLE/.test(message))return new ApiError(409,'FLASH_UNAVAILABLE');
  if(/COUPON_UNAVAILABLE|online_orders.customer_id, online_orders.coupon_code/.test(message))return new ApiError(409,'COUPON_UNAVAILABLE');
  if(/CHECKOUT_TOTAL_CHANGED/.test(message))return new ApiError(409,'CHECKOUT_TOTAL_CHANGED');
  if(/PHONE_REQUIRED/.test(message))return new ApiError(400,'PHONE_REQUIRED');
  if(/PHONE_NOT_VERIFIED/.test(message))return new ApiError(403,'PHONE_NOT_VERIFIED');
  if(/IMMUTABLE_ORDER/.test(message))return new ApiError(409,'IMMUTABLE_ORDER');
  if(/INVALID_TRANSITION/.test(message))return new ApiError(422,'INVALID_TRANSITION');
  if(/COURIER_LIMIT/.test(message))return new ApiError(409,'COURIER_LIMIT');
  if(/COURIER_INACTIVE/.test(message))return new ApiError(409,'COURIER_UNAVAILABLE');
  return error;
}
