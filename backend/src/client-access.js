export const clientCookie='__Host-dvolada-client';
const qaOrigin='https://dvolada-qa.dvoladanexora.workers.dev';
export const secretPattern=/^[A-Za-z0-9_-]{43}$/;
export const sessionSeconds=7*86400;

export function clientAccessEnabled(req,env){
 const url=new URL(req.url);
 return url.protocol==='https:'&&(url.origin===qaOrigin
  ?env.QA_CLIENT_ACCESS==='true'
  :env.CLIENT_PASSKEYS_ENABLED==='true'&&url.host===env.DVOLADA_ONLINE_HOST);
}
export function readSecretCookie(req,name){
 const value=(req.headers.get('cookie')||'').split(';').map(cookie=>cookie.trim())
  .find(cookie=>cookie.startsWith(name+'='))?.slice(name.length+1);
 return secretPattern.test(value||'')?value:null;
}
export function readClientCookie(req,env){
 return clientAccessEnabled(req,env)?readSecretCookie(req,clientCookie):null;
}
export function secretCookie(res,name,value,seconds){
 res.headers.append('set-cookie',name+'='+value+'; Path=/; Secure; HttpOnly; SameSite=Strict; Max-Age='+seconds);
 return res;
}
export function changeClientCookie(res,value){
 return secretCookie(res,clientCookie,value,value?sessionSeconds:0);
}
export const randomSecret=()=>btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(32))))
 .replaceAll('+','-').replaceAll('/','_').replace(/=+$/,'');
