import {test} from 'node:test';
import assert from 'node:assert/strict';
import {Miniflare,convertV4MiniflareOptions} from 'miniflare';
import {GenerationRequest,defaultVideoCustomization,VideoManifest,videoAssets,videoPhotoTimeline} from '../packages/contracts/src/index';
import {findImport,admitGeneration,failGeneration,findGeneration,adminVideoDetail} from '../packages/db/src/index';
import {migrateNarrationProbe,seedNarrationFixture} from '../scripts/narration-fixtures';
import {videoFixture} from '../fixtures/video';
import {toneFixture} from '../fixtures/voice';
import {googleTts} from '../packages/voice/src/index';
import {GoogleVoiceConfig} from '../packages/contracts/src/voice';
import {DEFAULT_SCRIPT_MODEL} from '../packages/narration/src/index';
import {prepareJobNarration} from '../apps/pipeline/src/narration';
import {prepareJobVideo} from '../apps/pipeline/src/video-manifest';
import {prepareJobAnimations,animationIndices} from '../apps/pipeline/src/photo-animations';
import {allowedRunwayOutput,downloadRunwayOutput,runwayProvider,RUNWAY_PROMPT,type AnimationProvider} from '../apps/pipeline/src/runway';
import {cameraMotion} from '../packages/video/src/camera-motion';

const clip=new Uint8Array(512);clip.set(new TextEncoder().encode('ftyp'),4);
const taskId='11111111-1111-4111-8111-111111111111';
test('animation : coûts bornés, URL privées refusées et caméra sans bords vides',async()=>{
  const settings=defaultVideoCustomization();for(const count of [-1,3,1.5])assert.equal(GenerationRequest.safeParse({listingId:'listing-test',customization:{...settings,runwayClips:count}}).success,false);
  for(const url of ['https://127.0.0.1/clip.mp4','https://evil.example/video','https://cdn.cloudfront.net:8443/a','http://cdn.cloudfront.net/a','https://cloudfront.net.evil.example/a'])assert.throws(()=>allowedRunwayOutput(url));
  assert.equal(allowedRunwayOutput('https://cdn.cloudfront.net/video.mp4?token=private').hostname,'cdn.cloudfront.net');
  await assert.rejects(downloadRunwayOutput('https://cdn.cloudfront.net/a',AbortSignal.timeout(1000),async(_url,options)=>{
    assert.equal(options?.redirect,'manual');return new Response(null,{status:302,headers:{location:'https://127.0.0.1/private'}});
  }),/OUTPUT_REDIRECT/);
  await assert.rejects(downloadRunwayOutput('https://cdn.cloudfront.net/a',AbortSignal.timeout(1000),async()=>new Response(clip,{headers:{'content-length':'20000000'}})),/TOO_LARGE/);
  await assert.rejects(downloadRunwayOutput('https://cdn.cloudfront.net/a',AbortSignal.timeout(1000),async()=>new Response('invalid video')),/INVALID/);
  assert.deepEqual(animationIndices(8,2),[0,4]);assert.deepEqual(animationIndices(3,2),[0,1]);
  const gallery=Array.from({length:12},(_,i)=>({id:`photo-${i}`})),timeline=videoPhotoTimeline(gallery,600,['photo-0','photo-6']);
  assert.equal(timeline.reduce((n,p)=>n+p.durationFrames,0),600);assert.equal(timeline[0].durationFrames,150);assert.equal(timeline[6].durationFrames,150);assert.ok(timeline.every(p=>p.durationFrames>=30));
  for(const cinematic of [false,true])for(let index=0;index<12;index++)for(let frame=-30;frame<=330;frame++){
    const m=cameraMotion(frame,300,index,true,cinematic);assert.ok(Math.abs(m.x)<(m.scale-1)*1080/2);assert.ok(Math.abs(m.y)<(m.scale-1)*1920/2);
  }
  assert.deepEqual(cameraMotion(120,300,2,false),{scale:1,x:0,y:0});
});

async function setup(t:{after(fn:()=>Promise<void>):void},label:string,clips:number|number[]=2){
  const mf=new Miniflare(convertV4MiniflareOptions({modules:true,script:'export default {fetch(){return new Response("fixture")}}',compatibilityDate:'2026-09-27',d1Databases:['DB'],r2Buckets:['MEDIA']}));
  t.after(()=>mf.dispose());const env=await mf.getBindings<{DB:D1Database;MEDIA:R2Bucket}>();await migrateNarrationProbe(env.DB);
  const seed=await seedNarrationFixture(env.DB,label,true);await env.DB.prepare("UPDATE jobs SET status='failed',error_code='FIXTURE',lease_until=NULL WHERE id=?").bind(seed.jobId).run();
  const month=new Date().toISOString().slice(0,7),at=new Date().toISOString();
  await env.DB.prepare('INSERT INTO hosted_import_budget(month,baseline_cents,ceiling_cents,paused) VALUES(?,0,9000,0)').bind(month).run();
  await env.DB.exec("UPDATE generation_control SET enabled=1; UPDATE allocations SET kind='paid',quota_limit=40");await env.DB.prepare('INSERT INTO generation_access(agency_id,allocation_id,enabled) VALUES(?,?,1)').bind(seed.agencyId,`allocation-${label}`).run();
  const listing=JSON.parse((await findImport(env.DB,seed.agencyId,`listing-${label}`))!.result!),fixture=await videoFixture('paid');
  for(const [i,p] of listing.photos.entries()){const asset=fixture.manifest.photos[i];Object.assign(p,{contentHash:asset.sha256,sizeBytes:asset.sizeBytes,width:asset.width,height:asset.height});await env.MEDIA.put(p.objectKey,fixture.files.get(asset.id)!);}
  await env.DB.prepare('UPDATE listing_imports SET result_json=? WHERE id=?').bind(JSON.stringify(listing),listing.id).run();
  const lines=['Découvrez cet appartement à Lyon.','Son prix et sa surface sont présentés dans cette annonce.','La visite se poursuit en images.','Contactez votre agence pour en savoir plus.'];
  const job=await admitGeneration(env.DB,seed.agencyId,'runway-fixture-key-001',{listingId:listing.id,customization:{...defaultVideoCustomization(),...(Array.isArray(clips)?{runwayPhotos:clips}:{runwayClips:clips}),narration:lines}},'true');
  await env.DB.prepare("UPDATE jobs SET status='scripting',stage='scripting',listing_id=? WHERE id=?").bind(listing.id,job.jobId).run();
  const config=GoogleVoiceConfig.parse({projectId:'runway-fixture',voice:'fr-FR-Chirp3-HD-Aoede'});
  const google=googleTts(config,async()=> 'fixture-token-never-networked',{fetch:async()=>Response.json({audioContent:Buffer.from(toneFixture(5000)).toString('base64')})});
  await prepareJobNarration(env,seed.agencyId,job.jobId,{mode:'mock',script:{model:DEFAULT_SCRIPT_MODEL,plan:async()=>{throw Error('NO_TEXT_CALL');}},voice:{config,synthesize:google.synthesize}});
  return {env,job: (await findGeneration(env.DB,seed.agencyId,job.jobId))!,month,at,listing};
}
test('sélection par photo : trois animations, ordre exact et manifeste sans limite historique de deux',async t=>{
  const {env,job,listing}=await setup(t,'runway-three',[2,0,1]);
  let calls=0;const provider:AnimationProvider={mode:'mock',generate:async(_bytes,_mime,checkpoint)=>{calls++;await checkpoint(taskId);return clip;},resume:async()=>{throw Error('NO_RESUME');}};
  assert.deepEqual(await prepareJobAnimations(env,job.agencyId,job.jobId,provider),{requested:3,ready:3});
  const rows=(await env.DB.prepare('SELECT photo_id FROM photo_animations ORDER BY slot').all<{photo_id:string}>()).results;
  assert.deepEqual(rows.map(r=>r.photo_id),[listing.photos[2].id,listing.photos[0].id,listing.photos[1].id]);
  await prepareJobAnimations(env,job.agencyId,job.jobId,provider);assert.equal(calls,3);
  const prepared=await prepareJobVideo(env,job.agencyId,job.jobId);
  assert.equal(prepared.manifest.photoAnimations?.length,3);
  assert.equal(prepared.manifest.photoTimeline?.reduce((sum,p)=>sum+p.durationFrames,0),prepared.manifest.scenes.reduce((sum,s)=>sum+s.durationFrames,0));
});
test('Runway : images exactes, reprise sans deuxième appel, manifeste privé et coût prépayé unique',async t=>{
  const {env,job,month,at,listing}=await setup(t,'runway-success');
  await env.DB.prepare('INSERT INTO runway_budget(month,prepaid_cents,api_credits,paused,created_at) VALUES(?,1000,1000,0,?)').bind(month,at).run();
  let calls=0;const motions:string[]=[];const provider:AnimationProvider={mode:'real',generate:async(bytes,_mime,checkpoint,_signal,motion)=>{assert.ok(bytes.length>512);motions.push(motion!);calls++;await checkpoint(taskId);return clip;},resume:async()=>{throw Error('RESUME_NOT_EXPECTED');}};
  assert.deepEqual(await prepareJobAnimations(env,job.agencyId,job.jobId,provider),{requested:2,ready:2});assert.equal(calls,2);
  assert.deepEqual(motions,['dolly','slide']);
  await prepareJobAnimations(env,job.agencyId,job.jobId,provider);assert.equal(calls,2);
  const before=await env.DB.prepare('SELECT baseline_cents n FROM hosted_import_budget').first<{n:number}>();assert.equal(before?.n,1120);
  assert.equal((await env.DB.prepare('SELECT sum(reserved_cents) n FROM photo_animations').first<{n:number}>())?.n,70); // Included in purchased credits, not another +70 globally.
  const frozen=await prepareJobVideo(env,job.agencyId,job.jobId);assert.equal(frozen.manifest.photoAnimations?.length,2);assert.equal(videoAssets(frozen.manifest).filter(a=>a.mime==='video/mp4').length,2);
  assert.equal(frozen.manifest.visualStyle,'cinematic');
  assert.deepEqual(frozen.manifest.photoAnimations?.map(a=>a.photoAssetId),[listing.photos[0].id,listing.photos[1].id]);
  const invalid=structuredClone(frozen.manifest);invalid.photoAnimations![0].sourceSha256='0'.repeat(64);assert.equal(VideoManifest.safeParse(invalid).success,false);
  assert.equal((await prepareJobVideo(env,job.agencyId,job.jobId)).hash,frozen.hash);
  assert.equal((await adminVideoDetail(env.DB,job.jobId))?.animations?.length,2);
  await assert.rejects(prepareJobAnimations(env,'foreign-agency',job.jobId,provider),/INACTIVE/);
});
test('Runway : plafond, désactivation et réponse perdue conservent les photos sans nouvel appel',async t=>{
  const {env,job,month,at}=await setup(t,'runway-budget');let calls=0;
  const provider:AnimationProvider={mode:'real',generate:async(_bytes,_mime,checkpoint)=>{calls++;await checkpoint(taskId);return clip;},resume:async()=>clip};
  assert.equal((await prepareJobAnimations(env,job.agencyId,job.jobId)).reason,'RUNWAY_DISABLED');
  assert.equal((await prepareJobAnimations({...env,RUNWAY_TEST_AGENCY_ID:'another-agency'},job.agencyId,job.jobId,provider)).reason,'RUNWAY_DISABLED');
  assert.equal((await env.DB.prepare('SELECT count(*) n FROM photo_animations').first<{n:number}>())?.n,0);assert.equal(calls,0);
  assert.equal((await prepareJobAnimations(env,job.agencyId,job.jobId,provider)).ready,0);assert.equal(calls,0);
  await env.DB.prepare('INSERT INTO runway_budget(month,prepaid_cents,api_credits,paused,created_at) VALUES(?,35,25,0,?)').bind(month,at).run();
  assert.equal((await prepareJobAnimations(env,job.agencyId,job.jobId,provider)).ready,1);assert.equal(calls,1);
  // Simulate response lost after submission. Recovery reads the existing task.
  await env.DB.prepare("UPDATE photo_animations SET state='submitted',animation_json=NULL WHERE job_id=?").bind(job.jobId).run();
  assert.equal((await prepareJobAnimations(env,job.agencyId,job.jobId,provider)).ready,1);assert.equal(calls,1);
  await env.DB.prepare("UPDATE photo_animations SET state='submitting',task_id=NULL,animation_json=NULL,updated_at=? WHERE job_id=?").bind(new Date(Date.now()-181_000).toISOString(),job.jobId).run();
  await prepareJobAnimations(env,job.agencyId,job.jobId,provider);assert.equal(calls,1);
  assert.equal((await env.DB.prepare('SELECT state FROM photo_animations').first<{state:string}>())?.state,'uncertain');
  const manifest=await prepareJobVideo(env,job.agencyId,job.jobId);assert.equal(manifest.manifest.photoAnimations,undefined);assert.equal(manifest.manifest.photos.length,3);
  await assert.rejects(env.DB.prepare('UPDATE runway_budget SET prepaid_cents=1000').run(),/IMMUTABLE/);
  await failGeneration(env.DB,job,'GENERATION_FAILED');await assert.rejects(prepareJobAnimations(env,job.agencyId,job.jobId,provider),/INACTIVE/);
});
test('Runway : concurrence conserve le checkpoint actif, photo corrompue refusée avant fournisseur',async t=>{
  const {env,job,month,at,listing}=await setup(t,'runway-concurrent',1);
  await env.DB.prepare('INSERT INTO runway_budget(month,prepaid_cents,api_credits,paused,created_at) VALUES(?,1000,1000,0,?)').bind(month,at).run();
  let entered!:()=>void,release!:()=>void,calls=0;
  const waiting=new Promise<void>(resolve=>{entered=resolve;}),gate=new Promise<void>(resolve=>{release=resolve;});
  const provider:AnimationProvider={mode:'real',generate:async(_bytes,_mime,checkpoint)=>{calls++;entered();await gate;await checkpoint(taskId);return clip;},resume:async()=>{throw Error('NO_RESUME');}};
  const first=prepareJobAnimations(env,job.agencyId,job.jobId,provider);await waiting;
  assert.equal((await prepareJobAnimations(env,job.agencyId,job.jobId,provider)).ready,0);
  assert.equal((await env.DB.prepare('SELECT state FROM photo_animations').first<{state:string}>())?.state,'submitting');
  release();assert.equal((await first).ready,1);assert.equal(calls,1);
  // Corruption in private storage must never be sent to the provider.
  await env.DB.prepare('DELETE FROM photo_animations WHERE job_id=?').bind(job.jobId).run();
  await env.MEDIA.put(listing.photos[0].objectKey,new Uint8Array(listing.photos[0].sizeBytes));
  assert.equal((await prepareJobAnimations(env,job.agencyId,job.jobId,provider)).ready,0);assert.equal(calls,1);
  assert.equal((await env.DB.prepare('SELECT error_code code FROM photo_animations').first<{code:string}>())?.code,'RUNWAY_INPUT_INVALID');
});
test('Runway : une recette isolée consomme la même enveloppe prépayée',async t=>{
  const {env,job,month,at}=await setup(t,'runway-external',1);
  await env.DB.prepare('INSERT INTO runway_budget(month,prepaid_cents,api_credits,paused,created_at) VALUES(?,35,25,0,?)').bind(month,at).run();
  await env.DB.prepare("INSERT INTO runway_external_verifications(id,month,credits,reserved_cents,state,created_at,updated_at) VALUES('isolated-recipe',?,25,35,'reserved',?,?)").bind(month,at,at).run();
  let calls=0;const provider:AnimationProvider={mode:'real',generate:async()=>{calls++;return clip;},resume:async()=>clip};
  assert.equal((await prepareJobAnimations(env,job.agencyId,job.jobId,provider)).ready,0);assert.equal(calls,0);
  await assert.rejects(env.DB.prepare("UPDATE runway_external_verifications SET reserved_cents=0 WHERE id='isolated-recipe'").run(),/IMMUTABLE/);
  await assert.rejects(env.DB.prepare("INSERT INTO runway_external_verifications(id,month,credits,reserved_cents,state,created_at,updated_at) VALUES('another-recipe',?,25,35,'reserved',?,?)").bind(month,at,at).run(),/BUDGET_LIMIT/);
});
test('SDK Runway : un HTTP 500 à la création ne déclenche aucun nouvel envoi',async()=>{
  let creates=0;
  const provider=runwayProvider('fixture-secret-never-networked',async(input)=>{
    const url=new URL(typeof input==='string'?input:input instanceof URL?input.href:input.url);
    if(url.pathname==='/v1/uploads')return Response.json({runwayUri:'runway://fixture',uploadUrl:'https://upload.runwayml.com/fixture',fields:{}});
    if(url.pathname==='/fixture')return new Response(null,{status:204});
    if(url.pathname==='/v1/image_to_video'){creates++;return Response.json({error:'fixture-provider-error'},{status:500});}
    throw Error('UNEXPECTED_NETWORK');
  });
  await assert.rejects(provider.generate(new Uint8Array(1024),'image/jpeg',async()=>{throw Error('NO_SUCCESS_CHECKPOINT');},AbortSignal.timeout(20_000)));
  assert.equal(creates,1);
});
test('SDK Runway réel, transport fixture : upload privé, contrat exact, tâche persistée avant lecture',async()=>{
  for(const aspectRatio of ['9:16','16:9'] as const){
  const paths:string[]=[],checkpoints:string[]=[];
  const provider=runwayProvider('fixture-secret-never-networked',async(input,init)=>{
    const url=new URL(typeof input==='string'?input:input instanceof URL?input.href:input.url);paths.push(url.pathname);
    if(url.pathname==='/v1/uploads')return Response.json({runwayUri:'runway://fixture-upload-token',uploadUrl:'https://upload.runwayml.com/upload-fixture',fields:{}});
    if(url.pathname==='/upload-fixture'){assert.equal(new Headers(init?.headers).has('authorization'),false);assert.ok(init?.body instanceof FormData);return new Response(null,{status:204});}
    if(url.pathname==='/v1/image_to_video'){
      assert.deepEqual(JSON.parse(String(init?.body)),{model:'gen4_turbo',promptImage:'runway://fixture-upload-token',promptText:RUNWAY_PROMPT,ratio:aspectRatio==='16:9'?'1280:720':'720:1280',duration:5});return Response.json({id:taskId});}
    if(url.pathname.startsWith('/v1/tasks/')){assert.deepEqual(checkpoints,[taskId]);return Response.json({id:taskId,status:'SUCCEEDED',createdAt:new Date().toISOString(),output:['https://cdn.cloudfront.net/video.mp4']});}
    if(url.pathname==='/video.mp4')return new Response(clip,{headers:{'Content-Type':'video/mp4'}});
    throw Error('UNEXPECTED_NETWORK');
  });
  assert.deepEqual(await provider.generate(new Uint8Array(1024),'image/jpeg',async id=>{checkpoints.push(id);},AbortSignal.timeout(20_000),'dolly',aspectRatio),clip);
  assert.equal(paths.filter(p=>p==='/v1/image_to_video').length,1);
  }
});
