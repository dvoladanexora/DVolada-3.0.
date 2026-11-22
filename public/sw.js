/* App shell offline sin guardar pedidos, chats, API ni sesiones privadas.
 * Los pedidos solo se pueden confirmar con el servidor disponible.
 * scripts/version-service-worker.mjs reemplaza CACHE en cada compilación.
 */
const CACHE='dvolada-shell-v9';
const ROOT='/DVolada-3.0./';
const MANIFEST='manifest.webmanifest';
const LIVE_ASSETS=[];
const installedRoutes=[ROOT,ROOT+'pruebas',ROOT+'pruebas/'];
const SHELL=[ROOT,ROOT+'index.html',ROOT+MANIFEST,ROOT+'logo.png',ROOT+'icon-clean-192.png',ROOT+'icon-clean-512.png'];
const STATIC_PUBLIC=new Set(['manifest-live.webmanifest','logo.png','dvolada-logo-original.png','nexora-logo-original.png','dvolada-slide-white.svg','dvolada-d-symbol.svg','icon-clean-192.png','icon-clean-512.png','manifest.webmanifest'].map(path=>ROOT+path));
const shellPath=pathname=>pathname===ROOT||pathname===ROOT+'index.html';
const privatePath=pathname=>/\/(?:api|auth|admin|session|push)(?:\/|$|-)/i.test(pathname);
self.addEventListener('install',event=>{
 const files=[...SHELL,...LIVE_ASSETS.map(path=>ROOT+path)];
 event.waitUntil(caches.open(CACHE).then(cache=>
  LIVE_ASSETS.length?cache.addAll(files):Promise.all(files.map(path=>cache.add(path).catch(()=>null)))
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
 if(LIVE_ASSETS.length&&req.mode==='navigate'&&installedRoutes.includes(url.pathname)){
  event.respondWith(fetch(req).catch(async()=>await caches.open(CACHE).then(cache=>cache.match(ROOT+'index.html'))||Response.error()));
  return;
 }
 if(LIVE_ASSETS.length&&LIVE_ASSETS.some(path=>ROOT+path===url.pathname)){
  event.respondWith(caches.open(CACHE).then(cache=>cache.match(url.pathname)).then(cached=>cached||fetch(req)));
  return;
 }
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
 const cacheable=STATIC_PUBLIC.has(url.pathname)||(url.pathname.startsWith(ROOT+'assets/')&&/\.(?:js|css|svg|woff2)$/i.test(url.pathname));
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
