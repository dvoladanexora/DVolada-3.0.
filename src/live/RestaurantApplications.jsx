import React,{useEffect,useRef,useState} from 'react';

export function RestaurantApplicationForm({api}){
 const key=useRef(null),pending=useRef(null),[busy,setBusy]=useState(false),[message,setMessage]=useState('');
 async function submit(event){
  event.preventDefault();
  if(busy)return;
  const form=event.currentTarget;
  const values=Object.fromEntries(new FormData(form));
  const payload={...values,phone:'+504'+values.phone};
  const encoded=JSON.stringify(payload);
  if(pending.current!==encoded){key.current=crypto.randomUUID();pending.current=encoded}
  setBusy(true);setMessage('');
  try{
   await api.submitRestaurantApplication(payload,key.current);
   form.reset();pending.current=null;
   setMessage('Solicitud recibida. Dvolada se comunicará con vos.');
  }catch(error){
   setMessage(error.status===429?'Se alcanzó el límite de solicitudes. Intentá más tarde.':'No se confirmó el envío. Revisá los datos y reintentá.');
  }finally{setBusy(false)}
 }
 return <form className="surface affiliate-form" onSubmit={submit}>
  <h2>Solicitar afiliación</h2>
  <label>Nombre del negocio<input name="business" required minLength={2} maxLength={120}/></label>
  <label>Nombre del propietario<input name="owner" autoComplete="name" required minLength={2} maxLength={80}/></label>
  <label>Teléfono o WhatsApp (+504)<input name="phone" autoComplete="tel-national" inputMode="numeric" pattern="[0-9]{8}" maxLength={8} required/></label>
  <label>Correo electrónico<input name="email" autoComplete="email" type="email" required maxLength={180}/></label>
  <label>Ubicación<input name="location" required minLength={3} maxLength={180}/></label>
  <label>Tipo de negocio<input name="type" required minLength={2} maxLength={60}/></label>
  <label>Plan de interés<select name="plan"><option value="ONLINE">Dvolada Cloud</option><option value="LOCAL">Dvolada Local</option><option value="PLUS">Dvolada Plus</option></select></label>
  <label>Información adicional<textarea name="notes" maxLength={400}/></label>
  <button type="submit" className="primary" disabled={busy}>{busy?'Enviando…':'Enviar solicitud'}</button>
  {message&&<p role="status">{message}</p>}
 </form>;
}

export function RestaurantApplicationQueue({api}){
 const [rows,setRows]=useState(null),[message,setMessage]=useState(''),[busy,setBusy]=useState(false);
 const refreshing=useRef(false);
 async function refresh(){
  if(refreshing.current)return;
  refreshing.current=true;
  try{
   const entries=[];
   let after='';
   do{
    const page=await api.restaurantApplications(after);
    entries.push(...page.applications);
    after=page.next;
   }while(after);
   setRows(entries);
  }catch{setMessage('No se pudieron cargar las solicitudes.')}
  finally{refreshing.current=false}
 }
 useEffect(()=>{refresh();const timer=setInterval(()=>{if(!document.hidden&&navigator.onLine)refresh()},15000);return()=>clearInterval(timer)},[api]);
 async function decide(event,id){
  event.preventDefault();
  if(busy)return;
  const decision=event.nativeEvent.submitter.value;
  const reason=new FormData(event.currentTarget).get('reason').trim();
  if(decision==='rejected'&&reason.length<3){setMessage('Escribí el motivo del rechazo.');return}
  setBusy(true);setMessage('');
  try{
   await api.decideRestaurantApplication(id,{decision,reason});
   setRows(current=>current?.filter(row=>row.id!==id));
   setMessage(decision==='approved'?'Solicitud aprobada. Registrá el negocio en Restaurantes para continuar.':'Solicitud rechazada.');
   await refresh();
  }catch(error){setMessage(error.status===409?'Otra sesión ya resolvió la solicitud.':'El servidor no confirmó la decisión.');await refresh()}
  finally{setBusy(false)}
 }
 return <section className="dvl-panel dvl-stack">
  <h2>Solicitudes de restaurantes</h2>
  <button type="button" className="dvl-action secondary" onClick={refresh}>Actualizar solicitudes</button>
  {message&&<p role="status">{message}</p>}
  {rows?.length===0&&<p>No hay solicitudes pendientes.</p>}
  {rows?.map(row=><form key={row.id} className="dvl-panel dvl-stack" onSubmit={e=>decide(e,row.id)}>
   <h3>{row.business_name}</h3><p>{row.owner_name} · {row.email}</p>
   <p>{row.business_type} · {row.location} · {row.plan}</p>{row.notes&&<p>{row.notes}</p>}
   <a href={'https://wa.me/'+row.phone.replace(/^\+/,'')} target="_blank" rel="noreferrer">Contactar por WhatsApp</a>
   <label>Motivo si rechazás<input name="reason" maxLength={250}/></label>
   <div className="dvl-inline"><button className="dvl-action" type="submit" value="approved" disabled={busy}>Aprobar</button>
   <button className="dvl-action secondary" type="submit" value="rejected" disabled={busy}>Rechazar</button></div>
  </form>)}
 </section>;
}
