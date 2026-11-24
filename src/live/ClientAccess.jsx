import React,{useState} from 'react';

const actions={login:'Ingresar',register:'Crear cuenta',recover:'Recuperar acceso'};
export default function ClientAccess({authenticate,offline,busy}){
 const params=new URLSearchParams(location.search);
 const betaIntent=location.hostname==='dvolada-beta.dvoladanexora.workers.dev'?params.get('beta_rol'):null;
 const intent=['restaurant','courier'].includes(params.get('intent'))?params.get('intent'):betaIntent;
 // UI preference only. Authentication and roles are always verified by the server.
 const requestedMode=params.get('mode');
 const initialMode=Object.hasOwn(actions,requestedMode)?requestedMode:intent==='restaurant'?'recover':['customer','courier'].includes(intent)?'register':'login';
 const [mode,setMode]=useState(initialMode),[login,setLogin]=useState(''),[name,setName]=useState(''),[code,setCode]=useState('');
 async function submit(event){
  event.preventDefault();
  if(busy||offline)return;
  const body={login:login.trim().toLowerCase()};
  if(mode==='register')body.displayName=name.trim();
  if(mode==='recover')body.code=code.trim();
  await authenticate(mode,body);
  setCode('');
 }
 return <form className="dvl-panel dvl-login" onSubmit={submit}>
  <h2>Cuenta Dvolada</h2>
  {intent==='restaurant'&&<p>Para activar tu restaurante, usá la invitación del propietario. Si ya tenés llave, elegí Ingresar.</p>}
  {intent==='courier'&&<p>Creá tu cuenta o ingresá con tu llave. Después, en Trabajá como repartidor, solicitá la aprobación.</p>}
  <div className="dvl-inline dvl-client-modes" aria-label="Acceso a la cuenta">
   {Object.entries(actions).map(([key,label])=><button key={key} type="button" disabled={busy} aria-pressed={key===mode}
    className={'dvl-action '+(key===mode?'':'secondary')} onClick={()=>{setMode(key);setCode('')}}>{label}</button>)}
  </div>
  {mode==='register'&&<label>Nombre<input autoComplete="name" minLength={2} maxLength={80} value={name} onChange={event=>setName(event.target.value)} required/></label>}
  <label>Usuario<input autoComplete="username" autoCapitalize="none" spellCheck={false} minLength={4} maxLength={40}
   pattern="[A-Za-z0-9][A-Za-z0-9._\-]{3,39}" value={login} onChange={event=>setLogin(event.target.value)} required/></label>
  {mode==='recover'&&<label>Código de recuperación o invitación<input type="password" autoComplete="off" minLength={43} maxLength={43}
   value={code} onChange={event=>setCode(event.target.value)} required/></label>}
  <p className="dvl-muted">{mode==='recover'?'Usá tu invitación de Administrador o Propietario para activar la cuenta. Si ya tenés cuenta, usá tu código de recuperación para reemplazar la llave y cerrar las sesiones previas.':
   mode==='register'?'Tu dispositivo te pedirá una llave de acceso. Guardá el código de recuperación al finalizar.':
   'Ingresá con tu llave de acceso. Si tu cuenta usaba contraseña, elegí Recuperar acceso.'}</p>
  <button type="submit" className="dvl-action" disabled={busy||offline}>{busy?'Comprobando…':actions[mode]+' con llave'}</button>
 </form>;
}

export function ClientCodes({codes,close}) {
 if(!codes)return null;
 return <section className="dvl-panel dvl-code-panel" aria-label="Accesos recién generados">
  <h2>Guardá tu código de recuperación</h2>
  <p>Se muestra una sola vez. Cualquiera con ese código puede restablecer el acceso.</p>
  {codes.access&&<label>Clave para ingresar<input readOnly value={codes.access} onFocus={event=>event.target.select()}/></label>}
  <label>Código de recuperación<input readOnly value={codes.recovery} onFocus={event=>event.target.select()}/></label>
  <button type="button" className="dvl-action" onClick={close}>Ya guardé mis claves</button>
 </section>;
}
