import {test} from 'node:test';
import assert from 'node:assert/strict';
import {Miniflare,convertV4MiniflareOptions} from 'miniflare';
import {GoogleVoiceConfig} from '../packages/contracts/src/index';
import {DEFAULT_SCRIPT_MODEL} from '../packages/narration/src/index';
import {googleTts} from '../packages/voice/src/index';
import {fixturePlan,fixtureScriptMetrics} from '../fixtures/narration';
import {toneFixture} from '../fixtures/voice';
import {videoFixture} from '../fixtures/video';
import {migrateNarrationProbe,seedNarrationFixture} from '../scripts/narration-fixtures';
import {prepareJobNarration} from '../apps/pipeline/src/narration';
import {prepareJobVideo,getJobVideo} from '../apps/pipeline/src/video-manifest';

test('manifeste D1/R2 : copie vérifiée, droits serveur immuables et isolation',async t=>{
  const mf=new Miniflare(convertV4MiniflareOptions({modules:true,script:'export default {fetch(){return new Response("fixture")}}',
    compatibilityDate:'2026-09-27',d1Databases:['DB'],r2Buckets:['MEDIA']}));t.after(()=>mf.dispose());
  const env=await mf.getBindings<{DB:D1Database;MEDIA:R2Bucket}>();await migrateNarrationProbe(env.DB);
  const scope=await seedNarrationFixture(env.DB,'video',true),fixture=await videoFixture('trial',8);
  const listing=fixture.listing;listing.agencyId=scope.agencyId;listing.id='listing-video';
  for(const p of listing.photos) {p.agencyId=scope.agencyId;p.listingId=listing.id;p.objectKey=`agencies/${scope.agencyId}/imports/${listing.id}/${p.id}.png`;
    await env.MEDIA.put(p.objectKey,new Uint8Array(fixture.files.get(p.id)!));}
  await env.DB.prepare('UPDATE listing_imports SET result_json=? WHERE id=?').bind(JSON.stringify(listing),listing.id).run();
  await env.DB.prepare('UPDATE allocations SET reserved=1 WHERE agency_id=?').bind(scope.agencyId).run();
  const config=GoogleVoiceConfig.parse({projectId:'bienvu-fixture'}),google=googleTts(config,async()=>'fixture-never-networked',
    {fetch:async()=>Response.json({audioContent:Buffer.from(toneFixture(4500)).toString('base64')})});
  await prepareJobNarration(env,scope.agencyId,scope.jobId,{mode:'mock',script:{model:DEFAULT_SCRIPT_MODEL,plan:async ctx=>({plan:fixturePlan(ctx),metrics:fixtureScriptMetrics()})},voice:{config,synthesize:google.synthesize}});
  // A photo outside the speech plan must still be present and untampered.
  const extra=listing.photos.at(-1)!;await env.MEDIA.delete(extra.objectKey);
  await assert.rejects(prepareJobVideo(env,scope.agencyId,scope.jobId),/VIDEO_ASSET_MISSING/);
  await env.MEDIA.put(extra.objectKey,new Uint8Array(extra.sizeBytes));
  await assert.rejects(prepareJobVideo(env,scope.agencyId,scope.jobId),/VIDEO_ASSET_HASH_MISMATCH/);
  await env.MEDIA.put(extra.objectKey,new Uint8Array(fixture.files.get(extra.id)!));
  // Deux préparations concurrentes convergent sur le même snapshot.
  const [first,second]=await Promise.all([1,2].map(()=>prepareJobVideo(env,scope.agencyId,scope.jobId)));
  assert.deepEqual(first,second);assert.equal(first.state,'prepared');assert.deepEqual(first.manifest.rights,{kind:'trial',allocationId:'allocation-video',watermarked:true});
  assert.equal(first.manifest.templateVersion,'bienvu-vertical/2');
  assert.equal(first.manifest.subtitlesEnabled,true); // Legacy job without a generation input.
  assert.equal(first.manifest.photos.length,8);
  assert.deepEqual(first.manifest.photoTimeline?.map(p=>p.photoAssetId),listing.photos.map(p=>p.id));
  assert.equal(first.manifest.photoTimeline?.reduce((n,p)=>n+p.durationFrames,0),first.manifest.scenes.reduce((n,s)=>n+s.durationFrames,0));
  assert.ok(first.manifest.photos.some(p=>!first.manifest.scenes.some(s=>s.photoAssetId===p.id))); // Speech no longer discards the gallery.
  assert.equal(first.manifest.presentation?.locality,listing.facts.locality.value);
  assert.equal(first.manifest.presentation?.priceCents,listing.facts.price.value?.amountCents);
  for(const p of first.manifest.photos)assert.equal((await env.MEDIA.get(p.objectKey))!.size,p.sizeBytes);
  await env.DB.prepare('UPDATE agencies SET name=? WHERE id=?').bind('Nouvelle identité après départ',scope.agencyId).run();
  assert.deepEqual(await prepareJobVideo(env,scope.agencyId,scope.jobId),first);
  await assert.rejects(env.DB.prepare('UPDATE video_manifests SET manifest_json=? WHERE job_id=?').bind(JSON.stringify({...first.manifest,rights:{kind:'paid',allocationId:'allocation-video',watermarked:false}}),scope.jobId).run(),/VIDEO_MANIFEST_IMMUTABLE/);
  assert.equal(await getJobVideo(env.DB,'other-agency',scope.jobId),null);
  await assert.rejects(prepareJobVideo(env,'other-agency',scope.jobId),/VIDEO_NOT_AUTHORIZED/);
  await env.DB.prepare('UPDATE jobs SET attempt=2 WHERE id=?').bind(scope.jobId).run();
  await assert.rejects(prepareJobVideo(env,scope.agencyId,scope.jobId),/VIDEO_CONFLICT/);
  assert.equal((await env.DB.prepare('SELECT consumed FROM allocations WHERE agency_id=?').bind(scope.agencyId).first<{consumed:number}>())!.consumed,0);
});
