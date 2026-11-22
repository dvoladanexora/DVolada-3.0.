import React,{useEffect,useState} from 'react';

const initial={restaurantId:'',productId:'',giftProductId:'',title:'',discount:'',starts:'',ends:'',perCustomer:'1',globalLimit:'10'};
const showDate=seconds=>new Date(seconds*1000).toLocaleString('es-HN',{timeZone:'America/Tegucigalpa'});
const clock=value=>Date.parse(value+':00-06:00')/1000;

export function FlashOffers({campaigns,money,open}) {
 if(!campaigns.length)return null;
 return <section className="dvl-panel dvl-span">
  <h2>Promociones Flash</h2>
  <div className="dvl-grid">{campaigns.map(item=><article className="dvl-order" key={item.id}>
   <strong>{item.title}</strong>
   <p>{item.restaurantName}{item.productName?' · '+item.productName:''}</p>
   <p>{item.giftName?'Regalo: '+item.giftName:'Descuento de hasta '+money(item.discountMinor)}</p>
   <small>Hasta {showDate(item.endsAt)} · Honduras</small>
   <button className="dvl-action secondary" type="button" onClick={()=>open(item.restaurantId)}>Ver menú</button>
  </article>)}</div>
 </section>;
}

export function FlashAdmin({api,restaurants,busy,offline,run}) {
 const [form,setForm]=useState(initial),[products,setProducts]=useState([]),[campaigns,setCampaigns]=useState([]),[error,setError]=useState('');
 const value=field=>({value:form[field],onChange:event=>{
  const next=event.target.value;
  setForm(previous=>({...previous,[field]:next,...(field==='restaurantId'?{productId:'',giftProductId:''}:{})}));
 }});
 useEffect(()=>{
  let active=true;
  if(offline)return;
  api.adminFlash().then(data=>{if(active)setCampaigns(data.campaigns)}).catch(()=>{if(active)setError('No se pudo cargar la lista de promociones.')});
  return()=>{active=false};
 },[api,offline]);
 useEffect(()=>{
  let active=true;
  setProducts([]);setError('');
  if(form.restaurantId&&!offline)api.flashProducts(form.restaurantId)
   .then(data=>{if(active)setProducts(data.products)}).catch(()=>{if(active)setError('No se pudo cargar el menú del negocio.')});
  return()=>{active=false};
 },[api,form.restaurantId,offline]);
 async function submit(event){
  event.preventDefault();
  if(busy||offline)return;
  const startsAt=clock(form.starts),endsAt=clock(form.ends);
  const discountMinor=form.giftProductId?0:Math.round(Number(form.discount)*100);
  if(!Number.isInteger(startsAt)||!Number.isInteger(endsAt)||endsAt<=startsAt||(!form.giftProductId&&discountMinor<=0)){
   setError('Revisá el horario y el importe o regalo de la promoción.');return;
  }
  setError('');
  const result=await run(()=>api.createFlash({
   restaurantId:form.restaurantId,productId:form.productId,giftProductId:form.giftProductId,title:form.title,discountMinor,
   startsAt,endsAt,perCustomer:Number(form.perCustomer),globalLimit:Number(form.globalLimit),
  }),{refresh:false});
  if(result){setForm(initial);setCampaigns((await api.adminFlash().catch(()=>({campaigns:[]}))).campaigns)}
 }
 return <section className="dvl-panel">
  <h2>Promociones Flash</h2>
  {error&&<p role="alert">{error}</p>}
  <form className="dvl-grid" onSubmit={submit}>
   <label>Título<input required minLength={2} maxLength={80} {...value('title')}/></label>
   <label>Restaurante<select required {...value('restaurantId')}><option value="">Elegí un restaurante</option>
    {restaurants.map(row=><option key={row.id} value={row.id}>{row.name}</option>)}</select></label>
   <label>Producto requerido<select {...value('productId')}><option value="">Cualquier producto</option>
    {products.map(row=><option key={row.id} value={row.id}>{row.name}</option>)}</select></label>
   <label>Regalo<select {...value('giftProductId')}><option value="">Aplicar descuento</option>
    {products.map(row=><option key={row.id} value={row.id}>{row.name}</option>)}</select></label>
   {!form.giftProductId&&<label>Descuento en lempiras<input required type="number" min="0.01" max="1000000" step="0.01" {...value('discount')}/></label>}
   <label>Inicio (hora de Honduras)<input required type="datetime-local" {...value('starts')}/></label>
   <label>Fin (hora de Honduras)<input required type="datetime-local" {...value('ends')}/></label>
   <label>Límite por cliente<input required type="number" min="1" max="100" {...value('perCustomer')}/></label>
   <label>Límite total<input required type="number" min={form.perCustomer} max="100000" {...value('globalLimit')}/></label>
   <button className="dvl-action" type="submit" disabled={busy||offline}>Guardar campaña</button>
  </form>
  <ul className="dvl-stack">{campaigns.map(item=><li key={item.id}><strong>{item.title}</strong> · {item.restaurantName} · {showDate(item.endsAt)}
   {item.active&&<button className="dvl-action secondary" type="button" disabled={busy||offline} onClick={async()=>{
    if(await run(()=>api.stopFlash(item.id),{refresh:false}))setCampaigns(rows=>rows.map(row=>row.id===item.id?{...row,active:false}:row));
   }}>Desactivar</button>}</li>)}</ul>
 </section>;
}
