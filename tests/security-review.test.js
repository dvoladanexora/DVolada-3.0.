import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {generateDemoPin} from '../src/demo-pin.js';
import {CUSTOMER_STORAGE_KEYS,clearLocalCustomerData} from '../src/customer-privacy.js';
import {validProductionDeployment,publicHttpsOrigin} from '../server/src/deployment-guard.js';
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

test('Módulo Local/Plus no exporta fórmulas CSV ni ejecuta scripts en recibos',()=>{
 const code=readFileSync(new URL('../src/PartnerConsole.jsx',import.meta.url),'utf8');
 assert.ok(code.includes("import {csvFromRows} from './restaurant-export.js'"));
 assert.ok(code.includes('const csv=csvFromRows(rows)'));
 assert.ok(!code.includes("const csv='\\uFEFF'+rows.map"));
 assert.ok(code.includes("try{w.opener=null}catch{}"));
 assert.ok(code.includes('Content-Security-Policy'));
 assert.ok(!code.includes('<script>window.onload'));
 assert.ok(code.includes("logo.addEventListener('load',printNow"));
 assert.ok(code.includes("logo.addEventListener('error',printNow"));
});

test('Fotografías demasiado grandes no bloquean el editor ni se procesan como SVG',async()=>{
 const {readPhotoAsThumbnail,MAX_MENU_IMAGE_FILE,MAX_MENU_IMAGE_PIXELS}=await import('../src/restaurant-menu-rules.js');
 assert.equal(MAX_MENU_IMAGE_PIXELS,30_000_000);
 await assert.rejects(readPhotoAsThumbnail({type:'image/svg+xml',size:100}),/JPG, PNG o WebP/);
 await assert.rejects(readPhotoAsThumbnail({type:'image/jpeg',size:MAX_MENU_IMAGE_FILE+1}),/5 MB/);
 await assert.rejects(readPhotoAsThumbnail({type:'image/png',size:0}),/5 MB/);
 const source=readFileSync(new URL('../src/restaurant-menu-rules.js',import.meta.url),'utf8');
 assert.ok(source.includes('widthOriginal*heightOriginal>MAX_MENU_IMAGE_PIXELS'));
 assert.ok(source.includes("const timeout=setTimeout(()=>done("));
 assert.ok(source.includes('URL.revokeObjectURL(src)'));
 assert.ok(source.includes('if(completed)return'));
});
test('La web no entrega la URL del visitante como Referer a imágenes, mapas ni CDN',()=>{
 const html=readFileSync(new URL('../index.html',import.meta.url),'utf8');
 assert.ok(html.includes('<meta name="referrer" content="no-referrer"/>'));
});

test('Configuración de producción requiere HTTPS público y lista de orígenes',()=>{
 const good={nodeEnv:'production',publicApiOrigin:'https://api.dvolada.example.com',allowedOrigins:['https://dvolada.example.com']};
 assert.deepEqual(validProductionDeployment(good),{ok:true});
 for(const url of [
  '', 'http://api.dvolada.example.com','https://localhost','https://localhost:8787',
  'https://127.0.0.1','https://127.1','https://192.168.0.1',
  'https://[::1]','https://intranet','https://api.local',
  'https://api.example.test','https://api.example.com/path',
  'https://api.example.com/?x=1','https://user:pass@api.example.com',
 ]){
  assert.equal(validProductionDeployment({...good,publicApiOrigin:url}).ok,false,url);
 }
 assert.equal(validProductionDeployment({...good,allowedOrigins:[]}).ok,false);
 assert.equal(validProductionDeployment({...good,allowedOrigins:['http://localhost:5173']}).ok,false);
 assert.equal(validProductionDeployment({nodeEnv:'development',publicApiOrigin:'',allowedOrigins:[]}).ok,true);
 const server=readFileSync(new URL('../server/src/server.js',import.meta.url),'utf8');
 assert.ok(server.includes("process.env.DVOLADA_BIND_HOST||'127.0.0.1'"));
 assert.ok(server.includes("validProductionDeployment({"));
 assert.ok(server.includes("if(!deployment.ok){console.error('Refusing insecure API startup:'"));
 assert.ok(server.includes("||!['127.0.0.1','localhost','::1'].includes(bindHost)"));
 assert.ok(server.includes('server.listen(port,bindHost,'));
});

test('La publicación pública se niega sin lockfiles y ejecuta auditoría y pruebas',()=>{
 const deploy=readFileSync(new URL('../.github/workflows/deploy.yml',import.meta.url),'utf8');
 assert.ok(deploy.includes('test -f package-lock.json'));
 assert.ok(deploy.includes('test -f server/package-lock.json'));
 assert.ok(deploy.includes('npm ci --no-audit --no-fund'));
 assert.ok(deploy.includes('npm --prefix server ci --ignore-scripts'));
 assert.ok(deploy.includes('npm audit --audit-level=high'));
 assert.ok(deploy.includes('npm --prefix server audit --omit=dev --audit-level=high'));
 assert.ok(deploy.includes('npm run test:all'));
 assert.ok(deploy.includes('npm run check:server'));
 assert.ok(deploy.indexOf('npm run test:all')<deploy.indexOf('npm run build'));
});

test('Paquete de producción excluye el Device Studio pero conserva QA de desarrollo',()=>{
 const pkg=JSON.parse(readFileSync(new URL('../package.json',import.meta.url),'utf8'));
 const script=readFileSync(new URL('../scripts/remove-qa-assets.mjs',import.meta.url),'utf8');
 const validate=readFileSync(new URL('../.github/workflows/validate-pr.yml',import.meta.url),'utf8');
 const deploy=readFileSync(new URL('../.github/workflows/deploy.yml',import.meta.url),'utf8');
 assert.ok(pkg.scripts.build.includes('node scripts/remove-qa-assets.mjs'));
 assert.ok(script.includes("const files=['device-studio.html']"));
 assert.ok(script.includes('rm(target,{force:true})'));
 for(const ci of [validate,deploy])assert.ok(ci.includes('test ! -e dist/device-studio.html'));
 assert.equal(pkg.scripts.dev,'vite --host 127.0.0.1');
 assert.ok(!pkg.scripts.dev.includes('remove-qa-assets'),
  'La vista de QA puede usarse durante desarrollo, no en producción');
});

test('El cliente puede borrar sus datos locales sin destruir la configuración del negocio',()=>{
 const saved=new Map([
  ...CUSTOMER_STORAGE_KEYS.map((key,i)=>[key,'private-'+i]),
  ['dv_places','business-catalog'],['dv_fee_payments','business-payments'],
  ['dv_couriers','independent-courier-admin'],['dv_online_settings_1','restaurant-settings']
 ]);
 const storage={removeItem:key=>saved.delete(key)};
 const cleared=clearLocalCustomerData(storage);
 assert.equal(cleared.ok,true);assert.deepEqual(cleared.failed,[]);
 assert.equal(cleared.removed,CUSTOMER_STORAGE_KEYS.length);
 for(const key of CUSTOMER_STORAGE_KEYS)assert.equal(saved.has(key),false,key);
 for(const key of ['dv_places','dv_fee_payments','dv_couriers','dv_online_settings_1'])
  assert.equal(saved.has(key),true,'No debe borrar datos de restaurante: '+key);
 assert.equal(clearLocalCustomerData(null).ok,false);
 let attempts=0;
 const failed=clearLocalCustomerData({removeItem:()=>{attempts++;throw Error('Storage blocked')}});
 assert.equal(failed.ok,false);assert.equal(attempts,CUSTOMER_STORAGE_KEYS.length);
});
test('La opción de privacidad exige confirmación antes de borrar o recargar',()=>{
 const app=readFileSync(new URL('../src/main.jsx',import.meta.url),'utf8');
 assert.ok(app.includes("import {clearLocalCustomerData} from './customer-privacy.js'"));
 assert.ok(app.includes('Borrar mis datos de este dispositivo'));
 assert.ok(app.includes("if(!window.confirm('¿Borrar perfil"));
 assert.ok(app.includes('clearLocalCustomerData(localStorage)'));
 assert.ok(app.includes("if(!result.ok){notify("));
 assert.ok(app.includes('window.location.reload()'));
});

test('Retención de idempotencia permite limpiar lotes sin borrar pedidos ni eventos',()=>{
 const migration=readFileSync(new URL('../server/sql/003_idempotency_retention.sql',import.meta.url),'utf8');
 const cleanup=readFileSync(new URL('../server/sql/maintenance_idempotency_cleanup.sql',import.meta.url),'utf8');
 assert.ok(migration.includes('ALTER TABLE online_idempotency'));
 assert.ok(migration.includes('expires_at timestamptz NOT NULL DEFAULT'));
 assert.ok(migration.includes("interval '7 days'"));
 assert.ok(migration.includes('idx_online_idempotency_expires_at'));
 assert.ok(cleanup.includes('DELETE FROM online_idempotency'));
 assert.ok(cleanup.includes('WHERE expires_at < now()'));
 assert.ok(cleanup.includes('LIMIT 1000'));
 assert.ok(cleanup.includes('FOR UPDATE SKIP LOCKED'));
 assert.ok(!cleanup.includes('DELETE FROM online_orders'));
 assert.ok(!cleanup.includes('DELETE FROM online_order_events'));
});
test('Publicación manual solo puede desplegar la rama main de este repositorio',()=>{
 const deploy=readFileSync(new URL('../.github/workflows/deploy.yml',import.meta.url),'utf8');
 const expected="github.ref == 'refs/heads/main' && github.repository == 'dvoladanexora/DVolada-3.0.'";
 assert.equal(deploy.split(expected).length-1,2,'build y deploy requieren main y repo exacto');
 assert.ok(deploy.includes('npm ci --no-audit --no-fund'));
 assert.ok(deploy.includes('npm --prefix server ci --ignore-scripts'));
});

test('En producción CORS rechaza orígenes de redes locales o manipulados',()=>{
 const base={nodeEnv:'production',publicApiOrigin:'https://api.dvolada.example.com'};
 const blocked=[
  'https://localhost','https://127.0.0.1:444',
  'https://192.168.1.1','https://10.0.0.3','https://[::1]',
  'https://office.internal','https://router.local','https://private.lan',
  'https://frontend.example.test','https://intranet',
  'https://user:pass@dvolada.example.com',
  'http://dvolada.example.com','https://dvolada.example.com/path',
  'https://dvolada.example.com?secret=1','https://dvolada.example.com/#fragment'
 ];
 for(const origin of blocked){
  assert.equal(publicHttpsOrigin(origin),false,origin);
  assert.equal(validProductionDeployment({...base,allowedOrigins:[origin]}).ok,false,origin);
 }
 assert.equal(publicHttpsOrigin('https://dvolada.example.com'),true);
 assert.equal(validProductionDeployment({...base,allowedOrigins:['https://dvolada.example.com']}).ok,true);
 assert.equal(validProductionDeployment({...base,allowedOrigins:['https://dvolada.example.com','https://localhost']}).ok,false);
});
