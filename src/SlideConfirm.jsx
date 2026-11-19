import React,{useRef,useState,useEffect} from 'react';
import './slide-confirm.css';

/** Confirmar solo si la validación del pedido terminó correctamente.
 * onConfirm puede devolver false para mantener habilitado el control y permitir corregir datos.
 */
export default function SlideConfirm({onConfirm,disabled=false,label='Deslizá para confirmar',amount=''}) {
 const track=useRef(null),pointer=useRef(null),locked=useRef(false);
 const [progress,setProgress]=useState(0),[dragging,setDragging]=useState(false);
 const [done,setDone]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState('');
 const getProgress=x=>{
  const r=track.current?.getBoundingClientRect();
  if(!r)return 0;
  const travel=Math.max(1,r.width-72);
  return Math.min(1,Math.max(0,(x-r.left-36)/travel));
 };
 const reset=()=>{pointer.current=null;setDragging(false);setProgress(0)};
 const finish=async()=>{
  if(disabled||locked.current)return;
  locked.current=true;setDragging(false);setProgress(1);setBusy(true);setError('');
  try{
   const confirmed=await onConfirm?.();
   if(confirmed!==true){
    locked.current=false;setDone(false);setProgress(0);
    return;
   }
   setDone(true);
  }catch{
   locked.current=false;setDone(false);setProgress(0);
   setError('No se pudo confirmar. Revisá los datos y volvé a intentarlo.');
  }finally{setBusy(false)}
 };
 const down=e=>{if(disabled||locked.current||e.button!==0)return;pointer.current=e.pointerId;setDragging(true);setProgress(getProgress(e.clientX));e.currentTarget.setPointerCapture?.(e.pointerId)};
 const move=e=>{if(pointer.current!==e.pointerId||disabled)return;setProgress(getProgress(e.clientX))};
 const up=e=>{if(pointer.current!==e.pointerId)return;const p=getProgress(e.clientX);pointer.current=null;setDragging(false);if(p>=.91)void finish();else reset()};
 useEffect(()=>{if(disabled&&!locked.current){setProgress(0);setDragging(false)}},[disabled]);
 return <div className="dv-slide-wrap">
  <div ref={track} className={'dv-slide-track '+(disabled||busy?'is-disabled ':'')+(dragging?'is-dragging ':'')+(done?'is-done':'')} role="slider" aria-label={label} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(progress*100)} aria-disabled={disabled||busy} aria-busy={busy} tabIndex={disabled||busy?-1:0} onKeyDown={e=>{if(disabled||locked.current)return;if(['Enter',' '].includes(e.key)){e.preventDefault();void finish();return}if(['ArrowRight','ArrowLeft','Home','End'].includes(e.key)){e.preventDefault();setProgress(p=>e.key==='Home'?0:e.key==='End'?1:Math.max(0,Math.min(1,p+(e.key==='ArrowRight'?.2:-.2))))}}} onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={reset} onLostPointerCapture={()=>{if(pointer.current!==null)reset()}}>
   <div className="dv-slide-fill" style={{width:`calc(68px + (100% - 68px) * ${progress})`}}/>
   <span className="dv-slide-text">{done?(label.toLowerCase().includes('program')?'¡Pedido programado!':'¡Pedido confirmado!'):busy?'Validando pedido…':label}{!done&&amount&&<small>{amount}</small>}</span>
   <div className="dv-slide-knob" style={{left:`calc((100% - 68px) * ${progress})`}} aria-hidden="true"><span className="dv-slide-logo"><img className="dv-slide-d-image" src={`${import.meta.env.BASE_URL}dvolada-slide-white.svg`} alt="" draggable="false"/></span></div>
   <span className="dv-slide-chevrons" aria-hidden="true">›››</span>
  </div>
  <small className="dv-slide-hint">{error|| (disabled?'Completá los datos para habilitar la confirmación.':'')}</small>
 </div>;
}
