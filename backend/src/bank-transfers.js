import {ApiError,readJson,requireKeys,requireRole,requireStaff,requireText,respond} from './security.js';

const fields='bank,beneficiary,account_type,account_number,instructions';
export async function bankAccount(req,env,access){
 requireStaff(access.staff_role,['owner']);
 const id=access.restaurantId;
 if(req.method==='PATCH'){
  const b=await readJson(req,2048);
  requireKeys(b,['bank','beneficiary','type','number','instructions']);
  const values=[requireText(b.bank,2,80,'bank'),requireText(b.beneficiary,2,100,'beneficiary'),
   requireText(b.type,2,40,'type'),requireText(b.number,4,34,'number'),requireText(b.instructions??'',0,250,'instructions')];
  if(!/^[0-9 -]+$/.test(values[3]))throw new ApiError(400,'INVALID_INPUT');
  values[3]=values[3].replace(/[^0-9]/g,'');
  if(values[3].length<4)throw new ApiError(400,'INVALID_INPUT');
  await env.DB.prepare(`INSERT INTO restaurant_bank_accounts(restaurant_id,${fields}) VALUES(?,?,?,?,?,?)
   ON CONFLICT(restaurant_id) DO UPDATE SET bank=excluded.bank,beneficiary=excluded.beneficiary,
   account_type=excluded.account_type,account_number=excluded.account_number,instructions=excluded.instructions`).bind(id,...values).run();
 }
 return respond(req,env,200,{account:await env.DB.prepare(`SELECT ${fields} FROM restaurant_bank_accounts WHERE restaurant_id=?`).bind(id).first()});
}

export async function customerTransfer(req,env,actor,id){
 requireRole(actor,'customer');
 const order=await env.DB.prepare('SELECT id FROM online_orders WHERE id=? AND customer_id=?').bind(id,actor.userId).first();
 if(!order)throw new ApiError(404,'ORDER_NOT_FOUND');
 const get=()=>env.DB.prepare(`SELECT status,reference,${fields} FROM order_bank_transfers WHERE order_id=?`).bind(id).first();
 if(req.method==='GET')return respond(req,env,200,{transfer:await get()});
 const body=await readJson(req,1024);requireKeys(body,['reference']);
 if(body.reference===undefined){
  await env.DB.prepare(`INSERT INTO order_bank_transfers(order_id,restaurant_id,reference,${fields},status)
   SELECT o.id,o.restaurant_id,'',a.bank,a.beneficiary,a.account_type,a.account_number,a.instructions,'awaiting_reference'
   FROM online_orders o JOIN restaurant_bank_accounts a ON a.restaurant_id=o.restaurant_id
   JOIN restaurant_profiles p ON p.restaurant_id=o.restaurant_id
   WHERE o.id=? AND o.customer_id=? AND o.status='Pendiente'
   AND EXISTS(SELECT 1 FROM json_each(p.payment_methods) WHERE value='transfer')
   ON CONFLICT(order_id) DO NOTHING`).bind(id,actor.userId).run();
 }else{
  const ref=requireText(body.reference,4,64,'reference').toUpperCase().replace(/[ -]/g,'');
  if(!/^[A-Z0-9]{4,64}$/.test(ref))throw new ApiError(400,'INVALID_INPUT');
  try{
   const result=await env.DB.prepare(`UPDATE order_bank_transfers SET reference=?,status='pending',reviewed_by=NULL,reviewed_at=NULL
    WHERE order_id=? AND status IN ('awaiting_reference','rejected')
    AND EXISTS(SELECT 1 FROM online_orders WHERE id=? AND customer_id=? AND status='Pendiente')`).bind(ref,id,id,actor.userId).run();
   if(!result.meta.changes){
    const saved=await get();
    if(!saved||saved.reference!==ref||!['pending','confirmed'].includes(saved.status))throw new ApiError(409,'TRANSFER_UNAVAILABLE');
   }
  }catch(error){if(/UNIQUE constraint/.test(String(error)))throw new ApiError(409,'TRANSFER_REFERENCE_IN_USE');throw error}
 }
 const transfer=await get();
 if(!transfer)throw new ApiError(409,'TRANSFER_UNAVAILABLE');
 return respond(req,env,200,{transfer});
}

export async function reviewTransfers(req,env,actor,access,id){
 requireStaff(access.staff_role,['owner','manager','cashier']);
 const rid=access.restaurantId;
 if(req.method==='GET'){
  const {results}=await env.DB.prepare(`SELECT t.order_id,t.status,t.reference,t.bank,t.reviewed_at,o.order_number,o.total_minor-o.discount_minor AS total_minor
   FROM order_bank_transfers t JOIN online_orders o ON o.id=t.order_id
   WHERE t.restaurant_id=? AND t.status!='awaiting_reference'
   ORDER BY t.status='pending' DESC,COALESCE(t.reviewed_at,o.created_at) DESC LIMIT 100`).bind(rid).all();
  return respond(req,env,200,{transfers:results});
 }
 const b=await readJson(req,1024);requireKeys(b,['decision','reference']);
 if(!['confirmed','rejected'].includes(b.decision))throw new ApiError(400,'INVALID_INPUT');
 const reference=requireText(b.reference,4,64,'reference');
 const result=await env.DB.prepare(`UPDATE order_bank_transfers SET status=?,reviewed_by=?,reviewed_at=unixepoch()
  WHERE order_id=? AND restaurant_id=? AND reference=? AND status='pending'
  AND EXISTS(SELECT 1 FROM online_orders WHERE id=? AND status='Pendiente')`).bind(b.decision,actor.userId,id,rid,reference,id).run();
 if(!result.meta.changes){
  const same=await env.DB.prepare('SELECT 1 FROM order_bank_transfers WHERE order_id=? AND restaurant_id=? AND reference=? AND status=?').bind(id,rid,reference,b.decision).first();
  if(!same)throw new ApiError(409,'TRANSFER_UNAVAILABLE');
 }
 return respond(req,env,200,{ok:true});
}
