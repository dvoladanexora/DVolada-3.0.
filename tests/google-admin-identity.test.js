import test from 'node:test';
import assert from 'node:assert/strict';
import {webcrypto} from 'node:crypto';
import {verifyGoogleAdminIdentity,googleAdminConfiguration,verifyGoogleIdentity} from '../backend/src/google-admin-identity.js';

const env={
 GOOGLE_ADMIN_CLIENT_ID:'test-client.apps.googleusercontent.com',
 GOOGLE_ADMIN_EMAILS:'founder.one@gmail.com,founder.two@gmail.com'
};
const now=1800000000;
const nonce='A'.repeat(43);
const base={iss:'https://accounts.google.com',aud:env.GOOGLE_ADMIN_CLIENT_ID,
 sub:'12345',email:'founder.one@gmail.com',email_verified:true,
 nonce,iat:now-30,exp:now+300};
const cryptoApi=globalThis.crypto||webcrypto;
const {publicKey,privateKey}=await cryptoApi.subtle.generateKey({
 name:'RSASSA-PKCS1-v1_5',modulusLength:2048,publicExponent:new Uint8Array([1,0,1]),
 hash:'SHA-256'
},true,['sign','verify']);
const jwk={...await cryptoApi.subtle.exportKey('jwk',publicKey),kid:'test-key',alg:'RS256',use:'sig'};
const fetchImpl=async url=>{
 assert.equal(url,'https://www.googleapis.com/oauth2/v3/certs');
 return new Response(JSON.stringify({keys:[jwk]}));
};
const encode=value=>Buffer.from(JSON.stringify(value)).toString('base64url');
async function sign(claims=base,header={alg:'RS256',kid:'test-key'}){
 const input=encode(header)+'.'+encode(claims);
 const sig=await cryptoApi.subtle.sign('RSASSA-PKCS1-v1_5',privateKey,new TextEncoder().encode(input));
 return input+'.'+Buffer.from(sig).toString('base64url');
}
const verify=(token,opts={})=>verifyGoogleAdminIdentity(token,env,nonce,{fetchImpl,now,...opts});
test('only the two separately configured Google administrators qualify',async()=>{
 assert.deepEqual(await verify(await sign()),{subject:'12345',email:'founder.one@gmail.com'});
 assert.deepEqual(await verify(await sign({...base,sub:'67890',email:'Founder.Two@gmail.com'})),
 {subject:'67890',email:'founder.two@gmail.com'});
 await assert.rejects(verify(await sign({...base,email:'third@gmail.com'})));
});
test('configuration accepts one confirmed account temporarily, at most two distinct accounts',()=>{
 assert.equal(googleAdminConfiguration({...env,GOOGLE_ADMIN_EMAILS:'founder.one@gmail.com'}).emails.size,1);
 for(const config of [{},
 {...env,GOOGLE_ADMIN_EMAILS:'a@gmail.com,A@gmail.com'},
 {...env,GOOGLE_ADMIN_EMAILS:'a@gmail.com,b@gmail.com,c@gmail.com'},
 {...env,GOOGLE_ADMIN_CLIENT_ID:'not-configured'}]){
  assert.throws(()=>googleAdminConfiguration(config));
 }
});
test('signed but invalid claims never authorize a session',async()=>{
 for(const changes of [{aud:'another-client.apps.googleusercontent.com'},{iss:'https://evil.example'},
 {email_verified:false},{exp:now},{iat:now-601},{nonce:'B'.repeat(43)},
 {sub:''},{azp:'another-client.apps.googleusercontent.com'},{nbf:now+1}]){
  await assert.rejects(verify(await sign({...base,...changes})));
 }
});
test('tampered signatures, unknown keys and unsigned tokens fail closed',async()=>{
 const token=await sign();
 const [header,body,sig]=token.split('.');
 await assert.rejects(verify(header+'.'+encode({...base,sub:'different'})+'.'+sig));
 await assert.rejects(verify(await sign(base,{alg:'RS256',kid:'unknown'})));
 await assert.rejects(verify(await sign(base,{alg:'none',kid:'test-key'})));
 await assert.rejects(verify(token,{fetchImpl:async()=>new Response('',{status:503})}));
});

// Workerd's native fetch requires the global receiver, unlike Node's fetch.
test('default Google key fetch preserves the Worker global receiver',async t=>{
 const original=globalThis.fetch;
 t.after(()=>{globalThis.fetch=original});
 globalThis.fetch=async function(url,options){
  assert.equal(this,globalThis);
  assert.equal(options.redirect,'follow');
  assert.equal(options.headers.accept,'application/json');
  return fetchImpl(url);
 };
 assert.deepEqual(await verifyGoogleAdminIdentity(await sign(),env,nonce,{now}),
  {subject:'12345',email:'founder.one@gmail.com'});
});

test('retries transient Google key failures but does not accept untrusted key sources',async()=>{
 const token=await sign();let calls=0;
 assert.deepEqual(await verify(token,{fetchImpl:async()=>++calls===1?new Response('',{status:503}):fetchImpl('https://www.googleapis.com/oauth2/v3/certs')}),{subject:'12345',email:'founder.one@gmail.com'});
 assert.equal(calls,2);
 await assert.rejects(verify(token,{fetchImpl:async()=>({ok:true,url:'https://example.com/keys',json:async()=>({keys:[jwk]})})}),{code:'GOOGLE_ADMIN_KEYS_UNAVAILABLE'});
});

test('public Google accepts verified non-admin accounts only for the public audience',async()=>{
 const client='public-client.apps.googleusercontent.com';
 const token=await sign({...base,aud:client,email:'customer@example.com',name:'Cliente de prueba'});
 assert.deepEqual(await verifyGoogleIdentity(token,client,nonce,{fetchImpl,now}),{subject:'12345',email:'customer@example.com',name:'Cliente de prueba'});
 await assert.rejects(verify(token));
 await assert.rejects(verifyGoogleIdentity(await sign(),client,nonce,{fetchImpl,now}));
});
