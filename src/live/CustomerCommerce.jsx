import React,{useState} from 'react';
import {ArrowRight,ShoppingBag,Receipt,Plus,Minus,X,Store,Bike,MessageCircle,ShieldCheck,ShoppingCart,Check,UserRound} from 'lucide-react';
import SlideConfirm from '../SlideConfirm.jsx';
import CourierStatusMotion from '../CourierStatusMotion.jsx';
import {readCart} from './cart-draft.js';

// These sections use the original application shell, original cart/order classes,
// and the same authenticated controller as the server workspace. No demo orders.
export function CustomerCart({c,places,onBrowse,onOrders}){
 const [review,setReview]=useState(false);
 const locked=c.busy||c.offline||Boolean(c.pendingKey);
 const total=c.subtotal+c.fee-c.discount;
 const submit=async()=>{const ok=await c.checkout();if(ok){setReview(false);onOrders()}return ok};
 return <section className="shell section narrow page-section" aria-label="Tu carrito">
  <div className="page-heading"><span className="kicker">TU COMPRA</span><h1>Tu carrito</h1><p>Revisá tus productos antes de continuar.</p></div>
  {c.replaceCart&&<div className="surface"><h3>¿Cambiar de restaurante?</h3><p>El carrito actual será reemplazado.</p><button className="secondary" onClick={c.keepCart}>Conservar carrito</button><button className="primary" disabled={locked} onClick={c.replace}>Cambiar restaurante</button></div>}
  {!c.cart.length&&readCart('guest').items.length>0&&<button className="secondary wide" disabled={locked} onClick={c.importGuest}>Usar carrito de invitado</button>}
  {!c.cart.length?<div className="empty"><ShoppingBag size={38}/><h2>¡Todavía no hay nada para llevar de volada!</h2><p>Encontrá algo rico para empezar.</p><button className="primary" onClick={onBrowse}>Explorar restaurantes <ArrowRight size={17}/></button></div>:<>
   <div className="surface"><section className="dv-cart-restaurant-group"><h3>{c.restaurant?.name||'Restaurante'}</h3>
    {c.cart.map(i=>{const product=places.find(p=>p.id===c.restaurantId)?.items.find(p=>p.id===i.productId);return <div className="cart-line dv-cart-line-v6" key={i.productId}>
     <div className="dv-cart-item-image">{product?.image?<img src={product.image} alt="" loading="lazy"/>:<ShoppingBag size={22}/>}</div>
     <div><strong>{i.name}</strong><span>{c.money(i.priceMinor)} c/u</span>{i.options?.length>0&&<small>{i.options.map(o=>o.name).join(' · ')}</small>}</div>
     <div className="qty"><button aria-label={'Quitar uno de '+i.name} disabled={locked} onClick={()=>c.quantity(i.productId,-1)}><Minus size={15}/></button><b>{i.quantity}</b><button aria-label={'Agregar uno de '+i.name} disabled={locked||i.quantity>=25} onClick={()=>c.quantity(i.productId,1)}><Plus size={15}/></button></div>
     <strong>{c.money(i.priceMinor*i.quantity)}</strong>
    </div>})}
   </section><div className="totals"><div><span>Productos</span><b>{c.money(c.subtotal)}</b></div><div className="grand"><span>Subtotal</span><b>{c.money(c.subtotal)}</b></div></div></div>
   <button className="secondary wide" onClick={onBrowse}>Seguir comprando</button>
   <button className="primary wide" disabled={c.busy||c.offline||Boolean(c.replaceCart)} onClick={()=>setReview(true)}>Continuar pedido <ArrowRight size={18}/></button>
  </>}
  {review&&c.cart.length>0&&<div className="modal-backdrop" onMouseDown={()=>setReview(false)}><div className="modal" role="dialog" aria-modal="true" aria-label="Confirmar pedido" onMouseDown={e=>e.stopPropagation()}>
   <div className="modal-head"><h2>Revisá y confirmá tu pedido</h2><button className="iconbtn" aria-label="Cerrar" onClick={()=>setReview(false)}><X/></button></div>
   <button type="button" className="secondary dv-back-to-cart" onClick={()=>setReview(false)}>← Volver al carrito</button>
   <div className="dv-checkout-review"><div className="dv-checkout-restaurant"><strong>{c.restaurant?.name||'Restaurante'}</strong><span>{c.cart.reduce((n,i)=>n+i.quantity,0)} producto(s) · {c.money(c.subtotal)}</span></div></div>
   <div className="switch-row"><button className={c.deliveryMethod==='pickup'?'selected':''} disabled={locked} onClick={()=>c.setDeliveryMethod('pickup')}><Store size={18}/> Recoger</button><button className={c.deliveryMethod==='delivery'?'selected':''} disabled={locked} onClick={()=>c.setDeliveryMethod('delivery')}><Bike size={18}/> A domicilio</button></div>
   <label>Teléfono de Honduras (+504)<input inputMode="numeric" autoComplete="tel-national" value={c.phone} disabled={locked} onChange={e=>c.setPhone(e.target.value.replace(/\D/g,'').slice(0,8))}/></label>
   {c.deliveryMethod==='delivery'&&<label>Barrio, dirección y referencia<textarea autoComplete="street-address" rows={3} maxLength={300} value={c.deliveryAddress} disabled={locked} onChange={e=>c.setDeliveryAddress(e.target.value)}/></label>}
   {c.eligibleFlash.length>0&&<label>Promoción Flash<select value={c.activeFlash?.id||''} disabled={locked} onChange={e=>c.selectFlash(e.target.value)}><option value="">Sin promoción Flash</option>{c.eligibleFlash.map(p=><option key={p.id} value={p.id}>{p.title}</option>)}</select></label>}
   {c.flashSelection&&!c.activeFlash&&<div role="alert">Esta promoción ya no está disponible. <button className="secondary" disabled={locked} onClick={()=>c.selectFlash('')}>Quitar promoción</button></div>}
   {c.activeFlash?.giftName&&<p>Regalo: {c.activeFlash.giftName}</p>}
   <label>Cupón<input value={c.couponText} maxLength={24} disabled={locked} onChange={e=>c.changeCoupon(e.target.value)}/></label>
   <button className="secondary" disabled={locked||c.couponText.trim().length<4} onClick={c.applyCoupon}>Aplicar cupón</button>
   <label>Indicaciones para el restaurante<textarea value={c.orderNote} disabled={locked} maxLength={300} rows={2} onChange={e=>c.setOrderNote(e.target.value)}/></label>
   <div className="dv-checkout-breakdown"><div><span>Productos</span><strong>{c.money(c.subtotal)}</strong></div><div><span>Envío estimado</span><strong>{c.money(c.fee)}</strong></div>{c.discount>0&&<div><span>Descuento</span><strong>−{c.money(c.discount)}</strong></div>}<div className="dv-checkout-grand"><span>Total estimado</span><strong>{c.money(total)}</strong></div></div>
   <p className="info-line"><Check size={18}/> Efectivo {c.deliveryMethod==='pickup'?'al recoger':'al recibir'}. El servidor verifica disponibilidad y precio.</p>
   {c.error&&<p role="alert">{c.error}</p>}{c.pendingKey&&<><p>Hay un intento pendiente. Buscá su confirmación antes de cambiar los datos.</p><button className="secondary" disabled={c.busy||c.offline} onClick={async()=>{if(await c.recoverCheckout()){setReview(false);onOrders()}}}>Buscar confirmación</button></>}
   <SlideConfirm disabled={c.busy||c.offline||!c.restaurant||Boolean(c.replaceCart)} onConfirm={submit} label={c.pendingKey?'Deslizá para reintentar el mismo pedido':'Deslizá para confirmar'} amount={c.money(total)}/>
  </div></div>}
 </section>
}

const closed=new Set(['Entregado','Cancelado','Rechazado']);
const stages=['Pendiente','Aceptado','Preparando','Listo','Recogido','En camino','En ubicación','Entregado'];
export function CustomerOrders({c,onBrowse,onCart}){
 const [tab,setTab]=useState('pending'),[query,setQuery]=useState('');
 const rows=c.orders.filter(o=>(tab==='history')===closed.has(o.status)&&(!query.trim()||String(o.orderNumber||'').toLowerCase().includes(query.toLowerCase())||String(c.restaurants.find(r=>r.id===o.restaurantId)?.name||'').toLowerCase().includes(query.toLowerCase())));
 return <section className="shell section page-section">
  <div className="page-heading"><span className="kicker">SEGUIMIENTO</span><h1>Mis pedidos</h1><p>Consultá tus pedidos activos y tu historial.</p><div className="dv-customer-filters"><input placeholder="Buscar número o restaurante" aria-label="Buscar pedido" value={query} onChange={e=>setQuery(e.target.value)}/></div></div>
  <div className="dv-orders-tabs" role="tablist" aria-label="Tipos de pedidos"><button type="button" role="tab" aria-selected={tab==='pending'} className={tab==='pending'?'active':''} onClick={()=>setTab('pending')}>Pedidos pendientes</button><button type="button" role="tab" aria-selected={tab==='history'} className={tab==='history'?'active':''} onClick={()=>setTab('history')}>Historial de pedidos</button></div>
  {!rows.length?<div className="empty"><Receipt size={38}/><h2>{tab==='pending'?'Aún no tenés pedidos activos':'Todavía no hay pedidos finalizados'}</h2><button className="primary" onClick={onBrowse}>Buscar comida</button></div>:<div className="order-list">{rows.map(o=>{
   const progress=Math.max(0,stages.indexOf(o.status))/(stages.length-1)*100;
   const selected=c.selectedPin?.id===o.id?c.selectedPin:null;
   return <article className="surface order" key={o.id}><div className="order-top"><div><span className="kicker">Orden {o.orderNumber}</span><h3>{c.restaurants.find(r=>r.id===o.restaurantId)?.name||'Pedido Dvolada'}</h3><p>{o.deliveryMethod==='pickup'?'Retiro en restaurante':'Entrega a domicilio'}</p></div><span className={'status '+(o.status==='Entregado'?'done':'')}>{o.status}</span></div>
    {!closed.has(o.status)&&<><div className="dv-track-progress"><div className="dv-track-summary"><strong>{o.status}</strong><small>{Math.round(progress)}% del proceso</small></div><div className="dv-track-line"><div className="dv-track-fill" style={{width:progress+'%'}}/><div className="dv-track-logo dv-track-runner" style={{left:progress+'%'}}><CourierStatusMotion status={o.status}/></div></div></div><details className="dv-track-details"><summary>Ver todas las etapas del pedido</summary><div className="order-timeline">{stages.map((step,i)=><div key={step} className={'order-step '+(i<=stages.indexOf(o.status)?'completed':'')}><span>{i<=stages.indexOf(o.status)?<Check size={12}/>:i+1}</span><small>{step}</small></div>)}</div></details></>}
    <div className="dv-history-meta"><span>Total del pedido</span><strong>{c.money(o.totalMinor)}</strong></div>
    <button className="secondary" disabled={c.busy||c.offline} onClick={()=>c.showOrder(o)}>Ver detalle / PIN</button>
    {selected&&<div className="dv-order-tools">{selected.receipt&&<ul>{selected.receipt.items.map((item,i)=><li key={i}>{item.quantity} × {item.name_snapshot}{(item.optionNames||[]).map(n=>' · '+n)}</li>)}</ul>}{selected.pin&&<><span>PIN privado: <b>{selected.pin}</b></span><button className="secondary" onClick={()=>navigator.clipboard?.writeText(selected.pin)}>Copiar PIN</button><small>Compartilo únicamente cuando recibás tu pedido.</small></>}<button className="secondary" onClick={c.hidePin}>Ocultar detalle</button></div>}
    <div className="dv-support-actions"><button className="secondary" disabled={c.offline} onClick={()=>c.support(o,'restaurant')}><MessageCircle size={16}/> Chat con restaurante</button>{o.courierResponse==='accepted'&&<button className="secondary" disabled={c.offline} onClick={()=>c.support(o,'courier')}>Chat con repartidor</button>}<button className="secondary" disabled={c.offline} onClick={()=>c.support(o,'claim')}><ShieldCheck size={16}/> Reportar un problema</button></div>
    {o.status==='Pendiente'&&<button className="secondary dv-cancel-order" disabled={c.busy||c.offline} onClick={()=>{if(window.confirm('¿Cancelar este pedido?'))c.cancelOrder(o)}}>Cancelar pedido</button>}
    {o.status==='Entregado'&&<button className="primary" disabled={c.busy||c.offline||Boolean(c.pendingKey)} onClick={async()=>{await c.reorder(o);onCart()}}><ShoppingCart size={16}/> Volvé a pedir</button>}
   </article>})}</div>}
  {c.supportView}
 </section>
}

export function CustomerProfile({c,sound,setSound}){
 const [name,setName]=useState(c.displayName||'');
 return <section className="shell section narrow page-section dv-profile dv-account-modern"><div className="page-heading"><span className="kicker">PERFIL PERSONAL</span><h1>Mi cuenta</h1><p>Administrá tu cuenta y preferencias.</p></div>
  <div className="surface dv-profile-card"><div className="dv-profile-photo"><UserRound size={44}/></div>
   <label className="dv-profile-field">Nombre y apellido<input maxLength={80} value={name} onChange={e=>setName(e.target.value)}/></label>
   <button className="primary wide" disabled={c.busy||c.offline||name.trim().length<2} onClick={()=>c.rename(name.trim())}>Guardar cambios</button>
   <label className="dv-profile-toggle"><input type="checkbox" checked={sound!==false} onChange={e=>setSound(e.target.checked)}/> Sonido al confirmar pedidos</label>
   {c.notifications}
   <button className="secondary wide" onClick={c.logout}>Cerrar sesión</button>
  </div>{c.application}
 </section>
}
