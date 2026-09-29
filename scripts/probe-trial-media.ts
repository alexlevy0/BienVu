// Actual locally rendered MP4s through the private media handlers, real workerd
// D1/R2. Account/job setup is synthetic; no OAuth, portal, TTS or paid service.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFile,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {Miniflare,convertV4MiniflareOptions} from 'miniflare';
import {VideoReport} from '../packages/contracts/src/index';
import {migrateNarrationProbe} from './narration-fixtures';
import {createAnonymousSession,admitAnonymous,claimTrial,creditGrant,ensureAgency,listGenerations} from '../packages/db/src/index';
import {trialPreview,type TrialEnv} from '../apps/web/lib/trials';
import {generationVideo} from '../apps/web/lib/generations';
const directory=path.resolve('evidence/local/anonymous-video'),sha=(b:Uint8Array)=>createHash('sha256').update(b).digest('hex');
const report=VideoReport.parse(JSON.parse(await readFile(path.join(directory,'report.json'),'utf8')));
assert.equal(report.watermarked,false);assert.equal(report.preview?.watermarked,true);
const master=await readFile(path.join(directory,'video.mp4')),preview=await readFile(path.join(directory,'preview.mp4'));
assert.equal(sha(master),report.sha256);assert.equal(sha(preview),report.preview!.sha256);
const mf=new Miniflare(convertV4MiniflareOptions({modules:true,script:'export default {fetch(){return new Response("fixture")}}',compatibilityDate:'2026-09-27',d1Databases:['DB'],r2Buckets:['MEDIA']}));
try{
  const bindings=await mf.getBindings<{DB:D1Database;MEDIA:R2Bucket}>(),DB=bindings.DB;
  const env={...bindings,BETTER_AUTH_URL:'https://bienvu.test',BETTER_AUTH_SECRET:'fixture-auth-secret-only-for-this-local-probe',PROBE_MODE:'remote'} as TrialEnv;
  await migrateNarrationProbe(DB);await DB.exec('UPDATE trial_policy SET enabled=1,free_enabled=1; UPDATE generation_control SET enabled=1');
  await DB.prepare('INSERT INTO hosted_import_budget VALUES(?,0,2500,0)').bind(new Date().toISOString().slice(0,7)).run();
  const {session,proof}=await createAnonymousSession(DB),row=await admitAnonymous(DB,session,'real-local-media-key',{url:'https://www.century21.fr/trouver_logement/detail/123456/'},{ipHmac:'a'.repeat(64),turnstileHash:'b'.repeat(64)},'true');
  const prefix=`agencies/${row.agencyId}/jobs/${row.jobId}/video/`,masterKey=prefix+'master.mp4',previewKey=prefix+'preview.mp4',at=new Date().toISOString();
  await env.MEDIA.put(masterKey,new Uint8Array(master),{customMetadata:{sha256:report.sha256}});
  await env.MEDIA.put(previewKey,new Uint8Array(preview),{customMetadata:{sha256:report.preview!.sha256}});
  await DB.batch([DB.prepare('INSERT INTO generation_artifacts VALUES(?,?,?,?)').bind(row.jobId,masterKey,JSON.stringify(report),at),DB.prepare('INSERT INTO generation_previews VALUES(?,?,?,?)').bind(row.jobId,previewKey,JSON.stringify(report.preview),at),DB.prepare("UPDATE jobs SET status='ready',lease_until=NULL,updated_at=? WHERE id=?").bind(at,row.jobId)]);
  const anon=new Request('https://bienvu.test/api/preview?variant=master&download=1',{headers:{Cookie:`__Host-bienvu-trial=${proof}`}});
  const seen=await trialPreview(anon,env,row.jobId);assert.equal(sha(new Uint8Array(await seen.arrayBuffer())),report.preview!.sha256);
  assert.match(seen.headers.get('Cache-Control')!,/private, no-store/);assert.match(seen.headers.get('Content-Disposition')!,/^inline/);
  await assert.rejects(generationVideo(new Request('https://bienvu.test/video'),env,row.agencyId,row.jobId),/NOT_FOUND/);
  await assert.rejects(trialPreview(new Request('https://bienvu.test/preview'),env,row.jobId),/NOT_FOUND/);
  await DB.prepare('INSERT INTO auth_user VALUES(?,?,?,1,NULL,?,?)').bind('media-owner','Recette','media@example.com',Date.now()-1000,Date.now()).run();
  const agency=await ensureAgency(DB,{id:'media-owner',email:'media@example.com'});
  await Promise.all([1,2].map(()=>claimTrial(DB,session,agency.id,row.jobId)));
  for(let i=0;i<2;i++){
    const file=await generationVideo(new Request('https://bienvu.test/video?download=1'),env,agency.id,row.jobId);
    assert.equal(sha(new Uint8Array(await file.arrayBuffer())),report.sha256);assert.match(file.headers.get('Content-Disposition')!,/^attachment/);
  }
  await assert.rejects(trialPreview(anon,env,row.jobId),/NOT_FOUND/);
  await assert.rejects(generationVideo(new Request('https://bienvu.test/video'),env,'other-agency',row.jobId),/NOT_FOUND/);
  const partial=await generationVideo(new Request('https://bienvu.test/video',{headers:{Range:'bytes=0-1023'}}),env,agency.id,row.jobId);
  assert.equal(partial.status,206);assert.equal(sha(new Uint8Array(await partial.arrayBuffer())),sha(master.subarray(0,1024)));
  assert.equal((await creditGrant(DB,agency.id))!.remaining,2);
  assert.equal((await listGenerations(DB,agency.id)).jobs.length,1);
  assert.equal((await DB.prepare('SELECT count(*) AS n FROM generation_shares').first<{n:number}>())!.n,0);
  const proofResult={at:new Date().toISOString(),realMP4:true,realLocalD1R2:true,syntheticAccountAndJob:true,realOAuth:false,realTurnstile:false,paidCalls:0,
    anonymousPreviewSha256:report.preview!.sha256,ownerMasterSha256:report.sha256,repeatedClaims:2,repeatedDownloads:2,creditsRemaining:2,historyEntries:1,publicShares:0,rangeVerified:true,masterDeniedBeforeClaim:true,foreignOwnerDenied:true};
  await writeFile(path.join(directory,'access-verification.json'),JSON.stringify(proofResult,null,2));console.log(JSON.stringify(proofResult));
}finally{await mf.dispose();}
