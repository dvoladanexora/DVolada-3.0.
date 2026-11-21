import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {sendOrderPush} from '../backend/src/onesignal-push.js';

const file=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
const appId='01234567-89ab-cdef-0123-456789abcdef';
const orderId='abcdef01-2345-6789-abcd-abcdef012345';
const subscriptionId='12345678-abcd-1234-abcd-1234567890ab';

test('OneSignal web integration never forces permission or conflicts with existing PWA scope',()=>{
 const client=file('src/live/onesignal-push.js');
 const view=file('src/live/OpenAccessApp.jsx');
 const worker=file('public/push/onesignal/OneSignalSDKWorker.js');
 const pwa=file('public/sw.js');
 assert.match(client,/VITE_ONESIGNAL_APP_ID/);
 assert.match(client,/autoPrompt:false/);
 assert.match(client,/serviceWorkerPath:'push\/onesignal\/OneSignalSDKWorker\.js'/);
 assert.match(client,/scope:'\/push\/onesignal\/'/);
 assert.match(view,/onClick=\{togglePush\}/);
 assert.match(worker,/importScripts\('https:\/\/cdn.onesignal.com\/sdks\/web\/v16\/OneSignalSDK\.sw\.js'\)/);
 assert.doesNotMatch(pwa,/OneSignalSDK\.sw\.js/);
});
test('transactional push defaults disabled and never calls provider',async()=>{
 const r=await sendOrderPush({PUSH_NOTIFICATIONS_ENABLED:'false'},{
  subscriptionIds:[subscriptionId],kind:'order_created',orderId,orderNumber:'#77',
  fetcher:()=>{throw new Error('NO_NETWORK_ALLOWED')}
 });
 assert.deepEqual(r,{sent:false,reason:'disabled'});
});
test('server targets explicitly authorized subscription IDs and hides the secret',async()=>{
 let request;
 const r=await sendOrderPush({
  PUSH_NOTIFICATIONS_ENABLED:'true',ONESIGNAL_APP_ID:appId,ONESIGNAL_REST_API_KEY:'s3cr3t'
 },{
  subscriptionIds:[subscriptionId,subscriptionId],kind:'order_accepted',orderId,orderNumber:'DV 77',
  fetcher:async(url,opts)=>{
   request={url,opts};return {ok:true,json:async()=>({id:'message-id'})}
  }
 });
 assert.deepEqual(r,{sent:true,reason:'accepted'});
 assert.equal(request.url,'https://api.onesignal.com/notifications');
 assert.equal(request.opts.headers.Authorization,'Key s3cr3t');
 const body=JSON.parse(request.opts.body);
 assert.deepEqual(body.include_subscription_ids,[subscriptionId]);
 assert.equal(body.target_channel,'push');
 assert.deepEqual(body.data,{type:'order_accepted',orderId});
 assert.doesNotMatch(JSON.stringify(body),/s3cr3t/);
});
test('rejects arbitrary audiences and invalid event types instead of broadcasting',async()=>{
 const env={PUSH_NOTIFICATIONS_ENABLED:'true',ONESIGNAL_APP_ID:appId,ONESIGNAL_REST_API_KEY:'hidden'};
 const common={orderNumber:'DV 77',orderId,fetcher:()=>{throw Error('network')}};
 await assert.rejects(sendOrderPush(env,{...common,kind:'order_created',subscriptionIds:['all-users']}),/Invalid authorized/);
 await assert.rejects(sendOrderPush(env,{...common,kind:'discount-promo',subscriptionIds:[subscriptionId]}),/Invalid event/);
});
test('failed provider responses stay opaque to callers',async()=>{
 const r=await sendOrderPush({
  PUSH_NOTIFICATIONS_ENABLED:'true',ONESIGNAL_APP_ID:appId,ONESIGNAL_REST_API_KEY:'hidden'
 },{
  kind:'order_ready',subscriptionIds:[subscriptionId],orderId,orderNumber:'DV 77',
  fetcher:async()=>({ok:false,status:403,text:async()=>'<secret>'})
 });
 assert.deepEqual(r,{sent:false,reason:'provider-error',status:403});
});

test('retrying the same push event preserves the provider deduplication key',async()=>{
 const env={PUSH_NOTIFICATIONS_ENABLED:'true',ONESIGNAL_APP_ID:appId,ONESIGNAL_REST_API_KEY:'test'};
 const keys=[];
 const fetcher=async(_url,{body})=>{
  keys.push(JSON.parse(body).idempotency_key);
  return {ok:true,json:async()=>({id:'test'})};
 };
 const args={subscriptionIds:[subscriptionId],orderId,orderNumber:'DV 77',fetcher};
 await sendOrderPush(env,{...args,kind:'order_created'});
 await sendOrderPush(env,{...args,kind:'order_created'});
 await sendOrderPush(env,{...args,kind:'order_ready'});
 assert.match(keys[0],/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
 assert.equal(keys[0],keys[1]);
 assert.notEqual(keys[0],keys[2]);
});

test('React QA hosts OneSignal separately with secure CSP and isolated worker scope',()=>{
 const qa=file('staging/qa-worker.mjs');
 const build=file('scripts/package-qa-worker.mjs');
 const mainCsp=qa.match(/'Content-Security-Policy': "([^"]+)"/)?.[1]||'';
 assert.match(mainCsp,/script-src 'self' https:\/\/cdn\.onesignal\.com https:\/\/api\.onesignal\.com;/);
 assert.doesNotMatch(mainCsp,/script-src[^;]*\*/);
 assert.match(mainCsp,/frame-ancestors 'none'/);
 assert.match(qa,/pathname === '\/push-config'/);
 assert.match(qa,/Service-Worker-Allowed/);
 assert.match(qa,/\/push\/onesignal\//);
 assert.match(build,/'push\/onesignal\/OneSignalSDKWorker\.js'/);
 const identity=file('backend/src/qa-push-identity.js');
 assert.match(identity,/QA_ONESIGNAL_IDENTITY_VERIFIED/);
 assert.match(identity,/QA_ONESIGNAL_SIGNING_KEY/);
});
