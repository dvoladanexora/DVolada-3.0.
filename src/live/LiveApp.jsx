import React,{useCallback,useEffect,useMemo,useRef,useState} from 'react';
import {createPortal} from 'react-dom';
import {ShoppingBag,Store,Bike,ShieldCheck,LogOut,RefreshCw,WifiOff,LockKeyhole,ArrowRight,Package,CheckCircle2} from 'lucide-react';
import {createLiveApi,LiveApiError} from './live-api.js';
import './live.css';
import { enableQaPush, disableQaPush } from './onesignal-push.js';
import {applyDvoladaTheme} from '../theme-policy.js';
import ClientAccess,{ClientCodes} from './ClientAccess.jsx';
import ClientSupport from './ClientSupport.jsx';
import CatalogSearch from './CatalogSearch.jsx';
import {readCart,writeCart,updateQuantity} from './cart-draft.js';

const apiOrigin=import.meta.env.VITE_DVOLADA_API_URL||window.location.origin;
const price=n=>'L '+(Number(n||0)/100).toLocaleString('es-HN',{minimumFractionDigits:2,maximumFractionDigits:2});
const orderLabel={Pendiente:'Pendiente',Aceptado:'Aceptado',Preparando:'Preparando',Listo:'Listo',
 Recogido:'Recogido','En camino':'En camino','En ubicación':'En ubicación',
 Entregado:'Entregado',Cancelado:'Cancelado',Rechazado:'Rechazado'};
const staffTransitions={Pendiente:['Aceptado','Rechazado'],Aceptado:['Preparando','Cancelado'],
 Preparando:['Listo','Cancelado']};
const courierTransitions={Listo:'Recogido',Recogido:'En camino','En camino':'En ubicación'};
const auditLabels={restaurant_created:'Alta de negocio',restaurant_updated:'Cambio de negocio',
 membership_assigned:'Vinculación de personal',courier_enrolled:'Alta de repartidor'};
const newKey=()=>crypto.randomUUID();
function errorLabel(error){
 if(!(error instanceof LiveApiError))return error?.message||'No fue posible completar la acción.';
 const lookup={
  SIN_CONEXION:'Sin conexión con el servidor. No se confirmó la operación; revisá el estado antes de intentar nuevamente.',
  ORDER_CHANGED:'Otro usuario modificó el pedido. Actualizá la lista antes de actuar.',
  SESSION_REQUIRED:'No hay una sesión válida. Iniciá sesión nuevamente.',
  SESSION_INVALID:'La sesión venció o fue revocada. Volvé a iniciar sesión.',
  ROLE_FORBIDDEN:'Tu cuenta no tiene permiso para esta acción.',
  RESTAURANT_FORBIDDEN:'No tenés acceso a ese restaurante.',
  ORDER_CREATION_DISABLED:'Los pedidos reales siguen bloqueados hasta aprobar el lanzamiento.',
  RESTAURANT_NOT_ACCEPTING:'Este restaurante no acepta pedidos en este momento.',
  PRODUCT_UNAVAILABLE:'Cambió un producto o su precio. Volvé a revisar tu carrito.',
  CHECKOUT_TOTAL_CHANGED:'Cambió el precio del pedido. Actualizá el menú y revisá el total antes de confirmar.',
  CHECKOUT_NOT_FOUND:'Aún no encontramos una confirmación. Podés reintentar con los mismos datos.',
  IDEMPOTENCY_KEY_REUSED:'Verificá el pedido anterior antes de intentar una nueva compra.',
  COURIER_LIMIT:'Este repartidor ya tiene dos pedidos activos.',
  PIN_INVALID:'El PIN no coincide. Confirmalo con el cliente.',
  PIN_LOCKED:'Demasiados intentos. Se requiere intervención autorizada.',
  FIREBASE_IDENTITY_UNVERIFIED:'Verificá tu correo antes de ingresar.',
  FIREBASE_NOT_CONFIGURED:'Todavía no se configuró Firebase para Dvolada.',
  CLIENT_CODE_INVALID:'La clave o el código no es válido.',
  LOGIN_RATE_LIMITED:'Demasiados intentos de acceso. Intentá más tarde.'
 };
 return lookup[error.code]||error.code||'Error de conexión';
}
function Action({children,onClick,disabled=false,kind='primary'}){return <button type="button" className={'dvl-action '+kind} disabled={disabled} onClick={onClick}>{children}</button>}
function WaitOrError({message,warning=false}){return message?<div role={warning?'alert':'status'} className={'dvl-notice '+(warning?'warn':'')}>{message}</div>:null}
function OrderCard({order,children}){
 return <article className="dvl-order"><div className="dvl-order-head"><strong>#{order.orderNumber||order.id?.slice(0,8)}</strong><span>{orderLabel[order.status]||order.status}</span></div>
 <div className="dvl-order-foot"><span>{price(order.totalMinor)}</span><span>Versión {order.version}</span><span>{order.deliveryMethod==='delivery'?'Envío':'Recoger'}</span></div>{children}</article>
}
export default function LiveApp(){
 const sessionRef=useRef(null),alive=useRef(true),checkoutInFlight=useRef(false),menuRequest=useRef(0);
 const [pushConfig,setPushConfig]=useState(null),[pushEnabled,setPushEnabled]=useState(false);
 const [accountEnabled,setAccountEnabled]=useState(false),[accessReady,setAccessReady]=useState(false);
 const [newCodes,setNewCodes]=useState(null),[support,setSupport]=useState(null);
 const [favoriteIds,setFavoriteIds]=useState([]),[onlyFavorites,setOnlyFavorites]=useState(false);
 const [session,setSession]=useState(null),[accessCode,setAccessCode]=useState('');
 const [status,setStatus]=useState(''),[error,setError]=useState(''),[refreshWarning,setRefreshWarning]=useState('');
 const [scope,setScope]=useState('customer'),[restaurants,setRestaurants]=useState([]),[products,setProducts]=useState([]);
 const [shoppingRestaurant,setShoppingRestaurant]=useState(''),[cart,setCart]=useState([]),[catalogTerm,setCatalogTerm]=useState('');
 const [pendingKey,setPendingKey]=useState(null),[replaceCart,setReplaceCart]=useState(null);
 const [cartRestaurantId,setCartRestaurantId]=useState('');
 const [phone,setPhone]=useState('');
 const [deliveryAddress,setDeliveryAddress]=useState(''),[deliveryMethod,setDeliveryMethod]=useState('delivery');
 const [orders,setOrders]=useState([]),[selectedRestaurantId,setSelectedRestaurantId]=useState('');
 const [orderDetail,setOrderDetail]=useState(null);
 const [couriers,setCouriers]=useState([]),[courierChoice,setCourierChoice]=useState({});
 const [manageProducts,setManageProducts]=useState([]),[newProductName,setNewProductName]=useState(''),[newProductPrice,setNewProductPrice]=useState('');
 const [editPrices,setEditPrices]=useState({}),[restaurantCapabilities,setRestaurantCapabilities]=useState(null);
 const [newRestaurantName,setNewRestaurantName]=useState(''),[newRestaurantPlan,setNewRestaurantPlan]=useState('ONLINE');
 const [adminSelectedId,setAdminSelectedId]=useState(''),[adminMemberId,setAdminMemberId]=useState(''),[adminStaffRole,setAdminStaffRole]=useState('owner');
 const [adminCourierId,setAdminCourierId]=useState('');
 const [adminFee,setAdminFee]=useState(''),[audit,setAudit]=useState(null);
 const [selectedPin,setSelectedPin]=useState(null),[pinEntry,setPinEntry]=useState('');
 const [adminStats,setAdminStats]=useState(null),[adminRestaurants,setAdminRestaurants]=useState([]);
 const [busy,setBusy]=useState(false),[offline,setOffline]=useState(!navigator.onLine);
 const [theme,setTheme]=useState(()=>{try{return JSON.parse(localStorage.getItem('dv_theme'))||'light'}catch{return 'light'}});
 useEffect(()=>{
  const media=window.matchMedia('(prefers-color-scheme: dark)');
  const update=()=>applyDvoladaTheme({root:document.documentElement,
   themeColorMeta:document.querySelector('meta[name="theme-color"]'),
   theme,internalPreview:false,prefersDark:media.matches,hour:new Date().getHours()});
  update();
  media.addEventListener?.('change',update);
  try{localStorage.setItem('dv_theme',JSON.stringify(theme))}catch{}
  return()=>media.removeEventListener?.('change',update);
 },[theme]);
 const configured=Boolean(apiOrigin);
 const api=useMemo(()=>{
  if(!configured)return null;
  try{return createLiveApi({baseUrl:apiOrigin,getSessionToken:()=>sessionRef.current?.sessionToken,
   getClientAccount:()=>sessionRef.current?.clientAccount})}
  catch{return null}
 },[configured]);

 const endLocalSession=useCallback(()=>{
  sessionRef.current=null;menuRequest.current++;
  setNewCodes(null);setSupport(null);setFavoriteIds([]);setOnlyFavorites(false);
  setSession(null);setScope('customer');setSelectedRestaurantId('');
  setOrders([]);setOrderDetail(null);setManageProducts([]);setRestaurantCapabilities(null);
  setCouriers([]);setCourierChoice({});setAdminStats(null);setAdminRestaurants([]);
  setAdminFee('');setAdminSelectedId('');setAdminCourierId('');setAdminMemberId('');setAudit(null);
  setNewRestaurantName('');setNewRestaurantPlan('ONLINE');setAdminStaffRole('owner');
  setNewProductName('');setNewProductPrice('');setEditPrices({});
  setCart([]);setCartRestaurantId('');setShoppingRestaurant('');setProducts([]);setCatalogTerm('');
  setPendingKey(null);setReplaceCart(null);setDeliveryMethod('delivery');
  setSelectedPin(null);setPinEntry('');setPhone('');setDeliveryAddress('');
  setPushEnabled(false);setRefreshWarning('');setStatus('');
 },[]);
 const openSession=useCallback((me,clientAccount=false)=>{
  if(clientAccount)sessionRef.current={clientAccount:me.user.id};
  const first=me.restaurants?.[0]?.restaurant_id||'';
  setSelectedRestaurantId(first);
  setScope(me.user.role==='platform_admin'?'admin':me.user.role==='courier'?'courier':first?'restaurant':'customer');
  if(me.user.role==='customer'&&!first){
   const draft=readCart(me.user.id);
   setCart(draft.items);setCartRestaurantId(draft.restaurantId);setPendingKey(draft.pendingKey);
  }
  setSession(me);
 },[]);
 useEffect(()=>{
  if(!api||offline||accessReady)return;
  let active=true;
  async function restore(){
   try{
    const config=await api.clientAccess();
    if(!active)return;
    setAccountEnabled(config.enabled);
    if(config.enabled){
     const me=await api.me(true);
     if(active&&!sessionRef.current)openSession(me,true);
    }
   }catch(error){
    if(active&&error.status!==401)setError(errorLabel(error));
   }finally{if(active)setAccessReady(true)}
  }
  restore();
  return()=>{active=false};
 },[api,offline,accessReady,openSession]);
 const handleSessionError=useCallback(error=>{
  if(!(error instanceof LiveApiError)||error.status!==401)return false;
  endLocalSession();
  setError('La sesión venció. Iniciá sesión nuevamente.');
  if(pushConfig?.enabled)disableQaPush(pushConfig).catch(()=>{});
  return true;
 },[endLocalSession,pushConfig]);

 const panelRef=useRef(null),latestRead=useRef(0);
 if(panelRef.current?.scope!==scope||panelRef.current?.restaurantId!==selectedRestaurantId){
  panelRef.current={scope,restaurantId:selectedRestaurantId};
 }

 const load=useCallback(async (view=scope,restaurantId=selectedRestaurantId)=>{
  const activeSession=sessionRef.current;
  if(!api||!activeSession||!navigator.onLine)return;
  const panel=panelRef.current;
  const request=++latestRead.current;
  const canApply=()=>alive.current&&sessionRef.current===activeSession&&panelRef.current===panel&&latestRead.current===request;
  if(view==='customer'){const result=await api.customerOrders();if(canApply())setOrders(result.orders||[])}
  if(view==='restaurant'&&restaurantId){
   const [result,eligible,menu,capabilities]=await Promise.all([
    api.restaurantOrders(restaurantId),api.eligibleCouriers(restaurantId).catch(()=>({couriers:[]})),
    api.restaurantProducts(restaurantId),api.restaurantCapabilities(restaurantId)
   ]);
   if(canApply()){setOrders(result.orders||[]);setCouriers(eligible.couriers||[]);
    setManageProducts(menu.products||[]);setRestaurantCapabilities(capabilities)}
  }
  if(view==='courier'){const r=await api.courierOrders();if(canApply())setOrders(r.orders||[])}
  if(view==='admin'){
   const [overview,managed]=await Promise.all([api.adminOverview(),api.adminRestaurants()]);
   if(canApply()){setAdminStats(overview);setAdminRestaurants(managed.restaurants||[])}
  }
 },[api,scope,selectedRestaurantId]);
 useEffect(()=>{alive.current=true;return()=>{alive.current=false}},[]);
 const cartAccount=session?.user?.role==='customer'&&!session.restaurants?.length?session.user.id:null;
 useEffect(()=>{
  if(cartAccount)writeCart(cartAccount,{restaurantId:cartRestaurantId,items:cart,pendingKey});
 },[cartAccount,cartRestaurantId,cart,pendingKey]);
 useEffect(()=>{
  const on=()=>setOffline(false),off=()=>setOffline(true);
  window.addEventListener('online',on);window.addEventListener('offline',off);
  return()=>{window.removeEventListener('online',on);window.removeEventListener('offline',off)}
 },[]);
 useEffect(()=>{
  if(!api||offline)return;
  let stopped=false;
  fetch('/push-config',{cache:'no-store'}).then(r=>r.ok?r.json():null)
   .then(config=>{if(!stopped)setPushConfig(config)}).catch(()=>{});
  api.restaurants().then(r=>{if(!stopped)setRestaurants(r.restaurants||[])}).catch(()=>{});
  return()=>{stopped=true};
 },[api,offline]);
 useEffect(()=>{
  if(!session||!api||offline||busy)return;
  let live=true;
  const onReadError=error=>{if(live&&!handleSessionError(error))setError(errorLabel(error))};
  load(scope,selectedRestaurantId).catch(onReadError);
  const timer=setInterval(()=>{if(live)load(scope,selectedRestaurantId).catch(onReadError)},15000);
  return()=>{live=false;clearInterval(timer)};
 },[session,api,scope,selectedRestaurantId,load,busy,offline,handleSessionError]);

 useEffect(()=>{
  if(!cartAccount||offline)return;
  let active=true;
  api.favorites().then(data=>{if(active)setFavoriteIds(data.ids)})
   .catch(error=>{if(active&&!handleSessionError(error))setError(errorLabel(error))});
  return()=>{active=false};
 },[api,cartAccount,offline,handleSessionError]);

 async function toggleFavorite(id){
  const result=await run(()=>api.setFavorite(id,!favoriteIds.includes(id)),{refresh:false});
  if(result)setFavoriteIds(ids=>result.favorite?[...new Set([...ids,id])]:ids.filter(item=>item!==id));
 }
 async function authenticateClient(mode,body){
  if(busy||offline||!accessReady)return;
  setBusy(true);setError('');
  try{
   const codes=await api.clientAuthenticate(mode,body);
   if(codes.access)setNewCodes(codes);
   const me=await api.me(true);
   openSession(me,true);
  }catch(error){setError(errorLabel(error))}
  finally{setBusy(false)}
 }
 async function run(fn,{refresh=true}={}){
  if(busy||offline)return;
  setBusy(true);setError('');setRefreshWarning('');
  try{
   const result=await fn();
   if(refresh){
    try{await load(scope,selectedRestaurantId)}
    catch(error){if(!handleSessionError(error))setRefreshWarning('El cambio se guardó. Tocá Actualizar para volver a cargar los datos.')}
   }
   return result;
  }
  catch(e){if(!handleSessionError(e)){setError(errorLabel(e));if(e instanceof LiveApiError&&e.status===409){load(scope,selectedRestaurantId).catch(()=>{})}}}
  finally{if(alive.current)setBusy(false)}
 }
 async function signIn(event){
  event.preventDefault();
  const token=accessCode.trim();
  if(!/^[A-Za-z0-9_-]{43}$/.test(token)||busy||offline)return;
  setBusy(true);
  setError('');
  try{
   sessionRef.current={sessionToken:token};
   const me=await api.me();
   openSession(me);
  }catch(error){
   sessionRef.current=null;
   setError(errorLabel(error));
  }finally{
   setAccessCode('');
   setBusy(false);
  }
 }
 async function setQaPush(enabled){
  if(busy||offline)return;
  setBusy(true);setError('');
  try{
   if(!enabled){
    await disableQaPush(pushConfig);
    setPushEnabled(false);setStatus('Notificaciones desactivadas en este navegador.');
   }else{
    const result=await enableQaPush(pushConfig,()=>api.pushIdentity());
    setPushEnabled(result.status==='enabled');
    setStatus({
     enabled:'Notificaciones activadas para tu cuenta.',
     pending:'Suscripción pendiente. Revisá el permiso del navegador.',
     blocked:'Permiso de notificaciones denegado en el navegador.',
     unsupported:'Este navegador no admite notificaciones.',
     'install-ios':'En iPhone, instalá Dvolada en la pantalla de inicio.',
    }[result.status]||'Notificaciones aún no configuradas.');
   }
  }catch(e){setError(errorLabel(e))}
  finally{setBusy(false)}
 }
 async function logout(){
  setBusy(true);
  try{
   let pushFailure=false;
   if(pushConfig?.enabled){
    try{await disableQaPush(pushConfig)}catch{pushFailure=true}
    setPushEnabled(false);
   }
   if(sessionRef.current)await api.logout();
   endLocalSession();
   if(pushFailure)setStatus('Sesión cerrada. Revisá el permiso de notificaciones de este sitio en el navegador.');
  }catch(e){if(!handleSessionError(e))setError(errorLabel(e))}
  finally{setBusy(false)}
 }
 async function viewProducts(restaurantId){
  setError('');
  const request=++menuRequest.current;
  try{
   const r=await api.products(restaurantId);
   if(request!==menuRequest.current)return;
   setShoppingRestaurant(restaurantId);
   setProducts(r.products||[]);
   setRestaurants(current=>current.some(item=>item.id===restaurantId)
    ?current.map(item=>item.id===restaurantId?r.restaurant:item):[...current,r.restaurant]);
   if(cartRestaurantId===restaurantId&&!pendingKey){
    const latest=new Map(r.products.map(product=>[product.id,product]));
    setCart(current=>current.filter(item=>latest.has(item.productId)).map(item=>{
     const product=latest.get(item.productId);
     return {...item,name:product.name,priceMinor:product.price_minor};
    }));
   }
  }catch(e){if(request===menuRequest.current)setError(errorLabel(e))}
 }
 function putCart(restaurantId,items){
  if(cart.length&&cartRestaurantId!==restaurantId){
   setReplaceCart({restaurantId,items});return;
  }
  setCartRestaurantId(restaurantId);setCart(items);
 }
 function addProduct(p){
  if(pendingKey)return;
  putCart(shoppingRestaurant,updateQuantity(cartRestaurantId===shoppingRestaurant?cart:[],
   {productId:p.id,name:p.name,priceMinor:p.price_minor},1));
 }
 function removeProduct(id){
  if(!pendingKey)setCart(current=>{
   const product=current.find(item=>item.productId===id);
   return product?updateQuantity(current,product,-1):current;
  });
 }
 function confirmCheckout(result){
  if(!sessionRef.current)return;
  writeCart(cartAccount,{items:[]});
  setPendingKey(null);setCart([]);setCartRestaurantId('');setProducts([]);setShoppingRestaurant('');
  setSelectedPin({id:result.order.id,pin:result.deliveryPin});
  setStatus('Pedido de prueba confirmado.');
  load().catch(e=>{if(!handleSessionError(e))setRefreshWarning('Actualizá la lista para ver el pedido.')});
 }
 async function checkout(){
  if(!cartRestaurantId||!cart.length||!cartAccount||checkoutInFlight.current||busy||offline||!restaurant)return;
  if(deliveryMethod==='delivery'&&deliveryAddress.trim().length<8)return setError('Ingresá una dirección completa.');
  if(!/^[0-9]{8}$/.test(phone))return setError('Ingresá los ocho dígitos del teléfono.');
  const key=pendingKey||newKey();
  checkoutInFlight.current=true;
  writeCart(cartAccount,{restaurantId:cartRestaurantId,items:cart,pendingKey:key});
  setPendingKey(key);
  const intent={restaurantId:cartRestaurantId,deliveryMethod,deliveryAddress,phone:'+504'+phone,
   expectedTotalMinor:subtotal+fee,
   items:cart.map(({productId,quantity})=>({productId,quantity}))};
  try{
   const result=await run(async()=>{
    try{return await api.createOrder(intent,key)}
    catch(error){
     if(!pendingKey&&error instanceof LiveApiError&&([400,403,422].includes(error.status)||
        ['RESTAURANT_NOT_ACCEPTING','PRODUCT_UNAVAILABLE','CHECKOUT_TOTAL_CHANGED'].includes(error.code))){
      setPendingKey(null);
     }
     throw error;
    }
   },{refresh:false});
   if(result)confirmCheckout(result);
  }finally{checkoutInFlight.current=false}
 }
 async function recoverCheckout(){
  const result=await run(()=>api.checkoutStatus(pendingKey),{refresh:false});
  if(result)confirmCheckout(result);
 }
 async function reorder(order){
  return run(async()=>{
   const [receipt,menu]=await Promise.all([api.customerOrder(order.id),api.products(order.restaurantId)]);
   const available=new Map(menu.products.map(product=>[product.id,product]));
   const items=receipt.order.items.filter(item=>available.has(item.product_id)).map(item=>{
    const product=available.get(item.product_id);
    return {productId:product.id,name:product.name,priceMinor:product.price_minor,quantity:item.quantity};
   });
   if(!items.length)throw new Error('Los productos de este pedido ya no están disponibles.');
   if(cart.length)setReplaceCart({restaurantId:order.restaurantId,items});
   else putCart(order.restaurantId,items);
   setStatus(items.length===receipt.order.items.length?'Revisá los precios actuales antes de hacer tu pedido.'
    :'Algunos productos ya no están disponibles. Revisá el carrito antes de continuar.');
  },{refresh:false});
 }
 async function showCustomerOrder(order){
  return run(async()=>{
   const data=await api.customerOrder(order.id);
   setSelectedPin({id:order.id,pin:data.deliveryPin,status:data.order.status});
  },{refresh:false})
 }
 async function showRestaurantOrder(order){
  return run(async()=>{
   const result=await api.restaurantOrder(selectedRestaurantId,order.id);
   setOrderDetail({restaurantId:selectedRestaurantId,orderId:order.id,orderNumber:result.order.orderNumber,
    items:result.order.items});
  },{refresh:false});
 }
 async function action(fn){const result=await run(fn);if(result)setStatus('Cambio confirmado en el servidor.');return result}
 const userRole=session?.user?.role;
 const availableScopes=[
  ...(userRole==='customer'&&!session?.restaurants?.length?['customer']:[]),
  ...(session?.restaurants?.length?['restaurant']:[]),
  ...(userRole==='courier'?['courier']:[]),
  ...(userRole==='platform_admin'?['admin']:[])
 ];
 const roles={customer:'Cliente',restaurant:'Restaurante',courier:'Repartidor',admin:'Centro de Control'};
 const selectedBusiness=session?.restaurants?.find(x=>x.restaurant_id===selectedRestaurantId);
 const subtotal=cart.reduce((sum,p)=>sum+p.priceMinor*p.quantity,0);
 const restaurant=restaurants.find(r=>r.id===cartRestaurantId);
 const fee=deliveryMethod==='delivery'?restaurant?.delivery_fee_minor??0:0;
 const canManage=['owner','manager'].includes(selectedBusiness?.staff_role);
 const formattedUserId=session?.user?.id||'';
 return <div className="dvl-app">
  <header className="dvl-header"><div className="dvl-brand"><img className="dvl-official-logo" src={import.meta.env.BASE_URL+'logo.png'} alt="Dvolada" /><div><strong>Dvolada</strong><small>Pedí fácil, que te llega de volada</small></div></div>
   <div className="dvl-head-actions"><label className="dvl-theme">Tema<select aria-label="Tema visual" value={theme} onChange={e=>setTheme(e.target.value)}><option value="light">Claro</option><option value="dark">Oscuro</option><option value="system">Automático</option></select></label>{session&&<span>{session.user.displayName}</span>}{session&&<Action kind="secondary" disabled={busy||offline} onClick={logout}><LogOut size={15}/> Salir</Action>}</div></header>
  <main className="dvl-main">
  <div className="dvl-intro"><span className="dvl-kicker">NEXORA SYSTEMS · DVOLADA ONLINE</span>
   <h1>{session?(scope==='restaurant'&&selectedBusiness?.staff_role==='kitchen'?'Cocina':roles[scope]):'Dvolada · Entorno de pruebas'}</h1>
   <p>{session?'Todas las acciones oficiales se comprueban y guardan en el servidor.':'Accedé para hacer y seguir pedidos con seguridad.'}</p></div>
  {offline&&<div className="dvl-offline" role="alert"><WifiOff size={19}/> Sin conexión. Los pedidos se muestran como potencialmente desactualizados; las acciones están bloqueadas.</div>}
  <WaitOrError message={status}/>
  <WaitOrError message={error} warning/>
  <WaitOrError message={refreshWarning}/>
  {session&&<div className="dvl-id-note"><span>ID de vinculación: <code>{formattedUserId}</code></span><Action kind="text"
   onClick={()=>navigator.clipboard?.writeText(formattedUserId).catch(()=>{})}>Copiar</Action></div>}
  <ClientCodes codes={newCodes} close={()=>setNewCodes(null)}/>
  {!session&&!accessReady&&!offline&&<p role="status">Verificando acceso…</p>}
  {!session&&accountEnabled&&<ClientAccess authenticate={authenticateClient} busy={busy} offline={offline}/>}
  {!session&&(accessReady||offline)&&<form className="dvl-panel dvl-login" onSubmit={signIn}>
   <h2>Ingresá con tu acceso de pruebas</h2>
   <label>Código de acceso<input type="password" autoComplete="off" value={accessCode}
    onChange={e=>setAccessCode(e.target.value)} required /></label>
   <button type="submit" className="dvl-action" disabled={busy||offline||accessCode.trim().length!==43}>Iniciar sesión</button>
   <a href="/">Explorar catálogo sin iniciar sesión</a>
  </form>}
  {session&&<>
   <nav className="dvl-roles" aria-label="Paneles autorizados">{availableScopes.map(s=><button key={s} className={scope===s?'active':''}
    onClick={()=>{setScope(s);setError('');setSelectedPin(null);setOrderDetail(null)}}>{s==='customer'?<ShoppingBag size={17}/>:s==='restaurant'?<Store size={17}/>:s==='courier'?<Bike size={17}/>:<ShieldCheck size={17}/>} {roles[s]}</button>)}
    <Action kind="secondary" disabled={busy||offline} onClick={()=>run(()=>load(scope,selectedRestaurantId),{refresh:false})}><RefreshCw size={15}/> Actualizar</Action>
    {pushConfig?.enabled&&<>
     {!pushEnabled&&<Action kind="secondary" disabled={busy||offline} onClick={()=>setQaPush(true)}>Activar notificaciones</Action>}
     <Action kind="secondary" disabled={busy||offline} onClick={()=>setQaPush(false)}>Desactivar notificaciones</Action>
    </>}
   </nav>
    {support&&orders.some(order=>order.id===support.id)&&<ClientSupport key={support.id+support.mode}
     mode={support.mode} counterpart={scope!=='customer'} order={orders.find(order=>order.id===support.id)} api={api} offline={offline}
     close={()=>setSupport(null)} onSessionError={handleSessionError}/>}
   {scope==='customer'&&<div className="dvl-columns">
    <section className="dvl-panel"><h2>Restaurantes afiliados</h2>
     {!shoppingRestaurant?<div className="dvl-stack">
      <label className="dvl-favorite-filter"><input type="checkbox" checked={onlyFavorites} onChange={event=>setOnlyFavorites(event.target.checked)}/> Solo mis favoritos</label>
      <CatalogSearch api={api} offline={offline} term={catalogTerm} onChange={setCatalogTerm} openRestaurant={viewProducts} money={price}/>
      {restaurants.filter(r=>(!onlyFavorites||favoriteIds.includes(r.id))&&r.name.toLowerCase().includes(catalogTerm.trim().toLowerCase())).map(r=><div className="dvl-row" key={r.id}><div><strong>{r.name}</strong><small>{r.online_state==='open'?'Aceptando pedidos':'En pausa'}</small></div>
      <div className="dvl-inline dvl-client-modes">
      <button className="dvl-action secondary" type="button" disabled={busy||offline} aria-pressed={favoriteIds.includes(r.id)}
       onClick={()=>toggleFavorite(r.id)}>{favoriteIds.includes(r.id)?'Quitar favorito':'Guardar favorito'}</button>
      <Action disabled={offline||r.online_state!=='open'} kind="secondary" onClick={()=>viewProducts(r.id)}>Ver menú</Action></div></div>)}
      {!restaurants.length&&<p>Próximamente encontrarás los restaurantes afiliados aquí.</p>}</div>:
      <><Action kind="text" onClick={()=>{menuRequest.current++;setShoppingRestaurant('');setProducts([])}}>Volver a restaurantes</Action>
       {cart.length>0&&<a className="dvl-cart-link" href="#carrito">Volver al carrito</a>}
       <div className="dvl-stack">{products.map(p=><div className="dvl-row" key={p.id}><div><strong>{p.name}</strong><small>{price(p.price_minor)}</small></div>
        <Action kind="secondary" disabled={offline||busy||Boolean(pendingKey)} onClick={()=>addProduct(p)}>Agregar</Action></div>)}
       {!products.length&&<p>Este local todavía no tiene productos disponibles.</p>}</div></>}
    </section>
    <section className="dvl-panel" id="carrito"><h2>Carrito</h2>
     {replaceCart&&<div className="dvl-cart-confirm" role="group" aria-label="Cambiar carrito">
      <p>Cada pedido corresponde a un solo restaurante. ¿Querés reemplazar el carrito actual?</p>
      <div className="dvl-inline">
       <Action onClick={()=>{setCart(replaceCart.items);setCartRestaurantId(replaceCart.restaurantId);setReplaceCart(null)}}>Reemplazar</Action>
       <Action kind="secondary" onClick={()=>setReplaceCart(null)}>Conservar carrito</Action>
      </div>
     </div>}
     {!cart.length&&readCart('guest').items.length>0&&<Action kind="secondary" disabled={busy||offline} onClick={()=>{
      const draft=readCart('guest');
      if(draft.items.length){putCart(draft.restaurantId,draft.items);writeCart('guest',{items:[]})}
     }}>Usar carrito de invitado</Action>}
     {!cart.length?<p>Seleccioná un restaurante y agregá productos.</p>:<><div className="dvl-stack">
      {cart.map(p=><div className="dvl-row" key={p.productId}><div><strong>{p.name}</strong><small>{p.quantity} × {price(p.priceMinor)}</small></div>
       <Action kind="secondary" disabled={busy||Boolean(pendingKey)} onClick={()=>removeProduct(p.productId)}>Quitar uno</Action></div>)}</div>
      <div className="dvl-row"><strong>Productos</strong><strong>{price(subtotal)}</strong></div>
      <div className="dvl-row"><strong>Envío estimado</strong><strong>{price(fee)}</strong></div>
      <div className="dvl-row dvl-total"><strong>Total preliminar</strong><strong>{price(subtotal+fee)}</strong></div>
      <label>Teléfono de Honduras (+504)<input inputMode="numeric" autoComplete="tel-national" value={phone}
       onChange={e=>setPhone(e.target.value.replace(/\D/g,'').slice(0,8))} /></label>
      <label>Modalidad<select value={deliveryMethod} onChange={e=>setDeliveryMethod(e.target.value)}>
       <option value="delivery">Entrega a domicilio</option><option value="pickup">Recoger en restaurante</option></select></label>
      {deliveryMethod==='delivery'&&<label>Dirección completa<textarea rows={3} value={deliveryAddress}
       maxLength={300} onChange={e=>setDeliveryAddress(e.target.value)} placeholder="Barrio, calle, casa y referencia"/></label>}
      <p className="dvl-muted">El servidor verificará precios y disponibilidad. Los cobros por tarjeta todavía no están habilitados.</p>
      {pendingKey&&<><p>Hay un intento pendiente. Buscá su confirmación o reintentá con los mismos datos.</p>
       <Action kind="secondary" disabled={busy||offline} onClick={recoverCheckout}>Buscar confirmación</Action></>}
      <Action disabled={busy||offline||!restaurant||Boolean(replaceCart)} onClick={checkout}><LockKeyhole size={16}/>
       {pendingKey?'Reintentar el mismo pedido':'Confirmar pedido de prueba'}</Action>
      </>}
    </section>
    <section className="dvl-panel dvl-span"><h2>Mis pedidos</h2>
      {orders.length?<div className="dvl-grid">{orders.map(o=><OrderCard key={o.id} order={o}>
      <Action kind="secondary" disabled={busy||offline} onClick={()=>showCustomerOrder(o)}>Ver detalle / PIN</Action>
      <Action kind="secondary" disabled={offline} onClick={()=>setSupport({id:o.id,mode:'restaurant'})}>Chat con restaurante</Action>
      {o.courierResponse==='accepted'&&<Action kind="secondary" disabled={offline}
       onClick={()=>setSupport({id:o.id,mode:'courier'})}>Chat con repartidor</Action>}
      <Action kind="text" disabled={offline} onClick={()=>setSupport({id:o.id,mode:'claim'})}>Reclamo</Action>
      {o.status==='Entregado'&&<Action kind="text" disabled={busy||offline||Boolean(pendingKey)} onClick={()=>reorder(o)}>Volvé a pedir</Action>}
      {o.status==='Pendiente'&&<Action kind="text" disabled={busy||offline} onClick={()=>action(()=>api.cancelOrder(o,newKey()))}>Cancelar pedido</Action>}
      </OrderCard>)}</div>:<p>Tus pedidos confirmados aparecerán aquí.</p>}
      {selectedPin&&<div className="dvl-pin" role="status"><strong>Pedido {selectedPin.id.slice(0,8)}</strong><p>
       {selectedPin.pin?'PIN de entrega: '+selectedPin.pin:'Sin PIN de entrega disponible'}</p>
       <small>Compartí el PIN únicamente con tu repartidor cuando recibás el pedido.</small>
       <Action kind="text" onClick={()=>setSelectedPin(null)}>Ocultar</Action></div>}
    </section>
   </div>}
   {scope==='restaurant'&&<div className="dvl-stack">
    <section className="dvl-panel"><div className="dvl-row"><h2>Centro de pedidos</h2><label>Negocio<select value={selectedRestaurantId}
     onChange={e=>{setOrderDetail(null);setSupport(null);setOrders([]);setManageProducts([]);setRestaurantCapabilities(null);setCouriers([]);setEditPrices({});setCourierChoice({});setSelectedRestaurantId(e.target.value)}}>{session.restaurants?.map(r=><option key={r.restaurant_id} value={r.restaurant_id}>{r.name}</option>)}</select></label></div>
     <p className="dvl-muted">Solo los empleados autorizados pueden cambiar estados; los cambios simultáneos generan conflicto.</p>
    </section>
    {canManage&&<section className="dvl-panel"><h2>Menú y disponibilidad</h2>
     <p className="dvl-muted">El estado y los precios se guardan en el servidor, no en este dispositivo.</p>
     <div className="dvl-inline dvl-control-actions">
      <span>Estado: <strong>{restaurantCapabilities?.onlineState||'Desconocido'}</strong></span>
      {['open','paused','closed'].map(state=><Action key={state} kind="secondary"
       disabled={busy||offline||restaurantCapabilities?.onlineState===state}
       onClick={()=>action(()=>api.updateAvailability(selectedRestaurantId,state))}>
       {state==='open'?'Abrir':state==='paused'?'Pausar':'Cerrar'}</Action>)}
     </div>
     <div className="dvl-grid dvl-editor">
      <label>Nuevo producto<input value={newProductName} maxLength={150} onChange={e=>setNewProductName(e.target.value)} placeholder="Nombre del producto"/></label>
      <label>Precio (L)<input type="number" min="0" step=".01" value={newProductPrice} onChange={e=>setNewProductPrice(e.target.value)} placeholder="95.00"/></label>
      <Action disabled={busy||offline||newProductName.trim().length<2||!Number.isFinite(Number(newProductPrice))||Number(newProductPrice)<=0}
       onClick={async()=>{const saved=await action(()=>api.createProduct(selectedRestaurantId,{name:newProductName.trim(),
        priceMinor:Math.round(Number(newProductPrice)*100),available:true}));
        if(saved){setNewProductName('');setNewProductPrice('')}}}>Añadir al menú</Action>
     </div>
     <div className="dvl-stack dvl-manage-menu">{manageProducts.map(p=><div className="dvl-row" key={p.id}>
      <div><strong>{p.name}</strong><small>{p.available?'Disponible':'Agotado'} · {price(p.price_minor)}</small></div>
      <div className="dvl-inline">
       <input aria-label={'Nuevo precio '+p.name} type="number" min="0" step=".01" placeholder="Nuevo precio" className="dvl-price-input"
        value={editPrices[p.id]??''} onChange={e=>setEditPrices(x=>({...x,[p.id]:e.target.value}))}/>
       <Action kind="secondary" disabled={busy||offline||!editPrices[p.id]||!Number.isFinite(Number(editPrices[p.id]))}
        onClick={async()=>{const saved=await action(()=>api.updateProduct(selectedRestaurantId,p.id,{priceMinor:Math.round(Number(editPrices[p.id])*100)}));
         if(saved)setEditPrices(v=>({...v,[p.id]:''}))}}>Guardar precio</Action>
       <Action kind="secondary" disabled={busy||offline} onClick={()=>action(()=>api.updateProduct(selectedRestaurantId,p.id,{available:!Boolean(p.available)}))}>
        {p.available?'Agotar':'Habilitar'}</Action>
      </div>
     </div>)}</div>
    </section>}
    <div className="dvl-grid">{orders.map(o=><OrderCard key={o.id} order={o}>
      <Action kind="secondary" disabled={busy||offline} onClick={()=>showRestaurantOrder(o)}>Ver comanda</Action>
      {canManage&&<Action kind="secondary" disabled={offline} onClick={()=>setSupport({id:o.id,mode:'restaurant'})}>Chat con cliente</Action>}
      {orderDetail?.orderId===o.id&&orderDetail.restaurantId===selectedRestaurantId&&<>
       <ul aria-label="Artículos de la comanda">{orderDetail.items.map((item,index)=><li key={index}>{item.quantity} × {item.name_snapshot}</li>)}</ul>
       <Action kind="secondary" onClick={()=>window.print()}>Imprimir comanda</Action>
       {createPortal(<section className="dvl-print-sheet">
        <h1>{selectedBusiness?.name}</h1><h2>Comanda #{orderDetail.orderNumber}</h2>
        <ul>{orderDetail.items.map((item,index)=><li key={index}>{item.quantity} × {item.name_snapshot}</li>)}</ul>
       </section>,document.body)}
      </>}
      <div className="dvl-inline">{(staffTransitions[o.status]||[]).filter(next=>canManage||
       (selectedBusiness?.staff_role==='kitchen'&&['Preparando','Listo'].includes(next))).map(next=><Action key={next} disabled={busy||offline}
        onClick={()=>action(()=>api.restaurantStatus(selectedRestaurantId,o,next,newKey()))}>{next}</Action>)}</div>
      {canManage&&o.status==='Listo'&&o.deliveryMethod==='pickup'&&<Action disabled={busy||offline} onClick={()=>action(()=>api.restaurantStatus(selectedRestaurantId,o,'Entregado',newKey()))}>Entregar en mostrador</Action>}
      {canManage&&o.deliveryMethod==='delivery'&&!o.courierId&&['Aceptado','Preparando','Listo'].includes(o.status)&&
       <div className="dvl-assign"><label>Repartidor<select value={courierChoice[o.id]||''} onChange={e=>setCourierChoice(x=>({...x,[o.id]:e.target.value}))}>
        <option value="">Seleccioná repartidor</option>{couriers.map(c=><option key={c.id} value={c.id}>{c.name} ({c.active_orders}/{c.max_orders})</option>)}</select></label>
       <Action kind="secondary" disabled={busy||offline||!courierChoice[o.id]} onClick={()=>action(()=>api.assignCourier(selectedRestaurantId,o,courierChoice[o.id],newKey()))}>Asignar</Action></div>}
    </OrderCard>)}{!orders.length&&<div className="dvl-panel"><Package size={27}/><p>Aún no hay pedidos del restaurante.</p></div>}</div>
    </div>}
   {scope==='courier'&&<div className="dvl-stack"><section className="dvl-panel"><h2>Mis entregas</h2>
    <p className="dvl-muted">Máximo dos pedidos activos. La confirmación final exige el PIN del cliente.</p></section>
    <div className="dvl-grid">{orders.map(o=><OrderCard key={o.id} order={o}>
      {o.courierResponse==='accepted'&&<Action kind="secondary" disabled={offline}
       onClick={()=>setSupport({id:o.id,mode:'courier'})}>Chat con cliente</Action>}
      <p>{o.deliveryAddress||(o.courierResponse==='offered'?'La dirección se muestra al aceptar el pedido.':'Dirección por confirmar')}</p>
      {o.courierResponse==='offered'&&<div className="dvl-inline">
       <Action disabled={busy||offline} onClick={()=>action(()=>api.courierOffer(o,'accept',newKey()))}>Aceptar pedido</Action>
       <Action kind="secondary" disabled={busy||offline} onClick={()=>action(()=>api.courierOffer(o,'reject',newKey()))}>Rechazar</Action>
      </div>}
      {o.courierResponse==='accepted'&&courierTransitions[o.status]&&<Action disabled={busy||offline}
       onClick={()=>action(()=>api.courierStatus(o,courierTransitions[o.status],newKey()))}>{courierTransitions[o.status]}</Action>}
      {o.status==='En ubicación'&&<><label>PIN del cliente<input inputMode="numeric" type="password"
       maxLength={6} placeholder="6 dígitos" value={selectedPin?.id===o.id?pinEntry:''}
       onFocus={()=>{if(selectedPin?.id!==o.id){setSelectedPin({id:o.id});setPinEntry('')}}}
       onChange={e=>setPinEntry(e.target.value.replace(/\D/g,'').slice(0,6))}/></label>
       <Action disabled={busy||offline||pinEntry.length!==6||selectedPin?.id!==o.id}
        onClick={()=>action(async()=>{const r=await api.courierDeliver(o,pinEntry,newKey());setPinEntry('');return r})}>Confirmar entrega</Action></>}
    </OrderCard>)}{!orders.length&&<div className="dvl-panel"><CheckCircle2 size={27}/><p>Sin pedidos asignados.</p></div>}</div>
   </div>}
   {scope==='admin'&&<div className="dvl-stack"><section className="dvl-panel"><h2>Centro de Control</h2>
    <p className="dvl-muted">Resumen operativo en el servidor. La autorización se comprueba en cada solicitud.</p>
    <div className="dvl-stats"><div><strong>{adminStats?.restaurants?.total??'—'}</strong><span>Restaurantes</span></div>
     <div><strong>{adminStats?.restaurants?.open??'—'}</strong><span>Abiertos</span></div>
     <div><strong>{adminStats?.orders?.active??'—'}</strong><span>Pedidos activos</span></div>
     <div><strong>{adminStats?.orders?.delivered??'—'}</strong><span>Entregados</span></div>
     <div><strong>{adminStats?.couriers?.active??'—'}</strong><span>Repartidores habilitados</span></div></div></section>
    <section className="dvl-panel"><h2>Negocios afiliados</h2><div className="dvl-stack">{adminRestaurants.map(r=><div className="dvl-row" key={r.id}>
     <strong>{r.name}</strong><span>{r.plan} · {r.subscription_status} · {r.online_state} · {r.order_count} pedidos</span></div>)}</div></section>
    <section className="dvl-panel">
     <h2>Alta de negocios y afiliados</h2>
     <p className="dvl-muted">Solo Nexora puede activar suscripciones y vincular personal. El negocio se crea cerrado e inactivo por seguridad.</p>
     <div className="dvl-grid dvl-editor">
      <label>Nuevo restaurante<input value={newRestaurantName} maxLength={160} onChange={e=>setNewRestaurantName(e.target.value)} placeholder="Nombre comercial"/></label>
      <label>Plan<select value={newRestaurantPlan} onChange={e=>setNewRestaurantPlan(e.target.value)}>
       <option value="ONLINE">Dvolada Cloud</option><option value="LOCAL">Dvolada Local</option><option value="PLUS">Dvolada Plus</option></select></label>
      <Action disabled={busy||offline||newRestaurantName.trim().length<2}
       onClick={async()=>{const result=await action(()=>api.adminCreateRestaurant({name:newRestaurantName,plan:newRestaurantPlan}));
        if(result){setAdminSelectedId(result.restaurant.id);setNewRestaurantName('')}}}>Crear negocio</Action>
     </div>
     <label>Negocio para administrar<select value={adminSelectedId} onChange={e=>{setAdminSelectedId(e.target.value);setAdminFee('')}}>
      <option value="">Seleccionar</option>{adminRestaurants.map(r=><option key={r.id} value={r.id}>{r.name}</option>)}</select></label>
     <div className="dvl-inline dvl-control-actions">
      {adminRestaurants.filter(r=>r.id===adminSelectedId).map(r=><React.Fragment key={r.id}>
       <Action kind="secondary" disabled={busy||offline||r.subscription_status==='active'}
        onClick={()=>action(()=>api.adminUpdateRestaurant(r.id,{subscriptionStatus:'active'}))}>Activar suscripción</Action>
       <Action kind="secondary" disabled={busy||offline||r.subscription_status==='inactive'}
        onClick={()=>action(()=>api.adminUpdateRestaurant(r.id,{subscriptionStatus:'inactive'}))}>Suspender</Action>
      </React.Fragment>)}
     </div>
     {adminRestaurants.filter(r=>r.id===adminSelectedId).map(r=><div className="dvl-grid dvl-editor" key={r.id}>
      <label>Tarifa de envío (L)<input value={adminFee} type="number" min="0" max="1000000" step=".01"
       placeholder={(r.delivery_fee_minor/100).toFixed(2)} onChange={event=>setAdminFee(event.target.value)}/></label>
      <Action disabled={busy||offline||!/^\d{1,7}(?:\.\d{1,2})?$/.test(adminFee)||Number(adminFee)>1000000}
       onClick={async()=>{if(await action(()=>api.adminUpdateRestaurant(r.id,{deliveryFeeMinor:Math.round(Number(adminFee)*100)})))setAdminFee('')}}>
       Guardar tarifa</Action>
     </div>)}
     <div className="dvl-grid dvl-editor">
      <label>ID de usuario registrado<input value={adminMemberId} onChange={e=>setAdminMemberId(e.target.value)} placeholder="UUID del usuario"/></label>
      <label>Rol del empleado<select value={adminStaffRole} onChange={e=>setAdminStaffRole(e.target.value)}>
       {['owner','manager','kitchen','cashier'].map(s=><option value={s} key={s}>{s}</option>)}</select></label>
      <Action disabled={busy||offline||!adminSelectedId||adminMemberId.length<32}
       onClick={()=>action(()=>api.adminAssignMember(adminSelectedId,{userId:adminMemberId.trim(),staffRole:adminStaffRole}))}>
       Vincular empleado</Action>
     </div>
     <div className="dvl-grid dvl-editor">
      <label>ID de repartidor<input value={adminCourierId} onChange={e=>setAdminCourierId(e.target.value)} placeholder="UUID de usuario verificado"/></label>
      <Action disabled={busy||offline||adminCourierId.length<32}
       onClick={()=>action(()=>api.adminEnrollCourier(adminCourierId.trim()))}>Habilitar repartidor</Action>
     </div>
    </section>
    <section className="dvl-panel"><h2>Actividad administrativa</h2>
     <Action kind="secondary" disabled={busy||offline}
      onClick={()=>run(async()=>{const data=await api.adminAudit();setAudit(data.events)},{refresh:false})}>Consultar actividad</Action>
     {audit&&<ul className="dvl-search-results">{audit.map(event=><li className="dvl-row" key={event.id}>
      <div><strong>{auditLabels[event.action]||event.action}</strong><small>{[event.actor_name,event.restaurant_name].filter(Boolean).join(' · ')}</small></div>
      <time dateTime={new Date(event.created_at*1000).toISOString()}>{new Date(event.created_at*1000).toLocaleString('es-HN')}</time>
     </li>)}</ul>}
     {audit?.length===0&&<p>Aún no hay actividad administrativa.</p>}
    </section>
    </div>}
   <footer className="dvl-footer"><span className="dvl-powered">Powered by <img src={import.meta.env.BASE_URL+'file_00000000e77081fd8cf8ee8349e461b6.png'} alt="Nexora Systems" /></span><span>Acceso seguro · Dvolada Online</span></footer>
  </>}
  </main></div>;
}
