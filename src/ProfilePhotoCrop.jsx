import React,{useEffect,useRef,useState} from 'react';

export default function ProfilePhotoCrop({onSave,notify}){
 const [file,setFile]=useState(null),[image,setImage]=useState(null);
 const [zoom,setZoom]=useState(1),[x,setX]=useState(50),[y,setY]=useState(50);
 const canvas=useRef(null),picker=useRef(null);
 useEffect(()=>{
  if(!file)return;
  let active=true,bitmap;
  async function load(){
   try{
    if(typeof createImageBitmap==='function'){
     try{bitmap=await createImageBitmap(file)}catch{}
     if(bitmap){if(active)setImage(bitmap);else bitmap.close();return}
    }
    const dataUrl=await new Promise((resolve,reject)=>{
     const reader=new FileReader();
     reader.onload=()=>resolve(reader.result);
     reader.onerror=()=>reject(reader.error);
     reader.readAsDataURL(file);
    });
    if(!active)return;
    const decoded=await new Promise((resolve,reject)=>{
     const img=new Image();
     img.onload=()=>resolve(img);
     img.onerror=reject;
     img.src=dataUrl;
    });
    if(active)setImage(decoded);
   }catch{
    if(active){close();notify('No se pudo abrir esta imagen. Probá con una foto JPG, PNG o WebP guardada en tu teléfono.')}
   }
  }
  load();
  return()=>{active=false;bitmap?.close()};
 },[file]);
 useEffect(()=>{
  if(!image||!canvas.current)return;
  const w=image.naturalWidth||image.width,h=image.naturalHeight||image.height;
  const size=Math.min(w,h)/zoom;
  const context=canvas.current.getContext('2d');
  context.clearRect(0,0,320,320);
  context.drawImage(image,(w-size)*x/100,(h-size)*y/100,size,size,0,0,320,320);
 },[image,zoom,x,y]);
 function close(){setImage(null);setFile(null);if(picker.current)picker.current.value=''}
 return <>
  <label className="dv-profile-upload">Cambiar foto<input ref={picker} type="file" accept="image/jpeg,image/png,image/webp" onChange={event=>{
   const picked=event.currentTarget.files?.[0];
   if(!picked)return;
   if(picked.size>12000000){event.currentTarget.value='';notify('Elegí una foto de hasta 12 MB.');return}
   setImage(null);setZoom(1);setX(50);setY(50);setFile(picked);
  }}/></label>
  {file&&<div className="modal-backdrop"><section className="modal" role="dialog" aria-modal="true" aria-label="Recortar foto de perfil">
   <h2>Recortar foto</h2>
   {!image&&<p role="status">Abriendo foto…</p>}
   <canvas ref={canvas} width={320} height={320} aria-label="Vista previa del recorte" style={{display:'block',width:'min(100%, 220px)',margin:'auto',borderRadius:'50%'}}/>
   <label>Zoom<input type="range" min={1} max={4} step={0.05} value={zoom} onChange={e=>setZoom(Number(e.target.value))}/></label>
   <label>Posición horizontal<input type="range" value={x} onChange={e=>setX(Number(e.target.value))}/></label>
   <label>Posición vertical<input type="range" value={y} onChange={e=>setY(Number(e.target.value))}/></label>
   <button type="button" className="primary" disabled={!image} onClick={()=>{if(onSave(canvas.current.toDataURL('image/jpeg',0.85)))close()}}>Usar recorte</button>
   <button type="button" className="secondary" onClick={close}>Cancelar</button>
  </section></div>}
 </>;
}
