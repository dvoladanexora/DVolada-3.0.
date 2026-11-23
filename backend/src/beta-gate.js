import {sha256 as betaHash} from './security.js';
export {betaHash};
import {randomSecret,readSecretCookie,secretCookie,secretPattern} from './client-access.js';

const cookie='__Host-dvolada-beta';
const headers={'Cache-Control':'no-store','Referrer-Policy':'no-referrer','X-Robots-Tag':'noindex',
 'Content-Security-Policy':"default-src 'none'; form-action 'self'; frame-ancestors 'none'; base-uri 'none'"};
const fail=status=>new Response(null,{status,headers});
export async function betaGate(req,db){
 const url=new URL(req.url);
 if(url.pathname==='/beta/activar'){
  if(req.method==='GET')return new Response('<!doctype html><html lang="es"><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Activar beta · Dvolada</title><h1>Beta privada de Dvolada</h1><form method="post"><label>Código de invitación <input name="code" type="password" autocomplete="off" required maxlength="43"></label> <button>Activar en este navegador</button></form></html>',{headers:{...headers,'Content-Type':'text/html; charset=utf-8'}});
  if(req.method!=='POST'||req.headers.get('origin')!==url.origin)return fail(403);
  if(req.headers.get('content-type')?.split(';')[0]!=='application/x-www-form-urlencoded')return fail(415);
  const reader=req.body?.getReader();if(!reader)return fail(400);
  const chunks=[];let size=0;
  for(;;){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>256){await reader.cancel();return fail(413)}chunks.push(value)}
  const code=new URLSearchParams(await new Blob(chunks).text()).get('code');
  if(!secretPattern.test(code||''))return fail(403);
  const token=randomSecret();
  const row=await db.prepare('UPDATE closed_beta_invitations SET invitation_hash=NULL,session_hash=? WHERE invitation_hash=? AND revoked_at IS NULL AND expires_at>unixepoch() RETURNING expires_at').bind(await betaHash(token),await betaHash(code)).first();
  if(!row)return fail(403);
  return secretCookie(new Response(null,{status:303,headers:{...headers,Location:'/cuenta'}}),cookie,token,Math.max(0,row.expires_at-Math.floor(Date.now()/1000)));
 }
 const token=readSecretCookie(req,cookie);
 if(!token)return fail(403);
 const admitted=await db.prepare('SELECT 1 FROM closed_beta_invitations WHERE session_hash=? AND revoked_at IS NULL AND expires_at>unixepoch()').bind(await betaHash(token)).first();
 return admitted?null:fail(403);
}
