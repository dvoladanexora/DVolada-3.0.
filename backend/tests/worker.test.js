import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync} from 'node:fs';
import {generateKeyPairSync,randomBytes,randomUUID,verify} from 'node:crypto';
import worker from '../src/index.js';
import {drainQaOrderPush,qaPushAudience} from '../src/qa-order-push.js';
import {hmacHex} from '../src/security.js';
import {exchangeFirebase,verifyFirebaseIdToken} from '../src/firebase-identity.js';

const migrations=['0001_core.sql','0002_checkout_guards.sql','0003_firebase_identity.sql','0004_pickup_delivery_guards.sql','0005_courier_offers.sql','0006_management_audit.sql','0007_customer_phones.sql','0008_phone_required_without_otp.sql','0009_qa_order_push_outbox.sql'].map(file=>
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
  ORDER_CREATION_ENABLED:'true',FIREBASE_PROJECT_ID:'dvolada-test'};
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
  if(role==='customer'&&!membership)DB.db.prepare('UPDATE users SET phone_e164=?,phone_verified_at=? WHERE id=?').run('+50498765432',Math.floor(Date.now()/1000),id);
  tokens[label]={id,token,sessionId};
  return tokens[label];
 }
 await user('customer');
 await user('customer2');
 await user('platformAdmin','platform_admin');
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
  key=randomUUID(),items,deliveryAddress='Barrio El Centro, casa 10',deliveryMethod='delivery',phone='+50498765432'}={}){
  return call('/api/v1/customer/orders',{by,method:'POST',key,body:{
   restaurantId,items:items??[{productId,quantity:1}],deliveryMethod,deliveryAddress,phone
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
 const offered=await f.call('/api/v1/courier/orders/'+a.id+'/offer',{
  by:'courier',method:'POST',key:randomUUID(),body:{action:'accept',expectedVersion:5}
 });
 assert.equal(offered.status,200,JSON.stringify(offered.body));
 let version=6;
 for(const status of ['Recogido','En camino','En ubicación']){
  const step=await f.call('/api/v1/courier/orders/'+a.id+'/status',{
   by:'courier',method:'PATCH',key:randomUUID(),body:{status,expectedVersion:version}
  });
  assert.equal(step.status,200);version++;
  assert.deepEqual((await f.call('/api/v1/admin/overview',{by:'platformAdmin'})).body.orders,{total:3,active:3,delivered:0});
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
 assert.deepEqual((await f.call('/api/v1/admin/overview',{by:'platformAdmin'})).body.orders,{total:3,active:2,delivered:1});
 assert.equal((await assign(c.id)).status,200);
 assert.equal(f.DB.db.prepare('SELECT COUNT(*) AS n FROM online_order_events WHERE order_id=?').get(a.id).n,10);
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

test('database guards reject closed restaurants and products from another tenant',async()=>{
 const f=await fixture();
 f.DB.db.prepare("UPDATE restaurants SET online_state='closed' WHERE id=?").run(f.restaurants[0]);
 const blocked=await f.create();
 assert.equal(blocked.status,409);
 assert.throws(()=>f.DB.db.prepare(`INSERT INTO online_orders
  (id,restaurant_id,customer_id,order_number,delivery_method,delivery_address,
   status,version,subtotal_minor,delivery_fee_minor,total_minor,customer_phone_e164)
   VALUES(?,?,?,?,?,?,?,1,100,0,100,?)`).run(randomUUID(),f.restaurants[0],
  f.tokens.customer.id,randomUUID(),'pickup','','Pendiente','+50498765432'),/RESTAURANT_CLOSED/);
 f.DB.db.prepare("UPDATE restaurants SET online_state='open' WHERE id=?").run(f.restaurants[0]);
 const valid=await f.create();
 assert.equal(valid.status,201);
 assert.throws(()=>f.DB.db.prepare(`INSERT INTO online_order_items(id,order_id,product_id,name_snapshot,
   unit_price_minor,quantity,line_total_minor) VALUES(?,?,?,?,?,1,?)`).run(
   randomUUID(),valid.body.order.id,f.productIds[1],'Otro negocio',10050,10050
 ),/PRODUCT_CHANGED/);
});

test('suspended couriers lose access even with a valid user session',async()=>{
 const f=await fixture();
 f.DB.db.prepare("UPDATE courier_profiles SET active=0 WHERE user_id=?").run(f.tokens.courier.id);
 const denied=await f.call('/api/v1/courier/orders',{by:'courier'});
 assert.equal(denied.status,403);
 assert.equal(denied.body.error,'COURIER_INACTIVE');
});

test('pickup completes in restaurant without a courier or delivery PIN',async()=>{
 const f=await fixture();
 const r=await f.create({deliveryMethod:'pickup'});
 assert.equal(r.status,201);
 assert.equal(r.body.deliveryPin,null);
 const id=r.body.order.id;
 for(const [status,v] of [['Aceptado',1],['Preparando',2],['Listo',3],['Entregado',4]]){
  const next=await f.status(id,'staffA',status,v);
  assert.equal(next.status,200,JSON.stringify(next.body));
 }
 const finished=await f.call('/api/v1/customer/orders/'+id);
 assert.equal(finished.body.order.status,'Entregado');
 assert.equal(finished.body.deliveryPin,null);
});

test('courier-only delivery prevents restaurant from bypassing a delivery PIN',async()=>{
 const f=await fixture();
 const r=await f.create();
 const id=r.body.order.id;
 for(const [status,v] of [['Aceptado',1],['Preparando',2],['Listo',3]]){
  assert.equal((await f.status(id,'staffA',status,v)).status,200);
 }
 const bypass=await f.status(id,'staffA','Entregado',4);
 assert.equal(bypass.status,422);
 assert.equal(f.DB.db.prepare('SELECT status FROM online_orders WHERE id=?').get(id).status,'Listo');
});

test('platform admin analytics require an independent platform role',async()=>{
 const f=await fixture();
 const blocked=await f.call('/api/v1/admin/overview',{by:'customer'});
 assert.equal(blocked.status,403);
 const allowed=await f.call('/api/v1/admin/overview',{by:'platformAdmin'});
 assert.equal(allowed.status,200,JSON.stringify(allowed.body));
 assert.equal(allowed.body.restaurants.total,2);
 const listing=await f.call('/api/v1/admin/restaurants',{by:'platformAdmin'});
 assert.equal(listing.status,200);
 assert.equal(listing.body.restaurants.length,2);
 const couriers=await f.call('/api/v1/restaurant/couriers',{by:'staffA',restaurantId:f.restaurants[0]});
 assert.equal(couriers.status,200);
 assert.equal(couriers.body.couriers.length,1);
});

test('Firebase RS256 token validation rejects altered signature, project and unverified email',async()=>{
 const keys=await crypto.subtle.generateKey({name:'RSASSA-PKCS1-v1_5',modulusLength:2048,
  publicExponent:new Uint8Array([1,0,1]),hash:'SHA-256'},true,['sign','verify']);
 const jwk=await crypto.subtle.exportKey('jwk',keys.publicKey);
 Object.assign(jwk,{kid:'test-kid',alg:'RS256',use:'sig'});
 const now=Math.floor(Date.now()/1000);
 const claims={iss:'https://securetoken.google.com/dvolada-test',aud:'dvolada-test',
  sub:'firebase-uid-123',email:'cliente@example.com',email_verified:true,
  iat:now-10,exp:now+600,auth_time:now-15,firebase:{sign_in_provider:'password'}};
 const sign=async payload=>{
  const encode=x=>Buffer.from(JSON.stringify(x)).toString('base64url');
  const part=encode({alg:'RS256',typ:'JWT',kid:'test-kid'})+'.'+encode(payload);
  const signature=await crypto.subtle.sign('RSASSA-PKCS1-v1_5',keys.privateKey,
   new TextEncoder().encode(part));
  return part+'.'+Buffer.from(signature).toString('base64url');
 };
 const fetchImpl=async()=>({ok:true,json:async()=>({keys:[jwk]})});
 const valid=await sign(claims);
 assert.equal((await verifyFirebaseIdToken(valid,'dvolada-test',{fetchImpl,now})).firebaseUid,claims.sub);
 await assert.rejects(()=>verifyFirebaseIdToken(valid,'other-project',{fetchImpl,now}),/FIREBASE_IDENTITY_UNVERIFIED/);
 await assert.rejects(async()=>verifyFirebaseIdToken(await sign({...claims,email_verified:false}),'dvolada-test',{fetchImpl,now}),/FIREBASE_IDENTITY_UNVERIFIED/);
 await assert.rejects(async()=>verifyFirebaseIdToken(await sign({...claims,exp:now-1}),'dvolada-test',{fetchImpl,now}),/FIREBASE_IDENTITY_UNVERIFIED/);
 const tampered=valid.slice(0,-2)+(valid.endsWith('ab')?'cd':'ab');
 await assert.rejects(()=>verifyFirebaseIdToken(tampered,'dvolada-test',{fetchImpl,now}),/FIREBASE_TOKEN_INVALID/);
});

test('verified identity exchanges for a revocable customer session without role escalation',async()=>{
 const f=await fixture();
 const req=()=>new Request('https://api.example.test/api/v1/auth/exchange',{method:'POST',
  headers:{'Content-Type':'application/json','CF-Connecting-IP':'192.0.2.100'},
  body:JSON.stringify({idToken:'x'.repeat(150),deviceLabel:'Android'})});
 const verify=async()=>({firebaseUid:'uid-verified-001',email:'valid@example.com',
  name:'Cliente real',role:'platform_admin'});
 const r=await exchangeFirebase(req(),f.env,{verify});
 assert.match(r.sessionToken,/^[A-Za-z0-9_-]{43}$/);
 assert.equal(r.role,'customer');
 assert.ok(r.expiresAt>Math.floor(Date.now()/1000));
 const userRow=f.DB.db.prepare('SELECT account_role FROM users WHERE firebase_uid=?').get('uid-verified-001');
 assert.equal(userRow.account_role,'customer');
 const current=await worker.fetch(new Request('https://api.example.test/api/v1/auth/me',
  {headers:{Authorization:'Bearer '+r.sessionToken}}),f.env);
 assert.equal(current.status,200);
 const duplicate=await exchangeFirebase(req(),f.env,{verify});
 assert.equal(duplicate.role,'customer');
 assert.equal(f.DB.db.prepare("SELECT COUNT(*) AS n FROM users WHERE firebase_uid='uid-verified-001'").get().n,1);
 const logout=await worker.fetch(new Request('https://api.example.test/api/v1/auth/logout',{method:'POST',
  headers:{Authorization:'Bearer '+r.sessionToken}}),f.env);
 assert.equal(logout.status,204);
 const after=await worker.fetch(new Request('https://api.example.test/api/v1/auth/me',
  {headers:{Authorization:'Bearer '+r.sessionToken}}),f.env);
 assert.equal(after.status,401);
});

test('Firebase exchange enforces per-source throttle',async()=>{
 const f=await fixture();
 const req=()=>new Request('https://api.example.test/api/v1/auth/exchange',{method:'POST',
  headers:{'Content-Type':'application/json','CF-Connecting-IP':'198.51.100.8'},
  body:JSON.stringify({idToken:'x'.repeat(150)})});
 const verify=async()=>({firebaseUid:'u',email:'valid@example.com',name:'test'});
 for(let i=0;i<10;i++)assert.equal((await exchangeFirebase(req(),f.env,{verify})).role,'customer');
 await assert.rejects(()=>exchangeFirebase(req(),f.env,{verify}),e=>e.status===429);
});

test('independent courier can reject an offer, or accept and prevent unauthorized pickup',async()=>{
 const f=await fixture();
 const createReady=async()=>{
  const result=await f.create();
  const id=result.body.order.id;
  for(const [s,v] of [['Aceptado',1],['Preparando',2],['Listo',3]]){
   assert.equal((await f.status(id,'staffA',s,v)).status,200);
  }
  return id;
 };
 const id=await createReady();
 const assign=async(version,key=randomUUID())=>f.call('/api/v1/restaurant/orders/'+id+'/assign',{
  by:'staffA',restaurantId:f.restaurants[0],method:'PATCH',key,
  body:{courierId:f.tokens.courier.id,expectedVersion:version}
 });
 assert.equal((await assign(4)).status,200);
 const withoutAcceptance=await f.call('/api/v1/courier/orders/'+id+'/status',{
  by:'courier',method:'PATCH',key:randomUUID(),body:{status:'Recogido',expectedVersion:5}
 });
 assert.equal(withoutAcceptance.status,422);
 const rejectKey=randomUUID();
 const reject=()=>f.call('/api/v1/courier/orders/'+id+'/offer',{
  by:'courier',method:'POST',key:rejectKey,body:{action:'reject',expectedVersion:5}
 });
 assert.equal((await reject()).status,200);
 const replay=await reject();assert.equal(replay.status,200);assert.equal(replay.body.replayed,true);
 const current=f.DB.db.prepare('SELECT version,courier_id,courier_response FROM online_orders WHERE id=?').get(id);
 assert.equal(current.version,6);assert.equal(current.courier_id,null);
 assert.equal(current.courier_response,'unassigned');
 assert.equal((await assign(6)).status,200);
 const accepted=await f.call('/api/v1/courier/orders/'+id+'/offer',{
  by:'courier',method:'POST',key:randomUUID(),body:{action:'accept',expectedVersion:7}
 });
 assert.equal(accepted.status,200);
 assert.equal(accepted.body.order.courierResponse,'accepted');
 const pickup=await f.call('/api/v1/courier/orders/'+id+'/status',{
  by:'courier',method:'PATCH',key:randomUUID(),body:{status:'Recogido',expectedVersion:8}
 });
 assert.equal(pickup.status,200,JSON.stringify(pickup.body));
});

test('platform can provision a private restaurant, attach staff, publish a priced menu and receive orders',async()=>{
 const f=await fixture();
 const create=await f.call('/api/v1/admin/restaurants',{by:'platformAdmin',method:'POST',
  body:{name:'Restaurante privado',plan:'ONLINE'}});
 assert.equal(create.status,201,JSON.stringify(create.body));
 const rid=create.body.restaurant.id;
 assert.equal(create.body.restaurant.subscriptionStatus,'inactive');
 const before=await f.call('/api/v1/catalog/restaurants');
 assert.equal(before.body.restaurants.some(r=>r.id===rid),false);
 const blocked=await f.call('/api/v1/admin/restaurants',{by:'customer',method:'POST',
  body:{name:'Suplantación',plan:'ONLINE'}});
 assert.equal(blocked.status,403);
 const act=await f.call('/api/v1/admin/restaurants/'+rid,{by:'platformAdmin',method:'PATCH',
  body:{subscriptionStatus:'active',deliveryFeeMinor:250}});
 assert.equal(act.status,200,JSON.stringify(act.body));
 const member=await f.call('/api/v1/admin/restaurants/'+rid+'/members',{by:'platformAdmin',method:'POST',
  body:{userId:f.tokens.staffA.id,staffRole:'owner'}});
 assert.equal(member.status,200);
 const merchant=await f.call('/api/v1/restaurant/availability',{by:'staffA',method:'PATCH',
  restaurantId:rid,body:{state:'open'}});
 assert.equal(merchant.status,200,JSON.stringify(merchant.body));
 const p=await f.call('/api/v1/restaurant/products',{by:'staffA',method:'POST',
  restaurantId:rid,body:{name:'Baleada de prueba',priceMinor:7750,available:true}});
 assert.equal(p.status,201,JSON.stringify(p.body));
 const productId=p.body.product.id;
 const catalog=await f.call('/api/v1/catalog/restaurants/'+rid+'/products');
 assert.equal(catalog.status,200);assert.equal(catalog.body.products.length,1);
 const order=await f.create({restaurantId:rid,productId});
 assert.equal(order.status,201,JSON.stringify(order.body));
 assert.equal(order.body.order.totalMinor,8000);
 const other=await f.call('/api/v1/restaurant/products/'+productId,{
  by:'staffB',restaurantId:f.restaurants[1],method:'PATCH',body:{priceMinor:1}
 });
 assert.equal(other.status,404);
 const changed=await f.call('/api/v1/restaurant/products/'+productId,{
  by:'staffA',restaurantId:rid,method:'PATCH',body:{available:false}
 });
 assert.equal(changed.status,200);
 const unavailable=await f.create({restaurantId:rid,productId});
 assert.equal(unavailable.status,409);
 const audit=f.DB.db.prepare('SELECT COUNT(*) AS n FROM platform_audit').get();
 assert.ok(audit.n>=3);
 assert.ok(f.DB.db.prepare('SELECT COUNT(*) AS n FROM restaurant_audit WHERE restaurant_id=?').get(rid).n>=3);
});

test('only the platform role can enroll independent verified customers as couriers',async()=>{
 const f=await fixture();
 const notAllowed=await f.call('/api/v1/admin/couriers',{by:'customer',method:'POST',
  body:{userId:f.tokens.customer2.id}});
 assert.equal(notAllowed.status,403);
 const enrolled=await f.call('/api/v1/admin/couriers',{by:'platformAdmin',method:'POST',
  body:{userId:f.tokens.customer2.id}});
 assert.equal(enrolled.status,201,JSON.stringify(enrolled.body));
 assert.equal(f.DB.db.prepare('SELECT account_role FROM users WHERE id=?').get(f.tokens.customer2.id).account_role,'courier');
 const active=f.DB.db.prepare('SELECT active,max_active_orders FROM courier_profiles WHERE user_id=?').get(f.tokens.customer2.id);
 assert.equal(active.active,1);assert.equal(active.max_active_orders,2);
 const denyStaff=await f.call('/api/v1/admin/couriers',{by:'platformAdmin',method:'POST',
  body:{userId:f.tokens.staffA.id}});
 assert.equal(denyStaff.status,409);
});

test('checkout requires a contact phone without claiming OTP verification; anonymous catalogue stays open',async()=>{
 const f=await fixture();
 const catalog=await worker.fetch(new Request('https://api.example.test/api/v1/catalog/restaurants'),f.env);
 assert.equal(catalog.status,200);
 const invalid=await f.create({phone:'98765432'});
 assert.equal(invalid.status,400,JSON.stringify(invalid.body));
 const wrong=await f.create({phone:'+50499990000'});
 assert.equal(wrong.status,201,JSON.stringify(wrong.body));
 f.DB.db.prepare('UPDATE users SET phone_verified_at=NULL WHERE id=?').run(f.tokens.customer.id);
 const unverified=await f.create();
 assert.equal(unverified.status,201,JSON.stringify(unverified.body));
 assert.equal(f.DB.db.prepare('SELECT phone_verified_at FROM users WHERE id=?').get(f.tokens.customer.id).phone_verified_at,null);
 const orders=f.DB.db.prepare('SELECT COUNT(*) AS n FROM online_orders').get();
 assert.equal(orders.n,2);
});

test('QA push identities are signed only for the authenticated account and exact QA origin',async()=>{
 const f=await fixture();
 const {privateKey,publicKey}=generateKeyPairSync('ec',{namedCurve:'prime256v1'});
 const origin='https://dvolada-qa.dvoladanexora.workers.dev';
 Object.assign(f.env,{QA_ONESIGNAL_APP_ID:randomUUID(), QA_ONESIGNAL_ORIGIN:origin,
  QA_ONESIGNAL_SIGNING_KEY:privateKey.export({format:'pem',type:'pkcs8'}),
  QA_ONESIGNAL_IDENTITY_VERIFIED:'true'});
 const issue=(token,host=origin)=>worker.fetch(new Request(host+'/api/v1/push/identity',{
  method:'POST',headers:{...(token?{Authorization:'Bearer '+token}:{}),'Content-Type':'application/json'},
  body:JSON.stringify({externalId:f.tokens.customer2.id})
 }),f.env);
 assert.equal((await issue(null)).status,401);
 assert.equal((await issue(f.tokens.customer.token,'https://dvolada-web-staging.pages.dev')).status,503);
 for(const role of ['customer','customer2','staffA','staffB','courier']){
  const response=await issue(f.tokens[role].token);
  assert.equal(response.status,200);
  assert.match(response.headers.get('cache-control'),/no-store/);
  const {externalId,jwt}=await response.json();
  assert.equal(externalId,'dvolada-qa:'+f.tokens[role].id);
  const [head,payload,signature]=jwt.split('.');
  const claims=JSON.parse(Buffer.from(payload,'base64url'));
  assert.equal(claims.identity.external_id,externalId);
  assert.equal(claims.iss,f.env.QA_ONESIGNAL_APP_ID);
  assert.ok(claims.exp<=Date.now()/1000+300);
  assert.ok(verify('sha256',Buffer.from(head+'.'+payload),{key:publicKey,dsaEncoding:'ieee-p1363'},Buffer.from(signature,'base64url')));
 }
 f.env.QA_ONESIGNAL_IDENTITY_VERIFIED='false';
 assert.equal((await issue(f.tokens.customer.token)).status,503);
});

test('QA outbox targets only the current order parties and deduplicates sends across drains',async()=>{
 const f=await fixture();
 const p=await f.create();
 assert.equal(p.status,201);
 const id=p.body.order.id;
 assert.equal((await f.status(id,'staffA','Aceptado',1)).status,200);
 const offer=await f.call('/api/v1/restaurant/orders/'+id+'/assign',{
  by:'staffA',restaurantId:f.restaurants[0],method:'PATCH',key:randomUUID(),
  body:{courierId:f.tokens.courier.id,expectedVersion:2}
 });
 assert.equal(offer.status,200);
 const jobs=f.DB.db.prepare('SELECT * FROM order_push_outbox ORDER BY event_id').all();
 assert.deepEqual(jobs.map(x=>x.audience),['restaurant','customer','courier']);
 assert.deepEqual((await Promise.all(jobs.map(j=>qaPushAudience(f.DB,j)))).map(x=>x.externalIds),[
  ['dvolada-qa:'+f.tokens.staffA.id],['dvolada-qa:'+f.tokens.customer.id],['dvolada-qa:'+f.tokens.courier.id],
 ]);
 const {privateKey}=generateKeyPairSync('ec',{namedCurve:'prime256v1'});
 const sent=[];
 const fetcher=async(_url,options)=>{
  const request=JSON.parse(options.body);
  assert.equal(request.included_segments,undefined);
  assert.equal(request.include_subscription_ids,undefined);
  assert.equal(request.data.orderId,undefined);
  assert.doesNotMatch(request.contents.es,/DV-/);
  sent.push(request);
  return Response.json({id:'provider-test'});
 };
 await drainQaOrderPush(f.env,fetcher);
 assert.equal(sent.length,0);
 Object.assign(f.env,{
  QA_ORDER_PUSH_ENABLED:'true', QA_ONESIGNAL_REST_API_KEY:'mock-only', QA_ONESIGNAL_APP_ID:randomUUID(),
  QA_ONESIGNAL_ORIGIN:'https://dvolada-qa.dvoladanexora.workers.dev', QA_ONESIGNAL_IDENTITY_VERIFIED:'true',
  QA_ONESIGNAL_SIGNING_KEY:privateKey.export({format:'pem',type:'pkcs8'}),
 });
 await Promise.all([drainQaOrderPush(f.env,fetcher),drainQaOrderPush(f.env,fetcher)]);
 await drainQaOrderPush(f.env,fetcher);
 assert.equal(sent.length,3);
 assert.equal(new Set(sent.map(x=>x.idempotency_key)).size,3);
 assert.deepEqual(new Set(sent.flatMap(x=>x.include_aliases.external_id)),new Set([
  'dvolada-qa:'+f.tokens.staffA.id,'dvolada-qa:'+f.tokens.customer.id,'dvolada-qa:'+f.tokens.courier.id,
 ]));
 assert.equal(f.DB.db.prepare("SELECT count(*) n FROM order_push_outbox WHERE outcome='sent'").get().n,3);
});

test('a rejected or replaced assignment never reaches the former courier',async()=>{
 const f=await fixture();
 const p=await f.create(),id=p.body.order.id;
 assert.equal((await f.status(id,'staffA','Aceptado',1)).status,200);
 assert.equal((await f.call('/api/v1/restaurant/orders/'+id+'/assign',{
  by:'staffA',restaurantId:f.restaurants[0],method:'PATCH',key:randomUUID(),
  body:{courierId:f.tokens.courier.id,expectedVersion:2}
 })).status,200);
 const job=f.DB.db.prepare("SELECT * FROM order_push_outbox WHERE audience='courier'").get();
 assert.equal((await f.call('/api/v1/courier/orders/'+id+'/offer',{
  by:'courier',method:'POST',key:randomUUID(),body:{action:'reject',expectedVersion:3}
 })).status,200);
 assert.equal(await qaPushAudience(f.DB,job),null);
});
