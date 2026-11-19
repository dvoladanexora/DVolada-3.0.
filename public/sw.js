// Dvolada: navegación y catálogo consultables sin conexión.
// Los pedidos, pagos, chats y solicitudes API nunca se guardan como respuestas offline.
const SHELL='dvolada-shell-v10';
const MEDIA='dvolada-media-v1';
const ROOT=new URL(self.registration.scope).pathname;
const MAX_MEDIA=90;
const isAsset=url=>url.pathname.startsWith(ROOT+'assets/')||/\.(?:js|css|woff2?|png|jpe?g|webp|svg|ico)$/i.test(url.pathname);
const isMedia=req=>req.destination==='image'||/\.(?:png|jpe?g|webp|svg)$/i.test(new URL(req.url).pathname);
async function trim(cacheName,max){
 const cache=await caches.open(cacheName);
 const keys=await cache.keys();
 if(keys.length>max)await Promise.all(keys.slice(0,keys.length-max).map(key=>cache.delete(key)));
}
async function precacheShell(){
 const cache=await caches.open(SHELL);
 const response=await fetch(ROOT,{cache:'reload'});
 if(!response.ok)throw Error('No se pudo preparar la aplicación offline');
 await cache.put(ROOT,response.clone());
 const html=await response.text();
 const paths=[...html.matchAll(/(?:src|href)=["']([^"']+)["']/g)]
  .map(match=>new URL(match[1],self.location.origin))
  .filter(url=>url.origin===self.location.origin&&url.pathname.startsWith(ROOT)&&isAsset(url));
 const essential=[ROOT+'manifest.webmanifest',ROOT+'icon-clean-192.png',...paths.map(url=>url.href)];
 await Promise.allSettled([...new Set(essential)].map(async url=>{
  const result=await fetch(url,{cache:'reload'});
  if(result.ok)await cache.put(url,result);
 }));
}
self.addEventListener('install',event=>{
 event.waitUntil(precacheShell());
 // La actualización sigue siendo manual desde el aviso de la PWA.
});
self.addEventListener('message',event=>{
 if(event.data?.type==='SKIP_WAITING')self.skipWaiting();
});
self.addEventListener('activate',event=>{
 event.waitUntil((async()=>{
  const keys=await caches.keys();
  await Promise.all(keys.filter(key=>key.startsWith('dvolada-')&&!([SHELL,MEDIA].includes(key))).map(key=>caches.delete(key)));
  await self.clients.claim();
 })());
});
self.addEventListener('fetch',event=>{
 const req=event.request;
 if(req.method!=='GET')return;
 const url=new URL(req.url);
 const sameOrigin=url.origin===self.location.origin;
 if(sameOrigin&&!url.pathname.startsWith(ROOT))return;
 // Nunca simular operaciones de servidor ni datos de sesión.
 if(sameOrigin&&(/\/api\//i.test(url.pathname)||/\/(?:version\.json)$/i.test(url.pathname)))return;
 if(req.mode==='navigate'&&sameOrigin){
  event.respondWith(fetch(req).then(async response=>{
   if(response.ok){const cache=await caches.open(SHELL);await cache.put(ROOT,response.clone())}
   return response;
  }).catch(async()=>await caches.match(ROOT)||Response.error()));
  return;
 }
 if(sameOrigin&&isAsset(url)){
  event.respondWith((async()=>{
   const cached=await caches.match(req);
   if(cached)return cached;
   const response=await fetch(req);
   if(response.ok){const cache=await caches.open(SHELL);await cache.put(req,response.clone())}
   return response;
  })());
  return;
 }
 if(isMedia(req)&&url.protocol==='https:'){
  event.respondWith((async()=>{
   const cached=await caches.match(req);
   if(cached)return cached;
   const response=await fetch(req);
   if(response.ok||response.type==='opaque'){
    const cache=await caches.open(MEDIA);
    await cache.put(req,response.clone());
    await trim(MEDIA,MAX_MEDIA);
   }
   return response;
  })());
 }
});
