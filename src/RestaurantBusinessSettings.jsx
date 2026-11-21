import React,{useEffect,useRef,useState} from 'react';
import {AlertCircle,Camera,CheckCircle2,Clock3,Image as ImageIcon,MapPin,Save,Store} from 'lucide-react';
import {readPhotoAsThumbnail,safeCatalogImage} from './restaurant-menu-rules.js';
import {WEEK_DAYS,fillBusinessHours,buildBusinessPatch,validateBusinessProfile} from './restaurant-business-rules.js';
import './restaurant-business-settings.css';

const makeDraft=restaurant=>({
 name:restaurant?.name||'',type:restaurant?.type||'',description:restaurant?.description||'',
 address:restaurant?.address||'',phone:restaurant?.phone||'',image:restaurant?.image||'',
 hours:fillBusinessHours(restaurant?.hours),
});

export default function RestaurantBusinessSettings({restaurant,onSave=()=>false}){
 const [draft,setDraft]=useState(()=>makeDraft(restaurant)),[errors,setErrors]=useState({}),[notice,setNotice]=useState(''),[photoBusy,setPhotoBusy]=useState(false);
 const photoRequest=useRef(0),formRef=useRef(null);
 useEffect(()=>{
  photoRequest.current++;
  setPhotoBusy(false);
  setDraft(makeDraft(restaurant));setErrors({});setNotice('');
  return ()=>{photoRequest.current++};
 },[restaurant?.id]);
 const edit=(key,value)=>{setDraft(s=>({...s,[key]:value}));setErrors(e=>({...e,[key]:null}));};
 const editDay=(id,key,value)=>{setDraft(s=>({...s,hours:{...s.hours,[id]:{...(s.hours[id]||{}),[key]:value}}}));setErrors(e=>({...e,hours:null}))};
 const photo=async e=>{
  const file=e.target.files?.[0];e.target.value='';if(!file)return;
  const request=++photoRequest.current;
  setPhotoBusy(true);setErrors(old=>({...old,image:null}));
  try{
   const value=await readPhotoAsThumbnail(file);
   if(request===photoRequest.current){edit('image',value);setNotice('Foto reducida para el perfil de prueba.')}
  }catch(error){
   if(request===photoRequest.current)setErrors(old=>({...old,image:error.message||'No se pudo procesar la imagen.'}));
  }finally{if(request===photoRequest.current)setPhotoBusy(false)}
 };
 const submit=e=>{
  e.preventDefault();
  if(photoBusy)return;
  const validation=validateBusinessProfile(draft);
  if(Object.keys(validation).length){
   setErrors(validation);setNotice('Revisá los campos señalados.');
   requestAnimationFrame(()=>formRef.current?.querySelector('[aria-invalid="true"]')?.focus());
   return;
  }
  try{
   const ok=onSave(buildBusinessPatch(draft));
   setNotice(ok===false?'No se pudieron guardar los cambios de prueba. Revisá el espacio disponible.':'Ficha guardada en este navegador. Los cambios aún no se comparten con otros dispositivos.');
  }catch(error){setErrors(error.errors||{});setNotice('No se pudo guardar el perfil.')}
 };
 return <section className="dv-business-settings" aria-labelledby="dv-business-heading">
  <header><div><span className="dv-business-eyebrow"><Store size={16}/> FICHA PÚBLICA · RESTAURANTE</span><h2 id="dv-business-heading">La identidad de tu negocio.</h2><p>Prepará la información, fotografía y horarios que verán los clientes cuando el servidor esté conectado.</p></div><div className="dv-business-local-badge"><AlertCircle size={17}/> Vista de prueba local</div></header>
  <form ref={formRef} onSubmit={submit} noValidate>
   {Object.values(errors).some(Boolean)&&<p className="dv-business-error-summary" role="alert">No se guardó la ficha. Corregí los campos señalados.</p>}
   <div className="dv-business-form-grid">
    <div className="dv-business-photo-area"><div className="dv-business-photo-preview">{safeCatalogImage(draft.image)?<img src={safeCatalogImage(draft.image)} alt="Vista previa del restaurante"/>:<><ImageIcon size={40}/><small>Foto del negocio</small></>}</div>
     <label className="dv-business-photo-button"><Camera size={17}/> {photoBusy?'Procesando…':'Elegir foto del restaurante'}<input type="file" accept="image/jpeg,image/png,image/webp" onChange={photo} disabled={photoBusy}/></label>
     <small className="dv-business-caption">Esta fotografía se guarda solo en el navegador de pruebas. Work integrará el almacenamiento definitivo.</small>
     {String(draft.image).startsWith('data:')&&<button type="button" className="dv-business-clear-photo" onClick={()=>edit('image','')}>Quitar foto local</button>}
     {errors.image&&<small className="dv-business-error">{errors.image}</small>}
    </div>
    <div className="dv-business-fields">
     <label>Nombre del negocio <span>*</span><input required maxLength={85} aria-invalid={Boolean(errors.name)} value={draft.name} onChange={e=>edit('name',e.target.value)} placeholder="Ej. Comedor Doña Rosa"/>{errors.name&&<small className="dv-business-error">{errors.name}</small>}</label>
     <label>Tipo de comida o especialidad<input maxLength={55} aria-invalid={Boolean(errors.type)} value={draft.type} onChange={e=>edit('type',e.target.value)} placeholder="Ej. Comida típica hondureña"/>{errors.type&&<small className="dv-business-error">{errors.type}</small>}</label>
     <label>Descripción<textarea maxLength={400} rows={3} aria-invalid={Boolean(errors.description)} value={draft.description} onChange={e=>edit('description',e.target.value)} placeholder="Contá qué hace especial tu restaurante"/>{errors.description&&<small className="dv-business-error">{errors.description}</small>}</label>
     <div className="dv-business-field-pair"><label><MapPin size={15}/> Dirección<input maxLength={180} aria-invalid={Boolean(errors.address)} value={draft.address} onChange={e=>edit('address',e.target.value)} placeholder="Barrio, calle y referencia"/>{errors.address&&<small className="dv-business-error">{errors.address}</small>}</label>
      <label>Teléfono del restaurante<input type="tel" maxLength={25} aria-invalid={Boolean(errors.phone)} value={draft.phone} onChange={e=>edit('phone',e.target.value)} placeholder="9999-9999"/>{errors.phone&&<small className="dv-business-error">{errors.phone}</small>}</label>
     </div>
     <label>URL de fotografía (opcional)<input aria-invalid={Boolean(errors.image)} value={String(draft.image).startsWith('data:')?'Foto seleccionada localmente':draft.image} disabled={String(draft.image).startsWith('data:')} onChange={e=>edit('image',e.target.value)} placeholder="https://misitio.com/restaurante.jpg"/></label>
    </div>
   </div>
   <div className="dv-business-hours"><div className="dv-business-hours-head"><div><span className="dv-business-eyebrow"><Clock3 size={16}/> HORARIOS</span><h3>¿Qué días atienden?</h3><p>Activá únicamente los días y horas reales. Si el cierre es anterior a la apertura, se considera el día siguiente (por ejemplo, 18:00–01:00). En la prueba se usa la hora local del dispositivo.</p></div></div>
    <div className="dv-business-days">{WEEK_DAYS.map(({id,label})=>{
     const day=draft.hours[id];
     return <div className={'dv-business-day '+(day?.enabled?'active':'')} key={id}>
      <label className="dv-business-day-toggle"><input type="checkbox" checked={Boolean(day?.enabled)} onChange={e=>editDay(id,'enabled',e.target.checked)}/><span>{label}</span></label>
      <label>Apertura<input aria-label={'Apertura de '+label} type="time" value={day?.open||'08:00'} onChange={e=>editDay(id,'open',e.target.value)} disabled={!day?.enabled}/></label>
      <label>Cierre<input aria-label={'Cierre de '+label} type="time" value={day?.close||'20:00'} onChange={e=>editDay(id,'close',e.target.value)} disabled={!day?.enabled}/></label>
     </div>;
    })}</div>
    {errors.hours&&<p className="dv-business-error" role="alert">{errors.hours}</p>}
   </div>
   <div className="dv-business-footer"><div><CheckCircle2 size={18}/><span>La disponibilidad del restaurante y la recepción de pedidos reales requerirán sincronización con el servidor.</span></div><button type="submit" disabled={photoBusy}><Save size={18}/> Guardar ficha del restaurante</button></div>
   {notice&&<p className="dv-business-notice" role="status">{notice}</p>}
  </form>
 </section>;
}
