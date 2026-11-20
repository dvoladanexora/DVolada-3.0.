/** Pruebas de seguridad con PostgreSQL REAL y API HTTP real.
 * Solo usar contra la BD DESCARTABLE dvolada_security_test del CI.
 * Nunca apuntar a una base de clientes ni usar secretos comerciales.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import {spawn} from 'node:child_process';
import {createServer as createNetServer} from 'node:net';
import {fileURLToPath} from 'node:url';
import {Pool} from 'pg';
import {SignJWT} from 'jose';

const DB=process.env.DVOLADA_TEST_DATABASE_URL;
const SECRET='local-only-never-use-in-real-dvolada-accounts-123456789';
const ISSUER='dvolada-security-integration-test',AUDIENCE='dvolada-online-test';
const root=fileURLToPath(new URL('../',import.meta.url));
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));

async function freePort(){
 const socket=createNetServer();
 await new Promise((resolve,reject)=>socket.once('error',reject).listen(0,'127.0.0.1',resolve));
 const port=socket.address().port;
 await new Promise((resolve,reject)=>socket.close(error=>error?reject(error):resolve()));
 return port;
}
async function sign(restaurantId,userId,{role='cashier',expires='15m'}={}){
 const signed=new SignJWT({restaurant_id:restaurantId,role,permissions:['online:orders:write']})
  .setProtectedHeader({alg:'HS256'})
  .setSubject(userId).setIssuedAt().setExpirationTime(expires)
  .setIssuer(ISSUER).setAudience(AUDIENCE);
 return signed.sign(new TextEncoder().encode(SECRET));
}

test('Seguridad HTTP real y aislamiento de restaurantes con PostgreSQL', {skip:!DB?'Requires isolated CI Postgres':false},async t=>{
 // Esta garantía evita que una configuración accidental toque producción.
 const url=new URL(DB);
 assert.equal(url.pathname,'/dvolada_security_test','La base de integración debe ser exclusivamente descartable');
 assert.ok(['127.0.0.1','localhost'].includes(url.hostname),'El test no puede conectarse a PostgreSQL remoto');
 let pool,child,base='',logs='';
 try{
  pool=new Pool({connectionString:DB,connectionTimeoutMillis:3000,max:8});
  await pool.query('SELECT 1');
  for(const name of ['001_online_core.sql','002_restaurant_membership.sql','003_idempotency_retention.sql']){
   await pool.query(await readFile(new URL('../sql/'+name,import.meta.url),'utf8'));
  }
  const rA=randomUUID(),rB=randomUUID(),cashier=randomUUID(),kitchen=randomUUID(),ownerB=randomUUID(),revoked=randomUUID();
  const orderA=randomUUID(),orderB=randomUUID(),orderC=randomUUID(),orderD=randomUUID();
  await pool.query(
   "INSERT INTO restaurants(id,name,plan,subscription_status) VALUES($1,'Restaurant A','ONLINE','active'),($2,'Restaurant B','PLUS','active')",
   [rA,rB]
  );
  for(const [r,u,role,active] of [
   [rA,cashier,'cashier',true],[rA,kitchen,'kitchen',true],
   [rB,ownerB,'owner',true],[rA,revoked,'manager',false]
  ])await pool.query(
   'INSERT INTO restaurant_users(restaurant_id,user_id,role,active) VALUES($1,$2,$3,$4)',
   [r,u,role,active]
  );
  for(const [id,r,no] of [[orderA,rA,'A-100'],[orderB,rB,'B-100'],[orderC,rA,'A-101'],[orderD,rA,'A-102']])
   await pool.query('INSERT INTO online_orders(id,restaurant_id,order_number,status) VALUES($1,$2,$3,$4)',
    [id,r,no,'Pendiente']);

  const port=await freePort();
  base='http://127.0.0.1:'+port;
  child=spawn(process.execPath,['src/server.js'],{
   cwd:root,env:{...process.env,
    DATABASE_URL:DB,
    DVOLADA_JWT_SECRET:SECRET,DVOLADA_JWT_ISSUER:ISSUER,DVOLADA_JWT_AUDIENCE:AUDIENCE,
    DVOLADA_ALLOWED_ORIGINS:'http://localhost:5173',
    NODE_ENV:'test',DVOLADA_BIND_HOST:'127.0.0.1',PORT:String(port)
   },
   stdio:['ignore','pipe','pipe']
  });
  for(const stream of [child.stdout,child.stderr])stream.on('data',data=>{
   logs=(logs+String(data)).slice(-2500);
  });
  let ready=false;
  for(let i=0;i<80;i++){
   if(child.exitCode!==null)break;
   try{const response=await fetch(base+'/health',{signal:AbortSignal.timeout(350)});
    if(response.ok&&((await response.json()).status==='ok')){ready=true;break}
   }catch{}
   await sleep(100);
  }
  assert.equal(ready,true,'La API no inició con PostgreSQL descartable: '+logs);

  const tokens={
   cashier:await sign(rA,cashier,{role:'owner'}), // el rol declarado en JWT NO es confiable
   kitchen:await sign(rA,kitchen,{role:'owner'}),
   ownerB:await sign(rB,ownerB),
   revoked:await sign(rA,revoked)
  };
  async function call(path,{token=tokens.cashier,method='GET',json,key,origin}={}){
   const headers={};
   if(token)headers.Authorization='Bearer '+token;
   if(json!==undefined)headers['Content-Type']='application/json';
   if(key)headers['Idempotency-Key']=key;
   if(origin)headers.Origin=origin;
   const response=await fetch(base+path,{method,headers,cache:'no-store',
    ...(json===undefined?{}:{body:JSON.stringify(json)})});
   const body=await response.json().catch(()=>null);
   return {status:response.status,body,headers:response.headers};
  }
  const patch=(order,status,version,token,key=randomUUID())=>call(
   '/api/v1/restaurant/orders/'+order+'/status',
   {method:'PATCH',token,key,json:{status,expectedVersion:version}}
  );
  await t.test('Tokens ausentes, falsos y revocados se rechazan',async()=>{
   assert.equal((await call('/api/v1/restaurant/orders',{token:null})).status,401);
   assert.equal((await call('/api/v1/restaurant/orders',{token:'fake.signature'})).status,401);
   assert.equal((await call('/api/v1/restaurant/orders',{token:tokens.revoked})).status,403);
   const expired=await sign(rA,cashier,{expires:'-10s'});
   assert.equal((await call('/api/v1/restaurant/orders',{token:expired})).status,401);
  });
  await t.test('Lecturas, detalles y eventos no filtran datos de otros restaurantes',async()=>{
   const a=await call('/api/v1/restaurant/orders');
   assert.equal(a.status,200);
   assert.ok(a.body.orders.every(order=>order.id!==orderB));
   const b=await call('/api/v1/restaurant/orders',{token:tokens.ownerB});
   assert.equal(b.status,200);
   assert.deepEqual(b.body.orders.map(order=>order.id),[orderB]);
   assert.equal((await call('/api/v1/restaurant/orders/'+orderB)).status,404);
   assert.equal((await call('/api/v1/restaurant/orders/'+orderA,{token:tokens.ownerB})).status,404);
   assert.equal((await call('/api/v1/restaurant/orders/changes',{token:tokens.ownerB})).body.events.length,0);
  });
  await t.test('CORS no autoriza orígenes ajenos ni cookies de autenticación',async()=>{
   assert.equal((await call('/api/v1/restaurant/orders',{origin:'https://evil.example'})).status,403);
   const allowed=await call('/api/v1/restaurant/orders',{origin:'http://localhost:5173'});
   assert.equal(allowed.status,200);
   assert.equal(allowed.headers.get('access-control-allow-origin'),'http://localhost:5173');
   assert.equal(allowed.headers.get('access-control-allow-credentials'),null);
  });
  await t.test('Rol de Cocina no acepta pedidos aunque JWT se declare como owner',async()=>{
   const denied=await patch(orderC,'Aceptado',1,tokens.kitchen);
   assert.equal(denied.status,403);
   assert.equal((await pool.query('SELECT version,status FROM online_orders WHERE id=$1',[orderC])).rows[0].status,'Pendiente');
  });
  await t.test('Caja acepta una vez y reintento idempotente devuelve lo mismo',async()=>{
   const key=randomUUID();
   const first=await patch(orderA,'Aceptado',1,tokens.cashier,key);
   assert.equal(first.status,200,JSON.stringify(first.body));
   assert.equal(first.body.order.version,2);
   const again=await patch(orderA,'Aceptado',1,tokens.cashier,key);
   assert.equal(again.status,200);
   assert.deepEqual(again.body,first.body);
   assert.equal((await pool.query('SELECT count(*)::int AS n FROM online_order_events WHERE order_id=$1',[orderA])).rows[0].n,1);
   assert.equal((await patch(orderA,'Rechazado',1,tokens.cashier,key)).status,409);
   // 422 = salto de estado inválido; 403 = transición válida para otro rol.
   assert.equal((await patch(orderA,'Listo',2,tokens.cashier)).status,422);
   assert.equal((await patch(orderA,'Preparando',2,tokens.cashier)).status,403);
   assert.equal((await patch(orderB,'Aceptado',1,tokens.cashier)).status,404);
  });
  await t.test('Revocación y cambio de rol afectan tokens ya emitidos',async()=>{
   await pool.query('UPDATE restaurant_users SET active=FALSE WHERE restaurant_id=$1 AND user_id=$2',[rA,cashier]);
   assert.equal((await call('/api/v1/restaurant/orders')).status,403);
   await pool.query("UPDATE restaurant_users SET active=TRUE,role='kitchen' WHERE restaurant_id=$1 AND user_id=$2",[rA,cashier]);
   assert.equal((await patch(orderC,'Aceptado',1,tokens.cashier)).status,403);
   await pool.query("UPDATE restaurant_users SET role='cashier' WHERE restaurant_id=$1 AND user_id=$2",[rA,cashier]);
  });
  await t.test('Cambios simultáneos no duplican eventos ni saltan versiones',async()=>{
   const [one,two]=await Promise.all([
    patch(orderC,'Aceptado',1,tokens.cashier),
    patch(orderC,'Rechazado',1,tokens.cashier)
   ]);
   assert.deepEqual([one.status,two.status].sort(),[200,409]);
   const row=(await pool.query('SELECT version,status FROM online_orders WHERE id=$1',[orderC])).rows[0];
   assert.equal(row.version,2);
   assert.ok(['Aceptado','Rechazado'].includes(row.status));
   assert.equal((await pool.query('SELECT count(*)::int AS n FROM online_order_events WHERE order_id=$1',[orderC])).rows[0].n,1);
  });
  await t.test('Cuerpo adulterado no puede escribir precios ni restaurante',async()=>{
   const tampered=await call('/api/v1/restaurant/orders/'+orderD+'/status',{
    method:'PATCH',key:randomUUID(),
    json:{status:'Aceptado',expectedVersion:1,price:0,restaurant_id:rB}
   });
   assert.equal(tampered.status,400);
   const order=(await pool.query('SELECT version,status FROM online_orders WHERE id=$1',[orderD])).rows[0];
   assert.equal(order.version,1);assert.equal(order.status,'Pendiente');
  });
 }finally{
  if(child&&child.exitCode===null){
   child.kill();
   await Promise.race([new Promise(resolve=>child.once('exit',resolve)),sleep(2500)]);
  }
  if(pool)await pool.end();
 }
});
