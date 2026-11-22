import React,{useState} from 'react';

const actions={login:'Ingresar',register:'Crear cuenta',recover:'Recuperar acceso'};
export default function ClientAccess({authenticate,offline,busy}) {
 const [mode,setMode]=useState('login'),[value,setValue]=useState('');
 async function submit(event) {
  event.preventDefault();
  try { await authenticate(mode,mode==='register'?{displayName:value.trim()}:{code:value.trim()}); }
  finally { setValue(''); }
 }
 return <form className="dvl-panel dvl-login" onSubmit={submit}>
  <h2>Cuenta Cliente</h2>
  <div className="dvl-inline dvl-client-modes" aria-label="Acceso de cliente">
   {Object.entries(actions).map(([key,label])=><button key={key} type="button" aria-pressed={key===mode}
    className={'dvl-action '+(key===mode?'':'secondary')} onClick={()=>{setMode(key);setValue('')}}>{label}</button>)}
  </div>
  {mode==='register'?<label>Nombre ficticio de prueba<input autoComplete="off" minLength={2} maxLength={80} value={value} onChange={e=>setValue(e.target.value)} required/></label>:
   <label>{mode==='login'?'Clave de cliente':'Código de recuperación'}<input type="password" autoComplete="off"
    maxLength={43} value={value} onChange={e=>setValue(e.target.value)} required /></label>}
  <p className="dvl-muted">{mode==='register'?'Recibirás una clave de acceso y un código de recuperación. Guardalos en un lugar seguro. Usá solo datos ficticios.':
   mode==='recover'?'El código de recuperación se usa una vez y cierra tus sesiones anteriores.':'Ingresá con la clave generada al crear tu cuenta.'}</p>
  <button className="dvl-action" disabled={busy||offline||(mode==='register'?value.trim().length<2:value.trim().length!==43)}>{actions[mode]}</button>
 </form>;
}

export function ClientCodes({codes,close}) {
 if(!codes)return null;
 return <section className="dvl-panel dvl-code-panel" aria-label="Accesos recién generados">
  <h2>Guardá tus nuevas claves</h2>
  <p>Se muestran una sola vez. Cualquiera con tu código de recuperación puede restablecer el acceso.</p>
  <label>Clave para ingresar<input readOnly value={codes.access} onFocus={e=>e.target.select()}/></label>
  <label>Código de recuperación<input readOnly value={codes.recovery} onFocus={e=>e.target.select()}/></label>
  <button type="button" className="dvl-action" onClick={close}>Ya guardé mis claves</button>
 </section>;
}
