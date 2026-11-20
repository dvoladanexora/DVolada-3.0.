import http from 'node:http';
import {createHash,randomUUID} from 'node:crypto';
import {Pool} from 'pg';
import {jwtVerify} from 'jose';
import {readJsonBody,validStatusPatch} from './request-validation.js';
import {parseAllowedOrigins,allowedCorsHeaders} from './cors-policy.js';
import {validRestaurantRole,restaurantTransitionPermission} from './restaurant-permissions.js';
import {createActorLimiter} from './actor-rate-limit.js';
import {createHealthProbe} from './health-probe.js';
import {validProductionDeployment} from './deployment-guard.js';
import {activeRestaurantRole} from './tenant-access.js';

const port=Number(process.env.PORT||8080);
// No publicar HTTP directamente: exponer la API sólo detrás de un proxy TLS.
const bindHost=process.env.DVOLADA_BIND_HOST||'127.0.0.1';
const allowedOrigins=parseAllowedOrigins(process.env.DVOLADA_ALLOWED_ORIGINS);
const requiresPublicSecurity=process.env.NODE_ENV==='production'
 ||!['127.0.0.1','localhost','::1'].includes(bindHost);
const deployment=validProductionDeployment({
 nodeEnv:requiresPublicSecurity?'production':'development',
 publicApiOrigin:process.env.DVOLADA_PUBLIC_API_ORIGIN,
 allowedOrigins
});
if(!deployment.ok){console.error('Refusing insecure API startup:',deployment.reason);process.exit(1)}
// Cuotas por empleado para evitar abuso ordinario. WAF distribuido sigue pendiente.
const checkReadRate=createActorLimiter({limit:600,windowMs:60_000});
const checkWriteRate=createActorLimiter({limit:180,windowMs:60_000});
// Denegar también solicitudes SIN sesión, antes de verificar JWT o consultar SQL.
// Clave de IP de SOCKET: X-Forwarded-For / CF-Connecting-IP NO son confiables
// si el puerto Node puede recibir tráfico directo. Cloudflare WAF es obligatorio.
const checkPreAuthRate=createActorLimiter({limit:180,windowMs:60_000,maxEntries:3000});
const checkInstanceRate=createActorLimiter({limit:2400,windowMs:60_000,maxEntries:1});
const databaseUrl=process.env.DATABASE_URL;
const jwtSecret=process.env.DVOLADA_JWT_SECRET;
const issuer=process.env.DVOLADA_JWT_ISSUER;
const audience=process.env.DVOLADA_JWT_AUDIENCE;
if(!databaseUrl||!jwtSecret||Buffer.byteLength(jwtSecret)<32||!issuer||!audience){
 console.error('Required: DATABASE_URL, DVOLADA_JWT_SECRET (>=32 bytes), DVOLADA_JWT_ISSUER, DVOLADA_JWT_AUDIENCE');
 process.exit(1);
}
const pool=new Pool({connectionString:databaseUrl,max:10,connectionTimeoutMillis:5000,statement_timeout:5000,query_timeout:7000,idleTimeoutMillis:30000});
const secret=new TextEncoder().encode(jwtSecret);
const healthReady=createHealthProbe(()=>pool.query('SELECT 1'));
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const send=(res,status,body)=>{res.writeHead(status,{
 'content-type':'application/json; charset=utf-8',
 'cache-control':'no-store',
 'x-content-type-options':'nosniff',
 'x-frame-options':'DENY',
 'referrer-policy':'no-referrer',
 'content-security-policy':"default-src 'none'; frame-ancestors 'none'",
 'cross-origin-resource-policy':'same-site'
 });res.end(JSON.stringify(body))};
async function auth(req){
 const token=/^Bearer ([A-Za-z0-9._-]+)$/i.exec(String(req.headers.authorization||''))?.[1];
 if(!token||token.length>4096)throw Object.assign(Error('Authentication required'),{code:401});
 let payload;
 try{({payload}=await jwtVerify(token,secret,{issuer,audience,algorithms:['HS256']}))}
 catch{throw Object.assign(Error('Invalid or expired token'),{code:401})}
 // JWTs sin exp o con vida arbitraria no pueden conceder acceso indefinido.
 const now=Math.floor(Date.now()/1000);
 if(typeof payload.restaurant_id!=='string'||typeof payload.sub!=='string'
  ||!uuid.test(payload.restaurant_id)||!uuid.test(payload.sub)
  ||!Number.isSafeInteger(payload.iat)||!Number.isSafeInteger(payload.exp)
  ||payload.iat>now+30||payload.exp<=now||payload.exp-payload.iat>3600)
  throw Object.assign(Error('Invalid identity or token lifetime'),{code:401});
 // Nunca confiar en role/permissions del JWT: pueden haber sido revocados.
 // Consultar membresía ACTIVA en cada solicitud y negar si no existe.
 const role=await activeRestaurantRole(pool,payload.restaurant_id,payload.sub);
 if(!role)throw Object.assign(Error('Restaurant membership inactive or plan invalid'),{code:403});
 return {restaurantId:payload.restaurant_id,userId:payload.sub,role};
}
const server=http.createServer(async(req,res)=>{
 const requestId=randomUUID();
 res.setHeader('X-Request-ID',requestId);
 try{
 const globalQuota=checkInstanceRate('all-requests');
 const ipQuota=checkPreAuthRate('socket:'+String(req.socket?.remoteAddress||'unknown'));
 if(!globalQuota.allowed||!ipQuota.allowed){
  res.setHeader('Retry-After',String(Math.max(globalQuota.retryAfterSeconds,ipQuota.retryAfterSeconds)));
  return send(res,429,{error:'Request limit reached; retry later'});
 }
 const origin=req.headers.origin;
 if(origin){
  const cors=allowedCorsHeaders(origin,allowedOrigins);
  if(!cors)return send(res,403,{error:'Origin not allowed'});
  for(const [name,value] of Object.entries(cors))res.setHeader(name,value);
 }
 if(req.method==='OPTIONS'){
  if(!origin)return send(res,400,{error:'Origin required'});
  res.writeHead(204);res.end();return;
 }
 const url=new URL(req.url,'http://localhost');
 if(req.method==='GET'&&url.pathname==='/health'){
  const healthy=await healthReady();
  return send(res,healthy?200:503,{status:healthy?'ok':'unavailable'});
 }
 const identity=await auth(req);
 const quota=(req.method==='PATCH'?checkWriteRate:checkReadRate)(identity.restaurantId+':'+identity.userId);
 if(!quota.allowed){
  res.setHeader('Retry-After',String(quota.retryAfterSeconds));
  return send(res,429,{error:'Request limit reached; retry later'});
 }
 if(req.method==='GET'&&url.pathname==='/api/v1/restaurant/capabilities')
  return send(res,200,{online:true,local:false,restaurantId:identity.restaurantId});
 if(req.method==='GET'&&url.pathname==='/api/v1/restaurant/orders'){
  const limit=50;
  // Initial snapshot is limited; full cursor pagination remains pending.
  const {rows}=await pool.query(
   'SELECT id,order_number,status,version,created_at,updated_at FROM online_orders WHERE restaurant_id=$1 ORDER BY updated_at DESC,id LIMIT $2',
   [identity.restaurantId,limit]
  );
  return send(res,200,{orders:rows,serverTime:new Date().toISOString(),hasMore:rows.length===limit,notice:'Snapshot only; use /changes for incremental updates'});
 }
 if(req.method==='GET'&&url.pathname==='/api/v1/restaurant/orders/changes'){
  const since=url.searchParams.get('since')||'0';
  if(!/^(0|[1-9]\d{0,15})$/.test(since)||!Number.isSafeInteger(Number(since)))return send(res,400,{error:'Invalid since cursor'});
  const {rows}=await pool.query(
   'SELECT e.id AS cursor,e.order_id,e.from_status,e.to_status,e.version,e.created_at FROM online_order_events e WHERE e.restaurant_id=$1 AND e.id>$2 ORDER BY e.id ASC LIMIT 101',
   [identity.restaurantId,since]
  );
  const hasMore=rows.length>100,events=rows.slice(0,100);
  return send(res,200,{events,nextCursor:String(events.at(-1)?.cursor??since),hasMore,serverTime:new Date().toISOString()});
 }
 const detail=/^\/api\/v1\/restaurant\/orders\/([0-9a-f-]+)$/i.exec(url.pathname);
 if(req.method==='GET'&&detail){
  if(!uuid.test(detail[1]))return send(res,400,{error:'Invalid order ID'});
  const {rows}=await pool.query('SELECT id,order_number,status,version,created_at,updated_at FROM online_orders WHERE id=$1 AND restaurant_id=$2',[detail[1],identity.restaurantId]);
  return rows.length?send(res,200,{order:rows[0]}):send(res,404,{error:'Order not found'});
 }
 const match=/^\/api\/v1\/restaurant\/orders\/([0-9a-f-]+)\/status$/i.exec(url.pathname);
 if(req.method==='PATCH'&&match){
  if(!uuid.test(match[1]))return send(res,400,{error:'Invalid order ID'});
  if(!validRestaurantRole(identity.role))return send(res,403,{error:'Business role invalid'});
  const key=req.headers['idempotency-key'];
  if(typeof key!=='string'||!uuid.test(key))return send(res,400,{error:'UUID Idempotency-Key required'});
  if(!/^application\/json(?:;|$)/i.test(String(req.headers['content-type']||'')))
   return send(res,415,{error:'Content-Type must be application/json'});
  const body=await readJsonBody(req);
  if(!validStatusPatch(body))return send(res,400,{error:'Invalid status or expectedVersion'});
  const hash=createHash('sha256').update(JSON.stringify({id:match[1],status:body.status,expectedVersion:body.expectedVersion})).digest('hex');
  const client=await pool.connect();
  try{
   await client.query('BEGIN');
   // Comprobar el acceso EN la transacción: el bloqueo impide que se revoque
   // el rol, la membresía o el plan mientras se modifica este pedido.
   const currentRole=await activeRestaurantRole(client,identity.restaurantId,identity.userId,{lock:true});
   if(!currentRole){
    await client.query('ROLLBACK');
    return send(res,403,{error:'Restaurant access revoked or plan inactive'});
   }
   await client.query('INSERT INTO online_idempotency(restaurant_id,actor_id,idempotency_key,request_hash) VALUES($1,$2,$3,$4) ON CONFLICT DO NOTHING',[identity.restaurantId,identity.userId,key,hash]);
   const record=await client.query('SELECT request_hash,response_status,response_body FROM online_idempotency WHERE restaurant_id=$1 AND actor_id=$2 AND idempotency_key=$3 FOR UPDATE',[identity.restaurantId,identity.userId,key]);
   const previous=record.rows[0];
   if(previous.request_hash!==hash){await client.query('ROLLBACK');return send(res,409,{error:'Idempotency key reused with different request'})}
   if(previous.response_status){await client.query('COMMIT');return send(res,previous.response_status,previous.response_body)}
   const found=await client.query('SELECT id,status,version FROM online_orders WHERE id=$1 AND restaurant_id=$2 FOR UPDATE',[match[1],identity.restaurantId]);
   let status,response;
   const current=found.rows[0];
   if(!current){status=404;response={error:'Order not found'}}
   else if(current.version!==body.expectedVersion){status=409;response={error:'ORDER_CHANGED',current}}
   else if(!restaurantTransitionPermission(currentRole,current.status,body.status).ok){
    const denial=restaurantTransitionPermission(currentRole,current.status,body.status);
    status=denial.status;response={error:denial.reason};
   }else{
    const changed=await client.query('UPDATE online_orders SET status=$1,version=version+1,updated_at=now() WHERE id=$2 AND restaurant_id=$3 RETURNING id,status,version,updated_at',[body.status,match[1],identity.restaurantId]);
    await client.query('INSERT INTO online_order_events(order_id,restaurant_id,actor_id,from_status,to_status,version) VALUES($1,$2,$3,$4,$5,$6)',[match[1],identity.restaurantId,identity.userId,current.status,body.status,changed.rows[0].version]);
    status=200;response={order:changed.rows[0]};
   }
   await client.query('UPDATE online_idempotency SET response_status=$4,response_body=$5 WHERE restaurant_id=$1 AND actor_id=$2 AND idempotency_key=$3',[identity.restaurantId,identity.userId,key,status,JSON.stringify(response)]);
   await client.query('COMMIT');return send(res,status,response);
  }catch(e){await client.query('ROLLBACK');throw e}finally{client.release()}
 }
 return send(res,404,{error:'Not found'});
 }catch(e){if(e.code===413){res.setHeader('Connection','close');return send(res,413,{error:'Request too large'})}if(e.code===401||e.code===403||e.code===400||e.code===415)return send(res,e.code,{error:e.message});if(e.code==='ERR_JWT_EXPIRED'||e.code?.startsWith?.('ERR_JWT'))return send(res,401,{error:'Invalid or expired token'});// Evitar registrar mensajes SQL, cuerpos de pedidos, JWT, PIN o datos del cliente.
 const safeCode=typeof e.code==='string'&&/^[A-Z0-9_]{1,30}$/.test(e.code)?e.code:'UNEXPECTED';
 console.error('API internal error',JSON.stringify({requestId,code:safeCode}));
 return send(res,500,{error:'Internal server error',requestId})}
});
// Límites de conexiones lentas y encabezados gigantes. Complementar con WAF y rate limits de borde.
server.requestTimeout=15000;
server.headersTimeout=10000;
server.timeout=20000;
server.maxHeadersCount=60;
server.listen(port,bindHost,()=>console.log('Dvolada Online API listening on '+bindHost+':'+port));
