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
