import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';

test('QA shell installs offline and excludes private and push routes from cache',async()=>{
 const listeners={}, cached=new Map(), removed=[];
 let activated=false;
 const source=readFileSync(new URL('../public/sw.js',import.meta.url),'utf8')
  .replace("const ROOT='/DVolada-3.0./';","const ROOT='/';")
  .replace('const LIVE_ASSETS=[];',"const LIVE_ASSETS=['assets/main.js'];");
 runInNewContext(source,{
  URL,Response,fetch:async()=>{throw Error('offline')},
  caches:{open:async()=>({
   addAll:async urls=>urls.forEach(url=>cached.set(url,new Response(url))),
   match:async url=>cached.get(url)?.clone(),
  }),match:async req=>cached.get(new URL(req.url).pathname)?.clone(),keys:async()=>['dvolada-shell-old','dvolada-shell-v9','separate-provider'],delete:async key=>removed.push(key)},
  self:{location:new URL('https://qa.example'),addEventListener:(type,fn)=>{listeners[type]=fn},
   skipWaiting:()=>{activated=true},clients:{claim:async()=>{}}},
 });
 let result;
 listeners.install({waitUntil:value=>{result=value}});
 await result;
 assert.ok(cached.has('/assets/main.js'));
 assert.ok(cached.has('/logo.png'));
 function route(path,method='GET',mode='navigate'){
  let response;
  listeners.fetch({request:{url:'https://qa.example'+path,method,mode},respondWith:value=>{response=value}});
  return response;
 }
 for(const path of ['/','/pruebas','/pruebas/']) assert.equal(await (await route(path)).text(),'/index.html');
 assert.equal(await (await route('/assets/main.js','GET','cors')).text(),'/assets/main.js');
 assert.equal(await (await route('/logo.png','GET','cors')).text(),'/logo.png');
 for(const path of ['/api/v1/auth/me','/push-config','/version.json','/push/onesignal/OneSignalSDKWorker.js']) assert.equal(route(path),undefined);
 assert.equal(route('/api/v1/customer/orders','POST'),undefined);
 assert.equal(activated,false);
 listeners.message({data:{type:'SKIP_WAITING'}});
 assert.equal(activated,true);
 listeners.activate({waitUntil:value=>{result=value}});
 await result;
 assert.deepEqual(removed,['dvolada-shell-old']);
});
