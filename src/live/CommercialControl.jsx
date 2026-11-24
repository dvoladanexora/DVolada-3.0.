import React,{useEffect,useState} from 'react';
const moneyMinor=v=>Math.round(Number(v)*100);
const dateTime=t=>new Date((t-21600)*1000).toISOString().slice(0,16);
const epoch=t=>Math.floor(Date.parse(t+'-06:00')/1000);
const today=()=>new Date(Date.now()-21600000).toISOString().slice(0,10);
const dayNum=d=>Date.parse(d+'T00:00:00Z')/86400000;
const placeLabels={carousel:'Carrusel principal',feed:'Entre productos',restaurants:'Restaurantes'};
const frequencies={monthly:'Mensual',quarterly:'Trimestral',semiannual:'Semestral',annual:'Anual',once:'Pago único'};
async function compressImage(file){
 if(!file||!['image/png','image/jpeg','image/webp'].includes(file.type)||file.size>10*1024*1024)throw Error('Elegí una imagen JPG, PNG o WebP de hasta 10 MB.');
 const url=URL.createObjectURL(file);
 try{const img=new Image();img.src=url;await img.decode();const scale=Math.min(1,960/Math.max(img.width,img.height));const canvas=document.createElement('canvas');canvas.width=Math.max(1,Math.round(img.width*scale));canvas.height=Math.max(1,Math.round(img.height*scale));canvas.getContext('2d').drawImage(img,0,0,canvas.width,canvas.height);
 for(const q of [.85,.7,.55,.4,.25]){const data=canvas.toDataURL('image/webp',q).split(',')[1];if(data?.length<=163840)return data}
 throw Error('La imagen es demasiado grande después de comprimirla.');
 }finally{URL.revokeObjectURL(url)}
}
export function SpotManager({api,run,busy,offline,money,errorLabel}){
 const [data,setData]=useState(null),[edit,setEdit]=useState(null),[error,setError]=useState(''),[saving,setSaving]=useState(false);
 const refresh=async()=>{try{setData((await api.control('spots')).spots);setError('')}catch(e){setError(errorLabel(e))}};
 useEffect(()=>{if(!offline)refresh()},[api,offline]);
 const disabled=busy||offline||saving;
 const save=async event=>{event.preventDefault();const form=event.currentTarget;const d=Object.fromEntries(new FormData(form));setSaving(true);setError('');try{
 const imageBase64=d.image?.size?await compressImage(d.image):undefined;
 const result=await run(()=>api.control(edit.id?'spots/'+edit.id:'spots',{method:edit.id?'PATCH':'POST',body:{advertiser:d.advertiser,title:d.title,placement:d.placement,startsAt:epoch(d.start),endsAt:epoch(d.end),durationSeconds:Number(d.duration),link:d.link,priceMinor:moneyMinor(d.price),paidMinor:moneyMinor(d.paid),...(edit.id?{version:edit.version}:{}),...(imageBase64?{imageBase64}:{})}}),{refresh:false});
 if(result){setEdit(null);await refresh()}
 }catch(e){setError(e.message)}finally{setSaving(false)}};
 const act=async(row,action)=>{if(action==='delete'&&!window.confirm('¿Eliminar definitivamente este spot?'))return;const r=await run(()=>api.control('spots/'+row.id,{method:'POST',body:{action,version:row.version}}),{refresh:false});if(r)await refresh()};
 return <section className="dvl-panel dvl-stack"><div className="dvl-admin-section-heading"><h2>Spots publicitarios</h2><button className="dvl-action" disabled={disabled} onClick={()=>setEdit({})}>+ Nuevo spot</button></div>
 {error&&<p role="alert">{error}</p>}
 {edit&&<form key={edit.id||'new'} className="dvl-grid dvl-editor" onSubmit={save}>
 <label>Anunciante<input name="advertiser" required maxLength={120} defaultValue={edit.advertiser}/></label>
 <label>Título del anuncio<input name="title" required maxLength={120} defaultValue={edit.title}/></label>
 <label>Imagen JPG, PNG o WebP<input type="file" name="image" accept="image/png,image/jpeg,image/webp" required={!edit.id}/></label>
 <label>Ubicación<select name="placement" defaultValue={edit.placement||'carousel'}>{Object.entries(placeLabels).map(([v,l])=><option key={v} value={v}>{l}</option>)}</select></label>
 <label>Inicio (Honduras)<input name="start" type="datetime-local" required defaultValue={edit.starts_at?dateTime(edit.starts_at):today()+'T00:00'}/></label>
 <label>Vencimiento (Honduras)<input name="end" type="datetime-local" required defaultValue={edit.ends_at?dateTime(edit.ends_at):''}/></label>
 <label>Segundos por aparición<input name="duration" type="number" min="5" max="30" required defaultValue={edit.duration_seconds||5}/></label>
 <label>Enlace HTTPS o WhatsApp<input name="link" type="url" maxLength={400} defaultValue={edit.link||''}/></label>
 <label>Precio contratado (L)<input name="price" type="number" min="0" max="1000000" step=".01" required defaultValue={(edit.price_minor||0)/100}/></label>
 <label>Pagado (L)<input name="paid" type="number" min="0" max="1000000" step=".01" required defaultValue={(edit.paid_minor||0)/100}/></label>
 <button className="dvl-action" disabled={disabled}>{edit.id?'Guardar cambios':'Guardar spot'}</button><button type="button" className="dvl-action secondary" onClick={()=>setEdit(null)}>Cancelar</button></form>}
 {!data&&!error&&<p role="status">Cargando anuncios…</p>}{data?.length===0&&<p>No hay anuncios registrados.</p>}
 {data?.map(row=><article key={row.id} className="dvl-panel dvl-stack"><strong>{row.title} · {row.advertiser}</strong><small>{placeLabels[row.placement]} · {row.ends_at<=Date.now()/1000?'Vencido':!row.active?'Pausado':row.starts_at>Date.now()/1000?'Programado':'Activo'}</small><span>{dateTime(row.starts_at).replace('T',' ')} a {dateTime(row.ends_at).replace('T',' ')}</span><p>Contrato: {money(row.price_minor)} · Pagado: {money(row.paid_minor)} · Saldo: {money(row.price_minor-row.paid_minor)}</p><div className="dvl-inline"><button className="dvl-action secondary" disabled={disabled} onClick={()=>setEdit(row)}>Editar / renovar</button><button className="dvl-action" disabled={disabled} onClick={()=>act(row,row.active?'pause':'activate')}>{row.active?'Pausar':'Activar'}</button><button className="dvl-action secondary" disabled={disabled} onClick={()=>act(row,'delete')}>Eliminar</button></div></article>)}
 </section>
}
export function RestaurantContract({restaurant,api,run,busy,offline,money,errorLabel,onSaved}){
 const [data,setData]=useState(null),[edit,setEdit]=useState(false),[error,setError]=useState(''),[pay,setPay]=useState(false),[paymentId,setPaymentId]=useState('');
 const path='contracts/'+restaurant.id,disabled=busy||offline;
 const refresh=async()=>{try{setData(await api.control(path));setError('')}catch(e){setError(errorLabel(e))}};
 useEffect(()=>{if(!offline)refresh()},[api,path,offline]);
 const contract=data?.contract;
 const save=async e=>{e.preventDefault();const d=Object.fromEntries(new FormData(e.currentTarget));const r=await run(()=>api.control(path,{method:'PATCH',body:{plan:d.plan,startDate:d.start,nextDue:d.due,frequency:d.frequency,amountMinor:moneyMinor(d.amount),version:contract?.version||0}}),{refresh:false});if(r){setEdit(false);await refresh();await onSaved?.()}};
 const record=async e=>{e.preventDefault();const d=Object.fromEntries(new FormData(e.currentTarget));const r=await run(()=>api.control(path+'/payments',{method:'POST',body:{id:paymentId,version:contract.version,paidDate:d.paidDate,method:d.method,reference:d.reference}}),{refresh:false});if(r){setPay(false);await refresh()}};
 const overdue=contract?.next_due&&contract.next_due<=today();
 return <div className="dvl-stack"><h3>Contrato y pagos</h3>{error&&<p role="alert">{error}</p>}{!data&&!error&&<p role="status">Cargando contrato…</p>}{data&&!contract&&<p>Sin contrato registrado.</p>}
 {contract&&<><div className="dvl-grid"><p>Contratación: <strong>{contract.start_date}</strong></p><p>Antigüedad: <strong>{Math.max(0,dayNum(today())-dayNum(contract.start_date))} días</strong></p><p>Cuota: <strong>{money(contract.amount_minor)}</strong></p><p>Frecuencia: <strong>{frequencies[contract.frequency]}</strong></p><p>Próximo pago: <strong>{contract.next_due||'Completado'}</strong></p><p>Estado: <strong>{!contract.next_due?'Pagado':overdue?'Pago vencido o exigible':'Al día'}</strong></p><p>Cuota pendiente exigible: <strong>{money(overdue?contract.amount_minor:0)}</strong></p></div><p>El sistema registra cada cuota completa. Si existen varias cuotas vencidas, registralas por separado.</p></>}
 <div className="dvl-inline"><button className="dvl-action secondary" disabled={disabled||!data} onClick={()=>setEdit(v=>!v)}>{contract?'Editar contrato':'Asignar plan de pago'}</button>{contract?.next_due&&<button className="dvl-action" disabled={disabled} onClick={()=>{setPaymentId(crypto.randomUUID());setPay(v=>!v)}}>Registrar pago</button>}</div>
 {edit&&<form className="dvl-grid dvl-editor" onSubmit={save}><label>Plan<select name="plan" defaultValue={restaurant.plan}><option value="ONLINE">Dvolada Cloud</option><option value="LOCAL">Dvolada Local</option><option value="PLUS">Dvolada Plus</option></select></label><label>Contratación<input type="date" name="start" required defaultValue={contract?.start_date||today()}/></label><label>Próximo pago<input type="date" name="due" required defaultValue={contract?.next_due||today()}/></label><label>Frecuencia<select name="frequency" defaultValue={contract?.frequency||'monthly'}>{Object.entries(frequencies).map(([v,l])=><option value={v} key={v}>{l}</option>)}</select></label><label>Cuota (L)<input type="number" name="amount" step=".01" min=".01" max="1000000" required defaultValue={contract?contract.amount_minor/100:''}/></label><button className="dvl-action" disabled={disabled}>Guardar contrato</button></form>}
 {pay&&<form className="dvl-grid dvl-editor" onSubmit={record}><p>Cuota {contract.next_due}: {money(contract.amount_minor)}</p><label>Fecha de pago<input name="paidDate" type="date" defaultValue={today()} max={today()} min={contract.start_date} required/></label><label>Método<select name="method"><option value="cash">Efectivo</option><option value="transfer">Transferencia</option><option value="external_card">Tarjeta externa</option></select></label><label>Referencia<input name="reference" maxLength={100}/></label><button className="dvl-action" disabled={disabled}>Confirmar cuota completa</button></form>}
 {data?.payments&&<details><summary>Historial de pagos ({data.payments.length})</summary>{data.payments.map(x=><p key={x.id}>{x.paid_date} · Cuota {x.due_date} · {money(x.amount_minor)} · {x.method}{x.reference?' · '+x.reference:''}</p>)}{!data.payments.length&&<p>Sin pagos registrados.</p>}</details>}</div>
}
