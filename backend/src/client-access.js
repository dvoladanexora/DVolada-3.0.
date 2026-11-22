import {ApiError, hmacHex, readJson, requireKeys, requireText, respond} from './security.js';

export const clientCookie = '__Host-dvolada-client';
const qaOrigin = 'https://dvolada-qa.dvoladanexora.workers.dev';
const secretPattern = /^[A-Za-z0-9_-]{43}$/;
const maxAge = 60 * 60 * 24 * 7;

export function clientAccessEnabled(req, env) {
 return env.QA_CLIENT_ACCESS === 'true' && new URL(req.url).origin === qaOrigin;
}

export function readClientCookie(req, env) {
 if (!clientAccessEnabled(req, env)) return null;
 const value = (req.headers.get('cookie') || '').split(';').map(cookie => cookie.trim())
  .find(cookie => cookie.startsWith(clientCookie + '='))?.slice(clientCookie.length + 1);
 return secretPattern.test(value || '') ? value : null;
}

export function changeClientCookie(res, value) {
 res.headers.set('set-cookie', clientCookie + '=' + value +
  '; Path=/; Secure; HttpOnly; SameSite=Strict; Max-Age=' + (value ? maxAge : 0));
 return res;
}

const randomSecret = () => btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(32))))
 .replaceAll('+','-').replaceAll('/','_').replace(/=+$/, '');

export async function clientAuth(req, env, operation) {
 if (!clientAccessEnabled(req, env)) throw new ApiError(404, 'NOT_FOUND');
 if (req.headers.get('origin') !== qaOrigin) throw new ApiError(403, 'ORIGIN_FORBIDDEN');
 const bucket = Math.floor(Date.now()/600000);
 const source = await hmacHex(env.SESSION_PEPPER, 'client-rate:v1:' + (req.headers.get('cf-connecting-ip') || 'unknown'));
 const throttle = await env.DB.prepare(`INSERT INTO client_auth_throttle(source_hash,time_bucket,attempts)
  VALUES(?,?,1) ON CONFLICT(source_hash) DO UPDATE SET
  attempts=CASE WHEN time_bucket=excluded.time_bucket THEN attempts+1 ELSE 1 END,time_bucket=excluded.time_bucket
  RETURNING attempts`).bind(source,bucket).first();
 if (throttle.attempts > 12) throw new ApiError(429, 'LOGIN_RATE_LIMITED');

 const body = await readJson(req);
 requireKeys(body, operation === 'register' ? ['displayName'] : ['code']);
 const now = Math.floor(Date.now()/1000);
 const token = randomSecret();
 const session = env.DB.prepare(`INSERT INTO auth_sessions(id,user_id,token_hash,expires_at)
  SELECT ?,user_id,?,? FROM client_credentials WHERE user_id=? AND revision=?`);
 const sessionArgs = [crypto.randomUUID(),await hmacHex(env.SESSION_PEPPER,'session:v1:'+token),now+maxAge];
 const issueCodes = async () => {
  const access = randomSecret(), recovery = randomSecret();
  return {access,recovery, accessHash:await hmacHex(env.SESSION_PEPPER,'client-access:v1:'+access),
   recoveryHash:await hmacHex(env.SESSION_PEPPER,'client-recover:v1:'+recovery)};
 };

 if (operation === 'register') {
  const displayName = requireText(body.displayName, 2, 80, 'displayName');
  const id = crypto.randomUUID();
  const codes = await issueCodes();
  await env.DB.batch([
   env.DB.prepare("INSERT INTO users(id,display_name,account_role) VALUES(?,?,'customer')").bind(id,displayName),
   env.DB.prepare('INSERT INTO client_credentials(user_id,access_hash,recovery_hash) VALUES(?,?,?)')
    .bind(id,codes.accessHash,codes.recoveryHash),
   session.bind(...sessionArgs,id,1)
  ]);
  return changeClientCookie(respond(req,env,201,{access:codes.access,recovery:codes.recovery}),token);
 }

 if (typeof body.code !== 'string' || !secretPattern.test(body.code)) throw new ApiError(401,'CLIENT_CODE_INVALID');
 const recovery = operation === 'recover';
 const hash = await hmacHex(env.SESSION_PEPPER,(recovery?'client-recover:v1:':'client-access:v1:')+body.code);
 const row = await env.DB.prepare(`SELECT c.user_id,c.revision FROM client_credentials c JOIN users u ON u.id=c.user_id
  WHERE c.${recovery?'recovery_hash':'access_hash'}=? AND u.status='active' AND u.account_role='customer'`).bind(hash).first();
 if (!row) throw new ApiError(401,'CLIENT_CODE_INVALID');

 if (!recovery) {
  const result = await session.bind(...sessionArgs,row.user_id,row.revision).run();
  if (!result.meta.changes) throw new ApiError(401,'CLIENT_CODE_INVALID');
  return changeClientCookie(respond(req,env,204),token);
 }

 const codes = await issueCodes();
 const [rotated] = await env.DB.batch([
  env.DB.prepare(`UPDATE client_credentials SET access_hash=?,recovery_hash=?,revision=revision+1
   WHERE user_id=? AND revision=? AND recovery_hash=?`).bind(codes.accessHash,codes.recoveryHash,row.user_id,row.revision,hash),
  env.DB.prepare(`UPDATE auth_sessions SET revoked_at=? WHERE user_id=? AND revoked_at IS NULL
   AND EXISTS(SELECT 1 FROM client_credentials WHERE user_id=? AND recovery_hash=?)`)
   .bind(now,row.user_id,row.user_id,codes.recoveryHash),
  env.DB.prepare(`INSERT INTO auth_sessions(id,user_id,token_hash,expires_at)
   SELECT ?,user_id,?,? FROM client_credentials WHERE user_id=? AND recovery_hash=?`)
   .bind(...sessionArgs,row.user_id,codes.recoveryHash)
 ]);
 if (!rotated.meta.changes) throw new ApiError(401,'CLIENT_CODE_INVALID');
 return changeClientCookie(respond(req,env,200,{access:codes.access,recovery:codes.recovery}),token);
}
