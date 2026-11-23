import {randomBytes,randomUUID,createHash} from 'node:crypto';
import {writeFile} from 'node:fs/promises';
const [file]=process.argv.slice(2);
if(!file)throw Error('Indicá un archivo privado fuera del repositorio para la invitación.');
const code=randomBytes(32).toString('base64url');
const id=randomUUID();
const digest=createHash('sha256').update(code).digest('hex');
const expiresAt=Math.floor(Date.now()/1000)+7*86400;
await writeFile(file,JSON.stringify({id,code,expiresAt,
 activatePath:'/beta/activar',
 sql:`INSERT INTO closed_beta_invitations(id,invitation_hash,expires_at) VALUES('${id}','${digest}',${expiresAt});`,
 revokeSql:`UPDATE closed_beta_invitations SET revoked_at=unixepoch() WHERE id='${id}';`
}),{mode:0o600,flag:'wx'});
