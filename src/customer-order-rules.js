/** Reglas de demostración del carrito Dvolada Online.
 * Deben repetirse desde un servidor confiable antes de vender pedidos reales.
 */
const cents=n=>Math.round(Number(n)*100);
const moneyFromCents=n=>n/100;
const drinks=/café|cafe|fresco|jugo|refresco|bebida|té|te |agua|licuado/i;
export const offeredExtrasFor=item=>{
 if(Array.isArray(item?.extras)&&item.extras.length)return item.extras.filter(v=>typeof v==='string'&&v.trim()).slice(0,8);
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
  if(scheduleMode!=='later'&&(place.isOpen===false||place.open===false))
   return 'El restaurante '+place.name+' está cerrado por ahora. Elegí otro negocio o programá el pedido.';
  const item=(Array.isArray(place.items)?place.items:[]).find(i=>String(i.id)===String(line?.productId??String(line?.id).split('-')[0]));
  if(!item)return 'El producto '+String(line?.name||'')+' ya no aparece en el menú. Quitalo del carrito y volvé a agregarlo.';
  if(item.available===false||item.soldOut===true)return 'El producto '+item.name+' está agotado.';
  const qty=Number(line.qty);
  if(!Number.isInteger(qty)||qty<1||qty>99)return 'Revisá la cantidad de '+item.name+' (máximo 99).';
  const chosen=lineSelectedExtras(line);
  const allowed=offeredExtrasFor(item);
  if(chosen.length>8||new Set(chosen).size!==chosen.length||chosen.some(x=>typeof x!=='string'||!allowed.includes(x)))
   return 'Los extras de '+item.name+' cambiaron. Volvé a agregar el producto desde el menú.';
  const expected=cents(item.price)+chosen.length*1000;
  if(!Number.isFinite(expected)||!Number.isFinite(Number(line.price))||cents(line.price)!==expected)
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
