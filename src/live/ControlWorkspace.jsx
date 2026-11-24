import React,{useEffect,useState} from 'react';
import {LayoutDashboard,Store,Package,Users,Wallet,Tag,ShieldCheck,MoreHorizontal,ChevronRight,Bike,Clock,CheckCircle2,DoorOpen,Plus,UserPlus} from 'lucide-react';

const tabs={operations:'Seguimiento de pedidos',accounts:'Participantes y cuentas',claims:'Reclamos',coupons:'Cupones',rates:'Tarifas',
 reports:'Reportes',audit:'Auditoría',business:'Alta y afiliación',flash:'Flash y regalos',settlements:'Liquidaciones'};
const statuses=['Pendiente','Aceptado','Preparando','Listo','Recogido','En camino','En ubicación','Entregado','Cancelado','Rechazado'];
const claims={open:'Recibido',review:'En atención',resolved:'Resuelto'};
const periodStates={pending:'Pendiente',calculated:'Calculada',approved:'Aprobada',paid:'Pagada'};
const roles={customer:'Cliente',courier:'Repartidor'};
const states={active:'Activa',suspended:'Suspendida',locked:'Bloqueada',revoke:'Revocar sesiones'};
const time=value=>new Date(value*1000).toLocaleString('es-HN',{timeZone:'America/Tegucigalpa'});
const epoch=value=>Math.floor(Date.parse(value+'-06:00')/1000);
const minor=value=>Math.round(Number(value)*100);
const button='dvl-action secondary';
const queries=(path,fields)=>path+'?'+new URLSearchParams(fields);
const esc=value=>'"'+String(value??'').replace(/^[\s]*[=+@-]/,"'$&").replaceAll('"','""')+'"';
function exportReport(data){
 const amount=value=>value==null?'':(value/100).toFixed(2);
 const header=['Tipo','Entidad','Estado o método','Cantidad','Total','Descuentos','Restaurante','Repartidor','Dvolada','Comisión','Ajustes'];
 const records=[header,
  ...data.orders.map(row=>['Pedidos','',row.status,row.orders]),
  ...data.sales.map(row=>['Ventas',row.name,row.method,row.sales,amount(row.total_minor),amount(row.discount_minor)]),
  ...data.allocations.map(row=>['Liquidación '+row.id,row.name,periodStates[row.status],'','','',
   amount(row.restaurant_minor),amount(row.courier_minor),amount(row.dvolada_minor),amount(row.commission_minor),amount(row.adjustment_minor)]),
  ...data.balances.map(row=>['Repartidor',row.display_name,periodStates[row.status],'','','','',amount(row.courier_minor)])];
 const csv=records.map(row=>header.map((_,index)=>index>=3?String(row[index]??''):esc(row[index])).join(',')).join('\r\n');
 const url=URL.createObjectURL(new Blob(['\uFEFF'+csv],{type:'text/csv;charset=utf-8'}));
 const a=document.createElement('a');a.href=url;a.download='dvolada-reporte-operativo.csv';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
}
function RestaurantSelect({restaurants,name='restaurant',required=false}){
 return <label>Restaurante<select name={name} required={required} defaultValue="">
  <option value="">{required?'Seleccioná un restaurante':'Todos los restaurantes'}</option>
  {restaurants.map(row=><option key={row.id} value={row.id}>{row.name}</option>)}
 </select></label>;
}
function Form({children,action,label,disabled}){
 return <form className="dvl-grid dvl-editor" onSubmit={event=>{
  event.preventDefault();
  if(!disabled)action(Object.fromEntries(new FormData(event.currentTarget)));
 }}>
  {children}<button className="dvl-action" disabled={disabled}>{label}</button>
 </form>;
}
const emptyFilters={operations:{q:'',status:'',restaurant:''},accounts:{q:'',role:''},claims:{q:'',status:''},coupons:{},audit:{subject:''}};
const endpoints={operations:'orders',accounts:'accounts',claims:'claims',coupons:'coupons',audit:'audit'};

// One navigation model, shared across the desktop sidebar and mobile bar.
const controlGroups=[
 {id:'summary',label:'Resumen',icon:LayoutDashboard,sections:[['summary','Vista general']]},
 {id:'business',label:'Negocios',icon:Store,sections:[['business','Restaurantes']]},
 {id:'operations',label:'Pedidos',icon:Package,sections:[['operations','Seguimiento'],['claims','Reclamos']]},
 {id:'access',label:'Accesos',icon:Users,sections:[['accounts','Cuentas'],['owners','Propietarios'],['couriers','Repartidores'],['staff','Personal']]},
 {id:'finance',label:'Finanzas',icon:Wallet,sections:[['settlements','Liquidaciones'],['rates','Tarifas y comisiones'],['reports','Reportes']]},
 {id:'promos',label:'Promociones',icon:Tag,sections:[['coupons','Cupones'],['flash','Flash y regalos']]},
 {id:'security',label:'Configuración',icon:ShieldCheck,sections:[['security','Mi acceso'],['audit','Auditoría'],['affiliationAudit','Actividad de afiliación']]}
];
function visibleGroups(flash,commercial){
 return controlGroups.map(group=>({...group,sections:group.sections.filter(([id])=>(id!=='flash'||flash)&&(id!=='settlements'||commercial))}));
}
export function ControlNavigation({section,setSection,flash,commercial}){
 const [more,setMore]=useState(false);
 const groups=visibleGroups(flash,commercial);
 const active=groups.find(group=>group.sections.some(([id])=>id===section))?.id||'summary';
 useEffect(()=>{setMore(false)},[section]);
 useEffect(()=>{
  if(!more)return;
  const close=event=>{if(event.key==='Escape')setMore(false)};
  document.addEventListener('keydown',close);return()=>document.removeEventListener('keydown',close);
 },[more]);
 const choose=group=>{setMore(false);setSection(group.sections[0][0])};
 const navButton=(group,index)=>{const Icon=group.icon;return <button type="button" key={group.id}
  className={'dvl-admin-nav-item '+(index>=3?'dvl-admin-nav-extra ':'')+(active===group.id?'active':'')}
  aria-current={active===group.id?'page':undefined} onClick={()=>choose(group)}>
  <Icon size={19} aria-hidden="true"/><span>{group.label}</span>
 </button>};
 return <aside className="dvl-admin-sidebar">
  <div className="dvl-admin-sidebar-label">ESPACIO DE GESTIÓN</div>
  <nav className="dvl-shortcuts dvl-admin-nav" aria-label="Navegación principal">
   {groups.map(navButton)}
   <button className={'dvl-admin-more '+(more||groups.slice(3).some(g=>g.id===active)?'active':'')} type="button"
    aria-expanded={more} aria-controls="dvl-admin-more-menu" onClick={()=>setMore(v=>!v)}><MoreHorizontal size={21}/><span>Más</span></button>
  </nav>
  {more&&<><button className="dvl-admin-scrim" type="button" aria-label="Cerrar más opciones" onClick={()=>setMore(false)}/>
   <div className="dvl-admin-more-menu" id="dvl-admin-more-menu" role="group" aria-label="Más módulos">
    <div className="dvl-admin-more-title">Más opciones</div>
    {groups.slice(3).map(group=>{const Icon=group.icon;return <button key={group.id} type="button" onClick={()=>choose(group)} aria-current={active===group.id?'page':undefined}><Icon size={20}/><span>{group.label}</span><ChevronRight size={16}/></button>})}
   </div></>}
  <div className="dvl-admin-sidebar-footer"><ShieldCheck size={15}/> Acceso administrativo</div>
 </aside>;
}
export function ControlSubnavigation({section,setSection,flash,commercial}){
 const group=visibleGroups(flash,commercial).find(g=>g.sections.some(([id])=>id===section));
 if(!group||group.sections.length<2)return null;
 return <nav className="dvl-admin-subnav" aria-label={'Opciones de '+group.label}>{group.sections.map(([id,label])=>
  <button key={id} type="button" aria-pressed={section===id} onClick={()=>setSection(id)}>{label}</button>)}</nav>;
}
export function ControlOverview({stats,setSection,commercial,flash}){
 const cards=[
  ['Restaurantes',stats?.restaurants?.total,Store,'business'],
  ['Abiertos',stats?.restaurants?.open,DoorOpen,'business'],
  ['Pedidos activos',stats?.orders?.active,Clock,'operations'],
  ['Entregados',stats?.orders?.delivered,CheckCircle2,'operations'],
  ['Repartidores habilitados',stats?.couriers?.active,Bike,'couriers']
 ];
 const links=[
  ['Nuevo negocio','Registrar y activar afiliados',Store,'newBusiness'],
  ['Invitar propietario','Gestionar acceso de restaurantes',UserPlus,'owners'],
  ['Repartidores','Revisar solicitudes y cuentas',Bike,'couriers'],
  ['Reclamos','Atender problemas de pedidos',Package,'claims'],
 ];
 return <div className="dvl-admin-overview" id="control">
  <div className="dvl-admin-section-heading"><h2>Vista general</h2><span>Estado de la plataforma</span></div>
  <div className="dvl-admin-kpis">{cards.map(([label,value,Icon,id])=><button key={label} type="button" className="dvl-admin-kpi" onClick={()=>setSection(id)}><span className="dvl-admin-kpi-label">{label}<Icon size={18} aria-hidden="true"/></span><strong>{value??'—'}</strong></button>)}</div>
  <section className="dvl-panel dvl-admin-quick"><div className="dvl-admin-section-heading"><h2>Acciones rápidas</h2><span>Gestioná la operación desde un solo lugar</span></div><div className="dvl-admin-quick-grid">{links.map(([label,desc,Icon,id])=><button key={id} type="button" onClick={()=>setSection(id)}><span className="dvl-admin-quick-icon"><Icon size={20}/></span><span><strong>{label}</strong><small>{desc}</small></span><ChevronRight size={16}/></button>)}</div></section>
 </div>;
}

export function ControlWorkspace({section,api,restaurants,offline,busy,run,money,errorLabel}){
 const [data,setData]=useState(null),[error,setError]=useState(''),[filters,setFilters]=useState(emptyFilters[section]||{});
 const [selection,setSelection]=useState(null),[simulation,setSimulation]=useState(null),[courierRules,setCourierRules]=useState(null);
 const disabled=offline||busy;
 const endpoint=endpoints[section];
 useEffect(()=>{
  if(!endpoint||offline)return;
  let active=true;
  async function loading(){
   try{const result=await api.control(queries(endpoint,filters));if(active){setData(result);setError('')}}
   catch(err){if(active)setError(errorLabel(err))}
  }
  loading();
  const timer=section==='operations'?setInterval(loading,15000):null;
  return()=>{active=false;if(timer)clearInterval(timer)};
 },[api,endpoint,filters,offline,section,errorLabel]);
 async function get(path,params){
  const result=await run(()=>api.control(queries(path,params)),{refresh:false});
  if(result){setData(result);setError('')}
  return result;
 }
 async function save(path,body,method='POST',key){
  const result=await run(()=>api.control(path,{method,body,key}),{refresh:false});
  if(result&&endpoint)await get(endpoint,filters);
  return result;
 }
 const restaurantIds=restaurants.filter(row=>row.plan!=='LOCAL');
 return <section className="dvl-panel dvl-stack" aria-label={tabs[section]}>
  <h2>{tabs[section]}</h2>
  {error&&<p role="alert">{error}</p>}
  {endpoint&&!data&&!error&&<p role="status">{offline?'Sin conexión.':'Cargando…'}</p>}
  {section==='operations'&&<>
   <Form label="Filtrar pedidos" action={values=>{setData(null);setFilters(values)}} disabled={disabled}>
    <label>Buscar por número o restaurante<input name="q" maxLength={80}/></label>
    <label>Estado<select name="status"><option value="">Todos</option><option value="active">Solo activos</option>
     {statuses.map(state=><option key={state}>{state}</option>)}</select></label>
    <RestaurantSelect restaurants={restaurants}/>
   </Form>
   {data&&<><div className="dvl-inline dvl-control-counts">{data.counts.map(row=><span key={row.status}>{row.status} {row.total}</span>)}</div>
    {data.orders.length===0&&<p>No hay pedidos para estos filtros.</p>}
    <ul className="dvl-stack">{data.orders.map(order=><li key={order.id} className="dvl-row">
     <div><strong>{order.order_number}</strong><small>{order.restaurant_name} · {time(order.created_at)}</small></div>
     <span>{order.status} · {money(order.total_minor)}</span>
     {(order.alert||order.claim_status)&&<span role="status">{[order.alert==='offer_expired'?'Oferta vencida':order.alert==='pin_locked'?'PIN bloqueado':null,
      order.claim_status?'Reclamo '+claims[order.claim_status].toLowerCase():null].filter(Boolean).join(' · ')}</span>}
    </li>)}</ul>
    {data.next&&<button className={button} disabled={disabled} onClick={()=>get(endpoint,{...filters,cursor:data.next})}>Página siguiente</button>}
   </>}
  </>}
  {section==='accounts'&&<>
   <Form label="Buscar cuentas" action={values=>{setSelection(null);setFilters(values)}} disabled={disabled}>
    <label>Nombre o ID<input name="q" maxLength={80}/></label>
    <label>Rol<select name="role"><option value="">Todos</option>{Object.entries(roles).map(([value,label])=><option key={value} value={value}>{label}</option>)}</select></label>
   </Form>
   {data?.limited&&<p>Refiná la búsqueda para ver las demás cuentas.</p>}
   {data?.accounts.length===0&&<p>No hay cuentas para estos filtros.</p>}
   {data?.accounts.map(account=><article key={account.id} className="dvl-stack">
    <div className="dvl-row"><div><strong>{account.display_name}</strong><small>{account.memberships?'Personal de restaurante':roles[account.account_role]} · {states[account.admin_locked?'locked':account.status]} · {account.sessions} sesiones · {account.memberships} negocios</small></div>
     <button className={button} disabled={disabled} onClick={()=>setSelection(selection===account.id?null:account.id)}>Gestionar cuenta</button></div>
    {selection===account.id&&<Form label="Confirmar cambio de cuenta" disabled={disabled} action={async values=>{
     if(await save('accounts/'+account.id,{...values,version:account.admin_version},'PATCH'))setSelection(null);
    }}>
     <label>Acción<select name="state" required><option value="">Elegí una acción</option>
      {Object.entries(states).filter(([value])=>!account.admin_locked||value!=='suspended').map(([value,label])=><option key={value} value={value}>{label}</option>)}</select></label>
     <label>Motivo<input name="reason" minLength={4} maxLength={250} required/></label>
    </Form>}
   </article>)}
  </>}
  {section==='claims'&&<>
   <Form label="Filtrar reclamos" action={values=>{setSelection(null);setFilters(values)}} disabled={disabled}>
    <label>Número de pedido<input name="q" maxLength={80}/></label>
    <label>Estado del reclamo<select name="status"><option value="">Todos</option>{Object.entries(claims)
     .map(([value,label])=><option key={value} value={value}>{label}</option>)}</select></label>
   </Form>
   {data?.claims.length===0&&<p>No hay reclamos pendientes para estos filtros.</p>}
   {data?.claims.map(claim=><details key={claim.order_id}>
    <summary>{claim.order_number} · {claim.restaurant_name} · {claims[claim.status]}</summary>
    <p>{claim.body}</p>
    {claim.assignee_name&&<p>Responsable {claim.assignee_name}</p>}
    {claim.resolution&&<p>{claim.resolution}</p>}
    {claim.status!=='resolved'&&<Form label="Guardar atención" disabled={disabled} action={values=>save('claims/'+claim.order_id,
     {...values,version:claim.version},'PATCH')}>
     <label>Responsable<select name="assigneeId" required defaultValue={claim.assignee_id||''}>
      <option value="">Elegí un responsable</option>{data.assignees.map(person=><option key={person.id} value={person.id}>{person.display_name}</option>)}</select></label>
     <label>Estado<select name="status"><option value="review">En atención</option><option value="resolved">Resuelto</option></select></label>
     <label>Resolución al cerrar<textarea name="resolution" rows={2} maxLength={800}/></label>
    </Form>}
   </details>)}
  </>}
  {section==='coupons'&&<>
   <p>Cada cliente puede canjear un código una vez.</p>
   <Form label="Crear cupón" disabled={disabled} action={v=>save('coupons',{code:v.code,restaurantId:v.restaurant,
    discountMinor:minor(v.discount),startsAt:epoch(v.start),endsAt:epoch(v.end),globalLimit:Number(v.limit)})}>
    <RestaurantSelect restaurants={restaurantIds} required/>
    <label>Código<input name="code" required pattern="[A-Za-z0-9-]{4,24}"/></label>
    <label>Descuento (L)<input name="discount" type="number" min=".01" max="1000000" step=".01" required/></label>
    <label>Límite global<input name="limit" type="number" min="1" max="100000" required/></label>
    <label>Desde (Honduras)<input name="start" type="datetime-local" required/></label>
    <label>Hasta (Honduras)<input name="end" type="datetime-local" required/></label>
   </Form>
   {data?.coupons.map(coupon=><div className="dvl-row" key={coupon.code}>
    <div><strong>{coupon.code} · {coupon.restaurant_name}</strong><small>{money(coupon.discount_minor)} · {coupon.used}/{coupon.global_limit??'sin límite global'} · {time(coupon.starts_at)} — {time(coupon.ends_at)}</small></div>
    <button className={button} disabled={disabled||(!coupon.active&&coupon.ends_at<=Date.now()/1000)} onClick={()=>save('coupons/'+coupon.code,{active:!coupon.active},'PATCH')}>
     {coupon.active?'Desactivar cupón':'Activar cupón'}
    </button>
   </div>)}
  </>}
  {section==='rates'&&<>
   <p>Las reglas por zona y distancia se usan en el simulador. El checkout conserva la tarifa fija del restaurante hasta contar con distancia y zona verificadas.</p>
   <Form label="Historial de tarifas" disabled={disabled} action={v=>get('rates',v)}><RestaurantSelect restaurants={restaurantIds} required/></Form>
   <details><summary>Programar una tarifa</summary>
    <Form label="Guardar tarifa futura" disabled={disabled} action={async v=>{
     const result=await save('rates',{restaurantId:v.restaurant,zone:v.zone,effectiveAt:epoch(v.at),
      baseMinor:minor(v.base),zoneMinor:minor(v.surcharge),kmMinor:minor(v.perKm)},'POST',crypto.randomUUID());
     if(result)await get('rates',{restaurant:v.restaurant});
    }}>
     <RestaurantSelect restaurants={restaurantIds} required/>
     <label>Código de zona<input name="zone" pattern="[a-zA-Z0-9-]{1,50}" required/></label>
     <label>Vigencia futura (Honduras)<input name="at" type="datetime-local" required/></label>
     {[['base','Base'],['surcharge','Adicional de zona'],['perKm','Por kilómetro']].map(([name,label])=>
      <label key={name}>{label} (L)<input name={name} type="number" min="0" max="1000000" step=".01" required/></label>)}
    </Form>
   </details>
   <Form label="Simular entrega" disabled={disabled} action={async v=>setSimulation(await save('rates/simulate',{
    restaurantId:v.restaurant,zone:v.zone,meters:Number(v.meters),at:epoch(v.at)
   }))}>
    <RestaurantSelect restaurants={restaurantIds} required/>
    <label>Zona a simular<input name="zone" required maxLength={50}/></label>
    <label>Distancia simulada (m)<input name="meters" type="number" min="0" max="500000" required/></label>
    <label>Fecha simulada (Honduras)<input name="at" type="datetime-local" required/></label>
   </Form>
   {simulation&&<p role="status">Base {money(simulation.base_minor)} · zona {money(simulation.zone_minor)} · distancia {money(simulation.distanceMinor)} · total {money(simulation.totalMinor)}</p>}
   <details><summary>Comisión por repartidor</summary>
    <p>La regla sustituye la parte del envío para ese repartidor en el restaurante seleccionado. Los pedidos ya liquidados conservan su cálculo.</p>
    <Form label="Consultar reglas de repartidores" disabled={disabled} action={async v=>{
     const result=await run(()=>api.control(queries('courier-rules',v)),{refresh:false});if(result)setCourierRules(result.courierRules);
    }}><RestaurantSelect restaurants={restaurantIds} required/></Form>
    <Form label="Registrar comisión de repartidor" disabled={disabled} action={async v=>{
     const result=await save('courier-rules',{restaurantId:v.restaurant,courierId:v.courier,effectiveAt:epoch(v.at),
      courierBps:minor(v.share)},'POST',crypto.randomUUID());
     if(result){
      const stored=await run(()=>api.control(queries('courier-rules',{restaurant:v.restaurant})),{refresh:false});
      if(stored)setCourierRules(stored.courierRules);
     }
    }}>
     <RestaurantSelect restaurants={restaurantIds} required/>
     <label>ID del repartidor<input name="courier" minLength={36} maxLength={36} required/></label>
     <label>Vigente desde (Honduras)<input name="at" type="datetime-local" required/></label>
     <label>Porcentaje del envío para el repartidor<input name="share" type="number" min="0" max="100" step=".01" required/></label>
    </Form>
    {courierRules?.length===0&&<p>Sin reglas individuales.</p>}
    {courierRules?.map(rule=><p key={rule.id}>{rule.display_name} · {rule.courier_bps/100}% · {time(rule.effective_at)}</p>)}
   </details>
   {data?.rates.length===0&&<p>Pendiente de configuración.</p>}
   {data?.rates.map(rate=><p key={rate.id}>{rate.zone} · {time(rate.effective_at)} · base {money(rate.base_minor)} · zona {money(rate.zone_minor)} · {money(rate.km_minor)} por km</p>)}
  </>}
  {section==='reports'&&<>
   <Form label="Generar reporte" disabled={disabled} action={v=>get('reports',{restaurant:v.restaurant,from:epoch(v.from),until:epoch(v.until)})}>
    <RestaurantSelect restaurants={restaurants}/>
    <label>Desde (Honduras)<input name="from" type="datetime-local" required/></label>
    <label>Hasta sin incluir (Honduras)<input name="until" type="datetime-local" required/></label>
   </Form>
   {data&&<>
    <details open><summary>Pedidos y ventas</summary><ul>{data.orders.map(row=><li key={row.status}>{row.status} · {row.orders}</li>)}
     {data.sales.map(row=><li key={row.id+row.method}>{row.name} · {row.method} · {row.sales} · {money(row.total_minor)} · descuento {money(row.discount_minor)}</li>)}</ul></details>
    <details><summary>Liquidaciones que coinciden con el período</summary><ul>{data.allocations.map(row=><li key={row.id}>{row.name} · {time(row.from_at)} — {time(row.until_at)} · {periodStates[row.status]} · restaurante {money(row.restaurant_minor)} · repartidor {money(row.courier_minor)} · Dvolada {money(row.dvolada_minor)} · comisión {money(row.commission_minor)} · ajustes {money(row.adjustment_minor)}</li>)}</ul></details>
    <details><summary>Saldos por repartidor</summary><ul>{data.balances.map(row=><li key={row.courier_id+row.status}>{row.display_name} · {periodStates[row.status]} · {money(row.courier_minor)}</li>)}</ul></details>
    {data.truncated?<p>El reporte supera 500 registros por sección. Reducí el período para exportarlo completo.</p>:
     <button className={button} onClick={()=>exportReport(data)}>Exportar reporte CSV</button>}
   </>}
  </>}
  {section==='audit'&&<>
   <Form label="Buscar en auditoría" disabled={disabled} action={setFilters}><label>ID de pedido, cuenta, tarifa o cupón<input name="subject" maxLength={82}/></label></Form>
   {data?.events.length===0&&<p>No hay acciones registradas para esa búsqueda.</p>}
   {data?.events.map(event=><details key={event.id}><summary>{event.action} · {event.actor_name} · {time(event.created_at)}</summary>
    <p>{event.subject}</p><p style={{overflowWrap:'anywhere'}}>{event.detail}</p>
   </details>)}
  </>}
 </section>;
}
