import React,{useEffect,useState} from 'react';

const roles={manager:'Gerencia',kitchen:'Cocina',cashier:'Caja'};
const statuses={pending:'Pendiente',calculated:'Calculada',approved:'Aprobada',paid:'Pagada'};
const methods={cash:'Efectivo',transfer:'Transferencia',external_card:'Tarjeta externa'};
const events={staff_invited:'Invitación emitida',staff_claimed:'Invitación activada',staff_reset:'Acceso restablecido',
 staff_revoked:'Sesiones revocadas',staff_enabled:'Cuenta activada',staff_disabled:'Cuenta desactivada',staff_role_changed:'Rol actualizado'};
const date=seconds=>new Date(seconds*1000).toLocaleString('es-HN',{timeZone:'America/Tegucigalpa'});
const epoch=value=>Math.floor(Date.parse(value+'-06:00')/1000);
const cents=value=>Math.round(Number(value)*100);

function RoleOptions(){
 return Object.entries(roles).map(([value,label])=><option key={value} value={value}>{label}</option>);
}

function Button({children,...props}){
 return <button type="button" className="dvl-action secondary" {...props}>{children}</button>;
}

export function StaffSecret({code,expires,close,issued=false}){
 const [copied,setCopied]=useState(false);
 return <div className="dvl-panel dvl-stack" role="status">
  <strong>{issued?'Tu código personal para iniciar sesión':'Código de invitación de un solo uso'}</strong>
  <span>{issued?'Guardalo en un lugar seguro. Solo se muestra esta vez.':'Compartilo por un canal privado con la persona autorizada.'}</span>
  <code style={{overflowWrap:'anywhere'}}>{code}</code>
  {expires&&<span>Vence el {date(expires)} (Honduras)</span>}
  <div className="dvl-inline">
   <Button onClick={async()=>{try{await navigator.clipboard.writeText(code);setCopied(true)}catch{setCopied(false)}}}>
    {copied?'Copiado':'Copiar código'}
   </Button>
   <Button onClick={close}>Cerrar código</Button>
  </div>
 </div>;
}

export function StaffSignIn({authenticate,disabled}){
 const [claim,setClaim]=useState(false),[code,setCode]=useState('');
 return <details className="dvl-panel">
  <summary>Acceso de personal del restaurante</summary>
  <form className="dvl-stack" onSubmit={event=>{
   event.preventDefault();
   if(disabled||code.trim().length!==43)return;
   authenticate(claim?'claim':'login',code.trim());
   setCode('');
  }}>
   <label>Tipo de acceso<select value={claim?'claim':'login'} onChange={event=>{setClaim(event.target.value==='claim');setCode('')}}>
    <option value="login">Iniciar sesión</option>
    <option value="claim">Aceptar invitación</option>
   </select></label>
   <label>{claim?'Código de invitación':'Código personal'}<input type="password" autoComplete="off" maxLength={43}
    value={code} onChange={event=>setCode(event.target.value)} required/></label>
   <button className="dvl-action" disabled={disabled||code.trim().length!==43}>{claim?'Activar acceso':'Ingresar como personal'}</button>
  </form>
 </details>;
}

export function ManageStaffAccess({api,restaurant,run,busy,offline,errorLabel}){
 const [data,setData]=useState(null),[error,setError]=useState(''),[invite,setInvite]=useState(null);
 const [name,setName]=useState(''),[role,setRole]=useState('kitchen');
 const disabled=busy||offline;
 useEffect(()=>{
  if(offline)return;
  let active=true;
  api.staffAccess(restaurant).then(result=>{if(active){setData(result);setError('')}})
   .catch(err=>{if(active)setError(errorLabel(err))});
  return()=>{active=false};
 },[api,restaurant,offline,errorLabel]);
 async function save(user,action,body){
  const result=await run(()=>api.staffAccess(restaurant,user,action,body,user?undefined:crypto.randomUUID()),{refresh:false});
  if(!result)return;
  if(result.invitation)setInvite(result);
  if(!user)setName('');
  try{setData(await api.staffAccess(restaurant));setError('')}
  catch(err){setError(errorLabel(err))}
 }
 return <section className="dvl-panel dvl-stack">
  <h2>Invitaciones y accesos del personal</h2>
  {error&&<p role="alert">{error}</p>}
  {invite&&<StaffSecret key={invite.invitation} code={invite.invitation} expires={invite.expiresAt} close={()=>setInvite(null)}/>}
  <form className="dvl-grid" onSubmit={event=>{event.preventDefault();save(null,null,{displayName:name.trim(),role})}}>
   <label>Nombre del personal<input required minLength={2} maxLength={80} value={name} onChange={e=>setName(e.target.value)}/></label>
   <label>Rol<select value={role} onChange={e=>setRole(e.target.value)}><RoleOptions/></select></label>
   <button className="dvl-action" disabled={disabled||name.trim().length<2}>Crear invitación</button>
  </form>
  {data?.staff.length===0&&<p>Aún no hay accesos creados por el restaurante.</p>}
  {data?.staff.map(person=><article key={person.user_id} className="dvl-stack">
   <strong>{person.display_name} · {person.active?'Activo':person.has_credential?'Inactivo':'Sin activar'}</strong>
   <label>Rol de {person.display_name}<select disabled={disabled} value={person.staff_role}
    onChange={e=>save(person.user_id,'role',{role:e.target.value})}><RoleOptions/></select></label>
   <div className="dvl-inline">
    <Button disabled={disabled||(!person.active&&!person.has_credential&&!person.invitation_expires_at)}
     onClick={()=>save(person.user_id,'state',{active:!person.active&&Boolean(person.has_credential)})}>
     {person.active?'Desactivar':person.has_credential?'Activar':'Cancelar invitación'}
    </Button>
    <Button disabled={disabled||!person.active} onClick={()=>save(person.user_id,'revoke',{})}>Revocar sesiones</Button>
    <Button disabled={disabled} onClick={()=>save(person.user_id,'reset',{})}>Restablecer acceso</Button>
   </div>
  </article>)}
  {data?.history.length>0&&<details><summary>Historial de accesos</summary>
   <ul>{data.history.map(event=><li key={event.id}>{events[event.action]} · {event.target_name} · {event.actor_name} · {date(event.happened_at)}</li>)}</ul>
  </details>}
 </section>;
}

function download(detail){
 const headers=['Tipo','Pedido','Método o motivo','Venta','Descuento','Envío','Comisión sobre venta','Restaurante','Repartidor','Dvolada','Jornada','Registrado'];
 const amount=minor=>(minor/100).toFixed(2);
 const rows=[headers,...detail.lines.map(line=>['Venta',line.order_number,methods[line.method]||line.method,
  amount(line.total_minor),amount(line.discount_minor),amount(line.delivery_minor),amount(line.commission_minor),amount(line.restaurant_minor),
  amount(line.courier_minor),amount(line.dvolada_minor),line.shift_id,date(line.paid_at)]),
 ...detail.adjustments.map(line=>[line.kind==='refund'?'Devolución':'Ajuste',line.order_number,line.reason,'','','','',
  amount(line.restaurant_minor),amount(line.courier_minor),amount(line.dvolada_minor),'',date(line.created_at)])];
 const field=value=>{
  let text=String(value??'');
  if(/^[\s]*[=+\-@]/.test(text)&&! /^-?\d+(?:\.\d+)?$/.test(text))text="'"+text;
  return '"'+text.replaceAll('"','""')+'"';
 };
 const url=URL.createObjectURL(new Blob(['\uFEFF'+rows.map(row=>row.map(field).join(',')).join('\r\n')],{type:'text/csv;charset=utf-8'}));
 const link=document.createElement('a');
 link.href=url;link.download='liquidacion-'+detail.settlement.id+'.csv';link.click();
 setTimeout(()=>URL.revokeObjectURL(url),1000);
}

export function SettlementPanel({api,restaurant,central=false,run,busy,offline,money,errorLabel}){
 const [listing,setListing]=useState(null),[detail,setDetail]=useState(null),[rules,setRules]=useState([]);
 const [error,setError]=useState(''),[from,setFrom]=useState(''),[until,setUntil]=useState('');
 const [start,setStart]=useState(''),[commission,setCommission]=useState(''),[courier,setCourier]=useState('');
 const [reference,setReference]=useState('');
 const [adjustment,setAdjustment]=useState({kind:'adjustment',orderId:'',reason:'',restaurantMinor:'',courierMinor:'',dvoladaMinor:''});
 const [adjustKey,setAdjustKey]=useState(null);
 const disabled=busy||offline;
 useEffect(()=>{
  if(offline)return;
  let active=true;
  Promise.all([api.settlements(restaurant,central),central?api.settlementRules(restaurant):null])
   .then(([data,configuration])=>{if(active){setListing(data);setRules(configuration?.rules||[]);setError('')}})
   .catch(err=>{if(active)setError(errorLabel(err))});
  return()=>{active=false};
 },[api,restaurant,central,offline,errorLabel]);
 async function open(id){
  const result=await run(()=>api.settlements(restaurant,central,id),{refresh:false});
  if(result){setDetail(result);setReference('');setAdjustKey(null)}
 }
 async function send(id,action,body,key){
  const result=await run(()=>api.settlements(restaurant,central,id,action,body,key),{refresh:false});
  if(!result)return;
  const target=result.settlement?.id||id;
  try{
   const [list,updated]=await Promise.all([api.settlements(restaurant,central),api.settlements(restaurant,central,target)]);
   setListing(list);setDetail(updated);setError('');
  }catch(err){setError(errorLabel(err))}
  return result;
 }
 async function saveRule(event){
  event.preventDefault();
  const saved=await run(()=>api.settlementRules(restaurant,{effectiveAt:epoch(start),commissionBps:cents(commission),courierBps:cents(courier)}),{refresh:false});
  if(!saved)return;
  try{
   const [data,configuration]=await Promise.all([api.settlements(restaurant,central),api.settlementRules(restaurant)]);
   setListing(data);setRules(configuration.rules);setError('');
   setStart('');setCommission('');setCourier('');
  }catch(err){setError(errorLabel(err))}
 }
 const settlement=detail?.settlement;
 return <section className="dvl-panel dvl-stack">
  <h2>Liquidaciones del restaurante</h2>
  {error&&<p role="alert">{error}</p>}
  {listing&&!listing.configured&&<p role="status">Pendiente de configuración comercial. Sin una regla vigente, las ventas no se pueden calcular.</p>}
  {central&&<details><summary>Reglas comerciales vigentes e históricas</summary>
   <ul>{rules.map(rule=><li key={rule.id}>{date(rule.effective_at)} · Comisión {rule.commission_bps/100}% sobre venta neta · Repartidor {rule.courier_bps/100}% del envío</li>)}</ul>
   <form className="dvl-grid" onSubmit={saveRule}>
    <label>Vigente desde (Honduras)<input type="datetime-local" required value={start} onChange={e=>setStart(e.target.value)}/></label>
    <label>Comisión sobre venta neta (%)<input type="number" required min="0" max="100" step=".01" value={commission} onChange={e=>setCommission(e.target.value)}/></label>
    <label>Parte del envío para repartidor (%)<input type="number" required min="0" max="100" step=".01" value={courier} onChange={e=>setCourier(e.target.value)}/></label>
    <button className="dvl-action" disabled={disabled}>Registrar regla</button>
   </form>
  </details>}
  <form className="dvl-grid" onSubmit={event=>{event.preventDefault();send(null,null,{from:epoch(from),until:epoch(until)})}}>
   <label>Desde (Honduras)<input type="datetime-local" required value={from} onChange={e=>setFrom(e.target.value)}/></label>
   <label>Hasta sin incluir (Honduras)<input type="datetime-local" required value={until} onChange={e=>setUntil(e.target.value)}/></label>
   <button className="dvl-action" disabled={disabled||!from||!until||from>=until}>Crear período</button>
  </form>
  {listing?.settlements.length===0&&<p>Aún no hay liquidaciones.</p>}
  <ul className="dvl-stack">{listing?.settlements.map(period=><li key={period.id} className="dvl-row">
   <span>{date(period.from_at)} — {date(period.until_at)} · {statuses[period.status]}</span>
   <Button disabled={disabled} onClick={()=>open(period.id)}>Ver período</Button>
  </li>)}</ul>
  {settlement&&<article className="dvl-stack">
   <h3>{statuses[settlement.status]} · {date(settlement.from_at)} — {date(settlement.until_at)}</h3>
   {settlement.external_reference&&<p>Referencia externa {settlement.external_reference}</p>}
   <p>Restaurante {money(detail.split.restaurant_minor)} · Repartidor {money(detail.split.courier_minor)} · Dvolada {money(detail.split.dvolada_minor)}</p>
   <ul>{detail.byMethod.map(row=><li key={row.method}>{methods[row.method]||row.method} · {row.orders} ventas · {money(row.total_minor)} · descuentos {money(row.discount_minor)} · envío {money(row.delivery_minor)}</li>)}</ul>
   {detail.shifts.length>0&&<details><summary>Conciliación con cierres de caja</summary>
    <ul>{detail.shifts.map(shift=><li key={shift.id}>{date(shift.closed_at)} · efectivo esperado {money(shift.expected_cash_minor)} · efectivo contado {money(shift.counted_minor)}</li>)}</ul>
   </details>}
   {detail.lines.length>0&&<details><summary>Comisiones por pedido</summary>
    <ul>{detail.lines.map(line=><li key={line.order_id}>{line.order_number} · Comisión {money(line.commission_minor)} · Restaurante {money(line.restaurant_minor)} · Repartidor {money(line.courier_minor)} · Dvolada {money(line.dvolada_minor)}</li>)}</ul>
   </details>}
   {detail.adjustments.length>0&&<details><summary>Ajustes y devoluciones auditados</summary>
    <ul>{detail.adjustments.map(row=><li key={row.id}>{row.order_number} · {row.reason} · {date(row.created_at)} · Restaurante {money(row.restaurant_minor)} · Repartidor {money(row.courier_minor)} · Dvolada {money(row.dvolada_minor)}</li>)}</ul>
   </details>}
   {detail.truncated&&<p role="status">La vista muestra hasta 500 movimientos de cada tipo. Los totales abarcan el período completo.</p>}
   <div className="dvl-inline">
    {settlement.status==='pending'&&<Button disabled={disabled} onClick={()=>send(settlement.id,'calculate',{})}>Calcular</Button>}
    {central&&settlement.status==='calculated'&&<Button disabled={disabled} onClick={()=>send(settlement.id,'approve',{})}>Aprobar liquidación</Button>}
    {settlement.status!=='pending'&&!detail.truncated&&<Button onClick={()=>download(detail)}>Exportar CSV</Button>}
   </div>
   {central&&settlement.status==='approved'&&<form className="dvl-grid"
    onSubmit={event=>{event.preventDefault();send(settlement.id,'markPaid',{reference:reference.trim()})}}>
    <label>Referencia de pago externo<input required minLength={4} maxLength={120} value={reference} onChange={e=>setReference(e.target.value)}/></label>
    <button className="dvl-action" disabled={disabled||reference.trim().length<4}>Registrar pago externo</button>
   </form>}
   {central&&settlement.status==='calculated'&&<details><summary>Registrar ajuste o devolución</summary>
    <form className="dvl-grid" onSubmit={async event=>{
     event.preventDefault();
     const key=adjustKey||crypto.randomUUID();setAdjustKey(key);
     const body={...adjustment};
     for(const prop of ['restaurantMinor','courierMinor','dvoladaMinor'])body[prop]=cents(body[prop]);
     if(await send(settlement.id,'adjust',body,key)){
      setAdjustment({kind:'adjustment',orderId:'',reason:'',restaurantMinor:'',courierMinor:'',dvoladaMinor:''});setAdjustKey(null);
     }
    }} onChange={()=>setAdjustKey(null)}>
     <label>Tipo<select value={adjustment.kind} onChange={e=>setAdjustment({...adjustment,kind:e.target.value})}>
      <option value="adjustment">Ajuste con saldo cero</option><option value="refund">Devolución externa</option>
     </select></label>
     <label>Identificador del pedido<input list={'settlement-orders-'+settlement.id} required minLength={36} maxLength={36} value={adjustment.orderId} onChange={e=>setAdjustment({...adjustment,orderId:e.target.value.trim()})}/></label>
     <datalist id={'settlement-orders-'+settlement.id}>{detail.lines.map(line=><option key={line.order_id} value={line.order_id}>{line.order_number}</option>)}</datalist>
     <label>Motivo<input required minLength={8} maxLength={250} value={adjustment.reason} onChange={e=>setAdjustment({...adjustment,reason:e.target.value})}/></label>
     {Object.entries({restaurantMinor:'Restaurante',courierMinor:'Repartidor',dvoladaMinor:'Dvolada'}).map(([prop,label])=><label key={prop}>{label} (L)
      <input type="number" step=".01" max="20000000" min="-20000000" value={adjustment[prop]} onChange={e=>setAdjustment({...adjustment,[prop]:e.target.value})}/>
     </label>)}
     <button className="dvl-action" disabled={disabled}>Registrar movimiento</button>
    </form>
   </details>}
  </article>}
 </section>;
}
