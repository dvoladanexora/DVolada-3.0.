import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync} from 'node:fs';
import {generateKeyPairSync,randomBytes,randomUUID,verify,createHash,sign} from 'node:crypto';
import {isoCBOR} from '@simplewebauthn/server/helpers';
import worker from '../src/index.js';
import {drainQaOrderPush,qaPushAudience} from '../src/qa-order-push.js';
import {hmacHex} from '../src/security.js';
import {exchangeFirebase,verifyFirebaseIdToken} from '../src/firebase-identity.js';

const migrations=['0001_core.sql','0002_checkout_guards.sql','0003_firebase_identity.sql','0004_pickup_delivery_guards.sql','0005_courier_offers.sql','0006_management_audit.sql','0007_customer_phones.sql','0008_phone_required_without_otp.sql','0009_qa_order_push_outbox.sql','0010_checkout_fee_guard.sql','0011_client_workspace.sql','0012_client_checkout_options.sql','0013_client_passwords.sql','0014_flash_campaigns.sql','0015_restaurant_operations.sql','0016_restaurant_commercial.sql','0017_courier_workspace.sql','0018_control_center.sql','0019_client_passkeys.sql','0020_privileged_passkeys.sql'].map(file=>
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
   run(){const r=db.prepare(sql).run(...values);return {success:true,meta:{changes:Number(r.changes)}}}
  };
 }
 return {
  db,prepare(sql){return statement(sql)},
  async batch(stmts){
   db.exec('BEGIN IMMEDIATE');
   try{const out=[];for(const s of stmts)out.push(s.run());db.exec('COMMIT');return out}
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

test('checkout recovery is scoped to the customer and resolves the same confirmed order',async()=>{
 const f=await fixture();
 const key=randomUUID();
 const lookup=(by='customer')=>f.call('/api/v1/customer/orders/checkout',{key,by});
 assert.equal((await lookup()).status,404);
 const created=await f.create({key});
 assert.equal(created.status,201);
 assert.equal((await lookup('customer2')).status,404);
 const recovered=await lookup();
 assert.equal(recovered.body.order.id,created.body.order.id);
 assert.equal(recovered.body.order.items[0].product_id,f.productIds[0]);
 assert.equal((await f.create({key})).body.order.id,created.body.order.id);
 assert.equal(f.DB.db.prepare('SELECT COUNT(*) AS count FROM online_orders').get().count,1);
});

test('stale displayed totals are rejected and a fee change during commit rolls back checkout',async()=>{
 const f=await fixture();
 const body={restaurantId:f.restaurants[0],items:[{productId:f.productIds[0],quantity:1}],
  deliveryMethod:'delivery',deliveryAddress:'Dirección ficticia QA',phone:'+50400000000',expectedTotalMinor:10549};
 const checkout=key=>f.call('/api/v1/customer/orders',{method:'POST',key,body});
 assert.equal((await checkout(randomUUID())).body.error,'CHECKOUT_TOTAL_CHANGED');
 body.expectedTotalMinor=10550;
 const batch=f.DB.batch;
 f.DB.batch=async statements=>{
  f.DB.db.prepare('UPDATE restaurants SET delivery_fee_minor=600 WHERE id=?').run(f.restaurants[0]);
  return batch(statements);
 };
 const rejected=await checkout(randomUUID());
 assert.equal(rejected.status,409);
 assert.equal(rejected.body.error,'CHECKOUT_TOTAL_CHANGED');
 assert.equal(f.DB.db.prepare('SELECT COUNT(*) AS count FROM online_orders').get().count,0);
});

test('global catalog excludes unavailable products and inactive businesses',async()=>{
 const f=await fixture();
 const search=term=>f.call('/api/v1/catalog/search?q='+encodeURIComponent(term));
 assert.deepEqual((await search('bale')).body.products.map(product=>product.id),[f.productIds[0]]);
 f.DB.db.prepare('UPDATE products SET available=0 WHERE id=?').run(f.productIds[0]);
 assert.deepEqual((await search('bale')).body.products,[]);
 f.DB.db.prepare("UPDATE restaurants SET subscription_status='inactive' WHERE id=?").run(f.restaurants[1]);
 assert.deepEqual((await search('sopa')).body.products,[]);
 assert.equal((await search('s')).status,400);
});

test('kitchen preparation is permitted while cancellations and platform audit are restricted',async()=>{
 const f=await fixture();
 await f.user('kitchen','customer',[f.restaurants[0],'kitchen']);
 const {body:{order}}=await f.create();
 assert.equal((await f.status(order.id,'kitchen','Aceptado',1)).status,403);
 assert.equal((await f.status(order.id,'staffA','Aceptado',1)).status,200);
 assert.equal((await f.status(order.id,'kitchen','Cancelado',2)).status,403);
 assert.equal((await f.status(order.id,'kitchen','Preparando',2)).status,200);
 assert.equal((await f.call('/api/v1/admin/audit',{by:'kitchen'})).status,403);
 assert.equal((await f.call('/api/v1/admin/audit',{by:'platformAdmin'})).status,200);
});

test('changing a delivery fee preserves a concurrently updated subscription',async()=>{
 const f=await fixture();
 const id=f.restaurants[0],batch=f.DB.batch;
 f.DB.batch=async statements=>{
  f.DB.db.prepare("UPDATE restaurants SET subscription_status='inactive' WHERE id=?").run(id);
  return batch(statements);
 };
 const response=await f.call('/api/v1/admin/restaurants/'+id,{
  by:'platformAdmin',method:'PATCH',body:{deliveryFeeMinor:950},
 });
 assert.equal(response.status,200);
 assert.equal(response.body.restaurant.delivery_fee_minor,950);
 assert.equal(response.body.restaurant.subscription_status,'inactive');
 assert.equal(response.body.restaurant.online_state,'closed');
});

test('favorites are private and support follows the customer and authorised order participants',async()=>{
 const f=await fixture();
 const id=f.restaurants[0];
 let result=await f.call('/api/v1/customer/favorites/'+id,{method:'PATCH',body:{favorite:true}});
 assert.equal(result.body.favorite,true);
 assert.deepEqual((await f.call('/api/v1/customer/favorites')).body.ids,[id]);
 assert.deepEqual((await f.call('/api/v1/customer/favorites',{by:'customer2'})).body.ids,[]);
 const order=(await f.create()).body.order;
 const endpoint='/api/v1/orders/'+order.id;
 const chat=endpoint+'/chat/restaurant';
 const key=randomUUID(),body={message:'Consulta ficticia de QA'};
 assert.equal((await f.call(chat,{method:'POST',key,body})).status,200);
 assert.equal((await f.call(chat,{method:'POST',key,body})).body.messages.length,1);
 assert.equal((await f.call(chat,{by:'customer2'})).status,404);
 assert.equal((await f.call(chat,{by:'staffB'})).status,404);
 assert.equal((await f.call(chat,{by:'staffA'})).body.messages[0].body,body.message);
 assert.equal((await f.call(endpoint+'/chat/courier')).status,404);
 assert.equal((await f.status(order.id,'staffA','Aceptado',1)).status,200);
 assert.equal((await f.call('/api/v1/restaurant/orders/'+order.id+'/assign',{by:'staffA',method:'PATCH',restaurantId:id,key:randomUUID(),body:{courierId:f.tokens.courier.id,expectedVersion:2}})).status,200);
 assert.equal((await f.call(endpoint+'/chat/courier',{by:'courier'})).status,404);
 const acceptance=await f.call('/api/v1/courier/orders/'+order.id+'/offer',{by:'courier',method:'POST',key:randomUUID(),body:{action:'accept',expectedVersion:3}});
 assert.equal(acceptance.status,200);
 assert.equal((await f.call(endpoint+'/chat/courier',{by:'courier',method:'POST',key:randomUUID(),body})).status,200);
 assert.equal((await f.call(endpoint+'/chat/courier')).body.messages[0].body,body.message);
 assert.equal((await f.call(endpoint+'/chat/courier',{by:'staffA'})).status,404);
 const claim=endpoint+'/claim';
 const input={category:'pedido',message:'Detalle ficticio de QA'};
 assert.equal((await f.call(claim,{method:'POST',body:input})).body.claim.status,'open');
 assert.equal((await f.call(claim,{method:'POST',body:input})).status,200);
 assert.equal((await f.call(claim,{by:'customer2'})).status,404);
 assert.equal((await f.call(claim,{method:'PATCH',body:{status:'review'}})).status,403);
 assert.equal((await f.call(claim,{by:'platformAdmin',method:'PATCH',body:{status:'resolved',resolution:'Resolución ficticia'}})).body.claim.status,'resolved');
 assert.equal((await f.call(claim)).body.claim.status,'resolved');
});

test('checkout snapshots variants and extras and applies one scoped coupon per customer',async()=>{
 const f=await fixture();
 const [restaurantId,wrongRestaurant]=f.restaurants;
 const [productId,otherProduct]=f.productIds;
 const extra=randomUUID(),variant=randomUUID(),wrongExtra=randomUUID();
 const option=f.DB.db.prepare('INSERT INTO product_options(id,product_id,name,kind,price_minor) VALUES(?,?,?,?,?)');
 option.run(extra,productId,'Extra QA','extra',500);
 option.run(variant,productId,'Presentación QA','variant',750);
 option.run(wrongExtra,otherProduct,'Ajeno QA','extra',2);
 f.DB.db.prepare("INSERT INTO client_coupons(code,restaurant_id,discount_minor,starts_at,ends_at) VALUES(?,?,?,unixepoch()-10,unixepoch()+3600)").run('QA-TEST',restaurantId,1000);
 f.DB.db.prepare("INSERT INTO client_coupons(code,restaurant_id,discount_minor,starts_at,ends_at) VALUES(?,?,?,unixepoch()-20,unixepoch()-10)").run('QA-OLD',restaurantId,1000);
 const coupon=(restaurantId,coupon)=>f.call('/api/v1/customer/coupon',{method:'POST',body:{restaurantId,coupon}});
 assert.equal((await coupon(wrongRestaurant,'QA-TEST')).status,409);
 assert.equal((await coupon(restaurantId,'QA-OLD')).status,409);
 assert.equal((await coupon(restaurantId,'qa-test')).body.discountMinor,1000);
 const menu=await f.call('/api/v1/catalog/restaurants/'+restaurantId+'/products');
 assert.equal(menu.body.products[0].options.length,2);
 const checkout={restaurantId,items:[{productId,quantity:2,optionIds:[extra,variant]}],
  deliveryMethod:'pickup',phone:'+50400000003',coupon:'QA-TEST',expectedTotalMinor:21600};
 const send=(key,body=checkout)=>f.call('/api/v1/customer/orders',{method:'POST',key,body});
 assert.equal((await send(randomUUID(),{...checkout,items:[{productId,quantity:2,optionIds:[wrongExtra]}]})).status,409);
 assert.equal((await send(randomUUID(),{...checkout,expectedTotalMinor:1})).body.error,'CHECKOUT_TOTAL_CHANGED');
 const key=randomUUID(),created=await send(key);
 assert.equal(created.status,201);
 assert.equal(created.body.order.discountMinor,1000);
 assert.equal(created.body.order.totalMinor,21600);
 const repeat=await send(key);
 assert.equal(repeat.body.order.totalMinor,21600);
 assert.equal(repeat.body.order.id,created.body.order.id);
 assert.equal((await send(randomUUID())).body.error,'COUPON_UNAVAILABLE');
 const receipt=await f.call('/api/v1/customer/orders/'+created.body.order.id);
 assert.equal(receipt.body.order.totalMinor,21600);
 assert.equal(receipt.body.order.items[0].line_total_minor,22600);
 assert.equal(JSON.parse(receipt.body.order.items[0].options_json).length,2);
});

test('changing an extra price between quote and write rejects the full order batch',async()=>{
 const f=await fixture();
 const [restaurantId]=f.restaurants,[productId]=f.productIds,extra=randomUUID();
 f.DB.db.prepare('INSERT INTO product_options(id,product_id,name,kind,price_minor) VALUES(?,?,?,?,?)').run(extra,productId,'Extra QA','extra',500);
 const write=f.DB.batch;
 f.DB.batch=async statements=>{
  f.DB.db.prepare('UPDATE product_options SET price_minor=700 WHERE id=?').run(extra);
  return write(statements);
 };
 const created=await f.create({restaurantId,items:[{productId,quantity:1,optionIds:[extra]}]});
 assert.equal(created.body.error,'PRODUCT_UNAVAILABLE');
 assert.equal(f.DB.db.prepare('SELECT COUNT(*) AS count FROM online_orders').get().count,0);
});

test('Flash checkout enforces access, time, eligible product and limits, and releases canceled reservations',async()=>{
 const f=await fixture();
 f.env.QA_FLASH='true';
 const [restaurantId,otherRestaurant]=f.restaurants,[productId,otherProduct]=f.productIds;
 const now=Math.floor(Date.now()/1000);
 const config={restaurantId,productId,title:'Flash prueba',discountMinor:500,startsAt:now-100,endsAt:now+300,
  perCustomer:1,globalLimit:1};
 const create=(body,by='platformAdmin')=>f.call('/api/v1/admin/flash',{method:'POST',by,body});
 assert.equal((await create(config,'customer')).status,403);
 assert.equal((await create({...config,giftProductId:otherProduct,discountMinor:0})).status,400);
 const discount=await create(config);
 assert.equal(discount.status,201);
 const flashId=discount.body.id;
 const future=await create({...config,title:'Futura',startsAt:now+100,endsAt:now+300});
 assert.equal(future.status,201);
 assert.deepEqual((await f.call('/api/v1/catalog/flash')).body.campaigns.map(x=>x.id),[flashId]);
 const send=(by='customer',pick=flashId,body={},key=randomUUID())=>f.call('/api/v1/customer/orders',{
  method:'POST',by,key,body:{restaurantId,items:[{productId,quantity:1}],deliveryMethod:'pickup',phone:'+50400000003',flashId:pick,...body}
 });
 assert.equal((await send('customer',flashId,{coupon:'QA123'})).body.error,'PROMOTIONS_EXCLUSIVE');
 assert.equal((await send('customer',flashId,{restaurantId:otherRestaurant,items:[{productId:otherProduct,quantity:1}]})).status,409);
 assert.equal((await send('customer',future.body.id)).status,409);
 assert.equal((await send('customer',flashId,{expectedTotalMinor:1})).status,409);
 assert.equal(f.DB.db.prepare('SELECT COUNT(*) AS n FROM online_orders WHERE flash_id=?').get(flashId).n,0);
 const key=randomUUID(),placed=await send('customer',flashId,{expectedTotalMinor:9550},key);
 assert.equal(placed.status,201);
 assert.equal(placed.body.order.totalMinor,9550);
 assert.equal((await send('customer',flashId,{expectedTotalMinor:9550},key)).body.order.id,placed.body.order.id);
 assert.equal((await send('customer2')).body.error,'FLASH_UNAVAILABLE');
 assert.deepEqual((await f.call('/api/v1/customer/flash')).body.campaigns,[]);
 const cancel=await f.call('/api/v1/customer/orders/'+placed.body.order.id+'/cancel',{
  method:'POST',body:{expectedVersion:1},key:randomUUID()});
 assert.equal(cancel.status,200);
 assert.equal((await send('customer2')).status,201);
 const gift=await create({...config,title:'Regalo',discountMinor:0,giftProductId:productId});
 assert.equal(gift.status,201);
 const gifted=await send('customer',gift.body.id);
 assert.equal(gifted.status,201);
 assert.equal(gifted.body.order.discountMinor,0);
 assert.equal(gifted.body.order.flashGiftName,'Baleada');
 assert.equal((await f.call('/api/v1/customer/orders/'+gifted.body.order.id)).body.order.flashGiftName,'Baleada');
 assert.equal((await f.call('/api/v1/admin/flash/'+gift.body.id,{by:'platformAdmin',method:'PATCH'})).status,200);
 assert.equal((await send('customer2',gift.body.id)).status,409);
});

test('restaurant settings, menu options, photos and staffing stay within the tenant',async()=>{
 const f=await fixture(),[rid,other]=f.restaurants,[pid,otherProduct]=f.productIds;
 const owner=await f.user('ownerA','customer',[rid,'owner']);
 const kitchen=await f.user('kitchenA','customer',[rid,'kitchen']);
 const workerName='kitchenA';
 const ops=(path,method='GET',body,by='staffA',restaurantId=rid)=>
  f.call('/api/v1/restaurant/'+path,{method,body,by,restaurantId});
 const profile={description:'Menú de pruebas',address:'Dirección ficticia',latitude:14.1,longitude:-88.0,
  hours:[['08:00','18:00'],null,null,null,null,null,null],paymentMethods:['cash','transfer']};
 assert.equal((await ops('profile','PATCH',profile,workerName)).status,403);
 assert.equal((await ops('profile','PATCH',profile,'staffA',other)).status,403);
 assert.equal((await ops('profile','PATCH',profile)).status,200);
 assert.deepEqual((await ops('profile')).body.profile,profile);
 const publicMenu=await f.call('/api/v1/catalog/restaurants/'+rid+'/products');
 assert.equal(publicMenu.body.restaurant.address,profile.address);
 assert.equal((await ops('products','GET',undefined,workerName)).status,403);
 assert.equal((await ops('products/'+pid,'PATCH',{category:'Bebidas'})).status,200);
 const option={name:'Extra ficticio',kind:'extra',priceMinor:300,available:true};
 assert.equal((await ops('products/'+otherProduct+'/options','POST',option)).status,404);
 const extra=await ops('products/'+pid+'/options','POST',option);
 assert.equal(extra.status,200);
 assert.equal((await ops('products/'+pid+'/options/'+extra.body.id,'PATCH',{...option,available:false})).status,200);
 assert.equal((await ops('products/'+pid+'/photo','POST',{base64:btoa('<svg>test</svg>')})).status,400);
 const image='iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aQ/cAAAAASUVORK5CYII=';
 const photo=await ops('products/'+pid+'/photo','POST',{base64:image});
 assert.equal(photo.status,200);
 const res=await worker.fetch(new Request('https://api.example.test'+photo.body.photoUrl),f.env);
 assert.equal(res.status,200);
 assert.equal(res.headers.get('content-type'),'image/png');
 assert.equal(Buffer.from(await res.arrayBuffer()).toString('base64'),image);
 const refreshed=(await f.call('/api/v1/catalog/restaurants/'+rid+'/products')).body.products.find(item=>item.id===pid);
 assert.equal(refreshed.photoUrl,photo.body.photoUrl);
 assert.equal(refreshed.category,'Bebidas');

 assert.equal((await ops('staff','PATCH',{userId:kitchen.id,role:'cashier',active:true})).status,403);
 assert.equal((await ops('staff','PATCH',{userId:owner.id,role:'cashier',active:true},'ownerA')).status,400);
 assert.equal((await ops('staff','PATCH',{userId:kitchen.id,role:'cashier',active:true},'ownerA')).status,200);
 assert.equal((await ops('staff','PATCH',{userId:kitchen.id,role:'cashier',active:false},'ownerA')).status,200);
 assert.equal((await ops('orders','GET',undefined,workerName)).status,403);
});

test('cash closes against recorded sales, preserves discounts and isolates orders and staff',async()=>{
 const f=await fixture(),[rid,other]=f.restaurants;
 await f.user('cashierA','customer',[rid,'cashier']);
 await f.user('kitchenA','customer',[rid,'kitchen']);
 const ops=(path,body,by='cashierA',restaurantId=rid,key=randomUUID())=>
  f.call('/api/v1/restaurant/'+path,{method:body?'POST':'GET',body,key,by,restaurantId});
 const openKey=randomUUID();
 const start=await ops('cash/open',{openingMinor:1000},'cashierA',rid,openKey);
 assert.equal(start.status,200);
 const shiftId=start.body.shift.id;
 assert.equal((await ops('cash/open',{openingMinor:1000},'cashierA',rid,openKey)).body.shift.id,shiftId);
 assert.equal((await ops('cash/open',{openingMinor:1000})).status,409);
 assert.equal((await ops('cash/open',{openingMinor:1000},'kitchenA')).status,403);
 const [productId]=f.productIds;
 const order=(await f.call('/api/v1/customer/orders',{method:'POST',key:randomUUID(),body:{restaurantId:rid,items:[{productId,quantity:1}],
  deliveryMethod:'pickup',phone:'+50400000003',note:'Sin hielo, prueba QA'}})).body.order;
 assert.equal((await ops('orders/'+order.id,undefined,'kitchenA')).status,404);
 const charge={shiftId,orderId:order.id,method:'cash'};
 assert.equal((await ops('cash/sale',charge)).status,409);
 assert.equal((await f.status(order.id,'staffA','Aceptado',1)).status,200);
 const ticket=(await ops('orders/'+order.id,undefined,'kitchenA')).body.order;
 assert.equal(ticket.note,'Sin hielo, prueba QA');
 assert.equal(ticket.deliveryAddress,undefined);
 assert.equal(ticket.totalMinor,undefined);
 assert.equal((await f.status(order.id,'kitchenA','Preparando',2)).status,200);
 assert.equal((await f.status(order.id,'kitchenA','Listo',3)).status,200);
 assert.equal((await f.status(order.id,'staffA','Entregado',4)).status,200);
 assert.equal((await ops('cash/sale',charge,'staffB',other)).status,409);
 assert.equal((await ops('cash/sale',{...charge,method:'transfer'})).status,409);
 const first=await ops('cash/sale',charge);
 assert.equal(first.status,200);
 assert.equal(first.body.sale.total_minor,10050);
 assert.equal((await ops('cash/sale',charge)).body.sale.order_id,order.id);
 const closeKey=randomUUID(),close={shiftId,countedMinor:11050};
 assert.equal((await ops('cash/close',close,'cashierA',rid,closeKey)).body.shift.expected_cash_minor,11050);
 assert.equal((await ops('cash/close',close,'cashierA',rid,closeKey)).status,200);
 assert.equal((await ops('cash/close',close)).status,409);
 const now=Math.floor(Date.now()/1000);
 const report=await ops('report?from='+(now-120)+'&until='+(now+120));
 assert.equal(report.body.totals[0].orders,1);
 assert.equal(report.body.sales[0].total_minor,10050);
 assert.equal((await ops('report?from='+(now-120)+'&until='+(now+120),undefined,'staffB',other)).body.sales.length,0);
 assert.equal((await ops('cash')).body.history[0].id,shiftId);
});

test('owner issues one scoped staff credential and can revoke, disable, reset and audit it',async()=>{
 const f=await fixture(),[rid,other]=f.restaurants;
 const origin='https://dvolada-qa.dvoladanexora.workers.dev';
 Object.assign(f.env,{CORS_ORIGINS:origin,QA_CLIENT_ACCESS:'true',QA_RESTAURANT_COMMERCIAL:'true'});
 await f.user('ownerA','customer',[rid,'owner']);
 await f.user('ownerB','customer',[other,'owner']);
 const staff=(suffix,body,by='ownerA',restaurantId=rid,key=randomUUID())=>f.call('/api/v1/restaurant/staff-access'+suffix,
  {by,restaurantId,method:body?'POST':'GET',body,key});
 const request=async(path,{cookie,account,restaurantId=rid,body}={})=>{
  const headers={Origin:origin,'X-Restaurant-ID':restaurantId};
  if(body)headers['Content-Type']='application/json';
  if(cookie)headers.Cookie=cookie;
  if(account)headers['X-Client-Account']=account;
  return worker.fetch(new Request(origin+'/api/v1/'+path,{headers,method:body?'POST':'GET',body:body&&JSON.stringify(body)}),f.env);
 };
 const auth=(action,code)=>request('auth/staff/'+action,{body:{code}});
 assert.equal((await staff('',{displayName:'Acceso QA',role:'platform_admin'})).status,400);
 assert.equal((await staff('',{displayName:'Acceso QA',role:'kitchen'},'staffA')).status,403);
 const pending=await staff('',{displayName:'Acceso QA',role:'kitchen'});
 assert.equal(pending.status,200);
 const {userId,invitation}=pending.body;
 const roster=await staff('');
 assert.equal(roster.body.staff[0].active,0);
 assert.ok(!JSON.stringify(roster.body).includes(invitation));
 assert.equal((await staff('/'+userId+'/reset',{},'ownerB',other)).status,404);
 assert.equal((await f.call('/api/v1/restaurant/staff',{by:'ownerB',restaurantId:other,method:'PATCH',
  body:{userId,role:'manager',active:true}})).status,409);
 const claims=await Promise.all([auth('claim',invitation),auth('claim',invitation)]);
 assert.deepEqual(claims.map(claim=>claim.status).sort(),[200,401]);
 const redeemed=claims.find(claim=>claim.status===200);
 const {credential}=await redeemed.json();
 assert.notEqual(credential,invitation);
 const cookie=redeemed.headers.get('set-cookie').split(';')[0],account=userId;
 assert.match(redeemed.headers.get('set-cookie'),/Secure; HttpOnly; SameSite=Strict/);
 const me=await request('auth/me',{cookie}).then(x=>x.json());
 assert.deepEqual(me.restaurants.map(x=>[x.restaurant_id,x.staff_role]),[[rid,'kitchen']]);
 assert.equal((await request('restaurant/orders',{cookie,account})).status,200);
 assert.equal((await request('restaurant/orders',{cookie,account,restaurantId:other})).status,403);
 assert.equal((await request('restaurant/profile',{cookie,account})).status,403);
 assert.equal((await request('customer/orders',{cookie,account})).status,403);
 assert.equal((await request('admin/overview',{cookie,account})).status,403);
 assert.equal((await staff('/'+userId+'/revoke',{})).status,200);
 assert.equal((await request('auth/me',{cookie})).status,401);
 assert.equal((await auth('login',credential)).status,204);
 assert.equal((await staff('/'+userId+'/role',{role:'cashier'})).status,200);
 const cashier=(await auth('login',credential)).headers.get('set-cookie').split(';')[0];
 assert.equal((await request('restaurant/cash',{cookie:cashier,account})).status,200);
 assert.equal((await staff('/'+userId+'/state',{active:false})).status,200);
 assert.equal((await request('auth/me',{cookie:cashier})).status,401);
 assert.equal((await auth('login',credential)).status,401);
 assert.equal((await staff('/'+userId+'/state',{active:true})).status,200);
 assert.equal((await auth('login',credential)).status,204);
 const reset=await staff('/'+userId+'/reset',{});
 assert.equal(reset.status,200);
 assert.equal((await auth('login',credential)).status,401);
 assert.equal((await auth('claim',reset.body.invitation)).status,200);
 const events=(await staff('')).body.history.map(x=>x.action);
 assert.deepEqual(new Set(events),new Set(['staff_invited','staff_claimed','staff_revoked','staff_role_changed','staff_disabled','staff_enabled','staff_reset']));
 assert.deepEqual((await staff('',undefined,'ownerB',other)).body.staff,[]);
});

test('settlements reconcile cash and transfer, apply historical rules, serialize retries and audit refunds',async()=>{
 const f=await fixture(),[rid,other]=f.restaurants,[productId]=f.productIds;
 f.env.QA_RESTAURANT_COMMERCIAL='true';
 await f.user('cashierA','customer',[rid,'cashier']);
 const api=(path,body,{by='staffA',restaurantId=rid,key=randomUUID(),method=body?'POST':'GET'}={})=>
  f.call('/api/v1/'+path,{by,restaurantId,method,body,key});
 const ops=(path,body,options)=>api('restaurant/'+path,body,options);
 const central=(suffix,body,restaurant=rid)=>api('admin/settlements/'+restaurant+suffix,body,{by:'platformAdmin'});
 assert.equal((await ops('profile',{description:'QA',address:'QA',latitude:null,longitude:null,hours:Array(7).fill(null),paymentMethods:['cash','transfer']},{method:'PATCH'})).status,200);
 const shift=(await ops('cash/open',{openingMinor:1000})).body.shift.id;
 const give=async(by,method,deliveryMethod)=>{
  const created=(await f.create({by,deliveryMethod})).body;
  const order=created.order;
  for(const [index,status] of ['Aceptado','Preparando','Listo'].entries())
   assert.equal((await f.status(order.id,'staffA',status,index+1)).status,200);
  if(deliveryMethod==='delivery'){
   assert.equal((await ops('orders/'+order.id+'/assign',{courierId:f.tokens.courier.id,expectedVersion:4},{method:'PATCH'})).status,200);
   const courier=(action,body,method)=>api('courier/orders/'+order.id+'/'+action,body,{by:'courier',method});
   assert.equal((await courier('offer',{action:'accept',expectedVersion:5})).status,200);
   for(const [index,status] of ['Recogido','En camino','En ubicación'].entries())
    assert.equal((await courier('status',{status,expectedVersion:6+index},'PATCH')).status,200);
   assert.equal((await courier('deliver',{expectedVersion:9,pin:created.deliveryPin})).status,200);
  }else assert.equal((await f.status(order.id,'staffA','Entregado',4)).status,200);
  assert.equal((await ops('cash/sale',{shiftId:shift,orderId:order.id,method})).body.sale.total_minor,deliveryMethod==='delivery'?10550:10050);
  return order.id;
 };
 const cash=await give('customer','cash','pickup'), transfer=await give('customer2','transfer','delivery');
 const canceled=(await f.create({deliveryMethod:'pickup',items:[{productId,quantity:1}]})).body.order;
 assert.equal((await api('customer/orders/'+canceled.id+'/cancel',{expectedVersion:1},{by:'customer'})).status,200);
 assert.equal((await ops('cash/sale',{shiftId:shift,orderId:canceled.id,method:'cash'})).status,409);
 const effectiveAt=Math.floor(Date.now()/1000)+2;
 const courierRule=(await api('admin/control/courier-rules',{restaurantId:rid,courierId:f.tokens.courier.id,
  effectiveAt,courierBps:6000},{by:'platformAdmin'})).body.id;
 assert.ok(courierRule);
 await new Promise(resolve=>setTimeout(resolve,(effectiveAt+1)*1000-Date.now()+100));
 const at=Math.floor(Date.now()/1000);
 f.DB.db.prepare('UPDATE restaurant_sales SET paid_at=? WHERE order_id IN (?,?)').run(effectiveAt,cash,transfer);
 const interval={from:at-120,until:at};
 const retry=await Promise.all([ops('settlements',interval),ops('settlements',interval)]);
 const id=retry[0].body.settlement.id;
 assert.equal(retry[1].body.settlement.id,id);
 assert.equal((await ops('settlements',{from:at-150,until:at-15})).body.error,'SETTLEMENT_OVERLAP');
 assert.equal((await ops('settlements/'+id+'/calculate',{})).body.error,'SETTLEMENT_SHIFT_OPEN');
 assert.equal((await ops('cash/close',{shiftId:shift,countedMinor:11050})).body.shift.expected_cash_minor,11050);
 assert.equal((await ops('settlements/'+id+'/calculate',{})).body.error,'SETTLEMENT_RULE_MISSING');
 assert.equal((await ops('settlements/'+id)).body.settlement.status,'pending');
 const path='admin/settlement-rules/'+rid;
 const rule={effectiveAt:at-100,commissionBps:500,courierBps:8000};
 assert.equal((await api(path,rule)).status,403);
 assert.equal((await api(path,rule,{by:'platformAdmin'})).status,200);
 assert.equal((await api(path,{...rule,effectiveAt:at+30,commissionBps:900},{by:'platformAdmin'})).status,200);
 const results=await Promise.all([ops('settlements/'+id+'/calculate',{}),central('/'+id+'/calculate',{})]);
 assert.deepEqual(results.map(row=>row.body.settlement.status),['calculated','calculated']);
 const ledger=(await ops('settlements/'+id)).body;
 assert.deepEqual(ledger.byMethod.map(x=>[x.method,x.total_minor]),[['cash',10050],['transfer',10550]]);
 assert.equal(ledger.lines.length,2);
 assert.equal(ledger.lines.find(line=>line.order_id===transfer).courier_rule_id,courierRule);
 assert.deepEqual(ledger.lines.map(x=>x.commission_minor),[503,503]);
 assert.equal(ledger.shifts[0].expected_cash_minor,11050);
 assert.equal(ledger.shifts[0].counted_minor,11050);
 assert.deepEqual(ledger.split,{restaurant_minor:19094,courier_minor:300,dvolada_minor:1206});
 assert.equal((await ops('settlements/'+id,undefined,{by:'cashierA'})).status,403);
 assert.equal((await ops('settlements/'+id,undefined,{by:'staffB',restaurantId:other})).status,404);
 assert.equal((await api('admin/settlements/'+rid+'/'+id+'/approve',{})).status,403);
 const body={orderId:cash,kind:'refund',reason:'Devolución ficticia',restaurantMinor:-250,courierMinor:0,dvoladaMinor:-25};
 const key=randomUUID();
 const ref=()=>api('admin/settlements/'+rid+'/'+id+'/adjust',body,{by:'platformAdmin',key});
 const refunds=await Promise.all([ref(),ref()]);
 assert.deepEqual(refunds.map(result=>result.status),[200,200]);
 assert.equal((await central('/'+id)).body.adjustments.length,1);
 const adjust={...body,kind:'adjustment',reason:'Ajuste de conciliación',restaurantMinor:30,dvoladaMinor:-30};
 assert.equal((await central('/'+id+'/adjust',adjust)).status,200);
 assert.equal((await central('/'+id+'/adjust',{...body,restaurantMinor:-90000})).status,409);
 assert.equal((await central('/'+id+'/approve',{})).body.settlement.status,'approved');
 assert.equal((await central('/'+id+'/adjust',adjust)).status,409);
 assert.equal((await central('/'+id+'/markPaid',{reference:'REGISTRO QA'})).body.settlement.status,'paid');
 assert.equal((await central('/'+id+'/markPaid',{reference:'REEMPLAZO QA'})).status,409);
 assert.deepEqual((await central('/'+id)).body.split,{restaurant_minor:18874,courier_minor:300,dvolada_minor:1151});
 const courier=(await api('courier/history',undefined,{by:'courier'})).body;
 assert.deepEqual(courier.orders.map(o=>[o.id,o.earningsMinor,o.settlementStatus]),[[transfer,300,'paid']]);
 assert.deepEqual(courier.periods.map(p=>[p.id,p.earningsMinor,p.adjustmentMinor]),[[id,300,0]]);
 assert.equal(courier.orders[0].restaurantMinor,undefined);
});

test('QA courier application, platform validation and global session revocation',async()=>{
 const f=await fixture();
 const origin='https://dvolada-qa.dvoladanexora.workers.dev';
 Object.assign(f.env,{CORS_ORIGINS:origin,QA_CLIENT_ACCESS:'true'});
 const req=(path,body,{cookie,account,method=body?'POST':'GET'}={})=>{
  const headers={Origin:origin};
  if(body)headers['Content-Type']='application/json';
  if(cookie)headers.Cookie=cookie;
  if(account)headers['X-Client-Account']=account;
  return worker.fetch(new Request(origin+'/api/v1/'+path,{method,headers,body:body&&JSON.stringify(body)}),f.env);
 };
 const {cookie,account}=await enrollPasskey(f,'qa.courier.profile');
 assert.equal((await req('courier/orders',undefined,{cookie,account})).status,403);
 for(let i=0;i<2;i++)assert.equal((await req('customer/courier-application',{},{cookie,account})).status,200);
 assert.equal((await f.call('/api/v1/admin/courier-applications')).status,403);
 assert.deepEqual((await f.call('/api/v1/admin/courier-applications',{by:'platformAdmin'})).body.applications.map(x=>x.user_id),[account]);
 const pending=f.DB.db.prepare('SELECT created_at FROM courier_applications WHERE user_id=?').get(account);
 const decision={userId:account,createdAt:pending.created_at};
 const reject=by=>f.call('/api/v1/admin/courier-applications/reject',{by,method:'POST',body:decision});
 assert.equal((await reject('customer')).status,403);
 assert.equal((await reject('platformAdmin')).status,200);
 assert.equal((await reject('platformAdmin')).status,409);
 assert.equal((await f.call('/api/v1/admin/couriers',{by:'platformAdmin',method:'POST',body:{userId:account,applicationCreatedAt:pending.created_at}})).status,409);
 assert.equal(f.DB.db.prepare("SELECT count(*) AS n FROM control_audit WHERE subject=? AND action='courier_application_rejected'").get(account).n,1);
 assert.equal((await f.call('/api/v1/admin/couriers',{by:'platformAdmin',method:'POST',body:{userId:account}})).status,201);
 const current=await (await req('auth/me',undefined,{cookie})).json();
 assert.equal(current.user.role,'courier');
 assert.equal((await (await req('courier/orders',undefined,{cookie,account})).json()).profile.available,0);
 assert.equal((await req('courier/availability',{available:true},{cookie,account,method:'PATCH'})).status,200);
 assert.equal((await req('customer/orders',undefined,{cookie,account})).status,403);
 assert.equal((await req('courier/revoke-sessions',{},{cookie,account})).status,204);
 assert.equal((await req('auth/me',undefined,{cookie})).status,401);
 assert.equal(f.DB.db.prepare('SELECT available FROM courier_profiles WHERE user_id=?').get(account).available,0);
 assert.equal(f.DB.db.prepare('SELECT COUNT(*) AS n FROM courier_availability_events WHERE courier_id=?').get(account).n,2);
});

test('courier offer timeout protects addresses, dispatch conversation and idempotent PIN attempts',async()=>{
 const f=await fixture(),[rid,other]=f.restaurants;
 const outsider=await f.user('courierB','courier');
 f.DB.db.prepare('INSERT INTO courier_profiles(user_id,active,max_active_orders) VALUES(?,1,2)').run(outsider.id);
 const call=(path,body,by='courier',method=body?'POST':'GET',key=randomUUID(),restaurantId=rid)=>
  f.call('/api/v1/'+path,{by,method,body,key,restaurantId});
 const made=(await f.create()).body,id=made.order.id;
 for(const [index,status] of ['Aceptado','Preparando','Listo'].entries())assert.equal((await f.status(id,'staffA',status,index+1)).status,200);
 const assign=(courierId,expectedVersion)=>call('restaurant/orders/'+id+'/assign',{courierId,expectedVersion},'staffA','PATCH');
 const mine=f.tokens.courier.id;
 assert.equal((await call('courier/availability',{available:false},'courier','PATCH')).status,200);
 assert.equal((await assign(mine,4)).body.error,'COURIER_UNAVAILABLE');
 await call('courier/availability',{available:true},'courier','PATCH');
 assert.equal((await assign(mine,4)).status,200);
 let cards=(await call('courier/orders')).body.orders;
 assert.equal(cards.length,1);
 assert.ok(cards[0].offerExpiresAt>Date.now()/1000);
 assert.equal(cards[0].deliveryAddress,undefined);
 assert.equal(cards[0].pickupAddress,undefined);
 const dispatch='orders/'+id+'/chat/dispatch';
 assert.equal((await call(dispatch)).status,404);
 f.DB.db.prepare('UPDATE online_orders SET courier_offer_expires_at=unixepoch()-1 WHERE id=?').run(id);
 const offer=(action,expectedVersion,by='courier')=>call('courier/orders/'+id+'/offer',{action,expectedVersion},by);
 assert.equal((await offer('accept',5)).body.error,'OFFER_EXPIRED');
 assert.deepEqual((await call('courier/orders')).body.orders,[]);
 assert.equal((await assign(outsider.id,5)).status,200);
 assert.equal((await offer('reject',6,'courierB')).status,200);
 assert.equal((await assign(mine,7)).status,200);
 assert.equal((await offer('accept',8)).status,200);
 cards=(await call('courier/orders')).body.orders;
 assert.equal(cards[0].deliveryAddress,made.order.deliveryAddress||'Barrio El Centro, casa 10');
 assert.ok(Object.hasOwn(cards[0],'pickupAddress'));
 const chatKey=randomUUID();
 for(let i=0;i<2;i++)assert.equal((await call(dispatch,{message:'Retiro ficticio'},'courier','POST',chatKey)).status,200);
 assert.equal((await call(dispatch,undefined,'staffA')).body.messages.length,1);
 assert.equal((await call(dispatch,{message:'Listo para recoger'},'staffA')).status,200);
 assert.equal((await call(dispatch,undefined,'courierB')).status,404);
 assert.equal((await call(dispatch,undefined,'staffB','GET',randomUUID(),other)).status,404);
 assert.equal((await call(dispatch,undefined,'customer')).status,404);
 assert.equal((await call('orders/'+id+'/chat/courier',{message:'Mensaje ficticio'},'customer')).status,200);
 assert.equal((await call('orders/'+id+'/chat/courier')).body.messages.length,1);
 for(const [index,status] of ['Recogido','En camino','En ubicación'].entries())
  assert.equal((await call('courier/orders/'+id+'/status',{status,expectedVersion:9+index},'courier','PATCH')).status,200);
 const deliver='courier/orders/'+id+'/deliver';
 const wrong={expectedVersion:12,pin:made.deliveryPin==='000000'?'111111':'000000'},wrongKey=randomUUID();
 for(let i=0;i<2;i++)assert.equal((await call(deliver,wrong,'courier','POST',wrongKey)).status,403);
 assert.equal(f.DB.db.prepare('SELECT pin_attempts FROM online_orders WHERE id=?').get(id).pin_attempts,1);
 const right={expectedVersion:12,pin:made.deliveryPin},deliveryKey=randomUUID();
 assert.equal((await call(deliver,right,'courierB')).status,404);
 assert.equal((await call(deliver,right,'courier','POST',deliveryKey)).status,200);
 assert.equal((await call(deliver,right,'courier','POST',deliveryKey)).body.replayed,true);
 const history=(await call('courier/history')).body;
 assert.equal(history.orders[0].id,id);
 assert.equal(history.orders[0].earningsMinor,null);
 assert.equal(history.orders[0].deliveryAddress,undefined);
 assert.equal((await call('courier/history',undefined,'courierB')).body.orders.length,0);
 assert.equal((await call(dispatch)).body.writable,false);
});

test('Control Center protects customer accounts, operational views and auditable claim assignment',async()=>{
 const f=await fixture(),[rid]=f.restaurants;
 const api=(path,body,method=body?'POST':'GET',by='platformAdmin')=>f.call('/api/v1/admin/control/'+path,{method,body,by,key:randomUUID()});
 for(const by of ['customer','staffA','courier'])assert.equal((await api('accounts',undefined,'GET',by)).status,403);
 const target=f.tokens.customer.id;
 const snapshot=(await api('accounts?q='+target)).body.accounts[0];
 assert.equal(snapshot.sessions,1);
 assert.equal(snapshot.token_hash,undefined);
 const made=(await f.create()).body.order;
 assert.equal((await f.call('/api/v1/orders/'+made.id+'/claim',{method:'POST',body:{category:'entrega',message:'Reclamo ficticio de prueba'}})).status,200);
 const orders=(await api('orders?status=active&restaurant='+rid+'&q='+made.orderNumber)).body.orders;
 assert.equal(orders[0].claim_status,'open');
 assert.equal(orders[0].delivery_address,undefined);
 const patch={status:'review',assigneeId:f.tokens.platformAdmin.id,version:1};
 assert.equal((await api('claims/'+made.id,{...patch,assigneeId:target},'PATCH')).status,409);
 const assigned=await Promise.all([api('claims/'+made.id,patch,'PATCH'),api('claims/'+made.id,patch,'PATCH')]);
 assert.deepEqual(assigned.map(r=>r.status).sort(),[200,409]);
 assert.equal((await api('claims/'+made.id,{...patch,version:2,status:'resolved',resolution:'Incidencia ficticia resuelta'},'PATCH')).status,200);
 assert.equal((await api('claims?status=resolved&q='+made.orderNumber)).body.claims[0].assignee_id,f.tokens.platformAdmin.id);
 assert.equal((await f.call('/api/v1/orders/'+made.id+'/claim')).body.claim.status,'resolved');
 assert.equal((await api('audit?subject='+made.id)).body.events.length,2);
 const lock={state:'locked',version:snapshot.admin_version,reason:'Bloqueo ficticio QA'};
 assert.equal((await api('accounts/'+target,lock,'PATCH')).status,200);
 assert.equal((await f.call('/api/v1/auth/me')).status,401);
 assert.equal((await api('accounts/'+target,lock,'PATCH')).status,409);
 assert.equal((await api('accounts/'+target,{...lock,version:2,state:'suspended'},'PATCH')).status,409);
 assert.equal((await api('accounts/'+target,{...lock,version:2,state:'active'},'PATCH')).status,200);
 assert.equal((await f.call('/api/v1/auth/me')).status,401);
 assert.equal((await api('accounts/'+f.tokens.platformAdmin.id,{...lock,version:1},'PATCH')).status,409);
 assert.equal((await api('audit?subject='+target)).body.events.length,2);
});

test('Control Center limits coupons at checkout and records auditable future rates and campaigns',async()=>{
 const f=await fixture(),[rid]=f.restaurants,[productId]=f.productIds;
 f.env.QA_FLASH='true';
 const now=Math.floor(Date.now()/1000);
 const api=(path,body,method=body?'POST':'GET',key=randomUUID())=>f.call('/api/v1/admin/'+path,{method,body,by:'platformAdmin',key});
 const cp={code:'QATEST',restaurantId:rid,discountMinor:250,globalLimit:1,startsAt:now-20,endsAt:now+500};
 assert.equal((await api('control/coupons',cp)).status,200);
 assert.equal((await api('control/coupons',cp)).status,409);
 const buy=by=>f.call('/api/v1/customer/orders',{by,method:'POST',key:randomUUID(),
  body:{restaurantId:rid,items:[{productId,quantity:1}],deliveryMethod:'pickup',phone:'+50400000004',coupon:cp.code}});
 const purchased=await Promise.all([buy('customer'),buy('customer2')]);
 assert.deepEqual(purchased.map(r=>r.status).sort(),[201,409]);
 assert.equal((await api('control/coupons')).body.coupons[0].used,1);
 assert.equal((await api('control/coupons/QATEST',{active:false},'PATCH')).status,200);
 assert.equal((await api('control/coupons/QATEST',{active:true},'PATCH')).status,200);
 const campaign={restaurantId:rid,productId,title:'Descuento QA',discountMinor:500,startsAt:now-10,endsAt:now+600,perCustomer:1,globalLimit:2};
 const key=randomUUID(),first=await api('flash',campaign,'POST',key);
 assert.equal(first.status,201);
 assert.equal((await api('flash',campaign,'POST',key)).body.id,first.body.id);
 assert.equal((await api('flash/'+first.body.id,{active:false},'PATCH')).status,200);
 assert.equal((await api('flash/'+first.body.id,{active:true},'PATCH')).status,200);
 assert.equal((await api('control/audit?subject='+first.body.id)).body.events.length,3);
 const rules={restaurantId:rid,zone:'qa-centro',effectiveAt:now+100,baseMinor:1200,zoneMinor:250,kmMinor:350};
 assert.equal((await api('control/rates',{...rules,effectiveAt:now-10})).status,400);
 assert.equal((await api('control/rates',rules)).status,200);
 assert.equal((await api('control/rates',{...rules,baseMinor:500})).status,409);
 const simulation={restaurantId:rid,zone:rules.zone,at:rules.effectiveAt,meters:1500};
 assert.equal((await api('control/rates/simulate',{...simulation,at:now})).status,409);
 assert.equal((await api('control/rates/simulate',simulation)).body.totalMinor,1975);
 assert.equal((await api('control/courier-rules',{restaurantId:rid,courierId:f.tokens.courier.id,effectiveAt:now+100,courierBps:5000})).status,200);
 assert.equal((await api('control/courier-rules?restaurant='+rid)).body.courierRules[0].courier_bps,5000);
 assert.deepEqual((await api('control/reports?from='+(now-60)+'&until='+(now+60)+'&restaurant='+rid)).body.orders,[{status:'Pendiente',orders:1}]);
});


const passkeyOrigin='https://dvolada-qa.dvoladanexora.workers.dev';
const bytes=value=>Buffer.from(value,'base64url');
const base64=value=>Buffer.from(value).toString('base64url');
const passkeyHash=value=>createHash('sha256').update(value).digest();

function virtualPasskey(){
 const keys=generateKeyPairSync('ec',{namedCurve:'prime256v1'}),credentialId=randomBytes(32);
 const publicKey=keys.publicKey.export({format:'jwk'});
 const cose=isoCBOR.encode(new Map([[1,2],[3,-7],[-1,1],[-2,bytes(publicKey.x)],[-3,bytes(publicKey.y)]]));
 const rpHash=passkeyHash(new URL(passkeyOrigin).hostname);
 let counter=0;
 return {
  registration(options,{origin=passkeyOrigin,flags=0x45}={}){
   const authData=Buffer.concat([rpHash,Buffer.of(flags),Buffer.alloc(4),Buffer.alloc(16),Buffer.of(0,credentialId.length),credentialId,cose]);
   const clientData=Buffer.from(JSON.stringify({type:'webauthn.create',origin,crossOrigin:false,challenge:options.challenge}));
   const object=isoCBOR.encode(new Map([['fmt','none'],['attStmt',new Map()],['authData',authData]]));
   return {id:base64(credentialId),rawId:base64(credentialId),type:'public-key',
    response:{clientDataJSON:base64(clientData),attestationObject:base64(object)},clientExtensionResults:{}};
  },
  assertion(options,{origin=passkeyOrigin,flags=5}={}){
   const count=Buffer.alloc(4);count.writeUInt32BE(++counter);
   const authData=Buffer.concat([rpHash,Buffer.of(flags),count]);
   const clientData=Buffer.from(JSON.stringify({type:'webauthn.get',origin,crossOrigin:false,challenge:options.challenge}));
   const signature=sign('sha256',Buffer.concat([authData,passkeyHash(clientData)]),keys.privateKey);
   return {id:base64(credentialId),rawId:base64(credentialId),type:'public-key',response:{clientDataJSON:base64(clientData),
    authenticatorData:base64(authData),signature:base64(signature)},clientExtensionResults:{}};
  }
 };
}
function passkeyRequest(f,path,body,{cookie,account,origin=passkeyOrigin,url=passkeyOrigin,method=body?'POST':'GET',key,restaurantId}={}){
 const headers={Origin:origin};
 if(body)headers['Content-Type']='application/json';
 if(cookie)headers.Cookie=cookie;
 if(account)headers['X-Client-Account']=account;
 if(key)headers['Idempotency-Key']=key;
 if(restaurantId)headers['X-Restaurant-ID']=restaurantId;
 return worker.fetch(new Request(url+'/api/v1/'+path,{method,headers,body:body&&JSON.stringify(body)}),f.env);
}
const partCookie=response=>response.headers.get('set-cookie')?.split(';')[0];
const beginKey=(f,action,body,options)=>passkeyRequest(f,'auth/client/'+action+'/begin',body,options);
const finishKey=(f,action,id,response,cookie)=>passkeyRequest(f,'auth/client/'+action+'/finish',{id,response},{cookie});
async function enrollPasskey(f,login){
 Object.assign(f.env,{CORS_ORIGINS:passkeyOrigin,QA_CLIENT_ACCESS:'true'});
 const access=await beginKey(f,'register',{login,displayName:'Cliente ficticio'});
 assert.equal(access.status,200);
 const {id,options}=await access.json(),authenticator=virtualPasskey();
 const created=await finishKey(f,'register',id,authenticator.registration(options),partCookie(access));
 assert.equal(created.status,201);
 const cookie=partCookie(created),{recovery}=await created.json();
 const {user}=await (await passkeyRequest(f,'auth/me',undefined,{cookie})).json();
 return {authenticator,cookie,recovery,account:user.id};
}

test('passkeys reject retired proofs, reuse, wrong browser/origin and missing user verification',async()=>{
 const f=await fixture(),login='qa.passkey.alpha';
 const fakeProof='a'.repeat(64);
 assert.equal((await beginKey(f,'register',{login,displayName:'QA'})).status,403);
 const {authenticator,cookie,account}=await enrollPasskey(f,login);
 for(const mode of ['login','recover'])assert.equal((await passkeyRequest(f,'auth/client/'+mode,{login,proof:fakeProof})).status,410);
 assert.equal((await beginKey(f,'register',{login,displayName:'QA',proof:fakeProof})).status,400);
 assert.equal((await beginKey(f,'login',{login},{origin:'https://other.example'})).status,403);
 assert.equal((await passkeyRequest(f,'customer/orders',undefined,{cookie,account:f.tokens.customer.id})).status,401);
 const make=async()=>{const start=await beginKey(f,'login',{login});return {...await start.json(),browser:partCookie(start)}};
 const fail=async(details)=>{const f1=await make();
  assert.equal((await finishKey(f,'login',f1.id,authenticator.assertion(f1.options,details),f1.browser)).status,401)
 };
 await fail({origin:'https://wrong.example'});
 await fail({flags:1});
 const a=await make(),signed=authenticator.assertion(a.options);
 assert.equal((await finishKey(f,'login',a.id,signed,null)).status,401);
 const concurrent=await Promise.all([0,1].map(()=>finishKey(f,'login',a.id,signed,a.browser)));
 assert.deepEqual(concurrent.map(res=>res.status).sort(),[204,401]);
 const b=await make();
 assert.equal((await finishKey(f,'login',b.id,signed,b.browser)).status,401);
 const old=await make();
 f.DB.db.prepare('UPDATE client_passkey_challenges SET expires_at=0 WHERE id=?').run(old.id);
 assert.equal((await finishKey(f,'login',old.id,authenticator.assertion(old.options),old.browser)).status,401);
 const loginCookie=partCookie(concurrent.find(res=>res.status===204));
 assert.match(loginCookie,/^__Host-dvolada-client=/);
 const logout=await passkeyRequest(f,'auth/logout',undefined,{method:'POST',cookie:loginCookie,account});
 assert.equal(logout.status,204);
 assert.match(logout.headers.get('set-cookie'),/Secure; HttpOnly; SameSite=Strict; Max-Age=0/);
 assert.equal((await passkeyRequest(f,'auth/me',undefined,{cookie:loginCookie})).status,401);
});

test('recovery migrates a legacy account, preserves its ID and accepts only one concurrent replacement',async()=>{
 const f=await fixture(),legacy=f.tokens.customer,login='qa.legacy.recovery',recovery=randomBytes(32).toString('base64url');
 Object.assign(f.env,{CORS_ORIGINS:passkeyOrigin,QA_CLIENT_ACCESS:'true'});
 f.DB.db.prepare('INSERT INTO client_credentials(user_id,login_name,password_hash,access_hash,recovery_hash) VALUES(?,?,?,?,?)')
  .run(legacy.id,login,'legacy-proof-verifier','old-access-hash',await hmacHex(PEPPER,'client-recover:v1:'+recovery));
 const start=async()=>{const response=await beginKey(f,'recover',{login,code:recovery});
  assert.equal(response.status,200);return {...await response.json(),browser:partCookie(response)}};
 const stale=await start();
 f.DB.db.prepare('UPDATE users SET admin_version=admin_version+1 WHERE id=?').run(legacy.id);
 assert.equal((await finishKey(f,'recover',stale.id,virtualPasskey().registration(stale.options),stale.browser)).status,401);
 const flows=await Promise.all([start(),start()]);
 const done=await Promise.all(flows.map(item=>finishKey(f,'recover',item.id,virtualPasskey().registration(item.options),item.browser)));
 assert.deepEqual(done.map(res=>res.status).sort(),[200,401]);
 const next=done.find(res=>res.status===200),codes=await next.json();
 assert.notEqual(codes.recovery,recovery);
 assert.equal((await beginKey(f,'recover',{login,code:recovery})).status,401);
 assert.equal((await f.call('/api/v1/auth/me')).status,401);
 const {user}=await (await passkeyRequest(f,'auth/me',undefined,{cookie:partCookie(next)})).json();
 assert.equal(user.id,legacy.id);
 assert.equal(f.DB.db.prepare('SELECT password_hash FROM client_credentials WHERE user_id=?').get(legacy.id).password_hash,null);
 assert.equal(f.DB.db.prepare('SELECT COUNT(*) AS n FROM auth_sessions WHERE user_id=? AND revoked_at IS NULL').get(legacy.id).n,1);
});

test('passkey options honor QA and explicit production origin and rate-limit requests',async()=>{
 const f=await fixture(),prod='https://online.example.test';
 Object.assign(f.env,{CORS_ORIGINS:passkeyOrigin+','+prod,QA_CLIENT_ACCESS:'true',DVOLADA_ONLINE_HOST:'online.example.test'});
 const request=()=>beginKey(f,'login',{login:'qa.passkey'},{url:prod,origin:prod});
 assert.equal((await request()).status,404);
 f.env.CLIENT_PASSKEYS_ENABLED='true';
 for(let i=0;i<24;i++)assert.equal((await request()).status,200);
 assert.equal((await request()).status,429);
});

async function usePrivilegedKey(f,action,login,authenticator,code){
 const start=await beginKey(f,action,{login,...code&&{code}});
 assert.equal(start.status,200);
 const {id,options}=await start.json();
 const response=action==='login'?authenticator.assertion(options):authenticator.registration(options);
 return finishKey(f,action,id,response,partCookie(start));
}

test('invited administrators and owners authenticate with passkeys and retain separate privileges',async()=>{
 const f=await fixture();
 Object.assign(f.env,{CORS_ORIGINS:passkeyOrigin,QA_CLIENT_ACCESS:'true',QA_RESTAURANT_COMMERCIAL:'true'});
 const admin=f.tokens.platformAdmin.id,login='qa.global.admin',code=randomBytes(32).toString('base64url');
 const db=f.DB.db;
 db.prepare('INSERT INTO client_credentials(user_id,login_name,access_hash,recovery_hash) VALUES(?,?,?,?)')
  .run(admin,login,'bootstrap-disabled-old-access',await hmacHex(PEPPER,'client-recover:v1:'+code));
 db.prepare("INSERT INTO privileged_passkey_accounts(user_id,access_role,invitation_expires_at) VALUES(?,'platform_admin',unixepoch()-1)").run(admin);
 assert.equal((await beginKey(f,'recover',{login,code})).status,401);
 db.prepare('UPDATE privileged_passkey_accounts SET invitation_expires_at=unixepoch()+30 WHERE user_id=?').run(admin);

 const adminKey=virtualPasskey(),activated=await usePrivilegedKey(f,'recover',login,adminKey,code);
 assert.equal(activated.status,200);
 assert.equal((await beginKey(f,'recover',{login,code})).status,401);
 const adminCookie=partCookie(activated),adminOptions={cookie:adminCookie,account:admin};
 const {recovery:adminRecovery}=await activated.json();
 assert.equal((await passkeyRequest(f,'admin/overview',undefined,adminOptions)).status,200);
 assert.equal((await passkeyRequest(f,'admin/overview',undefined,{cookie:adminCookie,account:f.tokens.customer.id})).status,401);
 assert.equal((await passkeyRequest(f,'customer/orders',undefined,adminOptions)).status,403);
 const [rA,rB]=f.restaurants;
 const ownerLogin='qa.owner.one',invitePath='admin/restaurants/'+rA+'/owner-invitations',ownerBody={login:ownerLogin,displayName:'Titular de prueba'};
 const customer=await enrollPasskey(f,'qa.customer.negative');
 assert.equal((await passkeyRequest(f,invitePath,ownerBody,{...customer,key:randomUUID()})).status,403);
 assert.equal((await passkeyRequest(f,invitePath,ownerBody,{...adminOptions,key:randomUUID(),origin:'https://other.example'})).status,403);
 const invited=await passkeyRequest(f,invitePath,ownerBody,{...adminOptions,key:randomUUID()});
 assert.equal(invited.status,201);
 const owner=await invited.json();
 assert.equal(db.prepare("SELECT COUNT(*) AS n FROM control_audit WHERE subject=? AND action='owner_invited'").get(owner.userId).n,1);
 const ownerKey=virtualPasskey(),claimed=await usePrivilegedKey(f,'recover',ownerLogin,ownerKey,owner.invitation);
 assert.equal(claimed.status,200);
 const {recovery:ownerRecovery}=await claimed.json();
 const ownerOptions={cookie:partCookie(claimed),account:owner.userId};
 const {restaurants}=await (await passkeyRequest(f,'auth/me',undefined,ownerOptions)).json();
 assert.deepEqual(restaurants.map(item=>[item.restaurant_id,item.staff_role]),[[rA,'owner']]);
 assert.equal((await passkeyRequest(f,'admin/overview',undefined,ownerOptions)).status,403);
 db.prepare("INSERT INTO restaurant_memberships(restaurant_id,user_id,staff_role) VALUES(?,?,'manager')").run(rB,owner.userId);
 assert.equal((await passkeyRequest(f,'restaurant/staff-access',undefined,{...ownerOptions,restaurantId:rA})).status,200);
 assert.equal((await passkeyRequest(f,'restaurant/staff-access',undefined,{...ownerOptions,restaurantId:rB})).status,403);
 const staffInvite=await passkeyRequest(f,'restaurant/staff-access',{displayName:'Cocina sintética',role:'kitchen'},
  {...ownerOptions,restaurantId:rA,key:randomUUID()});
 assert.equal(staffInvite.status,200);
 assert.equal((await usePrivilegedKey(f,'login',ownerLogin,ownerKey)).status,204);
 const recovered=await usePrivilegedKey(f,'recover',ownerLogin,virtualPasskey(),ownerRecovery);
 assert.equal(recovered.status,200);
 assert.equal((await passkeyRequest(f,'auth/me',undefined,ownerOptions)).status,401);
 assert.equal((await usePrivilegedKey(f,'login',ownerLogin,ownerKey)).status,401);

 const replacement=virtualPasskey();
 const adminRecovered=await usePrivilegedKey(f,'recover',login,replacement,adminRecovery);
 assert.equal(adminRecovered.status,200);
 assert.equal((await passkeyRequest(f,'auth/me',undefined,adminOptions)).status,401);
 const logged=await usePrivilegedKey(f,'login',login,replacement);
 assert.equal(logged.status,204);
 const session={cookie:partCookie(logged),account:admin};
 assert.equal((await passkeyRequest(f,'auth/revoke-sessions',undefined,{...session,method:'POST'})).status,204);
 for(const cookie of [session.cookie,partCookie(adminRecovered)])
  assert.equal((await passkeyRequest(f,'auth/me',undefined,{cookie})).status,401);
 const again=await usePrivilegedKey(f,'login',login,replacement);
 assert.equal(again.status,204);
 assert.equal((await passkeyRequest(f,'auth/logout',undefined,{cookie:partCookie(again),account:admin,method:'POST'})).status,204);
});

test('catalog client pages through four hundred open restaurants with equal names',async()=>{
 const f=await fixture();
 const insert=f.DB.db.prepare("INSERT INTO restaurants(id,name,plan,subscription_status,online_state) VALUES(?,'Comedor & Café','ONLINE','active','open')");
 for(let i=0;i<398;i++)insert.run(randomUUID());
 const {createLiveApi}=await import('../../src/live/live-api.js');
 let pages=0;
 const api=createLiveApi({baseUrl:'https://dvolada.example',getSessionToken:()=>null,
  fetchImpl:(url,options)=>{pages++;return worker.fetch(new Request(url,options),f.env)}});
 const catalog=await api.restaurants();
 assert.equal(pages,4);
 assert.equal(catalog.restaurants.length,400);
 assert.equal(new Set(catalog.restaurants.map(row=>row.id)).size,400);
});
test('controlled checkout 20 restaurants and 100 clients',async()=>{
 const f=await fixture(), shops=[];
 for(let i=0;i<20;i++){
  const restaurantId=randomUUID(),productId=randomUUID();
  f.DB.db.prepare("INSERT INTO restaurants(id,name,plan,subscription_status,online_state) VALUES(?,?,'ONLINE','active','open')").run(restaurantId,'R'+i);
  f.DB.db.prepare("INSERT INTO products(id,restaurant_id,name,price_minor) VALUES(?,?,'Baleada',5000)").run(productId,restaurantId);
  shops.push({restaurantId,productId});
 }
 for(let i=0;i<100;i++)await f.user('fixture'+i);
 const intents=Array.from({length:100},(_,i)=>({...shops[i%20],by:'fixture'+i,key:randomUUID()}));
 const results=await Promise.all([...intents,...intents].map(intent=>f.create(intent)));
 assert(results.every(r=>[200,201].includes(r.status)));
 assert.equal(new Set(results.map(r=>r.body.order.id)).size,100);
 assert.equal(f.DB.db.prepare('SELECT COUNT(*) n FROM online_orders').get().n,100);
 assert.equal(f.DB.db.prepare('SELECT COUNT(DISTINCT restaurant_id) n FROM online_orders').get().n,20);
});

test('public food feed contains only available products of active businesses and validates cursors',async()=>{
 const f=await fixture();
 const feed=async(query='')=>f.call('/api/v1/catalog/feed'+query);
 const initial=await feed();
 assert.equal(initial.status,200);
 assert.equal(initial.body.next,null);
 assert.deepEqual(new Set(initial.body.products.map(p=>p.id)),new Set(f.productIds));
 assert.ok(initial.body.products.every(p=>p.photoUrl===null&&p.restaurant_name&&Number.isInteger(p.price_minor)));
 assert.deepEqual((await feed('?q=bale')).body.products.map(p=>p.id),[f.productIds[0]]);
 f.DB.db.prepare('UPDATE products SET available=0 WHERE id=?').run(f.productIds[0]);
 assert.deepEqual((await feed('?q=bale')).body.products,[]);
 f.DB.db.prepare("UPDATE restaurants SET subscription_status='inactive' WHERE id=?").run(f.restaurants[1]);
 assert.deepEqual((await feed()).body.products,[]);
 assert.equal((await feed('?after=invalid')).status,400);
 assert.equal((await feed('?q='+encodeURIComponent('x'.repeat(61)))).status,400);
});

test('owner publishes food and photo atomically, invalid photo leaves no product',async()=>{
 const f=await fixture(),restaurantId=f.restaurants[0];
 await f.user('publishOwner','customer',[restaurantId,'owner']);
 const image='iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aQ/cAAAAASUVORK5CYII=';
 const publish=(by,photoBase64)=>f.call('/api/v1/restaurant/products',{by,restaurantId,method:'POST',body:{name:'Comida con foto',priceMinor:12000,category:'Almuerzos',available:true,photoBase64}});
 const before=f.DB.db.prepare('SELECT COUNT(*) AS n FROM products').get().n;
 assert.equal((await publish('publishOwner',btoa('<svg>test</svg>'))).status,400);
 assert.equal(f.DB.db.prepare('SELECT COUNT(*) AS n FROM products').get().n,before);
 assert.equal((await publish('customer',image)).status,403);
 const created=await publish('publishOwner',image);
 assert.equal(created.status,201,JSON.stringify(created.body));
 const item=created.body.product;
 assert.equal(item.photoUrl,'/api/v1/catalog/photos/'+item.id);
 const menu=await f.call('/api/v1/catalog/restaurants/'+restaurantId+'/products');
 assert.ok(menu.body.products.some(p=>p.id===item.id&&p.photoUrl===item.photoUrl&&p.category==='Almuerzos'));
 const response=await worker.fetch(new Request('https://api.example.test'+item.photoUrl),f.env);
 assert.equal(response.status,200);
 assert.equal(Buffer.from(await response.arrayBuffer()).toString('base64'),image);
});

test('QA operator invitation enrolls one verified passkey, then uses ordinary protected recovery',async()=>{
 const f=await fixture();
 Object.assign(f.env,{CORS_ORIGINS:passkeyOrigin,QA_CLIENT_ACCESS:'true'});
 const user=f.tokens.platformAdmin.id,login='operator.fixture',code=randomBytes(32).toString('base64url');
 const verifier='operator-v1:'+createHash('sha256').update(['dvolada-qa',login,code].join('|')).digest('hex');
 f.DB.db.prepare('INSERT INTO client_credentials(user_id,login_name,access_hash,recovery_hash) VALUES(?,?,?,?)').run(user,login,'retired',verifier);
 f.DB.db.prepare("INSERT INTO privileged_passkey_accounts(user_id,access_role,invitation_expires_at) VALUES(?,'platform_admin',unixepoch()-1)").run(user);
 assert.equal((await beginKey(f,'recover',{login,code})).status,401);
 f.DB.db.prepare('UPDATE privileged_passkey_accounts SET invitation_expires_at=unixepoch()+1800 WHERE user_id=?').run(user);
 assert.equal((await beginKey(f,'recover',{login,code:randomBytes(32).toString('base64url')})).status,401);
 const activation=await usePrivilegedKey(f,'recover',login,virtualPasskey(),code);
 assert.equal(activation.status,200);
 assert.equal((await passkeyRequest(f,'admin/overview',undefined,{cookie:partCookie(activation),account:user})).status,200);
 assert.equal((await beginKey(f,'recover',{login,code})).status,401);
 const {recovery}=await activation.json();
 assert.equal((await beginKey(f,'recover',{login,code:recovery})).status,200);
});

test('operator promotion keeps the enrolled key and requires a fresh admin login',async()=>{
 const f=await fixture(),login='test.operator';
 const {account,cookie,authenticator}=await enrollPasskey(f,login);
 const sql=readFileSync(new URL('../../scripts/operator/promote-enrolled-customer.sql',import.meta.url),'utf8')
  .replace(/^--.*$/gm,'').split(';').map(s=>s.trim()).filter(Boolean);
 const db=f.DB.db;
 const execute=(text,name)=>db.prepare(text.replaceAll('?1',':id').replaceAll('?2',':login'))
  .run({...text.includes('?1')&&{id:account},...text.includes('?2')&&{login:name}});
 assert.equal(execute(sql[0],'wrong.alias').changes,0);
 for(const [index,statement] of sql.entries()){
  const result=execute(statement,login);
  if(index===0||index===sql.length-1)assert.equal(result.changes,1);
 }
 assert.equal((await passkeyRequest(f,'auth/me',undefined,{cookie})).status,401);
 const entered=await usePrivilegedKey(f,'login',login,authenticator);
 assert.equal(entered.status,204);
 const options={cookie:partCookie(entered),account};
 assert.equal((await passkeyRequest(f,'admin/overview',undefined,options)).status,200);
 assert.equal(execute(sql[0],login).changes,0);
});

test('one delivery crosses four separate passkey sessions from enrollment through cash',async()=>{
 const f=await fixture();
 f.env.QA_RESTAURANT_COMMERCIAL='true';
 const adminLogin='test.control',admin=await enrollPasskey(f,adminLogin);
 const db=f.DB.db;
 db.prepare("INSERT INTO privileged_passkey_accounts(user_id,access_role) VALUES(?,'platform_admin')").run(admin.account);
 db.prepare("UPDATE users SET account_role='platform_admin' WHERE id=?").run(admin.account);
 admin.cookie=partCookie(await usePrivilegedKey(f,'login',adminLogin,admin.authenticator));
 async function request(person,path,{body,method,restaurantId,key=randomUUID()}={}){
  const res=await passkeyRequest(f,path,body,{...person,method:method||(body?'POST':'GET'),restaurantId,key});
  const data=res.status===204?{}:await res.json();
  assert.ok(res.ok,path+' '+res.status+' '+JSON.stringify(data.error));return data;
 }
 const rid=(await request(admin,'admin/restaurants',{body:{name:'Negocio aislado',plan:'ONLINE'}})).restaurant.id;
 await request(admin,'admin/restaurants/'+rid,{method:'PATCH',body:{subscriptionStatus:'active',deliveryFeeMinor:500}});
 const ownerLogin='test.propietario';
 const invite=await request(admin,'admin/restaurants/'+rid+'/owner-invitations',{body:{login:ownerLogin,displayName:'Propietario de prueba'}});
 const owner={account:invite.userId,cookie:partCookie(await usePrivilegedKey(f,'recover',ownerLogin,virtualPasskey(),invite.invitation))};
 const merchant=(path,body,method)=>request(owner,'restaurant/'+path,{restaurantId:rid,body,method});
 await merchant('availability',{state:'open'},'PATCH');
 const photoBase64='iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aQ/cAAAAASUVORK5CYII=';
 const product=(await merchant('products',{name:'Almuerzo',priceMinor:5000,available:true,photoBase64})).product;
 const extra=randomUUID();
 db.prepare("INSERT INTO product_options(id,product_id,name,kind,price_minor) VALUES(?,?,'Extra','extra',500)").run(extra,product.id);
 db.prepare("INSERT INTO client_coupons(code,restaurant_id,discount_minor,starts_at,ends_at) VALUES('TEST-CUPON',?,500,unixepoch()-1,unixepoch()+3600)").run(rid);
 const buyer=await enrollPasskey(f,'test.comprador'),driver=await enrollPasskey(f,'test.reparto');
 await request(driver,'customer/courier-application',{body:{}});
 await request(admin,'admin/couriers',{body:{userId:driver.account}});
 await request(driver,'courier/availability',{method:'PATCH',body:{available:true}});
 const menu=await request(buyer,'catalog/restaurants/'+rid+'/products');
 assert.equal(menu.products[0].photoUrl,product.photoUrl);
 const cart={restaurantId:rid,items:[{productId:product.id,quantity:1,optionIds:[extra]}],deliveryMethod:'delivery',phone:'+50400000003',deliveryAddress:'Barrio aislado, casa 10',coupon:'TEST-CUPON',expectedTotalMinor:5500};
 const key=randomUUID(),sale=await request(buyer,'customer/orders',{body:cart,key});
 const id=sale.order.id;
 assert.equal((await request(buyer,'customer/orders',{body:cart,key})).order.id,id);
 assert.ok((await merchant('orders')).orders.some(o=>o.id===id));
 const thread='orders/'+id+'/chat/restaurant';
 await request(buyer,thread,{body:{message:'Consulta del pedido'}});
 assert.equal((await request(owner,thread,{restaurantId:rid})).messages[0].body,'Consulta del pedido');
 for(const [index,status] of ['Aceptado','Preparando','Listo'].entries())
  await merchant('orders/'+id+'/status',{expectedVersion:index+1,status},'PATCH');
 await merchant('orders/'+id+'/assign',{expectedVersion:4,courierId:driver.account},'PATCH');
 const delivery=(action,body,method)=>request(driver,'courier/orders/'+id+'/'+action,{body,method});
 await delivery('offer',{action:'accept',expectedVersion:5});
 for(const [index,status] of ['Recogido','En camino','En ubicación'].entries())
  await delivery('status',{status,expectedVersion:6+index},'PATCH');
 await delivery('deliver',{expectedVersion:9,pin:sale.deliveryPin});
 assert.equal((await request(buyer,'customer/orders/'+id)).order.status,'Entregado');
 const shift=(await merchant('cash/open',{openingMinor:0})).shift.id;
 assert.equal((await merchant('cash/sale',{shiftId:shift,orderId:id,method:'cash'})).sale.total_minor,5500);
 assert.equal((await request(admin,'admin/overview')).orders.delivered,1);
});
