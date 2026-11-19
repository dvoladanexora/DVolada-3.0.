/* App shell offline sin guardar pedidos, chats, API ni sesiones privadas.
 * Los pedidos solo se pueden confirmar con el servidor disponible.
 * scripts/version-service-worker.mjs reemplaza CACHE en cada compilación.
 */
const CACHE='dvolada-shell-v9';
const ROOT='/DVolada-3.0./';
const SHELL=[ROOT,ROOT+'index.html',ROOT+'manifest.webmanifest',ROOT+'icon-clean-192.png',ROOT+'icon-clean-512.png'];
const shellPath=pathname=>pathname===ROOT||pathname===ROOT+'index.html';
const privatePath=pathname=>/\/(?:api|auth|admin|session)(?:\/|$)/i.test(pathname);
self.addEventListener('install',event=>{
 event.waitUntil(caches.open(CACHE).then(cache=>
  Promise.all(SHELL.map(path=>cache.add(path).catch(()=>null)))
 ));
 // La nueva versión permanece en espera hasta que el usuario acepte actualizar.
});
self.addEventListener('message',event=>{
 if(event.data?.type==='SKIP_WAITING')self.skipWaiting();
});
self.addEventListener('activate',event=>{
 event.waitUntil(caches.keys().then(keys=>Promise.all(
  keys.filter(key=>key.startsWith('dvolada-shell-')&&key!==CACHE).map(key=>caches.delete(key))
 )).then(()=>self.clients.claim()));
});
self.addEventListener('fetch',event=>{
 const req=event.request;
 if(req.method!=='GET')return;
 const url=new URL(req.url);
 if(url.origin!==self.location.origin||!url.pathname.startsWith(ROOT)||privatePath(url.pathname)||url.pathname.endsWith('/version.json'))return;
 if(req.mode==='navigate'){
  event.respondWith(
   fetch(req).then(response=>{
    if(response.ok&&response.type==='basic'&&shellPath(url.pathname)){
     const copy=response.clone();caches.open(CACHE).then(cache=>cache.put(ROOT,copy)).catch(()=>{});
    }
    return response;
   }).catch(async()=>await caches.match(ROOT)||await caches.match(ROOT+'index.html')||Response.error())
  );
  return;
 }
 // Recursos públicos inmutables: guarda JS/CSS y pequeños recursos del shell,
 // pero no peticiones a API ni endpoints que incluyan datos de usuarios.
 const cacheable=/\.(?:js|css|svg|png|webp|woff2|webmanifest)$/i.test(url.pathname);
 if(!cacheable)return;
 event.respondWith(
  fetch(req).then(response=>{
   if(response.ok&&response.type==='basic'){
    const copy=response.clone();
    caches.open(CACHE).then(cache=>cache.put(req,copy)).catch(()=>{});
   }
   return response;
  }).catch(()=>caches.match(req).then(response=>response||Response.error()))
 );
});
