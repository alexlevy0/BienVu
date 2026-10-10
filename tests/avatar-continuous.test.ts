import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFile,readdir} from 'node:fs/promises';
import sharp from 'sharp';
import {Miniflare,convertV4MiniflareOptions} from 'miniflare';
import {avatarCreditCost,generationCreditCost,defaultAvatarCustomization,defaultVideoCustomization,GenerationRequest,VideoManifest,
  AvatarLook,DEFAULT_AVATAR_SETTINGS,AvatarAudio,AvatarVideoAsset,VideoAsset,AVATAR_AUDIO_BYTES} from '../packages/contracts/src/index';
import {assembleNarrationWavs,measureVoiceWav,googleTts,frenchVoiceConfig} from '../packages/voice/src/index';
import {admitGeneration,findGeneration,generationView,saveAvatarLook,setAvatarSettings,creditBalance,creditHistory,jobAvatarTasks,failGeneration} from '../packages/db/src/index';
import {migrateNarrationProbe,seedNarrationFixture} from '../scripts/narration-fixtures';
import {toneFixture} from '../fixtures/voice';
import {videoFixture,videoReport} from '../fixtures/video';
import {prepareJobNarration} from '../apps/pipeline/src/narration';
import {prepareJobVideo} from '../apps/pipeline/src/video-manifest';
import {submitJobAvatars,pollJobAvatars} from '../apps/pipeline/src/avatars';
import {editExistingVideo,editorResources} from '../apps/web/lib/video-editor';
import {calculatePricing} from '../apps/web/lib/pricing-calculator';
import {defaultPricingSimulation} from '../packages/contracts/src/pricing-simulation';

const look=AvatarLook.parse({id:'continuous-avatar',name:'Présentatrice de recette',gender:'female',type:'studio_avatar',engines:['avatar_iii'],enabled:true,
  thumbnail:null,preview:null,transparentVerified:false,ownership:'public',updatedAt:new Date().toISOString()});
const avatar={...defaultAvatarCustomization(look.id),moments:'full' as const};
const customization={...defaultVideoCustomization(),avatar,voice:'fr-FR-Chirp3-HD-Aoede' as const,mapDisabled:true,
  narration:['Découvrez ce bien.','Une visite en images.','Les détails du bien.','Contactez votre agence.']};
test('Avatar continu : supplément confirmé selon 20/30/40 s et durées explicites',()=>{
  for(const [seconds,credits] of [[20,2],[30,3],[40,4]] as const){
    assert.equal(avatarCreditCost(avatar,seconds),credits);assert.equal(generationCreditCost(customization,seconds),1+credits);
    assert.equal(avatarCreditCost({...avatar,hidden:true},seconds),0);
  }
  assert.equal(avatarCreditCost(avatar,20.01),3);
  assert.throws(()=>avatarCreditCost(avatar,41));assert.throws(()=>avatarCreditCost(avatar,NaN));
  assert.equal(GenerationRequest.safeParse({url:'https://www.orpi.com/annonce-vente-maison-test/',customization}).success,false);
  for(const moment of ['intro','outro','both'] as const)assert.equal(avatarCreditCost({...avatar,moments:moment},40),1);
  const simulation=defaultPricingSimulation();simulation.market.eurPerUsd=1;
  simulation.profiles=[{...simulation.profiles[0],share:100,animations:0,durationSeconds:40,avatar:{seconds:8,engine:'avatar_iii',coverage:'full'}}];
  let report=calculatePricing(simulation);assert.equal(report.profiles[0].measures.credits,5);assert.ok(Math.abs(report.profiles[0].parts.avatar-.66)<1e-9);
  simulation.production.avatar={priceIII:.99,priceIV:4.83,mediaMB:4,reusePercent:100};report=calculatePricing(simulation);assert.equal(report.profiles[0].measures.credits,1);assert.equal(report.profiles[0].parts.avatar,0);
});
test('Assemblage WAV : voix complètes, pauses exactes, resampling, taille et absence de troncature',()=>{
  const clips=[0,120,240,360].map(startFrame=>({startFrame,bytes:toneFixture(1500)}));
  const assembled=assembleNarrationWavs(clips,1200);assert.equal(assembled.durationMs,40000);assert.equal(assembled.bytes.length,1920044);
  assert.ok(assembled.bytes.length<AVATAR_AUDIO_BYTES);assert.equal(assembled.sampleRate,24000);assert.equal(assembled.channels,1);
  const source=measureVoiceWav(clips[0].bytes),output=measureVoiceWav(assembled.bytes,40000);
  assert.deepEqual(assembled.bytes.slice(output.pcmOffset,output.pcmOffset+source.pcmBytes),clips[0].bytes.slice(source.pcmOffset,source.pcmOffset+source.pcmBytes));
  assert.ok(assembled.bytes.slice(output.pcmOffset+72000,output.pcmOffset+192000).every(n=>n===0),'Pause de 1,5 à 4 secondes conservée');
  assert.deepEqual(assembled.bytes,assembleNarrationWavs(clips,1200).bytes,'Hash audio reproductible pour le cache');
  const stereo=toneFixture(2000),stereoView=new DataView(stereo.buffer);
  stereoView.setUint16(22,2,true);stereoView.setUint32(24,48000,true);stereoView.setUint32(28,192000,true);stereoView.setUint16(32,4,true);
  for(let at=44;at<stereo.length;at+=4){stereoView.setInt16(at,1000,true);stereoView.setInt16(at+2,3000,true);}
  const resampled=assembleNarrationWavs([{...clips[0],bytes:stereo},...clips.slice(1)],1200),mixed=new DataView(resampled.bytes.buffer);
  assert.equal(measureVoiceWav(stereo).durationMs,500);
  assert.equal(mixed.getInt16(44+11999*2,true),2000,'48 kHz stéréo converti en 24 kHz mono sans décaler la piste');
  assert.equal(mixed.getInt16(44+12000*2,true),0,'La fin du WAV conserve la pause');
  assert.throws(()=>assembleNarrationWavs([{...clips[0],startFrame:0},{...clips[1],startFrame:1},...clips.slice(2)],1200));
  assert.throws(()=>assembleNarrationWavs([...clips.slice(0,3),{...clips[3],startFrame:1190}],1200));
});
test('Avatars continus D1/R2 : un appel, réservation exacte, restitution, cache et Éditeur',async t=>{
  const mf=new Miniflare(convertV4MiniflareOptions({modules:true,script:'export default {fetch(){return new Response("fixture")}}',compatibilityDate:'2026-09-27',d1Databases:['DB'],r2Buckets:['MEDIA']}));t.after(()=>mf.dispose());
  const env=await mf.getBindings<{DB:D1Database;MEDIA:R2Bucket}>();await migrateNarrationProbe(env.DB);
  const scope=await seedNarrationFixture(env.DB,'continuous',true),fixture=await videoFixture('paid'),at=new Date().toISOString();
  await env.DB.exec("UPDATE jobs SET status='failed',error_code='FIXTURE',lease_until=NULL; UPDATE allocations SET kind='paid',quota_limit=60; UPDATE generation_control SET enabled=1; UPDATE video_map_settings SET settings_json=json_set(settings_json,'$.enabled',0)");
  await env.DB.prepare('INSERT INTO generation_access VALUES(?,?,1)').bind(scope.agencyId,'allocation-continuous').run();
  await env.DB.prepare('INSERT INTO hosted_import_budget VALUES(?,0,9000,0)').bind(at.slice(0,7)).run();
  const listing=fixture.listing;listing.id='listing-continuous';listing.agencyId=scope.agencyId;
  for(const p of listing.photos){const bytes=await sharp(fixture.files.get(p.id)!).jpeg().toBuffer();Object.assign(p,{agencyId:scope.agencyId,listingId:listing.id,mime:'image/jpeg',sizeBytes:bytes.length,contentHash:createHash('sha256').update(bytes).digest('hex'),objectKey:`agencies/${scope.agencyId}/imports/${listing.id}/${p.id}.jpg`});await env.MEDIA.put(p.objectKey,bytes);}
  await env.DB.prepare('UPDATE listing_imports SET result_json=? WHERE id=?').bind(JSON.stringify(listing),listing.id).run();
  await saveAvatarLook(env.DB,'fixture-admin',look,{image:null,video:null});await setAvatarSettings(env.DB,'fixture-admin',{...DEFAULT_AVATAR_SETTINGS,enabled:true,defaultLookId:look.id},1);
  let toneMs=1500;
  const config=frenchVoiceConfig(customization.voice,'fixture'),tts=googleTts(config as Parameters<typeof googleTts>[0],async()=>'fixture-token-never-networked',{fetch:async()=>Response.json({audioContent:Buffer.from(toneFixture(toneMs)).toString('base64')})});
  const providers={mode:'mock' as const,script:{model:'gpt-5.4-mini',plan:async():Promise<never>=>{throw Error('NO_OPENAI_CALL');}},voice:{config,synthesize:tts.synthesize}};
  const durations=new Map<string,number>(),uploads:number[]=[],originalFetch=globalThis.fetch;let creates=0,uploadedDuration=0,providerFails=false;
  t.after(()=>{globalThis.fetch=originalFetch;});globalThis.fetch=async(input,options)=>{
    const path=new URL(String(input)).pathname;
    if(path==='/v3/users/me')return Response.json({data:{billing_type:'wallet',wallet:{remaining_balance:5,currency:'usd',auto_reload:{enabled:false}}}});
    if(path==='/v3/assets'){const file=(options!.body as FormData).get('file') as File;uploadedDuration=measureVoiceWav(new Uint8Array(await file.arrayBuffer()),40000).durationMs/1000;uploads.push(uploadedDuration);return Response.json({data:{asset_id:'audio-fixture'}});}
    if(path==='/v3/videos'){creates++;const id='video-fixture-'+creates;durations.set(id,uploadedDuration);return Response.json({data:{video_id:id}});}
    if(path.startsWith('/v3/videos/')){const id=path.split('/').at(-1)!;return Response.json({data:{id,status:providerFails?'failed':'completed',duration:durations.get(id),video_url:'https://files.heygen.ai/continuous.mp4'}});}
    if(String(input)==='https://files.heygen.ai/continuous.mp4')return new Response(new Uint8Array([0,0,0,24,102,116,121,112,1,2,3,4]));
    throw Error('UNEXPECTED_EXTERNAL_CALL');};
  const runtime={...env,HEYGEN_ENABLED:'true',HEYGEN_API_KEY:'fixture-key'};
  async function create(key:string,durationSeconds:20|30|40,settings=customization,now=Date.now()){const input={listingId:listing.id,durationSeconds,customization:settings},row=await admitGeneration(env.DB,scope.agencyId,key,input,'true',now);assert.equal(generationView(row).creditsReserved,1+durationSeconds/10);
    assert.equal((await admitGeneration(env.DB,scope.agencyId,key,input,'true')).jobId,row.jobId);await env.DB.prepare("UPDATE jobs SET status='scripting',stage='scripting' WHERE id=?").bind(row.jobId).run();await prepareJobNarration(env,scope.agencyId,row.jobId,providers);return row;}
  async function ready(row:Awaited<ReturnType<typeof create>>){const frozen=await prepareJobVideo(env,scope.agencyId,row.jobId),report=videoReport(frozen.hash,frozen.manifest);
    await env.DB.prepare('INSERT INTO generation_artifacts VALUES(?,?,?,?)').bind(row.jobId,`agencies/${scope.agencyId}/jobs/${row.jobId}/master.mp4`,JSON.stringify(report),new Date().toISOString()).run();await env.DB.prepare("UPDATE jobs SET status='ready',stage='rendering',lease_until=NULL WHERE id=?").bind(row.jobId).run();return frozen;}
  let fullJob:Awaited<ReturnType<typeof create>>|undefined;
  for(const seconds of [20,30,40] as const){const row=await create('continuous-fixture-key-'+seconds,seconds),before=creates;
    await submitJobAvatars(runtime,scope.agencyId,row.jobId);await submitJobAvatars(runtime,scope.agencyId,row.jobId);assert.equal(creates,before+1);assert.equal((await pollJobAvatars(runtime,scope.agencyId,row.jobId)).ready,1);
    const tasks=await jobAvatarTasks(env.DB,scope.agencyId,row.jobId);assert.equal(tasks.length,1);assert.equal(tasks[0].moment,'full');assert.equal(AvatarAudio.parse(JSON.parse(tasks[0].audio)).durationMs,seconds*1000);
    const frozen=await ready(row),clip=frozen.manifest.avatar!.clips[0];assert.equal(clip.startFrame,0);assert.equal(clip.durationFrames,seconds*30);assert.equal(clip.sourceAudio!.sources.length,4);
    assert.equal(generationView((await findGeneration(env.DB,scope.agencyId,row.jobId))!).avatar!.creditsUsed,seconds/10);assert.equal((await creditHistory(env.DB,scope.agencyId)).entries[0].used,1+seconds/10);
    assert.equal(VideoManifest.safeParse({...frozen.manifest,avatar:{settings:avatar,clips:[{...clip,sourceAudio:{...clip.sourceAudio!,sources:clip.sourceAudio!.sources.map((s,i)=>i?{...s,audioSha256:'b'.repeat(64)}:s)}}]}}).success,false);
    if(seconds===40){fullJob=row;assert.equal(AvatarVideoAsset.safeParse({...clip.asset,sizeBytes:20*1024*1024,durationMs:40053}).success,true);assert.equal(VideoAsset.safeParse({...clip.asset,sizeBytes:20*1024*1024}).success,false);}
  }
  assert.deepEqual(uploads,[20,30,40]);assert.ok(fullJob);
  const copied=await editExistingVideo(env,scope.agencyId,fullJob.jobId,'continuous-editor-copy-001',AbortSignal.timeout(20000)),resources=await editorResources(env.DB,scope.agencyId,copied.id);
  assert.equal(resources.avatars?.[0].moment,'full');assert.equal(resources.avatars?.[0].durationFrames,1200);assert.equal(resources.cost,5);
  await assert.rejects(env.DB.prepare('UPDATE generation_runs SET avatar_extra_credits=0 WHERE job_id=?').bind(fullJob.jobId).run(),/CREDIT_PRICING_IMMUTABLE/);
  const reuse=await create('continuous-reuse-fixture',40),before=creates;await submitJobAvatars(runtime,scope.agencyId,reuse.jobId);assert.equal(creates,before);assert.equal((await jobAvatarTasks(env.DB,scope.agencyId,reuse.jobId))[0].reused,1);
  await ready(reuse);const reused=generationView((await findGeneration(env.DB,scope.agencyId,reuse.jobId))!);assert.equal(reused.creditsUsed,1);assert.equal(reused.creditsRefunded,4);
  // Different voice bytes defeat the cache; failure restores all four units.
  toneMs=1550;const failure=await create('continuous-failed-fixture',40,{...customization,narration:['Une maison à découvrir.',...customization.narration.slice(1)]});
  providerFails=true;await submitJobAvatars(runtime,scope.agencyId,failure.jobId);await pollJobAvatars(runtime,scope.agencyId,failure.jobId);await failGeneration(env.DB,failure,'GENERATION_FAILED');
  const failed=generationView((await findGeneration(env.DB,scope.agencyId,failure.jobId))!);assert.equal(failed.creditsUsed,0);assert.equal(failed.creditsRefunded,5);
  assert.equal((await jobAvatarTasks(env.DB,scope.agencyId,failure.jobId))[0].errorCode,'AVATAR_PROVIDER_FAILED');
  // Monthly and purchased credits fund the same avatar reservation atomically.
  await env.DB.prepare('UPDATE allocations SET quota_limit=consumed+2 WHERE id=?').bind('allocation-continuous').run();
  const jobCount=(await env.DB.prepare('SELECT count(*) n FROM generation_runs').first<{n:number}>())!.n,createsBefore=creates;
  await assert.rejects(admitGeneration(env.DB,scope.agencyId,'continuous-insufficient-40',{listingId:listing.id,durationSeconds:40,customization},'true'),/QUOTA_EXHAUSTED/);
  assert.equal((await env.DB.prepare('SELECT count(*) n FROM generation_runs').first<{n:number}>())!.n,jobCount);assert.equal(creates,createsBefore);
  const policy=(await env.DB.prepare('SELECT mode FROM credit_payment_policy WHERE id=1').first<{mode:string}>())!.mode;
  await env.DB.prepare("INSERT INTO allocations(id,agency_id,kind,period_key,quota_limit,valid_from,valid_until) VALUES('continuous-purchased',?,'paid','topup:continuous',5,?,?)")
    .bind(scope.agencyId,at,new Date(Date.now()+7*86400000).toISOString()).run();
  await env.DB.prepare("INSERT INTO financial_receipts(id,agency_id,mode,kind,allocation_id,credits,gross_cents,revenue_ht_cents,currency,customer_id,paid_at) VALUES('continuous-receipt',?,?,'topup','continuous-purchased',5,350,350,'eur','fixture-customer',?)")
    .bind(scope.agencyId,policy,at).run();
  await env.DB.prepare("INSERT INTO credit_topups VALUES('continuous-checkout',?,?,'pack10','continuous-purchased','continuous-receipt',?)").bind(scope.agencyId,policy,at).run();
  // Six independent scenarios span two days, keeping the existing daily guard.
  t.mock.timers.enable({apis:['Date'],now:Date.now()+86400000});
  toneMs=1700;providerFails=false;const renderFailure=await create('continuous-render-failed-40',40,{...customization,narration:['Voici une nouvelle visite.',...customization.narration.slice(1)]});
  assert.deepEqual((await env.DB.prepare('SELECT allocation_id allocation,amount FROM avatar_credit_parts WHERE job_id=? ORDER BY priority').bind(renderFailure.jobId).all()).results,
    [{allocation:'allocation-continuous',amount:1},{allocation:'continuous-purchased',amount:3}]);
  await submitJobAvatars(runtime,scope.agencyId,renderFailure.jobId);await pollJobAvatars(runtime,scope.agencyId,renderFailure.jobId);
  await failGeneration(env.DB,renderFailure,'GENERATION_FAILED');await failGeneration(env.DB,renderFailure,'GENERATION_FAILED');
  const settled=generationView((await findGeneration(env.DB,scope.agencyId,renderFailure.jobId))!);assert.equal(settled.creditsUsed,4);assert.equal(settled.creditsRefunded,1);
  assert.deepEqual(await env.DB.prepare("SELECT reserved,consumed FROM allocations WHERE id='continuous-purchased'").first(),{reserved:0,consumed:3});
  assert.equal((await creditBalance(env.DB,scope.agencyId)).reserved,0);assert.deepEqual((await env.DB.prepare('PRAGMA foreign_key_check').all()).results,[]);
});

test('Migration avatar continu : clips historiques et crédits déjà réglés identiques',async t=>{
  const mf=new Miniflare(convertV4MiniflareOptions({modules:true,script:'export default {fetch(){return new Response("fixture")}}',compatibilityDate:'2026-09-27',d1Databases:['DB']}));t.after(()=>mf.dispose());
  const db=await mf.getD1Database('DB'),directory=new URL('../packages/db/migrations/',import.meta.url),migration=async(name:string)=>db.exec((await readFile(new URL(name,directory),'utf8')).replace(/^--.*$/gm,'').replace(/\n/g,' '));
  for(const name of (await readdir(directory)).filter(n=>n.endsWith('.sql')&&n<'0061').sort())await migration(name);
  const seed=await seedNarrationFixture(db,'continuous-migration',true),at=new Date().toISOString(),until=new Date(Date.now()+86400000).toISOString();
  await db.exec("UPDATE jobs SET status='failed',error_code='FIXTURE',lease_until=NULL; UPDATE allocations SET kind='paid',quota_limit=40; UPDATE generation_control SET enabled=1; UPDATE avatar_settings SET settings_json=json_set(settings_json,'$.enabled',1)");
  await db.prepare('INSERT INTO generation_access VALUES(?,?,1)').bind(seed.agencyId,'allocation-continuous-migration').run();await db.prepare('INSERT INTO hosted_import_budget VALUES(?,0,9000,0)').bind(at.slice(0,7)).run();
  const input={listingId:'listing-continuous-migration',durationSeconds:20,customization:{...customization,avatar:{...avatar,moments:'intro'}}};
  await db.prepare(`INSERT INTO generation_runs(job_id,agency_id,allocation_id,reservation_id,idempotency_key,input_hash,input_json,brand_json,created_at,deadline,expires_at,month,credit_version,credits_total,animations_requested,reuse_pricing,animations_reused,animation_reuses_json,funding_version,selected_voice,avatar_credits,avatar_config_json)
    VALUES('legacy-avatar-job',?,?,'legacy-avatar-reservation','legacy-avatar-idempotency',?,?, '{}',?,?,?,?,1,1,0,1,0,'[]',1,'fish-manon',1,'{}')`)
    .bind(seed.agencyId,'allocation-continuous-migration','a'.repeat(64),JSON.stringify(input),at,until,until,at.slice(0,7)).run();
  await db.prepare(`INSERT INTO avatar_tasks(id,agency_id,job_id,moment,cache_key,audio_json,start_frame,state,engine,mode,reused,reserved_micros,created_at,updated_at)
    VALUES('legacy-avatar-task',?,'legacy-avatar-job','intro',?,'{}',0,'ready','avatar_iii','mock',0,100000,?,?)`).bind(seed.agencyId,'b'.repeat(64),at,at).run();
  await db.prepare("UPDATE jobs SET status='failed',error_code='FIXTURE',lease_until=NULL WHERE id='legacy-avatar-job'").run();
  const tables=['avatar_credit_parts','avatar_tasks','avatar_library','avatar_settings','avatar_audit','allocations','financial_expenses','financial_expense_allocations','finance_video_summary'];
  const snapshot=()=>Promise.all(tables.map(async name=>(await db.prepare(`SELECT * FROM ${name}`).all()).results));
  const before=await snapshot();assert.equal((before[0][0] as {consumed:number}).consumed,1);
  await migration('0061_full_length_avatars.sql');assert.deepEqual(await snapshot(),before);assert.deepEqual((await db.prepare('PRAGMA foreign_key_check').all()).results,[]);
  assert.equal((await db.prepare("SELECT avatar_extra_credits AS n FROM generation_runs WHERE job_id='legacy-avatar-job'").first<{n:number}>())!.n,0);
  await assert.rejects(db.prepare("UPDATE avatar_credit_parts SET consumed=0 WHERE job_id='legacy-avatar-job'").run(),/CREDIT_PRICING_IMMUTABLE/);
});
