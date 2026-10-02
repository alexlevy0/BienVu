// Real Workers/D1/R2 upload checks with isolated synthetic identities. No video,
// email, OpenAI, TTS or Runway request. Credentials stay in ignored evidence.
import assert from 'node:assert/strict';
import {randomUUID,randomBytes} from 'node:crypto';
import {createRequire} from 'node:module';
import {pathToFileURL} from 'node:url';
import {mkdir,readFile,writeFile,unlink} from 'node:fs/promises';
import sharp from 'sharp';
import {remoteSql} from './cloudflare-operator.mjs';
const base='https://bienvu.online',folder='evidence/local/photo-upload-fix',fixturePath=`${folder}/remote-fixture.json`;
await mkdir(folder,{recursive:true});
const quote=value=>`'${String(value).replaceAll("'","''")}'`;
const require=createRequire(new URL('../apps/web/package.json',import.meta.url));
const {hashPassword}=await import(pathToFileURL(require.resolve('better-auth/crypto')).href);
let fixture;
try{fixture=JSON.parse(await readFile(fixturePath,'utf8'));}catch(error){if(error.code!=='ENOENT')throw error;}
async function request(path,method='GET',body,headers={}){
  return fetch(base+path,{method,signal:AbortSignal.timeout(65_000),redirect:'manual',headers:{origin:base,cookie:fixture.cookie??'',...headers},body});
}
async function cleanup(){
  const uid=quote(fixture.id),aid=quote(fixture.agencyId??'none');
  // Keep hosted_import_costs as incurred provisions; they are not invoices.
  const objects=await remoteSql(`SELECT id,import_id FROM import_objects WHERE agency_id=${aid}`);
  for(const object of objects){const response=await request(`/api/imports/${object.import_id}/uploads/0`,'DELETE',undefined,{'X-Upload-ID':object.id});
    assert.equal(response.status,200,'Synthetic R2 photo cleanup');}
  for(const row of await remoteSql(`SELECT id FROM listing_imports WHERE agency_id=${aid}`)){
    const response=await request(`/api/imports/${row.id}/draft`,'DELETE');assert.equal(response.status,200,'Synthetic draft deletion');
  }
  await remoteSql(`DELETE FROM listing_imports WHERE agency_id=${aid}; DELETE FROM trial_claims WHERE owner_user_id=${uid};
    DELETE FROM generation_access WHERE agency_id=${aid};
    DELETE FROM allocations WHERE agency_id=${aid}; DELETE FROM agency_write_limits WHERE owner_user_id=${uid};
    DELETE FROM agencies WHERE owner_user_id=${uid}; DELETE FROM auth_user WHERE id=${uid};`);
  await unlink(fixturePath);
}
if(process.argv.includes('--cleanup')){assert.ok(fixture);await cleanup();console.log('Synthetic upload account and private photos cleaned');process.exit(0);}
if(!fixture){
  fixture={id:randomUUID(),password:randomBytes(24).toString('base64url')};fixture.email=`photo-${fixture.id}@example.invalid`;
  await writeFile(fixturePath,JSON.stringify(fixture),{mode:0o600});
  const at=Date.now(),hash=await hashPassword(fixture.password),uid=quote(fixture.id);
  await remoteSql(`INSERT INTO auth_user(id,name,email,emailVerified,createdAt,updatedAt) VALUES(${uid},'Recette photos',${quote(fixture.email)},1,${at},${at});
    INSERT INTO auth_account(id,accountId,providerId,userId,password,createdAt,updatedAt) VALUES(${quote(randomUUID())},${uid},'credential',${uid},${quote(hash)},${at},${at});`);
}
const login=await request('/api/auth/sign-in/email','POST',JSON.stringify({email:fixture.email,password:fixture.password}),{'Content-Type':'application/json'});
assert.equal(login.status,200);fixture.cookie=login.headers.get('set-cookie')?.split(';')[0];assert.ok(fixture.cookie);
const me=await request('/api/me');assert.equal(me.status,200);fixture.agencyId=(await me.json()).agency.id;
await writeFile(fixturePath,JSON.stringify(fixture),{mode:0o600});
const report={at:new Date().toISOString(),mode:'real-cloudflare-workers-d1-r2',identities:'synthetic',checks:[]};
if(!fixture.draftId){const start=await request('/api/imports/draft','POST',undefined,{'Idempotency-Key':randomUUID()});
  assert.equal(start.status,201,await start.clone().text());fixture.draftId=(await start.json()).id;
  await writeFile(fixturePath,JSON.stringify(fixture),{mode:0o600});}
const photoId=randomUUID(),bytes=await sharp({create:{width:960,height:640,channels:3,background:'#557c6c'}}).png().toBuffer();
const path=`/api/imports/${fixture.draftId}/uploads/0`;
const upload=await request(path,'PUT',bytes,{'Content-Type':'image/png','X-Upload-ID':photoId});
const uploadBody=await upload.json();report.checks.push({action:'upload',status:upload.status,code:uploadBody.code??uploadBody.error??null});
if(upload.ok){
  const photo=await request(`/api/imports/${fixture.draftId}/photos/${photoId}`);report.checks.push({action:'private-read',status:photo.status,bytes:(await photo.arrayBuffer()).byteLength});
  const replay=await request(path,'PUT',bytes,{'Content-Type':'image/png','X-Upload-ID':photoId});report.checks.push({action:'retry',status:replay.status});
}
const remove=await request(path,'DELETE',undefined,{'X-Upload-ID':photoId});report.checks.push({action:'remove',status:remove.status,body:await remove.json()});
const draft=await request(`/api/imports/${fixture.draftId}/draft`);report.checks.push({action:'remaining',status:draft.status,photos:(await draft.json()).photos?.length});
if(process.argv.includes('--batch')){
  const batch=await Promise.all(['#214f43','#ad694d','#cdc5a4'].map(async(background,slot)=>{
    const id=randomUUID(),data=await sharp({create:{width:960,height:640,channels:3,background}}).png().toBuffer();
    const response=await request(`/api/imports/${fixture.draftId}/uploads/${slot}`,'PUT',data,{'Content-Type':'image/png','X-Upload-ID':id});
    assert.equal(response.status,200,await response.clone().text());return {slot,id};
  }));
  const current=await request(`/api/imports/${fixture.draftId}/draft`);assert.equal((await current.json()).photos.length,3);
  const privatePhoto=await fetch(`${base}/api/imports/${fixture.draftId}/photos/${batch[0].id}`);assert.equal(privatePhoto.status,401);
  for(const photo of batch){const response=await request(`/api/imports/${fixture.draftId}/uploads/${photo.slot}`,'DELETE',undefined,{'X-Upload-ID':photo.id});assert.equal(response.status,200);}
  report.checks.push({action:'three-concurrent-uploads-private-and-removal',status:200,photos:3,anonymousRead:privatePhoto.status});
}
report.passed=report.checks.every(check=>check.status===200);
await writeFile(`${folder}/remote-report-${Date.now()}.json`,JSON.stringify(report,null,2));console.log(JSON.stringify(report));
if(!process.argv.includes('--keep'))await cleanup();
