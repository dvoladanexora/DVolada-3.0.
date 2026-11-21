import React,{useEffect,useMemo,useState} from 'react';
import {ShoppingBag,Search,MapPin,Phone,Store,WifiOff,ShieldCheck,Bell,BellOff} from 'lucide-react';
import {isDvoladaPushConfigured,enableDvoladaPush,disableDvoladaPush} from './onesignal-push.js';
import {createLiveApi} from './live-api.js';
import {applyDvoladaTheme} from '../theme-policy.js';
import './live.css';

/**
 * Public catalogue preview. Checkout stays disabled until an authenticated
 * staging flow is connected and tested with fictional orders.
 */
const money=n=>'L '+(Number(n||0)/100).toLocaleString('es-HN',{minimumFractionDigits:2,maximumFractionDigits:2});
const phoneDigits=value=>value.replace(/\D/g,'').replace(/^504/,'').slice(0,8);
const stagingPanels=import.meta.env.VITE_DVOLADA_STAGING_PANELS==='true';
const API_ORIGIN=import.meta.env.VITE_DVOLADA_API_URL||(stagingPanels?window.location.origin:'');

export default function OpenAccessApp(){
 const [restaurants,setRestaurants]=useState([]);
 const [selected,setSelected]=useState(null),[products,setProducts]=useState([]);
 const [search,setSearch]=useState(''),[cart,setCart]=useState([]);
 const [cartRestaurantId,setCartRestaurantId]=useState(null);
 const [name,setName]=useState(''),[phone,setPhone]=useState(''),[address,setAddress]=useState('');
 const [mode,setMode]=useState('delivery'),[message,setMessage]=useState('');
 const [theme,setTheme]=useState('light'),[offline,setOffline]=useState(!navigator.onLine);
 const [pushStatus,setPushStatus]=useState('off');
 const api=useMemo(()=>{
  if(!API_ORIGIN)return null;
  try{return createLiveApi({baseUrl:API_ORIGIN,getSessionToken:()=>null})}catch{return null}
 },[]);
 useEffect(()=>{
  const media=matchMedia('(prefers-color-scheme: dark)');
  const update=()=>applyDvoladaTheme({root:document.documentElement,themeColorMeta:document.querySelector('meta[name="theme-color"]'),
   theme,internalPreview:false,prefersDark:media.matches,hour:new Date().getHours()});
  update();media.addEventListener?.('change',update);
  return()=>media.removeEventListener?.('change',update);
 },[theme]);
 useEffect(()=>{
  const online=()=>setOffline(false),offline=()=>setOffline(true);
  window.addEventListener('online',online);window.addEventListener('offline',offline);
  return()=>{window.removeEventListener('online',online);window.removeEventListener('offline',offline)};
 },[]);
 useEffect(()=>{
  let active=true;
  if(!api){setMessage('Conexión del catálogo pendiente. El servidor todavía no está disponible para compras.');return}
  api.restaurants().then(r=>{if(active)setRestaurants(r.restaurants||[])})
   .catch(()=>{if(active)setMessage('No se pudo obtener el catálogo del servidor. Probá nuevamente más tarde.')});
  return()=>{active=false};
 },[api]);
 async function togglePush(){
  if(pushStatus==='busy')return;
  const turningOff=pushStatus==='enabled';
  setPushStatus('busy');
  try{
   const result=turningOff?await disableDvoladaPush():await enableDvoladaPush();
   setPushStatus(result.status==='enabled'?'enabled':'off');
   const notices={enabled:'Notificaciones activadas. Podés desactivarlas cuando quieras.',
    disabled:'Notificaciones desactivadas.',blocked:'Tu navegador bloquea las notificaciones; revisá sus permisos.',
    unsupported:'Este dispositivo o navegador no permite notificaciones web.',
    'install-ios':'En iPhone, instalá Dvolada en la pantalla de inicio y abrila desde allí para activar las notificaciones.',
    pending:'La solicitud está pendiente; revisá los permisos del navegador.'};
   setMessage(notices[result.status]||'La configuración de notificaciones todavía no está lista.');
  }catch{setPushStatus('off');setMessage('No se pudieron configurar las notificaciones. Probá nuevamente.');}
 }
 async function openRestaurant(r){
  if(!api||offline)return;
  setMessage('');
  try{const response=await api.products(r.id);if(cartRestaurantId!==r.id)setCart([]);setCartRestaurantId(r.id);setSelected(r);setProducts(response.products||[])}
  catch{setMessage('No se pudo cargar el menú. No se creó ningún pedido.')}
 }
 function adjust(item,delta){
  setCart(previous=>{
   const entry=previous.find(x=>x.id===item.id);
   if(!entry&&delta>0)return [...previous,{id:item.id,name:item.name,price:item.price_minor,qty:1}];
   return previous.map(x=>x.id===item.id?{...x,qty:Math.min(25,Math.max(0,x.qty+delta))}:x).filter(x=>x.qty>0);
  });
 }
 const visible=restaurants.filter(r=>r.name.toLowerCase().includes(search.trim().toLowerCase()));
 const subtotal=cart.reduce((sum,p)=>sum+p.price*p.qty,0);
 const fee=mode==='delivery'?(selected?.delivery_fee_minor||0):0;
 const validPhone=/^[0-9]{8}$/.test(phone);
 const canAttempt=!!(cart.length&&name.trim().length>=2&&validPhone&&(mode==='pickup'||address.trim().length>=8));
 return <div className="dvl-app">
  <header className="dvl-header">
   <div className="dvl-brand"><img className="dvl-official-logo" src={import.meta.env.BASE_URL+'logo.png'} alt="Dvolada"/><div>
    <strong>Dvolada</strong><small>Pedí fácil, que te llega de volada</small></div></div>
   <div className="dvl-head-actions">
    {stagingPanels&&<a className="dvl-action secondary" href="/pruebas">Paneles de pruebas</a>}
    {isDvoladaPushConfigured()&&<button className="dvl-action secondary" disabled={offline||pushStatus==='busy'}
     type="button" onClick={togglePush} aria-label={pushStatus==='enabled'?'Desactivar notificaciones':'Activar notificaciones'}>
     {pushStatus==='enabled'?<BellOff size={16}/>:<Bell size={16}/>}
     {pushStatus==='enabled'?'Silenciar':'Notificarme'}
    </button>}
    <label className="dvl-theme">Tema<select value={theme} onChange={e=>setTheme(e.target.value)} aria-label="Tema">
     <option value="light">Claro</option><option value="dark">Oscuro</option><option value="system">Automático</option></select></label>
   </div>
  </header>
  <main className="dvl-main">
   <div className="dvl-intro"><span className="dvl-kicker">DVOLADA ONLINE</span><h1>Elegí lo que se te antoje</h1>
    <p>Explorá libremente, sin registrarte. El número de teléfono se solicita únicamente al confirmar el pedido.</p></div>
   {offline&&<div className="dvl-offline" role="alert"><WifiOff size={18}/> Sin conexión. No podemos confirmar pedidos.</div>}
   {message&&<div className="dvl-notice" role="status">{message}</div>}
   <div className="dvl-columns">
    <section className="dvl-panel">
     <h2><Store size={20}/> {selected?selected.name:'Restaurantes afiliados'}</h2>
     {selected&&<button className="dvl-action secondary" onClick={()=>{setSelected(null);setProducts([])}}>Volver a restaurantes</button>}
     {!selected&&<><label>Buscar restaurante<input value={search} onChange={e=>setSearch(e.target.value)} placeholder="¿Qué se te antoja?"/></label>
      <div className="dvl-stack" style={{marginTop:18}}>{visible.map(r=><div className="dvl-row" key={r.id}><div>
       <strong>{r.name}</strong><small>{r.online_state==='open'?'Aceptando pedidos':'En pausa'}</small></div>
       <button className="dvl-action secondary" disabled={offline||r.online_state!=='open'} onClick={()=>openRestaurant(r)}>Ver productos</button>
      </div>)}
      {!visible.length&&<p>No hay negocios disponibles todavía.</p>}</div></>}
     {selected&&<div className="dvl-stack" style={{marginTop:18}}>{products.map(p=><div key={p.id} className="dvl-row"><div>
       <strong>{p.name}</strong><small>{money(p.price_minor)}</small></div>
       <button className="dvl-action secondary" onClick={()=>adjust(p,1)}>Agregar</button>
      </div>)}{!products.length&&<p>Este negocio todavía no tiene productos.</p>}</div>}
    </section>
    <section className="dvl-panel">
     <h2><ShoppingBag size={20}/> Mi pedido</h2>
     {!cart.length&&<p>Agregá un producto para comenzar.</p>}
     {cart.map(p=><div className="dvl-row" key={p.id}><div><strong>{p.name}</strong><small>{money(p.price)} × {p.qty}</small></div>
      <button className="dvl-action secondary" onClick={()=>adjust({id:p.id},-1)}>−</button></div>)}
     {cart.length>0&&<><div className="dvl-row"><strong>Productos</strong><strong>{money(subtotal)}</strong></div>
      <div className="dvl-row"><strong>Envío de referencia</strong><strong>{money(fee)}</strong></div>
      <div className="dvl-row dvl-total"><strong>Total de referencia</strong><strong>{money(subtotal+fee)}</strong></div>
      <label>Nombre<input value={name} onChange={e=>setName(e.target.value)} maxLength={120} placeholder="Nombre y apellido"/></label>
      <label>Teléfono de Honduras<div className="dvl-row"><strong>🇭🇳 +504</strong>
       <input inputMode="tel" value={phone} onChange={e=>setPhone(phoneDigits(e.target.value))}
        placeholder="9999-9999" aria-label="Número de teléfono (8 dígitos)" maxLength={8}/></div></label>
      <label>Modalidad<select value={mode} onChange={e=>setMode(e.target.value)}>
       <option value="delivery">A domicilio</option><option value="pickup">Retirar en restaurante</option></select></label>
      {mode==='delivery'&&<label><MapPin size={16}/> Dirección<input value={address} onChange={e=>setAddress(e.target.value)}
       placeholder="Barrio, calle, casa y referencia"/></label>}
      <div className="dvl-notice"><ShieldCheck size={18}/> Tu teléfono es obligatorio para el pedido. En esta vista preliminar no se envían pedidos ni se verifica el número por SMS.</div>
      <button className="dvl-action" disabled={!canAttempt||offline} onClick={()=>setMessage('Los datos están completos, pero no se envió ningún pedido. La compra seguirá desactivada hasta probar la integración completa en staging.')}>
       <Phone size={17}/> Revisar datos del pedido
      </button>
     </>}
    </section>
   </div>
   <footer className="dvl-footer"><span>Powered by Nexora Systems</span><span>Acceso público · Pedidos reales desactivados en pruebas</span></footer>
  </main>
 </div>;
}
