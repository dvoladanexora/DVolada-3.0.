import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const file=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
test('live build is public and no longer requires Firebase',()=>{
 const main=file('src/main.jsx'),publicView=file('src/live/OpenAccessApp.jsx');
 assert.match(main,/IS_LIVE_BUILD\?<OpenAccessApp\/>/);
 assert.doesNotMatch(publicView,/firebase|signInWithEmailAndPassword|createUserWithEmailAndPassword/i);
 assert.match(publicView,/api\.restaurants\(\)/);
 assert.match(publicView,/api\.products\(r\.id\)/);
});
test('guest checkout collects customer phone but does not claim to send orders',()=>{
 const ui=file('src/live/OpenAccessApp.jsx');
 assert.match(ui,/\+504/);
 assert.match(ui,/phoneDigits/);
 assert.match(ui,/verificación por SMS/i);
 assert.doesNotMatch(ui,/api\.createOrder\(/);
 assert.match(ui,/Pedidos reales desactivados/);
});
test('server enforces verified customer phone at checkout and keeps sales off by default',()=>{
 const orders=file('backend/src/orders.js'),config=file('backend/cloudflare.config.ts');
 const migration=file('backend/migrations/0007_customer_phones.sql');
 assert.match(orders,/PHONE_NOT_VERIFIED/);
 assert.match(orders,/phone_verified_at/);
 assert.match(migration,/trg_checkout_phone/);
 assert.match(config,/ORDER_CREATION_ENABLED:bindings\.text\('false'\)/);
 assert.doesNotMatch(file('backend/src/index.js'),/exchangeFirebase|FIREBASE_PROJECT_ID/);
});
