import React,{useEffect,useRef,useState} from 'react';
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
 const [receipt,setReceipt]=useState(null),[receiptData,setReceiptData]=useState(null);
 const [preview,setPreview]=useState(''),[previewBusy,setPreviewBusy]=useState(false);
 const previewSeq=useRef(0);
 const openEditor=row=>{previewSeq.current++;setPreview('');setPreviewBusy(false);setError('');setEdit(row)};
 useEffect(()=>{
  if(!edit?.id||offline)return;
  const seq=++previewSeq.current;setPreviewBusy(true);
  api.control('spots/'+edit.id).then(result=>{
   if(seq===previewSeq.current&&['image/png','image/jpeg','image/webp'].includes(result.mime)&&typeof result.imageBase64==='string')setPreview('data:'+result.mime+';base64,'+result.imageBase64)
  }).catch(e=>{if(seq===previewSeq.current)setError(errorLabel(e))}).finally(()=>{if(seq===previewSeq.current)setPreviewBusy(false)});
  return()=>{previewSeq.current++};
 },[api,edit,offline]);
 const chooseImage=async e=>{
  const file=e.target.files?.[0];if(!file)return;
  const seq=++previewSeq.current;setPreviewBusy(true);setError('');
  try{const image=await compressImage(file);if(seq===previewSeq.current)setPreview('data:image/webp;base64,'+image)}
  catch(err){if(seq===previewSeq.current){setPreview('');setError(err.message);e.target.value=''}}
  finally{if(seq===previewSeq.current)setPreviewBusy(false)}
 };
 const refresh=async()=>{try{setData((await api.control('spots')).spots);setError('')}catch(e){setError(errorLabel(e))}};
 useEffect(()=>{if(!offline)refresh()},[api,offline]);
 const disabled=busy||offline||saving||previewBusy;
 const save=async event=>{event.preventDefault();const form=event.currentTarget;const d=Object.fromEntries(new FormData(form));setSaving(true);setError('');try{
 const imageBase64=d.image?.size?await compressImage(d.image):undefined;
 const result=await run(()=>api.control(edit.id?'spots/'+edit.id:'spots',{method:edit.id?'PATCH':'POST',body:{advertiser:d.advertiser,title:d.title,placement:d.placement,startsAt:epoch(d.start),endsAt:epoch(d.end),durationSeconds:Number(d.duration),link:d.link,priceMinor:moneyMinor(d.price),paidMinor:moneyMinor(d.paid),...(edit.id?{version:edit.version}:{}),...(imageBase64?{imageBase64}:{})}}),{refresh:false});
 if(result){openEditor(null);await refresh()}
 }catch(e){setError(e.message)}finally{setSaving(false)}};
 const openReceipt=async row=>{setReceipt({...row,paymentId:crypto.randomUUID()});setReceiptData(null);try{setReceiptData(await api.control('spots/'+row.id+'/payments'))}catch(e){setError(errorLabel(e))}};
 const recordReceipt=async e=>{e.preventDefault();const d=Object.fromEntries(new FormData(e.currentTarget));const r=await run(()=>api.control('spots/'+receipt.id+'/payments',{method:'POST',body:{id:receipt.paymentId,version:receipt.version,amountMinor:moneyMinor(d.amount),paidDate:d.paidDate,method:d.method,reference:d.reference}}),{refresh:false});if(r){setReceipt(null);setReceiptData(null);await refresh()}};
 const act=async(row,action)=>{if(action==='delete'&&!window.confirm('¿Eliminar definitivamente este spot?'))return;const r=await run(()=>api.control('spots/'+row.id,{method:'POST',body:{action,version:row.version}}),{refresh:false});if(r)await refresh()};
 return <section className="dvl-panel dvl-stack"><div className="dvl-admin-section-heading"><h2>Spots publicitarios</h2><button className="dvl-action" disabled={disabled} onClick={()=>openEditor({})}>+ Nuevo spot</button></div>
 {error&&<p role="alert">{error}</p>}
 {edit&&<form key={edit.id||'new'} className="dvl-grid dvl-editor" onSubmit={save}>
 <label>Anunciante<input name="advertiser" required maxLength={120} defaultValue={edit.advertiser}/></label>
 <label>Título del anuncio<input name="title" required maxLength={120} defaultValue={edit.title}/></label>
 <label>Imagen JPG, PNG o WebP<input type="file" name="image" accept="image/png,image/jpeg,image/webp" onChange={chooseImage} required={!edit.id}/></label>
 {previewBusy&&<p role="status">Preparando vista previa…</p>}{preview&&<div className="dvl-span"><img src={preview} alt="Vista previa del spot" style={{display:'block',width:'100%',maxHeight:240,objectFit:'contain',borderRadius:12}}/></div>}
 <label>Ubicación<select name="placement" defaultValue={edit.placement||'carousel'}>{Object.entries(placeLabels).map(([v,l])=><option key={v} value={v}>{l}</option>)}</select></label>
 <label>Inicio (Honduras)<input name="start" type="datetime-local" required defaultValue={edit.starts_at?dateTime(edit.starts_at):today()+'T00:00'}/></label>
 <label>Vencimiento (Honduras)<input name="end" type="datetime-local" required defaultValue={edit.ends_at?dateTime(edit.ends_at):''}/></label>
 <label>Segundos por aparición<input name="duration" type="number" min="5" max="30" required defaultValue={edit.duration_seconds||5}/></label>
 <label>Enlace HTTPS o WhatsApp<input name="link" type="url" maxLength={400} defaultValue={edit.link||''}/></label>
 <label>Precio contratado (L)<input name="price" type="number" min="0" max="1000000" step=".01" required defaultValue={(edit.price_minor||0)/100}/></label>
 <input name="paid" type="hidden" value={(edit.paid_minor||0)/100}/><p className="dvl-muted">Los pagos se registran por separado con un comprobante.</p>
 <button className="dvl-action" disabled={disabled}>{edit.id?'Guardar cambios':'Guardar spot'}</button><button type="button" className="dvl-action secondary" onClick={()=>openEditor(null)}>Cancelar</button></form>}
 {receipt&&<section className="dvl-panel dvl-stack"><h3>Pagos · {receipt.title}</h3><p>Saldo: {money(receipt.price_minor-receipt.paid_minor)}</p>{receiptData&&<><p>Saldo histórico registrado sin fecha: {money(receiptData.undatedMinor)}</p><ReceiptHistory payments={receiptData.payments} money={money} subject={receipt.advertiser}/></>}{receipt.price_minor>receipt.paid_minor&&<form className="dvl-grid dvl-editor" onSubmit={recordReceipt}><PaymentFields max={receipt.price_minor-receipt.paid_minor}/><button className="dvl-action" disabled={disabled}>Registrar abono</button></form>}<button className="dvl-action secondary" onClick={()=>setReceipt(null)}>Cerrar pagos</button></section>}
 {!data&&!error&&<p role="status">Cargando anuncios…</p>}{data?.length===0&&<p>No hay anuncios registrados.</p>}
 {data?.map(row=><article key={row.id} className="dvl-panel dvl-stack"><strong>{row.title} · {row.advertiser}</strong><small>{placeLabels[row.placement]} · {row.ends_at<=Date.now()/1000?'Vencido':!row.active?'Pausado':row.starts_at>Date.now()/1000?'Programado':'Activo'}</small><span>{dateTime(row.starts_at).replace('T',' ')} a {dateTime(row.ends_at).replace('T',' ')}</span><p>Contrato: {money(row.price_minor)} · Pagado: {money(row.paid_minor)} · Saldo: {money(row.price_minor-row.paid_minor)}</p><div className="dvl-inline"><button className="dvl-action secondary" disabled={disabled} onClick={()=>openReceipt(row)}>Pagos e historial</button><button className="dvl-action secondary" disabled={disabled} onClick={()=>openEditor(row)}>Editar / renovar</button><button className="dvl-action" disabled={disabled} onClick={()=>act(row,row.active?'pause':'activate')}>{row.active?'Pausar':'Activar'}</button>{row.price_minor===0&&row.paid_minor===0?<button className="dvl-action secondary" disabled={disabled} onClick={()=>act(row,'delete')}>Eliminar</button>:<small>Conservado en finanzas. Podés pausarlo, pero no eliminar su historial.</small>}</div></article>)}
 </section>
}
export function RestaurantContract({restaurant,api,run,busy,offline,money,errorLabel,onSaved}){
 const [data,setData]=useState(null),[edit,setEdit]=useState(false),[error,setError]=useState(''),[pay,setPay]=useState(false),[paymentId,setPaymentId]=useState('');
 const [initialPay,setInitialPay]=useState(false),[initialKey,setInitialKey]=useState('');
 const path='contracts/'+restaurant.id,disabled=busy||offline;
 const refresh=async()=>{try{setData(await api.control(path));setError('')}catch(e){setError(errorLabel(e))}};
 useEffect(()=>{if(!offline)refresh()},[api,path,offline]);
 const contract=data?.contract;
 const save=async e=>{e.preventDefault();const d=Object.fromEntries(new FormData(e.currentTarget));const r=await run(()=>api.control(path,{method:'PATCH',body:{plan:d.plan,startDate:d.start,nextDue:d.due,frequency:d.frequency,amountMinor:moneyMinor(d.amount),version:contract?.version||0}}),{refresh:false});if(r){setEdit(false);await refresh();await onSaved?.()}};
 const record=async e=>{e.preventDefault();const d=Object.fromEntries(new FormData(e.currentTarget));const r=await run(()=>api.control(path+'/payments',{method:'POST',body:{id:paymentId,version:contract.version,amountMinor:moneyMinor(d.amount),paidDate:d.paidDate,method:d.method,reference:d.reference}}),{refresh:false});if(r){setPay(false);await refresh()}};
 const initial=data?.activation,initialBalance=initial?initial.amount_minor-initial.paid_minor:0;
 const recordInitial=async e=>{e.preventDefault();const d=Object.fromEntries(new FormData(e.currentTarget));const r=await run(()=>api.control(path+'/activation',{method:'POST',body:{id:initialKey,version:initial.version,amountMinor:moneyMinor(d.amount),paidDate:d.paidDate,method:d.method,reference:d.reference}}),{refresh:false});if(r){setInitialPay(false);await refresh()}};
 const overdue=contract?.next_due&&contract.next_due<=today();
 const balance=contract?contract.amount_minor-(data.currentPaidMinor||0):0;
 return <div className="dvl-stack"><h3>Contrato y pagos</h3>{error&&<p role="alert">{error}</p>}{!data&&!error&&<p role="status">Cargando contrato…</p>}{data&&!contract&&<p>Sin contrato registrado.</p>}{data?.fixed&&<p>Dvolada Online: L 1,500 iniciales y L 500 mensuales.</p>}
 {initial&&<section className="dvl-panel dvl-stack"><h4>Afiliación inicial</h4><p>Importe: {money(initial.amount_minor)} · Abonado: {money(initial.paid_minor)} · Saldo: {money(initialBalance)}</p>{initialBalance>0&&<button type="button" className="dvl-action secondary" disabled={disabled} onClick={()=>{setInitialKey(crypto.randomUUID());setInitialPay(v=>!v)}}>Registrar pago inicial</button>}{initialPay&&initialBalance>0&&<form className="dvl-grid dvl-editor" onSubmit={recordInitial}><PaymentFields max={initialBalance} minDate={contract?.start_date}/><button className="dvl-action" disabled={disabled}>Confirmar pago inicial</button></form>}<ReceiptHistory payments={data.activationPayments||[]} money={money} subject={restaurant.name||restaurant.id}/></section>}
 {contract&&<><div className="dvl-grid"><p>Contratación: <strong>{contract.start_date}</strong></p><p>Antigüedad: <strong>{Math.max(0,dayNum(today())-dayNum(contract.start_date))} días</strong></p><p>Cuota: <strong>{money(contract.amount_minor)}</strong></p><p>Frecuencia: <strong>{frequencies[contract.frequency]}</strong></p><p>Próximo pago: <strong>{contract.next_due||'Completado'}</strong></p><p>Estado: <strong>{!contract.next_due?'Pagado':overdue?'Pago vencido o exigible':'Al día'}</strong></p><p>Cuota pendiente exigible: <strong>{money(overdue?balance:0)}</strong></p><p>Abonado en cuota actual: <strong>{money(data.currentPaidMinor||0)}</strong></p><p>Saldo de cuota actual: <strong>{money(contract.next_due?balance:0)}</strong></p></div><p>Podés registrar abonos. La próxima cuota se genera al completar el saldo actual.</p></>}
 <div className="dvl-inline"><button className="dvl-action secondary" disabled={disabled||!data||Boolean(data.currentPaidMinor)} onClick={()=>setEdit(v=>!v)}>{contract?'Editar contrato':'Asignar plan de pago'}</button>{contract?.next_due&&<button className="dvl-action" disabled={disabled} onClick={()=>{setPaymentId(crypto.randomUUID());setPay(v=>!v)}}>Registrar pago</button>}</div>
 {edit&&<form className="dvl-grid dvl-editor" onSubmit={save}><label>Plan<select name="plan" defaultValue={restaurant.plan}><option value="ONLINE">Dvolada Cloud</option><option value="LOCAL">Dvolada Local</option><option value="PLUS">Dvolada Plus</option></select></label><label>Contratación<input type="date" name="start" required defaultValue={contract?.start_date||today()}/></label><label>Próximo pago<input type="date" name="due" required defaultValue={contract?.next_due||today()}/></label><label>Frecuencia<select name="frequency" defaultValue={contract?.frequency||'monthly'}>{Object.entries(frequencies).map(([v,l])=><option value={v} key={v}>{l}</option>)}</select></label><label>Cuota (L)<input type="number" name="amount" step=".01" min=".01" max="1000000" required defaultValue={contract?contract.amount_minor/100:data?.fixed&&restaurant.plan==='ONLINE'?500:''}/></label><button className="dvl-action" disabled={disabled}>Guardar contrato</button></form>}
 {pay&&contract?.next_due&&<form className="dvl-grid dvl-editor" onSubmit={record}><p>Cuota {contract.next_due}: saldo {money(balance)}</p><PaymentFields max={balance} minDate={contract.start_date}/><button className="dvl-action" disabled={disabled}>Confirmar abono</button></form>}
 {data?.payments&&<ReceiptHistory payments={data.payments} money={money} subject={restaurant.name||restaurant.restaurant_id||restaurant.id}/>}</div>
}
function PaymentFields({max,minDate}){
 return <><label>Importe (L)<input name="amount" type="number" step=".01" min=".01" max={max/100} defaultValue={(max/100).toFixed(2)} required/></label><label>Fecha de pago<input name="paidDate" type="date" defaultValue={today()} max={today()} min={minDate} required/></label><label>Método<select name="method"><option value="cash">Efectivo</option><option value="transfer">Transferencia</option><option value="external_card">Tarjeta externa (registro manual)</option></select></label><label>Referencia<input name="reference" maxLength={100}/></label></>;
}
function ReceiptHistory({payments,money,subject}){
 const print=p=>{
  const w=window.open('','_blank');if(!w)return;
  const doc=w.document;doc.title='Comprobante interno Dvolada';const h=doc.createElement('h1');h.textContent='Dvolada · Comprobante interno';doc.body.append(h);
  for(const value of ['Nexora Systems',String(subject),'Referencia interna: '+p.id,'Fecha: '+p.paid_date,'Importe: '+money(p.amount_minor),'Método: '+p.method,...(p.due_date?['Cuota: '+p.due_date]:[]),...(p.reference?['Referencia: '+p.reference]:[]),'No sustituye una factura fiscal.']){const el=doc.createElement('p');el.textContent=value;doc.body.append(el)}
  w.opener=null;w.focus();w.print();
 };
 return <details><summary>Historial de pagos ({payments.length})</summary>{payments.map(p=><div className="dvl-row" key={p.id}><span>{p.paid_date} · {p.due_date?'Cuota '+p.due_date+' · ':''}{money(p.amount_minor)} · {p.method}{p.reference?' · '+p.reference:''}</span><button type="button" className="dvl-action secondary" onClick={()=>print(p)}>Comprobante</button></div>)}{!payments.length&&<p>Sin pagos registrados.</p>}</details>;
}
