import React,{useRef,useState} from 'react';
import {Camera,CheckCircle2,Plus} from 'lucide-react';
import {MENU_CATEGORIES,readPhotoAsThumbnail} from '../restaurant-menu-rules.js';

export default function PublishFood({api,restaurantId,run,busy,offline}){
 const [name,setName]=useState(''),[category,setCategory]=useState('Otros'),[price,setPrice]=useState('');
 const [photo,setPhoto]=useState(''),[processing,setProcessing]=useState(false),[error,setError]=useState(''),[saved,setSaved]=useState('');
 const fileRef=useRef(null),generation=useRef(0),sending=useRef(false);
 async function choose(event){
  const token=++generation.current,file=event.target.files?.[0];
  setPhoto('');setError('');setSaved('');
  if(!file){setProcessing(false);return}
  setProcessing(true);
  try{
   const data=await readPhotoAsThumbnail(file,120*1024);
   if(token===generation.current)setPhoto(data);
  }catch(e){if(token===generation.current)setError(e.message||'No se pudo preparar la foto.')}
  finally{if(token===generation.current)setProcessing(false)}
 }
 async function publish(event){
  event.preventDefault();
  if(sending.current||busy||offline||processing||error||!valid)return;
  sending.current=true;setSaved('');
  try{
   const result=await run(()=>api.createProduct(restaurantId,{name:name.trim(),category,priceMinor:Math.round(Number(price)*100),available:true,...(photo?{photoBase64:photo.split(',')[1]}:{})}));
   if(result?.product?.id){setSaved(result.product.name+' se publicó en el menú.');setName('');setPrice('');setPhoto('');generation.current++;if(fileRef.current)fileRef.current.value=''}
  }finally{sending.current=false}
 }
 const valid=name.trim().length>=2&&/^\d{1,6}(\.\d{1,2})?$/.test(price)&&Number(price)>0&&Number(price)<=10000;
 return <form className="dvl-stack" onSubmit={publish}>
  <h3><Plus size={20}/> Subir comida</h3>
  <p>Agregá tus platillos al catálogo del restaurante.</p>
  <label>Nombre de la comida<input value={name} onChange={e=>setName(e.target.value)} maxLength={150} required placeholder="Ej. Pollo con tajadas" disabled={busy}/></label>
  <div className="dvl-grid"><label>Categoría<select value={category} onChange={e=>setCategory(e.target.value)} disabled={busy}>{MENU_CATEGORIES.map(c=><option key={c}>{c}</option>)}</select></label>
  <label>Precio (L)<input type="number" min=".01" max="10000" step=".01" value={price} onChange={e=>setPrice(e.target.value)} required placeholder="130.00" disabled={busy}/></label></div>
  <label><Camera size={18}/> Fotografía de la comida<input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp" onChange={choose} disabled={busy||offline}/></label>
  {processing&&<p role="status">Preparando foto…</p>}
  {photo&&<img className="dvl-menu-photo" src={photo} alt="Vista previa de la comida"/>}
  {error&&<p role="alert">{error} <button type="button" className="dvl-action secondary" onClick={()=>{generation.current++;setPhoto('');setError('');setProcessing(false);if(fileRef.current)fileRef.current.value=''}}>Quitar foto</button></p>}
  <button type="submit" className="dvl-action" disabled={busy||offline||processing||Boolean(error)||!valid}><CheckCircle2 size={18}/> Publicar comida</button>
  {saved&&<p role="status">{saved}</p>}
 </form>;
}
