import RestaurantKitchenDisplay from '../RestaurantKitchenDisplay.jsx';
import {openKitchenTicket} from '../kitchen-operations.js';
import SlideConfirm from '../SlideConfirm.jsx';
import {playOrderChirp} from '../order-chirp.js';
import {ControlNavigation,ControlSubnavigation,ControlOverview,ControlWorkspace,CourierDirectory} from './ControlWorkspace.jsx';
import {CourierConsole,CourierApplication,CourierApplications} from './CourierWorkspace.jsx';
import {StaffSignIn,StaffSecret,ManageStaffAccess,SettlementPanel} from './RestaurantCommercial.jsx';
import React,{useCallback,useEffect,useMemo,useRef,useState} from 'react';
import {createPortal} from 'react-dom';
import {ShoppingBag,Store,Bike,ShieldCheck,ShoppingCart,History,Users,Home,LogOut,RefreshCw,WifiOff,ArrowRight,Package,CheckCircle2} from 'lucide-react';
import {createLiveApi,LiveApiError} from './live-api.js';
import './live.css';
import { enableQaPush, disableQaPush } from './onesignal-push.js';
import {applyDvoladaTheme} from '../theme-policy.js';
import ClientAccess,{ClientCodes} from './ClientAccess.jsx';
import GoogleAdminSignIn from './GoogleAdminSignIn.jsx';
import {CustomerGoogleButton,PasswordAccess,AccountBiometrics} from './PublicAccountAccess.jsx';
import {SpotManager,RestaurantContract} from './CommercialControl.jsx';
import {FlashAdmin,FlashOffers} from './FlashCampaigns.jsx';
import RestaurantCash from './RestaurantCash.jsx';
import {RestaurantProfile,RestaurantStaff,ProductDetails} from './RestaurantSettings.jsx';
import ClientSupport from './ClientSupport.jsx';
import CatalogSearch from './CatalogSearch.jsx';
import FoodFeed from './FoodFeed.jsx';
import PublishFood from './PublishFood.jsx';
import {readCart,writeCart,updateQuantity} from './cart-draft.js';

function OwnerInvitation({restaurantId,invite,disabled}){
 const [login,setLogin]=useState(''),[displayName,setDisplayName]=useState(''),[issued,setIssued]=useState(null);
 async function submit(event){
  event.preventDefault();
  const result=await invite(restaurantId,{login:login.trim().toLowerCase(),displayName:displayName.trim()});
  if(result){setIssued(result);setLogin('');setDisplayName('')}
 }
 if(issued)return <section className="dvl-panel dvl-code-panel" aria-label="Invitación de propietario creada">
  <h3>Invitación de propietario</h3>
  <p>Entregala en privado a {issued.login}. Vence a las {new Date(issued.expiresAt*1000).toLocaleTimeString()}.</p>
  <label>Código de invitación<input readOnly value={issued.invitation} onFocus={event=>event.target.select()}/></label>
  <button type="button" className="dvl-action" onClick={()=>setIssued(null)}>Cerrar invitación</button>
 </section>;
 return <form className="dvl-grid dvl-editor" onSubmit={submit}>
  <label>Nombre del propietario<input autoComplete="off" minLength={2} maxLength={80} required
   value={displayName} onChange={event=>setDisplayName(event.target.value)}/></label>
  <label>Usuario del propietario<input autoComplete="off" minLength={4} maxLength={40} required
   value={login} onChange={event=>setLogin(event.target.value)}/></label>
  <button type="submit" className="dvl-action" disabled={disabled}>Invitar propietario</button>
 </form>;
}

const qaView=['/pruebas','/pruebas/'].includes(window.location.pathname);
const controlView=['/cuenta','/cuenta/'].includes(window.location.pathname)&&new URLSearchParams(window.location.search).get('panel')==='control';
const apiOrigin=import.meta.env.VITE_DVOLADA_API_URL||window.location.origin;
const optionPrice=options=>(options||[]).reduce((total,option)=>total+option.price_minor,0);
const optionsFromReceipt=item=>{try{return JSON.parse(item.options_json||'[]')}catch{return []}};
const price=n=>'L '+(Number(n||0)/100).toLocaleString('es-HN',{minimumFractionDigits:2,maximumFractionDigits:2});
const orderLabel={Pendiente:'Pendiente',Aceptado:'Aceptado',Preparando:'Preparando',Listo:'Listo',
 Recogido:'Recogido','En camino':'En camino','En ubicación':'En ubicación',
 Entregado:'Entregado',Cancelado:'Cancelado',Rechazado:'Rechazado'};
const staffTransitions={Pendiente:['Aceptado','Rechazado'],Aceptado:['Preparando','Cancelado'],
 Preparando:['Listo','Cancelado']};

const auditLabels={restaurant_created:'Alta de negocio',restaurant_updated:'Cambio de negocio',
 membership_assigned:'Vinculación de personal',courier_enrolled:'Alta de repartidor'};
const newKey=()=>crypto.randomUUID();
function errorLabel(error){
 if(error?.name==='NotAllowedError')return 'No se completó la llave de acceso. Revisá que tu dispositivo tenga PIN, huella o desbloqueo configurado y volvé a intentarlo. Si cancelaste la ventana, podés abrirla otra vez.';
 if(error?.name==='InvalidStateError')return 'Esta llave ya está registrada. Probá Ingresar o Recuperar acceso con tu código.';
 if(error?.name==='SecurityError')return 'No se pudo utilizar la llave de acceso en esta dirección. Abrí Dvolada desde su enlace HTTPS autorizado.';
 if(error?.name==='AbortError')return 'Se canceló la operación. Podés intentarlo de nuevo.';
 if(!(error instanceof LiveApiError))return error?.message||'No fue posible completar la acción.';
 const lookup={
  PUBLIC_CREDENTIAL_INVALID:'Usuario, contraseña o código de recuperación incorrecto.',PUBLIC_PASSWORD_FORMAT:'La contraseña debe tener entre 12 y 128 caracteres.',PUBLIC_REAUTH_REQUIRED:'Por seguridad, cerrá sesión y volvé a ingresar para activar la huella.',
  SIN_CONEXION:'Sin conexión con el servidor. No se confirmó la operación; revisá el estado antes de intentar nuevamente.',
  ORDER_CHANGED:'Otro usuario modificó el pedido. Actualizá la lista antes de actuar.',
  SESSION_REQUIRED:'No hay una sesión válida. Iniciá sesión nuevamente.',
  SESSION_INVALID:'La sesión venció o fue revocada. Volvé a iniciar sesión.',
  SETTLEMENT_RULE_MISSING:'Falta una regla comercial vigente para una o más ventas del período.',
  SETTLEMENT_SHIFT_OPEN:'Cerrá las jornadas de caja incluidas en este período.',
  SETTLEMENT_OVERLAP:'El período se cruza con una liquidación existente.',
  SETTLEMENT_STATE:'Revisá el estado actual. La transición requiere un período con movimientos.',
  SETTLEMENT_ADJUSTMENT_INVALID:'El ajuste no corresponde a este período o excede el saldo del pedido.',
  SETTLEMENT_RULE_EXISTS:'Ya hay otra regla registrada con esa fecha de vigencia.',
  STAFF_CODE_INVALID:'El código es incorrecto, venció o fue revocado.',
  STAFF_ACTIVATION_REQUIRES_CLAIM:'El acceso requiere una invitación válida antes de activarse.',
  ROLE_FORBIDDEN:'Tu cuenta no tiene permiso para esta acción.',
  RESTAURANT_FORBIDDEN:'No tenés acceso a ese restaurante.',
  ORDER_CREATION_DISABLED:'Los pedidos reales siguen bloqueados hasta aprobar el lanzamiento.',
  RESTAURANT_NOT_ACCEPTING:'Este restaurante no acepta pedidos en este momento.',
  PRODUCT_UNAVAILABLE:'Cambió un producto o su precio. Volvé a revisar tu carrito.',
  CHECKOUT_TOTAL_CHANGED:'Cambió el precio del pedido. Actualizá el menú y revisá el total antes de confirmar.',
  CHECKOUT_NOT_FOUND:'Aún no encontramos una confirmación. Podés reintentar con los mismos datos.',
  IDEMPOTENCY_KEY_REUSED:'Verificá el pedido anterior antes de intentar una nueva compra.',
  OFFER_EXPIRED:'La oferta venció. Actualizá la lista de pedidos.',
  COURIER_UNAVAILABLE:'El repartidor ya no está disponible.',
  COURIER_INACTIVE:'Esta cuenta de repartidor está inactiva.',
  ADMIN_ACCOUNT_CHANGED:'La cuenta cambió o la acción está restringida. Actualizá la lista.',
  ADMIN_CLAIM_CHANGED:'El reclamo cambió, ya está resuelto o el responsable no puede atenderlo.',
  ADMIN_COUPON_EXISTS:'El código ya existe o el restaurante no admite cupones.',
  ADMIN_RATE_EXISTS:'Ya hay una regla para esa zona y vigencia o el restaurante no admite esa tarifa.',
  ADMIN_RATE_MISSING:'No existe una tarifa para la zona y fecha indicadas.',
  ADMIN_RATE_RETROACTIVE:'La vigencia no puede alterar períodos ya calculados.',
  COURIER_LIMIT:'Este repartidor ya tiene dos pedidos activos.',
  PIN_INVALID:'El PIN no coincide. Confirmalo con el cliente.',
  PIN_LOCKED:'Demasiados intentos. Se requiere intervención autorizada.',
  FIREBASE_IDENTITY_UNVERIFIED:'Verificá tu correo antes de ingresar.',
  FIREBASE_NOT_CONFIGURED:'Todavía no se configuró Firebase para Dvolada.',
  FLASH_UNAVAILABLE:'La promoción terminó, se agotó o dejó de aplicar. Revisá el carrito.',
  PROMOTIONS_EXCLUSIVE:'Elegí un cupón o una promoción Flash.',
  INVALID_FLASH_REWARD:'Elegí un regalo o un descuento.',
  INVALID_FLASH_CATALOG:'Revisá los productos elegidos para el restaurante.',
  INVALID_LOCATION:'Ingresá ambas coordenadas válidas o dejá las dos vacías.',
  INVALID_HOURS:'Revisá que cada cierre sea posterior a su apertura.',
  INVALID_PAYMENT_METHOD:'Elegí un método de pago habilitado.',
  INVALID_PHOTO:'Elegí una imagen JPG, PNG o WebP de hasta 120 KB.',
  SHIFT_ALREADY_OPEN:'Ya existe una jornada abierta en este negocio.',
  SHIFT_NOT_OPEN:'La jornada ya se cerró o pertenece a otro negocio.',
  SALE_NOT_ALLOWED:'La venta requiere un pedido entregado, jornada abierta y método habilitado.',
  SALE_ALREADY_RECORDED:'El pedido ya tiene una venta registrada.',
  STAFF_CHANGE_FORBIDDEN:'No se puede cambiar el rol o acceso de esa cuenta.',
  INVALID_COUPON:'Revisá el formato del cupón.',
  COUPON_UNAVAILABLE:'Cupón vencido, ya utilizado o ajeno a este restaurante.',
  PASSKEY_INVALID:'No pudimos verificar tu llave. Elegí la llave de esa cuenta o recuperá el acceso.',
  PASSKEY_CHALLENGE_INVALID:'La solicitud venció o ya fue usada. Iniciá un intento nuevo.',
  PASSKEY_ALREADY_REGISTERED:'La llave elegida ya pertenece a otra cuenta.',
  CLIENT_CODE_INVALID:'La clave o el código no es válido.',
  CLIENT_CREDENTIAL_FORMAT:'Revisá el usuario y la contraseña.',
  CLIENT_LOGIN_UNAVAILABLE:'Ese usuario ya está en uso.',
  LOGIN_RATE_LIMITED:'Demasiados intentos de acceso. Intentá más tarde.'
 };
 return lookup[error.code]||error.code||'Error de conexión';
}
function Action({children,onClick,disabled=false,kind='primary'}){return <button type="button" className={'dvl-action '+kind} disabled={disabled} onClick={onClick}>{children}</button>}
function WaitOrError({message,warning=false}){return message?<div role={warning?'alert':'status'} className={'dvl-notice '+(warning?'warn':'')}>{message}</div>:null}
function OrderCard({order,children,kitchen=false}){
 return <article className="dvl-order"><div className="dvl-order-head"><strong>#{order.orderNumber||order.id?.slice(0,8)}</strong><span>{orderLabel[order.status]||order.status}</span></div>
 <div className="dvl-order-foot">{!kitchen&&<span>{price(order.totalMinor)}</span>}<span>Versión {order.version}</span><span>{order.deliveryMethod==='delivery'?'Envío':'Recoger'}</span></div>{children}</article>
}
export default function LiveApp({CustomerHome}){
 const [customerSection]=useState(()=>['#carrito','#mis-pedidos'].includes(window.location.hash)?window.location.hash.slice(1):null);
 const sessionRef=useRef(null),alive=useRef(true),checkoutInFlight=useRef(false),menuRequest=useRef(0);
 const [pushConfig,setPushConfig]=useState(null),[pushEnabled,setPushEnabled]=useState(false);
 const [commercial,setCommercial]=useState(false),[staffCredential,setStaffCredential]=useState(null);
 const [accountEnabled,setAccountEnabled]=useState(false),[accessReady,setAccessReady]=useState(false);
 const [publicAuth,setPublicAuth]=useState(false),[googleCustomer,setGoogleCustomer]=useState(false),[passwordMode,setPasswordMode]=useState(()=>new URLSearchParams(location.search).get('mode')==='register');
 const [newCodes,setNewCodes]=useState(null),[support,setSupport]=useState(null);
 const [flashEnabled,setFlashEnabled]=useState(false),[flashOffers,setFlashOffers]=useState([]),[flashSelection,setFlashSelection]=useState(null);
 const [favoriteIds,setFavoriteIds]=useState([]),[onlyFavorites,setOnlyFavorites]=useState(false);
 const [session,setSession]=useState(null),[accessCode,setAccessCode]=useState('');
 const [status,setStatus]=useState(''),[error,setError]=useState(''),[refreshWarning,setRefreshWarning]=useState('');
 const [scope,setScope]=useState('customer'),[restaurants,setRestaurants]=useState([]),[products,setProducts]=useState([]);
 const [shoppingRestaurant,setShoppingRestaurant]=useState(''),[cart,setCart]=useState([]),[catalogTerm,setCatalogTerm]=useState('');
 const [catalogView,setCatalogView]=useState('food');
 const [optionsByProduct,setOptionsByProduct]=useState({}),[appliedCoupon,setAppliedCoupon]=useState(null),[couponText,setCouponText]=useState('');
 const [pendingKey,setPendingKey]=useState(null),[replaceCart,setReplaceCart]=useState(null);
 const [cartRestaurantId,setCartRestaurantId]=useState('');
 const [restaurantTab,setRestaurantTab]=useState('active'),[historyCursor,setHistoryCursor]=useState(null),[nextHistory,setNextHistory]=useState(null);
 const [orderNote,setOrderNote]=useState(''),[printReceipt,setPrintReceipt]=useState(false);
 const [phone,setPhone]=useState('');
 const [deliveryAddress,setDeliveryAddress]=useState(''),[deliveryMethod,setDeliveryMethod]=useState('delivery');
 const [orders,setOrders]=useState([]),[selectedRestaurantId,setSelectedRestaurantId]=useState('');
 const [orderDetail,setOrderDetail]=useState(null);
 const [couriers,setCouriers]=useState([]),[courierChoice,setCourierChoice]=useState({});
 const [manageProducts,setManageProducts]=useState([]);
 const [editPrices,setEditPrices]=useState({}),[restaurantCapabilities,setRestaurantCapabilities]=useState(null);
 const [newRestaurantName,setNewRestaurantName]=useState(''),[newRestaurantPlan,setNewRestaurantPlan]=useState('ONLINE');
 const [controlSection,setControlSection]=useState('summary');
 const [adminBusinessSearch,setAdminBusinessSearch]=useState(''),[adminCreateOpen,setAdminCreateOpen]=useState(false);
 const [adminSelectedId,setAdminSelectedId]=useState(''),[adminMemberId,setAdminMemberId]=useState(''),[adminStaffRole,setAdminStaffRole]=useState('owner');
 const [adminCourierId,setAdminCourierId]=useState('');
 const [adminFee,setAdminFee]=useState(''),[audit,setAudit]=useState(null);
 const [selectedPin,setSelectedPin]=useState(null),[courierProfile,setCourierProfile]=useState(null);
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
   getClientAccount:()=>sessionRef.current?.clientAccount,controlAccess:controlView})}
  catch{return null}
 },[configured]);

 const endLocalSession=useCallback(()=>{
  sessionRef.current=null;menuRequest.current++;
  setNewCodes(null);setSupport(null);setFlashOffers([]);setFlashSelection(null);setFavoriteIds([]);setOnlyFavorites(false);
  setSession(null);setScope('customer');setSelectedRestaurantId('');
  setOrders([]);setOrderDetail(null);setPrintReceipt(false);setRestaurantTab('active');setHistoryCursor(null);setNextHistory(null);setManageProducts([]);setRestaurantCapabilities(null);
  setCouriers([]);setCourierChoice({});setAdminStats(null);setAdminRestaurants([]);
  setControlSection('summary');setAdminBusinessSearch('');setAdminCreateOpen(false);setAdminFee('');setAdminSelectedId('');setAdminCourierId('');setAdminMemberId('');setAudit(null);
  setNewRestaurantName('');setNewRestaurantPlan('ONLINE');setAdminStaffRole('owner');
  setNewProductName('');setNewProductPrice('');setEditPrices({});
  setCart([]);setCartRestaurantId('');setShoppingRestaurant('');setProducts([]);setCatalogTerm('');
  setOptionsByProduct({});setAppliedCoupon(null);setCouponText('');
  setPendingKey(null);setReplaceCart(null);setDeliveryMethod('delivery');
  setSelectedPin(null);setCourierProfile(null);setPhone('');setDeliveryAddress('');setOrderNote('');
  setStaffCredential(null);setPushEnabled(false);setRefreshWarning('');setStatus('');
 },[]);
 const openSession=useCallback((me,clientAccount=false)=>{
  if(clientAccount)sessionRef.current={clientAccount:me.user.id};
  const first=me.restaurants?.[0]?.restaurant_id||'';
  setSelectedRestaurantId(first);
  setScope(me.user.role==='platform_admin'?'admin':me.user.role==='courier'?'courier':first?'restaurant':'customer');
  if(me.user.role==='customer'&&!first){
   const draft=readCart(me.user.id);
   setCart(draft.items);setCartRestaurantId(draft.restaurantId);setPendingKey(draft.pendingKey);setAppliedCoupon(draft.coupon||null);setCouponText(draft.coupon?.code||'');setFlashSelection(draft.flash||null);
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
    setAccountEnabled(config.enabled);setCommercial(Boolean(config.commercial));setPublicAuth(Boolean(config.publicAuth));setGoogleCustomer(Boolean(config.googleCustomer));
    if(config.enabled||controlView){
     const me=await api.me(true);
     if(controlView&&!me.user.googleAdmin)return;
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

 const pollingBusy=useRef(false);
 pollingBusy.current=busy;
 const load=useCallback(async (view=scope,restaurantId=selectedRestaurantId,poll=false)=>{
  const activeSession=sessionRef.current;
  if(!api||!activeSession||!navigator.onLine)return;
  const panel=panelRef.current;
  const request=++latestRead.current;
  const canApply=()=>alive.current&&sessionRef.current===activeSession&&panelRef.current===panel&&latestRead.current===request;
  if(view==='customer'){const result=await api.customerOrders();if(canApply())setOrders(result.orders||[])}
  if(view==='restaurant'&&restaurantId){
   const assignment=session?.restaurants?.find(item=>item.restaurant_id===restaurantId)?.staff_role;
   const manages=['owner','manager'].includes(assignment);
   const board=assignment==='cashier'||restaurantTab==='cash'?'unrecorded':restaurantTab==='history'?'history':'active';
   const [result,eligible,menu,capabilities]=await Promise.all([
    api.restaurantOrders(restaurantId,board==='history'&&restaurantTab==='history'?historyCursor:undefined,board),
    manages&&(!poll||board==='active')?api.eligibleCouriers(restaurantId):null,
    manages&&(!poll||restaurantTab==='menu')?api.restaurantProducts(restaurantId):null,
    !poll?api.restaurantCapabilities(restaurantId):null
   ]);
   if(canApply()){
    setOrders(result.orders||[]);setNextHistory(result.nextCursor||null);
    if(eligible)setCouriers(eligible.couriers||[]);
    if(menu)setManageProducts(menu.products||[]);
    if(capabilities)setRestaurantCapabilities(capabilities);
   }
  }
  if(view==='courier'){const r=await api.courierOrders();if(canApply()){setOrders(r.orders||[]);setCourierProfile(r.profile)}}
  if(view==='admin'){
   const [overview,managed]=await Promise.all([api.adminOverview(),poll?null:api.adminRestaurants()]);
   if(canApply()){setAdminStats(overview);if(managed)setAdminRestaurants(managed.restaurants||[])}
  }
 },[api,scope,selectedRestaurantId,session,restaurantTab,historyCursor]);
 useEffect(()=>{alive.current=true;return()=>{alive.current=false}},[]);
 const cartAccount=session?.user?.role==='customer'&&!session.restaurants?.length?session.user.id:null;
 useEffect(()=>{
  if(cartAccount)writeCart(cartAccount,{restaurantId:cartRestaurantId,items:cart,pendingKey,coupon:appliedCoupon,flash:flashSelection});
 },[cartAccount,cartRestaurantId,cart,pendingKey,appliedCoupon,flashSelection]);
 useEffect(()=>{
  const on=()=>setOffline(false),off=()=>setOffline(true);
  window.addEventListener('online',on);window.addEventListener('offline',off);
  return()=>{window.removeEventListener('online',on);window.removeEventListener('offline',off)}
 },[]);
 useEffect(()=>{
  if(!api||offline)return;
  let stopped=false;
  if(!controlView)fetch('/push-config',{cache:'no-store'}).then(r=>r.ok?r.json():null)
   .then(config=>{if(!stopped)setPushConfig(config)}).catch(()=>{});
  api.publicFlash().then(result=>{if(!stopped)setFlashEnabled(result.enabled)}).catch(()=>{});
  if(!controlView)api.restaurants().then(r=>{if(!stopped)setRestaurants(r.restaurants||[])}).catch(()=>{});
  return()=>{stopped=true};
 },[api,offline]);
 useEffect(()=>{
  if(!session||!api||offline)return;
  let live=true,running=false;
  const refresh=async poll=>{
   if(!live||running||(poll&&(document.hidden||pollingBusy.current)))return;
   running=true;
   try{await load(scope,selectedRestaurantId,poll)}
   catch(error){if(live&&!handleSessionError(error))setError(errorLabel(error))}
   finally{running=false}
  };
  const foreground=()=>{if(!document.hidden)refresh(false)};
  refresh(false);
  const timer=setInterval(()=>refresh(true),15000);
  document.addEventListener('visibilitychange',foreground);
  return()=>{live=false;clearInterval(timer);document.removeEventListener('visibilitychange',foreground)};
 },[session,api,scope,selectedRestaurantId,load,offline,handleSessionError]);

 useEffect(()=>{
  if(!cartAccount||offline)return;
  let active=true;
  api.favorites().then(data=>{if(active)setFavoriteIds(data.ids)})
   .catch(error=>{if(active&&!handleSessionError(error))setError(errorLabel(error))});
  return()=>{active=false};
 },[api,cartAccount,offline,handleSessionError]);

 useEffect(()=>{
  if(!cartAccount||offline||!flashEnabled)return;
  let active=true;
  const refresh=()=>api.customerFlash().then(data=>{if(active)setFlashOffers(data.campaigns)})
   .catch(error=>{if(active&&error.status===401)handleSessionError(error)});
  refresh();
  const timer=setInterval(refresh,30000);
  return()=>{active=false;clearInterval(timer)};
 },[api,cartAccount,offline,flashEnabled,handleSessionError]);
 async function toggleFavorite(id){
  const result=await run(()=>api.setFavorite(id,!favoriteIds.includes(id)),{refresh:false});
  if(result)setFavoriteIds(ids=>result.favorite?[...new Set([...ids,id])]:ids.filter(item=>item!==id));
 }
 async function authenticateStaff(mode,code){
  if(busy||offline||!accessReady)return;
  setBusy(true);setError('');
  try{
   const result=await api.staffAuthenticate(mode,code);
   if(result.credential)setStaffCredential(result.credential);
   openSession(await api.me(true),true);
  }catch(error){setError(errorLabel(error))}
  finally{setBusy(false)}
 }
 async function authenticatePassword(mode,body){
  if(busy||offline||!accessReady)return;setBusy(true);setError('');try{const codes=await api.clientPassword(mode,body);if(codes.recovery)setNewCodes(codes);openSession(await api.me(true),true)}catch(error){setError(errorLabel(error))}finally{setBusy(false)}
 }
 async function authenticateClient(mode,body){
  if(busy||offline||!accessReady)return;
  setBusy(true);setError('');
  try{
   if(!window.PublicKeyCredential)throw new Error('Este navegador no admite llaves de acceso. Usá un navegador compatible.');
   const {startAuthentication,startRegistration}=await import('@simplewebauthn/browser');
   const {id,options}=await api.clientAuthenticate(mode,'begin',body);
   const response=mode==='login'?await startAuthentication({optionsJSON:options}):await startRegistration({optionsJSON:options});
   const codes=await api.clientAuthenticate(mode,'finish',{id,response});
   if(codes.recovery)setNewCodes(codes);
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
 async function logout(everywhere=false){
  setBusy(true);
  try{
   let pushFailure=false;
   if(pushConfig?.enabled){
    try{await disableQaPush(pushConfig)}catch{pushFailure=true}
    setPushEnabled(false);
   }
   if(sessionRef.current)await (everywhere?api.revokeAccessSessions():api.logout());
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
     const options=(item.options||[]).map(old=>product.options?.find(option=>option.id===old.id)).filter(Boolean);
     if(options.length!==(item.options||[]).length)return item;
     return {...item,name:product.name,options,priceMinor:product.price_minor+optionPrice(options)};
    }));
   }
  }catch(e){if(request===menuRequest.current)setError(errorLabel(e))}
 }
 function putCart(restaurantId,items){
  if(cart.length&&cartRestaurantId!==restaurantId){
   setReplaceCart({restaurantId,items});return;
  }
  if(restaurantId!==cartRestaurantId){setAppliedCoupon(null);setCouponText('');setFlashSelection(null)}
  setCartRestaurantId(restaurantId);setCart(items);
 }
 function addProduct(p){
  if(pendingKey)return;
  const current=cartRestaurantId===shoppingRestaurant?cart:[];
  const selected=optionsByProduct[p.id]||[];
  const existing=current.find(item=>item.productId===p.id);
  const options=existing?.options||(existing?[]:(p.options||[]).filter(option=>selected.includes(option.id)));
  putCart(shoppingRestaurant,updateQuantity(current,{productId:p.id,name:p.name,options,
   priceMinor:p.price_minor+optionPrice(options)},1));
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
  setAppliedCoupon(null);setCouponText('');setFlashSelection(null);setPendingKey(null);setCart([]);setCartRestaurantId('');setProducts([]);setShoppingRestaurant('');
  setOrderNote('');setSelectedPin({id:result.order.id,pin:result.deliveryPin});
  setStatus(qaView?'Pedido de prueba confirmado.':'Pedido confirmado.');
  load().catch(e=>{if(!handleSessionError(e))setRefreshWarning('Actualizá la lista para ver el pedido.')});
 }
 async function checkout(){
  if(!cartRestaurantId||!cart.length||!cartAccount||checkoutInFlight.current||busy||offline||!restaurant)return;
  if(flashSelection&&!activeFlash)return setError('Revisá la promoción Flash antes de confirmar.');
  if(deliveryMethod==='delivery'&&deliveryAddress.trim().length<8)return setError('Ingresá una dirección completa.');
  if(!/^[0-9]{8}$/.test(phone))return setError('Ingresá los ocho dígitos del teléfono.');
  const key=pendingKey||newKey();
  checkoutInFlight.current=true;
  writeCart(cartAccount,{restaurantId:cartRestaurantId,items:cart,pendingKey:key,coupon:appliedCoupon,flash:flashSelection});
  setPendingKey(key);
  const intent={restaurantId:cartRestaurantId,deliveryMethod,deliveryAddress,phone:'+504'+phone,
   expectedTotalMinor:subtotal+fee-discount,
   ...(orderNote.trim()?{note:orderNote.trim()}:{}),
   ...(appliedCoupon?{coupon:appliedCoupon.code}:{}),
   ...(activeFlash?{flashId:activeFlash.id}:{}),
   items:cart.map(({productId,quantity,options})=>({productId,quantity,...(options?.length?{optionIds:options.map(option=>option.id)}:{})}))};
  try{
   const result=await run(async()=>{
    try{return await api.createOrder(intent,key)}
    catch(error){
     if(!pendingKey&&error instanceof LiveApiError&&([400,403,422].includes(error.status)||
        ['RESTAURANT_NOT_ACCEPTING','PRODUCT_UNAVAILABLE','CHECKOUT_TOTAL_CHANGED','COUPON_UNAVAILABLE','FLASH_UNAVAILABLE'].includes(error.code))){
      setPendingKey(null);
     }
     throw error;
    }
   },{refresh:false});
   if(!result||!sessionRef.current)return false;
   confirmCheckout(result);
   try{if(JSON.parse(localStorage.getItem('dv_local_profile')||'{}').sound!==false)playOrderChirp()}catch{}
   return true;
  }finally{checkoutInFlight.current=false}
 }
 async function recoverCheckout(){
  const result=await run(()=>api.checkoutStatus(pendingKey),{refresh:false});
  if(result){confirmCheckout(result);return true}return false;
 }
 async function reorder(order){
  if(pendingKey)return false;
  return run(async()=>{
   const [receipt,menu]=await Promise.all([api.customerOrder(order.id),api.products(order.restaurantId)]);
   const available=new Map(menu.products.map(product=>[product.id,product]));
   const items=receipt.order.items.filter(item=>available.has(item.product_id)).map(item=>{
    const product=available.get(item.product_id);
    const requested=optionsFromReceipt(item);
    const options=requested.map(old=>product.options?.find(option=>option.id===old.id)).filter(Boolean);
    if(options.length!==requested.length)return null;
    return {productId:product.id,name:product.name,options,priceMinor:product.price_minor+optionPrice(options),quantity:item.quantity};
   }).filter(Boolean);
   if(!items.length)throw new Error('Los productos de este pedido ya no están disponibles.');
   if(cart.length)setReplaceCart({restaurantId:order.restaurantId,items});
   else putCart(order.restaurantId,items);
   setStatus(items.length===receipt.order.items.length?'Revisá los precios actuales antes de hacer tu pedido.'
    :'Algunos productos ya no están disponibles. Revisá el carrito antes de continuar.');
   return true;
  },{refresh:false});
 }
 async function showCustomerOrder(order){
  return run(async()=>{
   const data=await api.customerOrder(order.id);
   setSelectedPin({id:order.id,pin:data.deliveryPin,status:data.order.status,receipt:data.order});
  },{refresh:false})
 }
 async function showRestaurantOrder(order){
  return run(async()=>{
   const result=await api.restaurantOrder(selectedRestaurantId,order.id);
   setOrderDetail({restaurantId:selectedRestaurantId,orderId:order.id,orderNumber:result.order.orderNumber,
    items:result.order.items,note:result.order.note,receipt:result.order});
   setPrintReceipt(false);
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
 const eligibleFlash=flashOffers.filter(item=>item.restaurantId===cartRestaurantId&&
  (!item.productId||cart.some(line=>line.productId===item.productId)));
 const availableSelection=eligibleFlash.find(item=>item.id===flashSelection?.id);
 const activeFlash=pendingKey?flashSelection:availableSelection;
 const eligibleSubtotal=activeFlash?.productId?cart.filter(line=>line.productId===activeFlash.productId)
  .reduce((sum,line)=>sum+line.priceMinor*line.quantity,0):subtotal;
 const discount=activeFlash?Math.min(eligibleSubtotal,activeFlash.discountMinor):Math.min(subtotal,appliedCoupon?.discountMinor||0);
 const fee=deliveryMethod==='delivery'?restaurant?.delivery_fee_minor??0:0;
 const canManage=['owner','manager'].includes(selectedBusiness?.staff_role);
 const kitchenRole=selectedBusiness?.staff_role==='kitchen';
 const cashRole=selectedBusiness?.staff_role==='cashier';
 const boardOrders=kitchenRole?[...orders].sort((a,b)=>a.createdAt-b.createdAt||a.orderNumber.localeCompare(b.orderNumber)):orders;
 const setBoard=tab=>{setRestaurantTab(tab);setHistoryCursor(null);setNextHistory(null);setOrderDetail(null);setSupport(null);setOrders([])};
 const formattedUserId=session?.user?.id||'';
 const adminMode=Boolean(session&&scope==='admin');
 const selectControlSection=section=>{if(section==='newBusiness'){setAdminCreateOpen(true);setControlSection('business')}else setControlSection(section);window.scrollTo({top:0,behavior:'auto'})};
 const selectedAdminBusiness=adminRestaurants.find(r=>r.id===adminSelectedId);
 const jump=id=>document.getElementById(id)?.scrollIntoView({block:'start'});
 const sectionAction=(change,value,id)=>()=>{change(value);requestAnimationFrame(()=>jump(id))};
 const shortcuts=session?[
  ['Inicio',Home,()=>window.location.assign('/')],
  ...(scope==='customer'?[
   ['Catálogo',Store,()=>jump('catalogo')],['Carrito',ShoppingCart,()=>jump('carrito')],['Pedidos',Package,()=>jump('mis-pedidos')]
  ]:scope==='restaurant'?[
   ['Pedidos',Package,sectionAction(setBoard,'active','negocio')],
   ...(canManage?[['Menú',Store,sectionAction(setBoard,'menu','menu-negocio')],['Caja',ShoppingCart,sectionAction(setBoard,'cash','negocio')]]:[])
  ]:scope==='courier'?[['Entregas',Bike,()=>jump('entregas')],['Historial',History,()=>jump('historial-entregas')]]:[
   ['Resumen',ShieldCheck,()=>jump('control')],['Negocios',Store,sectionAction(setControlSection,'business','control-secciones')],
   ['Accesos',Users,sectionAction(setControlSection,'accounts','control-secciones')]
  ])
 ]:[];
 useEffect(()=>{
  if(cartAccount&&customerSection)document.getElementById(customerSection)?.scrollIntoView();
 },[cartAccount,customerSection]);
 if(controlView&&!session)return <div className="dvl-app dvl-account-shell"><main className="dvl-main">{!accessReady&&!offline?<p role="status">Verificando acceso…</p>:<GoogleAdminSignIn api={api} offline={offline} onSuccess={me=>openSession(me,true)}/>}</main></div>;
 if(CustomerHome&&cartAccount&&!qaView){
  const resetDiscount=()=>{setAppliedCoupon(null);setCouponText('');setFlashSelection(null)};
  const changeDraft=(draft)=>{
   if(busy||offline||pendingKey)return false;
   if(!writeCart(cartAccount,{restaurantId:draft.restaurantId,items:draft.items}))return false;
   setCartRestaurantId(draft.restaurantId);setCart(draft.items);resetDiscount();return true;
  };
  const hashPage=window.location.hash.slice(1);
  const initialPage=customerSection==='carrito'?'cart':customerSection==='mis-pedidos'?'orders':
   ['home','cart','orders','account','restaurants','favorites','invite','install'].includes(hashPage)?hashPage:
   new URLSearchParams(window.location.search).get('intent')==='courier'?'account':'home';
  const liveCustomer={
   cart,restaurantId:cartRestaurantId,restaurant,restaurants,orders,subtotal,fee,discount,money:price,
   busy,offline,pendingKey,replaceCart,deliveryMethod,setDeliveryMethod,phone,setPhone,deliveryAddress,setDeliveryAddress,
   eligibleFlash,activeFlash,flashSelection,couponText,orderNote,setOrderNote,error,checkout,recoverCheckout,
   changeDraft,favoriteIds,toggleFavorite,flashOffers:offline?[]:flashOffers,
   quantity:(id,delta)=>{if(pendingKey||busy||offline)return;setCart(current=>{const item=current.find(p=>p.productId===id);return item?updateQuantity(current,item,delta):current});resetDiscount()},
   keepCart:()=>setReplaceCart(null),
   replace:()=>{if(replaceCart&&changeDraft(replaceCart))setReplaceCart(null)},
   importGuest:()=>{const draft=readCart('guest');if(!cart.length&&draft.items.length&&changeDraft(draft))writeCart('guest',{items:[]})},
   selectFlash:id=>{setFlashSelection(eligibleFlash.find(item=>item.id===id)||null);setAppliedCoupon(null);setCouponText('')},
   changeCoupon:value=>{setCouponText(value);setAppliedCoupon(null);setFlashSelection(null)},
   applyCoupon:async()=>{const result=await run(()=>api.coupon(cartRestaurantId,couponText),{refresh:false});if(result){setAppliedCoupon(result);setFlashSelection(null)}},
   selectedPin,showOrder:showCustomerOrder,hidePin:()=>setSelectedPin(null),reorder,
   rateCourier:(order,stars)=>action(()=>api.rateCourier(order.id,stars)),
   support:(order,mode)=>setSupport({id:order.id,mode,order}),
   cancelOrder:o=>action(()=>api.cancelOrder(o,newKey())),
   supportView:support&&(support.order||orders.some(o=>o.id===support.id))?<ClientSupport key={support.id+support.mode} mode={support.mode} order={support.order||orders.find(o=>o.id===support.id)} api={api} offline={offline} close={()=>setSupport(null)} onSessionError={handleSessionError}/>:null,
   displayName:session.user.displayName,rename:async name=>{const data=await run(()=>api.renameClient(name),{refresh:false});if(data)setSession(old=>({...old,user:{...old.user,displayName:name}}));return Boolean(data)},
   logout:()=>logout(),application:accountEnabled?<><CourierApplication api={api} busy={busy} offline={offline} account={cartAccount} run={run}/>{publicAuth&&<AccountBiometrics api={api} busy={busy} offline={offline} run={run} errorLabel={errorLabel}/>}</>:null,
   notifications:pushConfig?.enabled?<div className="dvl-inline"><Action kind="secondary" disabled={busy||offline} onClick={()=>setQaPush(!pushEnabled)}>{pushEnabled?'Desactivar notificaciones':'Activar notificaciones'}</Action></div>:null,
   notice:<><ClientCodes codes={newCodes} close={()=>setNewCodes(null)}/>{offline&&<WaitOrError message="Sin conexión. No se pueden enviar pedidos." warning/>}<WaitOrError message={error} warning/><WaitOrError message={status}/><WaitOrError message={refreshWarning}/></>
  };
  return <CustomerHome key={cartAccount} connected customerId={cartAccount} initialPage={initialPage} liveCustomer={liveCustomer} onSignOut={()=>logout()}/>;
 }
 return <div className={adminMode?"dvl-app dvl-account-shell dvl-admin-shell":session?"dvl-app dvl-account-shell":"dvl-app"}>
  {adminMode?<header className="dvl-header dvl-admin-header">
   <a className="dvl-admin-brand" href="/" aria-label="Inicio de Dvolada"><img src={import.meta.env.BASE_URL+'logo.png'} alt="Dvolada"/><span><strong>Dvolada</strong><small>Centro de Control</small></span></a>
   <div className="dvl-admin-header-actions">
    <label className="dvl-theme"><span className="dvl-admin-visually-hidden">Tema</span><select aria-label="Tema visual" value={theme} onChange={e=>setTheme(e.target.value)}><option value="light">Claro</option><option value="dark">Oscuro</option><option value="system">Automático</option></select></label>
    <button type="button" className="dvl-admin-icon-button" aria-label="Actualizar Centro de Control" title="Actualizar" disabled={busy||offline} onClick={()=>run(()=>load(scope,selectedRestaurantId),{refresh:false})}><RefreshCw size={18}/></button>
    <button type="button" className="dvl-admin-icon-button" aria-label="Mi acceso" title="Mi acceso" onClick={()=>selectControlSection('security')}><Users size={19}/></button>
   </div>
  </header>:<header className="dvl-header"><div className="dvl-brand"><img className="dvl-official-logo" src={import.meta.env.BASE_URL+'logo.png'} alt="Dvolada" /><div><strong>Dvolada</strong><small>Pedí fácil, que te llega de volada</small></div></div>
   <div className="dvl-head-actions"><a className="dvl-action secondary" href="/">Inicio</a><label className="dvl-theme">Tema<select aria-label="Tema visual" value={theme} onChange={e=>setTheme(e.target.value)}><option value="light">Claro</option><option value="dark">Oscuro</option><option value="system">Automático</option></select></label>{session&&<span>{session.user.displayName}</span>}{session&&<Action kind="secondary" disabled={busy||offline} onClick={()=>logout()}><LogOut size={15}/> Salir</Action>}</div></header>}
  {adminMode?<ControlNavigation section={controlSection} setSection={selectControlSection} flash={flashEnabled} commercial={commercial}/>:session&&<nav className="dvl-shortcuts" aria-label="Navegación principal">{shortcuts.map(([label,Icon,action])=>
   <button type="button" key={label} onClick={action}><Icon size={20} aria-hidden="true"/>{label}</button>)}</nav>}
  <main className="dvl-main">
  <div className="dvl-intro"><span className="dvl-kicker">NEXORA SYSTEMS · DVOLADA ONLINE</span>
   <h1>{session?(scope==='restaurant'&&selectedBusiness?.staff_role==='kitchen'?'Cocina':roles[scope]) :(qaView?'Dvolada · Entorno de pruebas':'Dvolada · Mi cuenta')}</h1>
   <p>{adminMode?'Administrá tu red de negocios y entregas.':session?'Gestioná tu actividad en Dvolada.':'Accedé para hacer y seguir pedidos con seguridad.'}</p></div>
  {offline&&<div className="dvl-offline" role="alert"><WifiOff size={19}/> Sin conexión. Los pedidos se muestran como potencialmente desactualizados; las acciones están bloqueadas.</div>}
  <WaitOrError message={status}/>
  <WaitOrError message={error} warning/>
  <WaitOrError message={refreshWarning}/>
  {session&&(!adminMode||controlSection==='security')&&<details className={adminMode?'dvl-panel dvl-admin-details':undefined}><summary>Datos de vinculación</summary><div className="dvl-id-note"><span>ID de vinculación: <code>{formattedUserId}</code></span><Action kind="text"
   onClick={()=>navigator.clipboard?.writeText(formattedUserId).catch(()=>{})}>Copiar</Action></div></details>}
    {(session?.user.privilegedPasskey||session?.user.googleAdmin)&&(!adminMode||controlSection==='security')&&<Action kind="text" disabled={busy||offline}
   onClick={()=>{if(window.confirm('¿Cerrar todas las sesiones de esta cuenta?'))logout(true)}}>Cerrar todas mis sesiones</Action>}
  {staffCredential&&<StaffSecret code={staffCredential} close={()=>setStaffCredential(null)} issued/>}
  {!session&&commercial&&accountEnabled&&<StaffSignIn authenticate={authenticateStaff} disabled={busy||offline}/>}
  <ClientCodes codes={newCodes} close={()=>setNewCodes(null)}/>
  {!session&&!accessReady&&!offline&&<p role="status">Verificando acceso…</p>}
  {!session&&accountEnabled&&<>{publicAuth&&new URLSearchParams(location.search).get('intent')!=='restaurant'&&<section className="dvl-panel dvl-stack">{googleCustomer&&<CustomerGoogleButton api={api} offline={offline} onSuccess={(me,codes)=>{if(codes.recovery)setNewCodes(codes);openSession(me,true)}}/>}<button type="button" className="dvl-action secondary" disabled={busy||offline} onClick={()=>authenticateClient('login',{login:''})}>Ingresar con huella o Face ID</button><button type="button" className="dvl-action secondary" disabled={busy||offline} onClick={()=>setPasswordMode(v=>!v)}>{passwordMode?'Usar huella o llave de acceso':'Ingresar o crear cuenta con contraseña'}</button></section>}{publicAuth&&passwordMode&&new URLSearchParams(location.search).get('intent')!=='restaurant'?<PasswordAccess authenticate={authenticatePassword} busy={busy} offline={offline} initialMode={new URLSearchParams(location.search).get('mode')==='register'?'register':'login'} onBack={()=>setPasswordMode(false)}/>:<ClientAccess authenticate={authenticateClient} busy={busy} offline={offline}/>}</>}
  {qaView&&!session&&(accessReady||offline)&&<form className="dvl-panel dvl-login" onSubmit={signIn}>
   <h2>Ingresá con tu acceso de pruebas</h2>
   <label>Código de acceso<input type="password" autoComplete="off" value={accessCode}
    onChange={e=>setAccessCode(e.target.value)} required /></label>
   <button type="submit" className="dvl-action" disabled={busy||offline||accessCode.trim().length!==43}>Iniciar sesión</button>
   <a href="/">Explorar catálogo sin iniciar sesión</a>
  </form>}
  {session&&<>
   {(!adminMode||availableScopes.length>1)&&<nav className="dvl-roles" aria-label="Paneles autorizados">{availableScopes.map(s=><button key={s} className={scope===s?'active':''}
    onClick={()=>{setScope(s);setError('');setSupport(null);setSelectedPin(null);setOrderDetail(null)}}>{s==='customer'?<ShoppingBag size={17}/>:s==='restaurant'?<Store size={17}/>:s==='courier'?<Bike size={17}/>:<ShieldCheck size={17}/>} {roles[s]}</button>)}
    {!adminMode&&<Action kind="secondary" disabled={busy||offline} onClick={()=>run(()=>load(scope,selectedRestaurantId),{refresh:false})}><RefreshCw size={15}/> Actualizar</Action>}
    {pushConfig?.enabled&&<>
     {!pushEnabled&&<Action kind="secondary" disabled={busy||offline} onClick={()=>setQaPush(true)}>Activar notificaciones</Action>}
     <Action kind="secondary" disabled={busy||offline} onClick={()=>setQaPush(false)}>Desactivar notificaciones</Action>
    </>}
   </nav>}
    {support&&(support.order||orders.some(order=>order.id===support.id))&&<ClientSupport key={support.id+support.mode}
     mode={support.mode} counterpart={support.mode==='dispatch'?(scope==='courier'?'Restaurante':'Repartidor'):scope!=='customer'?'Cliente':null} order={support.order||orders.find(order=>order.id===support.id)} api={api} offline={offline}
     close={()=>setSupport(null)} onSessionError={handleSessionError}/>}
   {scope==='customer'&&<div className="dvl-columns">
    {accountEnabled&&<CourierApplication api={api} busy={busy} offline={offline} account={session.user.id} run={run}/>}
    <FlashOffers campaigns={offline?[]:flashOffers} money={price} open={viewProducts}/>
    <section className="dvl-panel" id="catalogo"><h2>Restaurantes afiliados</h2>
     {!shoppingRestaurant?<div className="dvl-stack">
      <div className="dv-catalog-switch" role="group" aria-label="Cómo explorar Dvolada">
       <button type="button" aria-pressed={catalogView==='food'} className={catalogView==='food'?'active':''} onClick={()=>setCatalogView('food')}><ShoppingBag size={17}/> Ver comida</button>
       <button type="button" aria-pressed={catalogView==='restaurants'} className={catalogView==='restaurants'?'active':''} onClick={()=>setCatalogView('restaurants')}><Store size={17}/> Ver restaurantes</button>
      </div>{catalogView==='food'?<><label>Buscar comida o restaurante<input type="search" maxLength={60} value={catalogTerm} onChange={e=>setCatalogTerm(e.target.value)} placeholder="¿Qué se te antoja?"/></label>
      <FoodFeed api={api} offline={offline} term={catalogTerm} money={price} openRestaurant={viewProducts}/></>:<>
      <label className="dvl-favorite-filter"><input type="checkbox" checked={onlyFavorites} onChange={event=>setOnlyFavorites(event.target.checked)}/> Solo mis favoritos</label>
      <CatalogSearch api={api} offline={offline} term={catalogTerm} onChange={setCatalogTerm} openRestaurant={viewProducts} money={price}/>
      {restaurants.filter(r=>(!onlyFavorites||favoriteIds.includes(r.id))&&r.name.toLowerCase().includes(catalogTerm.trim().toLowerCase())).map(r=><div className="dvl-row" key={r.id}><div><strong>{r.name}</strong><small>{r.online_state==='open'?'Aceptando pedidos':'En pausa'}</small></div>
      <div className="dvl-inline dvl-client-modes">
      <button className="dvl-action secondary" type="button" disabled={busy||offline} aria-pressed={favoriteIds.includes(r.id)}
       onClick={()=>toggleFavorite(r.id)}>{favoriteIds.includes(r.id)?'Quitar favorito':'Guardar favorito'}</button>
      <Action disabled={offline||r.online_state!=='open'} kind="secondary" onClick={()=>viewProducts(r.id)}>Ver menú</Action></div></div>)}
      {!restaurants.length&&<p>Próximamente encontrarás los restaurantes afiliados aquí.</p>}</>}</div>:
      <><Action kind="text" onClick={()=>{menuRequest.current++;setShoppingRestaurant('');setProducts([])}}>Volver al catálogo</Action>
       {cart.length>0&&<a className="dvl-cart-link" href="#carrito">Volver al carrito</a>}
       <div className="dvl-stack">{products.map(p=><div className="dvl-row" key={p.id}><div>{p.photoUrl&&<img className="dvl-menu-photo" src={p.photoUrl} alt={p.name} loading="lazy"/>}<strong>{p.name}</strong><small>{p.category&&p.category+' · '}{price(p.price_minor)}</small>
        {p.options?.length>0&&!(cartRestaurantId===shoppingRestaurant&&cart.some(item=>item.productId===p.id))&&
         <fieldset className="dvl-options" disabled={offline||busy||Boolean(pendingKey)}><legend>Personalizá {p.name}</legend>
          {p.options.some(option=>option.kind==='variant')&&<label>Variante<select
           value={p.options.find(option=>option.kind==='variant'&&(optionsByProduct[p.id]||[]).includes(option.id))?.id||''}
           onChange={event=>{const id=event.target.value;setOptionsByProduct(current=>({...current,[p.id]:[
             ...(current[p.id]||[]).filter(selected=>p.options.some(option=>option.id===selected&&option.kind==='extra')),...(id?[id]:[])]}))}}>
           <option value="">Presentación base</option>{p.options.filter(option=>option.kind==='variant').map(option=>
            <option key={option.id} value={option.id}>{option.name} + {price(option.price_minor)}</option>)}
          </select></label>}
          {p.options.filter(option=>option.kind==='extra').map(option=><label key={option.id} className="dvl-favorite-filter">
           <input type="checkbox" disabled={(optionsByProduct[p.id]||[]).length>=7&&!(optionsByProduct[p.id]||[]).includes(option.id)} checked={(optionsByProduct[p.id]||[]).includes(option.id)}
            onChange={event=>{const checked=event.target.checked;setOptionsByProduct(current=>({...current,[p.id]:checked?
             [...(current[p.id]||[]),option.id]:(current[p.id]||[]).filter(id=>id!==option.id)}))}}/>{option.name} + {price(option.price_minor)}
          </label>)}
         </fieldset>}
       </div>
        <Action kind="secondary" disabled={offline||busy||Boolean(pendingKey)} onClick={()=>addProduct(p)}>Agregar</Action></div>)}
       {!products.length&&<p>Este local todavía no tiene productos disponibles.</p>}</div></>}
    </section>
    <section className="dvl-panel" id="carrito"><h2>Carrito</h2>
     {replaceCart&&<div className="dvl-cart-confirm" role="group" aria-label="Cambiar carrito">
      <p>Cada pedido corresponde a un solo restaurante. ¿Querés reemplazar el carrito actual?</p>
      <div className="dvl-inline">
       <Action onClick={()=>{setCart(replaceCart.items);setCartRestaurantId(replaceCart.restaurantId);setAppliedCoupon(null);setCouponText('');setFlashSelection(null);setReplaceCart(null)}}>Reemplazar</Action>
       <Action kind="secondary" onClick={()=>setReplaceCart(null)}>Conservar carrito</Action>
      </div>
     </div>}
     {!cart.length&&readCart('guest').items.length>0&&<Action kind="secondary" disabled={busy||offline} onClick={()=>{
      const draft=readCart('guest');
      if(draft.items.length){putCart(draft.restaurantId,draft.items);writeCart('guest',{items:[]})}
     }}>Usar carrito de invitado</Action>}
     {!cart.length?<p>Seleccioná un restaurante y agregá productos.</p>:<><div className="dvl-stack">
      {cart.map(p=><div className="dvl-row" key={p.productId}><div><strong>{p.name}</strong><small>{p.quantity} × {price(p.priceMinor)}</small>{p.options?.length>0&&<small>{p.options.map(option=>option.name).join(' · ')}</small>}</div>
       <Action kind="secondary" disabled={busy||Boolean(pendingKey)} onClick={()=>removeProduct(p.productId)}>Quitar uno</Action></div>)}</div>
      <div className="dvl-row"><strong>Productos</strong><strong>{price(subtotal)}</strong></div>
      <div className="dvl-row"><strong>Envío estimado</strong><strong>{price(fee)}</strong></div>
      {eligibleFlash.length>0&&<label>Promoción Flash<select value={activeFlash?.id||''} disabled={busy||offline||Boolean(pendingKey)}
       onChange={event=>{setFlashSelection(eligibleFlash.find(item=>item.id===event.target.value)||null);setAppliedCoupon(null);setCouponText('')}}>
       <option value="">Sin promoción Flash</option>{eligibleFlash.map(item=><option key={item.id} value={item.id}>{item.title}</option>)}</select></label>}
      {flashSelection&&!activeFlash&&<div className="dvl-notice warn" role="status">La promoción seleccionada ya no está disponible.
       <Action kind="secondary" disabled={busy||Boolean(pendingKey)} onClick={()=>setFlashSelection(null)}>Quitar promoción</Action></div>}
      {activeFlash?.giftName&&<p>Regalo: {activeFlash.giftName}</p>}
      {activeFlash&&discount>0&&<p>Descuento Flash: −{price(discount)}</p>}
      <label>Cupón<input value={couponText} maxLength={24} disabled={busy||Boolean(pendingKey)}
       onChange={event=>{setCouponText(event.target.value);setAppliedCoupon(null);setFlashSelection(null)}}/></label>
      <Action kind="secondary" disabled={busy||offline||Boolean(pendingKey)||couponText.trim().length<4}
       onClick={async()=>{const result=await run(()=>api.coupon(cartRestaurantId,couponText),{refresh:false});if(result){setAppliedCoupon(result);setFlashSelection(null)}}}>Aplicar cupón</Action>
      {appliedCoupon&&<div className="dvl-row"><strong>Descuento {appliedCoupon.code}</strong><strong>−{price(discount)}</strong></div>}
      <div className="dvl-row dvl-total"><strong>Total preliminar</strong><strong>{price(subtotal+fee-discount)}</strong></div>
      <label>Teléfono de Honduras (+504)<input inputMode="numeric" autoComplete="tel-national" value={phone}
       onChange={e=>setPhone(e.target.value.replace(/\D/g,'').slice(0,8))} /></label>
      <label>Modalidad<select value={deliveryMethod} onChange={e=>setDeliveryMethod(e.target.value)}>
       <option value="delivery">Entrega a domicilio</option><option value="pickup">Recoger en restaurante</option></select></label>
      {deliveryMethod==='delivery'&&<label>Dirección completa<textarea rows={3} value={deliveryAddress}
       maxLength={300} onChange={e=>setDeliveryAddress(e.target.value)} placeholder="Barrio, calle, casa y referencia"/></label>}
      <label>Observaciones para el restaurante<textarea value={orderNote} maxLength={300} rows={2}
       onChange={event=>setOrderNote(event.target.value)} placeholder="Instrucciones para preparar tu pedido"/></label>
      <p className="dvl-muted">El servidor verificará precios y disponibilidad. Los cobros por tarjeta todavía no están habilitados.</p>
      {pendingKey&&<><p>Hay un intento pendiente. Buscá su confirmación o reintentá con los mismos datos.</p>
       <Action kind="secondary" disabled={busy||offline} onClick={recoverCheckout}>Buscar confirmación</Action></>}
      <SlideConfirm disabled={busy||offline||!restaurant||Boolean(replaceCart)} onConfirm={checkout}
       label={pendingKey?'Deslizá para reintentar el mismo pedido':'Deslizá para confirmar'}
       amount={price(subtotal+fee-discount)}/>
      </>}
    </section>
    <section className="dvl-panel dvl-span" id="mis-pedidos"><h2>Mis pedidos</h2>
      {orders.length?<div className="dvl-grid">{orders.map(o=><OrderCard key={o.id} order={o}>
      <Action kind="secondary" disabled={busy||offline} onClick={()=>showCustomerOrder(o)}>Ver detalle / PIN</Action>
      <Action kind="secondary" disabled={offline} onClick={()=>setSupport({id:o.id,mode:'restaurant'})}>Chat con restaurante</Action>
      {o.courierResponse==='accepted'&&<Action kind="secondary" disabled={offline}
       onClick={()=>setSupport({id:o.id,mode:'courier'})}>Chat con repartidor</Action>}
      <Action kind="text" disabled={offline} onClick={()=>setSupport({id:o.id,mode:'claim'})}>Reclamo</Action>
      {o.status==='Entregado'&&<Action kind="text" disabled={busy||offline||Boolean(pendingKey)} onClick={()=>reorder(o)}>Volvé a pedir</Action>}
      {o.status==='Pendiente'&&<Action kind="text" disabled={busy||offline} onClick={()=>action(()=>api.cancelOrder(o,newKey()))}>Cancelar pedido</Action>}
      </OrderCard>)}</div>:<p>Tus pedidos confirmados aparecerán aquí.</p>}
      {selectedPin&&<div className="dvl-pin" role="status"><strong>Pedido {selectedPin.receipt?.orderNumber||selectedPin.id.slice(0,8)}</strong>
       {selectedPin.receipt&&<>{selectedPin.receipt.flashGiftName&&<p>Regalo: {selectedPin.receipt.flashGiftName}</p>}<ul>{selectedPin.receipt.items.map(item=><li key={item.product_id}>
        {item.quantity} × {item.name_snapshot}{(item.optionNames||optionsFromReceipt(item).map(option=>option.name)).map(name=>' · '+name)}
       </li>)}</ul><span>Total: {price(selectedPin.receipt.totalMinor)}</span></>}
       <p>
       {selectedPin.pin?'PIN de entrega: '+selectedPin.pin:'Sin PIN de entrega disponible'}</p>
       <small>Compartí el PIN únicamente con tu repartidor cuando recibás el pedido.</small>
       <Action kind="text" onClick={()=>setSelectedPin(null)}>Ocultar</Action></div>}
    </section>
   </div>}
   {scope==='restaurant'&&<div className="dvl-stack">
    <section className="dvl-panel" id="negocio"><div className="dvl-row"><h2>{kitchenRole?'Pantalla de cocina':cashRole?'Caja del restaurante':'Centro de pedidos'}</h2><label>Negocio<select value={selectedRestaurantId}
     onChange={e=>{setBoard('active');setOrderDetail(null);setSupport(null);setOrders([]);setManageProducts([]);setRestaurantCapabilities(null);setCouriers([]);setEditPrices({});setCourierChoice({});setSelectedRestaurantId(e.target.value)}}>{session.restaurants?.map(r=><option key={r.restaurant_id} value={r.restaurant_id}>{r.name}</option>)}</select></label></div>
     {canManage&&<nav className="dvl-inline dvl-client-modes" aria-label="Secciones de Restaurante Cloud">
      {Object.entries({active:'Pedidos activos',history:'Historial',menu:'Subir comida y menú',settings:'Perfil y personal',cash:'Caja y ventas',...(commercial?{settlements:'Liquidaciones'}:{})}).map(([tab,label])=>
       <button type="button" key={tab} aria-pressed={restaurantTab===tab} disabled={busy} className={'dvl-action '+(restaurantTab===tab?'':'secondary')}
        onClick={()=>setBoard(tab)}>{label}</button>)}
     </nav>}
     {canManage&&restaurantTab==='active'&&<Action onClick={()=>setBoard('menu')} disabled={busy}>Subir comida</Action>}
     {kitchenRole&&<p>Comandas aceptadas, de la más antigua a la reciente.</p>}
    </section>
    {canManage&&restaurantTab==='settings'&&<>
     <RestaurantProfile key={selectedRestaurantId} api={api} id={selectedRestaurantId} run={run} busy={busy} offline={offline}/>
     <RestaurantStaff key={'staff-'+selectedRestaurantId} api={api} id={selectedRestaurantId} owner={selectedBusiness.staff_role==='owner'}
      run={run} busy={busy} offline={offline}/>
     {commercial&&selectedBusiness.staff_role==='owner'&&<ManageStaffAccess key={'access-'+selectedRestaurantId}
      api={api} restaurant={selectedRestaurantId} run={run} busy={busy} offline={offline} errorLabel={errorLabel}/>}
    </>}
    {commercial&&canManage&&restaurantTab==='settlements'&&<SettlementPanel key={selectedRestaurantId}
     api={api} restaurant={selectedRestaurantId} run={run} busy={busy} offline={offline} money={price} errorLabel={errorLabel}/>}
    {(cashRole||(canManage&&restaurantTab==='cash'))&&<RestaurantCash key={'cash-'+selectedRestaurantId}
     api={api} id={selectedRestaurantId} orders={orders} offline={offline} busy={busy} run={run} money={price} refreshOrders={load}/>}
    {canManage&&['active','menu'].includes(restaurantTab)&&<section className="dvl-panel">
     <h2>Disponibilidad del restaurante</h2><div className="dvl-inline dvl-control-actions">
      <span>Estado: <strong>{restaurantCapabilities?.onlineState||'Desconocido'}</strong></span>
      {['open','paused','closed'].map(state=><Action key={state} kind="secondary"
       disabled={busy||offline||restaurantCapabilities?.onlineState===state}
       onClick={()=>action(()=>api.updateAvailability(selectedRestaurantId,state))}>
       {state==='open'?'Abrir':state==='paused'?'Pausar':'Cerrar'}</Action>)}
     </div>
    </section>}
    {canManage&&restaurantTab==='menu'&&<section className="dvl-panel" id="menu-negocio"><h2>Menú del restaurante</h2>
     <PublishFood key={selectedRestaurantId} api={api} restaurantId={selectedRestaurantId} run={run} busy={busy} offline={offline}/>
     <div className="dvl-stack dvl-manage-menu">{manageProducts.map(p=><div className="dvl-stack" key={p.id}><div className="dvl-row">
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
     </div>
     <ProductDetails api={api} id={selectedRestaurantId} product={p} run={run} busy={busy} offline={offline}
      onSaved={()=>load().catch(error=>setError(errorLabel(error)))}/>
     </div>)}</div>
    </section>}
    {kitchenRole&&<RestaurantKitchenDisplay serverBacked connected={!offline} busy={busy}
     restaurantId={selectedRestaurantId} restaurantName={selectedBusiness.name}
     orders={boardOrders.map(order=>({...order,kind:'food',placeId:selectedRestaurantId,orderNo:order.orderNumber,
      delivery:order.deliveryMethod,createdAt:order.createdAt*1000,acceptedAt:order.stageAt*1000,
      preparingAt:order.stageAt*1000,readyAt:order.stageAt*1000,
      notes:[order.note,order.flashGiftName&&('Regalo: '+order.flashGiftName)].filter(Boolean).join(' · ')}))}
     onChange={(order,next)=>action(()=>api.restaurantStatus(selectedRestaurantId,order,next,newKey()))}
     onPrint={order=>{if(!openKitchenTicket(order,selectedBusiness.name))setError('Permití abrir la comanda para imprimirla.')}}
     onDetail={showRestaurantOrder}/>}
    {kitchenRole&&orderDetail?.restaurantId===selectedRestaurantId&&<section className="dvl-panel" aria-label="Detalle de la comanda">
     <h2>Comanda {orderDetail.orderNumber}</h2>
     <ul>{orderDetail.items.map((item,i)=><li key={i}>{item.quantity} × {item.name_snapshot}{item.optionNames?.map(name=>' · '+name)}</li>)}</ul>
     {orderDetail.note&&<p>{orderDetail.note}</p>}<Action kind="secondary" onClick={()=>setOrderDetail(null)}>Cerrar detalle</Action>
    </section>}
    {!cashRole&&!kitchenRole&&['active','history'].includes(restaurantTab)&&<>
    <div className="dvl-grid">{boardOrders.map(o=><OrderCard key={o.id} order={o} kitchen={kitchenRole}>
      {o.flashGiftName&&<p>Regalo: {o.flashGiftName}</p>}
      <Action kind="secondary" disabled={busy||offline} onClick={()=>showRestaurantOrder(o)}>Ver comanda</Action>
      {canManage&&<Action kind="secondary" disabled={offline} onClick={()=>setSupport({id:o.id,mode:'restaurant'})}>Chat con cliente</Action>}
      {canManage&&o.courierResponse==='accepted'&&<Action kind="secondary" disabled={offline}
       onClick={()=>setSupport({id:o.id,mode:'dispatch'})}>Chat con repartidor</Action>}
      {orderDetail?.orderId===o.id&&orderDetail.restaurantId===selectedRestaurantId&&<>
       <ul aria-label="Artículos de la comanda">{orderDetail.items.map((item,index)=><li key={index}>{item.quantity} × {item.name_snapshot}{(item.optionNames||optionsFromReceipt(item).map(option=>option.name)).map(name=>' · '+name)}</li>)}</ul>
       {orderDetail.note&&<p>Observaciones: {orderDetail.note}</p>}
       <Action kind="secondary" onClick={()=>{setPrintReceipt(false);setTimeout(()=>window.print(),0)}}>Imprimir comanda</Action>
       {canManage&&o.status==='Entregado'&&<Action kind="secondary" onClick={()=>{setPrintReceipt(true);setTimeout(()=>window.print(),0)}}>Imprimir comprobante</Action>}
       {createPortal(<section className="dvl-print-sheet">
        <h1>{selectedBusiness?.name}</h1><h2>{printReceipt?'Comprobante':'Comanda'} #{orderDetail.orderNumber}</h2>{o.flashGiftName&&<p>Regalo: {o.flashGiftName}</p>}
        <ul>{orderDetail.items.map((item,index)=><li key={index}>{item.quantity} × {item.name_snapshot}{(item.optionNames||optionsFromReceipt(item).map(option=>option.name)).map(name=>' · '+name)}</li>)}</ul>
        {orderDetail.note&&<p>Observaciones: {orderDetail.note}</p>}
        {printReceipt&&<dl><dt>Productos</dt><dd>{price(o.subtotalMinor)}</dd><dt>Descuento</dt><dd>{price(o.discountMinor)}</dd>
         <dt>Envío</dt><dd>{price(o.deliveryFeeMinor)}</dd><dt>Total</dt><dd>{price(o.totalMinor)}</dd></dl>}
       </section>,document.body)}
      </>}
      <div className="dvl-inline">{(staffTransitions[o.status]||[]).filter(next=>canManage||
       (selectedBusiness?.staff_role==='kitchen'&&['Preparando','Listo'].includes(next))).map(next=><Action key={next} disabled={busy||offline}
        onClick={()=>action(()=>api.restaurantStatus(selectedRestaurantId,o,next,newKey()))}>{{Aceptado:'Aceptar pedido',Rechazado:'Rechazar pedido',Preparando:'Preparar pedido',Listo:'Marcar listo',Cancelado:'Cancelar pedido'}[next]||next}</Action>)}</div>
      {canManage&&o.status==='Listo'&&o.deliveryMethod==='pickup'&&<Action disabled={busy||offline} onClick={()=>action(()=>api.restaurantStatus(selectedRestaurantId,o,'Entregado',newKey()))}>Entregar en mostrador</Action>}
      {canManage&&o.deliveryMethod==='delivery'&&!o.courierId&&['Aceptado','Preparando','Listo'].includes(o.status)&&
       <div className="dvl-assign"><label>Repartidor<select value={courierChoice[o.id]||''} onChange={e=>setCourierChoice(x=>({...x,[o.id]:e.target.value}))}>
        <option value="">Seleccioná repartidor</option>{couriers.map(c=><option key={c.id} value={c.id}>{c.name} ({c.active_orders}/{c.max_orders})</option>)}</select></label>
       <Action kind="secondary" disabled={busy||offline||!courierChoice[o.id]} onClick={()=>action(()=>api.assignCourier(selectedRestaurantId,o,courierChoice[o.id],newKey()))}>Asignar</Action></div>}
    </OrderCard>)}{!orders.length&&<div className="dvl-panel"><Package size={27}/><p>{kitchenRole?'Sin comandas pendientes.':'Aún no hay pedidos en esta vista.'}</p></div>}</div>
    {restaurantTab==='history'&&<div className="dvl-inline">
     {historyCursor&&<Action kind="secondary" disabled={busy||offline} onClick={()=>{setHistoryCursor(null);setOrderDetail(null)}}>Más recientes</Action>}
     {nextHistory&&<Action kind="secondary" disabled={busy||offline} onClick={()=>{setHistoryCursor(nextHistory);setOrderDetail(null)}}>Pedidos anteriores</Action>}
    </div>}
    </>}
    </div>}
   {scope==='courier'&&<CourierConsole api={api} profile={courierProfile} orders={orders} busy={busy} offline={offline}
    action={action} run={run} money={price} errorLabel={errorLabel} endSession={endLocalSession}
    openChat={(order,mode)=>setSupport({id:order.id,order,mode})}/>}
   {scope==='admin'&&<div className="dvl-stack dvl-admin-content" id="control-secciones">
    <ControlSubnavigation section={controlSection} setSection={selectControlSection} flash={flashEnabled} commercial={commercial}/>
    {controlSection==='summary'&&<ControlOverview stats={adminStats} setSection={selectControlSection}/>}
    {['operations','accounts','claims','coupons','rates','reports','audit'].includes(controlSection)&&<ControlWorkspace key={controlSection} section={controlSection}
     api={api} restaurants={adminRestaurants} offline={offline} busy={busy} run={run} money={price} errorLabel={errorLabel} setSection={selectControlSection}/>}
    {controlSection==='security'&&<section className="dvl-panel dvl-stack">
     <h2>Mi acceso</h2><div className="dvl-admin-identity"><span className="dvl-admin-avatar"><ShieldCheck size={23}/></span><div><strong>{session.user.displayName}</strong><small>Administrador global</small></div></div>
     <p className="dvl-muted">Administrá tu sesión y tus preferencias de acceso.</p>
     {pushConfig?.enabled&&<Action kind="secondary" disabled={busy||offline} onClick={()=>setQaPush(!pushEnabled)}>{pushEnabled?'Desactivar notificaciones':'Activar notificaciones'}</Action>}
     <Action kind="secondary" disabled={busy||offline} onClick={()=>logout()}><LogOut size={17}/> Cerrar sesión</Action>
     <a className="dvl-action secondary" href="/">Ir a Dvolada</a>
    </section>}
    {controlSection==='owners'&&<section className="dvl-panel dvl-stack"><h2>Invitar propietario</h2>
      <p className="dvl-muted">Seleccioná el restaurante y generá una invitación privada para su propietario.</p>
      <label>Restaurante<select value={adminSelectedId} onChange={e=>setAdminSelectedId(e.target.value)}>
       <option value="">Seleccionar</option>{adminRestaurants.filter(r=>r.plan!=='LOCAL').map(r=><option key={r.id} value={r.id}>{r.name}</option>)}</select></label>
     {(session.user.privilegedPasskey||session.user.googleAdmin)&&selectedAdminBusiness&&selectedAdminBusiness.plan!=='LOCAL'&&<OwnerInvitation key={adminSelectedId}
      restaurantId={adminSelectedId} disabled={busy||offline}
      invite={(id,body)=>run(()=>api.adminInviteOwner(id,body,newKey()),{refresh:false})}/>}
    </section>}
    {controlSection==='courierDirectory'&&<CourierDirectory api={api} run={run} busy={busy} offline={offline} errorLabel={errorLabel} setSection={selectControlSection}/>}
    {controlSection==='advertising'&&<SpotManager api={api} run={run} busy={busy} offline={offline} money={price} errorLabel={errorLabel}/>}
    {controlSection==='couriers'&&<>
     <CourierApplications api={api} run={run} busy={busy} offline={offline} errorLabel={errorLabel}/>
     <details className="dvl-panel dvl-admin-details"><summary>Vincular repartidor registrado</summary>
      <div className="dvl-grid dvl-editor"><label>ID de repartidor<input value={adminCourierId} onChange={e=>setAdminCourierId(e.target.value)} placeholder="UUID de usuario verificado"/></label>
      <Action disabled={busy||offline||adminCourierId.length<32} onClick={()=>action(()=>api.adminEnrollCourier(adminCourierId.trim()))}>Habilitar repartidor</Action></div>
     </details>
    </>}
    {controlSection==='staff'&&<section className="dvl-panel dvl-stack"><h2>Personal de restaurantes</h2>
     <label>Negocio para administrar<select value={adminSelectedId} onChange={e=>setAdminSelectedId(e.target.value)}><option value="">Seleccionar</option>{adminRestaurants.map(r=><option key={r.id} value={r.id}>{r.name}</option>)}</select></label>
     <div className="dvl-grid dvl-editor">
      <label>ID de usuario registrado<input value={adminMemberId} onChange={e=>setAdminMemberId(e.target.value)} placeholder="UUID del usuario"/></label>
      <label>Rol del empleado<select value={adminStaffRole} onChange={e=>setAdminStaffRole(e.target.value)}>
       {Object.entries({owner:'Propietario',manager:'Encargado',kitchen:'Cocina',cashier:'Caja'}).map(([id,label])=><option value={id} key={id}>{label}</option>)}</select></label>
      <Action disabled={busy||offline||!selectedAdminBusiness||adminMemberId.length<32}
       onClick={()=>action(()=>api.adminAssignMember(adminSelectedId,{userId:adminMemberId.trim(),staffRole:adminStaffRole}))}>Vincular empleado</Action>
     </div></section>}
    {controlSection==='business'&&<>
     <section className="dvl-panel dvl-stack">
      <div className="dvl-admin-section-heading"><h2>Negocios afiliados</h2><button type="button" className="dvl-action" aria-expanded={adminCreateOpen} onClick={()=>setAdminCreateOpen(v=>!v)}>{adminCreateOpen?'Cerrar formulario':'+ Nuevo negocio'}</button></div>
      {adminCreateOpen&&<div className="dvl-admin-form-box"><h3>Registrar negocio</h3><p className="dvl-muted">El negocio se crea cerrado e inactivo. Podés activarlo después de verificar su afiliación.</p>
       <div className="dvl-grid dvl-editor">
        <label>Nuevo restaurante<input value={newRestaurantName} maxLength={160} onChange={e=>setNewRestaurantName(e.target.value)} placeholder="Nombre comercial"/></label>
        <label>Plan<select value={newRestaurantPlan} onChange={e=>setNewRestaurantPlan(e.target.value)}>
         <option value="ONLINE">Dvolada Cloud</option><option value="LOCAL">Dvolada Local</option><option value="PLUS">Dvolada Plus</option></select></label>
        <Action disabled={busy||offline||newRestaurantName.trim().length<2}
         onClick={async()=>{const result=await action(()=>api.adminCreateRestaurant({name:newRestaurantName,plan:newRestaurantPlan}));
          if(result){setAdminSelectedId(result.restaurant.id);setAdminFee('');setNewRestaurantName('');setAdminCreateOpen(false);setAdminBusinessSearch('')}}}>Crear negocio</Action>
       </div></div>}
      <label className="dvl-admin-search">Buscar negocio<input type="search" value={adminBusinessSearch} onChange={e=>setAdminBusinessSearch(e.target.value)} placeholder="Nombre del restaurante"/></label>
      <div className="dvl-admin-business-list">{adminRestaurants.filter(r=>r.name.toLowerCase().includes(adminBusinessSearch.trim().toLowerCase())).map(r=>
       <button className={'dvl-admin-business-row '+(r.id===adminSelectedId?'selected':'')} type="button" key={r.id} aria-pressed={r.id===adminSelectedId} onClick={()=>{setAdminSelectedId(r.id);setAdminFee('');requestAnimationFrame(()=>document.getElementById('control-business-detail')?.scrollIntoView({block:'start'}))}}>
        <span className="dvl-admin-business-icon"><Store size={20}/></span><span className="dvl-admin-business-name"><strong>{r.name}</strong><small>{{ONLINE:'Cloud',LOCAL:'Local',PLUS:'Plus'}[r.plan]||r.plan} · {r.order_count??0} pedidos</small></span>
        <span className={'dvl-admin-state '+(r.subscription_status==='active'?'is-active':'')}>{r.subscription_status==='active'?'Activo':'Inactivo'}</span><ArrowRight size={16} aria-hidden="true"/>
       </button>)}
       {!adminRestaurants.some(r=>r.name.toLowerCase().includes(adminBusinessSearch.trim().toLowerCase()))&&<p className="dvl-muted">No hay negocios para esta búsqueda.</p>}
      </div>
     </section>
     {selectedAdminBusiness&&<section className="dvl-panel dvl-stack dvl-admin-business-detail" id="control-business-detail">
      <div className="dvl-admin-section-heading"><h2>{selectedAdminBusiness.name}</h2><button className="dvl-action secondary" type="button" onClick={()=>{setAdminSelectedId('');setAdminFee('')}}>Cerrar</button></div>
      <div className="dvl-admin-business-meta"><span>Plan: {{ONLINE:'Cloud',LOCAL:'Local',PLUS:'Plus'}[selectedAdminBusiness.plan]||selectedAdminBusiness.plan}</span><span>Suscripción: {selectedAdminBusiness.subscription_status==='active'?'Activa':'Inactiva'}</span><span>Operación: {{open:'Abierto',paused:'En pausa',closed:'Cerrado'}[selectedAdminBusiness.online_state]||selectedAdminBusiness.online_state}</span></div>
      <div className="dvl-inline dvl-control-actions">
       {selectedAdminBusiness.subscription_status!=='active'?<Action disabled={busy||offline} onClick={()=>action(()=>api.adminUpdateRestaurant(selectedAdminBusiness.id,{subscriptionStatus:'active'}))}>Activar suscripción</Action>:
        <Action kind="secondary" disabled={busy||offline} onClick={()=>{if(window.confirm('¿Suspender la suscripción de '+selectedAdminBusiness.name+'?'))action(()=>api.adminUpdateRestaurant(selectedAdminBusiness.id,{subscriptionStatus:'inactive'}))}}>Suspender</Action>}
       {selectedAdminBusiness.plan!=='LOCAL'&&<Action kind="secondary" onClick={()=>selectControlSection('owners')}>Invitar propietario</Action>}
       <Action kind="secondary" onClick={()=>selectControlSection('staff')}>Personal</Action>
      </div>
      <RestaurantContract key={selectedAdminBusiness.id} restaurant={selectedAdminBusiness} api={api} run={run} busy={busy} offline={offline} money={price} errorLabel={errorLabel} onSaved={()=>load(scope,selectedRestaurantId)}/>
      <details className="dvl-admin-details"><summary>Tarifa de envío</summary>
       <div className="dvl-grid dvl-editor">
        <label>Tarifa de envío (L)<input value={adminFee} type="number" min="0" max="1000000" step=".01"
         placeholder={(Number(selectedAdminBusiness.delivery_fee_minor||0)/100).toFixed(2)} onChange={event=>setAdminFee(event.target.value)}/></label>
        <Action disabled={busy||offline||!/^\d{1,7}(?:\.\d{1,2})?$/.test(adminFee)||Number(adminFee)>1000000}
         onClick={async()=>{if(await action(()=>api.adminUpdateRestaurant(selectedAdminBusiness.id,{deliveryFeeMinor:Math.round(Number(adminFee)*100)})))setAdminFee('')}}>Guardar tarifa</Action>
       </div>
      </details>
     </section>}
    </>}
    {controlSection==='flash'&&flashEnabled&&<FlashAdmin api={api} restaurants={adminRestaurants} busy={busy} offline={offline} run={run}/>}
    {controlSection==='settlements'&&commercial&&<section className="dvl-panel"><label>Restaurante para liquidaciones
     <select value={adminSelectedId} onChange={event=>setAdminSelectedId(event.target.value)}><option value="">Seleccionar</option>
      {adminRestaurants.filter(r=>r.plan!=='LOCAL').map(r=><option key={r.id} value={r.id}>{r.name}</option>)}
     </select></label></section>}
    {controlSection==='settlements'&&commercial&&adminRestaurants.some(r=>r.id===adminSelectedId&&r.plan!=='LOCAL')&&
     <SettlementPanel key={'central-'+adminSelectedId} api={api} restaurant={adminSelectedId} central
      run={run} busy={busy} offline={offline} money={price} errorLabel={errorLabel}/>}
    {controlSection==='affiliationAudit'&&<section className="dvl-panel"><h2>Actividad de afiliación</h2>
     <Action kind="secondary" disabled={busy||offline}
      onClick={()=>run(async()=>{const data=await api.adminAudit();setAudit(data.events)},{refresh:false})}>Consultar actividad</Action>
     {audit&&<ul className="dvl-search-results">{audit.map(event=><li className="dvl-row" key={event.id}>
      <div><strong>{auditLabels[event.action]||event.action}</strong><small>{[event.actor_name,event.restaurant_name].filter(Boolean).join(' · ')}</small></div>
      <time dateTime={new Date(event.created_at*1000).toISOString()}>{new Date(event.created_at*1000).toLocaleString('es-HN')}</time>
     </li>)}</ul>}
     {audit?.length===0&&<p>Aún no hay actividad administrativa.</p>}
    </section>}
    </div>}
   <footer className="dvl-footer"><span className="dvl-powered">Powered by <img src={import.meta.env.BASE_URL+'file_00000000e77081fd8cf8ee8349e461b6.png'} alt="Nexora Systems" /></span><span>Acceso seguro · Dvolada Online</span></footer>
  </>}
  </main></div>;
}
