const encoder = new TextEncoder();
export const clientLogin = value => value.trim().toLowerCase();
export const validClientLogin = value => /^[a-z0-9][a-z0-9._-]{3,39}$/.test(clientLogin(value));
export const validClientPassword = value => Array.from(value).length >= 15 && encoder.encode(value).length <= 256;

export async function clientPasswordProof(login, password) {
 const scope = 'dvolada-client-password:v1:' + clientLogin(login);
 const salt = await crypto.subtle.digest('SHA-256', encoder.encode(scope));
 const key = await crypto.subtle.importKey('raw',encoder.encode(password),'PBKDF2',false,['deriveBits']);
 const derived = await crypto.subtle.deriveBits({name:'PBKDF2',hash:'SHA-256',salt,iterations:600000},key,256);
 return Array.from(new Uint8Array(derived),byte=>byte.toString(16).padStart(2,'0')).join('');
}
