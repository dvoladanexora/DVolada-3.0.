import React,{useEffect,useState} from 'react';
import {ArrowRight,Bell,ChefHat,Check,CheckCheck,Clock3,Eye,Printer,Store,Truck} from 'lucide-react';
import {elapsedMinutes,kitchenQueues,matchesRestaurantOrder} from './kitchen-operations.js';
import './restaurant-cashier-console.css';

const number=o=>o.orderNo||o.id;
export default function RestaurantCashierConsole({orders=[],restaurantId,restaurantName='Restaurante',now=Date.now(),connected=true,query='',capacity=10,onActivate=()=>{},onAccept=()=>{},onDetail=()=>{},onPrint=()=>{},onGoKitchen=()=>{}}){
 const [pendingView,setPendingView]=useState('all');
 const [pendingSort,setPendingSort]=useState('oldest');
 const [shownLimit,setShownLimit]=useState(20);
 useEffect(()=>setShownLimit(20),[restaurantId,query,pendingView,pendingSort]);
 const q=kitchenQueues(orders,restaurantId,now);
 const working=q.accepted.length+q.preparing.length;
 const shownPending=q.pending.filter(order=>matchesRestaurantOrder(order,query)&&(pendingView==='all'||(pendingView==='delivery'?order.delivery==='delivery':order.delivery!=='delivery'))).sort((a,b)=>{
  const left=new Date(a.createdAt||a.date||0).getTime(),right=new Date(b.createdAt||b.date||0).getTime();
  const validLeft=Number.isFinite(left)?left:Number.MAX_SAFE_INTEGER,validRight=Number.isFinite(right)?right:Number.MAX_SAFE_INTEGER;
  return pendingSort==='oldest'?validLeft-validRight:validRight-validLeft;
 });
 const atCapacity=working>=Math.max(1,Number(capacity)||10);
 return <div className="dv-cash-console">
  <header className="dv-cash-hero"><div><span className="dv-cash-eyebrow"><Store size={16}/> CAJA / RECEPCIÓN · DVOLADA CLOUD</span><h2>Una caja organizada, una cocina en marcha.</h2><p>Revisá las solicitudes nuevas y decidí cuáles aceptar. La cocina recibe únicamente las que el negocio haya aceptado.</p></div><button type="button" onClick={onGoKitchen} className="dv-cash-goto-kitchen"><ChefHat size={21}/> Abrir cocina <ArrowRight size={17}/></button></header>
  <div className="dv-cash-overview">
   <div><span><Bell size={18}/> Por aceptar</span><strong>{q.pending.length}</strong><small>Requieren tu aprobación</small></div>
   <div><span><ChefHat size={18}/> En cocina</span><strong>{working}</strong><small>Aceptados y preparando</small></div>
   <div><span><CheckCheck size={18}/> Listos</span><strong>{q.ready.length}</strong><small>Para retiro o repartidor</small></div>
  </div>
  {atCapacity&&<div className="dv-cash-capacity" role="status"><ChefHat size={18}/><span>La cocina llegó a su capacidad configurada ({capacity} pedidos). Revisá tiempos antes de aceptar más. Esta alerta no bloquea pedidos automáticamente hasta conectar el servidor.</span></div>}
  {(q.scheduledDue.length>0||q.scheduledFuture.length>0||q.scheduledInvalid.length>0)&&<section className="dv-cash-scheduled" aria-label="Pedidos programados"><header><Clock3 size={19}/><strong>Pedidos programados</strong><span>{q.scheduledDue.length} por activar · {q.scheduledFuture.length} futuros</span></header>
   {q.scheduledDue.map(order=><div className="dv-cash-scheduled-row" key={order.id}><div><strong>{number(order)} · Hora de preparar</strong><small>{order.name||'Cliente'} · {order.scheduledFor?new Date(order.scheduledFor).toLocaleString('es-HN'):'Sin hora'}</small></div><button type="button" disabled={!connected} onClick={()=>onActivate(order)}><Check size={16}/> Activar pedido</button></div>)}
   {q.scheduledFuture.slice(0,5).map(order=><div className="dv-cash-scheduled-row future" key={order.id}><div><strong>{number(order)} · Próximamente</strong><small>{new Date(order.scheduledFor).toLocaleString('es-HN')} · {order.name||'Cliente'}</small></div><span>No disponible todavía</span></div>)}
   {q.scheduledInvalid.length>0&&<p role="alert">{q.scheduledInvalid.length} pedido(s) sin fecha válida: requieren revisión antes de activarse.</p>}
  </section>}
  <div className="dv-cash-panels">
   <section className="dv-cash-pending" aria-labelledby="dv-cash-pending-title"><header><div><span className="dv-cash-eyebrow">BANDEJA DE ENTRADA</span><h3 id="dv-cash-pending-title">Nuevos pedidos <b>{q.pending.length}</b></h3></div><span className="dv-cash-pending-caption">Revisá antes de aceptar</span></header>
    <div className="dv-cash-filters" aria-label="Filtros de nuevos pedidos"><div role="group" aria-label="Tipo de entrega">{[['all','Todos'],['delivery','A domicilio'],['pickup','Retiro en local']].map(([id,label])=><button key={id} type="button" className={pendingView===id?'active':''} aria-pressed={pendingView===id} onClick={()=>setPendingView(id)}>{label}</button>)}</div><label>Ordenar<select aria-label="Orden de pedidos" value={pendingSort} onChange={e=>setPendingSort(e.target.value)}><option value="oldest">Más antiguos primero</option><option value="recent">Más recientes primero</option></select></label></div>
    <div className="dv-cash-list">
     {shownPending.length?shownPending.slice(0,shownLimit).map(order=>{
      const elapsed=elapsedMinutes(order,now),items=Array.isArray(order.items)?order.items:[];
      return <article key={order.id} className="dv-cash-order">
       <div className="dv-cash-order-top"><strong>{number(order)}</strong><span><Clock3 size={15}/>{elapsed===null?'Sin hora':elapsed+' min'}</span></div>
       <p className="dv-cash-order-name">{order.name||'Cliente'} · {order.delivery==='delivery'?'🛵 Envío a domicilio':'🏪 Retiro en local'}</p>
       <div className="dv-cash-order-items">{items.slice(0,5).map((item,i)=><div key={item.id||i}><b>{Math.max(1,Number(item.qty)||1)}×</b> {item.name||'Producto'}</div>)}{items.length>5&&<small>+ {items.length-5} productos más</small>}</div>
       {order.notes&&<div className="dv-cash-order-note">Nota: {order.notes}</div>}
       <div className="dv-cash-order-actions"><button type="button" onClick={()=>onDetail(order)} className="dv-cash-detail"><Eye size={17}/> Ver detalle</button><button type="button" disabled={!connected} onClick={()=>onAccept(order)} className="dv-cash-accept"><Check size={17}/> Aceptar y enviar a cocina</button></div>
      </article>;
     }):<div className="dv-cash-empty"><Check size={34}/><strong>¡No hay pedidos por aceptar!</strong><p>{query.trim()||pendingView!=='all'?'No hay pedidos que coincidan con los filtros.':'Los pedidos nuevos de prueba aparecerán aquí al registrarse en este navegador.'}</p></div>}
     {shownPending.length>shownLimit&&<button type="button" className="dv-cash-load-more" onClick={()=>setShownLimit(limit=>limit+20)}>Mostrar 20 pedidos más · {shownLimit} de {shownPending.length} visibles</button>}
    </div>
   </section>
   <aside className="dv-cash-production" aria-label="Estado de cocina"><header><span className="dv-cash-eyebrow">PRODUCCIÓN</span><h3>Así va tu cocina</h3><p>Seguimiento rápido de las órdenes aceptadas.</p></header>
    <div className="dv-cash-production-group"><h4><span>Por comenzar</span><b>{q.accepted.length}</b></h4>{q.accepted.slice(0,4).map(o=><div key={o.id}><span><b>{number(o)}</b><small>Esperando preparación</small></span><button type="button" title="Imprimir comanda" onClick={()=>onPrint(o)}><Printer size={17}/></button></div>)}</div>
    <div className="dv-cash-production-group"><h4><span>Preparando</span><b>{q.preparing.length}</b></h4>{q.preparing.slice(0,4).map(o=><div key={o.id}><span><b>{number(o)}</b><small>En cocina</small></span><button type="button" title="Imprimir comanda" onClick={()=>onPrint(o)}><Printer size={17}/></button></div>)}</div>
    <div className="dv-cash-production-group"><h4><span>Listos para entregar</span><b>{q.ready.length}</b></h4>{q.ready.slice(0,4).map(o=><div key={o.id}><span><b>{number(o)}</b><small>{o.delivery==='delivery'?'Esperando repartidor':'Esperando retiro'}</small></span><button type="button" title="Imprimir comanda" onClick={()=>onPrint(o)}><Printer size={17}/></button></div>)}</div>
    <button type="button" onClick={onGoKitchen} className="dv-cash-production-open"><ChefHat size={17}/> Ir a pantalla de cocina <ArrowRight size={16}/></button>
   </aside>
  </div>
  <p className="dv-cash-safety">Modo de diseño: la caja y la cocina compartirán los estados entre equipos cuando esté lista la API autenticada. En este prototipo los cambios se guardan únicamente en el navegador.</p>
 </div>;
}
