import {test,type TestContext} from 'node:test';
import assert from 'node:assert/strict';
import {Miniflare,convertV4MiniflareOptions} from 'miniflare';
import {migrateNarrationProbe,seedNarrationFixture} from '../scripts/narration-fixtures';
import {admitGeneration,admitAnonymous,findGeneration,findImport,createAnonymousSession,anonymousSession,claimTrial,ensureAgency,
  failGeneration,generationView,retainedAnimation,retainedAnimations} from '../packages/db/src/index';
import {GeneratableListing,VideoAsset,defaultVideoCustomization} from '../packages/contracts/src/index';
import {videoFixture,videoReport} from '../fixtures/video';
import {cleanupAnimations} from '../apps/pipeline/src/animation-cleanup';
import {cleanupAnonymousTrials} from '../apps/pipeline/src/trial-cleanup';

const fixture=async(t:TestContext)=>{
  const mf=new Miniflare(convertV4MiniflareOptions({modules:true,script:'export default {fetch(){return new Response("fixture")}}',
    compatibilityDate:'2026-09-27',d1Databases:['DB'],r2Buckets:['MEDIA']}));t.after(()=>mf.dispose());
  const env=await mf.getBindings<{DB:D1Database;MEDIA:R2Bucket}>();await migrateNarrationProbe(env.DB);
  await env.DB.exec('UPDATE generation_control SET enabled=1; UPDATE trial_policy SET enabled=1,free_enabled=1');
  await env.DB.prepare('INSERT INTO hosted_import_budget VALUES(?,0,9500,0)').bind(new Date().toISOString().slice(0,7)).run();
  return env;
};

test('Animations conservées sans échéance : purge refusée et réutilisation sans nouveau crédit animation',async t=>{
  const env=await fixture(t),{agencyId,jobId}=await seedNarrationFixture(env.DB,'retention',true),at=new Date().toISOString();
  await env.DB.prepare("UPDATE jobs SET status='failed',error_code='FIXTURE',lease_until=NULL WHERE id=?").bind(jobId).run();
  await env.DB.prepare("UPDATE allocations SET kind='paid',quota_limit=3 WHERE agency_id=?").bind(agencyId).run();
  await env.DB.prepare('INSERT INTO generation_access VALUES(?,?,1)').bind(agencyId,'allocation-retention').run();
  const listing=GeneratableListing.parse(JSON.parse((await findImport(env.DB,agencyId,'listing-retention'))!.result!));
  const job=await admitGeneration(env.DB,agencyId,'retention-first-video-001',{listingId:listing.id},'true');
  const f=await videoFixture(),bytes=new Uint8Array([7,8,9,10]),report=videoReport('a'.repeat(64),f.manifest,bytes),key=`agencies/${agencyId}/jobs/${job.jobId}/video/master.mp4`;
  await env.MEDIA.put(key,bytes,{customMetadata:{sha256:report.sha256}});
  await env.DB.batch([env.DB.prepare('INSERT INTO generation_artifacts VALUES(?,?,?,?)').bind(job.jobId,key,JSON.stringify(report),at),
    env.DB.prepare("UPDATE jobs SET status='ready',lease_until=NULL WHERE id=?").bind(job.jobId)]);
  const sha256=[...new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))].map(n=>n.toString(16).padStart(2,'0')).join('');
  const asset=VideoAsset.parse({id:'retained-animation',objectKey:`agencies/${agencyId}/imports/animation-library/${sha256}.mp4`,
    sha256,sizeBytes:bytes.length,mime:'video/mp4',width:720,height:1280,durationMs:5000});
  await env.MEDIA.put(asset.objectKey,bytes);
  await env.DB.prepare("INSERT INTO animation_library(id,agency_id,source_sha256,aspect_ratio,model,mode,origin_job_id,asset_json,created_at,expires_at) VALUES(?,?,?,'9:16','gen4_turbo','real',?,?,?,?)")
    .bind('retained-library',agencyId,listing.photos[0].contentHash,job.jobId,JSON.stringify(asset),at,new Date(Date.now()-1000).toISOString()).run();
  await env.DB.prepare('UPDATE generation_runs SET expires_at=? WHERE job_id=?').bind(new Date(Date.now()-1000).toISOString(),job.jobId).run();
  assert.deepEqual(await cleanupAnimations(env,Date.now()+365*86400_000),{removed:0});assert.ok(await env.MEDIA.head(asset.objectKey));
  await assert.rejects(env.DB.prepare("UPDATE animation_library SET state='expiring' WHERE id='retained-library'").run(),/FORBIDDEN/);
  await assert.rejects(env.DB.prepare("DELETE FROM animation_library WHERE id='retained-library'").run(),/FORBIDDEN/);
  const settings={...defaultVideoCustomization(),runwayPhotos:[0]};
  assert.equal((await retainedAnimations(env.DB,agencyId,listing,settings,'9:16',Date.now()+365*86400_000))[0]?.libraryId,'retained-library');
  assert.equal((await retainedAnimation(env.DB,agencyId,'retained-library'))?.asset.objectKey,asset.objectKey);
  assert.equal(await retainedAnimation(env.DB,'another-agency','retained-library'),null);
  const reuse=await admitGeneration(env.DB,agencyId,'retention-reuse-video-001',{listingId:listing.id,customization:settings},'true');
  assert.equal(reuse.creditsReserved,1);assert.equal(JSON.parse((await env.DB.prepare('SELECT animation_reuses_json AS json FROM generation_runs WHERE job_id=?').bind(reuse.jobId).first<{json:string}>())!.json)[0].libraryId,'retained-library');
  await failGeneration(env.DB,reuse,'GENERATION_FAILED');assert.deepEqual(await cleanupAnimations(env),{removed:0});
});

test('Essai réussi : média conservé après purge, récupération possible et session toujours limitée',async t=>{
  const env=await fixture(t),{session,proof}=await createAnonymousSession(env.DB),now=Date.now(),at=new Date(now).toISOString();
  const job=await admitAnonymous(env.DB,session,'retention-guest-video-001',{url:'https://www.century21.fr/trouver_logement/detail/123456/'},
    {ipHmac:'a'.repeat(64),turnstileHash:'b'.repeat(64)},'true');
  const f=await videoFixture('anonymous'),bytes=new Uint8Array([1,2,3,4]),report=videoReport('a'.repeat(64),f.manifest,bytes),preview={...report,watermarked:true};
  const key=`agencies/${session.scopeId}/jobs/${job.jobId}/video/master.mp4`,previewKey=key.replace('master','preview');
  await env.MEDIA.put(key,bytes);await env.MEDIA.put(previewKey,bytes);
  await env.DB.batch([env.DB.prepare('INSERT INTO generation_artifacts VALUES(?,?,?,?)').bind(job.jobId,key,JSON.stringify(report),at),
    env.DB.prepare('INSERT INTO generation_previews VALUES(?,?,?,?)').bind(job.jobId,previewKey,JSON.stringify(preview),at),
    env.DB.prepare("UPDATE jobs SET status='ready',lease_until=NULL WHERE id=?").bind(job.jobId)]);
  await env.DB.prepare('UPDATE generation_runs SET expires_at=? WHERE job_id=?').bind(new Date(now-1000).toISOString(),job.jobId).run();
  await cleanupAnonymousTrials(env,now+2*86400_000);
  const retained=(await findGeneration(env.DB,session.scopeId,job.jobId))!;
  assert.equal(retained.expiresAt,null);assert.equal(generationView(retained,now+365*86400_000,'anonymous').videoUrl,`/api/trial/${job.jobId}/preview`);
  assert.ok(await env.MEDIA.head(key));assert.ok(await env.MEDIA.head(previewKey));
  await assert.rejects(env.DB.prepare("UPDATE generation_runs SET retention='expiring' WHERE job_id=?").bind(job.jobId).run(),/FORBIDDEN/);
  await env.DB.prepare('INSERT INTO auth_user VALUES(?,?,?,1,NULL,?,?)').bind('retention-owner','Owner','owner@example.com',now,now).run();
  const owner=await ensureAgency(env.DB,{id:'retention-owner',email:'owner@example.com'});
  assert.equal((await claimTrial(env.DB,session,owner.id,job.jobId)).expiresAt,null);
  await cleanupAnonymousTrials(env,now+365*86400_000);
  assert.ok(await env.MEDIA.head(key));assert.equal((await findGeneration(env.DB,session.scopeId,job.jobId))!.retention,'available');
  assert.equal(await anonymousSession(env.DB,proof),null,'L’expiration de la session ne supprime pas la vidéo récupérée');
});
