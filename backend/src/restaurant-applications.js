import {ApiError,hmacHex,idempotencyKey,readJson,requireKeys,requireRole,requireText,requireUuid,respond} from './security.js';

export async function submitRestaurantApplication(req,env){
 if(req.headers.get('origin')!==new URL(req.url).origin)throw new ApiError(403,'ORIGIN_FORBIDDEN');
 const body=await readJson(req,4096);
 requireKeys(body,['business','owner','phone','email','location','type','plan','notes']);
 const business=requireText(body.business,2,120,'business'),owner=requireText(body.owner,2,80,'owner');
 const location=requireText(body.location,3,180,'location'),type=requireText(body.type,2,60,'type');
 const email=requireText(body.email,5,180,'email').toLowerCase(),notes=requireText(body.notes??'',0,400,'notes');
 if(!/^\+504[0-9]{8}$/.test(body.phone)||!/^\S+@[^\s@]+\.[^\s@]+$/.test(email)||
  !['ONLINE','LOCAL','PLUS'].includes(body.plan))throw new ApiError(400,'INVALID_INPUT');
 const id=idempotencyKey(req),ip=req.headers.get('cf-connecting-ip')||'unknown';
 const bucket=Math.floor(Date.now()/600000);
 const source=await hmacHex(env.SESSION_PEPPER,'affiliate-application:v1:'+ip);
 const rate=await env.DB.prepare(`INSERT INTO client_auth_throttle(source_hash,time_bucket,attempts) VALUES(?,?,1)
  ON CONFLICT(source_hash) DO UPDATE SET attempts=CASE WHEN time_bucket=excluded.time_bucket THEN attempts+1 ELSE 1 END,
  time_bucket=excluded.time_bucket RETURNING attempts`).bind(source,bucket).first();
 if(rate.attempts>8)throw new ApiError(429,'RATE_LIMITED');
 await env.DB.prepare(`INSERT INTO restaurant_applications(id,business_name,owner_name,phone,email,location,business_type,plan,notes)
  VALUES(?,?,?,?,?,?,?,?,?) ON CONFLICT DO NOTHING`).bind(id,business,owner,body.phone,email,location,type,body.plan,notes).run();
 return respond(req,env,202,{received:true});
}

export async function manageRestaurantApplications(req,env,actor,id){
 requireRole(actor,'platform_admin');
 if(req.method==='GET'&&!id){
  const {results}=await env.DB.prepare(`SELECT * FROM restaurant_applications
   WHERE status='pending' ORDER BY created_at DESC,id DESC LIMIT 50`).all();
  return respond(req,env,200,{applications:results});
 }
 if(req.method!=='PATCH'||!id)throw new ApiError(404,'NOT_FOUND');
 id=requireUuid(id);
 const body=await readJson(req,2048);requireKeys(body,['decision','reason']);
 if(!['approved','rejected'].includes(body.decision))throw new ApiError(400,'INVALID_INPUT');
 const reason=requireText(body.reason??'',body.decision==='rejected'?3:0,250,'reason');
 const [decision]=await env.DB.batch([
  env.DB.prepare("UPDATE restaurant_applications SET status=?,reason=? WHERE id=? AND status='pending'").bind(body.decision,reason,id),
  env.DB.prepare(`INSERT INTO control_audit(actor_id,subject,action,detail)
   SELECT ?,?,'restaurant_application_decided',? WHERE changes()=1`).bind(actor.userId,id,JSON.stringify({decision:body.decision}))
 ]);
 if(decision.meta.changes!==1)throw new ApiError(409,'ADMIN_ACCOUNT_CHANGED');
 return respond(req,env,200,{ok:true});
}
