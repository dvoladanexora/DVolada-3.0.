import React,{useEffect,useRef,useState} from 'react';

let loader;
const loginErrors={
 GOOGLE_ADMIN_CHALLENGE_EXPIRED:'El intento venció o el navegador perdió la cookie de verificación.',
 GOOGLE_ADMIN_TOKEN_INVALID:'Google devolvió una credencial que el servidor no pudo validar.',
 GOOGLE_ADMIN_FORBIDDEN:'Esta cuenta de Google no está autorizada.',
 GOOGLE_ADMIN_SESSION_REJECTED:'El intento ya se usó o la cuenta administrativa está bloqueada.',
 GOOGLE_ADMIN_KEYS_UNAVAILABLE:'El servidor no pudo consultar las llaves de verificación de Google.',
 SESSION_REQUIRED:'El navegador no conservó la cookie de la sesión administrativa.',
 SESSION_INVALID:'La sesión administrativa no es válida.',
 SERVICE_UNAVAILABLE:'El servidor no pudo completar el inicio de sesión.',
 SIN_CONEXION:'Se perdió la conexión con Dvolada.'
};
function loadGoogle(){
 if(window.google?.accounts?.id)return Promise.resolve(window.google.accounts.id);
 if(loader)return loader;
 loader=new Promise((resolve,reject)=>{
  const script=document.createElement('script');
  script.src='https://accounts.google.com/gsi/client';script.async=true;
  script.onload=()=>{
   if(window.google?.accounts?.id)resolve(window.google.accounts.id);
   else {loader=null;script.remove();reject(Error('Google no disponible'))}
  };
  script.onerror=()=>{loader=null;script.remove();reject(Error('Google no disponible'))};
  document.head.append(script);
 });
 return loader;
}
export default function GoogleAdminSignIn({api,onSuccess,offline}){
 const button=useRef(null),[error,setError]=useState(''),[ready,setReady]=useState(false),[retry,setRetry]=useState(0);
 const callback=useRef(onSuccess);callback.current=onSuccess;
 useEffect(()=>{
  if(!api||offline)return;
  let active=true,busy=false;
  setReady(false);setError('');
  loadGoogle().then(async google=>{
   if(!active)return;
   const config=await api.controlChallenge();
   if(!active||!button.current)return;
   google.initialize({client_id:config.clientId,nonce:config.nonce,ux_mode:'popup',auto_select:false,callback:async response=>{
    if(!active||busy)return;busy=true;setError('');
    try{
     await api.controlLogin(response.credential);
     const me=await api.me(true);
     if(!me.user.googleAdmin)throw Error('No se pudo verificar el acceso');
     if(active)callback.current(me);
    }catch(e){
     if(active){
      button.current?.replaceChildren();
      setError(loginErrors[e.code]||'No se pudo iniciar sesión. Intentá de nuevo.');
      setReady(false);
     }
    }finally{busy=false}
   }});
   button.current.replaceChildren();
   google.renderButton(button.current,{theme:'outline',size:'large',text:'signin_with',shape:'pill',locale:'es'});
   setReady(true);
  }).catch(()=>{if(active)setError('No se pudo cargar el acceso Google. Intentá de nuevo.')});
  return()=>{active=false};
 },[api,offline,retry]);
 return <section className="dvl-panel dvl-login" aria-label="Acceso administrativo">
  <img className="dvl-official-logo" src={import.meta.env.BASE_URL+'logo.png'} alt="Dvolada"/>
  <h1>Centro de Control</h1><p>Acceso exclusivo para administradores autorizados.</p>
  {offline?<p role="alert">Conectate a internet para ingresar.</p>:<div ref={button} style={{minHeight:44}}/>}
  {!offline&&!ready&&!error&&<p role="status">Preparando inicio de sesión con Google…</p>}
  {error&&<><p role="alert">{error}</p><button type="button" className="dvl-action secondary" onClick={()=>setRetry(n=>n+1)}>Reintentar</button></>}
  <p className="dvl-muted">Powered by Nexora Systems</p>
 </section>;
}
