import test from 'node:test';
import assert from 'node:assert/strict';
import {createLiveApi,validateApiOrigin,LiveApiError} from '../src/live/live-api.js';

test('live API only accepts HTTPS origin or local development URLs',()=>{
 for(const origin of ['http://somewhere.test','https://api.example.com/x','https://user:pass@api.test','file:///app','invalid'])
  assert.throws(()=>validateApiOrigin(origin));
 assert.equal(validateApiOrigin('https://api.dvolada.test/'),'https://api.dvolada.test');
 assert.equal(validateApiOrigin('http://localhost:8787/'),'http://localhost:8787');
});

test('anonymous Firebase exchange sends no bearer token or browser storage',async()=>{
 let captured;
 const api=createLiveApi({baseUrl:'https://api.test',getSessionToken:()=>null,
  fetchImpl:async(url,options)=>{captured={url,options};return {ok:true,status:200,json:async()=>({sessionToken:'test'})}}});
 await api.exchange('firebase-jwt-for-testing','Galaxy S23');
 assert.equal(captured.url,'https://api.test/api/v1/auth/exchange');
 assert.equal(captured.options.headers.Authorization,undefined);
 assert.equal(captured.options.cache,'no-store');
 assert.deepEqual(JSON.parse(captured.options.body),{idToken:'firebase-jwt-for-testing',deviceLabel:'Galaxy S23'});
});

test('private restaurant calls carry tenant and session, no cache',async()=>{
 let captured;
 const api=createLiveApi({baseUrl:'https://api.test',getSessionToken:()=> 'very-private-token',
  fetchImpl:async(url,options)=>{captured={url,options};return {ok:true,status:200,json:async()=>({orders:[]})}}});
 await api.restaurantOrders('restaurant-a');
 assert.equal(captured.options.headers.Authorization,'Bearer very-private-token');
 assert.equal(captured.options.headers['X-Restaurant-ID'],'restaurant-a');
 assert.equal(captured.options.cache,'no-store');
 assert.equal(captured.url,'https://api.test/api/v1/restaurant/orders');
});

test('status updates include versioned action and stable idempotency key',async()=>{
 let captured;
 const api=createLiveApi({baseUrl:'https://api.test',getSessionToken:()=> 'token',
  fetchImpl:async(url,options)=>{captured={url,options};return {ok:true,status:200,json:async()=>({order:{id:'x',version:3}})}}});
 await api.restaurantStatus('tenant-1',{id:'order-1',version:2},'Preparando','uuid-key-1');
 assert.equal(captured.options.method,'PATCH');
 assert.equal(captured.options.headers['Idempotency-Key'],'uuid-key-1');
 assert.equal(captured.options.headers['X-Restaurant-ID'],'tenant-1');
 assert.deepEqual(JSON.parse(captured.options.body),{expectedVersion:2,status:'Preparando'});
});

test('customer cart transmits product IDs and quantities, never its UI price',async()=>{
 let body;
 const api=createLiveApi({baseUrl:'https://api.test',getSessionToken:()=> 'token',
  fetchImpl:async(url,options)=>{body=JSON.parse(options.body);return {ok:true,status:201,json:async()=>({order:{id:'x'}})}}});
 await api.createOrder({restaurantId:'r',deliveryMethod:'pickup',deliveryAddress:'',
  items:[{productId:'product-1',quantity:2}]},'uuid-key-2');
 assert.equal(body.items[0].quantity,2);
 assert.equal('price' in body.items[0],false);
 assert.equal('total' in body,false);
});

test('server 409 is surfaced without automatic mutating retry',async()=>{
 let calls=0;
 const api=createLiveApi({baseUrl:'https://api.test',getSessionToken:()=> 'token',
  fetchImpl:async()=>{calls++;return {ok:false,status:409,json:async()=>({error:'ORDER_CHANGED'})}}});
 await assert.rejects(()=>api.courierStatus({id:'x',version:2},'Recogido','uuid-key-3'),
  e=>e instanceof LiveApiError&&e.status===409);
 assert.equal(calls,1);
});

test('a missing session or disconnected API cannot confirm orders',async()=>{
 const api=createLiveApi({baseUrl:'https://api.test',getSessionToken:()=>null,
  fetchImpl:async()=>{throw Error('unreachable')}});
 await assert.rejects(()=>api.createOrder({},'uuid-key-4'),e=>e.status===401);
 const authApi=createLiveApi({baseUrl:'https://api.test',getSessionToken:()=> 'token',
  fetchImpl:async()=>{throw Error('connection lost')}});
 await assert.rejects(()=>authApi.customerOrders(),e=>e instanceof LiveApiError&&e.code==='SIN_CONEXION');
});
