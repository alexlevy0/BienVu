import {test} from 'node:test';
import assert from 'node:assert/strict';
import {Miniflare,convertV4MiniflareOptions} from 'miniflare';
import {GenerationRequest,GoogleVoiceConfig,VideoManifest,VideoReport,videoManifestHash,videoPhotoTimeline} from '../packages/contracts/src/index';
import {voiceSceneTiming,googleTts} from '../packages/voice/src/index';
import {DEFAULT_SCRIPT_MODEL} from '../packages/narration/src/index';
import {admitGeneration,generationView} from '../packages/db/src/index';
import {migrateNarrationProbe,seedNarrationFixture} from '../scripts/narration-fixtures';
import {fixturePlan,fixtureScriptMetrics} from '../fixtures/narration';
import {toneFixture} from '../fixtures/voice';
import {videoFixture,videoReport} from '../fixtures/video';
import {prepareJobNarration} from '../apps/pipeline/src/narration';
import {prepareJobVideo} from '../apps/pipeline/src/video-manifest';

test('durée : options strictes, anciennes entrées inchangées et voix complète dans chaque durée choisie',async()=>{
  for(const source of [{listingId:'listing-fixture'},{url:'https://www.orpi.com/annonce-vente-fixture/'}]){
    assert.deepEqual(GenerationRequest.parse(source),source);
    for(const durationSeconds of [20,30,40] as const)assert.equal(GenerationRequest.parse({...source,durationSeconds}).durationSeconds,durationSeconds);
    for(const durationSeconds of [0,25,41,'20',null])assert.equal(GenerationRequest.safeParse({...source,durationSeconds}).success,false);
  }
  const durations=[2640,3840,2880,1640,3280];
  for(const seconds of [20,30,40] as const){
    const frames=voiceSceneTiming(durations,seconds);
    assert.equal(frames.reduce((n,f)=>n+f,0),seconds*30);
    assert.ok(frames.every((f,i)=>f>=Math.ceil(durations[i]*30/1000)+6));
    assert.ok(frames.at(-1)!<=Math.ceil(durations.at(-1)!*30/1000)+36);
  }
  assert.throws(()=>voiceSceneTiming([8000,8000,8000,8000],20),/VOICE_DURATION_EXCEEDED/);
  assert.throws(()=>voiceSceneTiming([8000,8000,8000,8000],30),/VOICE_DURATION_EXCEEDED/);
  assert.equal(voiceSceneTiming([8000,8000,8000,8000],40).reduce((n,f)=>n+f,0),1200);
  const {manifest}=await videoFixture('trial',8),timing=voiceSceneTiming(manifest.audio.map(a=>a.durationMs!),40);
  const scenes=manifest.scenes.map((s,i)=>({...s,durationFrames:timing[i]}));
  const longer=VideoManifest.parse({...manifest,durationSeconds:40,scenes,photoTimeline:videoPhotoTimeline(manifest.photos,1200)});
  assert.equal(longer.photoTimeline!.reduce((n,p)=>n+p.durationFrames,0),1200);
  assert.equal(longer.photoTimeline!.length,8);
  assert.equal(VideoManifest.safeParse({...longer,durationSeconds:30}).success,false);
  assert.notEqual(await videoManifestHash(longer),await videoManifestHash(manifest));
  assert.equal(VideoReport.parse(videoReport(await videoManifestHash(longer),longer)).durationFrames,1200);
});

test('D1/R2 : 20, 30 et 40 secondes avec/sans voix, rejeu stable et durée liée à l’admission',async t=>{
  for(const durationSeconds of [20,30,40] as const)await t.test(`${durationSeconds} secondes`,async t=>{
  const mf=new Miniflare(convertV4MiniflareOptions({modules:true,script:'export default {fetch(){return new Response("fixture")}}',compatibilityDate:'2026-09-27',d1Databases:['DB'],r2Buckets:['MEDIA']}));
  t.after(()=>mf.dispose());const env=await mf.getBindings<{DB:D1Database;MEDIA:R2Bucket}>();await migrateNarrationProbe(env.DB);
  await env.DB.prepare('INSERT INTO hosted_import_budget VALUES(?,0,9500,0)').bind(new Date().toISOString().slice(0,7)).run();
  await env.DB.exec('UPDATE generation_control SET enabled=1');
  const fixture=await videoFixture('trial',8);
  for(const voiceEnabled of [true,false]){
    const label=`duration-${durationSeconds}-${voiceEnabled?'voice':'silent'}`,scope=await seedNarrationFixture(env.DB,label,true);
    const listing={...fixture.listing,id:`listing-${label}`,agencyId:scope.agencyId,
      photos:fixture.listing.photos.map(p=>({...p,agencyId:scope.agencyId,listingId:`listing-${label}`,objectKey:`agencies/${scope.agencyId}/imports/listing-${label}/${p.id}.png`}))};
    for(const p of listing.photos)await env.MEDIA.put(p.objectKey,fixture.files.get(p.id)!,{customMetadata:{sha256:p.contentHash}});
    await env.DB.prepare('UPDATE listing_imports SET result_json=? WHERE id=?').bind(JSON.stringify(listing),listing.id).run();
    await env.DB.prepare("UPDATE jobs SET status='failed',error_code='FIXTURE',lease_until=NULL WHERE id=?").bind(scope.jobId).run();
    await env.DB.prepare('INSERT INTO generation_access VALUES(?,?,1)').bind(scope.agencyId,`allocation-${label}`).run();
    const aspectRatio=voiceEnabled?'9:16' as const:'16:9' as const;
    const key=`generation-duration-${label}`,input={listingId:listing.id,durationSeconds,voiceEnabled,aspectRatio};
    const row=await admitGeneration(env.DB,scope.agencyId,key,input,'true');
    await assert.rejects(admitGeneration(env.DB,scope.agencyId,key,{...input,durationSeconds:durationSeconds===20?30:20},'true'),/CONFLICT/);
    await env.DB.prepare("UPDATE jobs SET status='scripting',stage='scripting',listing_id=? WHERE id=?").bind(listing.id,row.jobId).run();
    let ttsCalls=0;const config=GoogleVoiceConfig.parse({projectId:'fixture-duration'});
    const tts=googleTts(config,async()=> 'fixture-token-not-a-secret',{fetch:async()=>{ttsCalls++;assert.ok(voiceEnabled);return Response.json({audioContent:Buffer.from(toneFixture(1000)).toString('base64')});}});
    const providers={mode:'mock' as const,script:{model:DEFAULT_SCRIPT_MODEL,plan:async(context:Parameters<typeof fixturePlan>[0])=>({plan:fixturePlan(context),metrics:fixtureScriptMetrics()})},voice:{config,synthesize:tts.synthesize}};
    const prepared=await prepareJobNarration(env,scope.agencyId,row.jobId,providers);
    assert.equal(prepared.durationFrames.reduce((n,f)=>n+f,0),durationSeconds*30);
    assert.equal(prepared.durationSeconds,durationSeconds);
    const calls=ttsCalls;assert.deepEqual(await prepareJobNarration(env,scope.agencyId,row.jobId,providers),prepared);assert.equal(ttsCalls,calls);
    assert.equal(ttsCalls,voiceEnabled?prepared.script.scenes.length:0);
    await assert.rejects(admitGeneration(env.DB,scope.agencyId,key,{...input,aspectRatio:aspectRatio==='9:16'?'16:9':'9:16'},'true'),/CONFLICT/);
    assert.equal(generationView(row).aspectRatio,aspectRatio);
    const frozen=await prepareJobVideo(env,scope.agencyId,row.jobId);
    assert.equal(frozen.manifest.width,voiceEnabled?1080:1920);assert.equal(frozen.manifest.height,voiceEnabled?1920:1080);
    assert.equal(frozen.manifest.templateVersion,voiceEnabled?'bienvu-vertical/2':'bienvu-horizontal/1');
    assert.equal(frozen.manifest.durationSeconds,durationSeconds);
    assert.equal(frozen.manifest.photoTimeline!.length,8);
    assert.equal(frozen.manifest.scenes.reduce((n,s)=>n+s.durationFrames,0),durationSeconds*30);
    assert.equal(frozen.manifest.photoTimeline!.reduce((n,p)=>n+p.durationFrames,0),durationSeconds*30);
    assert.equal((await prepareJobVideo(env,scope.agencyId,row.jobId)).hash,frozen.hash);
    // Close this fixture job before admitting the next one: the real pilot
    // correctly allows only one active generation across agencies.
    await env.DB.prepare("UPDATE jobs SET status='failed',error_code='FIXTURE_FINISHED',lease_until=NULL WHERE id=?").bind(row.jobId).run();
  }
  });
});
