import {restaurantOrderBlockReason} from './restaurant-availability.js';
/** Reglas de demostración del carrito Dvolada Online.
 * Deben repetirse desde un servidor confiable antes de vender pedidos reales.
 */
const cents=n=>Math.round(Number(n)*100);
const moneyFromCents=n=>n/100;
const drinks=/café|cafe|fresco|jugo|refresco|bebida|té|te |agua|licuado/i;
export const offeredExtrasFor=item=>{
 if(Array.isArray(item?.extras))return item.extras.filter(v=>typeof v==='string'&&v.trim()).slice(0,8);
 return drinks.test(String(item?.name||''))?['Azúcar extra','Leche extra','Sin hielo']:['Queso extra','Aguacate','Salsa extra'];
};
export const lineSelectedExtras=line=>{
 if(Array.isArray(line?.extras))return line.extras;
 const name=String(line?.name||'');
 return name.includes(' + ')?name.split(' + ').slice(1).join(' + ').split(', ').filter(Boolean):[];
};
export function validateCartCatalog(cart,places,{scheduleMode='now'}={}){
 if(!Array.isArray(cart)||!cart.length)return 'Tu carrito está vacío';
 const restaurants=Array.isArray(places)?places:[];
 for(const line of cart){
  const place=restaurants.find(p=>String(p.id)===String(line?.placeId));
  if(!place)return 'Uno de los restaurantes ya no está disponible. Revisá el carrito.';
  const blocked=restaurantOrderBlockReason(place,{scheduleMode});
  if(blocked)return blocked;
  const item=(Array.isArray(place.items)?place.items:[]).find(i=>String(i.id)===String(line?.productId??String(line?.id).split('-')[0]));
  if(!item)return 'El producto '+String(line?.name||'')+' ya no aparece en el menú. Quitalo del carrito y volvé a agregarlo.';
  if(item.available===false||item.soldOut===true)return 'El producto '+item.name+' está agotado.';
  const qty=Number(line.qty);
  if(!Number.isInteger(qty)||qty<1||qty>99)return 'Revisá la cantidad de '+item.name+' (máximo 99).';
  const chosen=lineSelectedExtras(line);
  const allowed=offeredExtrasFor(item);
  if(chosen.length>8||new Set(chosen).size!==chosen.length||chosen.some(x=>typeof x!=='string'||!allowed.includes(x)))
   return 'Los extras de '+item.name+' cambiaron. Volvé a agregar el producto desde el menú.';
  const base=Number(item.price),linePrice=Number(line.price);
  const validMoney=(amount,min,max)=>Number.isFinite(amount)&&amount>=min&&amount<=max&&
   Number.isSafeInteger(Math.round(amount*100))&&Math.abs(amount*100-Math.round(amount*100))<1e-6;
  if(item.price===null||item.price===undefined||item.price===''||
     line.price===null||line.price===undefined||line.price===''||
     !validMoney(base,.01,10000)||!validMoney(linePrice,.01,10080))
   return 'El precio de '+item.name+' es inválido. Quitalo y volvé a agregarlo desde el menú.';
  const expected=cents(base)+chosen.length*1000;
  if(cents(linePrice)!==expected)
   return 'El precio de '+item.name+' cambió. Volvé a agregarlo desde el menú para actualizar el total.';
 }
 return null;
}
export function splitRestaurantCart(cart,places,serviceFee=0,deliveryFee=0){
 const rows=Array.isArray(cart)?cart:[];
 const restaurants=Array.isArray(places)?places:[];
 const fees=[serviceFee,deliveryFee].map(x=>cents(x));
 if(fees.some(x=>!Number.isFinite(x)||x<0))return [];
 const ids=[...new Set(rows.map(i=>String(i?.placeId)))];
 return ids.map(id=>{
  const items=rows.filter(i=>String(i?.placeId)===id);
  const place=restaurants.find(p=>String(p.id)===id);
  const subtotalCents=items.reduce((sum,i)=>sum+cents(i?.price)*Number(i?.qty),0);
  return {id,placeId:items[0]?.placeId,placeName:place?.name||items[0]?.placeName||'Restaurante',items,
   subtotal:moneyFromCents(subtotalCents),serviceFee:moneyFromCents(fees[0]),
   deliveryFee:moneyFromCents(fees[1]),total:moneyFromCents(subtotalCents+fees[0]+fees[1])};
 });
}
export const cartCheckoutTotal=groups=>moneyFromCents((Array.isArray(groups)?groups:[]).reduce((sum,group)=>sum+cents(group.total),0));


/** Identidad de línea por restaurante + producto (los IDs del menú no son globales).
 * Un mismo número de producto puede existir en dos restaurantes diferentes.
 */
export const sameCartLine=(line,itemId,placeId)=>Boolean(
 line&&String(line.id)===String(itemId)&&String(line.placeId)===String(placeId)
);
export function changeCartQuantity(cart,itemId,placeId,delta){
 if(!Array.isArray(cart)||!Number.isInteger(delta)||delta===0)return Array.isArray(cart)?cart:[];
 return cart.map(line=>{
  if(!sameCartLine(line,itemId,placeId))return line;
  const quantity=Number(line.qty);
  return {...line,qty:Math.min(99,(Number.isInteger(quantity)?quantity:1)+delta)};
 }).filter(line=>Number(line?.qty)>0);
}
export function changeCartInstruction(cart,itemId,placeId,value){
 if(!Array.isArray(cart))return [];
 return cart.map(line=>sameCartLine(line,itemId,placeId)?{...line,instructions:String(value??'').slice(0,200)}:line);
}
