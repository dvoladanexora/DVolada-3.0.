import React,{useEffect,useRef,useState} from 'react';

const states={open:'Recibido',review:'En revisión',resolved:'Resuelto'};
function Chat({api,order,channel,offline,onSessionError,counterpart}) {
 const [data,setData]=useState(null),[draft,setDraft]=useState(''),[error,setError]=useState(''),[busy,setBusy]=useState(false);
 const pending=useRef(null),latest=useRef(0),seen=useRef(null);
 const [newCount,setNewCount]=useState(0),[collapsed,setCollapsed]=useState(false);
 useEffect(()=>{
  if(offline)return;
  let active=true;
  async function load(){
   const query=++latest.current;
   try{
    const result=await api.chat(order.id,channel);
    if(!active||latest.current!==query)return;
    setData(result);setError('');
    if(!collapsed)seen.current=result.messages.at(-1)?.id??0;
    setNewCount(seen.current===null?0:result.messages.filter(message=>!message.mine&&message.id>seen.current).length);
   }catch(error){if(active&&!onSessionError(error))setError('No se pudo actualizar la conversación.')}
  }
  load();const timer=setInterval(load,15000);
  return()=>{active=false;clearInterval(timer)};
 },[api,order.id,channel,offline,collapsed,onSessionError]);
 async function send(event){
  event.preventDefault();
  if(!draft.trim()||busy||offline)return;
  const message=draft.trim();
  if(pending.current?.message!==message)pending.current={message,key:crypto.randomUUID()};
  setBusy(true);setError('');++latest.current;
  try{
   const result=await api.sendMessage(order.id,channel,message,pending.current.key);
   setData(result);setDraft('');pending.current=null;
  }catch(error){if(!onSessionError(error))setError('No se confirmó el mensaje. Podés reintentar con el mismo texto.')}
  finally{setBusy(false)}
 }
 return <>
  <button className="dvl-action secondary" type="button" onClick={()=>setCollapsed(!collapsed)}
   aria-expanded={!collapsed}>{collapsed?'Abrir conversación':'Minimizar'}{newCount>0&&' · '+newCount+' nuevos'}</button>
  {!collapsed&&<>
   {error&&<p role="alert">{error}</p>}
   {!data&&!error&&<p role="status">{offline?'Sin conexión.':'Cargando conversación…'}</p>}
   {data&&<>
    <ol className="dvl-chat-log" aria-label="Mensajes">{data.messages.map(message=><li key={message.id}>
     <strong>{message.mine?'Vos':counterpart?'Cliente':channel==='courier'?'Repartidor':'Restaurante'}</strong> {message.body}
    </li>)}</ol>
    {!data.messages.length&&<p>Aún no hay mensajes.</p>}
    {data.writable?<form className="dvl-stack" onSubmit={send}>
     <label>Mensaje<textarea rows={2} maxLength={600} value={draft} onChange={e=>setDraft(e.target.value)} disabled={busy}/></label>
     <button className="dvl-action" disabled={offline||busy||!draft.trim()}>Enviar mensaje</button>
    </form>:<p>Esta conversación está cerrada.</p>}
   </>}
  </>}
 </>;
}

function Claim({api,order,offline,onSessionError}) {
 const [claim,setClaim]=useState(undefined),[category,setCategory]=useState('pedido');
 const [draft,setDraft]=useState(''),[error,setError]=useState(''),[busy,setBusy]=useState(false);
 useEffect(()=>{
  if(offline)return;
  let active=true;
  api.claim(order.id).then(data=>{if(active){setClaim(data.claim);setError('')}})
   .catch(error=>{if(active&&!onSessionError(error))setError('No se pudo consultar el reclamo.')});
  return()=>{active=false};
 },[api,order.id,offline,onSessionError]);
 async function submit(event){
  event.preventDefault();
  if(offline||busy)return;
  setBusy(true);setError('');
  try{setClaim((await api.sendClaim(order.id,category,draft.trim())).claim);setDraft('')}
  catch(error){if(!onSessionError(error))setError(error.code==='CLAIM_EXISTS'?'Este pedido ya tiene un reclamo. Volvé a abrirlo para verlo.':'No se confirmó el reclamo. Podés reintentar.')}
  finally{setBusy(false)}
 }
 return <>
  {error&&<p role="alert">{error}</p>}
  {claim===undefined&&!error&&<p role="status">{offline?'Sin conexión.':'Cargando reclamo…'}</p>}
  {claim&&<div><p><strong>{states[claim.status]}</strong></p><p>{claim.body}</p>{claim.resolution&&<p>{claim.resolution}</p>}</div>}
  {claim===null&&<form className="dvl-stack" onSubmit={submit}>
   <label>Motivo<select value={category} onChange={e=>setCategory(e.target.value)}>
    <option value="pedido">Problema con el pedido</option><option value="entrega">Problema de entrega</option><option value="otro">Otro</option>
   </select></label>
   <label>Detalle<textarea required minLength={8} maxLength={800} rows={3} value={draft} onChange={e=>setDraft(e.target.value)} disabled={busy}/></label>
   <button className="dvl-action" disabled={offline||busy||draft.trim().length<8}>Registrar reclamo</button>
  </form>}
 </>;
}

export default function ClientSupport({mode,order,api,offline,close,onSessionError,counterpart}) {
 return <aside className="dvl-panel dvl-client-support" aria-label="Ayuda con el pedido">
  <div className="dvl-row"><h2>{mode==='claim'?'Reclamo':counterpart?'Chat con cliente':mode==='restaurant'?'Chat con restaurante':'Chat con repartidor'}</h2>
   <button className="dvl-action secondary" type="button" onClick={close}>Cerrar</button></div>
  <p className="dvl-muted">Pedido {order.orderNumber}</p>
  {mode==='claim'?<Claim {...{api,order,offline,onSessionError}}/>:<Chat {...{api,order,offline,onSessionError}} channel={mode} counterpart={counterpart}/>}
 </aside>;
}
