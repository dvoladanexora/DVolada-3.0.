import React,{useEffect,useLayoutEffect,useRef,useState} from 'react';
import {Grip,MessageCircle,Minus,X} from 'lucide-react';

const states={open:'Recibido',review:'En revisión',resolved:'Resuelto'};
function Chat({api,order,channel,offline,onSessionError,counterpart,collapsed,onExpand}) {
 const [data,setData]=useState(null),[draft,setDraft]=useState(''),[error,setError]=useState(''),[busy,setBusy]=useState(false);
 const pending=useRef(null),latest=useRef(0),seen=useRef(null);
 const [newCount,setNewCount]=useState(0);
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
 if(collapsed)return <button className="dvl-chat-bubble" type="button" onClick={onExpand}
  aria-label={'Abrir conversación'+(newCount?' · '+newCount+' mensajes nuevos':'')}>
  <MessageCircle size={22}/>{newCount>0&&<span>{newCount}</span>}
 </button>;
 return <>
   {error&&<p role="alert">{error}</p>}
   {!data&&!error&&<p role="status">{offline?'Sin conexión.':'Cargando conversación…'}</p>}
   {data&&<>
    <ol className="dvl-chat-log" aria-label="Mensajes">{data.messages.map(message=><li key={message.id} className={message.mine?'dvl-chat-mine':''}>
     <strong>{message.mine?'Vos':counterpart||(channel==='courier'?'Repartidor':'Restaurante')}</strong>
     <span>{message.body}</span>
    </li>)}</ol>
    {!data.messages.length&&<p>Aún no hay mensajes.</p>}
    {data.writable?<form className="dvl-stack" onSubmit={send}>
     <label>Mensaje<textarea rows={2} maxLength={600} value={draft} onChange={e=>setDraft(e.target.value)} disabled={busy}/></label>
     <button className="dvl-action" disabled={offline||busy||!draft.trim()}>Enviar mensaje</button>
    </form>:<p>Esta conversación está cerrada.</p>}
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
 const [collapsed,setCollapsed]=useState(false),[position,setPosition]=useState(null);
 const panel=useRef(null),drag=useRef(null);
 const isChat=mode!=='claim';
 const name=counterpart||(mode==='restaurant'?'Restaurante':'Repartidor');
 function clamp(x,y){
  const {width,height}=panel.current.getBoundingClientRect();
  return {left:Math.max(8,Math.min(x,window.innerWidth-width-8)),
   top:Math.max(8,Math.min(y,window.innerHeight-height-8))};
 }
 useLayoutEffect(()=>{
  const update=()=>setPosition(value=>value?clamp(value.left,value.top):null);
  update();
  const observer=new ResizeObserver(update);
  observer.observe(panel.current);
  window.addEventListener('resize',update);
  return()=>{observer.disconnect();window.removeEventListener('resize',update)};
 },[collapsed]);
 function startDrag(event){
  if(event.button!==0)return;
  const {left,top}=panel.current.getBoundingClientRect();
  drag.current={pointer:event.pointerId,x:event.clientX-left,y:event.clientY-top};
  event.currentTarget.setPointerCapture(event.pointerId);
 }
 function moveDrag(event){
  if(drag.current?.pointer!==event.pointerId)return;
  setPosition(clamp(event.clientX-drag.current.x,event.clientY-drag.current.y));
 }
 function moveWithKeys(event){
  const directions={ArrowLeft:[-20,0],ArrowRight:[20,0],ArrowUp:[0,-20],ArrowDown:[0,20]};
  if(!directions[event.key])return;
  event.preventDefault();
  const [dx,dy]=directions[event.key],{left,top}=panel.current.getBoundingClientRect();
  setPosition(clamp(left+dx,top+dy));
 }
 return <aside ref={panel} className={'dvl-panel dvl-client-support'+(collapsed?' dvl-chat-minimized':'')}
  style={position?{...position,right:'auto',bottom:'auto'}:undefined}
  aria-label={isChat?'Conversación del pedido':'Ayuda con el pedido'}>
  <div className="dvl-chat-header">
   {isChat&&<button className="dvl-chat-tool dvl-chat-drag" type="button" aria-label="Mover conversación con las flechas"
    title="Arrastrá para mover" onPointerDown={startDrag} onPointerMove={moveDrag}
    onLostPointerCapture={()=>{drag.current=null}} onKeyDown={moveWithKeys}><Grip size={19}/></button>}
   {!collapsed&&<h2>{isChat?'Chat con '+name.toLowerCase():'Reclamo'}</h2>}
   {isChat&&!collapsed&&<button className="dvl-chat-tool" type="button" aria-label="Minimizar conversación"
    onClick={()=>setCollapsed(true)}><Minus size={20}/></button>}
   {!collapsed&&<button className="dvl-chat-tool" type="button" aria-label={isChat?'Cerrar conversación':'Cerrar'}
    onClick={close}><X size={20}/></button>}
  </div>
  {!collapsed&&<p className="dvl-muted">Pedido {order.orderNumber}</p>}
  {isChat?<Chat {...{api,order,offline,onSessionError,counterpart,collapsed}} channel={mode} onExpand={()=>setCollapsed(false)}/>
   :<Claim {...{api,order,offline,onSessionError}}/>}
 </aside>;
}
