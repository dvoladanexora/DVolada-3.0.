import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { DatabaseSync, backup } from 'node:sqlite';
import { pathToFileURL } from 'node:url';

if (!process.argv[2]) throw new Error('Pass the path to the approved dvolada-online.mjs');
const artifact = resolve(process.argv[2]);
const sha = (await readFile(join(dirname(artifact), 'SHA'), 'utf8')).trim();
const sums = await readFile(join(dirname(artifact), 'SHA256SUMS'), 'utf8');
for (const name of ['dvolada-online.mjs', 'SHA']) {
  const expected = sums.split('\n').find(line => line.endsWith('  ' + name))?.split(' ')[0];
  const bytes = await readFile(name === 'SHA' ? join(dirname(artifact), name) : artifact);
  assert.equal(createHash('sha256').update(bytes).digest('hex'), expected);
}

const migrationDir = new URL('../backend/migrations/', import.meta.url);
const files = (await readdir(migrationDir)).filter(name => name.endsWith('.sql')).sort();
const passkeyUpgrade = files.indexOf('0019_client_passkeys.sql');
assert(passkeyUpgrade > 0, 'Missing client passkey migration');
const migrations = await Promise.all(files.map(name => readFile(new URL(name, migrationDir), 'utf8')));
const directory = await mkdtemp(join(tmpdir(), 'dvolada-cutover-'));
const connections = [];
const open = name => {
  const db = new DatabaseSync(join(directory, name));
  db.exec('PRAGMA foreign_keys=ON');
  connections.push(db);
  return db;
};
const check = db => {
  assert.deepEqual(db.prepare('PRAGMA foreign_key_check').all(), []);
  assert.equal(db.prepare('PRAGMA integrity_check').get().integrity_check, 'ok');
};
const snapshot = db => [
  db.prepare('SELECT id,display_name,admin_version FROM users ORDER BY id').all(),
  db.prepare('SELECT user_id,login_name,password_hash,recovery_hash,revision FROM client_credentials ORDER BY user_id').all(),
  db.prepare('SELECT id,restaurant_id,customer_id,status,version,total_minor FROM online_orders ORDER BY id').all(),
];
try {
  const fresh = open('fresh.sqlite');
  for (const sql of migrations) fresh.exec(sql);
  check(fresh);
  const prior = open('prior.sqlite');
  for (const sql of migrations.slice(0, passkeyUpgrade)) prior.exec(sql);
  prior.exec(`
    INSERT INTO users(id,display_name,account_role) VALUES ('test-customer','Cliente sintético','customer');
    INSERT INTO client_credentials(user_id,access_hash,recovery_hash,login_name,password_hash)
      VALUES ('test-customer','test-old-access','test-recovery','cliente.qa','test-old-verifier');
    INSERT INTO restaurants(id,name,plan,subscription_status,online_state)
      VALUES ('test-restaurant','Restaurante sintético','ONLINE','active','open');
    INSERT INTO online_orders(id,restaurant_id,customer_id,order_number,delivery_method,subtotal_minor,total_minor,customer_phone_e164)
      VALUES ('test-order','test-restaurant','test-customer','DV-TEST','pickup',2500,2500,'+50400000000');
  `);
  check(prior);
  const before = snapshot(prior);
  const backupFile = join(directory, 'before.sqlite');
  await backup(prior, backupFile);
  const saved = open('before.sqlite');
  await backup(saved, join(directory, 'upgrade.sqlite'));
  const upgrade = open('upgrade.sqlite');
  for (const sql of migrations.slice(passkeyUpgrade)) upgrade.exec(sql);
  check(upgrade);
  assert.deepEqual(snapshot(upgrade), before);
  assert.equal(upgrade.prepare('SELECT COUNT(*) AS n FROM client_passkeys').get().n, 0);
  assert.equal(upgrade.prepare('SELECT COUNT(*) AS n FROM client_passkey_challenges').get().n, 0);
  await backup(saved, join(directory, 'restored.sqlite'));
  const restored = open('restored.sqlite');
  check(restored);
  assert.deepEqual(snapshot(restored), before);
  assert.equal(restored.prepare("SELECT COUNT(*) AS n FROM sqlite_schema WHERE name='client_passkeys'").get().n, 0);

  const { default: worker } = await import(pathToFileURL(artifact));
  const qa = 'dvolada-qa.dvoladanexora.workers.dev';
  const commercial = 'online.example.test';
  const bindings = {
    DVOLADA_QA_HOST: qa, DVOLADA_ONLINE_HOST: commercial, DVOLADA_ONLINE_SERVE: 'true',
    RESTAURANT_COMMERCIAL_ENABLED: 'false', CLIENT_PASSKEYS_ENABLED: 'true', QA_CLIENT_ACCESS: 'true',
    CORS_ORIGINS: [qa, commercial].map(host => 'https://' + host).join(','),
    DB: { prepare() { throw new Error('Retired routes must not query D1'); } },
    SESSION_PEPPER: 'synthetic-session-key-for-cutover-test-only',
    PIN_SECRET: 'synthetic-delivery-key-for-cutover-test-only',
  };
  for (const host of [qa, commercial]) {
    for (const flag of ['true', 'false']) {
      const env = { ...bindings, CLIENT_PASSKEYS_ENABLED: flag, QA_CLIENT_ACCESS: flag };
      for (const action of ['login', 'register', 'recover']) {
        const origin = 'https://' + host;
        const request = new Request(origin + '/api/v1/auth/client/' + action, { method: 'POST', headers: { Origin: origin } });
        const response = await worker.fetch(request, env, {});
        assert.equal(response.status, 410);
        assert.equal((await response.json()).error, 'CLIENT_LEGACY_RETIRED');
      }
    }
  }
  const closed = await worker.fetch(new Request('https://' + commercial + '/cuenta'),
    { ...bindings, DVOLADA_ONLINE_SERVE: 'false' }, {});
  assert.equal(closed.status, 404);
  console.log(JSON.stringify({ sha, migrations: migrations.length, isolatedUpgrade: '0018→'+files.at(-1).slice(0,4),
    existingRowsPreserved: true, isolatedRestoreVerified: true, retiredRouteChecks: 12, commercialClosed: true }));
} finally {
  for (const db of connections.reverse()) db.close();
  await rm(directory, { recursive: true, force: true });
}
