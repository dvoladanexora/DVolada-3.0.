import {test} from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync} from 'node:fs';
import {betaGate,betaHash} from '../src/beta-gate.js';
import {randomSecret} from '../src/client-access.js';

test('closed beta invitation is single-use, independent of app roles, expires and revokes',async()=>{
 const sqlite=new DatabaseSync(':memory:');
 try{
  sqlite.exec(readFileSync(new URL('../migrations/0021_closed_beta.sql',import.meta.url),'utf8'));
  const db={prepare(sql){return {bind(...args){return {async first(){return sqlite.prepare(sql).get(...args)}}}}}};
  const origin='https://beta.example.test';
  const request=(path,options)=>betaGate(new Request(origin+path,options),db);
  const code=randomSecret();
  sqlite.prepare("INSERT INTO closed_beta_invitations(id,invitation_hash,expires_at) VALUES('customer',?,unixepoch()+3600)").run(await betaHash(code));
  const claim=(from=origin)=>request('/beta/activar',{method:'POST',headers:{origin:from},body:new URLSearchParams({code})});
  assert.equal((await request('/api/v1/catalog/restaurants')).status,403);
  assert.equal((await claim('https://other.example')).status,403);
  const attempts=await Promise.all([claim(),claim()]);
  assert.deepEqual(attempts.map(x=>x.status).sort(),[303,403]);
  const cookie=attempts.find(x=>x.status===303).headers.get('set-cookie').split(';')[0];
  const access=()=>request('/cuenta',{headers:{cookie}});
  assert.equal(await access(),null);
  sqlite.exec("UPDATE closed_beta_invitations SET expires_at=unixepoch()");
  assert.equal((await access()).status,403);
  sqlite.exec("UPDATE closed_beta_invitations SET expires_at=unixepoch()+3600,revoked_at=unixepoch()");
  assert.equal((await access()).status,403);
 }finally{sqlite.close()}
});
