import {stageElapsedMinutes} from './restaurant-order-flow.js';
import React,{useEffect,useState} from 'react';
import {AlertTriangle,ArrowRight,ChefHat,CheckCheck,CheckCircle2,Clock3,Monitor,Printer,ShoppingBag,UtensilsCrossed} from 'lucide-react';
import {elapsedMinutes,kitchenLineExtras,kitchenQueues,kitchenVisibleBatch,matchesRestaurantOrder} from './kitchen-operations.js';
import './restaurant-kitchen-display.css';

const stages=[
 {key:'accepted',title:'Por comenzar',subtitle:'Pedidos que Caja ya aceptó',Icon:ShoppingBag,action:'Comenzar preparación',next:'Preparando'},
 {key:'preparing',title:'Preparando',subtitle:'Cocinando en este momento',Icon:ChefHat,action:'Marcar como listo',next:'Listo'},
 {key:'ready',title:'Listos',subtitle:'Para entrega o retiro',Icon:CheckCircle2,action:null,next:null},
];

function KitchenOrderCard({order,stage,now,alertMinutes,connected,onChange,onPrint,onDetail}){
 const minutes=stageElapsedMinutes(order,stage.key,now),totalMinutes=elapsedMinutes(order,now),delayed=minutes!==null&&minutes>=alertMinutes&&stage.key!=='ready';
 const items=Array.isArray(order.items)?order.items:[];
 return <article className={'dv-kitchen-order '+(delayed?'is-delayed ':'')+'is-'+stage.key} aria-label={'Orden '+(order.orderNo||order.id)}>
  <div className="dv-kitchen-order-top"><div><span className="dv-kitchen-order-label">ORDEN</span><h3>{order.orderNo||order.id}</h3></div><div className={'dv-kitchen-timer '+(delayed?'late':'')}><Clock3 size={16}/>{minutes===null?'Sin hora':minutes+' min en etapa'}</div></div>
  <div className="dv-kitchen-service"><span>{order.delivery==='delivery'?'🛵 A domicilio':'🏪 Para retirar'}</span><span>{order.status}{totalMinutes!==null&&' · '+totalMinutes+' min desde pedido'}</span></div>
  <ul className="dv-kitchen-products">{items.map((item,i)=>{
   const extra=kitchenLineExtras(item),notes=item.instructions||item.note||'';
   return <li key={item.id||i}><span className="dv-kitchen-qty">{Math.max(1,Number(item.qty)||1)}×</span><div><strong>{item.name||'Producto'}</strong>{extra&&<small>Extras: {extra}</small>}{notes&&<small className="dv-kitchen-item-note">Indicaciones: {notes}</small>}</div></li>;
  })}</ul>
  {(order.notes||order.comment)&&<div className="dv-kitchen-order-note"><AlertTriangle size={16}/><span>{order.notes||order.comment}</span></div>}
  <div className="dv-kitchen-order-actions"><button type="button" className="dv-kitchen-print" onClick={()=>onPrint(order)} aria-label={'Imprimir comanda de '+(order.orderNo||order.id)}><Printer size={17}/> Comanda</button><button type="button" className="dv-kitchen-details" onClick={()=>onDetail(order)}><UtensilsCrossed size={16}/> Detalle</button></div>
  {stage.next&&<button type="button" className={'dv-kitchen-progress dv-kitchen-'+stage.key} disabled={!connected} onClick={()=>onChange(order,stage.next)}>{stage.key==='accepted'?<ChefHat size={19}/>:<CheckCheck size={19}/>} {stage.action} <ArrowRight size={17}/></button>}
  {!connected&&stage.next&&<small className="dv-kitchen-offline">Sin conexión: no se pueden cambiar estados.</small>}
  {stage.key==='ready'&&<div className="dv-kitchen-ready-message"><CheckCircle2 size={16}/> Esperando retiro o gestión del repartidor</div>}
 </article>;
}

export default function RestaurantKitchenDisplay({
 orders=[],restaurantId,restaurantName='Restaurante',now=Date.now(),alertMinutes=20,connected=true,query='',
 onChange=()=>{},onPrint=()=>{},onDetail=()=>{},onGoCashier=()=>{},
}){
 const [visibleLimits,setVisibleLimits]=useState({accepted:20,preparing:20,ready:20});
 useEffect(()=>setVisibleLimits({accepted:20,preparing:20,ready:20}),[restaurantId,query]);
 const q=kitchenQueues(orders,restaurantId,now);
 const active=q.accepted.length+q.preparing.length;
 const delayed=q.accepted.filter(o=>{const m=stageElapsedMinutes(o,'accepted',now);return m!==null&&m>=alertMinutes}).length+q.preparing.filter(o=>{const m=stageElapsedMinutes(o,'preparing',now);return m!==null&&m>=alertMinutes}).length;
 return <div className="dv-kitchen-screen">
  <header className="dv-kitchen-overview">
   <div className="dv-kitchen-heading"><span className="dv-kitchen-eyebrow"><Monitor size={16}/> MODO COCINA · {restaurantName}</span><h2>Prepará cada orden, sin distracciones.</h2><p>Solo aparecen pedidos aceptados en Caja. Las nuevas solicitudes se revisan exclusivamente allí.</p></div>
   <div className="dv-kitchen-metrics"><div><small>Por comenzar</small><strong>{q.accepted.length}</strong></div><div><small>Preparando</small><strong>{q.preparing.length}</strong></div><div><small>Listos</small><strong>{q.ready.length}</strong></div></div>
  </header>
  <div className="dv-kitchen-status-strip">
   <span><span className={'dv-kitchen-live-dot '+(connected?'':'inactive')}/>{connected?'Vista operativa en este dispositivo':'Dispositivo sin conexión'}</span>
   <span><Clock3 size={16}/> {active} órdenes en trabajo</span>
   {delayed>0&&<span className="dv-kitchen-warning"><AlertTriangle size={16}/> {delayed} con demora</span>}
   {q.pending.length>0&&<button type="button" className="dv-kitchen-pending" onClick={onGoCashier}><ShoppingBag size={16}/> {q.pending.length} esperando en Caja <ArrowRight size={16}/></button>}
  </div>
  {query.trim()&&<p className="dv-kitchen-filter-notice" role="status">Mostrando coincidencias para «{query.trim()}». Los contadores de arriba muestran el total de pedidos.</p>}
  <div className="dv-kitchen-lanes">
   {stages.map(stage=>{
    const Icon=stage.Icon,items=q[stage.key].filter(order=>matchesRestaurantOrder(order,query));
    const page=kitchenVisibleBatch(items,visibleLimits[stage.key]);
    return <section key={stage.key} className={'dv-kitchen-lane dv-kitchen-lane-'+stage.key} aria-label={stage.title}>
     <header><div className="dv-kitchen-lane-icon"><Icon size={21}/></div><div><h3>{stage.title}</h3><span>{stage.subtitle}</span></div><strong className="dv-kitchen-count">{items.length}</strong></header>
     <div className="dv-kitchen-lane-orders">{items.length?page.visible.map(o=><KitchenOrderCard key={o.id} order={o} stage={stage} now={now} alertMinutes={alertMinutes} connected={connected} onChange={onChange} onPrint={onPrint} onDetail={onDetail}/>):<div className="dv-kitchen-empty"><CheckCircle2 size={31}/><p>{query.trim()?'Sin coincidencias en esta etapa.':stage.key==='accepted'?'No hay pedidos esperando comenzar.':stage.key==='preparing'?'No hay platos en preparación.':'No hay órdenes listas por ahora.'}</p></div>}{page.remaining>0&&<button type="button" className="dv-kitchen-load-more" aria-label={'Mostrar 20 pedidos más en '+stage.title} onClick={()=>setVisibleLimits(old=>({...old,[stage.key]:old[stage.key]+20}))}>Mostrar 20 más · {page.shown} de {page.total} visibles</button>}</div>
    </section>;
   })}
  </div>
  <p className="dv-kitchen-system-note">Vista preparada para pantalla o tablet. Por ahora los pedidos son locales a esta demostración: para recibir lo aceptado en Caja desde otro equipo se requiere la conexión segura del servidor.</p>
 </div>;
}
