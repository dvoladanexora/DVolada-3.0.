import React,{useEffect,useMemo,useRef,useState} from 'react';
import {AlertCircle,ArrowLeft,ArrowRight,Bike,Check,CheckCheck,ChevronRight,Clock3,Eye,EyeOff,Headphones,History,MapPin,Navigation,Package,Phone,Plus,Route,Search,ShieldCheck,Store,Volume2,WifiOff,X} from 'lucide-react';
import CourierMap from './CourierMap.jsx';
import CourierGpsArrival from './CourierGpsArrival.jsx';
import CourierAcceptDialog from './CourierAcceptDialog.jsx';
import {DEMO_RIDERS,MAX_ACTIVE_DELIVERIES,courierQueues,courierPublicOrder,courierOrderCoords,courierRestaurantCoords,riderKey,riderIssueKey,buildCourierIssue,pinAttemptKey,sanitizePinAttempts,incrementPinAttempt,courierNextTask} from './courier-workflow.js';
import './courier-online.css';

const isOnline=()=>typeof navigator==='undefined'||navigator.onLine!==false;
const read=(key,fallback)=>{try{return JSON.parse(localStorage.getItem(key))??fallback}catch{return fallback}};
const persist=(key,value)=>{try{localStorage.setItem(key,JSON.stringify(value));return true}catch{return false}};
const readRiderIssues=id=>{const value=read(riderIssueKey(id),[]);return Array.isArray(value)?value.filter(i=>i&&typeof i==='object'&&i.courierId===id).slice(0,30):[]};
const visibleStatus={
 'Aceptado':'Aceptado en el restaurante',
 'Preparando':'Lo están preparando',
 'Listo':'Listo para recoger',
 'Recogido':'Recogido',
 'En camino':'En camino',
 'En ubicación':'En el destino',
 'Cancelación solicitada':'Cancelación en revisión',
 'Entregado':'Entregado',
 'Cancelado':'Cancelado',
 'Rechazado':'Rechazado',
};
const stamp=o=>{const value=o.courierAssignedAt||o.createdAt||o.date;const date=new Date(value||0);return Number.isNaN(date.getTime())?'Sin hora':date.toLocaleString('es-HN',{dateStyle:'short',timeStyle:'short'})};
const safeTel=n=>{const raw=String(n||'').trim(),digits=raw.replace(/\D/g,'');return /^\+?[0-9\s\-()]{8,25}$/.test(raw)&&digits.length>=8&&digits.length<=15?raw.replace(/[^+\d]/g,''):null};
const mapUrl=(address,coords)=>{
 const destination=coords?coords.lat+','+coords.lng:String(address||'').trim();
 return destination?'https://www.google.com/maps/dir/?api=1&destination='+encodeURIComponent(destination):null;
};
const money=n=>'L '+Number(n||0).toLocaleString('es-HN',{minimumFractionDigits:2,maximumFractionDigits:2});
const riderName=id=>DEMO_RIDERS.find(r=>r.id===id)?.name||'Repartidor de prueba';

function Progress({status}){
 const states=['Aceptado','Listo','Recogido','En camino','En ubicación','Entregado'];
 const normalized=status==='Preparando'||status==='Cancelación solicitada'?'Aceptado':status;
 const stage=states.indexOf(normalized),checked=stage>=0;
 return <div className="dv-rider-progress" aria-label={'Estado actual: '+(visibleStatus[status]||status)}>
  {['Aceptado','Listo','Recogido','En camino','Entregado'].map((s,i)=>{
   const step=states.indexOf(s);
   return <div key={s} className={checked&&stage>=step?'complete':''}><span>{checked&&stage>=step?<Check size={13}/>:i+1}</span><small>{s}</small></div>;
  })}
 </div>;
}

function OfferCard({order,place,canTake,onAccept,onDecline}){
 const itemCount=(Array.isArray(order.items)?order.items:[]).reduce((sum,item)=>sum+(Number(item.qty)||1),0);
 return <article className="dv-rider-offer-card">
  <div className="dv-rider-card-heading"><span className="dv-rider-order-tag"><Package size={15}/> {order.orderNo||order.id}</span><span className="dv-rider-status">{visibleStatus[order.status]||order.status}</span></div>
  <h3><Store size={19}/> {place?.name||order.placeName||'Restaurante'}</h3>
  <p><MapPin size={15}/> Punto de recogida: {place?.address||'Consultar con el restaurante'}</p>
  <div className="dv-rider-offer-facts"><span><Package size={16}/> {itemCount} producto(s)</span><span><Clock3 size={16}/> {stamp(order)}</span></div>
  <div className="dv-rider-offer-private"><ShieldCheck size={17}/> La dirección y el contacto del cliente se muestran después de aceptar.</div>
  <div className="dv-rider-offer-actions"><button type="button" className="dv-rider-muted" onClick={()=>onDecline(order)}><X size={17}/> Omitir oferta</button>
   <button type="button" className="dv-rider-primary" disabled={!canTake} onClick={()=>onAccept(order)}><Check size={17}/> Aceptar entrega</button>
  </div>
 </article>;
}
function IncidentForm({order,onSave,onClose}){
 const [message,setMessage]=useState(''),[error,setError]=useState('');
 return <form className="dv-rider-incident" onSubmit={e=>{e.preventDefault();try{onSave(order,message);onClose()}catch(ex){setError(ex.message)}}}>
  <label htmlFor={'dv-incident-'+order.id}>¿Qué inconveniente encontraste?</label>
  <textarea id={'dv-incident-'+order.id} value={message} maxLength={300} onChange={e=>{setMessage(e.target.value);setError('')}} rows={3} placeholder="Ej. No puedo localizar al cliente, tuve una avería…"/>
  <small>{message.length}/300 · Esta nota se guarda localmente; no se envía al restaurante.</small>
  {error&&<p className="dv-rider-input-error" role="alert">{error}</p>}
  <div className="dv-rider-button-row"><button className="dv-rider-muted" type="button" onClick={onClose}>Cancelar</button><button className="dv-rider-primary" type="submit">Guardar incidencia local</button></div>
 </form>;
}
function ActiveCard({order,place,onAction,onIssue,onPinError,onPinSuccess,failedPinAttempts=0}){
 const [pin,setPin]=useState(''),[showPin,setShowPin]=useState(false),[showMap,setShowMap]=useState(false),[showArrival,setShowArrival]=useState(false),[showIncident,setShowIncident]=useState(false);
 const customerCoords=courierOrderCoords(order),restaurantCoords=courierRestaurantCoords(place);
 const restaurantLink=mapUrl(place?.address||place?.name,restaurantCoords);
 const customerLink=mapUrl(order.address,customerCoords),restaurantPhone=safeTel(place?.phone),customerPhone=safeTel(order.phone);
 const issue=()=>setShowIncident(v=>!v);
 return <article className="dv-rider-active-card">
  <div className="dv-rider-card-heading"><span className="dv-rider-order-tag"><Bike size={17}/> {order.orderNo||order.id}</span><span className={'dv-rider-status dv-rider-status-'+(order.status==='Cancelación solicitada'?'hold':'active')}>{visibleStatus[order.status]||order.status}</span></div>
  <h3>{place?.name||order.placeName||'Restaurante'}</h3>
  <p className="dv-rider-assigned-time"><Clock3 size={15}/> Asignado: {stamp(order)}</p>
  <Progress status={order.status}/>
  <div className="dv-rider-locations">
   <div><span><Store size={16}/> RECOGIDA</span><strong>{place?.name||order.placeName||'Restaurante'}</strong><p>{place?.address||'Ubicación del restaurante pendiente'}</p>
    <div className="dv-rider-contact">{restaurantLink&&<a href={restaurantLink} target="_blank" rel="noopener noreferrer"><Navigation size={15}/> Ruta al restaurante</a>}{restaurantPhone&&<a href={'tel:'+restaurantPhone}><Phone size={15}/> Llamar</a>}</div>
   </div>
   <div><span><MapPin size={16}/> ENTREGA</span><strong>{order.name||'Cliente'}</strong><p>{order.address||'Dirección pendiente de confirmar'}</p>
    <div className="dv-rider-contact">{customerLink&&<a href={customerLink} target="_blank" rel="noopener noreferrer"><Navigation size={15}/> Ruta al cliente</a>}{customerPhone&&<a href={'tel:'+customerPhone}><Phone size={15}/> Llamar</a>}</div>
   </div>
  </div>
  <div className="dv-rider-products"><strong>Contenido de la orden</strong><ul>{(Array.isArray(order.items)?order.items:[]).map((item,i)=><li key={item.id||i}><span>{Math.max(1,Number(item.qty)||1)}×</span> {item.name||'Producto'}</li>)}</ul>{order.notes&&<p><AlertCircle size={15}/> {order.notes}</p>}</div>
  <div className="dv-rider-payment"><div><span><ShieldCheck size={16}/> INDICACIONES DE PAGO</span><strong>{order.payment||'Por confirmar con el restaurante'}</strong></div>
   {Number.isFinite(Number(order.total))&&Number(order.total)>0&&<div><span>TOTAL INDICADO EN PEDIDO</span><strong>{money(order.total)}</strong></div>}
   <small>Importe informativo de la demostración. No cobrés ni confirmés un pago sin las instrucciones del restaurante y el sistema real.</small>
  </div>
  {order.status==='Cancelación solicitada'&&<div className="dv-rider-hold" role="status"><AlertCircle size={17}/> El restaurante está revisando una cancelación. No avancés la entrega hasta que se resuelva.</div>}
  {['Aceptado','Preparando'].includes(order.status)&&<div className="dv-rider-wait"><Clock3 size={18}/> El restaurante sigue preparando la comida. Cuando la marque como lista, podrás confirmar la recogida.</div>}
  {order.status==='Listo'&&<button type="button" className="dv-rider-next" onClick={()=>onAction(order,'pickup')}><Package size={19}/> Confirmar que recogí el pedido <ArrowRight size={17}/></button>}
  {order.status==='Recogido'&&<button type="button" className="dv-rider-next" onClick={()=>onAction(order,'route')}><Route size={19}/> Iniciar recorrido <ArrowRight size={17}/></button>}
  {order.status==='En camino'&&<div className="dv-rider-arrival">
   <button type="button" className="dv-rider-next" onClick={()=>setShowArrival(v=>!v)}><MapPin size={18}/> {showArrival?'Cerrar comprobación GPS':'Confirmar llegada al destino'} <ChevronRight size={17}/></button>
   {showArrival&&(customerCoords?<CourierGpsArrival order={order} onArrive={()=>{const result=onAction(order,'arrive',{gpsVerified:true});if(result?.ok)setShowArrival(false)}}/>:<div className="dv-rider-gps-warning"><AlertCircle size={17}/> Este pedido no tiene coordenadas verificadas. Para las pruebas podés simular la llegada; con clientes reales se requiere confirmar la dirección y el método de llegada.</div>)}
   {import.meta.env.DEV&&<button type="button" className="dv-rider-demo-sim" onClick={()=>onAction(order,'arrive',{demoSimulation:true})}>Simular llegada · SOLO DEMO LOCAL</button>}
  </div>}
  {order.status==='En ubicación'&&<div className="dv-rider-pin"><div><ShieldCheck size={19}/><strong>Confirmación de entrega</strong></div><p>Pedile al cliente su PIN de seis dígitos. El sistema no te lo muestra.</p>
   <label htmlFor={'dv-rider-pin-'+order.id}>PIN del cliente</label>
   <input id={'dv-rider-pin-'+order.id} type={showPin?'text':'password'} inputMode="numeric" pattern="[0-9]*" maxLength={6} autoComplete="off" value={pin} disabled={failedPinAttempts>=3} onChange={e=>setPin(e.target.value.replace(/\D/g,'').slice(0,6))} placeholder="● ● ● ● ● ●" aria-label="PIN de seis dígitos"/><button type="button" className="dv-rider-pin-visibility" aria-pressed={showPin} onClick={()=>setShowPin(v=>!v)}>{showPin?<EyeOff size={16}/>:<Eye size={16}/>} {showPin?'Ocultar PIN':'Mostrar PIN'}</button>
   {failedPinAttempts>0&&<p className="dv-rider-input-error">Intentos incorrectos: {failedPinAttempts} de 3</p>}
   {failedPinAttempts>=3?<p className="dv-rider-hold">Se bloqueó la verificación en esta sesión de prueba. Reportá una incidencia; Work implementará recuperación segura.</p>:<button type="button" className="dv-rider-next" disabled={pin.length!==6} onClick={()=>{const result=onAction(order,'deliver',{pin});if(result?.ok){setPin('');onPinSuccess(order)}else if(String(result?.reason||'').includes('PIN incorrecto')){onPinError(order)}}}><CheckCheck size={19}/> Verificar PIN y finalizar entrega</button>}
  </div>}
  <div className="dv-rider-secondary-actions"><button type="button" onClick={()=>setShowMap(v=>!v)}><MapPin size={16}/> {showMap?'Cerrar mapa':'Ver mapa y ruta'}</button><button type="button" onClick={issue}><Headphones size={16}/> Reportar problema</button></div>
  {showMap&&<CourierMap restaurant={restaurantCoords} customer={customerCoords} orderId={order.orderNo||order.id}/>}
  {showIncident&&<IncidentForm order={order} onSave={onIssue} onClose={()=>setShowIncident(false)}/>}
 </article>;
}

export default function CourierOnlineDashboard({orders=[],places=[],courierId='demo-rider-1',onAction=()=>({ok:false}),onSeed=()=>{},onLogout=()=>{}}){
 const [tab,setTab]=useState(()=>courierQueues(orders,courierId).active.length?'active':'offers'),[online,setOnline]=useState(()=>read(riderKey(courierId),false)===true),[query,setQuery]=useState('');
 const [message,setMessage]=useState(''),[issues,setIssues]=useState(()=>readRiderIssues(courierId));
 const [pinFailures,setPinFailures]=useState(()=>sanitizePinAttempts(read(pinAttemptKey(courierId),{}))),[audioEnabled,setAudioEnabled]=useState(false);
 const [pendingAccept,setPendingAccept]=useState(null);
 const audioRef=useRef(null),lastOffers=useRef(null),messageRef=useRef(null);
 const [network,setNetwork]=useState(isOnline);
 useEffect(()=>{setOnline(read(riderKey(courierId),false)===true);setIssues(readRiderIssues(courierId));setTab(courierQueues(orders,courierId).active.length?'active':'offers');setPinFailures(sanitizePinAttempts(read(pinAttemptKey(courierId),{})));setPendingAccept(null);lastOffers.current=null},[courierId]);
 useEffect(()=>{if(!persist(riderKey(courierId),online))setMessage('No se pudo guardar la disponibilidad en este navegador.')},[online,courierId]);
 useEffect(()=>{const changed=()=>setNetwork(isOnline());window.addEventListener('online',changed);window.addEventListener('offline',changed);return()=>{window.removeEventListener('online',changed);window.removeEventListener('offline',changed)}},[]);
 const data=useMemo(()=>courierQueues(orders,courierId),[orders,courierId]);
 const offers=data.offers.filter(o=>!query.trim()||String(o.orderNo||o.id||'').toLocaleLowerCase('es').includes(query.toLocaleLowerCase('es'))||String(o.placeName||'').toLocaleLowerCase('es').includes(query.toLocaleLowerCase('es')));
 const active=data.active.map(courierPublicOrder);
 const history=data.history.map(courierPublicOrder);
 const alert=t=>{setMessage(t);messageRef.current?.focus?.()};
 const audioTest=async()=>{
  try{const C=window.AudioContext||window.webkitAudioContext;if(!C)throw Error('Audio no compatible');
   audioRef.current??=new C();await audioRef.current.resume();
   const ctx=audioRef.current;
   [880,675].forEach((hz,i)=>{const osc=ctx.createOscillator(),vol=ctx.createGain(),start=ctx.currentTime+i*.19;osc.type='sine';osc.frequency.value=hz;vol.gain.setValueAtTime(.0001,start);vol.gain.exponentialRampToValueAtTime(.09,start+.025);vol.gain.exponentialRampToValueAtTime(.0001,start+.15);osc.connect(vol);vol.connect(ctx.destination);osc.start(start);osc.stop(start+.17)});
   setAudioEnabled(true);setMessage('Bip-bip de prueba activado para esta sesión.');
  }catch{setMessage('No se pudo reproducir el sonido. Revisá el volumen y el navegador.')};
 };
 useEffect(()=>{
  const current=new Set(data.offers.map(o=>String(o.id)));
  if(lastOffers.current&&audioEnabled&&current.size>0&&[...current].some(id=>!lastOffers.current.has(id))&&document.visibilityState==='visible'&&audioRef.current?.state==='running'){
   try{const ctx=audioRef.current,osc=ctx.createOscillator(),gain=ctx.createGain();osc.frequency.value=825;gain.gain.value=.08;osc.connect(gain);gain.connect(ctx.destination);osc.start();osc.stop(ctx.currentTime+.12)}catch{}
  }
  lastOffers.current=current;
 },[data.offers,audioEnabled]);
 useEffect(()=>()=>{audioRef.current?.close?.().catch?.(()=>{})},[]);
 const run=(order,action,opts={})=>{
  if(!network){alert('Sin conexión. No se pueden actualizar entregas en este momento.');return {ok:false}}
  const result=onAction(order.id,action,courierId,{...opts,online});
  if(!result?.ok){alert(result?.reason||'No se pudo actualizar esta entrega.');return result}
  alert(action==='accept'?'Entrega asignada a tu panel.':action==='decline'?'Oferta omitida para esta identidad.':action==='pickup'?'Recogida registrada.':action==='route'?'Recorrido iniciado.':action==='arrive'?'Llegada registrada en la demostración.':'Entrega confirmada.');
  if(action==='accept')setTab('active');
  return result;
 };
 const recordIssue=(order,note)=>{
  const item=buildCourierIssue(order,courierId,note),next=[item,...issues].slice(0,30);
  if(!persist(riderIssueKey(courierId),next))throw Error('El dispositivo no pudo guardar la nota.');
  setIssues(next);alert('Incidencia guardada SOLO en este dispositivo; no se envió al negocio.');
 };
 const failedPin=order=>setPinFailures(state=>{
  const next=incrementPinAttempt(state,order.id);
  if(!persist(pinAttemptKey(courierId),next))setMessage('El dispositivo no guardó los intentos de PIN. No es seguro para uso real.');
  return next;
 });
 const pinSuccess=order=>setPinFailures(state=>{
  const next={...state};delete next[String(order.id)];
  persist(pinAttemptKey(courierId),next);return next;
 });
 const placeOf=order=>places.find(p=>String(p.id)===String(order.placeId));
 const delivered=history.filter(o=>o.status==='Entregado').length;
 const chosenOffer=pendingAccept===null?null:data.offers.find(o=>String(o.id)===String(pendingAccept));
 const nextTask=courierNextTask(orders,courierId);
 return <section className="shell section page-section dv-rider-app" aria-labelledby="dv-rider-main-title">
  <header className="dv-rider-hero"><div className="dv-rider-hero-glow" aria-hidden="true"/><div className="dv-rider-hero-head"><span className="dv-rider-eyebrow"><Bike size={16}/> DVOLADA ONLINE · REPARTIDOR INDEPENDIENTE</span><button type="button" className="dv-rider-exit" onClick={onLogout}><ArrowLeft size={17}/> Salir</button></div>
   <div className="dv-rider-hero-core"><div><h1 id="dv-rider-main-title">Tu ruta. Tu ritmo.</h1><p>¡Hola, {riderName(courierId)}! Organizá tus entregas sin perderte entre pantallas.</p></div><div className="dv-rider-availability"><div><strong>{online?'Disponible para pedidos':'Fuera de servicio'}</strong><small>{online?'Podés aceptar nuevas ofertas':'No recibirás asignaciones nuevas'}</small></div><label className="dv-rider-switch" aria-label="Disponibilidad del repartidor"><input type="checkbox" checked={online} onChange={e=>setOnline(e.target.checked)}/><span/></label></div></div>
  </header>
  <div className="dv-rider-kpis"><div><span><Package size={17}/> Disponibles</span><strong>{data.offers.length}</strong><small>Ofertas de restaurantes</small></div><div><span><Bike size={17}/> En mis manos</span><strong>{data.active.length} <em>/ {MAX_ACTIVE_DELIVERIES}</em></strong><small>{data.slotsRemaining} cupo(s) libres</small></div><div><span><CheckCheck size={17}/> Completadas</span><strong>{delivered}</strong><small>Historial de esta identidad</small></div></div>
  {nextTask&&<div className="dv-rider-next-task"><span className="dv-rider-next-task-symbol"><Bike size={21}/></span><div><span>SIGUIENTE PASO</span><strong>{nextTask.next}</strong><small>{nextTask.orderNo} · {nextTask.restaurant}</small></div><button type="button" onClick={()=>setTab('active')}>Abrir entrega <ArrowRight size={16}/></button></div>}
  <div className="dv-rider-demo-hint"><AlertCircle size={19}/><span><strong>Modo de prueba local.</strong> Este panel no recibe pedidos de otros teléfonos ni asignaciones reales. Los pagos, la verificación de identidad y la comunicación automática se integrarán con el servidor.</span></div>
  {!network&&<div className="dv-rider-network-warning" role="alert"><WifiOff size={17}/> Sin conexión a internet: acciones y rutas deshabilitadas.</div>}
  <div className="dv-rider-tools"><button type="button" onClick={audioTest} className="dv-rider-sound"><Volume2 size={18}/> {audioEnabled?'Probar bip-bip':'Activar y probar sonido'}</button>
   {import.meta.env.DEV&&<button type="button" onClick={onSeed} className="dv-rider-test-seed"><Plus size={18}/> Crear dos pedidos ficticios</button>}
  </div>
  {message&&<div className="dv-rider-message" role="status" tabIndex={-1} ref={messageRef}>{message}<button type="button" aria-label="Cerrar aviso" onClick={()=>setMessage('')}><X size={16}/></button></div>}
  <nav className="dv-rider-tabs" aria-label="Secciones de repartidor">{[
   ['offers','Disponibles',Package,data.offers.length],
   ['active','Mis entregas',Bike,data.active.length],
   ['history','Historial',History,data.history.length],
  ].map(([key,label,Icon,count])=><button type="button" key={key} className={tab===key?'selected':''} aria-current={tab===key?'page':undefined} onClick={()=>setTab(key)}><Icon size={19}/><span>{label}</span><b>{count}</b></button>)}</nav>
  {tab==='offers'&&<><div className="dv-rider-section-top"><div><span className="dv-rider-eyebrow">NUEVAS OPORTUNIDADES</span><h2>Pedidos disponibles</h2><p>Solo aparecen órdenes que el restaurante ya aceptó y que aún no tienen repartidor.</p></div><label className="dv-rider-search"><Search size={18}/><input aria-label="Buscar ofertas" value={query} onChange={e=>setQuery(e.target.value)} placeholder="Número o restaurante"/></label></div>
   {!online&&<p className="dv-rider-inline-note"><AlertCircle size={16}/> Activá «Disponible para pedidos» para aceptar.</p>}
   {data.slotsRemaining===0&&<p className="dv-rider-inline-note"><Bike size={16}/> Tenés dos entregas en curso. Terminá alguna para aceptar otra.</p>}
   <div className="dv-rider-offers">{offers.length?offers.map(o=><OfferCard key={o.id} order={o} place={placeOf(o)} canTake={online&&network&&data.slotsRemaining>0} onAccept={x=>setPendingAccept(String(x.id))} onDecline={x=>run(x,'decline')}/>):<div className="dv-rider-empty"><Package size={33}/><h3>No hay ofertas para mostrar</h3><p>Cuando un restaurante acepte un pedido disponible, aparecerá aquí. Probá también limpiar la búsqueda.</p></div>}</div>
  </>}
  {tab==='active'&&<><div className="dv-rider-section-top"><div><span className="dv-rider-eyebrow">TU JORNADA</span><h2>Mis entregas activas</h2><p>Primero recogé, después salí a ruta y finalizá con el PIN del cliente.</p></div><span className="dv-rider-counter"><Bike size={16}/> {active.length} / {MAX_ACTIVE_DELIVERIES}</span></div>
    <div className="dv-rider-active-list">{active.length?active.map(o=><ActiveCard key={o.id} order={o} place={placeOf(o)} onAction={run} onIssue={recordIssue} onPinError={failedPin} onPinSuccess={pinSuccess} failedPinAttempts={pinFailures[o.id]||0}/>):<div className="dv-rider-empty"><CheckCheck size={35}/><h3>¡Todo al día!</h3><p>No tenés entregas en curso. Cuando aceptés una oferta aparecerá aquí.</p><button type="button" className="dv-rider-primary" onClick={()=>setTab('offers')}>Ver pedidos disponibles <ArrowRight size={17}/></button></div>}</div>
  </>}
  {tab==='history'&&<><div className="dv-rider-section-top"><div><span className="dv-rider-eyebrow">TU ACTIVIDAD</span><h2>Historial de entregas</h2><p>Registro local de tus entregas de demostración. No incluye ingresos, comisiones ni pagos inventados.</p></div></div>
   <div className="dv-rider-history">{history.length?history.map(o=><article key={o.id}><span className="dv-rider-history-icon"><CheckCheck size={20}/></span><div><strong>{o.orderNo||o.id} · {o.placeName||'Restaurante'}</strong><small>{stamp(o)}</small></div><span className="dv-rider-history-state">{visibleStatus[o.status]||o.status}</span></article>):<div className="dv-rider-empty"><History size={34}/><h3>Sin entregas anteriores</h3><p>Aquí se guardarán las órdenes finalizadas de esta identidad de prueba.</p></div>}</div>
   {issues.length>0&&<div className="dv-rider-issue-history"><h3><AlertCircle size={17}/> Notas locales de incidencias</h3>{issues.slice(0,5).map(i=><div key={i.id}><strong>Orden {i.orderId}</strong><p>{i.note}</p><small>{i.status}</small></div>)}</div>}
  </>}
  {pendingAccept!==null&&<CourierAcceptDialog order={chosenOffer||null} place={chosenOffer?placeOf(chosenOffer):null} slots={data.slotsRemaining} canAccept={online&&network&&data.slotsRemaining>0} onClose={()=>setPendingAccept(null)} onConfirm={()=>{if(!chosenOffer){alert('La oferta ya no está disponible.');return}const result=run(chosenOffer,'accept');if(result?.ok)setPendingAccept(null)}}/>}
 </section>;
}
