import React,{useEffect,useRef,useState} from 'react';
import {loadGoogle} from './GoogleAdminSignIn.jsx';
export function CustomerGoogleButton({api,onSuccess,offline}){
 const button=useRef(null),callback=useRef(onSuccess),[error,setError]=useState(''),[retry,setRetry]=useState(0);
 callback.current=onSuccess;
 useEffect(()=>{if(offline)return;let active=true,busy=false;setError('');
 loadGoogle().then(async google=>{
  if(!active)return;const config=await api.customerGoogleChallenge();if(!active||!button.current)return;
  google.initialize({client_id:config.clientId,nonce:config.nonce,ux_mode:'popup',auto_select:false,callback:async response=>{
   if(!active||busy)return;busy=true;
   try{const codes=await api.customerGoogleLogin(response.credential);const me=await api.me(true);if(!['customer','courier'].includes(me.user.role)||me.user.googleAdmin||me.user.privilegedPasskey)throw Error('Acceso incorrecto');if(active)callback.current(me,codes)}
   catch(e){if(active){button.current?.replaceChildren();setError('No se pudo iniciar con Google. Reintentá.')}}finally{busy=false}
  }});
  button.current.replaceChildren();google.renderButton(button.current,{theme:'outline',size:'large',text:'continue_with',shape:'pill',locale:'es'});
 }).catch(()=>{if(active)setError('Google no está disponible por el momento.')});
 return()=>{active=false};
 },[api,offline,retry]);
 return <div className="dvl-stack">{offline?<p>Conectate a internet para ingresar.</p>:<div ref={button}/>}
 {error&&<><p role="alert">{error}</p><button type="button" className="dvl-action secondary" onClick={()=>setRetry(n=>n+1)}>Reintentar Google</button></>}</div>;
}
export function PasswordAccess({authenticate,busy,offline,initialMode='login',onBack}){
 const [mode,setMode]=useState(initialMode),[error,setError]=useState('');
 const submit=async e=>{e.preventDefault();setError('');const data=Object.fromEntries(new FormData(e.currentTarget));if(mode!=='login'&&data.password!==data.confirm){setError('Las contraseñas no coinciden.');return}
 const body={login:data.login,password:data.password,...(mode==='register'?{displayName:data.name,phone:'+504'+data.phone}:mode==='recover'?{code:data.code}:{})};await authenticate(mode,body);};
 return <form key={mode} className="dvl-panel dvl-login" onSubmit={submit}>
 <h2>{mode==='register'?'Creá tu cuenta':mode==='recover'?'Restablecer contraseña':'Ingresar con contraseña'}</h2>
 <div className="dvl-inline">{[['login','Ingresar'],['register','Crear cuenta'],['recover','Recuperar']].map(([v,l])=><button type="button" key={v} className={'dvl-action '+(mode===v?'':'secondary')} onClick={()=>{setMode(v);setError('')}}>{l}</button>)}</div>
 {mode==='register'&&<>
  <label>Nombre completo<input name="name" required minLength={2} maxLength={80} autoComplete="name"/></label>
  <label>Teléfono de Honduras (+504)<input name="phone" required pattern="[0-9]{8}" maxLength={8} inputMode="numeric" autoComplete="tel-national"/></label>
 </>}
 <label>Usuario<input name="login" required minLength={4} maxLength={40} autoComplete="username" autoCapitalize="none" spellCheck={false}/></label>
 {mode==='recover'&&<label>Código de recuperación<input name="code" type="password" required minLength={43} maxLength={43} autoComplete="off"/></label>}
 <label>{mode==='login'?'Contraseña':'Nueva contraseña (mínimo 12 caracteres)'}<input name="password" type="password" required minLength={12} maxLength={128} autoComplete={mode==='login'?'current-password':'new-password'}/></label>
 {mode!=='login'&&<label>Confirmá la contraseña<input name="confirm" type="password" required minLength={12} maxLength={128} autoComplete="new-password"/></label>}
 {error&&<p role="alert">{error}</p>}
 <button type="submit" className="dvl-action" disabled={busy||offline}>{mode==='register'?'Crear mi cuenta':mode==='recover'?'Restablecer contraseña':'Ingresar'}</button>
 {onBack&&<button type="button" className="dvl-action secondary" onClick={onBack}>Otras formas de ingreso</button>}
 </form>;
}
export function AccountBiometrics({api,busy,offline,run,errorLabel}){
 const [data,setData]=useState(null),[message,setMessage]=useState('');
 useEffect(()=>{let active=true;if(!offline)api.biometric('status').then(d=>{if(active)setData(d)}).catch(()=>{});return()=>{active=false}},[api,offline]);
 if(!data)return null;
 const activate=async()=>{setMessage('');try{
  if(!window.PublicKeyCredential)throw Error('Este dispositivo no admite llaves de acceso.');
  if(data.registered&&!window.confirm('Se reemplazará la llave anterior. ¿Continuar?'))return;
  const result=await run(async()=>{const {startRegistration}=await import('@simplewebauthn/browser');const {id,options}=await api.biometric('begin',{});const response=await startRegistration({optionsJSON:options});return api.biometric('finish',{id,response})},{refresh:false});
  if(result){setData(result);setMessage('Acceso con huella, rostro o PIN del dispositivo activado.')}
 }catch(e){setMessage(errorLabel(e))}};
 return <details className="dvl-panel dvl-span"><summary>Seguridad · Huella o Face ID</summary><p>Usuario para ingresar con llave: <strong>{data.login}</strong></p><p>{data.registered?'Ya tenés una llave de acceso.':'Activá la seguridad de tu dispositivo para iniciar sesión más rápido.'}</p><button className="dvl-action secondary" disabled={busy||offline} onClick={activate}>{data.registered?'Reemplazar llave':'Activar huella o Face ID'}</button>{message&&<p role="status">{message}</p>}<small>Por seguridad, iniciá sesión nuevamente si han pasado más de 10 minutos.</small></details>;
}
