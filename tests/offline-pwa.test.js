import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {execFileSync} from 'node:child_process';

const sw=readFileSync(new URL('../public/sw.js',import.meta.url),'utf8');
const app=readFileSync(new URL('../src/main.jsx',import.meta.url),'utf8');

test('service worker compila como JavaScript',()=>{
 execFileSync(process.execPath,['--check',new URL('../public/sw.js',import.meta.url).pathname]);
});
test('PWA prepara su shell y permite fallback offline',()=>{
 assert.match(sw,/precacheShell\(\)/);
 assert.match(sw,/cache\.put\(ROOT,response\.clone\(\)\)/);
 assert.match(sw,/caches\.match\(ROOT\)/);
});
test('recursos e imágenes se guardan con límite',()=>{
 assert.match(sw,/const MAX_MEDIA=90/);
 assert.match(sw,/trim\(MEDIA,MAX_MEDIA\)/);
 assert.match(sw,/await cache\.put\(req,response\.clone\(\)\)/);
});
test('operaciones de servidor no se almacenan',()=>{
 assert.match(sw,/req\.method!=='GET'/);
 assert.match(sw,/\/api\\\//);
});
test('carrito y favoritos permanecen en almacenamiento local',()=>{
 assert.match(app,/stored\('dv_cart',\[\]\)/);
 assert.match(app,/stored\('dv_favorites',\[\]\)/);
 assert.match(app,/setCart\(/);
 assert.match(app,/setFavorites\(/);
});
test('no confirma pedidos ni mandados sin conexión',()=>{
 assert.match(app,/function placeOrder\(\)\{if\(isOffline\)/);
 assert.match(app,/function sendMandado\(\)\{if\(isOffline\)/);
 assert.match(app,/disabled=\{isOffline\|\|/);
});
