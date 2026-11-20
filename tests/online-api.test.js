import test from 'node:test';
import assert from 'node:assert/strict';
import {createOnlineApi,OnlineApiError,conflictMessage} from '../src/online-api.js';
import {readJsonBody,validStatusPatch} from '../server/src/request-validation.js';
import {parseAllowedOrigins,allowedCorsHeaders} from '../server/src/cors-policy.js';
import {validRestaurantRole,restaurantTransitionPermission} from '../server/src/restaurant-permissions.js';
import {createActorLimiter} from '../server/src/actor-rate-limit.js';
import {createHealthProbe} from '../server/src/health-probe.js';
import {readFileSync} from 'node:fs';

test('requires HTTPS and an authenticated token provider',()=>{
 assert.throws(()=>createOnlineApi({baseUrl:'http://example.com',getAccessToken:()=> 'x'}),/HTTPS/);
 assert.throws(()=>createOnlineApi({baseUrl:'https://example.com'}),/token provider/);
});

test('does not send requests without an authenticated session',async()=>{
 let called=false;
 const api=createOnlineApi({baseUrl:'https://api.example.com',getAccessToken:()=>null,fetchImpl:()=>{called=true}});
 await assert.rejects(api.listOrders(),e=>e.status===401);
 assert.equal(called,false);
});

test('GET orders includes bearer auth and no-cache',async()=>{
 let captured;
 const api=createOnlineApi({baseUrl:'https://api.example.com/',getAccessToken:()=> 'test-token',fetchImpl:async(url,opts)=>{
  captured={url,opts};return {ok:true,json:async()=>({orders:[]})};
 }});
 assert.deepEqual(await api.listOrders(),{orders:[]});
 assert.equal(captured.url,'https://api.example.com/api/v1/restaurant/orders');
 assert.equal(captured.opts.headers.Authorization,'Bearer test-token');
 assert.equal(captured.opts.cache,'no-store');
});

test('conflict 409 does not retry and exposes a review message',async()=>{
 let calls=0;
 const api=createOnlineApi({baseUrl:'https://api.example.com',getAccessToken:()=> 'test-token',fetchImpl:async()=>{
  calls++;return {ok:false,status:409,json:async()=>({error:'ORDER_CHANGED',current:{version:2,status:'Preparando'}})};
 }});
 await assert.rejects(api.updateStatus({id:'f23e8d91-66b1-4e47-821e-6f8efb6d7b61',version:1},'Listo'),e=>{
  assert.ok(e instanceof OnlineApiError);assert.equal(e.status,409);
  assert.match(conflictMessage(e),/Otro empleado/);return true;
 });
 assert.equal(calls,1);
});

test('rejects unversioned orders before sending an update',async()=>{
 let called=false;
 const api=createOnlineApi({baseUrl:'https://api.example.com',getAccessToken:()=> 'x',fetchImpl:()=>{called=true}});
 await assert.rejects(api.updateStatus({id:'1'},'Listo'),/versión/);
 assert.equal(called,false);
});

test('status PATCH sends version and idempotency key without leaking tokens in body',async()=>{
 let captured;
 const api=createOnlineApi({baseUrl:'https://api.example.com',getAccessToken:()=> 'secret-token',fetchImpl:async(url,opts)=>{
  captured={url,opts};return {ok:true,json:async()=>({order:{id:'order-1',version:4,status:'Listo'}})};
 }});
 const result=await api.updateStatus({id:'order-1',version:3},'Listo');
 assert.equal(result.order.version,4);
 assert.equal(captured.url,'https://api.example.com/api/v1/restaurant/orders/order-1/status');
 assert.equal(captured.opts.method,'PATCH');
 assert.match(captured.opts.headers['Idempotency-Key'],/^[0-9a-f-]{36}$/i);
 assert.equal(captured.opts.headers.Authorization,'Bearer secret-token');
 assert.deepEqual(JSON.parse(captured.opts.body),{status:'Listo',expectedVersion:3});
 assert.ok(!captured.opts.body.includes('secret-token'));
});

test('order identifiers are encoded as one URL path segment',async()=>{
 let url;
 const api=createOnlineApi({baseUrl:'https://api.example.com',getAccessToken:()=> 'x',fetchImpl:async(u)=>{url=u;return {ok:true,json:async()=>({})}}});
 await api.getOrder('order/123?x=1');
 assert.equal(url,'https://api.example.com/api/v1/restaurant/orders/order%2F123%3Fx%3D1');
});

test('server errors preserve HTTP status and message',async()=>{
 const api=createOnlineApi({baseUrl:'https://api.example.com',getAccessToken:()=> 'x',fetchImpl:async()=>({ok:false,status:403,json:async()=>({error:'Acceso denegado'})})});
 await assert.rejects(api.listOrders(),error=>error instanceof OnlineApiError&&error.status===403&&error.message==='Acceso denegado');
});

test('rejects API URLs with embedded credentials or unexpected paths',()=>{
 for(const baseUrl of [
  'https://user:password@api.example.com',
  'https://api.example.com/redirect',
  'https://api.example.com/?token=secret',
  'https://api.example.com/#fragment',
  'http://127.0.0.1:8787',
  'not-a-url'
 ])assert.throws(()=>createOnlineApi({baseUrl,getAccessToken:()=> 'token'}));
});

test('accepts localhost HTTP only for development and normalizes origin',async()=>{
 let captured;
 const api=createOnlineApi({baseUrl:'http://localhost:8787/',getAccessToken:()=> 'token',fetchImpl:async url=>{captured=url;return {ok:true,json:async()=>({orders:[]})}}});
 await api.listOrders();
 assert.equal(captured,'http://localhost:8787/api/v1/restaurant/orders');
});

test('invalid JSON payload on successful response is never treated as a valid confirmation',async()=>{
 for(const payload of [null,[],42,'OK']){
  const api=createOnlineApi({baseUrl:'https://api.example.com',getAccessToken:()=> 'x',
   fetchImpl:async()=>({ok:true,status:200,json:async()=>payload})});
  await assert.rejects(api.listOrders(),error=>error instanceof OnlineApiError&&error.status===502);
 }
 const malformed=createOnlineApi({baseUrl:'https://api.example.com',getAccessToken:()=> 'x',
  fetchImpl:async()=>({ok:true,status:200,json:async()=>{throw Error('Invalid JSON')}})});
 await assert.rejects(malformed.listOrders(),error=>error instanceof OnlineApiError&&error.status===502);
});
test('HTTP error with null, text or bad JSON returns a structured error',async()=>{
 for(const payload of [null,[],0,'Internal error']){
  const api=createOnlineApi({baseUrl:'https://api.example.com',getAccessToken:()=> 'x',
   fetchImpl:async()=>({ok:false,status:503,json:async()=>payload})});
  await assert.rejects(api.listOrders(),error=>error instanceof OnlineApiError&&error.status===503&&error.message==='Error de servidor');
 }
 const badJson=createOnlineApi({baseUrl:'https://api.example.com',getAccessToken:()=> 'x',
  fetchImpl:async()=>({ok:false,status:502,json:async()=>{throw Error('Broken JSON')}})});
 await assert.rejects(badJson.listOrders(),error=>error instanceof OnlineApiError&&error.status===502);
});
test('lost acknowledgement of status PATCH is never retried automatically',async()=>{
 let calls=0;
 const api=createOnlineApi({baseUrl:'https://api.example.com',getAccessToken:()=> 'x',
  fetchImpl:async()=>{calls++;throw TypeError('Network lost')}});
 await assert.rejects(api.updateStatus({id:'abc',version:2},'Listo'),error=>{
  assert.ok(error instanceof OnlineApiError);assert.equal(error.status,0);
  assert.match(error.message,/Verificá el estado actual/);return true;
 });
 assert.equal(calls,1,'Nunca repetir una mutación cuando se desconoce si el servidor la recibió');
});
test('aborted API requests keep their abort signal instead of being reported as a network failure',async()=>{
 const ctrl=new AbortController();ctrl.abort();
 const stop=Object.assign(Error('Request aborted'),{name:'AbortError'});
 const api=createOnlineApi({baseUrl:'https://api.example.com',getAccessToken:()=> 'x',fetchImpl:async()=>{throw stop}});
 await assert.rejects(api.listOrders(ctrl.signal),e=>e===stop);
});

test('server request guard rejects null, arrays, invalid versions and malformed status',()=>{
 for(const invalid of [null,[],false,'ok',0,{}, {status:'Listo',expectedVersion:0},
  {status:'Listo',expectedVersion:1.5}, {status:'',expectedVersion:1},
  {status:'x'.repeat(41),expectedVersion:1}]){
  assert.equal(validStatusPatch(invalid),false);
 }
 assert.equal(validStatusPatch({status:'Listo',expectedVersion:2}),true);
});
test('preliminary server reads bounded UTF-8 JSON and rejects non-object payloads',async()=>{
 const body=chunks=>({async *[Symbol.asyncIterator](){for(const v of chunks)yield Buffer.from(v)}});
 assert.deepEqual(await readJsonBody(body(['{"status":"Listo",','"expectedVersion":2}'])),
  {status:'Listo',expectedVersion:2});
 for(const input of ['null','[]','false','42','"hello"','{broken']){
  await assert.rejects(readJsonBody(body([input])),e=>e.code===400);
 }
 await assert.rejects(readJsonBody(body(['{"note":"','😀'.repeat(1030),'"}'])),e=>e.code===413);
 await assert.rejects(readJsonBody(body(['x'.repeat(2048),'x'.repeat(2050)])),e=>e.code===413);
 const server=readFileSync(new URL('../server/src/server.js',import.meta.url),'utf8');
 assert.ok(server.includes('const body=await readJsonBody(req)'));
 assert.ok(server.includes('if(!validStatusPatch(body))'));
 assert.ok(server.includes('return send(res,415'));
});

test('CORS permite exclusivamente orígenes exactos HTTPS o localhost para las pruebas',()=>{
 const origins=parseAllowedOrigins('https://dvolada.example.com,https://dvolada.example.com/,http://localhost:5173,https://nexora.example.com');
 assert.deepEqual(origins,['https://dvolada.example.com','http://localhost:5173','https://nexora.example.com']);
 const allowed=allowedCorsHeaders('https://dvolada.example.com',origins);
 assert.equal(allowed['Access-Control-Allow-Origin'],'https://dvolada.example.com');
 assert.equal(allowed['Access-Control-Allow-Credentials'],'true');
 assert.match(allowed['Access-Control-Allow-Headers'],/Authorization/);
 assert.match(allowed['Access-Control-Allow-Headers'],/Idempotency-Key/);
 assert.equal(allowed.Vary,'Origin');
 for(const bad of ['*','https://attacker.example.com','https://dvolada.example.com.attacker.test',
  'https://dvolada.example.com.evil','null']){
  assert.equal(allowedCorsHeaders(bad,origins),null);
 }
 assert.deepEqual(parseAllowedOrigins('*,https://user:pass@evil.test,http://evil.test,https://evil.test/redirect,'+
  'javascript:alert(1),https://site.test?debug=1'),[]);
});
test('Servidor comprueba origen antes de autenticación y preflight explícito',()=>{
 const src=readFileSync(new URL('../server/src/server.js',import.meta.url),'utf8');
 assert.ok(src.includes('parseAllowedOrigins(process.env.DVOLADA_ALLOWED_ORIGINS)'));
 assert.ok(src.includes('const cors=allowedCorsHeaders(origin,allowedOrigins)'));
 assert.ok(src.includes("return send(res,403,{error:'Origin not allowed'})"));
 assert.ok(src.includes("if(req.method==='OPTIONS')"));
 assert.ok(src.indexOf("if(req.method==='OPTIONS')")<src.indexOf("const identity=await auth(req)"));
 assert.ok(src.includes("res.writeHead(204);res.end();return;"));
 assert.ok(!src.includes("'Access-Control-Allow-Origin':'*'"));
});

test('Rol y membresía SQL son obligatorios; permisos del JWT no autorizan por sí solos',()=>{
 const server=readFileSync(new URL('../server/src/server.js',import.meta.url),'utf8');
 const schema=readFileSync(new URL('../server/sql/002_restaurant_membership.sql',import.meta.url),'utf8');
 assert.match(schema,/CREATE TABLE IF NOT EXISTS restaurant_users/);
 assert.match(schema,/active boolean NOT NULL DEFAULT false/);
 assert.match(schema,/PRIMARY KEY \(restaurant_id,user_id\)/);
 assert.match(server,/FROM restaurant_users u JOIN restaurants r ON r.id=u.restaurant_id/);
 assert.match(server,/u.restaurant_id=\$1 AND u.user_id=\$2 AND u.active=TRUE/);
 assert.ok(server.includes('[payload.restaurant_id,payload.sub]'));
 assert.ok(server.includes('validRestaurantRole(rows[0].role)'));
 assert.ok(server.includes('role:rows[0].role'));
 assert.ok(!server.includes('identity.permissions.includes'));
 assert.ok(!server.includes('payload.permissions.includes'));
});
test('Caja, Cocina y gerentes no pueden saltarse las transiciones de otro rol',()=>{
 for(const role of ['owner','manager','cashier','kitchen'])assert.equal(validRestaurantRole(role),true);
 for(const role of ['customer','courier','admin','',null,undefined])assert.equal(validRestaurantRole(role),false);
 for(const role of ['cashier','owner','manager']){
  assert.equal(restaurantTransitionPermission(role,'Pendiente','Aceptado').ok,true);
  assert.equal(restaurantTransitionPermission(role,'Pendiente','Rechazado').ok,true);
 }
 for(const role of ['kitchen','owner','manager']){
  assert.equal(restaurantTransitionPermission(role,'Aceptado','Preparando').ok,true);
  assert.equal(restaurantTransitionPermission(role,'Preparando','Listo').ok,true);
 }
 assert.equal(restaurantTransitionPermission('kitchen','Pendiente','Aceptado').status,403);
 assert.equal(restaurantTransitionPermission('cashier','Aceptado','Preparando').status,403);
 assert.equal(restaurantTransitionPermission('kitchen','Aceptado','Cancelado').status,403);
 assert.equal(restaurantTransitionPermission('owner','Listo','Entregado').status,422,
  'ningún rol puede inventar una transición no implementada');
 assert.equal(restaurantTransitionPermission('unknown','Pendiente','Aceptado').status,403);
 const server=readFileSync(new URL('../server/src/server.js',import.meta.url),'utf8');
 assert.ok(server.includes('restaurantTransitionPermission(identity.role,current.status,body.status)'));
 assert.ok(server.includes("status=denial.status;response={error:denial.reason}"));
});
test('JWT debe estar firmado, expirar y pertenecer a una persona y negocio válidos',()=>{
 const server=readFileSync(new URL('../server/src/server.js',import.meta.url),'utf8');
 assert.ok(server.includes("algorithms:['HS256']"));
 assert.ok(server.includes("token.length>4096"));
 assert.ok(server.includes("catch{throw Object.assign(Error('Invalid or expired token'),{code:401})}"));
 assert.ok(server.includes('typeof payload.restaurant_id'));
 assert.ok(server.includes('typeof payload.sub'));
 assert.ok(server.includes('Number.isSafeInteger(payload.iat)'));
 assert.ok(server.includes('Number.isSafeInteger(payload.exp)'));
 assert.ok(server.includes('payload.exp-payload.iat>3600'));
 assert.ok(server.includes('server.requestTimeout=15000'));
 assert.ok(server.includes('server.headersTimeout=10000'));
 assert.ok(server.includes("content-security-policy"));
 assert.ok(server.includes("referrer-policy"));
});

test('Limitador local de abuso controla acciones por empleado, restaura cuota y avisa cuándo reintentar',()=>{
 const quota=createActorLimiter({limit:2,windowMs:4000,maxEntries:2});
 assert.deepEqual(quota('resto-A:empleado-A',10000),{allowed:true,retryAfterSeconds:0});
 assert.deepEqual(quota('resto-A:empleado-A',10500),{allowed:true,retryAfterSeconds:0});
 assert.deepEqual(quota('resto-A:empleado-A',11000),{allowed:false,retryAfterSeconds:3});
 assert.equal(quota('resto-B:empleado-A',11000).allowed,true,'el límite no se comparte entre negocios');
 assert.equal(quota('resto-A:empleado-A',14001).allowed,true,'después de la ventana reabre el cupo');
 assert.equal(quota('',15000).allowed,false,'identidad faltante se rechaza');
 const server=readFileSync(new URL('../server/src/server.js',import.meta.url),'utf8');
 assert.ok(server.includes('const checkReadRate=createActorLimiter({limit:600,windowMs:60_000})'));
 assert.ok(server.includes('const checkWriteRate=createActorLimiter({limit:180,windowMs:60_000})'));
 assert.ok(server.includes("identity.restaurantId+':'+identity.userId"));
 assert.ok(server.includes("res.setHeader('Retry-After'"));
 assert.ok(server.includes('return send(res,429,'));
});
test('Limitador nunca permite configuraciones sin capacidad ni cuotas negativas',()=>{
 for(const arg of [{limit:0},{limit:-2},{windowMs:0},{maxEntries:0}])
  assert.throws(()=>createActorLimiter(arg));
 const q=createActorLimiter({limit:1,windowMs:2000,maxEntries:1});
 assert.equal(q('a',10000).allowed,true);
 assert.equal(q('a',10001).allowed,false);
 assert.equal(q('b',10002).allowed,true,'sin crecimiento indefinido del mapa');
 assert.equal(q('a',10003).allowed,true,'una entrada expulsada se reinicia al reaparecer');
});

test('Health público comparte una sola consulta SQL entre 100 solicitudes simultáneas',async()=>{
 let at=10000,calls=0,ok=true;
 const probe=createHealthProbe(async()=>{calls++;if(!ok)throw Error('DB unavailable')},{cacheMs:5000,now:()=>at});
 assert.deepEqual(await Promise.all(Array.from({length:100},()=>probe())),Array(100).fill(true));
 assert.equal(calls,1);
 at=14000;assert.equal(await probe(),true);assert.equal(calls,1);
 at=15000;ok=false;assert.equal(await probe(),false);assert.equal(calls,2);
 at=16000;assert.equal(await probe(),false);assert.equal(calls,2);
 at=20000;ok=true;assert.equal(await probe(),true);assert.equal(calls,3);
 const server=readFileSync(new URL('../server/src/server.js',import.meta.url),'utf8');
 assert.ok(server.includes("const healthReady=createHealthProbe(()=>pool.query('SELECT 1'))"));
 assert.ok(server.includes("const healthy=await healthReady()"));
 assert.ok(server.includes("healthy?200:503"));
});
test('Health rechazará configuraciones inválidas y no ocultará fallos del módulo',async()=>{
 for(const params of [{cacheMs:0},{cacheMs:500.5}])
  assert.throws(()=>createHealthProbe(async()=>true,params));
 assert.throws(()=>createHealthProbe(null));
 const q=createHealthProbe(()=>Promise.reject(new Error('DB down')));
 assert.equal(await q(),false);
});
