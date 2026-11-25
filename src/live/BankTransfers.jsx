import React,{useEffect,useState} from 'react';

const states={awaiting_reference:'Falta referencia',pending:'Pendiente de verificación',confirmed:'Confirmada',rejected:'Rechazada'};

export function OrderTransfer({api,order,offline}){
 const [data,setData]=useState(undefined),[error,setError]=useState(''),[busy,setBusy]=useState(false);
 async function load(body){
  setBusy(true);setError('');
  try{setData((await api.customerTransfer(order.id,body)).transfer)}
  catch(e){setError(e.code==='TRANSFER_UNAVAILABLE'?'El restaurante no ofrece esta opción o ya procesó el pedido.':e.code==='TRANSFER_REFERENCE_IN_USE'?'La referencia ya está asociada a otro pedido.':'No se pudo consultar o guardar la transferencia.')}
  finally{setBusy(false)}
 }
 return <details className="surface" onToggle={e=>{if(e.currentTarget.open&&!offline&&!busy)load()}}>
  <summary>Transferencia directa al restaurante</summary>
  {error&&<p role="alert">{error}</p>}
  {!data&&order.status==='Pendiente'&&<button type="button" className="secondary" disabled={offline||busy} onClick={()=>load({})}>Elegir transferencia</button>}
  {data&&<>
   <p>Estado: {states[data.status]}</p>
   <p>{data.bank} · {data.beneficiary} · {data.account_type} · {data.account_number}</p>
   {data.instructions&&<p>{data.instructions}</p>}
   {data.reference&&<p>Referencia: {data.reference}</p>}
   {order.status==='Pendiente'&&['awaiting_reference','rejected'].includes(data.status)&&<form onSubmit={event=>{event.preventDefault();load({reference:new FormData(event.currentTarget).get('reference')})}}>
    <label>Referencia bancaria<input name="reference" minLength={4} maxLength={64} required/></label>
    <button className="primary" disabled={offline||busy}>Enviar referencia</button>
   </form>}
   <button type="button" className="secondary" disabled={offline||busy} onClick={()=>load()}>Actualizar estado</button>
  </>}
 </details>;
}

export function BankAccountForm({api,id,offline}){
 const [data,setData]=useState(undefined),[message,setMessage]=useState(''),[busy,setBusy]=useState(false);
 useEffect(()=>{if(!offline)api.bankAccount(id).then(r=>setData(r.account)).catch(()=>setMessage('No se pudo cargar la cuenta bancaria.'))},[api,id,offline]);
 return <details className="dvl-panel"><summary>Cuenta bancaria para transferencias</summary>
  {message&&<p role="status">{message}</p>}
  {data!==undefined&&<form className="dvl-stack" onSubmit={async event=>{
    event.preventDefault();setBusy(true);setMessage('');
    try{await api.bankAccount(id,Object.fromEntries(new FormData(event.currentTarget)));setMessage('Cuenta guardada. Activá Transferencia en los métodos de pago.')}
    catch{setMessage('No se pudo guardar la cuenta. Revisá los datos.')}finally{setBusy(false)}
  }}>
   <label>Banco<input name="bank" required defaultValue={data?.bank}/></label>
   <label>Beneficiario<input name="beneficiary" required defaultValue={data?.beneficiary}/></label>
   <label>Tipo de cuenta<input name="type" required defaultValue={data?.account_type}/></label>
   <label>Número de cuenta<input name="number" inputMode="numeric" required defaultValue={data?.account_number}/></label>
   <label>Instrucciones<textarea name="instructions" maxLength={250} defaultValue={data?.instructions}/></label>
   <button className="dvl-action" disabled={offline||busy}>Guardar cuenta bancaria</button>
  </form>}
 </details>;
}

export function TransferQueue({api,id,offline,money}){
 const [rows,setRows]=useState([]),[busy,setBusy]=useState(false),[message,setMessage]=useState('');
 async function refresh(){try{setRows((await api.restaurantTransfers(id)).transfers)}catch{setMessage('No se pudieron consultar las transferencias.')}}
 useEffect(()=>{if(!offline)refresh()},[api,id,offline]);
 return <section className="dvl-panel">
  <h2>Transferencias por pedido</h2>
  <button type="button" className="dvl-action secondary" disabled={offline||busy} onClick={refresh}>Actualizar transferencias</button>
  {message&&<p role="status">{message}</p>}
  {rows.map(row=><div key={row.order_id} className="dvl-row">
   <span>Orden {row.order_number} · {money(row.total_minor)} · {row.bank} · {row.reference} · {states[row.status]}</span>
   {row.status==='pending'&&['confirmed','rejected'].map(decision=><button key={decision} type="button" className="dvl-action secondary" disabled={offline||busy} onClick={async()=>{
    setBusy(true);setMessage('');
    try{await api.reviewTransfer(id,row.order_id,{decision,reference:row.reference});await refresh()}
    catch{setMessage('No se confirmó la operación. Actualizá las transferencias.')}finally{setBusy(false)}
   }}>{decision==='confirmed'?'Confirmar pago':'Rechazar pago'}</button>)}
  </div>)}
 </section>;
}
