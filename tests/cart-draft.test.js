import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {readCart,writeCart,updateQuantity} from '../src/live/cart-draft.js';

test('cart reload is isolated by account and excludes sensitive checkout fields',()=>{
 const records=new Map();
 const storage={getItem:key=>records.get(key),setItem:(key,value)=>records.set(key,value),
  removeItem:key=>records.delete(key)};
 const account=randomUUID(),restaurantId=randomUUID(),pendingKey=randomUUID();
 const items=[{productId:randomUUID(),name:'Producto QA',priceMinor:1200,quantity:1,token:'discard'}];
 writeCart(account,{restaurantId,items,pendingKey,phone:'discard',address:'discard'},storage);
 assert.equal(readCart(account,storage).pendingKey,pendingKey);
 assert.equal(readCart(account,storage).items[0].quantity,1);
 assert.ok(!Array.from(records.values())[0].includes('discard'));
 assert.equal(readCart(randomUUID(),storage).items.length,0);
 writeCart(account,{items:[]},storage);
 assert.equal(readCart(account,storage).items.length,0);
});

test('cart limits match checkout and storage failures are handled',()=>{
 const product={productId:randomUUID(),name:'Producto QA',priceMinor:1200};
 const items=updateQuantity([],product,1);
 assert.equal(updateQuantity(items,product,1)[0].quantity,2);
 assert.deepEqual(updateQuantity(items,product,-1),[]);
 assert.equal(updateQuantity([{...product,quantity:25}],product,1)[0].quantity,25);
 assert.equal(readCart('guest',{getItem(){throw new Error('disabled')}}).items.length,0);
});
