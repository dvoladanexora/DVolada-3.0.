import {controlRoute} from './control-center.js';
import {googleControlAuth,googleControlActor,googleControlRequired,clearControlCookie} from './google-admin-session.js';
import {courierProfile,courierAvailability,courierApplication,rejectCourierApplication,pendingCouriers,revokeCourierSessions,courierHistory,courierRestaurantChat} from './courier-workspace.js';
import {restaurantProfile,menuOption,savePhoto,publicPhoto,staffRoster,restaurantCash,restaurantReport} from './restaurant-operations.js';
import {
 ApiError,requireUuid,identity,assertConfiguration,assertAllowedOrigin,respond,preflight,
 restaurantAccess,requireStaff,mutationRateLimit
} from './security.js';
import {
 restaurantOrders,restaurantOrder,changes,restaurantStatus,assignCourier,
 courierOrders,courierStatus,courierOffer,confirmDelivery,customerCreate,customerOrders,
 customerOrder,customerCancel,customerCheckoutStatus,customerCoupon
} from './orders.js';
import { issueQaPushIdentity } from './qa-push-identity.js';
import {createRestaurant,updateRestaurant,assignMember,enrollCourier,createProduct,
 updateProduct,updateAvailability} from './management.js';

import {adminFlash,flashCatalogue} from './flash.js';
import {clientPasskey} from './client-passkeys.js';
import {clientAccessEnabled,readClientCookie,changeClientCookie} from './client-access.js';
import {inviteOwner} from './privileged-access.js';
import {staffAccess,staffAuthenticate} from './staff-access.js';
import {settlements,settlementRule,requireSettlementStaff} from './restaurant-settlements.js';
import {favorites,clientProfile,conversation,orderClaim} from './client-workspace.js';

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
  const afterName=url.searchParams.get('afterName'),afterId=url.searchParams.get('afterId');
  if((afterName===null)!==(afterId===null))throw new ApiError(400,'INVALID_CURSOR');
  const continuation=afterId===null?'':' AND (name,id)>(?,?)';
  const statement=env.DB.prepare(`SELECT id,name,online_state,delivery_fee_minor
   FROM restaurants WHERE plan IN ('ONLINE','PLUS') AND subscription_status='active'
    AND online_state IN ('open','paused')`+continuation+' ORDER BY name,id LIMIT 101');
  const {results}=await (afterId===null?statement:statement.bind(afterName,afterId)).all();
  const restaurants=results.slice(0,100);
  const last=restaurants.at(-1);
  return respond(req,env,200,{restaurants,...results.length>100&&{next:{afterName:last.name,afterId:last.id}}});
 }
 if(method==='GET'&&path==='/api/v1/catalog/feed'){
  const cursor=url.searchParams.get('after');
  const term=(url.searchParams.get('q')||'').trim();
  if(term.length>60)throw new ApiError(400,'INVALID_SEARCH');
  if(cursor!==null)requireUuid(cursor);
  const where=cursor===null?'':' AND p.id>?';
  const search=term?' AND (instr(lower(p.name),lower(?))>0 OR instr(lower(r.name),lower(?))>0 OR instr(lower(coalesce(p.category,\'\')),lower(?))>0)':'';
  const bindings=[...(cursor===null?[]:[cursor]),...(term?[term,term,term]:[])];
  const stmt=env.DB.prepare(`SELECT p.id,p.name,p.price_minor,p.category,r.id AS restaurant_id,
   r.name AS restaurant_name,r.online_state,
   EXISTS(SELECT 1 FROM restaurant_product_photos photo WHERE photo.product_id=p.id) AS has_photo
   FROM products p JOIN restaurants r ON r.id=p.restaurant_id
   WHERE p.available=1 AND r.plan IN ('ONLINE','PLUS') AND r.subscription_status='active'
   AND r.online_state IN ('open','paused')`+where+search+' ORDER BY p.id LIMIT 25');
  const {results=[]}=await (bindings.length?stmt.bind(...bindings):stmt).all();
  const products=results.slice(0,24).map(({has_photo,...product})=>({...product,photoUrl:has_photo?'/api/v1/catalog/photos/'+product.id:null}));
  return respond(req,env,200,{products,next:results.length>24?products.at(-1).id:null});
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
 const photo=/^\/api\/v1\/catalog\/photos\/([0-9a-f-]+)$/i.exec(path);
 if(method==='GET'&&photo)return publicPhoto(env,photo[1]);
 const catalog=/^\/api\/v1\/catalog\/restaurants\/([0-9a-f-]+)\/products$/i.exec(path);
 if(method==='GET'&&catalog){
  const id=requireUuid(catalog[1]);
  const rest=await env.DB.prepare(`SELECT id,name,online_state,delivery_fee_minor,
    (SELECT address FROM restaurant_profiles WHERE restaurant_id=restaurants.id) AS address,
    (SELECT description FROM restaurant_profiles WHERE restaurant_id=restaurants.id) AS description,
    (SELECT hours FROM restaurant_profiles WHERE restaurant_id=restaurants.id) AS hours
    FROM restaurants WHERE id=?
    AND plan IN ('ONLINE','PLUS') AND subscription_status='active'
    AND online_state IN ('open','paused')`).bind(id).first();
  if(!rest)throw new ApiError(404,'RESTAURANT_NOT_FOUND');
  const {results=[]}=await env.DB.prepare(`SELECT id,name,price_minor,category,
    EXISTS(SELECT 1 FROM restaurant_product_photos photo WHERE photo.product_id=products.id) AS has_photo
    FROM products WHERE restaurant_id=? AND available=1 ORDER BY name,id LIMIT 150`).bind(id).all();
  const {results:options=[]}=await env.DB.prepare(`SELECT o.id,o.product_id,o.name,o.kind,o.price_minor
   FROM product_options o JOIN products p ON p.id=o.product_id WHERE p.restaurant_id=? AND p.available=1 AND o.available=1
   ORDER BY o.name,o.id LIMIT 500`).bind(id).all();
  const byProduct=new Map();
  for(const option of options){
   if(!byProduct.has(option.product_id))byProduct.set(option.product_id,[]);
   byProduct.get(option.product_id).push(option);
  }
  return respond(req,env,200,{restaurant:rest,products:results.map(({has_photo,...product})=>({...product,photoUrl:has_photo?'/api/v1/catalog/photos/'+product.id:null,options:byProduct.get(product.id)||[]}))});
 }
 const access=/^\/api\/v1\/auth\/client\/(register|login|recover)\/(begin|finish)$/.exec(path);
 if(method==='POST'&&access)return clientPasskey(req,env,access[1],access[2]);
 if(method==='POST'&&/^\/api\/v1\/auth\/client\/(register|login|recover)$/.test(path))
  throw new ApiError(410,'CLIENT_LEGACY_RETIRED');
 if(method==='GET'&&path==='/api/v1/catalog/flash')
  return respond(req,env,200,{...(env.QA_FLASH==='true'?await flashCatalogue(env):{campaigns:[]}),enabled:env.QA_FLASH==='true'});
 if(method==='GET'&&path==='/api/v1/auth/client/config')
  return respond(req,env,200,{enabled:clientAccessEnabled(req,env),...(env.QA_RESTAURANT_COMMERCIAL==='true'?{commercial:true}:{})});
 const commercial=env.QA_RESTAURANT_COMMERCIAL==='true';
 const staffLogin=/^\/api\/v1\/auth\/staff\/(claim|login)$/.exec(path);
 if(commercial&&method==='POST'&&staffLogin)return staffAuthenticate(req,env,staffLogin[1]);
 const googleRoute=/^\/api\/v1\/auth\/control\/(challenge|login)$/.exec(path);
 if(googleRoute)return googleControlAuth(req,env,googleRoute[1]);
 const googleMode=req.headers.get('x-dvolada-admin')==='1';
 if(googleMode&&!/^\/api\/v1\/(admin\/|auth\/(me|logout|revoke-sessions)$)/.test(path))throw new ApiError(403,'ROLE_FORBIDDEN');
 const token=!googleMode&&!req.headers.has('authorization')&&readClientCookie(req,env);
 if(token){
  if(!/^\/api\/v1\/(customer\/|orders\/|restaurant\/|courier\/|admin\/|auth\/(me|logout|revoke-sessions)$)/.test(path))
   throw new ApiError(403,'ROLE_FORBIDDEN');
  if(method!=='GET'&&req.headers.get('origin')!==url.origin)throw new ApiError(403,'ORIGIN_FORBIDDEN');
  const headers=new Headers(req.headers);
  headers.set('authorization','Bearer '+token);
  req=new Request(req,{headers});
 }
 const actor=googleMode?await googleControlActor(req,env):await identity(req,env);
 if(actor.role==='platform_admin'&&!actor.googleAdmin&&googleControlRequired(req,env))throw new ApiError(403,'GOOGLE_ADMIN_REQUIRED');
 if(token&&((!['customer','courier'].includes(actor.role)&&!(actor.role==='platform_admin'&&actor.privilegedPasskey))||(path!=='/api/v1/auth/me'&&req.headers.get('x-client-account')!==actor.userId)))
  throw new ApiError(401,'SESSION_INVALID');

 if(token&&path.startsWith('/api/v1/admin/')&&!(actor.role==='platform_admin'&&actor.privilegedPasskey))
  throw new ApiError(403,'ROLE_FORBIDDEN');
 if(token&&actor.role==='platform_admin'&&!/^\/api\/v1\/(admin\/|auth\/(me|logout|revoke-sessions)$)/.test(path))
  throw new ApiError(403,'ROLE_FORBIDDEN');
 if(token&&!actor.staffRestaurantId&&(actor.role==='courier'?!/^\/api\/v1\/(courier\/|orders\/[0-9a-f-]+\/chat\/(courier|dispatch)$|auth\/(me|logout|revoke-sessions)$)/i.test(path):path.startsWith('/api/v1/courier/')))
  throw new ApiError(403,'ROLE_FORBIDDEN');
 if(actor.staffRestaurantId){
  if((!commercial&&!actor.privilegedPasskey)||!/^\/api\/v1\/(restaurant\/|orders\/[0-9a-f-]+\/chat\/(restaurant|dispatch)$|auth\/(me|logout|revoke-sessions)$)/i.test(path))
   throw new ApiError(403,'ROLE_FORBIDDEN');
 }else if(token&&path.startsWith('/api/v1/restaurant/'))throw new ApiError(403,'ROLE_FORBIDDEN');

 if(['POST','PATCH'].includes(method))await mutationRateLimit(env,actor);
 if(path.startsWith('/api/v1/admin/control/'))return controlRoute(req,env,actor,path.slice('/api/v1/admin/control/'.length));
 if(method==='POST'&&path==='/api/v1/push/identity'){
  return respond(req,env,200,await issueQaPushIdentity(req,env,actor));
 }
 if(method==='GET'&&path==='/api/v1/auth/me'){
  const {results=[]}=actor.googleAdmin||token&&!actor.staffRestaurantId?{}:await env.DB.prepare(`SELECT m.restaurant_id,m.staff_role,r.name
    FROM restaurant_memberships m JOIN restaurants r ON r.id=m.restaurant_id
    WHERE m.user_id=? AND m.active=1 AND (? IS NULL OR m.restaurant_id=?) ORDER BY r.name LIMIT 50`)
    .bind(actor.userId,actor.staffRestaurantId,actor.staffRestaurantId).all();
  return respond(req,env,200,{user:{id:actor.userId,displayName:actor.displayName,
    role:actor.role, ...(actor.googleAdmin?{googleAdmin:true}:{}), ...(actor.privilegedPasskey?{privilegedPasskey:true}:{})},restaurants:results});
 }
 if(method==='POST'&&path==='/api/v1/auth/revoke-sessions'){
  if(!actor.privilegedPasskey&&!actor.googleAdmin)throw new ApiError(403,'ROLE_FORBIDDEN');
  await env.DB.batch([
   env.DB.prepare('UPDATE users SET admin_version=admin_version+1 WHERE id=?').bind(actor.userId),
   env.DB.prepare('UPDATE auth_sessions SET revoked_at=unixepoch() WHERE user_id=? AND revoked_at IS NULL').bind(actor.userId)
  ]);
  return actor.googleAdmin?clearControlCookie(respond(req,env,204)):changeClientCookie(respond(req,env,204),'');
 }
 if(method==='POST'&&path==='/api/v1/auth/logout'){
  await env.DB.prepare('UPDATE auth_sessions SET revoked_at=? WHERE id=? AND revoked_at IS NULL')
   .bind(Math.floor(Date.now()/1000),actor.sessionId).run();
  return actor.googleAdmin?clearControlCookie(respond(req,env,204)):changeClientCookie(respond(req,env,204),'');
 }
 const thread=/^\/api\/v1\/orders\/([0-9a-f-]+)\/chat\/(restaurant|courier|dispatch)$/i.exec(path);
 if(thread&&['GET','POST'].includes(method)){
  if(actor.staffRestaurantId&&!await env.DB.prepare('SELECT 1 FROM online_orders WHERE id=? AND restaurant_id=?')
   .bind(requireUuid(thread[1]),actor.staffRestaurantId).first())throw new ApiError(404,'ORDER_NOT_FOUND');
  if(thread[2]==='dispatch'){
   if(token&&actor.role==='customer'&&!actor.staffRestaurantId)throw new ApiError(404,'CONVERSATION_NOT_FOUND');
   return courierRestaurantChat(req,env,actor,thread[1]);
  }
  return conversation(req,env,actor,thread[1],thread[2],Boolean(token)&&actor.role==='customer'&&!actor.staffRestaurantId);
 }
 const claim=/^\/api\/v1\/orders\/([0-9a-f-]+)\/claim$/i.exec(path);
 if(claim&&['GET','POST','PATCH'].includes(method))return orderClaim(req,env,actor,claim[1]);
 const favorite=/^\/api\/v1\/customer\/favorites\/([0-9a-f-]+)$/i.exec(path);
 if(path==='/api/v1/customer/favorites'&&method==='GET'||favorite&&method==='PATCH')
  return favorites(req,env,actor,favorite?.[1]);
 if(path==='/api/v1/customer/profile'&&['GET','PATCH'].includes(method))return clientProfile(req,env,actor);
 if(method==='GET'&&path==='/api/v1/customer/flash')
  return respond(req,env,200,env.QA_FLASH==='true'?await flashCatalogue(env,actor):{campaigns:[]});
 const flashAdmin=/^\/api\/v1\/admin\/flash(?:\/([0-9a-f-]+))?$/.exec(path);
 if(flashAdmin&&env.QA_FLASH==='true'&&(flashAdmin[1]?method==='PATCH':['GET','POST'].includes(method)))
  return respond(req,env,method==='POST'?201:200,await adminFlash(req,env,actor,flashAdmin[1]));
 if(method==='GET'&&path==='/api/v1/admin/overview'){
  if(actor.role!=='platform_admin')throw new ApiError(403,'ROLE_FORBIDDEN');
  // Honduras is UTC-06 throughout the year. Count activity by local day.
  const now=Math.floor(Date.now()/1000),start=Math.floor((now-21600)/86400)*86400+21600,end=start+86400;
  const [restaurants,orders,couriers,today,accounts,alerts]=await Promise.all([
   env.DB.prepare(`SELECT COUNT(*) AS total,SUM(CASE WHEN online_state='open' AND subscription_status='active' THEN 1 ELSE 0 END) AS open,
      SUM(CASE WHEN subscription_status='active' THEN 1 ELSE 0 END) AS affiliated FROM restaurants WHERE plan IN ('ONLINE','PLUS')`).first(),
   env.DB.prepare(`SELECT COUNT(*) AS total,
     SUM(CASE WHEN status NOT IN ('Entregado','Cancelado','Rechazado') THEN 1 ELSE 0 END) AS active,
     SUM(CASE WHEN status='Entregado' THEN 1 ELSE 0 END) AS delivered FROM online_orders`).first(),
   env.DB.prepare(`SELECT COUNT(*) AS active,COALESCE(SUM(CASE WHEN c.available=1 THEN 1 ELSE 0 END),0) AS available
    FROM courier_profiles c JOIN users u ON u.id=c.user_id WHERE c.active=1 AND u.status='active' AND u.admin_locked=0`).first(),
   env.DB.prepare(`SELECT COUNT(*) AS orders,COALESCE(SUM(CASE WHEN status='Entregado' THEN 1 ELSE 0 END),0) AS delivered,
     COALESCE(SUM(CASE WHEN status IN ('Cancelado','Rechazado') THEN 1 ELSE 0 END),0) AS cancelled
     FROM online_orders WHERE created_at>=? AND created_at<?`).bind(start,end).first(),
   env.DB.prepare(`SELECT
    (SELECT COUNT(*) FROM users u JOIN client_credentials c ON c.user_id=u.id WHERE u.account_role IN ('customer','courier') AND c.login_name IS NOT NULL) AS registered,
    (SELECT COUNT(DISTINCT s.user_id) FROM auth_sessions s JOIN users u ON u.id=s.user_id WHERE s.created_at>=? AND s.created_at<? AND u.account_role IN ('customer','courier')) AS signedInToday,
    (SELECT COUNT(DISTINCT s.user_id) FROM auth_sessions s JOIN users u ON u.id=s.user_id WHERE s.expires_at>? AND s.revoked_at IS NULL AND u.status='active' AND u.account_role IN ('customer','courier')) AS activeSessions`).bind(start,end,now).first(),
   env.DB.prepare(`SELECT
    (SELECT COUNT(*) FROM order_claims WHERE status!='resolved') AS claims,
    (SELECT COUNT(*) FROM courier_applications a JOIN users u ON u.id=a.user_id WHERE u.account_role='customer' AND u.status='active') AS courierRequests,
    (SELECT COUNT(*) FROM online_orders WHERE courier_response='offered' AND courier_offer_expires_at<=? AND status NOT IN ('Entregado','Cancelado','Rechazado')) AS expiredOffers,
    (SELECT COUNT(*) FROM online_orders WHERE pin_attempts>=5 AND status='En ubicación') AS lockedPins`).bind(now).first()
  ]);
  return respond(req,env,200,{restaurants:{total:restaurants.total,open:restaurants.open??0,affiliated:restaurants.affiliated??0},
   orders:{total:orders.total,active:orders.active??0,delivered:orders.delivered??0},couriers:{active:couriers.active,available:couriers.available},
   today,accounts,alerts,dayStart:start,asOf:now});
 }
 if(method==='GET'&&path==='/api/v1/admin/courier-directory'){
  if(actor.role!=='platform_admin')throw new ApiError(403,'ROLE_FORBIDDEN');
  const q=(url.searchParams.get('q')||'').trim(),after=url.searchParams.get('after')||'';
  if(q.length>80)throw new ApiError(400,'INVALID_SEARCH');
  if(after)requireUuid(after);
  const {results=[]}=await env.DB.prepare(`SELECT u.id,u.display_name,u.phone_e164,u.status,u.admin_locked,u.created_at,
    c.active,c.available,c.max_active_orders,
    (SELECT COUNT(*) FROM online_orders o WHERE o.courier_id=u.id AND o.status='Entregado') AS delivered,
    (SELECT COUNT(*) FROM online_orders o WHERE o.courier_id=u.id AND o.status NOT IN ('Entregado','Cancelado','Rechazado')) AS active_orders
    FROM courier_profiles c JOIN users u ON u.id=c.user_id
    WHERE u.account_role='courier' AND (?='' OR u.id>?) AND (?='' OR instr(lower(u.display_name),lower(?))>0 OR instr(coalesce(u.phone_e164,''),?)>0)
    ORDER BY u.id LIMIT 51`).bind(after,after,q,q,q).all();
  const couriers=results.slice(0,50);
  return respond(req,env,200,{couriers,next:results.length>50?couriers.at(-1).id:null});
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
 const ownerInvite=/^\/api\/v1\/admin\/restaurants\/([0-9a-f-]+)\/owner-invitations$/i.exec(path);
 if(method==='POST'&&ownerInvite)return respond(req,env,201,await inviteOwner(req,env,actor,requireUuid(ownerInvite[1])));
 const platformMember=/^\/api\/v1\/admin\/restaurants\/([0-9a-f-]+)\/members$/i.exec(path);
 if(method==='POST'&&platformMember)
  return respond(req,env,200,await assignMember(req,env,actor,platformMember[1]));
 if(clientAccessEnabled(req,env)&&['GET','POST'].includes(method)&&path==='/api/v1/customer/courier-application')
  return respond(req,env,200,await courierApplication(req,env,actor));
 if(method==='GET'&&path==='/api/v1/admin/courier-applications')
  return respond(req,env,200,await pendingCouriers(env,actor));
 if(method==='POST'&&path==='/api/v1/admin/courier-applications/reject')
  return respond(req,env,200,await rejectCourierApplication(req,env,actor));
 if(method==='POST'&&path==='/api/v1/admin/couriers')
  return respond(req,env,201,await enrollCourier(req,env,actor));
 if(commercial){
  const rules=/^\/api\/v1\/admin\/settlement-rules\/([0-9a-f-]+)$/i.exec(path);
  if(rules&&['GET','POST'].includes(method))return respond(req,env,200,await settlementRule(req,env,actor,rules[1]));
  const central=/^\/api\/v1\/admin\/settlements\/([0-9a-f-]+)(?:\/([0-9a-f-]+)(?:\/(calculate|approve|markPaid|adjust))?)?$/.exec(path);
  if(central&&(method==='GET'&&!central[3]||method==='POST'&&(!central[2]||central[3]))){
   if(actor.role!=='platform_admin')throw new ApiError(403,'ROLE_FORBIDDEN');
   return respond(req,env,200,await settlements(req,env,actor,requireUuid(central[1]),central[2]&&requireUuid(central[2]),central[3],true));
  }
 }
 if(path.startsWith('/api/v1/restaurant/')){
  const access=await restaurantAccess(req,env,actor);
  requireStaff(access.staff_role,['owner','manager','kitchen','cashier']);
  if(commercial){
   const staff=/^\/api\/v1\/restaurant\/staff-access(?:\/([0-9a-f-]+)\/(state|role|reset|revoke))?$/.exec(path);
   if(staff&&(method==='POST'||method==='GET'&&!staff[1]))
    return respond(req,env,200,await staffAccess(req,env,actor,access,staff[1],staff[2]));
   const period=/^\/api\/v1\/restaurant\/settlements(?:\/([0-9a-f-]+)(?:\/(calculate))?)?$/.exec(path);
   if(period&&(method==='GET'&&!period[2]||method==='POST'&&(!period[1]||period[2]))){
    requireSettlementStaff(access);
    return respond(req,env,200,await settlements(req,env,actor,access.restaurantId,period[1]&&requireUuid(period[1]),period[2]));
   }
  }
  if(method==='GET'&&path==='/api/v1/restaurant/capabilities')
   return respond(req,env,200,{online:true,local:access.plan==='PLUS',
     restaurantId:access.restaurantId,staffRole:access.staff_role,onlineState:access.online_state});
  if(['GET','PATCH'].includes(method)&&path==='/api/v1/restaurant/profile')
   return respond(req,env,200,await restaurantProfile(req,env,actor,access));
  if(['GET','PATCH'].includes(method)&&path==='/api/v1/restaurant/staff')
   return respond(req,env,200,await staffRoster(req,env,actor,access));
  if(method==='GET'&&path==='/api/v1/restaurant/report')
   return respond(req,env,200,await restaurantReport(env,access,url));
  const cash=/^\/api\/v1\/restaurant\/cash(?:\/(open|close|sale))?$/.exec(path);
  if(cash&&(cash[1]?method==='POST':method==='GET'))
   return respond(req,env,200,await restaurantCash(req,env,actor,access,cash[1]));
  const options=/^\/api\/v1\/restaurant\/products\/([0-9a-f-]+)\/options(?:\/([0-9a-f-]+))?$/i.exec(path);
  if(options&&(options[2]?method==='PATCH':['GET','POST'].includes(method)))
   return respond(req,env,200,await menuOption(req,env,actor,access,options[1],options[2]));
  const managePhoto=/^\/api\/v1\/restaurant\/products\/([0-9a-f-]+)\/photo$/i.exec(path);
  if(method==='POST'&&managePhoto)return respond(req,env,200,await savePhoto(req,env,actor,access,managePhoto[1]));
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
      AND (o.courier_response='accepted' OR (o.courier_response='offered' AND o.courier_offer_expires_at>unixepoch()))
    WHERE c.active=1 AND c.available=1 AND u.status='active' AND u.account_role='courier'
    GROUP BY c.user_id HAVING COUNT(o.id)<MIN(c.max_active_orders,2) ORDER BY u.display_name LIMIT 60`).all();
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
   requireStaff(access.staff_role,['owner','manager']);
   const {results=[]}=await env.DB.prepare(`SELECT id,name,price_minor,available,category,
    CASE WHEN EXISTS(SELECT 1 FROM restaurant_product_photos WHERE product_id=products.id) THEN '/api/v1/catalog/photos/'||products.id END AS photoUrl
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
 if(method==='GET'&&path==='/api/v1/courier/profile')
  return respond(req,env,200,{profile:await courierProfile(env,actor)});
 if(method==='PATCH'&&path==='/api/v1/courier/availability')
  return respond(req,env,200,await courierAvailability(req,env,actor));
 if(method==='GET'&&path==='/api/v1/courier/history')
  return respond(req,env,200,await courierHistory(env,actor,url));
 if(method==='POST'&&path==='/api/v1/courier/revoke-sessions')
  return changeClientCookie(await revokeCourierSessions(req,env,actor),'');
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
 if(method==='POST'&&path==='/api/v1/customer/coupon')
  return respond(req,env,200,await customerCoupon(req,env,actor));
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
