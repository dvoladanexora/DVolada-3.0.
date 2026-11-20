import React,{useEffect,useMemo,useRef,useState} from 'react';
import {AlertCircle,ArrowLeft,Camera,Check,ChefHat,Clock3,Image as ImageIcon,MinusCircle,Package,Plus,Save,Search,SlidersHorizontal,Trash2,UtensilsCrossed, X} from 'lucide-react';
import {MENU_CATEGORIES,cleanMenuExtras,makeMenuProduct,menuSummary,readPhotoAsThumbnail,safeCatalogImage,validateMenuDraft} from './restaurant-menu-rules.js';
import './restaurant-menu-editor.css';

const emptyDraft=()=>({name:'',description:'',category:'Almuerzos',price:'',prepTime:'25',image:'',extras:'',available:true});
const formatMoney=n=>'L '+Number(n||0).toLocaleString('es-HN',{minimumFractionDigits:2,maximumFractionDigits:2});
const fold=v=>String(v||'').toLocaleLowerCase('es');

function MenuProductCard({item,onEdit,onToggle,onRequestDelete}){
 const available=item.available!==false&&item.soldOut!==true;
 const photo=safeCatalogImage(item.image);
 return <article className={'dv-menu-product '+(!available?'unavailable':'')}>
  <div className="dv-menu-product-image">{photo?<img loading="lazy" decoding="async" src={photo} alt={'Foto de '+item.name} />:<ImageIcon size={32} aria-hidden="true"/>}
   <span className={'dv-menu-product-state '+(available?'is-active':'is-inactive')}>{available?'Disponible':'Agotado'}</span>
  </div>
  <div className="dv-menu-product-content"><div className="dv-menu-product-kicker">{item.category||'Otros'} <span>·</span> <Clock3 size={13}/> {Number(item.prepTime)||25} min</div>
   <h3>{item.name}</h3><p>{item.description||'Sin descripción todavía.'}</p><div className="dv-menu-product-info"><strong>{formatMoney(item.price)}</strong>{Array.isArray(item.extras)&&item.extras.length>0&&<span>{item.extras.length} extras</span>}</div>
   <div className="dv-menu-product-actions"><button type="button" onClick={()=>onEdit(item)} className="dv-menu-edit"><SlidersHorizontal size={16}/> Editar</button>
    <button type="button" onClick={()=>onToggle(item)} className={available?'dv-menu-disable':'dv-menu-enable'}>{available?<MinusCircle size={16}/>:<Check size={16}/>} {available?'Agotar':'Activar'}</button>
    <button type="button" className="dv-menu-trash" onClick={()=>onRequestDelete(item)} aria-label={'Eliminar '+item.name}><Trash2 size={16}/></button>
   </div>
  </div>
 </article>;
}

export default function RestaurantMenuEditor({restaurant,onChange=()=>false}){
 const items=Array.isArray(restaurant?.items)?restaurant.items:[];
 const summary=menuSummary(items);
 const [query,setQuery]=useState(''),[category,setCategory]=useState('Todas'),[stock,setStock]=useState('all');
 const [form,setForm]=useState(null),[editingId,setEditingId]=useState(null),[errors,setErrors]=useState({}),[photoBusy,setPhotoBusy]=useState(false),[notice,setNotice]=useState('');
 const [deleteItem,setDeleteItem]=useState(null);
 const [visibleCount,setVisibleCount]=useState(24);
 useEffect(()=>setVisibleCount(24),[restaurant?.id,query,category,stock]);
 const closeRef=useRef(null),formRef=useRef(null),photoRequest=useRef(0);
 const categories=useMemo(()=>['Todas',...new Set([...MENU_CATEGORIES,...items.map(i=>i.category).filter(Boolean)])],[items]);
 const matching=items.filter(item=>{
  const available=item.available!==false&&item.soldOut!==true;
  return (category==='Todas'||String(item.category||'')===category)
   &&(stock==='all'||(stock==='active'?available:!available))
   &&(!query.trim()||fold(item.name+' '+(item.description||'')+' '+(item.category||'')).includes(fold(query.trim())));
 });
 const setField=(key,value)=>{setForm(current=>current?{...current,[key]:value}:current);setErrors(old=>({...old,[key]:null}));};
 const openEditor=(item=null)=>{
  photoRequest.current++;setPhotoBusy(false);
  setEditingId(item?.id??null);
  setForm(item?{name:item.name||'',description:item.description||'',category:MENU_CATEGORIES.includes(item.category)?item.category:'Otros',price:String(item.price??''),prepTime:String(item.prepTime||25),image:item.image||'',extras:cleanMenuExtras(item.extras).join(', '),available:item.available!==false&&item.soldOut!==true}:emptyDraft());
  setErrors({});setNotice('');
 };
 const closeEditor=()=>{photoRequest.current++;setPhotoBusy(false);setForm(null);setEditingId(null);setErrors({})};
 useEffect(()=>{
  if(!form&&!deleteItem)return;
  const old=document.body.style.overflow,last=document.activeElement;
  document.body.style.overflow='hidden';
  closeRef.current?.focus();
  const onKey=e=>{
   if(e.key==='Escape'){e.preventDefault();if(deleteItem)setDeleteItem(null);else closeEditor()}
   if(e.key==='Tab'){
    const controls=formRef.current?.querySelectorAll('button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled])');
    if(!controls?.length)return;
    const first=controls[0],lastCtrl=controls[controls.length-1];
    if(e.shiftKey&&document.activeElement===first){e.preventDefault();lastCtrl.focus()}
    else if(!e.shiftKey&&document.activeElement===lastCtrl){e.preventDefault();first.focus()}
   }
  };
  document.addEventListener('keydown',onKey);
  return()=>{document.body.style.overflow=old;document.removeEventListener('keydown',onKey);last?.focus?.()};
 },[Boolean(form),Boolean(deleteItem)]);
 const commit=next=>{
  try{const ok=onChange(next);if(ok===false){setNotice('No se pudieron guardar los cambios de prueba. Revisá el espacio disponible.');return false}
   setNotice('Cambios guardados solo en este navegador (demostración).');return true
  }catch{setNotice('Error guardando el catálogo local.');return false}
 };
 const save=e=>{
  e.preventDefault();
  if(photoBusy)return;
  const found=validateMenuDraft(form,items,editingId);
  if(Object.keys(found).length){setErrors(found);requestAnimationFrame(()=>formRef.current?.querySelector('[aria-invalid="true"]')?.focus());return}
  try{
   const item=makeMenuProduct(form,items,editingId);
   const next=editingId===null?[...items,item]:items.map(p=>String(p.id)===String(editingId)?item:p);
   if(commit(next))closeEditor();
  }catch(e){setErrors(e.errors||{name:'No se pudo guardar. Revisá los campos.'})}
 };
 const toggle=item=>{
  const available=item.available!==false&&item.soldOut!==true;
  const next=items.map(p=>String(p.id)===String(item.id)?{...p,available:!available,soldOut:available}:p);
  commit(next);
 };
 const remove=()=>{
  if(!deleteItem)return;
  const next=items.filter(i=>String(i.id)!==String(deleteItem.id));
  if(commit(next))setDeleteItem(null);
 };
 const upload=async event=>{
  const file=event.target.files?.[0];event.target.value='';
  if(!file)return;
  const request=++photoRequest.current;
  setPhotoBusy(true);setErrors(old=>({...old,image:null}));
  try{const url=await readPhotoAsThumbnail(file);if(request===photoRequest.current)setField('image',url)}
  catch(error){if(request===photoRequest.current)setErrors(old=>({...old,image:error.message||'No se pudo leer la imagen.'}))}
  finally{if(request===photoRequest.current)setPhotoBusy(false)}
 };
 return <section className="dv-menu-management" aria-label="Administración de menú">
  <header className="dv-menu-hero"><div><span className="dv-menu-kicker"><UtensilsCrossed size={16}/> MI MENÚ · RESTAURANTE ONLINE</span><h2>Tu carta, a tu manera.</h2><p>Agregá productos, precios, fotos, categorías y extras. Prepará tu catálogo con una vista clara antes de conectarlo al servidor.</p></div><button type="button" onClick={()=>openEditor()} className="dv-menu-add"><Plus size={19}/> Nuevo producto</button></header>
  <div className="dv-menu-summary">
   <div><span>Productos</span><strong>{summary.total}</strong></div>
   <div><span>Disponibles</span><strong>{summary.active}</strong></div>
   <div><span>Agotados</span><strong>{summary.soldOut}</strong></div>
   <div><span>Sin fotografía</span><strong>{summary.missingPhoto}</strong></div>
  </div>
  <div className="dv-menu-toolbar"><label className="dv-menu-search"><Search size={18}/><input value={query} onChange={e=>setQuery(e.target.value)} placeholder="Buscar productos o categorías..." aria-label="Buscar productos"/></label>
   <label className="dv-menu-select">Categoría<select value={category} onChange={e=>setCategory(e.target.value)}>{categories.map(c=><option key={c} value={c}>{c}</option>)}</select></label>
   <label className="dv-menu-select">Disponibilidad<select value={stock} onChange={e=>setStock(e.target.value)}><option value="all">Todos</option><option value="active">Disponibles</option><option value="off">Agotados</option></select></label>
  </div>
  <div className="dv-menu-hint"><AlertCircle size={18}/><span>**Modo de prueba local.** Los cambios se verán en el catálogo de este navegador, pero no se publican a otros teléfonos ni a otros restaurantes hasta conectar el servidor.</span></div>
  {notice&&<div role="status" className="dv-menu-feedback">{notice}<button type="button" onClick={()=>setNotice('')} aria-label="Cerrar aviso"><X size={15}/></button></div>}
  {matching.length?<><div className="dv-menu-grid">{matching.slice(0,visibleCount).map(item=><MenuProductCard key={item.id} item={item} onEdit={openEditor} onToggle={toggle} onRequestDelete={setDeleteItem}/>)}</div>{matching.length>visibleCount&&<button type="button" className="dv-menu-load-more" onClick={()=>setVisibleCount(count=>count+24)}>Mostrar 24 productos más · {Math.min(visibleCount,matching.length)} de {matching.length}</button>}</>
   :<div className="dv-menu-empty"><Package size={35}/><h3>{items.length?'No encontramos productos con estos filtros.':'Tu menú empieza aquí.'}</h3><p>{items.length?'Probá otra búsqueda o elegí otra categoría.':'Agregá el primer producto para preparar tu catálogo.'}</p><button type="button" onClick={()=>openEditor()}><Plus size={17}/> Agregar producto</button></div>}
  {form&&<div className="dv-menu-overlay" onMouseDown={e=>{if(e.target===e.currentTarget)closeEditor()}}>
   <div className="dv-menu-dialog" role="dialog" aria-modal="true" aria-labelledby="dv-menu-dialog-title" ref={formRef}>
    <div className="dv-menu-dialog-head"><div><span className="dv-menu-kicker">{editingId===null?'NUEVO PRODUCTO':'EDITAR PRODUCTO'}</span><h2 id="dv-menu-dialog-title">{editingId===null?'Agregar a mi carta':'Editar producto'}</h2></div><button ref={closeRef} type="button" onClick={closeEditor} aria-label="Cerrar editor"><X size={20}/></button></div>
    <form onSubmit={save} noValidate>
     {Object.values(errors).some(Boolean)&&<p className="dv-menu-error-summary" role="alert">Revisá los campos marcados en el formulario antes de guardar.</p>}
     <div className="dv-menu-form-grid"><div className="dv-menu-photo-section">
      <div className="dv-menu-photo-preview">{safeCatalogImage(form.image)?<img src={safeCatalogImage(form.image)} alt="Vista previa del producto"/>:<><ImageIcon size={37}/><span>Vista previa de la foto</span></>}</div>
      <label className="dv-menu-photo-upload"><Camera size={17}/> {photoBusy?'Procesando foto…':'Seleccionar fotografía'}<input type="file" accept="image/jpeg,image/png,image/webp" onChange={upload} disabled={photoBusy}/></label>
      <small>JPG, PNG o WebP · máximo 5 MB. La foto se reduce para esta prueba, no se sube al servidor.</small>
     </div><div className="dv-menu-fields">
      <label>Nombre del producto <span>*</span><input required maxLength={80} value={form.name} onChange={e=>setField('name',e.target.value)} placeholder="Ej. Pollo con tajadas" aria-invalid={Boolean(errors.name)}/>{errors.name&&<small className="dv-menu-error">{errors.name}</small>}</label>
      <div className="dv-menu-field-pair"><label>Precio (L) <span>*</span><input required type="number" min="0.01" max="10000" step="0.01" inputMode="decimal" value={form.price} onChange={e=>setField('price',e.target.value)} placeholder="95.00" aria-invalid={Boolean(errors.price)}/>{errors.price&&<small className="dv-menu-error">{errors.price}</small>}</label>
       <label>Preparación (min) <span>*</span><input type="number" min="1" max="180" value={form.prepTime} onChange={e=>setField('prepTime',e.target.value)} aria-invalid={Boolean(errors.prepTime)}/>{errors.prepTime&&<small className="dv-menu-error">{errors.prepTime}</small>}</label></div>
      <label>Categoría <span>*</span><select value={form.category} aria-invalid={Boolean(errors.category)} onChange={e=>setField('category',e.target.value)}>{MENU_CATEGORIES.map(c=><option value={c} key={c}>{c}</option>)}</select>{errors.category&&<small className="dv-menu-error">{errors.category}</small>}</label>
      <label>Descripción breve<textarea maxLength={220} rows={2} aria-invalid={Boolean(errors.description)} value={form.description} onChange={e=>setField('description',e.target.value)} placeholder="¿Qué incluye este plato?"/>{errors.description&&<small className="dv-menu-error">{errors.description}</small>}</label>
      <label>Extras opcionales (separados por coma)<textarea rows={2} value={form.extras} aria-invalid={Boolean(errors.extras)} onChange={e=>setField('extras',e.target.value)} placeholder="Queso extra, Aguacate, Salsa extra"/>{errors.extras&&<small className="dv-menu-error" role="alert">{errors.extras}</small>}<small>Hasta ocho. Durante esta demostración el cliente aplica L 10 por cada extra; los precios personalizables se conectarán después.</small></label>
      <label>URL de imagen (opcional)<input aria-invalid={Boolean(errors.image)} value={String(form.image||'').startsWith('data:')?'Foto cargada localmente':form.image} onChange={e=>setField('image',e.target.value)} placeholder="https://misitio.com/foto.jpg" disabled={String(form.image||'').startsWith('data:')}/>{errors.image&&<small className="dv-menu-error">{errors.image}</small>}</label>
      {String(form.image||'').startsWith('data:')&&<button type="button" className="dv-menu-remove-photo" onClick={()=>setField('image','')}>Quitar foto local</button>}
      <label className="dv-menu-availability"><input type="checkbox" checked={form.available} onChange={e=>setField('available',e.target.checked)}/><span>Producto disponible para pedir</span></label>
     </div></div>
     <div className="dv-menu-dialog-actions"><button type="button" onClick={closeEditor}>Cancelar</button><button type="submit" className="dv-menu-primary" disabled={photoBusy}><Save size={17}/> {editingId===null?'Guardar producto':'Guardar cambios'}</button></div>
    </form>
   </div>
  </div>}
  {deleteItem&&<div className="dv-menu-overlay" onMouseDown={e=>{if(e.target===e.currentTarget)setDeleteItem(null)}}><div role="alertdialog" aria-modal="true" aria-labelledby="dv-menu-delete-title" className="dv-menu-confirm" ref={formRef}><div className="dv-menu-danger-icon"><Trash2 size={24}/></div><h2 id="dv-menu-delete-title">¿Eliminar «{deleteItem.name}»?</h2><p>Se quitará del catálogo de prueba. Los pedidos ya registrados conservarán sus productos y cantidades.</p><div><button type="button" ref={closeRef} onClick={()=>setDeleteItem(null)}>Cancelar</button><button type="button" onClick={remove} className="dv-menu-danger">Sí, eliminar</button></div></div></div>}
 </section>;
}
