import test from 'node:test';
import assert from 'node:assert/strict';
import staging from '../staging/onesignal-site-worker.js';

const url=path=>'https://dvolada-web-staging.pages.dev'+path;
async function fetchPage(path,env={}){
 return staging.fetch(new Request(url(path)),env);
}

test('PWA preview stays clearly read-only and cannot accept orders',async()=>{
 const home=await fetchPage('/');
 assert.equal(home.status,200);
 assert.equal(home.headers.get('X-Frame-Options'),'DENY');
 const html=await home.text();
 assert.match(html,/PRELANZAMIENTO/);
 assert.match(html,/Los pedidos reales están desactivados/);
 assert.match(html,/manifest.webmanifest/);
 const health=await fetchPage('/health');
 assert.deepEqual(await health.json(),{status:'ok',service:'dvolada-pwa-staging',checkoutEnabled:false});
 const method=await staging.fetch(new Request(url('/api/v1/customer/orders'),{method:'POST'}),{});
 assert.equal(method.status,405);
});
test('OneSignal worker has an isolated push scope and public app id is optional',async()=>{
 const worker=await fetchPage('/push/onesignal/OneSignalSDKWorker.js');
 assert.equal(worker.status,200);
 assert.equal(worker.headers.get('Service-Worker-Allowed'),'/push/onesignal/');
 assert.match(await worker.text(),/cdn.onesignal.com\/sdks\/web\/v16\/OneSignalSDK.sw.js/);
 const pwa=await fetchPage('/sw.js');
 assert.equal(pwa.headers.get('Service-Worker-Allowed'),'/');
 const conf=await fetchPage('/push-config');
 assert.deepEqual(await conf.json(),{appId:null});
});
test('PWA serves manifest, CSS and read-only catalog frontend',async()=>{
 const manifest=await fetchPage('/manifest.webmanifest');
 const data=await manifest.json();
 assert.equal(data.scope,'/');
 assert.equal(data.display,'standalone');
 const js=await (await fetchPage('/app.js')).text();
 assert.match(js,/api\/v1\/catalog\/restaurants/);
 assert.doesNotMatch(js,/customer\/orders.*POST/);
 const css=await fetchPage('/app.css');
 assert.equal(css.status,200);
 assert.match(css.headers.get('Content-Type'),/text\/css/);
});
