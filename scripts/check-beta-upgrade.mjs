import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { DatabaseSync } from 'node:sqlite';
import { randomSecret } from '../backend/src/client-access.js';
import { betaHash } from '../backend/src/beta-gate.js';

const [previous, candidate] = process.argv.slice(2);
if (!previous || !candidate) throw new Error('Pass the previous and candidate Worker module paths');
const load = async path => (await import(pathToFileURL(resolve(path)))).default;
const oldWorker = await load(previous);
const newWorker = await load(candidate);
const hostname = 'dvolada-beta.dvoladanexora.workers.dev';
const origin = 'https://' + hostname;
const db = new DatabaseSync(':memory:');
try {
  db.exec(await readFile(new URL('../backend/migrations/0021_closed_beta.sql', import.meta.url), 'utf8'));
  const env = { DVOLADA_BETA_HOST: hostname, BETA_DB: {
    prepare(sql) { return { bind(...args) { return { first: () => db.prepare(sql).get(...args) }; } }; }
  } };
  const request = (worker, path, options) => worker.fetch(new Request(origin + path, options), env, {});
  const code = randomSecret();
  db.prepare('INSERT INTO closed_beta_invitations(id, invitation_hash, expires_at) VALUES(?,?,unixepoch()+3600)').run('fixture', await betaHash(code));
  const claim = { method: 'POST', headers: { origin }, body: new URLSearchParams({ code, role: 'restaurant' }) };
  const activation = await request(oldWorker, '/beta/activar', claim);
  assert.equal(activation.status, 303);
  const cookie = activation.headers.get('set-cookie').split(';')[0];
  const admitted = { headers: { cookie } };
  const chooser = await request(newWorker, '/beta/paneles', admitted);
  assert.equal(chooser.status, 200);
  const html = await chooser.text();
  assert.equal(html, await (await request(oldWorker, '/beta/paneles', admitted)).text());
  assert.deepEqual([...html.matchAll(/name="beta_rol" value="([^"]+)"/g)].map(match => match[1]), ['customer', 'restaurant', 'courier']);
  assert.equal((await request(newWorker, '/beta/activar', admitted)).headers.get('location'), '/beta/paneles');
  assert.equal((await request(newWorker, '/beta/activar', claim)).status, 403);
  assert.equal((await request(newWorker, '/beta/paneles')).status, 403);
  console.log('Existing beta admission, chooser parity and single-use invitation verified across artifacts.');
} finally {
  db.close();
}
