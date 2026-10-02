import {test} from 'node:test';
import assert from 'node:assert/strict';
import {Miniflare,convertV4MiniflareOptions} from 'miniflare';
import {GenerationRequest,GoogleVoiceConfig,VideoManifest,videoManifestHash,VideoReport} from '../packages/contracts/src/index';
import {admitGeneration,generationView} from '../packages/db/src/index';
import {DEFAULT_SCRIPT_MODEL} from '../packages/narration/src/index';
import {migrateNarrationProbe,seedNarrationFixture} from '../scripts/narration-fixtures';
import {fixturePlan,fixtureScriptMetrics} from '../fixtures/narration';
import {videoFixture,videoReport} from '../fixtures/video';
import {prepareJobNarration} from '../apps/pipeline/src/narration';
import {prepareJobVideo} from '../apps/pipeline/src/video-manifest';

test('voix facultative : booléen strict, ancien hash conservé, audio interdit quand désactivée',async()=>{
  for(const source of [{listingId:'listing-fixture'},{url:'https://www.orpi.com/annonce-vente-test/'}]){
    assert.deepEqual(GenerationRequest.parse(source),source);
    for(const enabled of [true,false])assert.equal(GenerationRequest.parse({...source,voiceEnabled:enabled}).voiceEnabled,enabled);
    for(const invalid of ['false',0,null])assert.equal(GenerationRequest.safeParse({...source,voiceEnabled:invalid}).success,false);
  }
  const {manifest:m}=await videoFixture();assert.equal(Object.hasOwn(VideoManifest.parse(m),'voiceEnabled'),false);
  const silent={...m,voiceEnabled:false,subtitlesEnabled:false,audio:[],scenes:m.scenes.map(s=>({...s,audioAssetId:null}))};
  assert.equal(VideoManifest.parse(silent).audio.length,0);
  assert.notEqual(await videoManifestHash(silent),await videoManifestHash(m));
  assert.equal(VideoManifest.safeParse({...m,voiceEnabled:false}).success,false);
  assert.equal(VideoManifest.safeParse({...silent,voiceEnabled:true}).success,false);
  assert.equal(VideoManifest.safeParse({...silent,subtitlesEnabled:true}).success,false);
  const report=videoReport(await videoManifestHash(m),m);
  assert.equal(VideoReport.safeParse({...report,audioCodec:null,meanVolumeDb:null}).success,true);
  assert.equal(VideoReport.safeParse({...report,audioCodec:null}).success,false);
});

test('D1/R2 sans voix : zéro appel TTS, reprise stable, sous-titres coupés et galerie conservée',async t=>{
  const mf=new Miniflare(convertV4MiniflareOptions({modules:true,script:'export default {fetch(){return new Response("fixture")}}',compatibilityDate:'2026-09-27',d1Databases:['DB'],r2Buckets:['MEDIA']}));
  t.after(()=>mf.dispose());const env=await mf.getBindings<{DB:D1Database;MEDIA:R2Bucket}>();await migrateNarrationProbe(env.DB);
  const scope=await seedNarrationFixture(env.DB,'silent',true),fixture=await videoFixture('trial',8);
  const listing={...fixture.listing,id:'listing-silent',agencyId:scope.agencyId};
  for(const p of listing.photos){p.agencyId=scope.agencyId;p.listingId=listing.id;p.objectKey=`agencies/${scope.agencyId}/imports/${listing.id}/${p.id}.png`;
    await env.MEDIA.put(p.objectKey,fixture.files.get(p.id)!,{customMetadata:{sha256:p.contentHash}});}
  await env.DB.prepare('UPDATE listing_imports SET result_json=? WHERE id=?').bind(JSON.stringify(listing),listing.id).run();
  await env.DB.prepare("UPDATE jobs SET status='failed',error_code='FIXTURE',lease_until=NULL WHERE id=?").bind(scope.jobId).run();
  await env.DB.prepare('INSERT INTO hosted_import_budget VALUES(?,0,9500,0)').bind(new Date().toISOString().slice(0,7)).run();
  await env.DB.exec('UPDATE generation_control SET enabled=1');
  await env.DB.prepare('INSERT INTO generation_access VALUES(?,?,1)').bind(scope.agencyId,'allocation-silent').run();
  const input={listingId:listing.id,voiceEnabled:false,subtitlesEnabled:true};
  const row=await admitGeneration(env.DB,scope.agencyId,'silent-admission-key-01',input,'true');
  assert.equal(generationView(row).syntheticVoice,false);
  await assert.rejects(admitGeneration(env.DB,scope.agencyId,'silent-admission-key-01',{...input,voiceEnabled:true},'true'),/CONFLICT/);
  await env.DB.prepare("UPDATE jobs SET status='scripting',stage='scripting',listing_id=? WHERE id=?").bind(listing.id,row.jobId).run();
  let scriptCalls=0;
  const providers={mode:'mock' as const,script:{model:DEFAULT_SCRIPT_MODEL,plan:async(context:Parameters<typeof fixturePlan>[0])=>{scriptCalls++;return {plan:fixturePlan(context),metrics:fixtureScriptMetrics()};}},
    voice:{config:GoogleVoiceConfig.parse({projectId:'fixture-silent'}),synthesize:async():Promise<never>=>{throw Error('TTS_MUST_NOT_RUN');}}};
  const first=await prepareJobNarration(env,scope.agencyId,row.jobId,providers);
  assert.equal(first.voiceEnabled,false);assert.deepEqual(first.audio,[]);
  assert.deepEqual(await prepareJobNarration(env,scope.agencyId,row.jobId,providers),first);assert.equal(scriptCalls,1);
  assert.equal((await env.DB.prepare("SELECT count(*) n FROM narration_calls WHERE provider='google'").first<{n:number}>())!.n,0);
  const frozen=await prepareJobVideo(env,scope.agencyId,row.jobId);
  assert.equal(frozen.manifest.voiceEnabled,false);assert.equal(frozen.manifest.subtitlesEnabled,false);assert.equal(frozen.manifest.photos.length,8);
  assert.deepEqual(frozen.manifest.audio,[]);assert.ok(frozen.manifest.scenes.every(s=>s.audioAssetId===null));
  assert.equal((await prepareJobVideo(env,scope.agencyId,row.jobId)).hash,frozen.hash);
});
