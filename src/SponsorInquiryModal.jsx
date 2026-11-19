import React,{useEffect,useRef,useState} from 'react';
import {X,Mail,Copy,MessageCircle,CheckCircle2} from 'lucide-react';
import {DEFAULT_CONTACT_EMAIL,formatSponsorInquiry,sponsorEmailLink,sponsorWhatsappLink,validateSponsorInquiry} from './sponsor-inquiry.js';
import './home-sponsors.css';

// El número se configura al publicarlo; nunca mostramos un WhatsApp ficticio.
const publicWhatsapp=import.meta.env.VITE_DVOLADA_PUBLICIDAD_WHATSAPP||'';
const contactEmail=import.meta.env.VITE_DVOLADA_PUBLICIDAD_EMAIL||DEFAULT_CONTACT_EMAIL;
const initial={name:'',business:'',phone:'',city:'',space:'No sé, necesito asesoría',details:'',consent:false};
export default function SponsorInquiryModal({onClose}){
 const [form,setForm]=useState(initial),[attempted,setAttempted]=useState(false),[feedback,setFeedback]=useState(''),[showCopy,setShowCopy]=useState(false);
 const closeRef=useRef(null),modalRef=useRef(null);
 const valid=validateSponsorInquiry(form);
 const canContact=Object.values(valid).every(Boolean);
 const whatsappLink=sponsorWhatsappLink(form,publicWhatsapp);
 const emailLink=sponsorEmailLink(form,contactEmail);
 const text=formatSponsorInquiry(form);
 useEffect(()=>{
  const lastFocus=document.activeElement;
  const oldOverflow=document.body.style.overflow;
  document.body.style.overflow='hidden';
  closeRef.current?.focus();
  const onKeys=e=>{
   if(e.key==='Escape'){e.preventDefault();onClose();return}
   if(e.key!=='Tab')return;
   const focusables=modalRef.current?.querySelectorAll('button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled])');
   if(!focusables?.length)return;
   const first=focusables[0],last=focusables[focusables.length-1];
   if(e.shiftKey&&document.activeElement===first){e.preventDefault();last.focus()}
   else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first.focus()}
  };
  document.addEventListener('keydown',onKeys);
  return()=>{document.body.style.overflow=oldOverflow;document.removeEventListener('keydown',onKeys);lastFocus?.focus?.()};
 },[onClose]);
 const update=(key,value)=>{setForm(s=>({...s,[key]:value}));setFeedback('');setShowCopy(false)};
 const prepareContact=(channel)=>{
  setAttempted(true);
  if(!canContact){setFeedback('Completá tu nombre, negocio, teléfono y autorización para continuar.');return}
  const url=channel==='whatsapp'?whatsappLink:emailLink;
  if(!url){setFeedback('Este canal todavía no está configurado. Copiá la solicitud para enviarla por otro medio.');setShowCopy(true);return}
  setFeedback(channel==='whatsapp'?'Se abrirá WhatsApp; enviá el mensaje para que lo recibamos.':'Se abrirá tu aplicación de correo. Revisá el mensaje y tocá Enviar para hacérnoslo llegar.');
  window.location.assign(url);
 };
 const copy=async()=>{
  setAttempted(true);
  if(!canContact){setFeedback('Completá los campos obligatorios antes de copiar.');return}
  setShowCopy(true);
  try{await navigator.clipboard.writeText(text);setFeedback('Solicitud copiada. Enviála por el canal que prefirás.')}catch{setFeedback('Seleccioná y copiá el texto de abajo para enviarlo.')}
 };
 return <div className="dv-ad-modal-overlay" onMouseDown={e=>{if(e.target===e.currentTarget)onClose()}}>
  <section ref={modalRef} className="dv-ad-modal" role="dialog" aria-modal="true" aria-labelledby="dv-ad-form-title" aria-describedby="dv-ad-form-desc">
   <div className="dv-ad-modal-header"><div><span className="dv-ad-eyebrow">PUBLICIDAD EN DVOLADA</span><h2 id="dv-ad-form-title">Tu marca puede estar aquí.</h2><p id="dv-ad-form-desc">Contanos sobre tu negocio y prepará tu consulta para recibir información sobre los espacios publicitarios.</p></div><button ref={closeRef} className="dv-ad-close" type="button" onClick={onClose} aria-label="Cerrar formulario"><X size={20}/></button></div>
   <form onSubmit={e=>{e.preventDefault();prepareContact('email')}} noValidate>
    <div className="dv-ad-form-grid">
     <label>Tu nombre <span>*</span><input required maxLength={80} autoComplete="name" value={form.name} onChange={e=>update('name',e.target.value)} placeholder="Nombre y apellido" aria-invalid={attempted&&!valid.name}/></label>
     <label>Nombre del negocio <span>*</span><input required maxLength={100} autoComplete="organization" value={form.business} onChange={e=>update('business',e.target.value)} placeholder="Tu negocio o marca" aria-invalid={attempted&&!valid.business}/></label>
     <label>WhatsApp o teléfono <span>*</span><input required type="tel" inputMode="tel" maxLength={24} autoComplete="tel" value={form.phone} onChange={e=>update('phone',e.target.value)} placeholder="Ej. 9999-9999" aria-invalid={attempted&&!valid.phone}/></label>
     <label>Ciudad o municipio <input maxLength={90} value={form.city} onChange={e=>update('city',e.target.value)} placeholder="¿Desde dónde anunciás?"/></label>
     <label className="dv-ad-full">Tipo de publicidad <select value={form.space} onChange={e=>update('space',e.target.value)}><option>No sé, necesito asesoría</option><option>Spot en carrusel</option><option>Spot compacto</option><option>Quiero conocer todos los espacios</option></select></label>
     <label className="dv-ad-full">Mensaje (opcional)<textarea rows={3} maxLength={500} value={form.details} onChange={e=>update('details',e.target.value)} placeholder="Contanos qué te gustaría promocionar."/></label>
    </div>
    <label className="dv-ad-consent"><input type="checkbox" checked={form.consent} onChange={e=>update('consent',e.target.checked)} aria-invalid={attempted&&!valid.consent}/><span>Acepto compartir estos datos con Dvolada únicamente para responder mi consulta comercial. <strong>*</strong></span></label>
    {feedback&&<p className="dv-ad-feedback" role="status">{feedback}</p>}
    <div className="dv-ad-modal-actions">
     <button type="submit" className="dv-ad-action-primary"><Mail size={17}/> Preparar correo</button>
     {whatsappLink&&<button type="button" className="dv-ad-action-secondary" onClick={()=>prepareContact('whatsapp')}><MessageCircle size={17}/> Abrir WhatsApp</button>}
     <button type="button" className="dv-ad-action-secondary" onClick={copy}><Copy size={17}/> Copiar solicitud</button>
    </div>
    {showCopy&&<textarea className="dv-ad-copy-text" readOnly aria-label="Texto de solicitud para copiar" onFocus={e=>e.target.select()} value={text} rows={8}/>}
    <p className="dv-ad-privacy"><CheckCircle2 size={15}/> No se cobra ni reserva un espacio aquí. Dvolada no guarda automáticamente estos datos: para recibirlos, tenés que enviar el correo o mensaje que se abre.</p>
    {emailLink&&<p className="dv-ad-recipient">Destino: {contactEmail}</p>}
   </form>
  </section>
 </div>;
}
