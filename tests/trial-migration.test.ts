import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile,readdir} from 'node:fs/promises';
import {Miniflare,convertV4MiniflareOptions} from 'miniflare';
import {seedNarrationFixture} from '../scripts/narration-fixtures';
test('migration sur base peuplée : propriétaires, vidéos, réservations et quotas payants conservés',async t=>{
  const mf=new Miniflare(convertV4MiniflareOptions({modules:true,script:'export default {fetch(){return new Response("fixture")}}',compatibilityDate:'2026-09-27',d1Databases:['DB']}));t.after(()=>mf.dispose());const DB=await mf.getD1Database('DB');
  const dir=new URL('../packages/db/migrations/',import.meta.url),files=(await readdir(dir)).filter(s=>s.endsWith('.sql')).sort();
  const apply=async(name:string)=>DB.exec((await readFile(new URL(name,dir),'utf8')).replace(/^--.*$/gm,'').replace(/\n/g,' '));
  for(const f of files.filter(f=>f<'0017'))await apply(f);
  const {agencyId,jobId}=await seedNarrationFixture(DB,'migration',true);
  await DB.prepare("UPDATE allocations SET kind='paid',quota_limit=30,reserved=1,consumed=7 WHERE agency_id=?").bind(agencyId).run();
  await DB.prepare('INSERT INTO generation_access VALUES(?,?,1)').bind(agencyId,'allocation-migration').run();
  const at=new Date().toISOString(),future=new Date(Date.now()+86400_000).toISOString();
  await DB.prepare("UPDATE jobs SET status='ready' WHERE id=?").bind(jobId).run();
  await DB.exec('UPDATE generation_control SET enabled=1');
  await DB.prepare('INSERT INTO hosted_import_budget VALUES(?,0,2500,0)').bind(at.slice(0,7)).run();
  await DB.prepare(`INSERT INTO generation_runs(job_id,agency_id,allocation_id,reservation_id,idempotency_key,input_hash,input_json,brand_json,created_at,deadline,expires_at,month)
    VALUES(?,?,?,'old-reservation','old-generation-key',?,'{}','{}',?,?,?,?)`).bind('old-generation',agencyId,'allocation-migration','a'.repeat(64),at,future,future,at.slice(0,7)).run();
  await DB.prepare("INSERT INTO generation_artifacts VALUES('old-generation',?,'{}',?)").bind(`agencies/${agencyId}/jobs/old-generation/video/old.mp4`,at).run();
  await DB.exec("UPDATE jobs SET status='ready',stage='rendering',lease_until=NULL WHERE id='old-generation'");
  await DB.prepare("UPDATE jobs SET status='scripting' WHERE id=?").bind(jobId).run();
  const past=new Date(Date.now()-86400_000).toISOString();
  await DB.prepare("UPDATE generation_runs SET expires_at=? WHERE job_id='old-generation'").bind(past).run();
  const original=await DB.prepare('SELECT * FROM allocations').all();
  // Preserve both pre-pipeline jobs and a completed, billed generation with its artifact.
  for(const f of files.filter(f=>f>='0017'))await apply(f);
  assert.deepEqual((await DB.prepare('SELECT * FROM allocations').all()).results,original.results);
  assert.equal((await DB.prepare('SELECT agency_id AS id FROM jobs WHERE id=?').bind(jobId).first<{id:string}>())!.id,agencyId);
  assert.equal((await DB.prepare('SELECT status FROM reservations WHERE job_id=?').bind(jobId).first<{status:string}>())!.status,'reserved');
  assert.deepEqual(await DB.prepare("SELECT owner_agency_id,anonymous_session_id,retention,storage_permanent FROM generation_runs WHERE job_id='old-generation'").first(),{owner_agency_id:agencyId,anonymous_session_id:null,retention:'available',storage_permanent:1});
  assert.equal((await DB.prepare("SELECT expires_at AS at FROM generation_runs WHERE job_id='old-generation'").first<{at:string}>())!.at,past,'La conservation ne repose pas sur une fausse date future');
  assert.equal((await DB.prepare("SELECT status FROM reservations WHERE job_id='old-generation'").first<{status:string}>())!.status,'consumed');
  assert.equal((await DB.prepare("SELECT count(*) AS n FROM generation_artifacts WHERE job_id='old-generation'").first<{n:number}>())!.n,1);
  assert.deepEqual((await DB.prepare('PRAGMA foreign_key_check').all()).results,[]);
  assert.deepEqual(await DB.prepare('SELECT enabled,free_enabled FROM trial_policy').first(),{enabled:0,free_enabled:0});
});
