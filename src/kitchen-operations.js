/** Lógica pura de producción: utilizada por la pantalla de cocina y probada sin React. */
export const KITCHEN_STAGES=Object.freeze(['Aceptado','Preparando','Listo']);
const terminal=new Set(['Cancelado','Rechazado','Entregado']);
/** Guardias de UX por área. En producción la API repetirá estas reglas con permisos y versión. */
export const canMoveRestaurantOrder=(from,to,area='cashier')=>{
 if(area==='cashier')return from==='Pendiente'&&['Aceptado','Rechazado'].includes(to);
 if(area==='kitchen')return (from==='Aceptado'&&to==='Preparando')||(from==='Preparando'&&to==='Listo');
 return false;
};
export const orderTime=(o)=>{
 const stamp=o?.createdAt||o?.date;
 const d=new Date(stamp||0);
 return Number.isFinite(d.getTime())&&d.getTime()>0?d.getTime():null;
};
export function elapsedMinutes(order,now=Date.now()){
 const start=orderTime(order);
 return start===null?null:Math.max(0,Math.floor((now-start)/60000));
}
export const belongsToRestaurant=(o,id)=>Boolean(o?.kind==='food'&&id!==null&&id!==undefined&&String(o.placeId)===String(id));
export function kitchenQueues(orders,restaurantId,now=Date.now()){
 const relevant=(Array.isArray(orders)?orders:[]).filter(o=>belongsToRestaurant(o,restaurantId)&&!terminal.has(o.status)&&!(o.scheduledFor&&Date.parse(o.scheduledFor)>now));
 const byAge=(a,b)=>(orderTime(a)??now)-(orderTime(b)??now);
 return {
  pending:relevant.filter(o=>o.status==='Pendiente').sort(byAge),
  accepted:relevant.filter(o=>o.status==='Aceptado').sort(byAge),
  preparing:relevant.filter(o=>o.status==='Preparando').sort(byAge),
  ready:relevant.filter(o=>o.status==='Listo').sort(byAge),
 };
}
export const escapeKitchenHtml=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export const kitchenLineExtras=item=>{
 const array=Array.isArray(item?.extras)?item.extras:typeof item?.extras==='string'?[item.extras]:[];
 return array.map(v=>typeof v==='string'?v:v?.name||v?.label||'').filter(Boolean).join(' · ');
};
export function kitchenTicketHtml(o,restaurantName='Restaurante',printedAt=new Date()){
 if(!o||!o.id)throw Error('Pedido inválido');
 if(!KITCHEN_STAGES.includes(o.status))throw Error('Solo se imprime una comanda tras aceptar el pedido');
 const safe=escapeKitchenHtml;
 const items=(Array.isArray(o.items)?o.items:[]).map(i=>{
  const name=safe(i.name||'Producto');
  const qty=safe(Math.max(1,Number(i.qty)||1));
  const extra=kitchenLineExtras(i),comment=i.instructions||i.note||'';
  return '<li><div class="line"><strong class="qty">'+qty+' ×</strong><strong>'+name+'</strong></div>'
   +(extra?'<p class="extra">EXTRAS: '+safe(extra)+'</p>':'')
   +(comment?'<p class="note">INDICACIONES: '+safe(comment)+'</p>':'')
   +'</li>';
 }).join('');
 const type=o.delivery==='delivery'?'ENTREGA A DOMICILIO':'RETIRO EN RESTAURANTE';
 const date=printedAt instanceof Date&&!Number.isNaN(printedAt.getTime())?printedAt:new Date();
 const timestamp=safe(date.toLocaleString('es-HN',{hour12:true}));
 return '<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>Comanda de cocina</title>'
  +'<style>@page{size:80mm auto;margin:4mm}*{box-sizing:border-box}html,body{background:#fff;color:#111;margin:0}body{font:14px Arial,sans-serif;max-width:76mm;margin:auto;padding:8px}header{text-align:center;border-bottom:2px solid #111;padding:0 0 10px}h1{font-size:18px;margin:0 0 4px;overflow-wrap:anywhere}h2{text-align:center;font-size:24px;letter-spacing:.02em;margin:11px 0}.minor{font-size:11px;line-height:1.5}.type{font-weight:bold;border:1px solid #111;text-align:center;padding:7px;margin:10px 0}ol{list-style:none;margin:12px 0;padding:0}li{border-bottom:1px dashed #777;padding:11px 0;break-inside:avoid}.line{display:flex;gap:10px;font-size:16px}.qty{min-width:33px}.extra,.note{font-size:12px;margin:7px 0 0;padding:5px;background:#eee;overflow-wrap:anywhere}.instructions{border:1px solid #111;padding:9px;margin-top:10px;overflow-wrap:anywhere}footer{text-align:center;border-top:1px dashed #777;font-size:10px;margin-top:17px;padding-top:10px}@media print{body{padding:0;max-width:none}}</style>'
  +'</head><body><header><h1>'+safe(restaurantName)+'</h1><div class="minor">DVOLADA CLOUD · COMANDA DE COCINA</div></header>'
  +'<h2>'+safe(o.orderNo||o.id)+'</h2><div class="minor">Impreso: '+timestamp+'</div><div class="type">'+type+'</div><ol>'+items+'</ol>'
  +(o.notes||o.comment?'<div class="instructions"><strong>NOTAS DE LA ORDEN</strong><br>'+safe(o.notes||o.comment)+'</div>':'')
  +'<footer>Solo preparación · No es factura ni comprobante fiscal</footer></body></html>';
}
export function openKitchenTicket(order,businessName,openWindow=()=>window.open('','_blank','width=430,height=670')){
 let markup;
 try{markup=kitchenTicketHtml(order,businessName)}catch{return false}
 const popup=openWindow();
 if(!popup)return false;
 popup.document.write(markup);
 popup.document.close();
 popup.focus?.();
 // No elementos remotos: la impresión funciona en el mismo gesto del usuario.
 popup.print?.();
 return true;
}
