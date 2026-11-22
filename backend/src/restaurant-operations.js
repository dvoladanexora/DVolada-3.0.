import {ApiError,idempotencyKey,readJson,requireInteger,requireKeys,requireStaff,requireText,requireUuid} from './security.js';
const methods=['cash','transfer','external_card'];
const manage=['owner','manager'], cashier=[...manage,'cashier'];
const resultRows=async query=>(await query.all()).results||[];
const audit=(env,actor,access,action,subject=null)=>env.DB.prepare(
 'INSERT INTO restaurant_operation_log(restaurant_id,actor_id,action,subject_id) VALUES(?,?,?,?)')
 .bind(access.restaurantId,actor.userId,action,subject);
const text=(value,max,field)=>requireText(value,0,max,field);
const coordinate=(value,max)=>{
 if(value===null)return null;
 if(typeof value!=='number'||!Number.isFinite(value)||Math.abs(value)>max)throw new ApiError(400,'INVALID_LOCATION');
 return value;
};
const matchClock=/^(?:[01][0-9]|2[0-3]):[0-5][0-9]$/;

export async function restaurantProfile(req,env,actor,access){
 requireStaff(access.staff_role,cashier);
 const id=access.restaurantId;
 if(req.method==='PATCH'){
  requireStaff(access.staff_role,manage);
  const body=await readJson(req);
  requireKeys(body,['description','address','latitude','longitude','hours','paymentMethods']);
  const latitude=coordinate(body.latitude,90),longitude=coordinate(body.longitude,180);
  if((latitude===null)!==(longitude===null))throw new ApiError(400,'INVALID_LOCATION');
  if(!Array.isArray(body.hours)||body.hours.length!==7||!body.hours.every(hour=>hour===null||
   (Array.isArray(hour)&&hour.length===2&&hour.every(value=>typeof value==='string'&&matchClock.test(value))&&hour[0]<hour[1])))
   throw new ApiError(400,'INVALID_HOURS');
  if(!Array.isArray(body.paymentMethods)||!body.paymentMethods.length||body.paymentMethods.length>methods.length||
   new Set(body.paymentMethods).size!==body.paymentMethods.length||!body.paymentMethods.every(method=>methods.includes(method)))
   throw new ApiError(400,'INVALID_PAYMENT_METHOD');
  await env.DB.batch([env.DB.prepare(`INSERT INTO restaurant_profiles(restaurant_id,description,address,latitude,longitude,hours,payment_methods)
   VALUES(?,?,?,?,?,?,?) ON CONFLICT(restaurant_id) DO UPDATE SET description=excluded.description,address=excluded.address,
   latitude=excluded.latitude,longitude=excluded.longitude,hours=excluded.hours,payment_methods=excluded.payment_methods`)
   .bind(id,text(body.description,500,'description'),text(body.address,250,'address'),latitude,longitude,
    JSON.stringify(body.hours),JSON.stringify(body.paymentMethods)),audit(env,actor,access,'profile_updated')]);
 }
 const profile=await env.DB.prepare('SELECT * FROM restaurant_profiles WHERE restaurant_id=?').bind(id).first();
 return {profile:profile?{description:profile.description,address:profile.address,latitude:profile.latitude,
  longitude:profile.longitude,hours:JSON.parse(profile.hours),paymentMethods:JSON.parse(profile.payment_methods)}:
  {description:'',address:'',latitude:null,longitude:null,hours:Array(7).fill(null),paymentMethods:['cash']}};
}

export async function menuOption(req,env,actor,access,productId,optionId){
 requireStaff(access.staff_role,manage);
 const id=requireUuid(productId);
 const product=await env.DB.prepare('SELECT id FROM products WHERE id=? AND restaurant_id=?').bind(id,access.restaurantId).first();
 if(!product)throw new ApiError(404,'PRODUCT_NOT_FOUND');
 if(req.method==='GET')return {options:await resultRows(env.DB.prepare(
  'SELECT id,name,kind,price_minor,available FROM product_options WHERE product_id=? ORDER BY name,id LIMIT 30').bind(id))};
 const body=await readJson(req);
 requireKeys(body,['name','kind','priceMinor','available']);
 const name=requireText(body.name,1,100,'name'),price=requireInteger(body.priceMinor,0,10000000,'priceMinor');
 if(!['variant','extra'].includes(body.kind)||typeof body.available!=='boolean')throw new ApiError(400,'INVALID_OPTIONS');
 const key=optionId?requireUuid(optionId):crypto.randomUUID();
 if(optionId&&!(await env.DB.prepare('SELECT 1 FROM product_options WHERE id=? AND product_id=?').bind(key,id).first()))
  throw new ApiError(404,'OPTION_NOT_FOUND');
 await env.DB.batch([
  env.DB.prepare(`INSERT INTO product_options(id,product_id,name,kind,price_minor,available)
   VALUES(?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET name=excluded.name,kind=excluded.kind,
    price_minor=excluded.price_minor,available=excluded.available WHERE product_options.product_id=excluded.product_id`)
   .bind(key,id,name,body.kind,price,+body.available),
  audit(env,actor,access,'menu_option_saved',id)
 ]);
 return {id:key};
}

const photoType=bytes=>{
 if(bytes.startsWith('\xff\xd8\xff'))return 'image/jpeg';
 if(bytes.startsWith('\x89PNG\r\n\x1a\n'))return 'image/png';
 if(bytes.startsWith('RIFF')&&bytes.slice(8,12)==='WEBP')return 'image/webp';
 return null;
};
export async function savePhoto(req,env,actor,access,productId){
 requireStaff(access.staff_role,manage);
 const id=requireUuid(productId);
 if(!await env.DB.prepare('SELECT 1 FROM products WHERE id=? AND restaurant_id=?').bind(id,access.restaurantId).first())
  throw new ApiError(404,'PRODUCT_NOT_FOUND');
 const body=await readJson(req,165000);
 requireKeys(body,['base64']);
 let mime=null;
 if(typeof body.base64==='string'&&body.base64.length<=163840){
  try{mime=photoType(atob(body.base64))}catch{}
 }
 if(!mime)throw new ApiError(400,'INVALID_PHOTO');
 await env.DB.batch([env.DB.prepare(`INSERT INTO restaurant_product_photos(product_id,mime,image_base64) VALUES(?,?,?)
   ON CONFLICT(product_id) DO UPDATE SET mime=excluded.mime,image_base64=excluded.image_base64`)
  .bind(id,mime,body.base64),audit(env,actor,access,'photo_saved',id)]);
 return {photoUrl:'/api/v1/catalog/photos/'+id};
}
export async function publicPhoto(env,id){
 const photo=await env.DB.prepare(`SELECT ph.mime,ph.image_base64 FROM restaurant_product_photos ph
  JOIN products p ON p.id=ph.product_id JOIN restaurants r ON r.id=p.restaurant_id
  WHERE ph.product_id=? AND r.subscription_status='active' AND r.plan IN ('ONLINE','PLUS')`).bind(requireUuid(id)).first();
 if(!photo)throw new ApiError(404,'PHOTO_NOT_FOUND');
 return new Response(Uint8Array.from(atob(photo.image_base64),c=>c.charCodeAt(0)),{
  headers:{'content-type':photo.mime,'x-content-type-options':'nosniff','cache-control':'public, max-age=60',
   'content-security-policy':"default-src 'none'"}
 });
}

export async function staffRoster(req,env,actor,access){
 requireStaff(access.staff_role,manage);
 const id=access.restaurantId;
 if(req.method==='PATCH'){
  requireStaff(access.staff_role,['owner']);
  const body=await readJson(req);
  requireKeys(body,['userId','role','active']);
  const user=requireUuid(body.userId);
  if(!['manager','kitchen','cashier'].includes(body.role)||typeof body.active!=='boolean'||user===actor.userId)
   throw new ApiError(400,'INVALID_STAFF_ROLE');
  const [adjusted]=await env.DB.batch([env.DB.prepare(`UPDATE restaurant_memberships SET staff_role=?,active=?
   WHERE restaurant_id=? AND user_id=? AND staff_role!='owner'
   AND NOT EXISTS(SELECT 1 FROM restaurant_staff_access a WHERE a.user_id=restaurant_memberships.user_id)
   AND EXISTS(SELECT 1 FROM restaurant_memberships me WHERE me.restaurant_id=? AND me.user_id=?
     AND me.staff_role='owner' AND me.active=1)`).bind(body.role,+body.active,id,user,id,actor.userId),
   env.DB.prepare(`INSERT INTO restaurant_operation_log(restaurant_id,actor_id,action,subject_id)
    SELECT ?,?,?,? WHERE changes()>0`).bind(id,actor.userId,body.active?'staff_enabled':'staff_disabled',user)
  ]);
  if(!adjusted.meta.changes)throw new ApiError(409,'STAFF_CHANGE_FORBIDDEN');

 }
 return {staff:await resultRows(env.DB.prepare(`SELECT m.user_id,u.display_name,m.staff_role,m.active,
  EXISTS(SELECT 1 FROM restaurant_staff_access a WHERE a.user_id=m.user_id AND a.restaurant_id=m.restaurant_id) AS managed
  FROM restaurant_memberships m JOIN users u ON u.id=m.user_id
  WHERE restaurant_id=? ORDER BY m.active DESC,u.display_name LIMIT 100`).bind(id))};
}

export async function restaurantCash(req,env,actor,access,operation){
 requireStaff(access.staff_role,cashier);
 const restaurant=access.restaurantId;
 const current=()=>env.DB.prepare('SELECT * FROM restaurant_shifts WHERE restaurant_id=? AND closed_at IS NULL').bind(restaurant).first();
 if(req.method==='GET')return {shift:await current(),history:await resultRows(env.DB.prepare(
  'SELECT * FROM restaurant_shifts WHERE restaurant_id=? AND closed_at IS NOT NULL ORDER BY closed_at DESC,id LIMIT 25').bind(restaurant))};
 const body=await readJson(req), key=idempotencyKey(req);
 if(operation==='open'){
  requireKeys(body,['openingMinor']);
  const amount=requireInteger(body.openingMinor,0,100000000,'openingMinor');
  let shift=await env.DB.prepare('SELECT * FROM restaurant_shifts WHERE restaurant_id=? AND open_key=?').bind(restaurant,key).first();
  if(!shift){
   await env.DB.prepare('INSERT OR IGNORE INTO restaurant_shifts(id,restaurant_id,opened_by,open_key,opening_minor) VALUES(?,?,?,?,?)')
    .bind(crypto.randomUUID(),restaurant,actor.userId,key,amount).run();
   shift=await env.DB.prepare('SELECT * FROM restaurant_shifts WHERE restaurant_id=? AND open_key=?').bind(restaurant,key).first();
  }
  if(!shift)throw new ApiError(409,'SHIFT_ALREADY_OPEN');
  if(shift.opening_minor!==amount)throw new ApiError(409,'IDEMPOTENCY_KEY_REUSED');
  return {shift};
 }
 const shiftId=requireUuid(body.shiftId);
 if(operation==='close'){
  requireKeys(body,['shiftId','countedMinor']);
  const count=requireInteger(body.countedMinor,0,100000000,'countedMinor');
  await env.DB.prepare(`UPDATE restaurant_shifts SET closed_by=?,closed_at=unixepoch(),close_key=?,counted_minor=?,
   expected_cash_minor=opening_minor+COALESCE((SELECT SUM(total_minor) FROM restaurant_sales WHERE shift_id=? AND method='cash'),0)
   WHERE id=? AND restaurant_id=? AND closed_at IS NULL
   AND NOT EXISTS(SELECT 1 FROM restaurant_shifts WHERE restaurant_id=? AND close_key=?)`)
   .bind(actor.userId,key,count,shiftId,shiftId,restaurant,restaurant,key).run();
  const closed=await env.DB.prepare('SELECT * FROM restaurant_shifts WHERE id=? AND restaurant_id=? AND close_key=?')
   .bind(shiftId,restaurant,key).first();
  if(!closed)throw new ApiError(409,'SHIFT_NOT_OPEN');
  if(closed.counted_minor!==count)throw new ApiError(409,'IDEMPOTENCY_KEY_REUSED');
  return {shift:closed};
 }
 requireKeys(body,['shiftId','orderId','method']);
 const order=requireUuid(body.orderId),method=body.method;
 if(!methods.includes(method))throw new ApiError(400,'INVALID_PAYMENT_METHOD');
 const sale=()=>env.DB.prepare('SELECT * FROM restaurant_sales WHERE order_id=? AND restaurant_id=?').bind(order,restaurant).first();
 let saved=await sale();
 if(!saved){
  try{
   await env.DB.prepare(`INSERT INTO restaurant_sales(order_id,shift_id,restaurant_id,actor_id,method,subtotal_minor,discount_minor,delivery_minor,total_minor)
    SELECT id,?,restaurant_id,?,?,subtotal_minor,discount_minor,delivery_fee_minor,total_minor-discount_minor FROM online_orders
    WHERE id=? AND restaurant_id=? ON CONFLICT(order_id) DO NOTHING`).bind(shiftId,actor.userId,method,order,restaurant).run();
  }catch(error){if(!String(error).includes('SALE_NOT_ALLOWED'))throw error;}
  saved=await sale();
 }
 if(!saved)throw new ApiError(409,'SALE_NOT_ALLOWED');
 if(saved.shift_id!==shiftId||saved.method!==method)throw new ApiError(409,'SALE_ALREADY_RECORDED');
 return {sale:saved};
}

export async function restaurantReport(env,access,url){
 requireStaff(access.staff_role,cashier);
 const from=requireInteger(Number(url.searchParams.get('from')),1,4102444800,'from');
 const until=requireInteger(Number(url.searchParams.get('until')),from+1,from+93*86400,'until');
 const params=[access.restaurantId,from,until];
 const totals=await resultRows(env.DB.prepare(`SELECT s.method,COUNT(*) AS orders,
  SUM(s.subtotal_minor) AS subtotalMinor,SUM(s.discount_minor) AS discountMinor,
  SUM(s.delivery_minor) AS deliveryMinor,SUM(s.total_minor) AS totalMinor
  FROM restaurant_sales s WHERE s.restaurant_id=? AND s.paid_at>=? AND s.paid_at<? GROUP BY s.method`).bind(...params));
 const sales=await resultRows(env.DB.prepare(`SELECT o.order_number,o.flash_gift_name,s.paid_at,s.method,s.total_minor,s.discount_minor,s.delivery_minor
  FROM restaurant_sales s JOIN online_orders o ON o.id=s.order_id WHERE s.restaurant_id=? AND s.paid_at>=? AND s.paid_at<?
  ORDER BY s.paid_at DESC,s.order_id LIMIT 501`).bind(...params));
 return {totals,sales:sales.slice(0,500),truncated:sales.length>500};
}
