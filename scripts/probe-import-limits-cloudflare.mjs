// Published API check with a disposable verified identity. No URL import,
// generated video, email or paid model call; never modify shared usage counters.
import assert from 'node:assert/strict';
import {randomUUID,randomBytes} from 'node:crypto';
import {createRequire} from 'node:module';
import {pathToFileURL} from 'node:url';
import {mkdir,writeFile,unlink} from 'node:fs/promises';
import {remoteSql} from './cloudflare-operator.mjs';

const base='https://bienvu.online',folder='evidence/local/import-limit';
await mkdir(folder,{recursive:true});
const fixture={id:randomUUID(),password:randomBytes(24).toString('base64url')};
fixture.email=`import-limit-${fixture.id}@example.invalid`;
const quote=value=>`'${String(value).replaceAll("'","''")}'`,uid=quote(fixture.id);
const fixturePath=`${folder}/identity-${fixture.id}.json`;
await writeFile(fixturePath,JSON.stringify(fixture),{mode:0o600});
const require=createRequire(new URL('../apps/web/package.json',import.meta.url));
const {hashPassword}=await import(pathToFileURL(require.resolve('better-auth/crypto')).href);
try{
  const at=Date.now(),hash=await hashPassword(fixture.password);
  await remoteSql(`INSERT INTO auth_user(id,name,email,emailVerified,createdAt,updatedAt)
    VALUES(${uid},'Recette limites',${quote(fixture.email)},1,${at},${at});
    INSERT INTO auth_account(id,accountId,providerId,userId,password,createdAt,updatedAt)
    VALUES(${quote(randomUUID())},${uid},'credential',${uid},${quote(hash)},${at},${at});`);
  const login=await fetch(`${base}/api/auth/sign-in/email`,{method:'POST',signal:AbortSignal.timeout(60_000),
    headers:{Origin:base,'Content-Type':'application/json'},body:JSON.stringify({email:fixture.email,password:fixture.password})});
  assert.equal(login.status,200);
  const cookie=login.headers.get('set-cookie')?.split(';')[0];assert.ok(cookie);
  const response=await fetch(`${base}/api/me`,{signal:AbortSignal.timeout(60_000),headers:{Cookie:cookie}});
  assert.equal(response.status,200);
  const me=await response.json();
  const now=new Date(),day=now.toISOString().slice(0,10),month=day.slice(0,7);
  const [usage]=await remoteSql(`SELECT coalesce(sum(attempts),0) AS monthly,
    coalesce(sum(IIF(day=${quote(day)},attempts,0)),0) AS daily FROM import_usage WHERE substr(day,1,7)=${quote(month)}`);
  const [schema]=await remoteSql("SELECT sql FROM sqlite_master WHERE type='trigger' AND name='import_budget'");
  assert.match(schema.sql,/>=20\b/);assert.match(schema.sql,/>=60\b/);
  const retryAt=usage.monthly>=60?new Date(Date.UTC(now.getUTCFullYear(),now.getUTCMonth()+1,1)).toISOString()
    :usage.daily>=20?new Date(Date.parse(`${day}T00:00:00Z`)+86400_000).toISOString():null;
  assert.equal(me.rights.importRetryAt,retryAt);
  assert.equal(retryAt,null,'Imports must currently be available again');
  const report={passed:true,at:now.toISOString(),origin:base,identity:'disposable-synthetic',
    apiStatus:response.status,importRetryAt:me.rights.importRetryAt,usage,dailyLimit:20,monthlyLimit:60,
    urlImports:0,videoGenerations:0,modelProviderCalls:0};
  await writeFile(`${folder}/api-report.json`,JSON.stringify(report,null,2),{mode:0o600});
  console.log(JSON.stringify(report));
}finally{
  const scope=`agency_id IN (SELECT id FROM agencies WHERE owner_user_id=${uid})`;
  await remoteSql(`DELETE FROM trial_claims WHERE owner_user_id=${uid}; DELETE FROM generation_access WHERE ${scope};
    DELETE FROM allocations WHERE ${scope}; DELETE FROM agency_write_limits WHERE owner_user_id=${uid};
    DELETE FROM agencies WHERE owner_user_id=${uid}; DELETE FROM auth_user WHERE id=${uid};`);
  await unlink(fixturePath);
}
