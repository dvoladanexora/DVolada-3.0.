import {ApiError,readJson,requireInteger,requireKeys,requireRole,requireText,requireUuid} from './security.js';

const columns=`f.*,r.name AS restaurant_name,product.name AS product_name,gift.name AS gift_name`;
const catalogue=`FROM flash_campaigns f JOIN restaurants r ON r.id=f.restaurant_id
 LEFT JOIN products product ON product.id=f.product_id AND product.restaurant_id=r.id AND product.available=1
 LEFT JOIN products gift ON gift.id=f.gift_product_id AND gift.restaurant_id=r.id AND gift.available=1`;
const active=`f.active=1 AND r.subscription_status='active' AND r.plan IN ('ONLINE','PLUS') AND r.online_state='open'
 AND f.starts_at<=unixepoch() AND f.ends_at>unixepoch()
 AND (f.product_id IS NULL OR product.id IS NOT NULL)
 AND (f.gift_product_id IS NULL OR gift.id IS NOT NULL)
 AND f.global_limit>(SELECT COUNT(*) FROM online_orders o WHERE o.flash_id=f.id AND o.status NOT IN ('Cancelado','Rechazado'))`;
const dto=row=>({id:row.id,title:row.title,restaurantId:row.restaurant_id,restaurantName:row.restaurant_name,
 productId:row.product_id,productName:row.product_name,giftName:row.gift_name,
 discountMinor:row.discount_minor,startsAt:row.starts_at,endsAt:row.ends_at});
export async function flashCatalogue(env,actor){
 const scoped=actor?`AND f.per_customer>(SELECT COUNT(*) FROM online_orders o WHERE o.flash_id=f.id
   AND o.customer_id=? AND o.status NOT IN ('Cancelado','Rechazado'))`:'';
 const query=env.DB.prepare(`SELECT ${columns} ${catalogue} WHERE ${active} ${scoped} ORDER BY f.ends_at,f.id LIMIT 100`);
 const {results=[]}=await (actor?query.bind(actor.userId):query).all();
 return {campaigns:results.map(dto)};
}
export async function resolveFlash(env,actor,id,restaurantId,lines){
 const row=await env.DB.prepare(`SELECT ${columns} ${catalogue} WHERE f.id=? AND r.id=? AND ${active}
  AND f.per_customer>(SELECT COUNT(*) FROM online_orders o WHERE o.flash_id=f.id
   AND o.customer_id=? AND o.status NOT IN ('Cancelado','Rechazado'))`).bind(id,restaurantId,actor.userId).first();
 if(!row)throw new ApiError(409,'FLASH_UNAVAILABLE');
 const eligible=row.product_id?lines.filter(line=>line.id===row.product_id):lines;
 if(!eligible.length)throw new ApiError(409,'FLASH_UNAVAILABLE');
 const sum=eligible.reduce((total,line)=>total+(line.price_minor+line.optionsMinor)*line.quantity,0);
 const discountMinor=Math.min(sum,row.discount_minor);
 if(!discountMinor&&!row.gift_name)throw new ApiError(409,'FLASH_UNAVAILABLE');
 return {discountMinor,giftName:row.gift_name};
}
export async function adminFlash(req,env,actor,id){
 requireRole(actor,'platform_admin');
 if(req.method==='GET'){
  const restaurant=new URL(req.url).searchParams.get('restaurant');
  if(restaurant){
   const {results=[]}=await env.DB.prepare('SELECT id,name,available FROM products WHERE restaurant_id=? ORDER BY name,id LIMIT 150')
    .bind(requireUuid(restaurant)).all();
   return {products:results};
  }
  const {results=[]}=await env.DB.prepare(`SELECT ${columns} ${catalogue} ORDER BY f.ends_at DESC,f.id LIMIT 100`).all();
  return {campaigns:results.map(row=>({...dto(row),active:Boolean(row.active),perCustomer:row.per_customer,globalLimit:row.global_limit}))};
 }
 if(req.method==='PATCH'){
  requireUuid(id);
  const updated=await env.DB.prepare('UPDATE flash_campaigns SET active=0 WHERE id=?').bind(id).run();
  if(!updated.meta.changes)throw new ApiError(404,'NOT_FOUND');
  return {id,active:false};
 }
 const input=await readJson(req);
 requireKeys(input,['restaurantId','productId','giftProductId','title','discountMinor','startsAt','endsAt','perCustomer','globalLimit']);
 const restaurantId=requireUuid(input.restaurantId),productId=input.productId?requireUuid(input.productId):null;
 const giftProductId=input.giftProductId?requireUuid(input.giftProductId):null;
 const title=requireText(input.title,2,80,'title'),discount=requireInteger(input.discountMinor,0,100000000,'discountMinor');
 const startsAt=requireInteger(input.startsAt,0,2147483647,'startsAt');
 const endsAt=requireInteger(input.endsAt,Math.max(startsAt+1,Math.floor(Date.now()/1000)+1),2147483647,'endsAt');
 const perCustomer=requireInteger(input.perCustomer,1,100,'perCustomer');
 const globalLimit=requireInteger(input.globalLimit,perCustomer,100000,'globalLimit');
 if(Boolean(giftProductId)===Boolean(discount))throw new ApiError(400,'INVALID_FLASH_REWARD');
 const campaignId=crypto.randomUUID();
 const result=await env.DB.prepare(`INSERT INTO flash_campaigns(id,restaurant_id,product_id,gift_product_id,title,discount_minor,starts_at,ends_at,per_customer,global_limit,created_by)
  SELECT ?,id,?,?,?,?,?,?,?,?,? FROM restaurants r WHERE r.id=? AND r.plan IN ('ONLINE','PLUS')
  AND (? IS NULL OR EXISTS(SELECT 1 FROM products WHERE restaurant_id=r.id AND id=?))
  AND (? IS NULL OR EXISTS(SELECT 1 FROM products WHERE restaurant_id=r.id AND id=?))`)
  .bind(campaignId,productId,giftProductId,title,discount,startsAt,endsAt,perCustomer,globalLimit,actor.userId,restaurantId,
   productId,productId,giftProductId,giftProductId).run();
 if(!result.meta.changes)throw new ApiError(400,'INVALID_FLASH_CATALOG');
 return {id:campaignId};
}
