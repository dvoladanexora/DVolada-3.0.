import React,{useEffect,useRef,useState} from 'react';
import {ShoppingBag,Store,Clock,ArrowRight} from 'lucide-react';

// The original food cards render only public data returned by D1.
// Opening a card loads the restaurant's current menu and option prices.
export default function FoodFeed({api,offline,term='',money,openRestaurant}){
 const [rows,setRows]=useState([]),[next,setNext]=useState(null),[busy,setBusy]=useState(false),[error,setError]=useState('');
 const generation=useRef(0),request=useRef(null),loading=useRef(false);
 const query=term.trim();
 async function load(cursor=null,epoch=generation.current){
  if(!api||offline||loading.current)return;
  loading.current=true;setBusy(true);setError('');
  const controller=new AbortController();request.current=controller;
  try{
   const data=await api.foodFeed({term:query,after:cursor,signal:controller.signal});
   if(controller.signal.aborted||epoch!==generation.current)return;
   setRows(current=>cursor?[...new Map([...current,...data.products].map(p=>[p.id,p])).values()]:data.products);
   setNext(data.next);
  }catch{
   if(!controller.signal.aborted&&epoch===generation.current)setError('No se pudo cargar la comida. Probá de nuevo.');
  }finally{
   if(epoch===generation.current){loading.current=false;setBusy(false)}
  }
 }
 useEffect(()=>{
  generation.current++;request.current?.abort();loading.current=false;
  setBusy(false);setError('');setNext(null);
  if(!offline){setRows([]);const epoch=generation.current;const timer=setTimeout(()=>load(null,epoch),query?250:0);
   return()=>{clearTimeout(timer);generation.current++;request.current?.abort();loading.current=false}
  }
  return()=>{generation.current++;request.current?.abort();loading.current=false}
 },[api,offline,query]);
 return <section aria-label="Comidas disponibles">
  <div className="section-heading"><div><span className="kicker">CERCA DE VOS</span><h2>Comidas para vos</h2></div></div>
  {offline&&<p role="status">Sin conexión. Los productos pueden haber cambiado.</p>}
  {error&&<p role="alert">{error} <button type="button" className="dvl-action secondary" disabled={busy||offline} onClick={()=>load(next)}>Reintentar</button></p>}
  <div className="dv-global-food-grid dv-home-food-feed">
   {rows.map(p=><article className="dv-global-food-card dv-food-feed-card" key={p.id}>
    <button type="button" className="dv-food-feed-open" disabled={offline||p.online_state!=='open'} onClick={()=>openRestaurant(p.restaurant_id)} aria-label={'Ver menú de '+p.restaurant_name+': '+p.name}>
     <div className="dv-global-food-photo">{p.photoUrl?<img src={p.photoUrl} alt={p.name} loading="lazy" decoding="async"/>:<span className="dv-food-photo-placeholder"><ShoppingBag size={28}/></span>}</div>
     <div className="dv-food-feed-info"><strong>{p.name}</strong><small><Store size={13}/>{p.restaurant_name}</small>
      {p.category&&<small>{p.category}</small>}
      <div className="dv-food-feed-details"><b>{money(p.price_minor)}</b><span><Clock size={13}/>{p.online_state==='open'?'Tiempo por confirmar':'En pausa'}</span></div>
     </div>
    </button>
   </article>)}
  </div>
  {busy&&<p role="status">Cargando comidas…</p>}
  {!busy&&!error&&!offline&&!rows.length&&<p>No encontramos comidas disponibles.</p>}
  {next&&!offline&&<button type="button" className="dvl-action secondary" disabled={busy} onClick={()=>load(next)}>Ver más <ArrowRight size={16}/></button>}
 </section>;
}
