import {test} from 'node:test';
import assert from 'node:assert/strict';
import {Miniflare,convertV4MiniflareOptions} from 'miniflare';
import sharp from 'sharp';
import {DEFAULT_VIDEO_MAP,VideoMapDefaults,GenerationRequest,GenerationCustomization,defaultVideoCustomization,automaticMapLocation,
  mapInterval,mapZoomAt,createEditorDocument,type GenerationRequest as GenerationInput,type MapLocation,type VideoCustomization} from '../packages/contracts/src/index';
import {videoMapSettings,setVideoMapSettings,generationMapDefault,findDefaultGenerationMap,admitGeneration,admitAnonymous,createAnonymousSession,
  findGeneration,findImport,failGeneration} from '../packages/db/src/index';
import {migrateNarrationProbe,seedNarrationFixture} from '../scripts/narration-fixtures';
import {prepareDefaultGenerationMap,prepareGenerationMap} from '../apps/pipeline/src/default-video-map';
import {prepareJobNarration} from '../apps/pipeline/src/narration';
import {prepareJobVideo} from '../apps/pipeline/src/video-manifest';
import {videoFixture} from '../fixtures/video';
import {GoogleVoiceConfig} from '../packages/contracts/src/index';
import {DEFAULT_SCRIPT_MODEL} from '../packages/narration/src/index';
import {fixturePlan,fixtureScriptMetrics} from '../fixtures/narration';

const city:MapLocation={latitude:45.772489,longitude:4.855804,label:'Lyon 6e Arrondissement',precision:'approximate',sourceType:'municipality'};
test('carte automatique : opt-out explicite, confirmation manuelle et géocodage sans adresse inventée',()=>{
  assert.ok(GenerationRequest.safeParse({url:'https://example.com/annonce',customization:{...defaultVideoCustomization(),mapDisabled:true}}).success);
  const map={position:'start' as const,durationSeconds:4,location:null,view:'satellite' as const,zoomStart:12,zoomEnd:14.5};
  assert.ok(GenerationCustomization.safeParse({...defaultVideoCustomization(),map,mapAutomatic:true}).success);
  assert.equal(GenerationCustomization.safeParse({...defaultVideoCustomization(),map}).success,false);
  assert.equal(GenerationCustomization.safeParse({...defaultVideoCustomization(),map,mapDisabled:true}).success,false);
  for(const text of ['LYON 6E','Lyon 6ème','Lyon 6e Arrondissement (69006)'])assert.equal(automaticMapLocation(text,[city])?.label,city.label);
  assert.equal(automaticMapLocation('Lyon',[city]),null);
  assert.equal(automaticMapLocation('Lyon 6e',[{...city,sourceType:'housenumber',precision:'exact'}]),null);
  assert.equal(automaticMapLocation('Lyon 6e',[city,{...city,latitude:43}]),null);
  assert.equal(automaticMapLocation('Lyon 6e',[city,{...city}])?.latitude,45.772);
  for(const bad of [{...DEFAULT_VIDEO_MAP,zoomStart:11},{...DEFAULT_VIDEO_MAP,zoomEnd:18.1},{...DEFAULT_VIDEO_MAP,durationSeconds:6},{...DEFAULT_VIDEO_MAP,enabled:1}])
    assert.equal(VideoMapDefaults.safeParse(bad).success,false);
});

test('carte par défaut : admission figée, isolation, cache, montage et essais anonymes',async t=>{
  const mf=new Miniflare(convertV4MiniflareOptions({modules:true,script:'export default {fetch(){return new Response("fixture")}}',compatibilityDate:'2026-10-01',d1Databases:['DB'],r2Buckets:['MEDIA']}));
  t.after(()=>mf.dispose());const env=await mf.getBindings<{DB:D1Database;MEDIA:R2Bucket}>();await migrateNarrationProbe(env.DB);
  const month=new Date().toISOString().slice(0,7);await env.DB.prepare('INSERT INTO hosted_import_budget(month,baseline_cents,ceiling_cents,paused) VALUES(?,0,9500,0)').bind(month).run();
  await env.DB.exec('UPDATE generation_control SET enabled=1; UPDATE trial_policy SET enabled=1');
  let calls=0,searches=0;
  const transport:typeof fetch=async(raw)=>{
    const url=new URL(String(raw));assert.equal(url.hostname,'data.geopf.fr');
    if(url.pathname.endsWith('/search')){searches++;assert.equal(url.searchParams.get('type'),'municipality');
      return Response.json({features:[{geometry:{type:'Point',coordinates:[city.longitude,city.latitude]},properties:{label:city.label,type:'municipality'}}]});}
    calls++;assert.equal(url.searchParams.get('LAYERS'),'ORTHOIMAGERY.ORTHOPHOTOS');
    const bytes=await sharp({create:{width:Number(url.searchParams.get('WIDTH')),height:Number(url.searchParams.get('HEIGHT')),channels:3,background:'#b0bdab'}}).jpeg().toBuffer();
    return new Response(new Uint8Array(bytes),{headers:{'Content-Type':'image/jpeg'}});
  };
  async function create(label:string,input?:GenerationInput){
    const scope=await seedNarrationFixture(env.DB,label,true);
    await env.DB.prepare("UPDATE jobs SET status='failed',error_code='FIXTURE',lease_until=NULL WHERE id=?").bind(scope.jobId).run();
    await env.DB.prepare('INSERT INTO generation_access(agency_id,allocation_id,enabled) VALUES(?,?,1)').bind(scope.agencyId,`allocation-${label}`).run();
    const listing=JSON.parse((await findImport(env.DB,scope.agencyId,`listing-${label}`))!.result!);
    listing.facts.locality.value='LYON 6E';
    await env.DB.prepare('UPDATE listing_imports SET result_json=? WHERE id=?').bind(JSON.stringify(listing),listing.id).run();
    const job=await admitGeneration(env.DB,scope.agencyId,`default-map-${label}-key`,input??{listingId:listing.id,durationSeconds:20,voiceEnabled:false},'true');
    if(!job.listingId)await env.DB.prepare('UPDATE jobs SET listing_id=? WHERE id=?').bind(listing.id,job.jobId).run();
    return {job:(await findGeneration(env.DB,scope.agencyId,job.jobId))!,listing};
  }
  await t.test('réglages initiaux, sauvegarde atomique et journal immuable',async()=>{
    const current=await videoMapSettings(env.DB);assert.deepEqual(current.settings,DEFAULT_VIDEO_MAP);
    const updated=await setVideoMapSettings(env.DB,'fixture-admin',{...DEFAULT_VIDEO_MAP,position:'end',durationSeconds:5},current.revision);
    assert.equal(updated.revision,current.revision+1);
    await assert.rejects(setVideoMapSettings(env.DB,'other-admin',DEFAULT_VIDEO_MAP,current.revision),/VIDEO_MAP_SETTING_CONFLICT/);
    assert.equal((await videoMapSettings(env.DB)).settings.position,'end');
    await assert.rejects(env.DB.prepare('DELETE FROM video_map_setting_events').run(),/VIDEO_MAP_AUDIT_IMMUTABLE/);
    await setVideoMapSettings(env.DB,'fixture-admin',DEFAULT_VIDEO_MAP,updated.revision);
  });
  await t.test('la saisie manuelle conserve sa carte et ses durées après une modification globale',async()=>{
    const {job,listing}=await create('default-map-manual');assert.equal(JSON.parse(job.defaultMap!).view,'satellite');
    const state=await videoMapSettings(env.DB);await setVideoMapSettings(env.DB,'fixture-admin',{...DEFAULT_VIDEO_MAP,enabled:false},state.revision);
    assert.equal(await generationMapDefault(env.DB,{listingId:listing.id}),null);
    const replay=await admitGeneration(env.DB,job.agencyId,'default-map-default-map-manual-key',{listingId:listing.id,durationSeconds:20,voiceEnabled:false},'true');
    assert.equal(replay.jobId,job.jobId);assert.equal(replay.defaultMap,job.defaultMap);assert.equal(replay.inputHash,job.inputHash);
    await assert.rejects(env.DB.prepare('UPDATE generation_runs SET default_map_json=NULL WHERE job_id=?').bind(job.jobId).run(),/GENERATION_IMMUTABLE/);
    const resolved=await prepareDefaultGenerationMap(env,job,transport);assert.ok(resolved);
    assert.equal(resolved.zoomStart,12);assert.equal(resolved.zoomEnd,14.5);assert.equal(resolved.location.latitude,45.772);
    assert.equal(mapZoomAt(resolved,0,120),12);assert.equal(mapZoomAt(resolved,119,120),14.5);assert.equal(mapInterval(resolved,600).photoFrames,480);
    assert.equal(calls,3);assert.equal(searches,1);
    const repeated=await prepareDefaultGenerationMap(env,job,async()=>{throw Error('NO_NEW_MAP_REQUEST');});assert.deepEqual(repeated,resolved);
    assert.equal(await findDefaultGenerationMap(env.DB,'another-agency',job.jobId),null);
    await assert.rejects(env.DB.prepare('UPDATE generation_map_resolutions SET map_json=NULL,reason=? WHERE job_id=?').bind('map_unavailable',job.jobId).run(),/GENERATION_MAP_IMMUTABLE/);
    const fixture=await videoFixture('paid');for(const [i,photo] of listing.photos.entries()){
      const asset=fixture.manifest.photos[i];Object.assign(photo,{contentHash:asset.sha256,sizeBytes:asset.sizeBytes,width:asset.width,height:asset.height});await env.MEDIA.put(photo.objectKey,fixture.files.get(asset.id)!);}
    await env.DB.prepare('UPDATE listing_imports SET result_json=? WHERE id=?').bind(JSON.stringify(listing),listing.id).run();
    const config=GoogleVoiceConfig.parse({projectId:'fixture-project'});
    const providers={mode:'mock' as const,script:{model:DEFAULT_SCRIPT_MODEL,plan:async(context:Parameters<typeof fixturePlan>[0])=>({plan:fixturePlan(context),metrics:fixtureScriptMetrics()})},
      voice:{config,synthesize:async():Promise<never>=>{throw Error('VOICE_DISABLED');}}};
    await env.DB.prepare("UPDATE jobs SET status='scripting',stage='scripting' WHERE id=?").bind(job.jobId).run();
    await prepareJobNarration(env,job.agencyId,job.jobId,providers,{brand:JSON.parse(job.brand)});
    const realFetch=globalThis.fetch;globalThis.fetch=async()=>{throw Error('MAP_ALREADY_PREPARED');};
    try{const frozen=await prepareJobVideo(env,job.agencyId,job.jobId);
      assert.equal(frozen.manifest.map?.settings.zoomStart,12);assert.equal(frozen.manifest.map?.settings.zoomEnd,14.5);
      assert.equal(frozen.manifest.photoTimeline?.reduce((n,c)=>n+c.durationFrames,0),480);
      assert.equal(frozen.manifest.scenes.reduce((n,s)=>n+s.durationFrames,0),600);assert.equal(frozen.manifest.voiceEnabled,false);
    }finally{globalThis.fetch=realFetch;}
    await failGeneration(env.DB,job,'GENERATION_FAILED');
    await setVideoMapSettings(env.DB,'fixture-admin',DEFAULT_VIDEO_MAP,(await videoMapSettings(env.DB)).revision);
  });
  await t.test('URL importée, cache partagé et génération sans réglages clients',async()=>{
    const {job}=await create('default-map-url',{url:'https://www.iadfrance.fr/annonce/appartement-vente-3-pieces-lyon-55m2/r2125326'});
    const before=calls;assert.ok(await prepareDefaultGenerationMap(env,job,transport));assert.equal(calls,before);
    // Exercise the explicit-location branch with the same prepared plates, without a sixth billed fixture job.
    const map={position:'end' as const,durationSeconds:3,location:city,view:'satellite' as const,zoomStart:12,zoomEnd:14.5};
    const explicit={...job,defaultMap:null,input:JSON.stringify({listingId:job.listingId,durationSeconds:20,customization:{...defaultVideoCustomization(),map}})};
    const searchBefore=searches;assert.deepEqual(await prepareGenerationMap(env,explicit,transport),map);assert.equal(calls,before);assert.equal(searches,searchBefore);
    assert.deepEqual(await prepareGenerationMap(env,explicit,async()=>{throw Error('MAP_ALREADY_PREPARED');}),map);
    await failGeneration(env.DB,job,'GENERATION_FAILED');
  });
  await t.test('désactivation, carte personnalisée et timeline d’éditeur prioritaires',async()=>{
    const base=defaultVideoCustomization(),id='listing-default-map-manual';
    assert.equal(await generationMapDefault(env.DB,{listingId:id,customization:{...base,mapDisabled:true}}),null);
    assert.equal(await generationMapDefault(env.DB,{listingId:id,customization:{...base,map:{position:'end',durationSeconds:3,location:city}}}),null);
    assert.equal(await generationMapDefault(env.DB,{listingId:id,customization:{...base,editor:createEditorDocument([{sourceOrder:0},{sourceOrder:1},{sourceOrder:2}],{})}}),null);
    const custom:VideoCustomization={...base,map:{position:'end',durationSeconds:3,location:null,view:'plan',zoomStart:13,zoomEnd:15},mapAutomatic:true};
    const policy=JSON.parse((await generationMapDefault(env.DB,{listingId:id,customization:custom}))!);assert.equal(policy.position,'end');assert.equal(policy.view,'plan');assert.equal(policy.zoomEnd,15);
  });
  await t.test('ville absente ou service indisponible : omission conservée sans bloquer la vidéo',async()=>{
    for(const unavailable of [false,true]){
      const {job}=await create(unavailable?'default-map-offline':'default-map-unknown');
      assert.equal(await prepareDefaultGenerationMap(env,job,async()=>unavailable?new Response('unavailable',{status:503}):Response.json({features:[]})),null);
      assert.equal((await env.DB.prepare('SELECT reason FROM generation_map_resolutions WHERE job_id=?').bind(job.jobId).first<{reason:string}>())!.reason,unavailable?'map_unavailable':'ambiguous_location');
      assert.equal(await prepareDefaultGenerationMap(env,job,async()=>{throw Error('RETRY_MUST_NOT_CHANGE_TIMELINE');}),null);
      await failGeneration(env.DB,job,'GENERATION_FAILED');
    }
  });
  await t.test('essai anonyme : mêmes paramètres figés, toujours sans animations payantes',async()=>{
    const {session}=await createAnonymousSession(env.DB);
    const job=await admitAnonymous(env.DB,session,'anonymous-default-map-key',{url:'https://www.iadfrance.fr/annonce/appartement-vente-3-pieces-lyon-55m2/r2125326'},
      {ipHmac:'a'.repeat(64),turnstileHash:'b'.repeat(64)},'true');
    assert.equal(JSON.parse(job.defaultMap!).zoomStart,12);assert.equal(JSON.parse(job.defaultMap!).zoomEnd,14.5);
    assert.equal(job.animationsRequested,0);await failGeneration(env.DB,job,'GENERATION_FAILED');
  });
  assert.deepEqual(await env.DB.prepare('PRAGMA foreign_key_check').first(),null);
});
