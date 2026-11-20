/** Bloquea despliegues que declaren orígenes inseguros.
 * Una URL HTTPS en variables NO cifra por sí sola el servidor Node:
 * se exige un proxy de confianza con HTTPS real, WAF y puerto privado.
 */
export function publicHttpsOrigin(raw){
 if(typeof raw!=='string'||!raw)return false;
 let url;
 try{url=new URL(raw)}catch{return false}
 const host=url.hostname.toLowerCase().replace(/\.$/,'');
 return url.protocol==='https:'&&url.origin===raw
  &&!url.username&&!url.password&&!url.search&&!url.hash
  &&(url.pathname===''||url.pathname==='/')
  &&host.includes('.')&&!host.startsWith('[')
  &&!/^\d+(?:\.\d+){3}$/.test(host)
  &&!/(?:^|\.)(?:localhost|local|internal|lan|invalid|test|onion)$/.test(host);
}
export function validProductionDeployment({nodeEnv='development',publicApiOrigin='',allowedOrigins=[]}={}){
 if(nodeEnv!=='production')return {ok:true};
 if(!publicHttpsOrigin(publicApiOrigin))
  return {ok:false,reason:'Production API requires a public HTTPS origin'};
 if(!Array.isArray(allowedOrigins)||!allowedOrigins.length)
  return {ok:false,reason:'Production API requires DVOLADA_ALLOWED_ORIGINS'};
 if(allowedOrigins.some(origin=>!publicHttpsOrigin(origin)))
  return {ok:false,reason:'Production frontend origins must be public HTTPS origins'};
 return {ok:true};
}
