import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');

test('fusionar a main no publica GitHub Pages sin autorización manual',()=>{
 const workflow=read('.github/workflows/deploy.yml');
 const guard="github.ref == 'refs/heads/main' && github.repository == 'dvoladanexora/DVolada-3.0.'";
 assert.match(workflow,/^on:\s*\n\s+workflow_dispatch:/m);
 assert.doesNotMatch(workflow,/^\s+push:\s*$/m);
 assert.equal(workflow.split(guard).length-1,2,'build y deploy requieren main y repositorio exacto');
 assert.ok(workflow.includes('npm ci --no-audit --no-fund'));
 assert.ok(workflow.includes('npm run test:all'));
 assert.ok(workflow.includes('test ! -e dist/device-studio.html'));
});

test('la candidata conserva las dos compilaciones y las pruebas integrales',()=>{
 const workflow=read('.github/workflows/validate-pr.yml');
 assert.ok(workflow.includes('npm run test:all'));
 assert.ok(workflow.includes('npm run test:live'));
 assert.ok(workflow.includes('npm run test:push'));
 assert.ok(workflow.includes('npm run test:staging'));
 assert.ok(workflow.includes('backend/tests/worker.test.js'));
 assert.ok(workflow.includes('npm run build && node scripts/package-qa-worker.mjs'));
 assert.ok(workflow.includes('npm --prefix server run test:db'));
});

test('los pedidos y push de producción están cerrados por defecto',()=>{
 const config=read('backend/cloudflare.config.ts');
 assert.match(config,/ORDER_CREATION_ENABLED:bindings\.text\('false'\)/);
 assert.match(config,/PUSH_NOTIFICATIONS_ENABLED:bindings\.text\('false'\)/);
 assert.match(config,/ONESIGNAL_REST_API_KEY:bindings\.secret\(\)/);
 assert.match(config,/SESSION_PEPPER:bindings\.secret\(\)/);
 assert.match(config,/PIN_SECRET:bindings\.secret\(\)/);
 assert.ok(config.includes("name:isStaging?'dvolada-staging':'dvolada-prod'"),'QA/production databases must remain separate');
});

test('React QA y la demo pública continúan en vistas separadas',()=>{
 const entry=read('src/main.jsx');
 const open=read('src/live/OpenAccessApp.jsx');
 assert.match(entry,/showStagingPanels\?<LiveApp\/>:\(IS_LIVE_BUILD\?<OpenAccessApp\/>:demoView\)/);
 assert.ok(open.includes('Pedidos reales desactivados'));
 assert.doesNotMatch(open,/api\.createOrder\(/);
});

test('la caché de PWA y la configuración web push no exponen rutas privadas',()=>{
 const worker=read('public/sw.js');
 const qa=read('staging/qa-worker.mjs');
 const push=read('src/live/onesignal-push.js');
 assert.ok(worker.includes("if(req.method!=='GET')return"));
 assert.match(worker,/\(\?:api\|auth\|admin\|session\|push\)/);
 assert.ok(worker.includes('url.origin!==self.location.origin'));
 assert.ok(qa.includes('env.DVOLADA_QA_HOST !== hostname'));
 assert.ok(qa.includes("'X-Robots-Tag': 'noindex, nofollow'"));
 assert.ok(push.includes("serviceWorkerPath:'push/onesignal/OneSignalSDKWorker.js'"));
 assert.ok(push.includes('autoPrompt:false'));
});

test('las plantillas y el Worker público no llevan valores privados de OneSignal',()=>{
 const example=read('.env.example');
 const qa=read('staging/qa-worker.mjs');
 const signer=read('backend/src/qa-push-identity.js');
 assert.match(example,/^VITE_DVOLADA_LIVE_MODE=false$/m);
 assert.match(example,/^VITE_DVOLADA_API_URL=$/m);
 assert.match(example,/^VITE_ONESIGNAL_APP_ID=$/m);
 assert.ok(!qa.includes('QA_ONESIGNAL_SIGNING_KEY'),'el secreto solo debe llegar al servidor');
 assert.ok(signer.includes('env.QA_ONESIGNAL_SIGNING_KEY'));
 assert.doesNotMatch(example,/-----BEGIN PRIVATE KEY-----/);
});
