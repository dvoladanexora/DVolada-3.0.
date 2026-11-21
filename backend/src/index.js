import {
 ApiError,requireUuid,identity,assertConfiguration,assertAllowedOrigin,respond,preflight,
 restaurantAccess,requireStaff,mutationRateLimit
} from './security.js';
import {
 restaurantOrders,restaurantOrder,changes,restaurantStatus,assignCourier,
 courierOrders,courierStatus,courierOffer,confirmDelivery,customerCreate,customerOrders,
 customerOrder,customerCancel,customerCheckoutStatus
} from './orders.js';
import { issueQaPushIdentity } from './qa-push-identity.js';
import {createRestaurant,updateRestaurant,assignMember,enrollCourier,createProduct,
 updateProduct,updateAvailability} from './management.js';

async function route(req,env){
 assertConfiguration(env);
 assertAllowedOrigin(req,env);
 if(req.method==='OPTIONS')return preflight(req,env);
 const url=new URL(req.url);
 const path=url.pathname;
 const method=req.method;
 if(method==='GET'&&path==='/health'){
  await env.DB.prepare('SELECT 1').first();
  return respond(req,env,200,{status:'ok',service:'dvolada-online',version:1});
 }
 if(method==='GET'&&path==='/api/v1/catalog/restaurants'){
  const {results=[]}=await env.DB.prepare(`SELECT id,name,online_state,delivery_fee_minor
   FROM restaurants WHERE plan IN ('ONLINE','PLUS') AND subscription_status='active'
    AND online_state IN ('open','paused') ORDER BY name,id LIMIT 100`).all();
  return respond(req,env,200,{restaurants:results});
 }
 if(method==='GET'&&path==='/api/v1/catalog/search'){
  const term=(url.searchParams.get('q')||'').trim();
  if(term.length<2||term.length>60)throw new ApiError(400,'INVALID_SEARCH');
  const {results=[]}=await env.DB.prepare(`SELECT p.id,p.name,p.price_minor,r.id AS restaurant_id,
   r.name AS restaurant_name,r.online_state
   FROM products p JOIN restaurants r ON r.id=p.restaurant_id
   WHERE p.available=1 AND r.plan IN ('ONLINE','PLUS') AND r.subscription_status='active'
   AND r.online_state IN ('open','paused') AND instr(lower(p.name),lower(?))>0
   ORDER BY p.name,p.id LIMIT 25`).bind(term).all();
  return respond(req,env,200,{products:results});
 }
 const catalog=/^\/api\/v1\/catalog\/restaurants\/([0-9a-f-]+)\/products$/i.exec(path);
 if(method==='GET'&&catalog){
  const id=requireUuid(catalog[1]);
  const rest=await env.DB.prepare(`SELECT id,name,online_state,delivery_fee_minor FROM restaurants WHERE id=?
    AND plan IN ('ONLINE','PLUS') AND subscription_status='active'
    AND online_state IN ('open','paused')`).bind(id).first();
  if(!rest)throw new ApiError(404,'RESTAURANT_NOT_FOUND');
  const {results=[]}=await env.DB.prepare(`SELECT id,name,price_minor
    FROM products WHERE restaurant_id=? AND available=1 ORDER BY name,id LIMIT 150`).bind(id).all();
  return respond(req,env,200,{restaurant:rest,products:results});
 }
 const actor=await identity(req,env);
 if(['POST','PATCH'].includes(method))await mutationRateLimit(env,actor);
 if(method==='POST'&&path==='/api/v1/push/identity'){
  return respond(req,env,200,await issueQaPushIdentity(req,env,actor));
 }
 if(method==='GET'&&path==='/api/v1/auth/me'){
  const {results=[]}=await env.DB.prepare(`SELECT m.restaurant_id,m.staff_role,r.name
    FROM restaurant_memberships m JOIN restaurants r ON r.id=m.restaurant_id
    WHERE m.user_id=? AND m.active=1 ORDER BY r.name LIMIT 50`).bind(actor.userId).all();
  return respond(req,env,200,{user:{id:actor.userId,displayName:actor.displayName,
    role:actor.role},restaurants:results});
 }
 if(method==='POST'&&path==='/api/v1/auth/logout'){
  await env.DB.prepare('UPDATE auth_sessions SET revoked_at=? WHERE id=? AND revoked_at IS NULL')
   .bind(Math.floor(Date.now()/1000),actor.sessionId).run();
  return respond(req,env,204);
 }
 if(method==='GET'&&path==='/api/v1/admin/overview'){
  if(actor.role!=='platform_admin')throw new ApiError(403,'ROLE_FORBIDDEN');
  const [restaurants,orders,couriers]=await Promise.all([
   env.DB.prepare(`SELECT COUNT(*) AS total,SUM(CASE WHEN online_state='open' THEN 1 ELSE 0 END) AS open
      FROM restaurants WHERE plan IN ('ONLINE','PLUS')`).first(),
   env.DB.prepare(`SELECT COUNT(*) AS total,
     SUM(CASE WHEN status NOT IN ('Entregado','Cancelado','Rechazado') THEN 1 ELSE 0 END) AS active,
     SUM(CASE WHEN status='Entregado' THEN 1 ELSE 0 END) AS delivered FROM online_orders`).first(),
   env.DB.prepare('SELECT COUNT(*) AS active FROM courier_profiles WHERE active=1').first()
  ]);
  return respond(req,env,200,{restaurants:{total:restaurants.total,open:restaurants.open??0},
   orders:{total:orders.total,active:orders.active??0,delivered:orders.delivered??0},couriers:{active:couriers.active}});
 }
 if(method==='GET'&&path==='/api/v1/admin/restaurants'){
  if(actor.role!=='platform_admin')throw new ApiError(403,'ROLE_FORBIDDEN');
  const {results=[]}=await env.DB.prepare(`SELECT r.id,r.name,r.plan,r.subscription_status,r.online_state,r.delivery_fee_minor,
   COUNT(o.id) AS order_count FROM restaurants r LEFT JOIN online_orders o ON o.restaurant_id=r.id
   GROUP BY r.id ORDER BY r.name,r.id LIMIT 150`).all();
  return respond(req,env,200,{restaurants:results});
 }
 if(method==='GET'&&path==='/api/v1/admin/audit'){
  if(actor.role!=='platform_admin')throw new ApiError(403,'ROLE_FORBIDDEN');
  const {results=[]}=await env.DB.prepare(`SELECT a.id,a.action,a.created_at,u.display_name AS actor_name,r.name AS restaurant_name
   FROM platform_audit a JOIN users u ON u.id=a.actor_id LEFT JOIN restaurants r ON r.id=a.restaurant_id
   ORDER BY a.id DESC LIMIT 30`).all();
  return respond(req,env,200,{events:results});
 }
 if(method==='POST'&&path==='/api/v1/admin/restaurants')
  return respond(req,env,201,await createRestaurant(req,env,actor));
 const platformRestaurant=/^\/api\/v1\/admin\/restaurants\/([0-9a-f-]+)$/i.exec(path);
 if(method==='PATCH'&&platformRestaurant)
  return respond(req,env,200,await updateRestaurant(req,env,actor,platformRestaurant[1]));
 const platformMember=/^\/api\/v1\/admin\/restaurants\/([0-9a-f-]+)\/members$/i.exec(path);
 if(method==='POST'&&platformMember)
  return respond(req,env,200,await assignMember(req,env,actor,platformMember[1]));
 if(method==='POST'&&path==='/api/v1/admin/couriers')
  return respond(req,env,201,await enrollCourier(req,env,actor));
 if(path.startsWith('/api/v1/restaurant/')){
  const access=await restaurantAccess(req,env,actor);
  requireStaff(access.staff_role,['owner','manager','kitchen','cashier']);
  if(method==='GET'&&path==='/api/v1/restaurant/capabilities')
   return respond(req,env,200,{online:true,local:access.plan==='PLUS',
     restaurantId:access.restaurantId,staffRole:access.staff_role,onlineState:access.online_state});
  if(method==='GET'&&path==='/api/v1/restaurant/orders')
   return respond(req,env,200,await restaurantOrders(req,env,access,url));
  if(method==='GET'&&path==='/api/v1/restaurant/orders/changes')
   return respond(req,env,200,await changes(env,access,url));
  if(method==='GET'&&path==='/api/v1/restaurant/couriers'){
   requireStaff(access.staff_role,['owner','manager']);
   const {results=[]}=await env.DB.prepare(`SELECT c.user_id AS id,u.display_name AS name,
    COUNT(o.id) AS active_orders,c.max_active_orders AS max_orders
    FROM courier_profiles c JOIN users u ON u.id=c.user_id
    LEFT JOIN online_orders o ON o.courier_id=c.user_id
      AND o.status NOT IN ('Entregado','Cancelado','Rechazado')
    WHERE c.active=1 AND u.status='active'
    GROUP BY c.user_id HAVING COUNT(o.id)<c.max_active_orders ORDER BY u.display_name LIMIT 60`).all();
   return respond(req,env,200,{couriers:results});
  }
  if(method==='POST'&&path==='/api/v1/restaurant/products')
   return respond(req,env,201,await createProduct(req,env,actor,access));
  const productRoute=/^\/api\/v1\/restaurant\/products\/([0-9a-f-]+)$/i.exec(path);
  if(method==='PATCH'&&productRoute)
   return respond(req,env,200,await updateProduct(req,env,actor,access,productRoute[1]));
  if(method==='PATCH'&&path==='/api/v1/restaurant/availability')
   return respond(req,env,200,await updateAvailability(req,env,actor,access));
  if(method==='GET'&&path==='/api/v1/restaurant/products'){
   const {results=[]}=await env.DB.prepare(`SELECT id,name,price_minor,available
     FROM products WHERE restaurant_id=? ORDER BY name,id LIMIT 150`).bind(access.restaurantId).all();
   return respond(req,env,200,{products:results});
  }
  const detail=/^\/api\/v1\/restaurant\/orders\/([0-9a-f-]+)$/i.exec(path);
  if(method==='GET'&&detail)
   return respond(req,env,200,await restaurantOrder(env,access,detail[1]));
  const status=/^\/api\/v1\/restaurant\/orders\/([0-9a-f-]+)\/status$/i.exec(path);
  if(method==='PATCH'&&status)
   return respond(req,env,200,await restaurantStatus(req,env,actor,access,status[1]));
  const assign=/^\/api\/v1\/restaurant\/orders\/([0-9a-f-]+)\/assign$/i.exec(path);
  if(method==='PATCH'&&assign)
   return respond(req,env,200,await assignCourier(req,env,actor,access,assign[1]));
 }
 if(method==='GET'&&path==='/api/v1/courier/orders')
  return respond(req,env,200,await courierOrders(env,actor));
 const courierOfferMatch=/^\/api\/v1\/courier\/orders\/([0-9a-f-]+)\/offer$/i.exec(path);
 if(method==='POST'&&courierOfferMatch)
  return respond(req,env,200,await courierOffer(req,env,actor,courierOfferMatch[1]));
 const courierStatusMatch=/^\/api\/v1\/courier\/orders\/([0-9a-f-]+)\/status$/i.exec(path);
 if(method==='PATCH'&&courierStatusMatch)
  return respond(req,env,200,await courierStatus(req,env,actor,courierStatusMatch[1]));
 const deliver=/^\/api\/v1\/courier\/orders\/([0-9a-f-]+)\/deliver$/i.exec(path);
 if(method==='POST'&&deliver)
  return respond(req,env,200,await confirmDelivery(req,env,actor,deliver[1]));
 if(method==='GET'&&path==='/api/v1/customer/orders')
  return respond(req,env,200,await customerOrders(env,actor));
 if(method==='GET'&&path==='/api/v1/customer/orders/checkout')
  return respond(req,env,200,await customerCheckoutStatus(req,env,actor));
 if(method==='POST'&&path==='/api/v1/customer/orders')
  return respond(req,env,201,await customerCreate(req,env,actor));
 const customerDetail=/^\/api\/v1\/customer\/orders\/([0-9a-f-]+)$/i.exec(path);
 if(method==='GET'&&customerDetail)
  return respond(req,env,200,await customerOrder(env,actor,customerDetail[1]));
 const cancel=/^\/api\/v1\/customer\/orders\/([0-9a-f-]+)\/cancel$/i.exec(path);
 if(method==='POST'&&cancel)
  return respond(req,env,200,await customerCancel(req,env,actor,cancel[1]));
 throw new ApiError(404,'NOT_FOUND');
}

export default {
 async fetch(req,env){
  try{return await route(req,env)}
  catch(error){
   if(error instanceof ApiError){
    return respond(req,env,error.status,{error:error.code,message:error.message});
   }
   // Never log authorization headers, request bodies, PINs, secrets or private addresses.
   console.error(JSON.stringify({service:'dvolada-online',event:'request_failed',
     category:'internal_error'}));
   return respond(req,env,503,{error:'SERVICE_UNAVAILABLE'});
  }
 }
};
