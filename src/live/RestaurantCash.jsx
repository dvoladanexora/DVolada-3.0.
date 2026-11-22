import React,{useEffect,useRef,useState} from 'react';

const paymentLabels={cash:'Efectivo',transfer:'Transferencia',external_card:'Tarjeta externa'};
const dateLocal=()=>new Date(Date.now()-6*3600000).toISOString().slice(0,10);
const cents=raw=>/^\d{1,7}(?:\.\d{1,2})?$/.test(raw)?Math.round(Number(raw)*100):null;
const epoch=date=>Date.parse(date+'T00:00:00-06:00')/1000;
const time=value=>new Date(value*1000).toLocaleString('es-HN',{timeZone:'America/Tegucigalpa'});
const csvCell=value=>'"'+String(value??'').replaceAll('"','""')+'"';

export default function RestaurantCash({api,id,orders,offline,busy,run,money,refreshOrders}){
 const [cash,setCash]=useState(null),[profile,setProfile]=useState(null),[error,setError]=useState('');
 const [notice,setNotice]=useState('');
 const [opening,setOpening]=useState(''),[counted,setCounted]=useState(''),[order,setOrder]=useState(''),[method,setMethod]=useState('cash');
 const [from,setFrom]=useState(dateLocal),[until,setUntil]=useState(dateLocal),[report,setReport]=useState(null);
 const pending=useRef(null);
 useEffect(()=>{
  if(offline)return;
  let active=true;
  Promise.all([api.restaurantCash(id),api.restaurantProfile(id)])
   .then(([data,config])=>{if(active){setCash(data);setProfile(config.profile);setMethod(config.profile.paymentMethods[0]);setError('')}})
   .catch(()=>{if(active)setError('No se pudo cargar la caja. Volvé a intentar.')});
  return()=>{active=false};
 },[api,id,offline]);
 async function save(operation,body){
  const intent=JSON.stringify({operation,body});
  if(pending.current?.intent!==intent)pending.current={intent,key:crypto.randomUUID()};
  const result=await run(()=>api.saveCash(id,operation,body,pending.current.key),{refresh:false});
  if(!result)return;
  pending.current=null;
  setNotice({open:'Jornada abierta.',close:'Jornada cerrada.',sale:'Venta registrada.'}[operation]);
  if(operation==='sale'){setOrder('');setError('');setReport(null);refreshOrders().catch(()=>{})}
  try{setCash(await api.restaurantCash(id))}catch{setError('La operación quedó registrada. Actualizá la caja para verla.')}
 }
 async function query(){
  const start=epoch(from),end=epoch(until)+86400;
  if(!Number.isInteger(start)||!Number.isInteger(end)||end<=start||end-start>93*86400){
   setError('Elegí un período de hasta 93 días.');return;
  }
  setError('');
  const result=await run(()=>api.restaurantReport(id,start,end),{refresh:false});
  if(result)setReport(result);
 }
 function exportReport(){
  if(!report||report.truncated)return;
  const lines=[['Pedido','Fecha','Método','Total (L)','Descuento (L)','Envío (L)'],
   ...report.sales.map(row=>[row.order_number,time(row.paid_at),paymentLabels[row.method],row.total_minor/100,row.discount_minor/100,row.delivery_minor/100])];
  const url=URL.createObjectURL(new Blob(['\ufeff'+lines.map(row=>row.map(csvCell).join(',')).join('\r\n')],{type:'text/csv;charset=utf-8'}));
  const link=document.createElement('a');link.href=url;link.download='dvolada-ventas-'+from+'-'+until+'.csv';link.click();
  setTimeout(()=>URL.revokeObjectURL(url),1000);
 }
 const shift=cash?.shift;
 const completed=orders.filter(item=>item.status==='Entregado');
 return <div className="dvl-stack">
  <section className="dvl-panel"><h2>Caja y jornada</h2>
   <p>Registro de ventas y arqueo. Los cobros se realizan fuera de Dvolada.</p>
   {error&&<p role="alert">{error}</p>}{notice&&<p role="status">{notice}</p>}
   {!cash&&!error&&<p role="status">{offline?'Sin conexión.':'Cargando jornada…'}</p>}
   {cash&&!shift&&<form className="dvl-grid" onSubmit={event=>{event.preventDefault();save('open',{openingMinor:cents(opening)})}}>
    <label>Fondo inicial (L)<input type="number" min="0" max="1000000" step=".01" value={opening} onChange={event=>setOpening(event.target.value)} required/></label>
    <button className="dvl-action" disabled={busy||offline||cents(opening)===null}>Abrir jornada</button>
   </form>}
   {shift&&<>
    <p>Abierta {time(shift.opened_at)} · Fondo {money(shift.opening_minor)}</p>
    <form className="dvl-grid" onSubmit={event=>{event.preventDefault();save('sale',{shiftId:shift.id,orderId:order,method})}}>
     <label>Pedido entregado<select value={order} onChange={event=>setOrder(event.target.value)} required>
      <option value="">Seleccioná un pedido</option>{completed.map(item=><option key={item.id} value={item.id}>{item.orderNumber} · {money(item.totalMinor)}</option>)}</select></label>
     <label>Método recibido<select value={method} onChange={event=>setMethod(event.target.value)} required>
      {profile?.paymentMethods.map(value=><option key={value} value={value}>{paymentLabels[value]}</option>)}</select></label>
     <button className="dvl-action" disabled={busy||offline||!order||!profile}>Registrar venta</button>
    </form>
    <form className="dvl-grid" onSubmit={event=>{event.preventDefault();save('close',{shiftId:shift.id,countedMinor:cents(counted)})}}>
     <label>Efectivo contado (L)<input type="number" min="0" max="1000000" step=".01" value={counted} onChange={event=>setCounted(event.target.value)} required/></label>
     <button className="dvl-action secondary" disabled={busy||offline||cents(counted)===null}>Cerrar jornada</button>
    </form>
   </>}
   {Boolean(cash?.history.length)&&<><h3>Jornadas cerradas</h3><ul>{cash.history.map(row=><li key={row.id}>
    {time(row.closed_at)} · Esperado {money(row.expected_cash_minor)} · Contado {money(row.counted_minor)} · Diferencia {money(row.counted_minor-row.expected_cash_minor)}
   </li>)}</ul></>}
  </section>
  <section className="dvl-panel"><h2>Ventas por período</h2>
   <form className="dvl-grid" onSubmit={event=>{event.preventDefault();query()}}>
    <label>Desde (Honduras)<input type="date" required value={from} onChange={event=>{setFrom(event.target.value);setReport(null)}}/></label>
    <label>Hasta (Honduras)<input type="date" required value={until} onChange={event=>{setUntil(event.target.value);setReport(null)}}/></label>
    <button className="dvl-action" disabled={busy||offline}>Consultar ventas</button>
   </form>
   {report&&<><dl className="dvl-stats">{report.totals.map(row=><div key={row.method}>
    <dt>{paymentLabels[row.method]} · {row.orders} ventas</dt><dd>{money(row.totalMinor)}</dd>
    <dd>Productos {money(row.subtotalMinor)} · Descuentos {money(row.discountMinor)} · Envío {money(row.deliveryMinor)}</dd>
   </div>)}</dl>
    {!report.sales.length?<p>Sin ventas registradas en el período.</p>:<>
     {report.truncated&&<p>Se muestran 500 ventas. Reducí el período para exportar la lista completa.</p>}
     <div className="dvl-table-scroll"><table><thead><tr><th>Pedido</th><th>Método</th><th>Total</th></tr></thead>
      <tbody>{report.sales.map(row=><tr key={row.order_number}><td>{row.order_number}{row.flash_gift_name&&<small> · Regalo: {row.flash_gift_name}</small>}</td>
       <td>{paymentLabels[row.method]}</td><td>{money(row.total_minor)}</td></tr>)}</tbody></table></div>
     <button type="button" className="dvl-action secondary" disabled={report.truncated} onClick={exportReport}>Exportar CSV</button>
    </>}
   </>}
  </section>
 </div>;
}
