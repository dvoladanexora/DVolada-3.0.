import test from 'node:test';
import assert from 'node:assert/strict';
import {createLiveApi} from '../src/live/live-api.js';

test('cookie requests bind the active account and leave account codes out of URLs',async()=>{
 const requests=[];
 const api=createLiveApi({baseUrl:'https://qa.example',getSessionToken:()=>null,getClientAccount:()=>'qa-account',
  fetchImpl:async (url,options)=>{requests.push({url,...options});return new Response('{}')}});
 await api.clientAuthenticate('recover','begin',{code:'generated-test-code'});
 await api.me(true);
 await api.setFavorite('restaurant',true);
 assert.equal(requests[0].method,'POST');
 assert.equal(requests[0].headers['X-Client-Account'],undefined);
 assert.ok(!requests[0].url.includes('generated-test-code'));
 assert.equal(requests[1].headers.Authorization,undefined);
 assert.equal(requests[2].headers['X-Client-Account'],'qa-account');
 assert.equal(requests[2].cache,'no-store');
});

test('chat binds order and channel and keeps the original retry key in a header',async()=>{
 const api=createLiveApi({baseUrl:'https://qa.example',getSessionToken:()=>'legacy-token',
  fetchImpl:async (url,options)=>{
   assert.equal(url,'https://qa.example/api/v1/orders/qa-order/chat/courier');
   assert.equal(options.headers['Idempotency-Key'],'same-attempt');
   assert.equal(options.headers.Authorization,'Bearer legacy-token');
   assert.deepEqual(JSON.parse(options.body),{message:'Hola QA'});
   return new Response('{}');
  }});
 await api.sendMessage('qa-order','courier','Hola QA','same-attempt');
});
