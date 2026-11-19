import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const app=readFileSync(new URL('../src/main.jsx',import.meta.url),'utf8');
const chat=readFileSync(new URL('../src/DraggableChatFab.jsx',import.meta.url),'utf8');

test('R10: catalog shows each item photo when available and a placeholder otherwise',()=>{
 assert.match(app,/item\.image\?<img src=\{item\.image\}/);
 assert.match(app,/dv-food-photo-placeholder/);
});
test('R14/R15: cart groups and orders are separated by restaurant',()=>{
 assert.match(app,/const cartGroups=\[\.\.\.new Set\(cart\.map\(i=>String\(i\.placeId\)\)\)\]/);
 assert.match(app,/const groups=\[\.\.\.new Set\(cart\.map\(x=>String\(x\.placeId\)\)\)\]/);
 assert.match(app,/placeId:items\[0\]\.placeId,placeName:items\[0\]\.placeName/);
 assert.doesNotMatch(app,/¿Cambiar de restaurante\?/);
});
test('R14: quantity and notes target product and restaurant',()=>{
 assert.match(app,/quantity\(i\.id,-1,i\.placeId\)/);
 assert.match(app,/quantity\(i\.id,1,i\.placeId\)/);
 assert.match(app,/editCartInstruction\(i\.id,e\.target\.value,i\.placeId\)/);
});
test('R17: coupon field accepts input but does not invent a discount',()=>{
 assert.match(app,/id="dv-coupon-code"/);
 assert.match(app,/onChange=\{e=>setCoupon/);
 assert.doesNotMatch(app,/id="dv-coupon-code"[^>]*disabled/);
 assert.match(app,/descuentos todavía no están activos/);
});
test('R20: home catalog searches food by item and restaurant',()=>{
 assert.match(app,/const homeFoodCatalog=customerCatalog\.filter/);
 assert.match(app,/\[item\.name,item\.category,place\.name\]/);
});
test('R23: chat FAB has drag gestures and stored position',()=>{
 assert.match(chat,/dv_chat_fab_position/);
 assert.match(chat,/onPointerMove/);
});

test('Inicio: search ignores accents and case and explains empty categories',()=>{
 assert.match(app,/normalizeFoodSearch=value=>/);
 assert.match(app,/\.normalize\('NFD'\)/);
 assert.match(app,/const homeFoodQuery=normalizeFoodSearch\(headerSearch\)/);
 assert.match(app,/normalizeFoodSearch\(v\)\.includes\(homeFoodQuery\)/);
 assert.match(app,/No hay productos disponibles en esta categoría/);
});

const homeCss=readFileSync(new URL('../src/home-catalog.css',import.meta.url),'utf8');
test('Inicio: responsive theme and keyboard accessibility safeguards',()=>{
 assert.match(homeCss,/\[data-theme="dark"\] \.dv-food-feed-card/);
 assert.match(homeCss,/\.dv-food-feed-open:focus-visible/);
 assert.match(homeCss,/@media\(max-width:360px\)/);
 assert.match(homeCss,/@media\(prefers-reduced-motion:reduce\)/);
 assert.match(homeCss,/overflow-wrap:anywhere/);
});

test('Restaurantes: search tolerates accents and missing item lists',()=>{
 assert.match(app,/normalizeFoodSearch\(\[p\.name,p\.type,\.\.\.\(p\.items\|\|\[\]\)/);
 assert.match(app,/\.includes\(normalizeFoodSearch\(search\)\)/);
});
test('Restaurantes: prices ignore unavailable products',()=>{
 assert.match(app,/const cheapest=\(p\.items\|\|\[\]\)\.filter\(i=>i\.available!==false&&i\.soldOut!==true\)/);
 assert.match(app,/i\.available!==false&&i\.soldOut!==true&&Number\(i\.price\)<=/);
});

const restaurantCss=readFileSync(new URL('../src/restaurant-profile.css',import.meta.url),'utf8');
test('Restaurantes: responsive shelves, dark theme and keyboard focus',()=>{
 assert.match(homeCss,/\.dv-shelf-food:disabled/);
 assert.match(homeCss,/\.dv-shelf-food:focus-visible/);
 assert.match(homeCss,/@media\(max-width:420px\)/);
 assert.match(homeCss,/\[data-theme="dark"\] \.dv-shelf-food/);
 assert.match(restaurantCss,/\.dv-rp-item-title:focus-visible/);
 assert.match(restaurantCss,/@media\(max-width:360px\)/);
});

const restaurantProfile=readFileSync(new URL('../src/RestaurantProfile.jsx',import.meta.url),'utf8');
test('Restaurantes: profile search handles accents and structured extras',()=>{
 assert.match(restaurantProfile,/const normalizeQuery=value=>/);
 assert.match(restaurantProfile,/normalizeQuery\(query\)/);
 assert.match(restaurantProfile,/item\.extras\.map\(extra=>typeof extra==='string'/);
});

test('Mis pedidos: filter includes intermediate delivery statuses',()=>{
 for(const status of ['Aceptado','Preparando','Listo','Recogido','En camino','En ubicación']){
  assert.ok(app.includes('<option>'+status+'</option>'),'Missing filter '+status);
 }
});
test('Mis pedidos: searches order identifiers and products without accent sensitivity',()=>{
 assert.equal((app.match(/normalizeFoodSearch\(historyQuery\)/g)||[]).length,4);
});

const customerStyles=readFileSync(new URL('../src/style.css',import.meta.url),'utf8');
test('Mis pedidos: small-screen, dark-theme and keyboard safeguards',()=>{
 assert.match(customerStyles,/\.dv32 \.dv-orders-tabs button:focus-visible/);
 assert.match(customerStyles,/\.dv32 \.dv-chat-panel select/);
 assert.match(customerStyles,/\[data-theme="dark"\] \.dv32 \.dv-orders-tabs button.active/);
 assert.match(customerStyles,/@media\(max-width:420px\)/);
 assert.match(customerStyles,/\.dv32 \.dv-history-actions\{display:grid;grid-template-columns:1fr\}/);
});

test('Mis pedidos: empty states respect filters and canceled orders go to history',()=>{
 assert.match(app,/setOrdersTab\(immediate\?'history':'pending'\)/);
 assert.match(app,/setHistoryStatus\('Todos'\)/);
 assert.equal((app.match(/title="Sin pedidos que coincidan"/g)||[]).length,2);
 assert.equal((app.match(/\.includes\(normalizeFoodSearch\(historyQuery\)\)\)\)\.length===0/g)||[]).length,2);
});

test('Mandados: submit button follows phone, address, budget and connectivity validation',()=>{
 assert.match(app,/disabled=\{isOffline\|\|!list\.length/);
 assert.match(app,/guestPhone\.replace\(\/\\D\/g,''\)\.length<8/);
 assert.match(app,/address\.trim\(\)\.length<8/);
 assert.match(app,/!Number\.isFinite\(Number\(budget\)\)/);
});
test('Mandados: list items are trimmed and removable by accessible name',()=>{
 assert.match(app,/name:newItem\.trim\(\),qty:newQty\.trim\(\)/);
 assert.match(app,/aria-label=\{'Quitar '\+i\.name\+' de la lista'\}/);
 assert.match(app,/const id='DM-'\+Date\.now\(\)\.toString\(36\)/);
});

test('Mandados: fields are labeled and phone keyboard is appropriate',()=>{
 for(const field of ['dv-grocery-budget','dv-grocery-substitute','dv-grocery-name','dv-grocery-phone','dv-grocery-address']){
  assert.ok(app.includes('htmlFor="'+field+'"'));
  assert.ok(app.includes('id="'+field+'"'));
 }
 assert.match(app,/id="dv-grocery-phone" type="tel" inputMode="tel"/);
});
test('Mandados: responsive panels and dark theme are scoped',()=>{
 assert.match(customerStyles,/\.dv-groceries-layout\{grid-template-columns:minmax\(0,1\.15fr\)/);
 assert.match(customerStyles,/@media\(max-width:850px\)\{\.dv-groceries-layout/);
 assert.match(customerStyles,/\.dv-groceries-page \.add-grid\{grid-template-columns:minmax\(0,1fr\)/);
 assert.match(customerStyles,/\[data-theme="dark"\] \.dv-groceries-page \.surface/);
});

test('Favoritos: stale saved entries do not suppress empty-state guidance',()=>{
 assert.match(app,/customerCatalog\.some\(x=>customerWishlist\.includes\(String\(x\.place\.id\)/);
 assert.match(app,/places\.some\(p=>favorites\.includes\(p\.id\)\)/);
 assert.match(app,/No hay comidas habituales disponibles en el catálogo actual/);
});
test('Favoritos: removal uses normalized product keys and an accessible label',()=>{
 assert.match(app,/aria-label=\{'Quitar '\+x\.item\.name\+' de comidas favoritas'\}/);
 assert.match(app,/v\.filter\(k=>k!==String\(x\.place\.id\)\+'-'\+String\(x\.item\.id\)\)/);
});

test('Favoritos: cards show available photos and semantic controls',()=>{
 assert.match(app,/className="surface dv-favorite-product-card"/);
 assert.match(app,/className="dv-favorite-product-image"/);
 assert.match(app,/alt=\{'Foto de '\+x\.item\.name\}/);
 assert.match(app,/<article className="surface dv-favorite-product-card"/);
});
test('Favoritos: mobile, keyboard and dark theme styles are scoped',()=>{
 assert.match(customerStyles,/\.dv32 \.dv-favorites-products\{display:grid/);
 assert.match(customerStyles,/\.dv32 \.dv-favorite-product-image\{display:block/);
 assert.match(customerStyles,/\.dv32 \.dv-favorites-page button:focus-visible/);
 assert.match(customerStyles,/\[data-theme="dark"\] \.dv32 \.dv-favorite-product-card/);
});
