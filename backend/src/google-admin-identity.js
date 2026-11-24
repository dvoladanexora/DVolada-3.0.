// Google OIDC identity verification for the independent Control Center only.
// This module does not grant roles, create sessions or modify the customer/staff auth.
// Call only with a server-generated, browser-bound, atomically consumed nonce.
import {ApiError} from './security.js';

const issuer = new Set(['https://accounts.google.com','accounts.google.com']);
const jwksUrl = 'https://www.googleapis.com/oauth2/v3/certs';
const invalid = () => new ApiError(401,'GOOGLE_ADMIN_TOKEN_INVALID');
const configError = () => new ApiError(503,'GOOGLE_ADMIN_NOT_CONFIGURED');
const encoder = new TextEncoder();

function decodePart(value){
  if(typeof value!=='string'||value.length>12000||! /^[A-Za-z0-9_-]+$/.test(value))throw invalid();
  try{
    const b64=value.replace(/-/g,'+').replace(/_/g,'/');
    return Uint8Array.from(atob(b64.padEnd(Math.ceil(b64.length/4)*4,'=')),c=>c.charCodeAt(0));
  }catch{throw invalid()}
}
function decodeObject(value){
  try{
    const data=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(decodePart(value)));
    if(!data||typeof data!=='object'||Array.isArray(data))throw invalid();
    return data;
  }catch{throw invalid()}
}

export function googleAdminConfiguration(env){
  const clientId=env?.GOOGLE_ADMIN_CLIENT_ID;
  const emails=typeof env?.GOOGLE_ADMIN_EMAILS==='string'
    ?env.GOOGLE_ADMIN_EMAILS.split(',').map(x=>x.trim().toLowerCase()):[];
  if(typeof clientId!=='string'||! /^[A-Za-z0-9._-]+\.apps\.googleusercontent\.com$/.test(clientId)
    ||emails.length<1||emails.length>2||new Set(emails).size!==emails.length
    ||emails.some(e=>! /^[a-z0-9.]+@gmail\.com$/.test(e)))throw configError();
  return {clientId,emails:new Set(emails)};
}

export async function verifyGoogleAdminIdentity(idToken,env,expectedNonce,{
  fetchImpl=fetch,now=Math.floor(Date.now()/1000)
}={}){
  const {clientId,emails}=googleAdminConfiguration(env);
  if(typeof expectedNonce!=='string'||! /^[A-Za-z0-9_-]{43,128}$/.test(expectedNonce))throw invalid();
  if(typeof idToken!=='string'||idToken.length>16000)throw invalid();
  const parts=idToken.split('.');
  if(parts.length!==3)throw invalid();
  const [headerPart,bodyPart,signaturePart]=parts;
  const header=decodeObject(headerPart),claims=decodeObject(bodyPart);
  if(header.alg!=='RS256'||typeof header.kid!=='string'||! /^[A-Za-z0-9_-]{1,128}$/.test(header.kid)
    ||header.crit!==undefined)throw invalid();
  const signature=decodePart(signaturePart);
  let keys;
  try{
    const response=await fetchImpl(jwksUrl,{redirect:'error',headers:{accept:'application/json'}});
    if(!response.ok)throw new Error('JWKS unavailable');
    keys=(await response.json()).keys;
    if(!Array.isArray(keys)||keys.length>32)throw new Error('Unexpected JWKS');
  }catch{throw new ApiError(503,'GOOGLE_ADMIN_KEYS_UNAVAILABLE')}
  const matches=keys.filter(k=>k.kid===header.kid&&k.kty==='RSA'&&(!k.alg||k.alg==='RS256')&&(!k.use||k.use==='sig'));
  if(matches.length!==1)throw invalid();
  let verified=false;
  try{
    const key=await crypto.subtle.importKey('jwk',matches[0],{name:'RSASSA-PKCS1-v1_5',hash:'SHA-256'},false,['verify']);
    verified=await crypto.subtle.verify('RSASSA-PKCS1-v1_5',key,signature,encoder.encode(headerPart+'.'+bodyPart));
  }catch{throw invalid()}
  if(!verified)throw invalid();
  if(!issuer.has(claims.iss)||claims.aud!==clientId
    ||(claims.azp!==undefined&&claims.azp!==clientId)
    ||!Number.isInteger(claims.exp)||claims.exp<=now
    ||!Number.isInteger(claims.iat)||claims.iat>now+60||claims.iat<now-600||claims.exp<=claims.iat
    ||(claims.nbf!==undefined&&(!Number.isInteger(claims.nbf)||claims.nbf>now))
    ||claims.nonce!==expectedNonce||typeof claims.sub!=='string'
    ||! /^[A-Za-z0-9_-]{1,255}$/.test(claims.sub)
    ||claims.email_verified!==true||typeof claims.email!=='string')throw invalid();
  const email=claims.email.toLowerCase();
  if(!emails.has(email))throw new ApiError(403,'GOOGLE_ADMIN_FORBIDDEN');
  // Persist an immutable subject binding during the separate admin session exchange.
  // Never accept a role or subject from a client request.
  return {subject:claims.sub,email};
}
