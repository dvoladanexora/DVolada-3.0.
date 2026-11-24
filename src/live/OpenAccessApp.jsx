import React,{useEffect,useMemo,useRef,useState} from 'react';
import {ShoppingBag,Search,MapPin,Phone,Store,WifiOff,ShieldCheck,Bell,BellOff,ArrowRight,ChevronRight,Sun,Moon,LogIn,Bike,X} from 'lucide-react';
import {isDvoladaPushConfigured,enableDvoladaPush,disableDvoladaPush} from './onesignal-push.js';
import {createLiveApi} from './live-api.js';
import {applyDvoladaTheme} from '../theme-policy.js';
import {FlashOffers} from './FlashCampaigns.jsx';
import CatalogSearch from './CatalogSearch.jsx';
import FoodFeed from './FoodFeed.jsx';
import {readCart,writeCart,updateQuantity} from './cart-draft.js';
import './live.css';

/**
 * Public catalogue preview. Checkout stays disabled until an authenticated
 * staging flow is connected and tested with fictional orders.
 */
const money=n=>'L '+(Number(n||0)/100).toLocaleString('es-HN',{minimumFractionDigits:2,maximumFractionDigits:2});
const phoneDigits=value=>value.replace(/\D/g,'').replace(/^504/,'').slice(0,8);
const API_ORIGIN=import.meta.env.VITE_DVOLADA_API_URL||window.location.origin;

export default function OpenAccessApp(){
 const [showWelcome,setShowWelcome]=useState(true);
 const [catalogView,setCatalogView]=useState('food');
 const [welcomePortal,setWelcomePortal]=useState(null);
 const enter=(page,mode='login',intent)=>{if(page==='account'){const query=new URLSearchParams({mode});if(intent)query.set('intent',intent);window.location.assign('/cuenta?'+query);return}setCatalogView(page==='restaurants'?'restaurants':'food');setShowWelcome(false);window.scrollTo(0,0)};
 const [flashOffers,setFlashOffers]=useState([]);
 const [restaurants,setRestaurants]=useState([]);
 const [selected,setSelected]=useState(null),[products,setProducts]=useState([]);
 const [draft,setDraft]=useState(()=>readCart('guest'));
 const {items:cart,restaurantId:cartRestaurantId}=draft;
 const [search,setSearch]=useState(''),[replaceCart,setReplaceCart]=useState(null);
 const menuRequest=useRef(0);
 const [name,setName]=useState(''),[phone,setPhone]=useState(''),[address,setAddress]=useState('');
 const [mode,setMode]=useState('delivery'),[message,setMessage]=useState('');
 const [theme,setTheme]=useState(()=>{try{return JSON.parse(localStorage.getItem('dv_theme'))||'light'}catch{return 'light'}}),[offline,setOffline]=useState(!navigator.onLine);
 const [pushStatus,setPushStatus]=useState('off');
 const api=useMemo(()=>{
  if(!API_ORIGIN)return null;
  try{return createLiveApi({baseUrl:API_ORIGIN,getSessionToken:()=>null})}catch{return null}
 },[]);
 useEffect(()=>{writeCart('guest',draft)},[draft]);
 useEffect(()=>{
  const media=matchMedia('(prefers-color-scheme: dark)');
  const update=()=>applyDvoladaTheme({root:document.documentElement,themeColorMeta:document.querySelector('meta[name="theme-color"]'),
   theme,internalPreview:false,prefersDark:media.matches,hour:new Date().getHours()});
  update();media.addEventListener?.('change',update);
  try{localStorage.setItem('dv_theme',JSON.stringify(theme))}catch{}
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
  if(offline)return;
  const refresh=()=>api.publicFlash().then(data=>{if(active)setFlashOffers(data.campaigns)}).catch(()=>{});
  refresh();const timer=setInterval(refresh,30000);
  api.restaurants().then(r=>{if(active){setRestaurants(r.restaurants||[]);setMessage('')}})
   .catch(()=>{if(active)setMessage('No se pudo obtener el catálogo del servidor. Probá nuevamente más tarde.')});
  return()=>{active=false;clearInterval(timer)};
 },[api,offline]);
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
 async function openRestaurant(id){
  if(!api||offline)return;
  setMessage('');
  const request=++menuRequest.current;
  try{
   const response=await api.products(id);
   if(request!==menuRequest.current)return;
   setSelected(response.restaurant);setProducts(response.products||[]);
  }catch{if(request===menuRequest.current)setMessage('No se pudo cargar el menú. No se creó ningún pedido.')}
 }
 function add(item){
  const product={productId:item.id,name:item.name,priceMinor:item.price_minor};
  const next={restaurantId:selected.id,items:updateQuantity(cartRestaurantId===selected.id?cart:[],product,1)};
  if(cart.length&&cartRestaurantId!==selected.id)setReplaceCart(next);
  else setDraft(next);
 }
 const visible=restaurants.filter(r=>r.name.toLowerCase().includes(search.trim().toLowerCase()));
 const subtotal=cart.reduce((sum,p)=>sum+p.priceMinor*p.quantity,0);
 const fee=mode==='delivery'?(restaurants.find(r=>r.id===cartRestaurantId)?.delivery_fee_minor||0):0;
 const validPhone=/^[0-9]{8}$/.test(phone);
 const canAttempt=!!(cart.length&&name.trim().length>=2&&validPhone&&(mode==='pickup'||address.trim().length>=8));
 // The commercial welcome uses the original Dvolada layout; orders and roles remain server-authorized.
 if(showWelcome)return <div className="app dv32 dv-welcome-mode"><main id="dv-main-content"><section className="welcome-screen"><div className="welcome-showcase"><div className="welcome-showcase-content"><span className="welcome-kicker">DESCUBRÍ DVOLADA</span><h2>Lo que se te antoja, <em>de volada.</em></h2><p>Explorá restaurantes y productos disponibles en un solo lugar.</p><div className="welcome-product-strip">{restaurants.slice(0,4).map((place,i)=><button type="button" key={place.id||i} className="welcome-product-card" disabled={offline} onClick={()=>{enter('restaurants');openRestaurant(place.id)}}><img src={place.photoUrl||place.image||import.meta.env.BASE_URL+'logo.png'} alt={place.name||'Restaurante'} loading="lazy"/><span>{place.name||'Restaurante'}</span></button>)}</div><button className="welcome-explore" onClick={()=>enter('restaurants')}>Ver restaurantes <ArrowRight size={17}/></button></div></div><div className="welcome-panel"><button type="button" className="welcome-theme-toggle" onClick={()=>setTheme(t=>t==='dark'?'light':'dark')} aria-label={theme==='dark'?'Activar modo claro':'Activar modo oscuro'} title={theme==='dark'?'Modo claro':'Modo oscuro'}>{theme==='dark'?<Sun size={22}/>:<Moon size={22}/>}</button><div className="welcome-nexora"><img src={`${import.meta.env.BASE_URL}file_00000000e77081fd8cf8ee8349e461b6.png`} alt="Powered by Nexora Systems"/></div><img src={`${import.meta.env.BASE_URL}logo.png`} alt="Dvolada"/><span className="kicker">BIENVENIDO A DVOLADA</span><h1>Pedí fácil, que te llega de volada.</h1><p>Descubrí restaurantes y tus comidas favoritas en Dvolada.</p><div className="welcome-actions"><button className="primary wide" onClick={()=>enter('account')}>Iniciar sesión <ArrowRight size={18}/></button><button className="secondary wide" onClick={()=>enter('home')}>Continuar como invitado <ChevronRight size={17}/></button><button className="welcome-signup" onClick={()=>enter('account','register')}>¿No tenés cuenta? Crear mi cuenta</button></div><div className="welcome-nexora-mobile"><img src={`${import.meta.env.BASE_URL}file_00000000e77081fd8cf8ee8349e461b6.png`} alt="Powered by Nexora Systems" loading="lazy"/></div><div className="welcome-affiliates"><button type="button" onClick={()=>setWelcomePortal('login')} aria-haspopup="dialog"><LogIn size={16}/> Ya soy parte de Dvolada</button><button type="button" onClick={()=>setWelcomePortal('join')} aria-haspopup="dialog"><Store size={16}/> Quiero unirme a Dvolada</button></div>{welcomePortal&&<div className="dv-welcome-portal-backdrop" onMouseDown={()=>setWelcomePortal(null)} onKeyDown={e=>{if(e.key==='Escape'){e.stopPropagation();setWelcomePortal(null)}}}><div className="dv-welcome-portal-glass" role="dialog" aria-modal="true" aria-labelledby="dv-welcome-portal-title" onMouseDown={e=>e.stopPropagation()}><button type="button" className="dv-welcome-portal-close" autoFocus onClick={()=>setWelcomePortal(null)} aria-label="Cerrar opciones"><X size={20}/></button><span className="kicker">DVOLADA</span><h2 id="dv-welcome-portal-title">{welcomePortal==='login'?'¿Cómo querés ingresar?':'¿Cómo querés unirte?'}</h2><p>{welcomePortal==='login'?'Elegí el acceso que corresponde a tu actividad.':'Seleccioná cómo querés formar parte de Dvolada.'}</p><button type="button" className="dv-welcome-portal-option" onClick={()=>{setWelcomePortal(null);enter('account',welcomePortal==='login'?'login':'recover','restaurant')}}><Store size={22}/><span><strong>Restaurante o negocio</strong><small>{welcomePortal==='login'?'Ingresar al panel de afiliados':'Activar mi negocio con invitación'}</small></span><ChevronRight size={18}/></button><button type="button" className="dv-welcome-portal-option" onClick={()=>{setWelcomePortal(null);enter('account',welcomePortal==='login'?'login':'register','courier')}}><Bike size={22}/><span><strong>Repartidor</strong><small>{welcomePortal==='login'?'Ingresar al panel de reparto':'Solicitar registro desde mi cuenta'}</small></span><ChevronRight size={18}/></button></div></div>}<div className="dv-welcome-about"><strong>Conocenos</strong><span>Dvolada · Powered by Nexora Systems</span><small>Próximamente: sitio oficial de Nexora Systems</small></div><small>Catálogo en línea · Compras con cuenta autorizada</small></div></section></main></div>;
 return <div className="dvl-app">
  <header className="dvl-header">
   <div className="dvl-brand"><img className="dvl-official-logo" src={import.meta.env.BASE_URL+'logo.png'} alt="Dvolada"/><div>
    <strong>Dvolada</strong><small>Pedí fácil, que te llega de volada</small></div></div>
   <div className="dvl-head-actions">
    <button type="button" className="dvl-action secondary" onClick={()=>setShowWelcome(true)}>Inicio</button>
    <a className="dvl-action secondary" href="/cuenta">Mi cuenta</a>
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
    <FlashOffers campaigns={offline?[]:flashOffers} money={money} open={openRestaurant}/>
    <section className="dvl-panel">
     <h2><Store size={20}/> {selected?selected.name:'Restaurantes afiliados'}</h2>
     {selected?.description&&<p>{selected.description}</p>}
     {selected?.address&&<p>{selected.address}</p>}
     {selected&&<button className="dvl-action secondary" onClick={()=>{menuRequest.current++;setSelected(null);setProducts([])}}>Volver a restaurantes</button>}
     {!selected&&<><div className="dv-catalog-switch" role="group" aria-label="Cómo explorar Dvolada">
      <button type="button" aria-pressed={catalogView==='food'} className={catalogView==='food'?'active':''} onClick={()=>setCatalogView('food')}><ShoppingBag size={17}/> Ver comida</button>
      <button type="button" aria-pressed={catalogView==='restaurants'} className={catalogView==='restaurants'?'active':''} onClick={()=>setCatalogView('restaurants')}><Store size={17}/> Ver restaurantes</button>
     </div>{catalogView==='food'?<><label>Buscar comida o restaurante<input type="search" value={search} maxLength={60} onChange={e=>setSearch(e.target.value)} placeholder="¿Qué se te antoja?"/></label>
     <FoodFeed api={api} offline={offline} term={search} money={money} openRestaurant={openRestaurant}/></>:<><CatalogSearch api={api} offline={offline} term={search} onChange={setSearch} openRestaurant={openRestaurant} money={money}/>
      <div className="dvl-stack" style={{marginTop:18}}>{visible.map(r=><article className="dvl-panel" key={r.id}><div className="dvl-row"><div><strong>{r.name}</strong><small>{r.online_state==='open'?'Aceptando pedidos':'En pausa'}</small><small>Envío de referencia: {money(r.delivery_fee_minor)}</small></div><Store size={24} aria-hidden="true"/></div>
       <button className="dvl-action secondary" disabled={offline||r.online_state!=='open'} onClick={()=>openRestaurant(r.id)}>Ver productos <ArrowRight size={16}/></button>
      </article>)}
      {!visible.length&&<p>No hay negocios disponibles todavía.</p>}</div></>}</>}
     {selected&&<div className="dvl-stack" style={{marginTop:18}}>{products.map(p=><div key={p.id} className="dvl-row"><div>
       <> {p.photoUrl&&<img className="dvl-menu-photo" src={p.photoUrl} alt={p.name} loading="lazy"/>}<strong>{p.name}</strong><small>{p.category&&p.category+' · '}{money(p.price_minor)}</small></></div>
       <button className="dvl-action secondary" disabled={offline||selected.online_state!=='open'} onClick={()=>add(p)}>Agregar</button>
      </div>)}{!products.length&&<p>Este negocio todavía no tiene productos.</p>}</div>}
    </section>
    <section className="dvl-panel">
     <h2><ShoppingBag size={20}/> Mi pedido</h2>
     {replaceCart&&<div className="dvl-cart-confirm" role="group" aria-label="Cambiar carrito">
      <p>Cada pedido corresponde a un restaurante. ¿Querés reemplazar el carrito actual?</p>
      <div className="dvl-inline">
       <button className="dvl-action" onClick={()=>{setDraft(replaceCart);setReplaceCart(null)}}>Reemplazar</button>
       <button className="dvl-action secondary" onClick={()=>setReplaceCart(null)}>Conservar carrito</button>
      </div>
     </div>}
     {!cart.length&&<p>Agregá un producto para comenzar.</p>}
     {cart.map(p=><div className="dvl-row" key={p.productId}><div><strong>{p.name}</strong><small>{money(p.priceMinor)} × {p.quantity}</small></div>
      <button className="dvl-action secondary" onClick={()=>setDraft(current=>({...current,items:updateQuantity(current.items,p,-1)}))}>Quitar uno</button></div>)}
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
      <div className="dvl-notice"><ShieldCheck size={18}/> Tu teléfono es obligatorio para el pedido. En esta vista no se envían pedidos ni se verifica el número por SMS. Continuá a tu cuenta y elegí «Usar carrito de invitado» para completar el pedido.</div>
      <button className="dvl-action" disabled={!canAttempt||offline} onClick={()=>{if(!writeCart('guest',draft)){setMessage('No se pudo conservar el carrito. Permití el almacenamiento de esta página y volvé a intentar.');return}enter('account')}}>
       <Phone size={17}/> Continuar a mi cuenta
      </button>
     </>}
    </section>
   </div>
   <footer className="dvl-footer"><span>Powered by Nexora Systems</span><span>Catálogo de invitado · Pedidos reales desactivados sin cuenta</span></footer>
  </main>
 </div>;
}
