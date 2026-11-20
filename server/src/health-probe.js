/** Evita que el endpoint público de health se use para saturar PostgreSQL.
 * Una consulta compartida por instancia cada pocos segundos. WAF sigue pendiente.
 */
export function createHealthProbe(ping,{cacheMs=5000,now=Date.now}={}){
 if(typeof ping!=='function'||!Number.isInteger(cacheMs)||cacheMs<1000)throw Error('Invalid health configuration');
 let expiresAt=0,lastHealthy=false,pending=null;
 return async function checkHealth(){
  if(now()<expiresAt)return lastHealthy;
  if(pending)return pending;
  pending=Promise.resolve().then(ping).then(()=>true,()=>false)
   .then(healthy=>{lastHealthy=healthy;expiresAt=now()+cacheMs;return healthy})
   .finally(()=>{pending=null});
  return pending;
 };
}
