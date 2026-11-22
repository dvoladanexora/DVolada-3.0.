import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {resolve,dirname,join} from 'node:path';
import {pathToFileURL} from 'node:url';

const file=resolve(process.argv[2]);
const {default:worker}=await import(pathToFileURL(file));
const sha=(await readFile(join(dirname(file),'SHA'),'utf8')).trim();
const qa='dvolada-qa.dvoladanexora.workers.dev';
const production='online.example.test';
const env={DVOLADA_QA_HOST:qa,DVOLADA_ONLINE_HOST:production};
const get=(host,path,bindings=env)=>worker.fetch(new Request('https://'+host+path),bindings,{});
assert.equal((await get(production,'/')).status,404,'production is off by default');
assert.equal((await get('wrong.example.test','/')).status,404);
const ready={...env,DVOLADA_ONLINE_SERVE:'true'};
assert.equal((await get(production,'/pruebas',ready)).status,404);
assert.equal((await get(qa,'/pruebas')).status,200);
for(const [host,bindings] of [[qa,env],[production,ready]]){
 const version=await get(host,'/version.json',bindings);
 assert.equal((await version.json()).version,sha);
 const account=await get(host,'/cuenta',bindings);
 assert.equal(account.status,200);
 assert.match(await account.text(),new RegExp(sha));
 const push=await get(host,'/push-config',bindings);
 assert.deepEqual(await push.json(),{enabled:false,appId:null});
}
console.log('Artefacto validado: mismo SHA en ambos entornos, producción cerrada por defecto y ruta QA aislada.');
