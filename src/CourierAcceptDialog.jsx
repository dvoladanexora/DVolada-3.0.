import React,{useEffect,useRef} from 'react';
import {AlertCircle,Bike,Check,Store,X} from 'lucide-react';
import './courier-accept-dialog.css';

/** Confirmación intencional para evitar asignación accidental en pantallas táctiles. */
export default function CourierAcceptDialog({order,place,onConfirm,onClose,canAccept=true,slots=0}){
 const surface=useRef(null),closeButton=useRef(null);
 useEffect(()=>{
  const body=document.body,old=body.style.overflow,active=document.activeElement;
  body.style.overflow='hidden';closeButton.current?.focus();
  const onKey=e=>{
   if(e.key==='Escape'){e.preventDefault();onClose()}
   if(e.key!=='Tab'||!surface.current)return;
   const nodes=surface.current.querySelectorAll('button:not([disabled])');
   if(!nodes.length)return;
   const first=nodes[0],last=nodes[nodes.length-1];
   if(e.shiftKey&&document.activeElement===first){e.preventDefault();last.focus()}
   else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first.focus()}
  };
  document.addEventListener('keydown',onKey);
  return()=>{body.style.overflow=old;document.removeEventListener('keydown',onKey);active?.focus?.()};
 },[onClose]);
 return <div className="dv-rider-accept-backdrop" onMouseDown={e=>{if(e.target===e.currentTarget)onClose()}}>
  <section className="dv-rider-accept-dialog" role="dialog" aria-modal="true" aria-labelledby="dv-rider-accept-title" ref={surface}>
   <div className="dv-rider-accept-head"><div className="dv-rider-accept-symbol"><Bike size={26}/></div><button type="button" ref={closeButton} onClick={onClose} aria-label="Cerrar confirmación"><X size={20}/></button></div>
   <span className="dv-rider-eyebrow">CONFIRMAR NUEVA ENTREGA</span>
   <h2 id="dv-rider-accept-title">{order?'¿Aceptás este pedido?':'Esta oferta ya no está disponible'}</h2>
   {order&&<><p>Al confirmar, la orden se agregará a «Mis entregas» y ocupará uno de tus dos cupos disponibles.</p>
    <div className="dv-rider-accept-order"><span><Store size={17}/> RESTAURANTE</span><strong>{place?.name||order.placeName||'Restaurante'}</strong><small>Pedido {order.orderNo||order.id}</small></div>
    <div className="dv-rider-accept-info"><AlertCircle size={18}/><span>{slots} cupo(s) disponible(s). No se garantiza el pago ni la asignación real hasta conectar el servidor.</span></div>
   </>}
   <div className="dv-rider-accept-buttons"><button type="button" onClick={onClose}>Volver</button><button type="button" className="dv-rider-primary" disabled={!order||!canAccept} onClick={onConfirm}><Check size={18}/> Confirmar aceptación</button></div>
  </section>
 </div>;
}
