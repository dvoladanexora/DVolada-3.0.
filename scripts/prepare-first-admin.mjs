import {createHmac,randomBytes,randomUUID} from 'node:crypto';
import {writeFile} from 'node:fs/promises';

const [login,displayName,file]=process.argv.slice(2);
const pepper=process.env.DVOLADA_BOOTSTRAP_PEPPER;
if(!login||!/^[a-z0-9][a-z0-9._-]{3,39}$/.test(login)||!displayName||displayName.trim().length<2||
   displayName.length>80||!file||!pepper||Buffer.byteLength(pepper)<32)
 throw new Error('Uso: DVOLADA_BOOTSTRAP_PEPPER=<secreto del entorno> node scripts/prepare-first-admin.mjs usuario nombre archivo-privado.json');
const digest=(purpose,value)=>createHmac('sha256',pepper).update(purpose+value).digest('hex');
const id=randomUUID(),invitation=randomBytes(32).toString('base64url'),expiresAt=Math.floor(Date.now()/1000)+1800;
const quote=value=>"'"+value.replaceAll("'","''")+"'";
const sql=`
INSERT INTO users(id,display_name,account_role)
 SELECT ${quote(id)},${quote(displayName.trim())},'platform_admin'
 WHERE NOT EXISTS(SELECT 1 FROM privileged_passkey_accounts WHERE access_role='platform_admin');
INSERT INTO client_credentials(user_id,access_hash,recovery_hash,login_name)
 VALUES(${quote(id)},${quote(digest('retired-client-access:',randomBytes(32).toString('base64url')))},
  ${quote(digest('client-recover:v1:',invitation))},${quote(login)});
INSERT INTO privileged_passkey_accounts(user_id,access_role,invitation_expires_at)
 VALUES(${quote(id)},'platform_admin',${expiresAt});
INSERT INTO control_audit(actor_id,subject,action,detail)
 VALUES(${quote(id)},${quote(id)},'admin_bootstrap','{}');
`.trim();
await writeFile(file,JSON.stringify({id,login,invitation,expiresAt,sql}),{mode:0o600,flag:'wx'});
