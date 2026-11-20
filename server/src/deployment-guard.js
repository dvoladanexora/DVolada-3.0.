/** Protección de configuración de la API antes de abrirla al público.
 * La URL HTTPS debe corresponder a un proxy TLS real que termine y valide HTTPS.
 * No se debe confiar en esta cadena como prueba de que existe TLS ni un WAF.
 */
export function validProductionDeployment({nodeEnv='development',publicApiOrigin='',allowedOrigins=[]}={}){
 if(nodeEnv!=='production')return {ok:true};
 let url;
 try{url=new URL(publicApiOrigin)}catch{return {ok:false,reason:'DVOLADA_PUBLIC_API_ORIGIN HTTPS required'}}
 if(url.protocol!=='https:'||url.origin!==publicApiOrigin||url.username||url.password||url.search||url.hash
  ||url.hostname==='localhost'||url.hostname.endsWith('.localhost')
  ||url.hostname.startsWith('[')||/^\d+(?:\.\d+){3}$/.test(url.hostname))
  return {ok:false,reason:'Production API requires a public HTTPS origin'};
 if(!Array.isArray(allowedOrigins)||!allowedOrigins.length)
  return {ok:false,reason:'Production API requires DVOLADA_ALLOWED_ORIGINS'};
 if(allowedOrigins.some(o=>!o.startsWith('https://')))
  return {ok:false,reason:'Production frontend origins must use HTTPS'};
 return {ok:true};
}
