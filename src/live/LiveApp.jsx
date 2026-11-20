import React,{useCallback,useEffect,useMemo,useRef,useState} from 'react';
import {ShoppingBag,Store,Bike,ShieldCheck,LogOut,RefreshCw,WifiOff,LockKeyhole,ArrowRight,Mail,Package,CheckCircle2} from 'lucide-react';
import {firebaseReady,firebaseAuth} from './firebase-client.js';
import {createLiveApi,LiveApiError} from './live-api.js';
import './live.css';

const apiOrigin=import.meta.env.VITE_DVOLADA_API_URL||'';
const price=n=>'L '+(Number(n||0)/100).toLocaleString('es-HN',{minimumFractionDigits:2,maximumFractionDigits:2});
const orderLabel={Pendiente:'Pendiente',Aceptado:'Aceptado',Preparando:'Preparando',Listo:'Listo',
 Recogido:'Recogido','En camino':'En camino','En ubicación':'En ubicación',
 Entregado:'Entregado',Cancelado:'Cancelado',Rechazado:'Rechazado'};
const staffTransitions={Pendiente:['Aceptado','Rechazado'],Aceptado:['Preparando','Cancelado'],
 Preparando:['Listo','Cancelado']};
const courierTransitions={Listo:'Recogido',Recogido:'En camino','En camino':'En ubicación'};
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
  COURIER_LIMIT:'Este repartidor ya tiene dos pedidos activos.',
  PIN_INVALID:'El PIN no coincide. Confirmalo con el cliente.',
  PIN_LOCKED:'Demasiados intentos. Se requiere intervención autorizada.',
  FIREBASE_IDENTITY_UNVERIFIED:'Verificá tu correo antes de ingresar.',
  FIREBASE_NOT_CONFIGURED:'Todavía no se configuró Firebase para Dvolada.',
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
 const sessionRef=useRef(null),checkoutKey=useRef(null),alive=useRef(true);
 const [session,setSession]=useState(null),[firebaseUser,setFirebaseUser]=useState(null);
 const [email,setEmail]=useState(''),[password,setPassword]=useState(''),[register,setRegister]=useState(false);
 const [status,setStatus]=useState('Iniciando conexión segura...'),[error,setError]=useState('');
 const [scope,setScope]=useState('customer'),[restaurants,setRestaurants]=useState([]),[products,setProducts]=useState([]);
 const [shoppingRestaurant,setShoppingRestaurant]=useState(''),[cart,setCart]=useState([]);
 const [deliveryAddress,setDeliveryAddress]=useState(''),[deliveryMethod,setDeliveryMethod]=useState('delivery');
 const [orders,setOrders]=useState([]),[selectedRestaurantId,setSelectedRestaurantId]=useState('');
 const [couriers,setCouriers]=useState([]),[courierChoice,setCourierChoice]=useState({});
 const [selectedPin,setSelectedPin]=useState(null),[pinEntry,setPinEntry]=useState('');
 const [adminStats,setAdminStats]=useState(null),[adminRestaurants,setAdminRestaurants]=useState([]);
 const [busy,setBusy]=useState(false),[offline,setOffline]=useState(!navigator.onLine);
 const configured=firebaseReady&&Boolean(apiOrigin);
 const api=useMemo(()=>{
  if(!configured)return null;
  try{return createLiveApi({baseUrl:apiOrigin,getSessionToken:()=>sessionRef.current?.sessionToken})}
  catch{return null}
 },[configured]);

 const load=useCallback(async (view=scope,restaurantId=selectedRestaurantId)=>{
  if(!api||!sessionRef.current||!navigator.onLine)return;
  if(view==='customer'){const result=await api.customerOrders();if(alive.current)setOrders(result.orders||[])}
  if(view==='restaurant'&&restaurantId){
   const [result,eligible]=await Promise.all([api.restaurantOrders(restaurantId),api.eligibleCouriers(restaurantId).catch(()=>({couriers:[]}))]);
   if(alive.current){setOrders(result.orders||[]);setCouriers(eligible.couriers||[])}
  }
  if(view==='courier'){const r=await api.courierOrders();if(alive.current)setOrders(r.orders||[])}
  if(view==='admin'){
   const [overview,managed]=await Promise.all([api.adminOverview(),api.adminRestaurants()]);
   if(alive.current){setAdminStats(overview);setAdminRestaurants(managed.restaurants||[])}
  }
 },[api,scope,selectedRestaurantId]);
 const reconnect=useCallback(async(user)=>{
  if(!api||!user)return;
  if(!user.emailVerified){setSession(null);sessionRef.current=null;setStatus('Verificá tu correo para activar el acceso.');return}
  setStatus('Validando identidad y permisos...');
  try{
   const {getIdToken}=await firebaseAuth();
   const idToken=await getIdToken(user,true);
   const issued=await api.exchange(idToken,(/Android|iPhone|iPad/i.test(navigator.userAgent)?'Móvil':'Navegador')+' Dvolada');
   if(!alive.current)return;
   sessionRef.current=issued;
   const me=await api.me();
   if(!alive.current)return;
   setSession(me);setStatus('');
   const first=me.restaurants?.[0]?.restaurant_id||'';
   setSelectedRestaurantId(first);
   setScope(me.user?.role==='platform_admin'?'admin':me.user?.role==='courier'?'courier':'customer');
  }catch(e){sessionRef.current=null;setSession(null);if(alive.current){setStatus('');setError(errorLabel(e))}}
 },[api]);
 useEffect(()=>{
  alive.current=true;let unsubscribe=()=>{};
  if(!configured||!api){setStatus('Falta configurar la API y Firebase de Dvolada. Los pedidos reales permanecen cerrados.');return()=>{alive.current=false}};
  firebaseAuth().then(({auth,onAuthStateChanged})=>{
   if(!alive.current)return;
   unsubscribe=onAuthStateChanged(auth,u=>{
    setFirebaseUser(u);
    if(u)reconnect(u);
    else{sessionRef.current=null;setSession(null);setStatus('Iniciá sesión o creá una cuenta verificada.')}
   },e=>{setError(errorLabel(e));setStatus('')});
  }).catch(e=>{setError(errorLabel(e));setStatus('')});
  return()=>{alive.current=false;unsubscribe()};
 },[configured,api,reconnect]);
 useEffect(()=>{
  const on=()=>setOffline(false),off=()=>setOffline(true);
  window.addEventListener('online',on);window.addEventListener('offline',off);
  return()=>{window.removeEventListener('online',on);window.removeEventListener('offline',off)}
 },[]);
 useEffect(()=>{
  if(!api)return;
  let stopped=false;
  api.restaurants().then(r=>{if(!stopped)setRestaurants(r.restaurants||[])}).catch(()=>{});
  return()=>{stopped=true};
 },[api]);
 useEffect(()=>{
  if(!session||!api)return;
  let live=true;
  load(scope,selectedRestaurantId).catch(e=>{if(live)setError(errorLabel(e))});
  const timer=setInterval(()=>{if(live&&!busy)load(scope,selectedRestaurantId).catch(()=>{})},15000);
  return()=>{live=false;clearInterval(timer)};
 },[session,api,scope,selectedRestaurantId,load,busy]);

 async function run(fn,{refresh=true}={}){
  if(busy||offline)return;
  setBusy(true);setError('');
  try{const res=await fn();if(refresh)await load(scope,selectedRestaurantId);return res}
  catch(e){setError(errorLabel(e));if(e instanceof LiveApiError&&e.status===409){load(scope,selectedRestaurantId).catch(()=>{})}}
  finally{if(alive.current)setBusy(false)}
 }
 async function signIn(){
  setError('');setBusy(true);
  try{
   const {auth,signInWithEmailAndPassword,createUserWithEmailAndPassword,sendEmailVerification}=await firebaseAuth();
   if(register){const cred=await createUserWithEmailAndPassword(auth,email.trim(),password);await sendEmailVerification(cred.user);
    setStatus('Te enviamos un enlace para verificar el correo.')}
   else await signInWithEmailAndPassword(auth,email.trim(),password);
   setPassword('');
  }catch(e){setError(e?.code?.startsWith?.('auth/')?'No se pudo autenticar. Revisá los datos o recuperá tu contraseña.':errorLabel(e))}
  finally{setBusy(false)}
 }
 async function resetPassword(){
  if(!email.trim())return setError('Escribí tu correo para recuperar el acceso.');
  return run(async()=>{
   const {auth,sendPasswordResetEmail}=await firebaseAuth();
   await sendPasswordResetEmail(auth,email.trim());
   setStatus('Si la cuenta está registrada, recibirás instrucciones por correo.');
  },{refresh:false})
 }
 async function verification(){
  return run(async()=>{
   const {auth,reload,sendEmailVerification}=await firebaseAuth();
   if(!auth.currentUser)throw Error('Sesión no disponible.');
   await reload(auth.currentUser);
   if(auth.currentUser.emailVerified)return reconnect(auth.currentUser);
   await sendEmailVerification(auth.currentUser);
   setStatus('Correo todavía no verificado. Te reenviamos el enlace.');
  },{refresh:false})
 }
 async function logout(){
  setBusy(true);
  try{if(sessionRef.current)await api.logout().catch(()=>{});
   const {auth,signOut}=await firebaseAuth();await signOut(auth);
   sessionRef.current=null;setSession(null);setOrders([]);setCart([]);setScope('customer');setSelectedPin(null);
  }finally{setBusy(false)}
 }
 async function viewProducts(restaurantId){
  setError('');
  try{
   const r=await api.products(restaurantId);
   setShoppingRestaurant(restaurantId);setProducts(r.products||[]);setCart([]);
   checkoutKey.current=null;
  }catch(e){setError(errorLabel(e))}
 }
 function addProduct(p){
  checkoutKey.current=null;
  setCart(current=>{
   const old=current.find(x=>x.productId===p.id);
   if(old)return current.map(x=>x.productId===p.id?{...x,quantity:Math.min(25,x.quantity+1)}:x);
   return [...current,{productId:p.id,name:p.name,priceMinor:p.price_minor,quantity:1}];
  });
 }
 function removeProduct(id){
  checkoutKey.current=null;
  setCart(current=>current.map(x=>x.productId===id?{...x,quantity:x.quantity-1}:x).filter(x=>x.quantity>0));
 }
 async function checkout(){
  if(!shoppingRestaurant||!cart.length||!session)return;
  if(deliveryMethod==='delivery'&&deliveryAddress.trim().length<8)return setError('Ingresá una dirección completa.');
  const key=checkoutKey.current||newKey();checkoutKey.current=key;
  const intent={restaurantId:shoppingRestaurant,deliveryMethod,deliveryAddress,
   items:cart.map(({productId,quantity})=>({productId,quantity}))};
  const result=await run(()=>api.createOrder(intent,key));
  if(result){checkoutKey.current=null;setCart([]);setProducts([]);setShoppingRestaurant('');setSelectedPin({id:result.order.id,pin:result.deliveryPin});
   setStatus('Pedido confirmado por el servidor.')}
 }
 async function showCustomerOrder(order){
  return run(async()=>{
   const data=await api.customerOrder(order.id);
   setSelectedPin({id:order.id,pin:data.deliveryPin,status:data.order.status});
  },{refresh:false})
 }
 async function action(fn){const result=await run(fn);if(result)setStatus('Cambio confirmado en el servidor.')}
 const userRole=session?.user?.role;
 const availableScopes=[
  ...(userRole==='customer'?['customer']:[]),
  ...(session?.restaurants?.length?['restaurant']:[]),
  ...(userRole==='courier'?['courier']:[]),
  ...(userRole==='platform_admin'?['admin']:[])
 ];
 const roles={customer:'Cliente',restaurant:'Restaurante',courier:'Repartidor',admin:'Centro de Control'};
 const selectedBusiness=session?.restaurants?.find(x=>x.restaurant_id===selectedRestaurantId);
 const subtotal=cart.reduce((sum,p)=>sum+p.priceMinor*p.quantity,0);
 const restaurant=restaurants.find(r=>r.id===shoppingRestaurant);
 const fee=deliveryMethod==='delivery'?restaurant?.delivery_fee_minor??0:0;
 const canManage=['owner','manager'].includes(selectedBusiness?.staff_role);
 return <div className="dvl-app">
  <header className="dvl-header"><div className="dvl-brand"><img className="dvl-official-logo" src={import.meta.env.BASE_URL+'logo.png'} alt="Dvolada" /><div><strong>Dvolada</strong><small>Pedí fácil, que te llega de volada</small></div></div>
   <div className="dvl-head-actions">{session&&<span>{session.user.displayName}</span>}{session&&<Action kind="secondary" disabled={busy} onClick={logout}><LogOut size={15}/> Salir</Action>}</div></header>
  <main className="dvl-main">
  <div className="dvl-intro"><span className="dvl-kicker">NEXORA SYSTEMS · DVOLADA ONLINE</span>
   <h1>{session?roles[scope]||'Dvolada':'Bienvenido a Dvolada'}</h1>
   <p>{session?'Todas las acciones oficiales se comprueban y guardan en el servidor.':'Accedé para hacer y seguir pedidos con seguridad.'}</p></div>
  {offline&&<div className="dvl-offline" role="alert"><WifiOff size={19}/> Sin conexión. Los pedidos se muestran como potencialmente desactualizados; las acciones están bloqueadas.</div>}
  <WaitOrError message={status}/>
  <WaitOrError message={error} warning/>
  {!configured&&<section className="dvl-panel"><ShieldCheck/><h2>Integración pendiente</h2>
   <p>Esta versión espera la cuenta exclusiva de Cloudflare y el proyecto Firebase de Dvolada.
   No muestra pedidos ni datos privados de demostración.</p></section>}
  {configured&&!session&&<section className="dvl-panel dvl-login">
   {firebaseUser&&!firebaseUser.emailVerified?<><Mail size={31}/><h2>Verificá tu correo</h2>
    <p>Abrí el mensaje de verificación, confirmá el enlace y regresá aquí.</p>
    <Action disabled={busy||offline} onClick={verification}>Ya confirmé / reenviar enlace</Action>
    <Action kind="secondary" disabled={busy} onClick={logout}>Cambiar de cuenta</Action></>:
   <><h2>{register?'Creá tu cuenta':'Ingresá a Dvolada'}</h2>
    <label>Correo electrónico<input autoComplete="username" type="email" value={email} onChange={e=>setEmail(e.target.value)} /></label>
    <label>Contraseña<input autoComplete={register?'new-password':'current-password'} type="password" value={password} onChange={e=>setPassword(e.target.value)}/></label>
    <Action disabled={busy||offline||!email.includes('@')||password.length<6} onClick={signIn}>{register?'Registrarme':'Iniciar sesión'} <ArrowRight size={17}/></Action>
    <div className="dvl-inline">
     <Action kind="text" onClick={()=>setRegister(x=>!x)}>{register?'Ya tengo cuenta':'Crear cuenta'}</Action>
     <Action kind="text" onClick={resetPassword}>Recuperar contraseña</Action>
    </div></>}
  </section>}
  {session&&<>
   <nav className="dvl-roles" aria-label="Paneles autorizados">{availableScopes.map(s=><button key={s} className={scope===s?'active':''}
    onClick={()=>{setScope(s);setError('');setSelectedPin(null)}}>{s==='customer'?<ShoppingBag size={17}/>:s==='restaurant'?<Store size={17}/>:s==='courier'?<Bike size={17}/>:<ShieldCheck size={17}/>} {roles[s]}</button>)}
    <Action kind="secondary" disabled={busy||offline} onClick={()=>run(()=>load(scope,selectedRestaurantId),{refresh:false})}><RefreshCw size={15}/> Actualizar</Action>
   </nav>
   {scope==='customer'&&<div className="dvl-columns">
    <section className="dvl-panel"><h2>Restaurantes afiliados</h2>
     {!shoppingRestaurant?<div className="dvl-stack">{restaurants.map(r=><div className="dvl-row" key={r.id}><div><strong>{r.name}</strong><small>{r.online_state==='open'?'Aceptando pedidos':'En pausa'}</small></div>
      <Action disabled={offline||r.online_state!=='open'} kind="secondary" onClick={()=>viewProducts(r.id)}>Ver menú</Action></div>)}
      {!restaurants.length&&<p>Próximamente encontrarás los restaurantes afiliados aquí.</p>}</div>:
      <><Action kind="text" onClick={()=>{setShoppingRestaurant('');setProducts([]);setCart([]);checkoutKey.current=null}}>Volver a restaurantes</Action>
       <div className="dvl-stack">{products.map(p=><div className="dvl-row" key={p.id}><div><strong>{p.name}</strong><small>{price(p.price_minor)}</small></div>
        <Action kind="secondary" disabled={offline} onClick={()=>addProduct(p)}>Agregar</Action></div>)}
       {!products.length&&<p>Este local todavía no tiene productos disponibles.</p>}</div></>}
    </section>
    <section className="dvl-panel"><h2>Carrito</h2>
     {!cart.length?<p>Seleccioná un restaurante y agregá productos.</p>:<><div className="dvl-stack">
      {cart.map(p=><div className="dvl-row" key={p.productId}><div><strong>{p.name}</strong><small>{p.quantity} × {price(p.priceMinor)}</small></div>
       <Action kind="secondary" onClick={()=>removeProduct(p.productId)}>−</Action></div>)}</div>
      <div className="dvl-row"><strong>Productos</strong><strong>{price(subtotal)}</strong></div>
      <div className="dvl-row"><strong>Envío estimado</strong><strong>{price(fee)}</strong></div>
      <div className="dvl-row dvl-total"><strong>Total preliminar</strong><strong>{price(subtotal+fee)}</strong></div>
      <label>Modalidad<select value={deliveryMethod} onChange={e=>{setDeliveryMethod(e.target.value);checkoutKey.current=null}}>
       <option value="delivery">Entrega a domicilio</option><option value="pickup">Recoger en restaurante</option></select></label>
      {deliveryMethod==='delivery'&&<label>Dirección completa<textarea rows={3} value={deliveryAddress}
       onChange={e=>{setDeliveryAddress(e.target.value);checkoutKey.current=null}} placeholder="Barrio, calle, casa y referencia"/></label>}
      <p className="dvl-muted">El servidor verificará precios y disponibilidad. Los cobros por tarjeta todavía no están habilitados.</p>
      <Action disabled={busy||offline||!cart.length} onClick={checkout}><LockKeyhole size={16}/> Confirmar pedido</Action>
      </>}
    </section>
    <section className="dvl-panel dvl-span"><h2>Mis pedidos</h2>
      {orders.length?<div className="dvl-grid">{orders.map(o=><OrderCard key={o.id} order={o}>
      <Action kind="secondary" disabled={busy||offline} onClick={()=>showCustomerOrder(o)}>Ver detalle / PIN</Action>
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
     onChange={e=>setSelectedRestaurantId(e.target.value)}>{session.restaurants?.map(r=><option key={r.restaurant_id} value={r.restaurant_id}>{r.name}</option>)}</select></label></div>
     <p className="dvl-muted">Solo los empleados autorizados pueden cambiar estados; los cambios simultáneos generan conflicto.</p>
    </section><div className="dvl-grid">{orders.map(o=><OrderCard key={o.id} order={o}>
      <div className="dvl-inline">{(staffTransitions[o.status]||[]).map(next=><Action key={next} disabled={busy||offline}
        onClick={()=>action(()=>api.restaurantStatus(selectedRestaurantId,o,next,newKey()))}>{next}</Action>)}</div>
      {o.status==='Listo'&&o.deliveryMethod==='pickup'&&<Action disabled={busy||offline} onClick={()=>action(()=>api.restaurantStatus(selectedRestaurantId,o,'Entregado',newKey()))}>Entregar en mostrador</Action>}
      {canManage&&o.deliveryMethod==='delivery'&&!o.courierId&&['Aceptado','Preparando','Listo'].includes(o.status)&&
       <div className="dvl-assign"><label>Repartidor<select value={courierChoice[o.id]||''} onChange={e=>setCourierChoice(x=>({...x,[o.id]:e.target.value}))}>
        <option value="">Seleccioná repartidor</option>{couriers.map(c=><option key={c.id} value={c.id}>{c.name} ({c.active_orders}/{c.max_orders})</option>)}</select></label>
       <Action kind="secondary" disabled={busy||offline||!courierChoice[o.id]} onClick={()=>action(()=>api.assignCourier(selectedRestaurantId,o,courierChoice[o.id],newKey()))}>Asignar</Action></div>}
    </OrderCard>)}{!orders.length&&<div className="dvl-panel"><Package size={27}/><p>Aún no hay pedidos del restaurante.</p></div>}</div>
    </div>}
   {scope==='courier'&&<div className="dvl-stack"><section className="dvl-panel"><h2>Mis entregas</h2>
    <p className="dvl-muted">Máximo dos pedidos activos. La confirmación final exige el PIN del cliente.</p></section>
    <div className="dvl-grid">{orders.map(o=><OrderCard key={o.id} order={o}>
      <p>{o.deliveryAddress||'Dirección por confirmar'}</p>
      {courierTransitions[o.status]&&<Action disabled={busy||offline}
       onClick={()=>action(()=>api.courierStatus(o,courierTransitions[o.status],newKey()))}>{courierTransitions[o.status]}</Action>}
      {o.status==='En ubicación'&&<><label>PIN del cliente<input inputMode="numeric" type="password"
       maxLength={6} placeholder="6 dígitos" value={selectedPin?.id===o.id?pinEntry:''}
       onFocus={()=>{setSelectedPin({id:o.id});setPinEntry('')}}
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
    </div>}
   <footer className="dvl-footer"><span className="dvl-powered">Powered by <img src={import.meta.env.BASE_URL+'file_00000000e77081fd8cf8ee8349e461b6.png'} alt="Nexora Systems" /></span><span>Acceso seguro · Dvolada Online</span></footer>
  </>}
  </main></div>;
}
