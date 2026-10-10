import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile,readdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import sharp from 'sharp';
import {Miniflare,convertV4MiniflareOptions} from 'miniflare';
import {AvatarLook,DEFAULT_AVATAR_SETTINGS,defaultAvatarCustomization,avatarCreditCost,generationCreditCost,defaultVideoCustomization,
  avatarVoiceWarning,voiceGender,VideoManifest,GenerationRequest,cartesiaParisianVoices,editorCanReuseVoice} from '../packages/contracts/src/index';
import {heygenClient,AvatarFailure,verifyHeygenSignature,downloadHeygenMedia} from '../packages/avatars/src/index';
import {admitGeneration,findGeneration,generationView,failGeneration,avatarSettings,setAvatarSettings,saveAvatarLook,jobAvatarTasks,creditBalance,creditHistory,trialInput} from '../packages/db/src/index';
import {migrateNarrationProbe,seedNarrationFixture} from '../scripts/narration-fixtures';
import {videoFixture,videoReport} from '../fixtures/video';
import {toneFixture} from '../fixtures/voice';
import {googleTts,frenchVoiceConfig} from '../packages/voice/src/index';
import {prepareJobNarration} from '../apps/pipeline/src/narration';
import {prepareJobVideo} from '../apps/pipeline/src/video-manifest';
import {submitJobAvatars,pollJobAvatars,avatarCacheKey} from '../apps/pipeline/src/avatars';
import {calculatePricing} from '../apps/web/lib/pricing-calculator';
import {defaultPricingSimulation} from '../packages/contracts/src/pricing-simulation';
import {editExistingVideo,editorResources,snapshotEditorExport} from '../apps/web/lib/video-editor';
import {editorVoicePreview} from '../apps/web/lib/editor-voice';

const look=AvatarLook.parse({id:'fixture-avatar',name:'Présentatrice de recette',gender:'female',type:'studio_avatar',engines:['avatar_iii','avatar_iv'],enabled:true,
  thumbnail:null,preview:null,transparentVerified:false,ownership:'public',updatedAt:new Date().toISOString()});
const avatar=defaultAvatarCustomization(look.id),customization={...defaultVideoCustomization(),avatar,voice:'fr-FR-Chirp3-HD-Aoede' as const,mapDisabled:true,
  narration:['Découvrez ce bien.','Une visite en images.','Les détails du bien.','Contactez votre agence.']};
test('Avatar facultatif : supplément unique de 1 crédit et alerte symétrique sans inférence',()=>{
  assert.equal(avatarCreditCost(),0);assert.equal(generationCreditCost(),1);
  for(const engine of ['avatar_iii','avatar_iv'] as const)for(const moments of ['intro','outro','both'] as const){assert.equal(avatarCreditCost({...avatar,engine,moments}),1);assert.equal(generationCreditCost({...customization,avatar:{...avatar,engine,moments}}),2);}
  assert.equal(avatarCreditCost({...avatar,hidden:true}),0);
  assert.match(avatarVoiceWarning('fr-FR-Chirp3-HD-Aoede','male')!,/féminine.*masculin/);
  assert.match(avatarVoiceWarning('fr-FR-Chirp3-HD-Charon','female')!,/masculine.*féminin/);
  assert.equal(avatarVoiceWarning('fish-camille','male'),null);assert.equal(voiceGender('unknown-voice'), 'unknown');
  assert.equal(avatarVoiceWarning('fr-FR-Chirp3-HD-Aoede','female'),null);
  assert.equal(avatarVoiceWarning(cartesiaParisianVoices[0].id,'male')!==null,true);
  assert.equal(GenerationRequest.safeParse({listingId:'listing-test',voiceEnabled:false,customization}).success,false);
  assert.throws(()=>trialInput({listingId:'listing-test',customization}),/AVATAR_LOGIN_REQUIRED/);
});
test('Client HeyGen : audio existant, moteur explicite, idempotence, secrets serveur et sortie incertaine',async()=>{
  const requests:{url:string;init:RequestInit}[]=[],client=heygenClient('fixture-key',async(url,init)=>{requests.push({url:String(url),init:init!});return Response.json({data:{video_id:'v_fixture',status:'waiting'}});});
  assert.equal(await client.create({id:'task-fixture',lookId:look.id,engine:'avatar_iii',audioId:'a_fixture',transparent:false}),'v_fixture');
  const call=requests[0],body=JSON.parse(call.init.body as string);assert.equal(call.url,'https://api.heygen.com/v3/videos');
  assert.equal(body.audio_asset_id,'a_fixture');assert.equal(body.engine.type,'avatar_iii');assert.equal(body.script,undefined);assert.equal(body.voice_id,undefined);
  assert.equal((call.init.headers as Record<string,string>)['Idempotency-Key'],'bienvu-avatar:task-fixture');
  assert.equal(body.resolution,'720p');assert.equal(body.aspect_ratio,'9:16');
  let count=0;const uncertain=heygenClient('fixture-key',async()=>{count++;throw Error('Connection lost');});
  await assert.rejects(uncertain.create({id:'task-fixture',lookId:look.id,engine:'avatar_iii',audioId:'a_fixture',transparent:false}),e=>e instanceof AvatarFailure&&e.uncertain);assert.equal(count,1);
  await assert.rejects(heygenClient('fixture-key',async()=>Response.json({data:{}})).create({id:'task-fixture',lookId:look.id,engine:'avatar_iii',audioId:'a_fixture',transparent:false}),e=>e instanceof AvatarFailure&&e.uncertain);
  let network=0;await assert.rejects(downloadHeygenMedia('https://127.0.0.1/private',10,async()=>{network++;return new Response('');}),/AVATAR_MEDIA_INVALID/);assert.equal(network,0);
  await assert.rejects(downloadHeygenMedia('https://files.heygen.ai/test',10,async()=>new Response(null,{status:302,headers:{Location:'https://example.com/private'}})),/AVATAR_MEDIA_INVALID/);
});
test('Webhooks HeyGen : HMAC du corps brut, altération et signature absente rejetées',async()=>{
  const bytes=new TextEncoder().encode('{"event_type":"avatar_video.success"}'),key=await crypto.subtle.importKey('raw',new TextEncoder().encode('fixture-secret'),{name:'HMAC',hash:'SHA-256'},false,['sign']);
  const signature=Buffer.from(await crypto.subtle.sign('HMAC',key,bytes)).toString('hex');
  assert.equal(await verifyHeygenSignature('fixture-secret',bytes,signature),true);
  assert.equal(await verifyHeygenSignature('fixture-secret',new TextEncoder().encode('{}'),signature),false);assert.equal(await verifyHeygenSignature('fixture-secret',bytes,null),false);
});
test('Manifestes et caches : WAV exact, synchronisation et indépendance du cadrage',async()=>{
  const fixture=await videoFixture('paid'),m=fixture.manifest,source=m.audio[0];
  const asset={id:'avatar-asset',objectKey:`agencies/${m.agencyId}/jobs/${m.jobId}/avatars/clip.mp4`,sha256:'a'.repeat(64),sizeBytes:100,mime:'video/mp4' as const,width:720,height:1280,durationMs:source.durationMs};
  const clip={id:'avatar-clip',moment:'intro' as const,startFrame:0,durationFrames:Math.ceil(source.durationMs!*30/1000),audioAssetId:source.id,audioSha256:source.sha256,lookId:avatar.lookId,engine:avatar.engine,transparent:false,asset};
  assert.equal(VideoManifest.safeParse({...m,avatar:{settings:avatar,clips:[clip]}}).success,true);
  for(const bad of [{...clip,audioSha256:'b'.repeat(64)},{...clip,startFrame:1},{...clip,durationFrames:30},{...clip,engine:'avatar_iv'}])assert.equal(VideoManifest.safeParse({...m,avatar:{settings:avatar,clips:[bad]}}).success,false);
  assert.equal(VideoManifest.safeParse({...m,avatar:{settings:{...avatar,moments:'outro'},clips:[clip]}}).success,false);
  assert.equal(await avatarCacheKey(source.sha256,look.id,'avatar_iii',false),await avatarCacheKey(source.sha256,look.id,'avatar_iii',false));
  assert.notEqual(await avatarCacheKey(source.sha256,look.id,'avatar_iii',false),await avatarCacheKey('b'.repeat(64),look.id,'avatar_iii',false));
});
test('D1 et pipeline avatars simulés : réservations, reprise sans double dépense, budget, rendu et remboursement',async t=>{
  const mf=new Miniflare(convertV4MiniflareOptions({modules:true,script:'export default {fetch(){return new Response("fixture")}}',compatibilityDate:'2026-09-27',d1Databases:['DB'],r2Buckets:['MEDIA']}));t.after(()=>mf.dispose());
  const env=await mf.getBindings<{DB:D1Database;MEDIA:R2Bucket}>();await migrateNarrationProbe(env.DB);
  const scope=await seedNarrationFixture(env.DB,'avatar',true),fixture=await videoFixture('paid'),at=new Date().toISOString();
  await env.DB.exec("UPDATE jobs SET status='failed',error_code='FIXTURE'; UPDATE allocations SET kind='paid',quota_limit=40; UPDATE generation_control SET enabled=1; UPDATE video_map_settings SET settings_json=json_set(settings_json,'$.enabled',0)");
  await env.DB.prepare('INSERT INTO generation_access VALUES(?,?,1)').bind(scope.agencyId,'allocation-avatar').run();
  await env.DB.prepare('INSERT INTO hosted_import_budget VALUES(?,0,9000,0)').bind(at.slice(0,7)).run();
  const listing=fixture.listing;listing.id='listing-avatar';listing.agencyId=scope.agencyId;for(const p of listing.photos){
    const bytes=await sharp(fixture.files.get(p.id)!).jpeg().toBuffer();
    Object.assign(p,{agencyId:scope.agencyId,listingId:listing.id,mime:'image/jpeg',sizeBytes:bytes.length,contentHash:createHash('sha256').update(bytes).digest('hex'),objectKey:`agencies/${scope.agencyId}/imports/${listing.id}/${p.id}.jpg`});
    await env.MEDIA.put(p.objectKey,bytes);}
  await env.DB.prepare('UPDATE listing_imports SET result_json=? WHERE id=?').bind(JSON.stringify(listing),listing.id).run();
  const input={listingId:listing.id,durationSeconds:20,customization};
  await assert.rejects(admitGeneration(env.DB,scope.agencyId,'avatar-key-before-enable',input,'true'),/AVATAR_UNAVAILABLE/);
  await saveAvatarLook(env.DB,'fixture-admin',look,{image:null,video:null});
  await setAvatarSettings(env.DB,'fixture-admin',{...DEFAULT_AVATAR_SETTINGS,enabled:true,defaultLookId:look.id},1);
  await assert.rejects(setAvatarSettings(env.DB,'fixture-admin',DEFAULT_AVATAR_SETTINGS,1),/CONFLICT/);
  await assert.rejects(admitGeneration(env.DB,scope.agencyId,'avatar-key-unreviewed-cutout',{...input,customization:{...customization,avatar:{...avatar,appearance:'cutout'}}},'true'),/AVATAR_UNAVAILABLE/);
  const config=frenchVoiceConfig(customization.voice,'fixture'),tts=googleTts(config as Parameters<typeof googleTts>[0],async()=>'fixture-token-never-networked',{fetch:async()=>Response.json({audioContent:Buffer.from(toneFixture(1500)).toString('base64')})});
  const providers={mode:'mock' as const,script:{model:'gpt-5.4-mini',plan:async():Promise<never>=>{throw Error('NO_OPENAI_CALL');}},voice:{config,synthesize:tts.synthesize}};
  let creates=0,done=false;const fetchBefore=globalThis.fetch;t.after(()=>{globalThis.fetch=fetchBefore;});
  globalThis.fetch=async(url)=>{const path=new URL(String(url)).pathname;
    if(path==='/v3/users/me')return Response.json({data:{billing_type:'wallet',wallet:{remaining_balance:5,currency:'usd',auto_reload:{enabled:false}}}});
    if(path==='/v3/assets')return Response.json({data:{asset_id:'a_fixture'}});
    if(path==='/v3/videos'){creates++;return Response.json({data:{video_id:'v_fixture_'+creates}});}
    if(path.startsWith('/v3/videos/'))return Response.json({data:{id:path.split('/').at(-1),status:done?'completed':'processing',duration:1.5,video_url:'https://files.heygen.ai/fixture.mp4'}});
    if(String(url)==='https://files.heygen.ai/fixture.mp4')return new Response(new Uint8Array([0,0,0,24,102,116,121,112,1,2,3,4]));
    throw Error('UNEXPECTED_EXTERNAL_CALL');};
  const runtime={...env,HEYGEN_ENABLED:'true',HEYGEN_API_KEY:'fixture-key'};
  async function create(key:string){const row=await admitGeneration(env.DB,scope.agencyId,key,input,'true');await env.DB.prepare("UPDATE jobs SET status='scripting',stage='scripting' WHERE id=?").bind(row.jobId).run();await prepareJobNarration(env,scope.agencyId,row.jobId,providers);return row;}
  const row=await create('avatar-idempotency-fixture-1');assert.equal(generationView(row).creditsReserved,2);assert.equal((await creditBalance(env.DB,scope.agencyId)).reserved,2);
  assert.equal((await admitGeneration(env.DB,scope.agencyId,'avatar-idempotency-fixture-1',input,'true')).jobId,row.jobId);
  await submitJobAvatars(runtime,scope.agencyId,row.jobId);await submitJobAvatars(runtime,scope.agencyId,row.jobId);assert.equal(creates,2);
  assert.equal((await pollJobAvatars(runtime,scope.agencyId,row.jobId)).done,false);done=true;assert.equal((await pollJobAvatars(runtime,scope.agencyId,row.jobId)).ready,2);
  const frozen=await prepareJobVideo(env,scope.agencyId,row.jobId);assert.equal(frozen.manifest.avatar?.clips.length,2);
  const report=videoReport(frozen.hash,frozen.manifest);await env.DB.prepare('INSERT INTO generation_artifacts VALUES(?,?,?,?)').bind(row.jobId,`agencies/${scope.agencyId}/jobs/${row.jobId}/master.mp4`,JSON.stringify(report),new Date().toISOString()).run();
  await env.DB.prepare("UPDATE jobs SET status='ready',stage='rendering',lease_until=NULL WHERE id=?").bind(row.jobId).run();
  const ready=generationView((await findGeneration(env.DB,scope.agencyId,row.jobId))!);assert.equal(ready.creditsUsed,2);assert.equal(ready.avatar?.creditsUsed,1);assert.equal((await creditHistory(env.DB,scope.agencyId)).entries[0].used,2);
  const reuse=await create('avatar-idempotency-fixture-2');await submitJobAvatars(runtime,scope.agencyId,reuse.jobId);assert.equal(creates,2);assert.equal((await jobAvatarTasks(env.DB,scope.agencyId,reuse.jobId)).every(t=>t.reused===1),true);
  await prepareJobVideo(env,scope.agencyId,reuse.jobId);
  await env.DB.prepare("UPDATE jobs SET status='rendering',stage='rendering' WHERE id=?").bind(reuse.jobId).run();
  await failGeneration(env.DB,reuse,'GENERATION_FAILED');const reused=generationView((await findGeneration(env.DB,scope.agencyId,reuse.jobId))!);assert.equal(reused.avatar?.creditsUsed,0);assert.equal(reused.creditsRefunded,2);
  const beforeRecovery=await creditBalance(env.DB,scope.agencyId);
  const recoveredDraft=await editExistingVideo(env,scope.agencyId,reuse.jobId,'recover-failed-avatar-render',AbortSignal.timeout(20000));
  assert.equal((await editExistingVideo(env,scope.agencyId,reuse.jobId,'recover-failed-avatar-render',AbortSignal.timeout(20000))).id,recoveredDraft.id);
  await assert.rejects(editExistingVideo(env,'other',reuse.jobId,'recover-failed-avatar-other',AbortSignal.timeout(20000)),/NOT_FOUND/);
  assert.deepEqual(await creditBalance(env.DB,scope.agencyId),beforeRecovery,'Ouvrir un rendu échoué ne débite aucun crédit');
  const settings=recoveredDraft.data.videoCustomization!,voice=await editorVoicePreview(env,scope.agencyId,recoveredDraft.id,settings.voiceSourceId!);
  assert.equal(editorCanReuseVoice(settings,voice),true);assert.equal((await editorResources(env.DB,scope.agencyId,recoveredDraft.id)).avatars!.length,2);
  const exportInput=await snapshotEditorExport(env,scope.agencyId,recoveredDraft.id,recoveredDraft.version,'recover-avatar-export-001',AbortSignal.timeout(20000));
  const repair=await admitGeneration(env.DB,scope.agencyId,'recover-avatar-export-001',exportInput,'true');
  await env.DB.prepare("UPDATE jobs SET status='scripting',stage='scripting' WHERE id=?").bind(repair.jobId).run();
  await prepareJobNarration(env,scope.agencyId,repair.jobId,{...providers,voice:{config,synthesize:async()=>{throw Error('NO_NEW_TTS');}}});
  await submitJobAvatars(runtime,scope.agencyId,repair.jobId);assert.equal(creates,2,'Les deux passages de l’avatar sont réutilisés');
  const repaired=await prepareJobVideo(env,scope.agencyId,repair.jobId);assert.equal(repaired.manifest.avatar!.clips.length,2);
  assert.equal((await env.DB.prepare('SELECT count(*) AS n FROM narration_calls WHERE job_id=?').bind(repair.jobId).first<{n:number}>())!.n,0,'Aucun appel texte/voix pour réexporter');
  await env.DB.prepare('INSERT INTO generation_artifacts VALUES(?,?,?,?)').bind(repair.jobId,`agencies/${scope.agencyId}/jobs/${repair.jobId}/master.mp4`,JSON.stringify(videoReport(repaired.hash,repaired.manifest)),new Date().toISOString()).run();
  await env.DB.prepare("UPDATE jobs SET status='ready',stage='rendering',lease_until=NULL WHERE id=?").bind(repair.jobId).run();
  const settled=generationView((await findGeneration(env.DB,scope.agencyId,repair.jobId))!);assert.equal(settled.creditsUsed,1);assert.equal(settled.avatar!.creditsUsed,0);
  assert.equal((await findGeneration(env.DB,scope.agencyId,reuse.jobId))!.status,'failed','L’historique original reste immuable');
  await env.DB.prepare("UPDATE jobs SET stage='voicing' WHERE id=?").bind(reuse.jobId).run();
  await assert.rejects(editExistingVideo(env,scope.agencyId,reuse.jobId,'recover-avatar-before-render',AbortSignal.timeout(20000)),/NOT_FOUND/);
  await env.DB.prepare("UPDATE jobs SET stage='rendering' WHERE id=?").bind(reuse.jobId).run();
  await env.DB.prepare("UPDATE generation_runs SET expires_at=? WHERE job_id=?").bind(new Date(Date.now()-1000).toISOString(),reuse.jobId).run();
  await assert.rejects(editExistingVideo(env,scope.agencyId,reuse.jobId,'recover-avatar-expired',AbortSignal.timeout(20000)),/NOT_FOUND/);
  const policy=await avatarSettings(env.DB);await setAvatarSettings(env.DB,'fixture-admin',{...policy.settings,monthlyUsd:0},policy.revision);
  const capped=await create('avatar-idempotency-fixture-3');
  // Force a different audio hash so the budget test cannot reuse a library file.
  await env.DB.prepare('DELETE FROM avatar_library').run();await submitJobAvatars(runtime,scope.agencyId,capped.jobId);assert.equal(creates,2);assert.equal((await jobAvatarTasks(env.DB,scope.agencyId,capped.jobId)).every(t=>t.errorCode==='AVATAR_BUDGET_LIMIT'),true);
  await failGeneration(env.DB,capped,'GENERATION_FAILED');assert.equal(generationView((await findGeneration(env.DB,scope.agencyId,capped.jobId))!).avatar?.creditsUsed,0);
  const task=(await jobAvatarTasks(env.DB,scope.agencyId,row.jobId))[0];
  await assert.rejects(env.DB.prepare("INSERT INTO avatar_tasks(id,agency_id,job_id,moment,cache_key,audio_json,start_frame,state,engine,mode,reused,reserved_micros,created_at,updated_at) VALUES('cross-tenant','other',?,'intro',?,'{}',0,'claimed','avatar_iii','real',0,0,?,?)").bind(row.jobId,task.cacheKey,at,at).run(),/AVATAR_JOB_INACTIVE/);
});
test('Simulation de rentabilité : deux passages restent un seul crédit supplémentaire',()=>{
  const input=defaultPricingSimulation();input.profiles=[{...input.profiles[0],share:100,animations:0,avatar:{seconds:8,engine:'avatar_iii'}}];input.market.eurPerUsd=1;
  const report=calculatePricing(input);assert.equal(report.profiles[0].measures.credits,2);assert.ok(Math.abs(report.profiles[0].parts.avatar-.132)<1e-9);
});
test('Migration HeyGen sur une base déjà facturée : dépenses, affectations et contraintes conservées',async t=>{
  const mf=new Miniflare(convertV4MiniflareOptions({modules:true,script:'export default {fetch(){return new Response("fixture")}}',compatibilityDate:'2026-09-27',d1Databases:['DB']}));t.after(()=>mf.dispose());
  const db=await mf.getD1Database('DB'),directory=new URL('../packages/db/migrations/',import.meta.url);
  for(const name of (await readdir(directory)).filter(n=>n.endsWith('.sql')&&n<'0058').sort())await db.exec((await readFile(new URL(name,directory),'utf8')).replace(/^--.*$/gm,'').replace(/\n/g,' '));
  const seed=await seedNarrationFixture(db,'avatar-migrate',true),at=new Date().toISOString(),until=new Date(Date.now()+86400000).toISOString();
  await db.exec("UPDATE jobs SET status='failed',error_code='VOICE_INVALID',lease_until=NULL; UPDATE allocations SET kind='paid',quota_limit=40; UPDATE generation_control SET enabled=1");
  await db.prepare('INSERT INTO generation_access VALUES(?,?,1)').bind(seed.agencyId,'allocation-avatar-migrate').run();
  await db.prepare('INSERT INTO hosted_import_budget VALUES(?,0,9000,0)').bind(at.slice(0,7)).run();
  await db.prepare(`INSERT INTO generation_runs(job_id,agency_id,allocation_id,reservation_id,idempotency_key,input_hash,input_json,brand_json,created_at,deadline,expires_at,month,credit_version,credits_total,animations_requested,reuse_pricing,animations_reused,animation_reuses_json,funding_version,selected_voice)
    VALUES('existing-finance-job',?,?,'existing-finance-reservation','existing-finance-key',?,'{}','{}',?,?,?,?,1,1,0,1,0,'[]',1,'fish-manon')`)
    .bind(seed.agencyId,'allocation-avatar-migrate','a'.repeat(64),at,until,until,at.slice(0,7)).run();
  await db.prepare(`INSERT INTO financial_expenses(id,provider,reference,mode,kind,currency,original_minor,eur_cents,unit_quantity,period_from,period_until,paid_at,note,actor_id,created_at)
    VALUES('expense-existing','cartesia','fixture-bill','test','usage','USD',500,450,1,?,?,?,'Fixture before avatar migration','fixture-admin',?)`).bind(at.slice(0,10),at.slice(0,10),at.slice(0,10),at).run();
  await db.exec("INSERT INTO financial_expense_allocations VALUES('expense-existing','existing-finance-job',1,4500000,0,1)");
  const expense=await db.prepare("SELECT * FROM financial_expenses WHERE id='expense-existing'").first(),allocation=await db.prepare("SELECT * FROM financial_expense_allocations WHERE expense_id='expense-existing'").first();
  await db.exec((await readFile(new URL('0058_heygen_avatars.sql',directory),'utf8')).replace(/^--.*$/gm,'').replace(/\n/g,' '));
  assert.deepEqual(await db.prepare("SELECT * FROM financial_expenses WHERE id='expense-existing'").first(),expense);
  assert.deepEqual(await db.prepare("SELECT * FROM financial_expense_allocations WHERE expense_id='expense-existing'").first(),allocation);
  assert.deepEqual((await db.prepare('PRAGMA foreign_key_check').all()).results,[]);
  assert.equal((await db.prepare("SELECT cost_micros FROM finance_video_summary WHERE job_id='existing-finance-job'").first<{cost_micros:number}>())!.cost_micros,4500000);
  await assert.rejects(db.exec("UPDATE financial_expenses SET eur_cents=1 WHERE id='expense-existing'"),/FINANCIAL_EXPENSE_IMMUTABLE/);
});
