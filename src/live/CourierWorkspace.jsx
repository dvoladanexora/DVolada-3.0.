import React,{useEffect,useRef,useState} from 'react';

const labels={Listo:'Confirmar recogida',Recogido:'Salir a entregar','En camino':'Confirmar llegada'};
const next={Listo:'Recogido',Recogido:'En camino','En camino':'En ubicación'};
const settlements={pending:'Pendiente',calculated:'Calculada',approved:'Aprobada',paid:'Pagada'};
const transportLabels={motorcycle:'Motocicleta',car:'Automóvil',bicycle:'Bicicleta',walking:'A pie',other:'Otro'};
const date=value=>new Date(value*1000).toLocaleString('es-HN',{timeZone:'America/Tegucigalpa'});
const mapUrl=destination=>'https://www.google.com/maps/dir/?'+new URLSearchParams({api:'1',destination});
function Button({secondary=false,...props}){
 return <button type="button" className={'dvl-action'+(secondary?' secondary':'')} {...props}/>;
}

export function CourierApplication({api,busy,offline,account,run}){
 const [requested,setRequested]=useState(null);
 useEffect(()=>{
  if(offline)return;
  let active=true;
  api.courierApplication(false).then(data=>{if(active)setRequested(data.requested&&!data.needsDetails)}).catch(()=>{});
  return()=>{active=false};
 },[api,account,offline]);
 if(requested===null)return null;
 return <details className="dvl-panel dvl-span">
  <summary>Trabajá como repartidor</summary>
  {requested?<p role="status">Solicitud enviada. Cuando el Centro de Control habilite tu cuenta, volvé a iniciar sesión.</p>:
   <form className="dvl-stack" onSubmit={async event=>{
    event.preventDefault();
    const values=Object.fromEntries(new FormData(event.currentTarget));
    const response=await run(()=>api.courierApplication({...values,phone:'+504'+values.phone}),{refresh:false});
    if(response)setRequested(response.requested&&!response.needsDetails);
   }}>
    <label>Teléfono o WhatsApp (+504)<input name="phone" required inputMode="numeric" autoComplete="tel-national" pattern="[0-9]{8}" maxLength={8}/></label>
    <label>Medio de transporte<select name="transport">{Object.entries(transportLabels).map(([value,label])=><option key={value} value={value}>{label}</option>)}</select></label>
    <label>Zona de cobertura<input name="zone" required minLength={2} maxLength={100}/></label>
    <button className="dvl-action" disabled={busy||offline}>Solicitar acceso de repartidor</button>
   </form>}
 </details>;
}

export function CourierApplications({api,run,busy,offline,errorLabel}){
 const [applications,setApplications]=useState(null),[error,setError]=useState('');
 useEffect(()=>{
  if(offline)return;
  let active=true;
  api.courierApplications().then(data=>{if(active){setApplications(data.applications);setError('')}})
   .catch(err=>{if(active)setError(errorLabel(err))});
  return()=>{active=false};
 },[api,offline,errorLabel]);
 return <section className="dvl-panel dvl-stack">
  <h2>Solicitudes de repartidores</h2>
  {error&&<p role="alert">{error}</p>}
  {applications?.length===0&&<p>No hay solicitudes pendientes.</p>}
  {applications?.map(person=><div className="dvl-row" key={person.user_id}>
   <span>{person.display_name} · {date(person.created_at)}{person.service_zone&&<> · {transportLabels[person.transport]} · {person.service_zone}</>}</span>
   {person.contact_phone&&<a href={'https://wa.me/'+person.contact_phone.slice(1)} target="_blank" rel="noreferrer">WhatsApp</a>}
   <Button secondary disabled={busy||offline} onClick={async()=>{
    const done=await run(()=>api.adminEnrollCourier(person.user_id,person.created_at));
    if(done)setApplications(rows=>rows.filter(row=>row.user_id!==person.user_id));
   }}>Habilitar cuenta</Button>
   <Button secondary disabled={busy||offline} onClick={async()=>{
    const done=await run(()=>api.rejectCourierApplication(person.user_id,person.created_at));
    if(done)setApplications(rows=>rows.filter(row=>row.user_id!==person.user_id));
   }}>Rechazar solicitud</Button>
  </div>)}
 </section>;
}

function CourierOrder({order,api,busy,offline,profile,action,openChat}){
 const [pin,setPin]=useState('');
 const retry=useRef(new Map());
 const disabled=busy||offline;
 const accepted=order.courierResponse==='accepted';
 const coords=Number.isFinite(order.pickupLatitude)&&Number.isFinite(order.pickupLongitude);
 const pickup=coords?order.pickupLatitude+','+order.pickupLongitude:order.pickupAddress?.trim();
 async function mutate(name,invoke){
  const old=retry.current.get(name);
  const key=old?.version===order.version?old.key:crypto.randomUUID();
  retry.current.set(name,{key,version:order.version});
  let problem;
  const result=await action(async()=>{try{return await invoke(key)}catch(error){problem=error;throw error}});
  if(result||problem?.status>0)retry.current.delete(name);
  if(result&&name==='pin')setPin('');
 }
 return <article className="dvl-panel dvl-stack">
  <div className="dvl-row"><strong>{order.orderNumber}</strong><span>{order.status}</span></div>
  <span>{order.restaurantName}</span>
  {!accepted?<><p>La ubicación de recogida y la dirección de entrega se muestran después de aceptar.</p>
   <small>Oferta vigente hasta {date(order.offerExpiresAt)}</small>
   <div className="dvl-inline">
    <Button disabled={disabled||!profile?.available} onClick={()=>mutate('accept',key=>api.courierOffer(order,'accept',key))}>Aceptar pedido</Button>
    <Button secondary disabled={disabled} onClick={()=>mutate('reject',key=>api.courierOffer(order,'reject',key))}>Rechazar</Button>
   </div>
  </>:<>
   <div className="dvl-stack">
    <span>Recogida · {order.pickupAddress||'Consultá la ubicación con el restaurante'}</span>
    <span>Entrega · {order.deliveryAddress||'Consultá la dirección con el cliente'}</span>
    {pickup&&!offline&&<a className="dvl-action secondary" href={mapUrl(pickup)} target="_blank" rel="noopener noreferrer">Mapa de recogida</a>}
    {order.deliveryAddress&&!offline&&<a className="dvl-action secondary" href={mapUrl(order.deliveryAddress)} target="_blank" rel="noopener noreferrer">Navegar a la entrega</a>}
    <small>Si el mapa no encuentra la ubicación, confirmala en el chat antes de salir.</small>
   </div>
   <div className="dvl-inline">
    <Button secondary disabled={offline} onClick={()=>openChat(order,'courier')}>Chat con cliente</Button>
    <Button secondary disabled={offline} onClick={()=>openChat(order,'dispatch')}>Chat con restaurante</Button>
   </div>
   {next[order.status]&&<Button disabled={disabled} onClick={()=>mutate(order.status,key=>api.courierStatus(order,next[order.status],key))}>
    {labels[order.status]}
   </Button>}
   {order.status==='En ubicación'&&<form className="dvl-stack" onSubmit={event=>{
    event.preventDefault();
    if(!disabled&&pin.length===6)mutate('pin',key=>api.courierDeliver(order,pin,key));
   }}>
    <label>PIN del cliente<input inputMode="numeric" type="password" autoComplete="off" maxLength={6}
     value={pin} onChange={event=>{setPin(event.target.value.replace(/\D/g,'').slice(0,6));retry.current.delete('pin')}}/></label>
    <button className="dvl-action" disabled={disabled||pin.length!==6}>Confirmar entrega</button>
   </form>}
  </>}
 </article>;
}

function exportPeriods(periods){
 const csvField=value=> '"'+String(value).replace(/^[\s]*[=+@-]/,"'$&").replaceAll('"','""')+'"';
 const amount=value=>(value/100).toFixed(2);
 const header=['Restaurante','Desde','Hasta','Estado','Ganancias (L)','Ajustes (L)'];
 const rows=periods.map(period=>[csvField(period.restaurantName),csvField(date(period.periodFrom)),csvField(date(period.periodUntil)),
  settlements[period.settlementStatus],amount(period.earningsMinor),amount(period.adjustmentMinor)]);
 const terms=[header,...rows].map(row=>row.join(',')).join('\r\n');
 const url=URL.createObjectURL(new Blob(['\uFEFF'+terms],{type:'text/csv;charset=utf-8'}));
 const link=document.createElement('a');link.href=url;link.download='mis-liquidaciones.csv';link.click();
 setTimeout(()=>URL.revokeObjectURL(url),1000);
}

function CourierHistory({api,run,busy,offline,money,openChat}){
 const [data,setData]=useState(null);
 async function load(cursor){
  const result=await run(()=>api.courierHistory(cursor),{refresh:false});
  if(result)setData(prev=>cursor?{...result,orders:[...prev.orders,...result.orders]}:result);
 }
 return <section className="dvl-panel dvl-stack" id="historial-entregas">
  <h2>Entregas y liquidaciones</h2>
  <Button secondary disabled={busy||offline} onClick={()=>load()}>Consultar historial y ganancias</Button>
  {data?.commissions&&<div className="dvl-panel dvl-stack"><h3>Comisiones Dvolada</h3><p>L 5 por pedido entregado. Sin cuota mensual ni débito automático.</p><div className="dvl-grid"><p>Entregas con comisión: <strong>{data.commissions.deliveries}</strong></p><p>Total registrado: <strong>{money(data.commissions.chargedMinor)}</strong></p><p>Pagado: <strong>{money(data.commissions.paidMinor)}</strong></p><p>Saldo pendiente: <strong>{money(data.commissions.outstandingMinor)}</strong></p></div><small>La comisión se registra por separado de tus liquidaciones de envíos.</small></div>}
  {data?.orders.length===0&&<p>No hay entregas completadas.</p>}
  {data?.orders.map(order=><article className="dvl-stack" key={order.id}>
   <strong>{order.orderNumber} · {order.restaurantName}</strong>
   <span>{date(order.deliveredAt)} · {order.earningsMinor===null?'Pendiente de liquidación':money(order.earningsMinor)}</span>
   {order.commissionMinor!=null&&<small>Comisión: {money(order.commissionMinor)} · {order.commissionPaidMinor===order.commissionMinor?'Pagada':'Pendiente '+money(order.commissionMinor-order.commissionPaidMinor)}</small>}
   <div className="dvl-inline">
    <Button secondary disabled={offline} onClick={()=>openChat(order,'courier')}>Conversación con cliente</Button>
    <Button secondary disabled={offline} onClick={()=>openChat(order,'dispatch')}>Conversación con restaurante</Button>
   </div>
  </article>)}
  {data?.nextCursor&&<Button secondary disabled={busy||offline} onClick={()=>load(data.nextCursor)}>Cargar más entregas</Button>}
  {!!data?.periods.length&&<details><summary>Resumen por período</summary>
   <Button secondary onClick={()=>exportPeriods(data.periods)}>Exportar liquidaciones visibles</Button>
   <ul>{data.periods.map(period=><li key={period.id}>{period.restaurantName} · {date(period.periodFrom)} — {date(period.periodUntil)} ·
    {' '+settlements[period.settlementStatus]} · {money(period.earningsMinor)}
    {!!period.adjustmentMinor&&' · ajustes '+money(period.adjustmentMinor)}</li>)}</ul>
  </details>}
 </section>;
}

export function CourierConsole({api,profile,orders,busy,offline,action,run,money,openChat,endSession}){
 const [confirm,setConfirm]=useState(false);
 const booked=orders.length;
 const status=offline?'Sin conexión':!profile?'Consultando disponibilidad…':
  !profile.available?'Desconectado':booked>=profile.capacity?'Ocupado':'Disponible';
 return <div className="dvl-stack">
  <section className="dvl-panel dvl-stack" id="entregas"><h2>Mis entregas</h2>
   <p role="status">{status}{profile&&' · '+booked+' de '+profile.capacity+' espacios ocupados'}</p>
   {profile&&<Button disabled={busy||offline} onClick={()=>action(()=>api.courierAvailability(!profile.available))}>
    {profile.available?'Dejar de recibir ofertas':'Conectarme para recibir ofertas'}
   </Button>}
   <small>Podés completar pedidos ya aceptados aunque dejés de recibir ofertas.</small>
  </section>
  <div className="dvl-grid">{orders.map(order=><CourierOrder key={order.id} {...{order,api,busy,offline,profile,action,openChat}}/>)}</div>
  {!orders.length&&<p>Sin pedidos asignados.</p>}
  <CourierHistory {...{api,run,busy,offline,money,openChat}}/>
  <details className="dvl-panel"><summary>Sesiones de la cuenta</summary>
   {!confirm?<Button secondary disabled={busy||offline} onClick={()=>setConfirm(true)}>Cerrar todas mis sesiones</Button>:
    <div className="dvl-inline">
     <Button disabled={busy||offline} onClick={async()=>{
      if(await run(()=>api.revokeCourierSessions(),{refresh:false}))endSession();
     }}>Confirmar cierre de todas las sesiones</Button>
     <Button secondary onClick={()=>setConfirm(false)}>Cancelar</Button>
    </div>}
  </details>
 </div>;
}
