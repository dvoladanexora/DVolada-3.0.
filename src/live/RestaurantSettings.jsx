import React,{useEffect,useState} from 'react';

const weekdays=['Lunes','Martes','Miércoles','Jueves','Viernes','Sábado','Domingo'];
const labels={cash:'Efectivo',transfer:'Transferencia',external_card:'Tarjeta externa'};
const blankOption={id:null,name:'',kind:'extra',price:'0',available:true};

export function RestaurantProfile({api,id,run,busy,offline}){
 const [profile,setProfile]=useState(null),[error,setError]=useState('');
 useEffect(()=>{
  if(offline)return;
  let active=true;
  api.restaurantProfile(id).then(data=>{if(active){setProfile(data.profile);setError('')}})
   .catch(()=>{if(active)setError('No se pudo cargar el perfil.')});
  return()=>{active=false};
 },[api,id,offline]);
 const field=key=>({value:profile?.[key]??'',onChange:event=>setProfile({...profile,[key]:event.target.value})});
 const changeHours=(day,hour)=>setProfile({...profile,hours:profile.hours.map((value,index)=>index===day?hour:value)});
 async function save(event){
  event.preventDefault();
  const number=value=>value===null||value===''?null:Number(value);
  const result=await run(()=>api.saveRestaurantProfile(id,{...profile,latitude:number(profile.latitude),longitude:number(profile.longitude)}),{refresh:false});
  if(result)setProfile(result.profile);
 }
 return <section className="dvl-panel"><h2>Perfil del restaurante</h2>
  {error&&<p role="alert">{error}</p>}
  {profile&&<form className="dvl-stack" onSubmit={save}>
   <label>Descripción<textarea rows={3} maxLength={500} {...field('description')}/></label>
   <label>Dirección<input maxLength={250} {...field('address')}/></label>
   <div className="dvl-grid"><label>Latitud<input type="number" step="any" min="-90" max="90" {...field('latitude')}/></label>
    <label>Longitud<input type="number" step="any" min="-180" max="180" {...field('longitude')}/></label></div>
   <fieldset className="dvl-options"><legend>Horarios publicados · hora de Honduras</legend>
    {weekdays.map((day,index)=><div className="dvl-row dvl-hours" key={day}>
     <label className="dvl-favorite-filter"><input type="checkbox" checked={Boolean(profile.hours[index])}
      onChange={event=>changeHours(index,event.target.checked?['08:00','17:00']:null)}/>{day}</label>
     {profile.hours[index]&&<div className="dvl-inline">{['Apertura','Cierre'].map((label,point)=><label key={label}>{label}
      <input aria-label={day+' '+label.toLowerCase()} type="time" value={profile.hours[index][point]}
       onChange={event=>changeHours(index,profile.hours[index].map((time,i)=>i===point?event.target.value:time))} required/>
     </label>)}</div>}
    </div>)}
   </fieldset>
   <fieldset className="dvl-options"><legend>Métodos que registra Caja</legend>
    {Object.entries(labels).map(([value,label])=><label key={value} className="dvl-favorite-filter"><input type="checkbox"
     checked={profile.paymentMethods.includes(value)} onChange={event=>setProfile({...profile,paymentMethods:event.target.checked?
      [...profile.paymentMethods,value]:profile.paymentMethods.filter(item=>item!==value)})}/>{label}</label>)}
   </fieldset>
   <button className="dvl-action" disabled={busy||offline||!profile.paymentMethods.length}>Guardar perfil</button>
  </form>}
 </section>;
}

export function RestaurantStaff({api,id,owner,run,busy,offline}){
 const [staff,setStaff]=useState([]),[userId,setUser]=useState(''),[role,setRole]=useState('kitchen'),[error,setError]=useState('');
 const roles={owner:'Propietario',manager:'Gerencia',kitchen:'Cocina',cashier:'Caja'};
 useEffect(()=>{
  if(offline)return;
  let active=true;
  api.staffRoster(id).then(data=>{if(active){setStaff(data.staff);setError('')}})
   .catch(()=>{if(active)setError('No se pudo cargar el personal.')});
  return()=>{active=false};
 },[api,id,offline]);
 async function update(idUser,staffRole,active){
  const data=await run(()=>api.saveStaff(id,{userId:idUser,role:staffRole,active}),{refresh:false});
  if(data){setStaff(data.staff);setUser('')}
 }
 return <section className="dvl-panel"><h2>Personal y permisos</h2>
  <p>Usá el ID de vinculación de la cuenta que recibió su acceso autorizado.</p>
  {error&&<p role="alert">{error}</p>}
  {owner&&<form className="dvl-grid" onSubmit={event=>{event.preventDefault();update(userId.trim(),role,true)}}>
   <label>ID de vinculación<input value={userId} onChange={event=>setUser(event.target.value)} required minLength={36} maxLength={36}/></label>
   <label>Rol<select value={role} onChange={event=>setRole(event.target.value)}>
    {Object.entries(roles).filter(([value])=>value!=='owner').map(([value,label])=><option key={value} value={value}>{label}</option>)}
   </select></label>
   <button className="dvl-action" disabled={busy||offline||userId.trim().length!==36}>Vincular personal</button>
  </form>}
  <ul>{staff.map(row=><li key={row.user_id} className="dvl-row">
   <span>{row.display_name} · {roles[row.staff_role]} · {row.active?'Activo':'Inactivo'}</span>
   {owner&&row.staff_role!=='owner'&&<button type="button" className="dvl-action secondary" disabled={busy||offline}
    onClick={()=>update(row.user_id,row.staff_role,!row.active)}>{row.active?'Retirar acceso':'Restaurar acceso'}</button>}
  </li>)}</ul>
 </section>;
}

export function ProductDetails({api,id,product,run,busy,offline,onSaved}){
 const [category,setCategory]=useState(product.category||''),[options,setOptions]=useState(null),[option,setOption]=useState(blankOption);
 const [error,setError]=useState('');
 async function load(){const data=await api.menuOptions(id,product.id);setOptions(data.options)}
 async function picture(event){
  const file=event.target.files?.[0];
  if(!file)return;
  if(file.size>122880||!['image/jpeg','image/png','image/webp'].includes(file.type)){
   setError('Elegí JPG, PNG o WebP de hasta 120 KB.');return;
  }
  const bytes=new Uint8Array(await file.arrayBuffer());
  setError('');
  if(await run(()=>api.saveProductPhoto(id,product.id,btoa(String.fromCharCode(...bytes.slice(0,60000))+
    String.fromCharCode(...bytes.slice(60000,120000))+String.fromCharCode(...bytes.slice(120000)))),{refresh:false}))onSaved();
 }
 async function saveOption(event){
  event.preventDefault();
  const data=await run(()=>api.saveMenuOption(id,product.id,option.id,{name:option.name,kind:option.kind,
   priceMinor:Math.round(Number(option.price)*100),available:option.available}),{refresh:false});
  if(data){setOption(blankOption);await load().catch(()=>setError('No se pudieron actualizar las opciones.'))}
 }
 return <details className="dvl-stack"><summary>Editar categoría, foto y opciones de {product.name}</summary>
  {error&&<p role="alert">{error}</p>}
  {product.photoUrl&&<img className="dvl-menu-photo" src={product.photoUrl} alt={product.name} loading="lazy"/>}
  <label className="dvl-input-row">Foto (JPG, PNG o WebP)<input type="file" accept="image/jpeg,image/png,image/webp" onChange={picture} disabled={busy||offline}/></label>
  <form className="dvl-grid" onSubmit={async event=>{event.preventDefault();
   if(await run(()=>api.updateProduct(id,product.id,{category}),{refresh:false}))onSaved()}}>
   <label>Categoría<input maxLength={60} value={category} onChange={event=>setCategory(event.target.value)}/></label>
   <button className="dvl-action secondary" disabled={busy||offline}>Guardar categoría</button>
  </form>
  <button type="button" className="dvl-action secondary" disabled={busy||offline}
   onClick={()=>load().catch(()=>setError('No se pudieron cargar las opciones.'))}>Ver variantes y extras</button>
  {options&&<>
   <ul>{options.map(item=><li key={item.id}>{item.name} · {item.kind==='variant'?'Variante':'Extra'} · {item.available?'Disponible':'Agotado'}
    <button type="button" className="dvl-action secondary" onClick={()=>setOption({...item,price:String(item.price_minor/100),available:Boolean(item.available)})}>Editar</button>
   </li>)}</ul>
   <form className="dvl-grid" onSubmit={saveOption}>
    <label>Nombre de opción<input value={option.name} onChange={event=>setOption({...option,name:event.target.value})} required maxLength={100}/></label>
    <label>Tipo<select value={option.kind} onChange={event=>setOption({...option,kind:event.target.value})}><option value="extra">Extra</option><option value="variant">Variante</option></select></label>
    <label>Precio adicional (L)<input type="number" min="0" max="100000" step=".01" value={option.price} onChange={event=>setOption({...option,price:event.target.value})} required/></label>
    <label className="dvl-favorite-filter"><input type="checkbox" checked={option.available} onChange={event=>setOption({...option,available:event.target.checked})}/> Disponible</label>
    <button className="dvl-action" disabled={busy||offline}>Guardar opción</button>
    {option.id&&<button className="dvl-action secondary" type="button" onClick={()=>setOption(blankOption)}>Nueva opción</button>}
   </form>
  </>}
 </details>;
}
