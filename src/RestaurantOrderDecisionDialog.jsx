import React,{useEffect,useRef,useState} from 'react';
import {AlertTriangle,Check,ClipboardList,X} from 'lucide-react';
import {allowedDecision,decisionForOrder} from './restaurant-order-flow.js';
import './restaurant-order-decisions.css';

const reasons=[
 'Producto agotado',
 'Restaurante sin capacidad',
 'No podemos preparar el pedido',
 'Falta confirmar un detalle',
];
const copy={
 'reject':{tag:'PEDIDO NUEVO',title:'Rechazar pedido',help:'Informá por qué el restaurante no podrá prepararlo. El pedido dejará de aparecer en Caja.',cta:'Confirmar rechazo',color:'danger'},
 'approve-cancel':{tag:'CANCELACIÓN SOLICITADA',title:'Aprobar cancelación',help:'Confirmá que cocina dejará de preparar esta orden. El pedido quedará cancelado en el historial.',cta:'Sí, cancelar pedido',color:'danger'},
 'deny-cancel':{tag:'CANCELACIÓN SOLICITADA',title:'Rechazar solicitud',help:'Explicá por qué esta orden ya no puede cancelarse. Cocina seguirá preparándola.',cta:'Continuar preparación',color:'default'},
};
export default function RestaurantOrderDecisionDialog({order,action,onClose,onConfirm,connected=true}){
 const [reason,setReason]=useState(''),[error,setError]=useState('');
 const firstRef=useRef(null),containerRef=useRef(null);
 const config=copy[action];
 useEffect(()=>{
  if(!config)return;
  const body=document.body,previous=body.style.overflow,focus=document.activeElement;
  body.style.overflow='hidden';firstRef.current?.focus();
  const onKey=e=>{
   if(e.key==='Escape'){e.preventDefault();onClose()}
   if(e.key==='Tab'){
    const controls=containerRef.current?.querySelectorAll('button:not([disabled]),textarea:not([disabled])');
    if(!controls?.length)return;
    const first=controls[0],last=controls[controls.length-1];
    if(e.shiftKey&&document.activeElement===first){e.preventDefault();last.focus()}
    else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first.focus()}
   }
  };
  document.addEventListener('keydown',onKey);
  return()=>{body.style.overflow=previous;document.removeEventListener('keydown',onKey);focus?.focus?.()};
 },[action,order?.id]);
 if(!config||!order)return null;
 const submit=e=>{
  e.preventDefault();
  if(!connected){setError('Sin conexión. Esperá a recuperar internet.');return}
  try{
   const decision=decisionForOrder(order,action,reason);
   setError('');onConfirm(decision);
  }catch(ex){setError(ex.message||'Revisá tu decisión.')}
 };
 return <div className="dv-order-decision-backdrop" onMouseDown={e=>{if(e.target===e.currentTarget)onClose()}}>
  <section className="dv-order-decision" ref={containerRef} role="dialog" aria-modal="true" aria-labelledby="dv-order-decision-title">
   <header><span className="dv-order-decision-icon"><ClipboardList size={24}/></span><button type="button" ref={firstRef} onClick={onClose} aria-label="Cerrar"><X size={20}/></button></header>
   <span className="dv-order-decision-eyebrow">{config.tag}</span><h2 id="dv-order-decision-title">{config.title}</h2>
   <p className="dv-order-decision-order">Orden <strong>{order.orderNo||order.id}</strong></p>
   <p className="dv-order-decision-help">{config.help}</p>
   {action!=='reject'&&<div className="dv-order-decision-notice"><AlertTriangle size={17}/><span>Motivo del cliente: {order.cancelReason||'No especificado'}</span></div>}
   <form onSubmit={submit}>
    {action!=='approve-cancel'&&<>
     <div className="dv-order-decision-reasons">{reasons.map(value=><button type="button" key={value} className={reason===value?'selected':''} onClick={()=>{setReason(value);setError('')}}>{value}</button>)}</div>
     <label htmlFor="dv-decision-reason">Motivo de la decisión <span>*</span></label>
     <textarea id="dv-decision-reason" rows={3} maxLength={220} value={reason} onChange={e=>{setReason(e.target.value);setError('')}} placeholder="Explicá brevemente el motivo (mínimo 5 caracteres)"/>
     <small>{reason.length}/220 caracteres</small>
    </>}
    {error&&<p className="dv-order-decision-error" role="alert">{error}</p>}
    {!allowedDecision(order,action)&&<p className="dv-order-decision-error" role="alert">El pedido cambió. Cerrá esta ventana y revisá su estado actual.</p>}
    <div className="dv-order-decision-actions"><button type="button" className="secondary" onClick={onClose}>Volver</button><button type="submit" disabled={!connected||!allowedDecision(order,action)} className={'primary '+(config.color==='danger'?'is-danger':'')}><Check size={17}/>{config.cta}</button></div>
   </form>
   <p className="dv-order-decision-footnote">Decisión guardada en este dispositivo de demostración. Work conectará las confirmaciones reales y la notificación al cliente.</p>
  </section>
 </div>;
}
