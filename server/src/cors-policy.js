/** Configuración estricta de CORS para el prototipo de API Dvolada.
 * Nunca usar Access-Control-Allow-Origin: * con información autenticada.
 * Definir DVOLADA_ALLOWED_ORIGINS en el despliegue y no en código cliente.
 */
export function parseAllowedOrigins(config=''){
 const origins=new Set();
 for(const raw of String(config||'').split(',')){
  const value=raw.trim().replace(/\/$/,'');
  if(!value||value==='*')continue;
  let parsed;
  try{parsed=new URL(value)}catch{continue}
  if(parsed.username||parsed.password||parsed.search||parsed.hash
   ||(parsed.pathname!==''&&parsed.pathname!=='/')
   ||!['http:','https:'].includes(parsed.protocol))continue;
  if(parsed.protocol==='http:'&&!['localhost','127.0.0.1','[::1]'].includes(parsed.hostname))continue;
  if(parsed.origin!==value)continue;
  origins.add(value);
 }
 return [...origins];
}
export function allowedCorsHeaders(origin,allowlist){
 if(typeof origin!=='string'||!Array.isArray(allowlist)||!allowlist.includes(origin))return null;
 return {
  'Access-Control-Allow-Origin':origin,
  // Auth usa bearer tokens, no cookies cross-origin; no habilitar credentials.
  'Access-Control-Allow-Methods':'GET, PATCH, OPTIONS',
  'Access-Control-Allow-Headers':'Authorization, Content-Type, Idempotency-Key',
  'Access-Control-Max-Age':'600',
  Vary:'Origin',
 };
}
