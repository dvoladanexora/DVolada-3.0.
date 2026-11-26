import {ApiError,readJson,requireUuid,requireText,requireKeys,requireInteger,requireRole,requireStaff} from './security.js';

import {photoType} from './restaurant-operations.js';

const plans=['ONLINE','LOCAL','PLUS'],roles=['owner','manager','kitchen','cashier'];
function pick(value,allowed,field){
 if(!allowed.includes(value))throw new ApiError(400,'INVALID_INPUT','Invalid '+field);
 return value;
}
function countMinor(value){return requireInteger(value,0,100000000,'priceMinor')}
const getRest=async(env,id)=>{
 const r=await env.DB.prepare('SELECT id,name,plan,subscription_status,online_state,delivery_fee_minor FROM restaurants WHERE id=?')
   .bind(requireUuid(id)).first();
 if(!r)throw new ApiError(404,'RESTAURANT_NOT_FOUND');
 return r;
};
export async function createRestaurant(req,env,actor){
 requireRole(actor,'platform_admin');
 const body=await readJson(req);requireKeys(body,['name','plan']);
 const name=requireText(body.name,2,160,'name'),plan=pick(body.plan,plans,'plan'),id=crypto.randomUUID();
 await env.DB.batch([
  env.DB.prepare(`INSERT INTO restaurants(id,name,plan,subscription_status,online_state)
    VALUES(?,? ,?,'inactive','closed')`).bind(id,name,plan),
  env.DB.prepare(`INSERT INTO platform_audit(actor_id,restaurant_id,action)
    VALUES(?,?,'restaurant_created')`).bind(actor.userId,id)
 ]);
 return {restaurant:{id,name,plan,subscriptionStatus:'inactive',onlineState:'closed'}};
}
export async function updateRestaurant(req,env,actor,restaurantId){
 requireRole(actor,'platform_admin');
 const id=requireUuid(restaurantId),body=await readJson(req);requireKeys(body,['name','plan','subscriptionStatus','deliveryFeeMinor']);
 if(!Object.keys(body).length)throw new ApiError(400,'INVALID_BODY');
 await getRest(env,id);
 const name=body.name===undefined?null:requireText(body.name,2,160,'name');
 const plan=body.plan===undefined?null:pick(body.plan,plans,'plan');
 const subscription=body.subscriptionStatus===undefined?null:
  pick(body.subscriptionStatus,['active','inactive'],'subscriptionStatus');
 const fee=body.deliveryFeeMinor===undefined?null:countMinor(body.deliveryFeeMinor);
 await env.DB.batch([
  env.DB.prepare(`UPDATE restaurants SET name=COALESCE(?,name),plan=COALESCE(?,plan),
   subscription_status=COALESCE(?,subscription_status),delivery_fee_minor=COALESCE(?,delivery_fee_minor),
   online_state=CASE WHEN COALESCE(?,subscription_status)='inactive' OR COALESCE(?,plan)='LOCAL'
    THEN 'closed' ELSE online_state END WHERE id=?`)
   .bind(name,plan,subscription,fee,subscription,plan,id),
  env.DB.prepare(`INSERT INTO platform_audit(actor_id,restaurant_id,action)
   VALUES(?,?,'restaurant_updated')`).bind(actor.userId,id)
 ]);
 return {restaurant:await getRest(env,id)};
}
export async function assignMember(req,env,actor,restaurantId){
 requireRole(actor,'platform_admin');
 const id=requireUuid(restaurantId);await getRest(env,id);
 const body=await readJson(req);requireKeys(body,['userId','staffRole']);
 const userId=requireUuid(body.userId,'userId'),role=pick(body.staffRole,roles,'staffRole');
 const user=await env.DB.prepare('SELECT id,status FROM users WHERE id=?').bind(userId).first();
 if(!user||user.status!=='active')throw new ApiError(404,'USER_NOT_FOUND');
 await env.DB.batch([
  env.DB.prepare(`INSERT INTO restaurant_memberships(restaurant_id,user_id,staff_role,active)
   VALUES(?,?,?,1) ON CONFLICT(restaurant_id,user_id)
   DO UPDATE SET staff_role=excluded.staff_role,active=1`).bind(id,userId,role),
  env.DB.prepare(`INSERT INTO platform_audit(actor_id,restaurant_id,subject_id,action)
    VALUES(?,?,?,'membership_assigned')`).bind(actor.userId,id,userId)
 ]);
 return {restaurantId:id,userId,staffRole:role};
}
export async function enrollCourier(req,env,actor){
 requireRole(actor,'platform_admin');
 const body=await readJson(req);requireKeys(body,['userId','applicationCreatedAt']);
 const userId=requireUuid(body.userId,'userId');
 if(body.applicationCreatedAt!==undefined&&(!Number.isSafeInteger(body.applicationCreatedAt)||body.applicationCreatedAt<1))throw new ApiError(400,'INVALID_INPUT');
 if(actor.userId===userId)throw new ApiError(403,'CANNOT_ENROLL_SELF');
 const [approved]=await env.DB.batch([
  env.DB.prepare(`UPDATE users SET account_role='courier' WHERE id=? AND account_role='customer' AND status='active'
   AND NOT EXISTS(SELECT 1 FROM restaurant_memberships WHERE user_id=users.id)
   AND (? IS NULL OR EXISTS(SELECT 1 FROM courier_applications WHERE user_id=users.id AND created_at=?))`).bind(userId,body.applicationCreatedAt??null,body.applicationCreatedAt??null),
  env.DB.prepare(`INSERT INTO courier_profiles(user_id,active,max_active_orders,available)
   SELECT ?,1,2,0 WHERE changes()>0
   ON CONFLICT(user_id) DO UPDATE SET active=1,max_active_orders=2,available=0`).bind(userId),
  env.DB.prepare(`INSERT INTO platform_audit(actor_id,subject_id,action)
   SELECT ?,?,'courier_enrolled' WHERE changes()>0`).bind(actor.userId,userId)
 ]);
 if(!approved.meta.changes)throw new ApiError(409,'COURIER_ENROLLMENT_FORBIDDEN');
 return {courierId:userId,active:true,maxActiveOrders:2};
}
export async function restoreCourierProfile(env,actor,userId){
 requireRole(actor,'platform_admin');
 const id=requireUuid(userId,'userId');
 const [restored]=await env.DB.batch([
  env.DB.prepare(`INSERT INTO courier_profiles(user_id,active,max_active_orders,available)
   SELECT u.id,1,2,0 FROM users u WHERE u.id=? AND u.account_role='courier'
    AND u.status='active' AND u.admin_locked=0
    AND NOT EXISTS(SELECT 1 FROM restaurant_memberships m WHERE m.user_id=u.id AND m.active=1)
   ON CONFLICT(user_id) DO NOTHING`).bind(id),
  env.DB.prepare(`INSERT INTO control_audit(actor_id,subject,action,detail)
   SELECT ?,?,'courier_profile_restored','{}' WHERE changes()>0`).bind(actor.userId,id)
 ]);
 if(!restored.meta.changes)throw new ApiError(409,'COURIER_ENROLLMENT_FORBIDDEN');
 return {courierId:id,active:true,available:false,maxActiveOrders:2};
}
export async function createProduct(req,env,actor,access){
 requireStaff(access.staff_role,['owner','manager']);
 const body=await readJson(req,165000);requireKeys(body,['name','priceMinor','available','category','photoBase64']);
 const name=requireText(body.name,2,150,'name'),price=countMinor(body.priceMinor);
 if(body.available!==undefined&&typeof body.available!=='boolean')throw new ApiError(400,'INVALID_INPUT');
 const available=body.available===false?0:1;
 const id=crypto.randomUUID(),category=body.category===undefined?'':requireText(body.category,0,60,'category');
 let mime=null;
 if(body.photoBase64!==undefined){
  if(typeof body.photoBase64==='string'&&body.photoBase64.length<=163840){try{mime=photoType(atob(body.photoBase64))}catch{}}
  if(!mime)throw new ApiError(400,'INVALID_PHOTO');
 }
 await env.DB.batch([
  env.DB.prepare('INSERT INTO products(id,restaurant_id,name,price_minor,available,category) VALUES(?,?,?,?,?,?)')
   .bind(id,access.restaurantId,name,price,available,category),
  env.DB.prepare(`INSERT INTO restaurant_audit(restaurant_id,actor_id,product_id,action)
   VALUES(?,?,?,'product_created')`).bind(access.restaurantId,actor.userId,id),
  ...(mime?[env.DB.prepare('INSERT INTO restaurant_product_photos(product_id,mime,image_base64) VALUES(?,?,?)').bind(id,mime,body.photoBase64),env.DB.prepare("INSERT INTO restaurant_operation_log(restaurant_id,actor_id,action,subject_id) VALUES(?,?,'photo_saved',?)").bind(access.restaurantId,actor.userId,id)]:[])
 ]);
 return {product:{id,restaurantId:access.restaurantId,name,priceMinor:price,available:Boolean(available),category,...(mime?{photoUrl:'/api/v1/catalog/photos/'+id}:{})}};
}
export async function updateProduct(req,env,actor,access,productId){
 requireStaff(access.staff_role,['owner','manager']);
 const id=requireUuid(productId);
 const current=await env.DB.prepare('SELECT id,name,price_minor,available FROM products WHERE id=? AND restaurant_id=?')
  .bind(id,access.restaurantId).first();
 if(!current)throw new ApiError(404,'PRODUCT_NOT_FOUND');
 const body=await readJson(req);requireKeys(body,['name','priceMinor','available','category']);
 if(!Object.keys(body).length)throw new ApiError(400,'INVALID_BODY');
 const name=body.name===undefined?null:requireText(body.name,2,150,'name');
 const price=body.priceMinor===undefined?null:countMinor(body.priceMinor);
 if(body.available!==undefined&&typeof body.available!=='boolean')throw new ApiError(400,'INVALID_INPUT');
 const available=body.available===undefined?null:body.available?1:0;
 const category=body.category===undefined?null:requireText(body.category,0,60,'category');
 await env.DB.batch([
  env.DB.prepare(`UPDATE products SET name=COALESCE(?,name),price_minor=COALESCE(?,price_minor),
   available=COALESCE(?,available),category=COALESCE(?,category) WHERE id=? AND restaurant_id=?`)
   .bind(name,price,available,category,id,access.restaurantId),
  env.DB.prepare(`INSERT INTO restaurant_audit(restaurant_id,actor_id,product_id,action)
   VALUES(?,?,?,'product_updated')`).bind(access.restaurantId,actor.userId,id)
 ]);
 const product=await env.DB.prepare('SELECT name,price_minor,available FROM products WHERE id=? AND restaurant_id=?')
  .bind(id,access.restaurantId).first();
 return {product:{id,name:product.name,priceMinor:product.price_minor,available:Boolean(product.available)}};
}
export async function updateAvailability(req,env,actor,access){
 requireStaff(access.staff_role,['owner','manager']);
 const body=await readJson(req);requireKeys(body,['state']);
 const state=pick(body.state,['open','paused','closed'],'state');
 await env.DB.batch([
  env.DB.prepare('UPDATE restaurants SET online_state=? WHERE id=?').bind(state,access.restaurantId),
  env.DB.prepare(`INSERT INTO restaurant_audit(restaurant_id,actor_id,action)
   VALUES(?,?,'availability_updated')`).bind(access.restaurantId,actor.userId)
 ]);
 return {onlineState:state};
}
