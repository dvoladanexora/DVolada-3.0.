import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync} from 'node:fs';
import {randomBytes,randomUUID} from 'node:crypto';
import worker from '../src/index.js';
import {hmacHex} from '../src/security.js';

const migrations=['0001_core.sql','0002_checkout_guards.sql'].map(file=>
 readFileSync(new URL('../migrations/'+file,import.meta.url),'utf8'));
const PEPPER='test-session-pepper-only-not-production-123456789012345';
const PIN_SECRET='test-pin-secret-only-not-production-987654321098765';

function sqliteD1(){
 const db=new DatabaseSync(':memory:');
 db.exec('PRAGMA foreign_keys = ON;');
 for(const sql of migrations)db.exec(sql);
 function statement(sql,values=[]){
  return {
   bind(...args){return statement(sql,args)},
   async first(){return db.prepare(sql).get(...values)??null},
   async all(){return {results:db.prepare(sql).all(...values)}},
   async run(){const r=db.prepare(sql).run(...values);return {success:true,meta:{changes:Number(r.changes)}}}
  };
 }
 return {
  db,prepare(sql){return statement(sql)},
  async batch(stmts){
   db.exec('BEGIN IMMEDIATE');
   try{const out=[];for(const s of stmts)out.push(await s.run());db.exec('COMMIT');return out}
   catch(e){db.exec('ROLLBACK');throw e}
  }
 };
}
async function fixture(){
 const DB=sqliteD1();
 const env={DB,SESSION_PEPPER:PEPPER,PIN_SECRET,CORS_ORIGINS:'https://dvolada.example,http://localhost:5173',
  ORDER_CREATION_ENABLED:'true'};
 const restaurants=[randomUUID(),randomUUID()];
 for(const [i,id] of restaurants.entries())DB.db.prepare(`INSERT INTO restaurants
 (id,name,plan,subscription_status,online_state,delivery_fee_minor) VALUES(?,?,'ONLINE','active','open',?)`)
  .run(id,'Restaurante '+i,500);
 const tokens={};
 async function user(label,role='customer',membership=null){
  const id=randomUUID(),sessionId=randomUUID(),token=randomBytes(32).toString('base64url');
  DB.db.prepare('INSERT INTO users(id,display_name,account_role) VALUES(?,?,?)').run(id,label,role);
  DB.db.prepare('INSERT INTO auth_sessions(id,user_id,token_hash,expires_at) VALUES(?,?,?,?)')
   .run(sessionId,id,await hmacHex(PEPPER,'session:v1:'+token),Math.floor(Date.now()/1000)+86400);
  if(membership)DB.db.prepare('INSERT INTO restaurant_memberships(restaurant_id,user_id,staff_role) VALUES(?,?,?)')
    .run(membership[0],id,membership[1]);
  tokens[label]={id,token,sessionId};
  return tokens[label];
 }
 await user('customer');
 await user('customer2');
 await user('staffA','customer',[restaurants[0],'manager']);
 await user('staffB','customer',[restaurants[1],'manager']);
 const courier=await user('courier','courier');
 DB.db.prepare('INSERT INTO courier_profiles(user_id,active,max_active_orders) VALUES(?,1,2)').run(courier.id);
 const productIds=[randomUUID(),randomUUID()];
 for(let i=0;i<2;i++)DB.db.prepare(`INSERT INTO products(id,restaurant_id,name,price_minor)
  VALUES(?,?,?,?)`).run(productIds[i],restaurants[i],i?'Sopa':'Baleada',10050);
 async function call(path,{by='customer',method='GET',body,key,restaurantId,origin}={}){
  const headers={'Authorization':'Bearer '+tokens[by].token};
  if(body!==undefined)headers['Content-Type']='application/json';
  if(key)headers['Idempotency-Key']=key;
  if(restaurantId)headers['X-Restaurant-ID']=restaurantId;
  if(origin)headers.Origin=origin;
  const req=new Request('https://api.example.test'+path,{method,headers,
   ...(body===undefined?{}:{body:JSON.stringify(body)})});
  const res=await worker.fetch(req,env);
  let json=null;
  if(res.status!==204)json=await res.json();
  return {status:res.status,body:json,headers:res.headers};
 }
 async function create({by='customer',restaurantId=restaurants[0],productId=productIds[0],
  key=randomUUID(),items,deliveryAddress='Barrio El Centro, casa 10',deliveryMethod='delivery'}={}){
  return call('/api/v1/customer/orders',{by,method:'POST',key,body:{
   restaurantId,items:items??[{productId,quantity:1}],deliveryMethod,deliveryAddress
  }});
 }
 async function status(order,who,newStatus,expectedVersion,restaurantId=restaurants[0],key=randomUUID()){
  return call('/api/v1/restaurant/orders/'+order+'/status',{
   by:who,method:'PATCH',key,restaurantId,body:{status:newStatus,expectedVersion}
  });
 }
 return {DB,env,restaurants,productIds,tokens,user,call,create,status};
}

test('migration enforces status state and tenant foreign-key integrity',async()=>{
 const f=await fixture();
 assert.throws(()=>f.DB.db.prepare('INSERT INTO products(id,restaurant_id,name,price_minor) VALUES(?,?,?,?)')
  .run(randomUUID(),f.restaurants[0],'Invalid price',-1),/CHECK constraint/);
 assert.throws(()=>f.DB.db.prepare('INSERT INTO products(id,restaurant_id,name,price_minor) VALUES(?,?,?,?)')
  .run(randomUUID(),randomUUID(),'Unknown owner',200),/FOREIGN KEY/);
});

test('auth, tenant and CORS fail closed',async()=>{
 const f=await fixture();
 const noToken=await worker.fetch(new Request('https://api.example.test/api/v1/auth/me'),f.env);
 assert.equal(noToken.status,401);
 const a=await f.call('/api/v1/restaurant/orders',{by:'staffB',restaurantId:f.restaurants[0]});
 assert.equal(a.status,403);
 const b=await f.call('/api/v1/auth/me',{origin:'https://attacker.example'});
 assert.equal(b.status,403);
 const c=await f.call('/api/v1/auth/me',{origin:'https://dvolada.example'});
 assert.equal(c.status,200);
 assert.equal(c.headers.get('access-control-allow-origin'),'https://dvolada.example');
 const preflight=await worker.fetch(new Request('https://api.example.test/api/v1/customer/orders',{
  method:'OPTIONS',headers:{origin:'https://dvolada.example'}}),f.env);
 assert.equal(preflight.status,204);
 assert.match(preflight.headers.get('access-control-allow-headers'),/Idempotency-Key/);
});

test('server prices, idempotency, isolation and hidden delivery PIN',async()=>{
 const f=await fixture();
 const key=randomUUID();
 const one=await f.create({key});
 assert.equal(one.status,201);
 assert.equal(one.body.order.subtotalMinor,10050);
 assert.equal(one.body.order.totalMinor,10550);
 assert.match(one.body.deliveryPin,/^[0-9]{6}$/);
 const duplicate=await f.create({key});
 assert.equal(duplicate.status,201);
 assert.equal(duplicate.body.replayed,true);
 assert.equal(duplicate.body.order.id,one.body.order.id);
 const changed=await f.create({key,items:[{productId:f.productIds[0],quantity:2}]});
 assert.equal(changed.status,409);
 const count=f.DB.db.prepare('SELECT COUNT(*) AS n FROM online_orders').get();
 assert.equal(count.n,1);
 const bad=await f.create({items:[{productId:f.productIds[0],quantity:1,price:1}]});
 assert.equal(bad.status,400);
 const user2=await f.call('/api/v1/customer/orders/'+one.body.order.id,{by:'customer2'});
 assert.equal(user2.status,404);
 const staffB=await f.call('/api/v1/restaurant/orders/'+one.body.order.id,{
  by:'staffB',restaurantId:f.restaurants[1]});
 assert.equal(staffB.status,404);
 const staffA=await f.call('/api/v1/restaurant/orders/'+one.body.order.id,{
  by:'staffA',restaurantId:f.restaurants[0]});
 assert.equal(staffA.status,200);
 assert.equal(JSON.stringify(staffA.body).includes(one.body.deliveryPin),false);
 const catalog=await f.call('/api/v1/catalog/restaurants/'+f.restaurants[0]+'/products');
 assert.equal(catalog.status,200);
});

test('atomic versioned restaurant updates, replays, and customer cancellation',async()=>{
 const f=await fixture();
 const r=await f.create();
 const id=r.body.order.id,key=randomUUID();
 const first=await f.status(id,'staffA','Aceptado',1,f.restaurants[0],key);
 assert.equal(first.status,200);
 assert.equal(first.body.order.version,2);
 const replay=await f.status(id,'staffA','Aceptado',1,f.restaurants[0],key);
 assert.equal(replay.status,200);
 assert.equal(replay.body.replayed,true);
 assert.equal((await f.status(id,'staffA','Preparando',1)).status,409);
 assert.equal((await f.status(id,'staffA','Entregado',2)).status,422);
 const customerCannotCancel=await f.call('/api/v1/customer/orders/'+id+'/cancel',{
  method:'POST',key:randomUUID(),body:{expectedVersion:2}});
 assert.equal(customerCannotCancel.status,422);
 assert.equal(f.DB.db.prepare("SELECT COUNT(*) AS n FROM online_order_events WHERE event_kind='status'").get().n,1);
 const other=await f.create();
 const cancelled=await f.call('/api/v1/customer/orders/'+other.body.order.id+'/cancel',{
  method:'POST',key:randomUUID(),body:{expectedVersion:1}});
 assert.equal(cancelled.status,200);
 assert.equal(cancelled.body.order.status,'Cancelado');
});

test('courier assignment, two active orders maximum, PIN verification and completion',async()=>{
 const f=await fixture();
 async function ready(){
  const created=await f.create();
  const id=created.body.order.id;
  assert.equal((await f.status(id,'staffA','Aceptado',1)).status,200);
  assert.equal((await f.status(id,'staffA','Preparando',2)).status,200);
  assert.equal((await f.status(id,'staffA','Listo',3)).status,200);
  return {id,pin:created.body.deliveryPin};
 }
 const a=await ready(),b=await ready(),c=await ready();
 async function assign(id,version=4){
  return f.call('/api/v1/restaurant/orders/'+id+'/assign',{
   by:'staffA',restaurantId:f.restaurants[0],method:'PATCH',key:randomUUID(),
   body:{courierId:f.tokens.courier.id,expectedVersion:version}
  });
 }
 assert.equal((await assign(a.id)).status,200);
 assert.equal((await assign(b.id)).status,200);
 assert.equal((await assign(c.id)).status,409);
 assert.equal((await f.call('/api/v1/courier/orders',{by:'courier'})).body.orders.length,2);
 let version=5;
 for(const status of ['Recogido','En camino','En ubicación']){
  const step=await f.call('/api/v1/courier/orders/'+a.id+'/status',{
   by:'courier',method:'PATCH',key:randomUUID(),body:{status,expectedVersion:version}
  });
  assert.equal(step.status,200);version++;
 }
 const incorrect=await f.call('/api/v1/courier/orders/'+a.id+'/deliver',{
  by:'courier',method:'POST',key:randomUUID(),
  body:{expectedVersion:version,pin:a.pin==='000000'?'000001':'000000'}
 });
 assert.equal(incorrect.status,403);
 assert.equal(f.DB.db.prepare('SELECT pin_attempts AS n FROM online_orders WHERE id=?').get(a.id).n,1);
 const finish=await f.call('/api/v1/courier/orders/'+a.id+'/deliver',{
  by:'courier',method:'POST',key:randomUUID(),body:{expectedVersion:version,pin:a.pin}
 });
 assert.equal(finish.status,200);
 assert.equal(finish.body.order.status,'Entregado');
 assert.equal((await assign(c.id)).status,200);
 assert.equal(f.DB.db.prepare('SELECT COUNT(*) AS n FROM online_order_events WHERE order_id=?').get(a.id).n,9);
});

test('logout revokes only the current session',async()=>{
 const f=await fixture();
 const before=await f.call('/api/v1/auth/me');
 assert.equal(before.status,200);
 const done=await f.call('/api/v1/auth/logout',{method:'POST'});
 assert.equal(done.status,204);
 assert.equal((await f.call('/api/v1/auth/me')).status,401);
});

test('online ordering is disabled by default until approved launch',async()=>{
 const f=await fixture();
 f.env.ORDER_CREATION_ENABLED='false';
 const blocked=await f.create();
 assert.equal(blocked.status,503);
 assert.equal(blocked.body.error,'ORDER_CREATION_DISABLED');
});
