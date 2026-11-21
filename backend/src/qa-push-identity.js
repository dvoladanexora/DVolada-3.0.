import { ApiError, requireUuid } from './security.js';

const qaOrigin = 'https://dvolada-qa.dvoladanexora.workers.dev';
const uuid = /^[a-f\d]{8}-(?:[a-f\d]{4}-){3}[a-f\d]{12}$/i;
const encoder = new TextEncoder();

export function qaPushAppId(request, env) {
 const id = env.QA_ONESIGNAL_APP_ID;
 if (new URL(request.url).origin !== qaOrigin || env.QA_ONESIGNAL_ORIGIN !== qaOrigin ||
     env.QA_ONESIGNAL_IDENTITY_VERIFIED !== 'true' || !uuid.test(id || '') ||
     !env.QA_ONESIGNAL_SIGNING_KEY?.includes('-----BEGIN PRIVATE KEY-----')) return null;
 return id;
}

const base64url = bytes => btoa(String.fromCharCode(...bytes))
 .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const encodeJson = value => base64url(encoder.encode(JSON.stringify(value)));

export async function issueQaPushIdentity(request, env, actor) {
 const appId = qaPushAppId(request, env);
 if (!appId) throw new ApiError(503, 'PUSH_SETUP_PENDING');
 const externalId = 'dvolada-qa:' + requireUuid(actor.userId);
 const expiresAt = Math.floor(Date.now() / 1000) + 300;
 try {
  const pkcs8 = env.QA_ONESIGNAL_SIGNING_KEY
   .replace('-----BEGIN PRIVATE KEY-----', '').replace('-----END PRIVATE KEY-----', '').replace(/\s/g, '');
  const key = await crypto.subtle.importKey(
   'pkcs8', Uint8Array.from(atob(pkcs8), char => char.charCodeAt(0)),
   { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign'],
  );
  const input = encodeJson({ alg: 'ES256', typ: 'JWT' }) + '.' +
   encodeJson({ iss: appId, exp: expiresAt, identity: { external_id: externalId } });
  const signature = await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, key, encoder.encode(input));
  return { externalId, jwt: input + '.' + base64url(new Uint8Array(signature)) };
 } catch {
  throw new ApiError(503, 'PUSH_SETUP_PENDING');
 }
}
