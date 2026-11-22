import test from 'node:test';
import assert from 'node:assert/strict';
import {clientPasswordProof,validClientPassword,validClientLogin} from '../src/live/client-password.js';

test('validates usernames and derives stable 256-bit proofs scoped to a normalized login',async()=>{
 assert.equal(validClientLogin('   USUARIO.QA   '),true);
 assert.equal(validClientLogin('a@b'),false);
 assert.equal(validClientPassword('12345678901234'),false);
 const password='Una contraseña ficticia larga';
 assert.equal(validClientPassword(password),true);
 const [a,b,c]=await Promise.all([' USUARIO.qa ','usuario.qa','otro.qa'].map(login=>clientPasswordProof(login,password)));
 assert.match(a,/^[0-9a-f]{64}$/);
 assert.equal(a,b);
 assert.notEqual(a,c);
});
