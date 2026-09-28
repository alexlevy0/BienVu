// Serveur distant réel ; liens injectés uniquement pour le compte synthétique B.
// Aucun message envoyé et aucun identifiant du propriétaire modifié.
import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import {randomBytes,randomUUID} from 'node:crypto';
import {remoteSql} from './cloudflare-operator.mjs';
const folder='evidence/remote/sprint-02-acceptance',file=`${folder}/accounts-fixture.json`,state=JSON.parse(await readFile(file,'utf8')),user=state.users[1],origin='https://bienvu.online';
assert.match(user.email,/^[0-9a-f-]+@example.invalid$/);
const q=v=>`'${String(v).replaceAll("'","''")}'`;
const request=(path,body,cookie='')=>fetch(`${origin}${path}`,{method:body?'POST':'GET',headers:{origin,'Content-Type':'application/json',cookie},...(body?{body:JSON.stringify(body)}:{})});
const before=await (await request('/api/me',null,user.cookie)).json(),checks=[];
const now=Date.now(),expired=randomBytes(24).toString('base64url'),valid=randomBytes(24).toString('base64url');
await remoteSql([expired,valid].map((token,i)=>`INSERT INTO auth_verification(id,identifier,value,expiresAt,createdAt,updatedAt) VALUES(${q(randomUUID())},${q('reset-password:'+token)},${q(user.id)},${now+(i?1800000:-1000)},${now},${now});`).join('\n'));
const password=randomBytes(24).toString('base64url');
const fail=await request('/api/auth/reset-password',{token:expired,newPassword:password});assert.equal(fail.status,400);checks.push('Jeton expiré refusé sur le serveur distant');
const good=await request('/api/auth/reset-password',{token:valid,newPassword:password});assert.equal(good.status,200);
assert.equal((await request('/api/auth/reset-password',{token:valid,newPassword:password})).status,400);checks.push('Jeton valide consommé une fois, rejeu refusé');
assert.equal((await request('/api/me',null,user.cookie)).status,401);checks.push('Session antérieure révoquée');
user.password=password;
const login=await request('/api/auth/sign-in/email',{email:user.email,password});assert.equal(login.status,200);user.cookie=login.headers.get('set-cookie').split(';')[0];
await writeFile(file,JSON.stringify(state,null,2),{mode:0o600});
assert.equal((await (await request('/api/me',null,user.cookie)).json()).agency.id,before.agency.id);checks.push('Reconnexion réussie sans nouvelle agence');
await remoteSql(`DELETE FROM auth_verification WHERE value=${q(user.id)} AND identifier IN (${q('reset-password:'+expired)},${q('reset-password:'+valid)});`);
await writeFile(`${folder}/expiry-replay.json`,JSON.stringify({at:new Date().toISOString(),origin,infrastructure:'real-cloudflare',identitiesAndTokens:'synthetic-d1-fixtures',messagesSent:0,checks},null,2));console.log(checks);
