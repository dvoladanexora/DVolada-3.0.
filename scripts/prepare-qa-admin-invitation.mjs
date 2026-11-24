import {createHmac,randomBytes,randomUUID} from 'node:crypto';
import {writeFile} from 'node:fs/promises';

// Offline, QA-only operator recovery. Never upload this file's output to GitHub.
// An authorized infrastructure operator must supply QA's current SESSION_PEPPER.
// The existing administrator and all existing credentials remain unchanged.
const [confirmation,login,displayName,file]=process.argv.slice(2);
const pepper=process.env.DVOLADA_BOOTSTRAP_PEPPER;
if(confirmation!=='--confirm-dvolada-qa'||!/^[a-z0-9][a-z0-9._-]{3,39}$/.test(login||'')||
 !displayName||displayName.trim().length<2||displayName.length>80||!file||
 !pepper||Buffer.byteLength(pepper)<32)
 throw Error('Uso: node scripts/prepare-qa-admin-invitation.mjs --confirm-dvolada-qa usuario nombre archivo-privado.json (secreto suministrado en entorno privado)');
const digest=(purpose,value)=>createHmac('sha256',pepper).update(purpose+value).digest('hex');
const id=randomUUID(),invitation=randomBytes(32).toString('base64url'),expiresAt=Math.floor(Date.now()/1000)+1800;
const q=v=>"'"+v.replaceAll("'","''")+"'";
const existing="EXISTS(SELECT 1 FROM privileged_passkey_accounts a JOIN users u ON u.id=a.user_id WHERE a.access_role='platform_admin' AND u.account_role='platform_admin' AND u.status='active')";
const sql=[
 `INSERT INTO users(id,display_name,account_role) SELECT ${q(id)},${q(displayName.trim())},'platform_admin' WHERE ${existing} AND NOT EXISTS(SELECT 1 FROM client_credentials WHERE login_name=${q(login)}) AND unixepoch()<${expiresAt}`,
 `INSERT INTO client_credentials(user_id,access_hash,recovery_hash,login_name) VALUES(${q(id)},${q(digest('retired-client-access:',randomBytes(32).toString('base64url')))},${q(digest('client-recover:v1:',invitation))},${q(login)})`,
 `INSERT INTO privileged_passkey_accounts(user_id,access_role,invitation_expires_at) VALUES(${q(id)},'platform_admin',${expiresAt})`,
 `INSERT INTO control_audit(actor_id,subject,action,detail) VALUES(${q(id)},${q(id)},'admin_bootstrap','{"environment":"qa","method":"operator_invitation"}')`
];
await writeFile(file,JSON.stringify({environment:'dvolada-qa',database:'8d9219a2-8f18-4e27-a313-803d42d2f3e1',login,invitation,expiresAt,sql},null,2),{mode:0o600,flag:'wx'});
console.log('Archivo privado preparado. Aplicar las cuatro sentencias en un único batch transaccional de D1 QA. No aplicar a Beta ni producción.');
