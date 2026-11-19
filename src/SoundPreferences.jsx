import React,{useEffect,useRef,useState} from 'react';
import {Bell,CheckCircle2,Volume2,VolumeX,X,Play,ShieldCheck} from 'lucide-react';
import './sound-preferences.css';

export function SoundOnboarding({onEnable,onDismiss}){
 return <aside className="dv-sound-onboard" aria-label="Activar sonido de Dvolada">
  <div className="dv-sound-onboard-icon"><Volume2 size={22}/></div>
  <div className="dv-sound-onboard-info"><strong>¿Querés escuchar el bip-bip? 🛵</strong><span>Activá el sonido de confirmación y escuchá una prueba. Podés cambiarlo después en Más.</span></div>
  <div className="dv-sound-onboard-actions"><button type="button" className="dv-sound-onboard-enable" onClick={onEnable}>Activar y probar</button><button type="button" onClick={onDismiss}>Ahora no</button></div>
 </aside>;
}
export default function SoundPreferences({soundEnabled,onSoundChange,onPreview,onClose,permission,onRequestPermission}){
 const closeRef=useRef(null),dialogRef=useRef(null),[message,setMessage]=useState('');
 useEffect(()=>{
  const prevFocus=document.activeElement,prev=document.body.style.overflow;document.body.style.overflow='hidden';closeRef.current?.focus();
  const key=e=>{if(e.key==='Escape'){e.preventDefault();onClose()}if(e.key==='Tab'){const controls=dialogRef.current?.querySelectorAll('button:not([disabled]),input:not([disabled])');if(!controls?.length)return;const first=controls[0],last=controls[controls.length-1];if(e.shiftKey&&document.activeElement===first){e.preventDefault();last.focus()}else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first.focus()}}};
  document.addEventListener('keydown',key);return()=>{document.body.style.overflow=prev;document.removeEventListener('keydown',key);prevFocus?.focus?.()};
 },[]);
 const notify=async()=>{try{const result=await onRequestPermission();setMessage(result==='granted'?'Permiso concedido. Los avisos con la app cerrada requieren nuestro futuro servidor.':result==='denied'?'El navegador bloqueó este permiso. Podés cambiarlo en la configuración del sitio.':result==='unsupported'?'Este navegador no admite este permiso desde aquí.':'El permiso no fue concedido.')}catch{setMessage('No se pudo solicitar el permiso. Probá desde la configuración del navegador.')}};
 return <div className="dv-sound-overlay" onMouseDown={e=>{if(e.target===e.currentTarget)onClose()}}>
  <section ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby="dv-sound-title" className="dv-sound-dialog">
   <div className="dv-sound-dialog-head"><div><span>CONFIGURACIÓN · DVOLADA</span><h2 id="dv-sound-title">Sonidos y avisos</h2><p>Elegí cómo querés escuchar Dvolada en este dispositivo.</p></div><button type="button" ref={closeRef} className="dv-sound-close" onClick={onClose} aria-label="Cerrar"><X size={20}/></button></div>
   <div className="dv-sound-setting"><div className="dv-sound-setting-icon">{soundEnabled?<Volume2 size={21}/>:<VolumeX size={21}/>}</div><div className="dv-sound-setting-content"><strong>Sonido de confirmación</strong><small>Suena «bip-bip» al confirmar un pedido dentro de Dvolada.</small></div><label className="dv-sound-switch" aria-label="Activar sonido al confirmar"><input type="checkbox" checked={soundEnabled} onChange={e=>onSoundChange(e.target.checked)}/><span/></label></div>
   <button type="button" className="dv-sound-test" onClick={onPreview}><Play size={17}/> Probar el bip-bip</button>
   <div className="dv-sound-setting"><div className="dv-sound-setting-icon"><Bell size={20}/></div><div className="dv-sound-setting-content"><strong>Permiso de notificaciones</strong><small>{permission==='granted'?'Permiso del navegador activo.':permission==='denied'?'Permiso bloqueado por el navegador.':permission==='unsupported'?'Este navegador no ofrece permiso desde aquí.':'Podés permitir avisos del navegador, aunque el envío automático todavía no está disponible.'}</small></div></div>
   <button type="button" className="dv-sound-request" disabled={permission==='granted'||permission==='denied'||permission==='unsupported'} onClick={notify}>{permission==='granted'?<><CheckCircle2 size={16}/> Permiso concedido</>:permission==='denied'?'Bloqueado en navegador':permission==='unsupported'?'No disponible':'Permitir notificaciones del navegador'}</button>
   {message&&<p className="dv-sound-message" role="status">{message}</p>}
   <div className="dv-sound-disclaimer"><ShieldCheck size={18}/><span>El sonido solo se reproduce cuando la app está abierta y el sistema permite audio. Las notificaciones push con la app cerrada llegarán cuando implementemos el servidor; activar este permiso todavía no las habilita.</span></div>
  </section>
 </div>;
}
