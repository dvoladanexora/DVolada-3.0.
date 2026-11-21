const CACHE='dvolada-shell-v9';
const ROOT='/DVolada-3.0./';
const MANIFEST='manifest.webmanifest';
const LIVE_ASSETS=[];
const shell=['logo.png','icon-clean-192.png','icon-clean-512.png',MANIFEST];
const installedRoutes=[ROOT,ROOT+'pruebas',ROOT+'pruebas/'];
const assets=new Set([...shell,...LIVE_ASSETS].map(file=>ROOT+file));
const appShell=ROOT+'index.html';

self.addEventListener('install',event=>{
 const files=[...assets];
 if(LIVE_ASSETS.length)files.push(appShell);
 event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(files)));
});
self.addEventListener('message',event=>{
 if(event.data?.type==='SKIP_WAITING')self.skipWaiting();
});
self.addEventListener('activate',event=>{
 event.waitUntil(caches.keys().then(keys=>Promise.all(keys
  .filter(key=>key.startsWith('dvolada-shell-')&&key!==CACHE)
  .map(key=>caches.delete(key)))).then(()=>self.clients.claim()));
});
self.addEventListener('fetch',event=>{
 const req=event.request,url=new URL(req.url);
 if(req.method!=='GET'||url.origin!==self.location.origin)return;
 if(LIVE_ASSETS.length&&req.mode==='navigate'&&installedRoutes.includes(url.pathname)){
  event.respondWith(fetch(req).catch(async()=>{
   const cache=await caches.open(CACHE);
   return await cache.match(appShell)||Response.error();
  }));
 }else if(assets.has(url.pathname)){
  event.respondWith((async()=>{
   const cache=await caches.open(CACHE);
   const cached=await cache.match(url.pathname);
   return cached||fetch(req);
  })());
 }
 // Unlisted routes, including API, identity, push config, and version, always go to the network.
});
