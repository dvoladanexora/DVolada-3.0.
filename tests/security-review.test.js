import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {generateDemoPin} from '../src/demo-pin.js';
import {neutralizeSpreadsheetFormula,csvFromRows} from '../src/restaurant-export.js';

test('PIN de prueba usa números criptográficos de seis dígitos sin sesgo de módulo',()=>{
 const values=[0,899999,900000];
 for(const value of values){
  const pin=generateDemoPin(arr=>{arr[0]=value;return arr});
  assert.match(pin,/^\d{6}$/);
  assert.equal(pin,String(100000+(value%900000)));
 }
 assert.equal(generateDemoPin(arr=>{arr[0]=899999;return arr}),'999999');
});
test('PIN de prueba descarta números fuera del intervalo uniforme antes de usarlos',()=>{
 let calls=0;
 const pin=generateDemoPin(arr=>{
  arr[0]=calls++===0?0xffffffff:42;
  return arr;
 });
 assert.equal(calls,2);
 assert.equal(pin,'100042');
});
test('PIN de prueba falla cerrado si la API criptográfica no existe o es defectuosa',()=>{
 assert.throws(()=>generateDemoPin(null),/Aleatoriedad segura/);
 assert.throws(()=>generateDemoPin(()=>undefined),/Aleatoriedad segura/);
 assert.throws(()=>generateDemoPin(arr=>{arr[0]=0xffffffff;return arr}),/No se pudo generar/);
 const main=readFileSync(new URL('../src/main.jsx',import.meta.url),'utf8');
 assert.ok(main.includes('const makePin=()=>generateDemoPin()'));
 assert.ok(!main.includes('const makePin=()=>String(Math.floor(100000+Math.random()'));
 assert.ok(main.includes("if(!globalThis.crypto?.getRandomValues){notify("));
});
test('Exportación impide fórmulas ocultas tras Unicode invisible o saltos de línea',()=>{
 const malicious=[
  '=HYPERLINK("https://example.com")','\u200B=1+2','\u200E+SUM(1,2)',
  '\u202E-1+2','\u2060@SUM(1,2)','\n\t=cmd','\t@formula','  =2+2'
 ];
 for(const value of malicious)assert.ok(neutralizeSpreadsheetFormula(value).startsWith("'"),JSON.stringify(value));
 for(const name of ['Cliente auténtico','Pollo con tajadas','80.50'])
  assert.equal(neutralizeSpreadsheetFormula(name),name);
 const csv=csvFromRows([['cliente','total'],['\u200B=1+2','80']]);
 assert.ok(csv.includes('"\'\u200B=1+2"'));
});
test('Errores de base de datos no registran datos privados ni mensajes SQL',()=>{
 const server=readFileSync(new URL('../server/src/server.js',import.meta.url),'utf8');
 assert.ok(server.includes("const requestId=randomUUID()"));
 assert.ok(server.includes("res.setHeader('X-Request-ID',requestId)"));
 assert.ok(server.includes("console.error('API internal error',JSON.stringify({requestId,code:safeCode}))"));
 assert.ok(!server.includes("console.error('API error',e)"));
 assert.ok(server.includes("return send(res,500,{error:'Internal server error',requestId})"));
});
