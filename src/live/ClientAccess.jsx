import React,{useState} from 'react';
import {clientLogin,clientPasswordProof,validClientLogin,validClientPassword} from './client-password.js';

const actions={login:'Ingresar',register:'Crear cuenta',recover:'Recuperar acceso'};
export default function ClientAccess({authenticate,offline,busy}) {
 const [mode,setMode]=useState('login'),[legacy,setLegacy]=useState(false);
 const [login,setLogin]=useState(''),[name,setName]=useState(''),[code,setCode]=useState('');
 const [password,setPassword]=useState(''),[confirmation,setConfirmation]=useState('');
 const [validating,setValidating]=useState(false),[error,setError]=useState('');
 const isNew=mode!=='login'&&!legacy;
 async function submit(event) {
  event.preventDefault();
  if(busy||offline||validating)return;
  setError('');
  if(!legacy&&!validClientLogin(login))return setError('Usá de 4 a 40 letras, números, puntos, guiones o guiones bajos para tu usuario.');
  if(isNew&&!validClientPassword(password))return setError('Usá al menos 15 caracteres y un máximo de 256 bytes para la contraseña.');
  if(isNew&&password!==confirmation)return setError('Las contraseñas no coinciden.');
  setValidating(true);
  try {
   const body=legacy?{code:code.trim()}:{login:clientLogin(login),proof:await clientPasswordProof(login,password)};
   if(mode==='register')body.displayName=name.trim();
   if(mode==='recover')body.code=code.trim();
   await authenticate(mode,body);
  }catch{setError('No se pudo preparar el acceso. Probá de nuevo desde HTTPS.')}
  finally {setPassword('');setConfirmation('');setCode('');setValidating(false)}
 }
 return <form className="dvl-panel dvl-login" onSubmit={submit}>
  <h2>Cuenta Cliente</h2>
  <div className="dvl-inline dvl-client-modes" aria-label="Acceso de cliente">
   {Object.entries(actions).map(([key,label])=><button key={key} type="button" disabled={validating||busy} aria-pressed={key===mode}
    className={'dvl-action '+(key===mode?'':'secondary')} onClick={()=>{setMode(key);setLegacy(false);setCode('');setPassword('');setConfirmation('');setError('')}}>{label}</button>)}
  </div>
  {mode==='register'&&<label>Nombre ficticio de prueba<input autoComplete="off" minLength={2} maxLength={80} value={name} onChange={event=>setName(event.target.value)} required/></label>}
  {!legacy&&<label>Usuario<input autoComplete="username" autoCapitalize="none" spellCheck={false} maxLength={40} value={login} onChange={event=>setLogin(event.target.value)} required/></label>}
  {!legacy&&<label>{mode==='recover'?'Nueva contraseña':'Contraseña'}<input type="password" autoComplete={isNew?'new-password':'current-password'} maxLength={256} value={password} onChange={event=>setPassword(event.target.value)} required/></label>}
  {isNew&&<label>Confirmá la contraseña<input type="password" autoComplete="new-password" maxLength={256} value={confirmation} onChange={event=>setConfirmation(event.target.value)} required/></label>}
  {(legacy||mode==='recover')&&<label>{mode==='recover'?'Código de recuperación':'Clave de cliente anterior'}<input type="password" autoComplete="off" minLength={43} maxLength={43} value={code} onChange={event=>setCode(event.target.value)} required/></label>}
  {mode!=='register'&&<button className="dvl-action secondary" type="button" disabled={busy||validating} onClick={()=>{setLegacy(value=>!value);setPassword('');setConfirmation('');setCode('');setError('')}}>{legacy?'Usar usuario y contraseña':'Usar un acceso anterior'}</button>}
  {mode==='recover'&&<p className="dvl-muted">El código se usa una vez y cierra las sesiones anteriores.</p>}
  {error&&<p role="alert">{error}</p>}
  <button type="submit" className="dvl-action" disabled={busy||offline||validating}>{validating?'Comprobando…':actions[mode]}</button>
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
