import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {remoteSql} from './cloudflare-operator.mjs';
const folder='evidence/remote/imports-cloudflare',file=`${folder}/purge.json`,base='https://bienvu.online';
const auth=JSON.parse(await readFile('evidence/remote/sprint-02-acceptance/accounts-fixture.json','utf8'));
const manual=JSON.parse(await readFile(`${folder}/manual.json`,'utf8')).result;
const agency=manual.listing.agencyId,q=x=>`'${String(x).replaceAll("'","''")}'`,now=Date.now(),at=new Date(now).toISOString(),old=new Date(now-86400000).toISOString();
const token=(await readFile('apps/pipeline/.dev.vars.import.staging','utf8')).match(/^PROBE_TOKEN=(.+)$/m)[1];
const save=r=>writeFile(file,JSON.stringify(r,null,2));
const get=sql=>remoteSql(sql);
const wrangler=async args=>{try{return await promisify(execFile)('pnpm',['exec','wrangler','r2','object',...args,'--remote','--config','apps/pipeline/wrangler.staging.import.jsonc']);}catch(e){throw new Error(`R2_RECIPE_${e.code}`);}};
if(process.argv[2]==='seed'){
 try{await readFile(file);throw new Error('PURGE_FIXTURE_EXISTS');}catch(e){if(e.code!=='ENOENT')throw e;}
 const report={at,kind:'remote infrastructure, synthetic aged import and job',abandoned:randomUUID(),job:randomUUID(),reservation:randomUUID(),allocation:randomUUID(),agency,protectedImport:manual.id,phase:'seeding'};await save(report);
 await get(`INSERT INTO listing_imports(id,agency_id,idempotency_key,source_url,source_kind,input_json,input_hash,status,created_at,lease_until,expires_at)
 SELECT ${q(report.abandoned)},agency_id,${q('purge-fixture-'+report.abandoned)},'','manual',input_json,input_hash,'importing',${q(old)},${q(old)},${q(new Date(now+86400000).toISOString())} FROM listing_imports WHERE id=${q(manual.id)};
 INSERT INTO allocations(id,agency_id,kind,period_key,quota_limit,valid_from,valid_until) VALUES(${q(report.allocation)},${q(agency)},'trial','purge-fixture',1,${q(old)},${q(new Date(now+86400000).toISOString())});
 INSERT INTO jobs(id,agency_id,listing_id,source_url,idempotency_key,status,stage,reservation_id,created_at,updated_at)
 VALUES(${q(report.job)},${q(agency)},${q(manual.id)},'',${q(report.job)},'queued','importing',${q(report.reservation)},${q(at)},${q(at)});
 INSERT INTO reservations(id,agency_id,job_id,allocation_id,status,created_at,updated_at)
 VALUES(${q(report.reservation)},${q(agency)},${q(report.job)},${q(report.allocation)},'reserved',${q(at)},${q(at)});`);
 const p={...manual.listing.photos[0],id:randomUUID(),listingId:report.abandoned,objectKey:`agencies/${agency}/imports/${report.abandoned}/fixture.jpg`};report.abandonedKey=p.objectKey;
 await get(`INSERT INTO import_objects(id,agency_id,import_id,object_key,photo_json) VALUES(${q(p.id)},${q(agency)},${q(report.abandoned)},${q(p.objectKey)},${q(JSON.stringify(p))});`);
 await wrangler(['put',`bienvu-s00-private/${p.objectKey}`,'--file',`${folder}/${manual.id}-0.jpg`,'--content-type','image/jpeg']);
 // Vieillir seulement le dossier synthétique protégé, jamais un dossier utilisateur.
 await get(`UPDATE listing_imports SET lease_until=${q(old)},expires_at=${q(old)} WHERE id=${q(manual.id)};`);
 const late=await fetch(`${base}/api/imports/${report.abandoned}/uploads/0`,{method:'PUT',headers:{origin:base,cookie:auth.users[0].cookie,'Content-Type':'image/jpeg'},body:await readFile(`${folder}/photo-1.jpg`)});
 assert.equal(late.status,409);report.lateUploadStatus=late.status;report.countersBefore=await get('SELECT day,attempts FROM import_usage ORDER BY day;');
 report.phase='waiting-for-cron';await save(report);console.log({phase:report.phase,lateUploadStatus:late.status});
}else if(process.argv[2]==='verify'){
 const report=JSON.parse(await readFile(file,'utf8'));
 const remaining=await get(`SELECT id,status FROM listing_imports WHERE id IN (${q(report.abandoned)},${q(report.protectedImport)});`);
 assert.equal(remaining.some(r=>r.id===report.abandoned),false,'Attendre le cron toutes les 10 minutes avant cette vérification');assert.equal(remaining.length,1);assert.equal(remaining[0].status,'ready');
 await wrangler(['get',`bienvu-s00-private/${manual.listing.photos[0].objectKey}`,'--file',`${folder}/purge-protected.jpg`]);
 const missing=await promisify(execFile)('pnpm',['exec','wrangler','r2','object','get',`bienvu-s00-private/${report.abandonedKey}`,'--file',`${folder}/unexpected-abandoned.jpg`,'--remote','--config','apps/pipeline/wrangler.staging.import.jsonc']).then(()=>false,()=>true);assert.ok(missing);
 const res=await fetch('https://bienvu-import-staging.alexlevy0.workers.dev/operator/purge',{method:'POST',headers:{Authorization:`Bearer ${token}`}});assert.equal(res.status,200);report.repeat=await res.json();assert.equal(report.repeat.removed,0);
 assert.deepEqual(await get('SELECT day,attempts FROM import_usage ORDER BY day;'),report.countersBefore);
 report.phase='passed';report.checkedAt=new Date().toISOString();report.checks=['cron réel : abandon D1/R2 purgé','job de fixture : annonce et photo protégées','écriture tardive refusée','purge répétée sans effet','tentatives non remboursées'];await save(report);console.log(report.checks);
}else if(process.argv[2]==='cleanup'){
 const report=JSON.parse(await readFile(file,'utf8'));assert.equal(report.phase,'passed');
 await get(`PRAGMA defer_foreign_keys=ON; DELETE FROM reservations WHERE id=${q(report.reservation)}; DELETE FROM jobs WHERE id=${q(report.job)}; DELETE FROM allocations WHERE id=${q(report.allocation)}; PRAGMA defer_foreign_keys=OFF;
 UPDATE listing_imports SET lease_until=${q(old)},expires_at=${q(old)} WHERE agency_id=${q(agency)};`);
 const res=await fetch('https://bienvu-import-staging.alexlevy0.workers.dev/operator/purge',{method:'POST',headers:{Authorization:`Bearer ${token}`}});assert.equal(res.status,200);report.cleanup=await res.json();
 assert.equal((await get(`SELECT count(*) n FROM listing_imports WHERE agency_id=${q(agency)}`))[0].n,0);
 assert.deepEqual(await get('SELECT day,attempts FROM import_usage ORDER BY day;'),report.countersBefore);
 report.cleanedAt=new Date().toISOString();await save(report);console.log(report.cleanup);
}else throw new Error('seed, verify ou cleanup attendu');
