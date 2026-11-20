/** Cuota simple por empleado en una instancia de la API preliminar.
 * Es una segunda línea de defensa: no protege contra bots distribuidos,
 * múltiples réplicas ni sustituye Cloudflare WAF / rate limiting central.
 */
export function createActorLimiter({limit=180,windowMs=60_000,maxEntries=5000}={}){
 if(!Number.isInteger(limit)||limit<1||!Number.isInteger(windowMs)||windowMs<1000
  ||!Number.isInteger(maxEntries)||maxEntries<1)throw Error('Invalid limiter configuration');
 const records=new Map();
 return function check(actor,now=Date.now()){
  if(typeof actor!=='string'||!actor.trim()||!Number.isFinite(now))
   return {allowed:false,retryAfterSeconds:1};
  const record=records.get(actor);
  if(!record||now-record.start>=windowMs||now<record.start){
   records.delete(actor);
   if(records.size>=maxEntries)records.delete(records.keys().next().value);
   records.set(actor,{start:now,count:1});
   return {allowed:true,retryAfterSeconds:0};
  }
  if(record.count>=limit)return {
   allowed:false,retryAfterSeconds:Math.max(1,Math.ceil((windowMs-(now-record.start))/1000))
  };
  record.count++;
  return {allowed:true,retryAfterSeconds:0};
 };
}
