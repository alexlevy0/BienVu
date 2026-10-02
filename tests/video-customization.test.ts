import {test} from 'node:test';
import assert from 'node:assert/strict';
import {Miniflare,convertV4MiniflareOptions} from 'miniflare';
import {GenerationRequest,VideoCustomization,defaultVideoCustomization,customizedListing,customizedBrand,GoogleVoiceConfig} from '../packages/contracts/src/index';
import {scriptContext,customScript,validateScript,DEFAULT_SCRIPT_MODEL} from '../packages/narration/src/index';
import {narrationListing,narrationBrand} from '../fixtures/narration';
import {migrateNarrationProbe,seedNarrationFixture} from '../scripts/narration-fixtures';
import {createPrivateImport} from '../apps/web/lib/imports';
import {fixtureImportTransport} from '../scripts/import-fixtures';
import {customizeImportedListing,patchCreationDraft,finishCreationDraft} from '../apps/web/lib/creation-drafts';
import {findImport,admitGeneration,findNarration,failGeneration} from '../packages/db/src/index';
import {prepareJobNarration} from '../apps/pipeline/src/narration';
import {prepareJobVideo} from '../apps/pipeline/src/video-manifest';
import {loadGenerationListing} from '../apps/pipeline/src/generation-import';
import {googleTts} from '../packages/voice/src/index';
import {toneFixture} from '../fixtures/voice';

const lines=['Découvrez cet appartement à Lyon, à vendre.','Une nouvelle adresse à découvrir en images.',
  'Prenons le temps de parcourir les lieux.','Pour en savoir plus, contactez votre agence.'];
test('personnalisation : entrée stricte, ordre privé et narration exacte',async()=>{
  const settings={...defaultVideoCustomization(),photoOrder:[2,0,1],narration:lines};
  assert.equal(settings.style,'cinematic');assert.equal(settings.voice,'fish-manon');assert.equal(settings.runwayClips,undefined);
  assert.ok(GenerationRequest.safeParse({listingId:'listing-test',customization:settings}).success);
  for(const invalid of [{...settings,voice:'arbitrary'}, {...settings,objectKey:'agencies/elsewhere/photo.jpg'},
    {...settings,photoOrder:[0,0,1]}, {...settings,photoOrder:[0,1]}, {...settings,narration:['<script>',...lines.slice(1)]},
    {...settings,narration:lines.map(()=>Array(40).fill('mot').join(' '))}])
    assert.equal(GenerationRequest.safeParse({listingId:'listing-test',customization:invalid}).success,false);
  assert.ok(VideoCustomization.safeParse({...settings,narration:['',...lines.slice(1)]}).success); // editable draft, not admissible
  assert.equal(GenerationRequest.safeParse({url:'https://www.orpi.com/annonce-vente-test/',customization:settings}).success,false);
  const listing=narrationListing(true),original=structuredClone(listing);
  const selected=customizedListing(listing,settings);
  assert.deepEqual(selected.photos.map(p=>p.id),[listing.photos[2].id,listing.photos[0].id,listing.photos[1].id]);
  assert.deepEqual(listing,original);
  assert.throws(()=>customizedListing(listing,{...settings,photoOrder:[0,1,11]}),/INVALID_PHOTO_SELECTION/);
  const context=await scriptContext(selected,customizedBrand(narrationBrand,settings),undefined,undefined,lines);
  const script=customScript(context);assert.deepEqual(script.scenes.map(s=>s.narrationText),lines);
  assert.deepEqual(validateScript(context,script),script);assert.equal(script.model,'user-narration/1');
  assert.deepEqual(script.provenance.map(p=>p.ref),['narration','photos']);
  const legacy=await scriptContext(listing,narrationBrand);
  assert.equal(legacy.inputHash,(await scriptContext(customizedListing(listing),customizedBrand(narrationBrand))).inputHash);
  assert.notEqual(context.inputHash,legacy.inputHash);
});

test('copie de personnalisation : isolation, replay R2, brouillon et aucun débit vidéo',async t=>{
  const mf=new Miniflare(convertV4MiniflareOptions({modules:true,script:'export default {fetch(){return new Response("fixture")}}',compatibilityDate:'2026-09-27',d1Databases:['DB'],r2Buckets:['MEDIA']}));
  t.after(()=>mf.dispose());const env=await mf.getBindings<{DB:D1Database;MEDIA:R2Bucket}>();await migrateNarrationProbe(env.DB);
  const at=new Date().toISOString();for(const id of ['custom-a','custom-b'])await env.DB.prepare('INSERT INTO agencies(id,owner_user_id,name,created_at,updated_at) VALUES(?,?,?,?,?)').bind(id,'user-'+id,'Agence test',at,at).run();
  const source=await createPrivateImport(env,'custom-a','https://fixtures.bienvu.example/vente','source-customization-key',fixtureImportTransport());assert.equal(source.status,'ready');
  const before=await env.DB.prepare('SELECT count(*) n FROM jobs').first<{n:number}>();
  const draft=await customizeImportedListing(env,'custom-a',source.id,'customize-source-key-001',AbortSignal.timeout(20_000));
  assert.equal(draft.photos.length,3);assert.equal(draft.data.fields.title!==null,true);
  assert.equal((await findImport(env.DB,'custom-a',source.id))?.status,'ready');
  assert.notEqual(draft.id,source.id);for(const photo of draft.photos)assert.ok(photo.objectKey.startsWith(`agencies/custom-a/imports/${draft.id}/`));
  const replay=await customizeImportedListing(env,'custom-a',source.id,'customize-source-key-001',AbortSignal.timeout(20_000));assert.deepEqual(replay,draft);
  await assert.rejects(customizeImportedListing(env,'custom-b',source.id,'customize-source-key-001',AbortSignal.timeout(20_000)),/NOT_FOUND/);
  const settings={...defaultVideoCustomization(),photoOrder:[2,0,1],narration:lines,style:'cinematic' as const};
  const patched=await patchCreationDraft(env.DB,'custom-a',draft.id,{version:draft.version,changes:{},confirm:[],videoCustomization:settings});
  assert.deepEqual(patched.data.videoCustomization,settings);
  await assert.rejects(patchCreationDraft(env.DB,'custom-a',draft.id,{version:draft.version,changes:{},confirm:[],videoCustomization:settings}),/CONFLICT/);
  await finishCreationDraft(env,'custom-a',draft.id,patched.version);
  const copied=await findImport(env.DB,'custom-a',draft.id);assert.equal(copied?.status,'ready');
  assert.equal((await env.DB.prepare('SELECT count(*) n FROM jobs').first<{n:number}>())?.n,before?.n);
  for(const table of ['reservations','hosted_import_costs','generation_runs'])assert.equal((await env.DB.prepare('SELECT count(*) n FROM '+table).first<{n:number}>())?.n,0);
});

test('pipeline personnalisé : zéro OpenAI, voix choisie, texte exact, manifeste figé et reprise',async t=>{
  const mf=new Miniflare(convertV4MiniflareOptions({modules:true,script:'export default {fetch(){return new Response("fixture")}}',compatibilityDate:'2026-09-27',d1Databases:['DB'],r2Buckets:['MEDIA']}));
  t.after(()=>mf.dispose());const env=await mf.getBindings<{DB:D1Database;MEDIA:R2Bucket}>();await migrateNarrationProbe(env.DB);
  const {agencyId,jobId}=await seedNarrationFixture(env.DB,'custom-flow',true);
  await env.DB.prepare("UPDATE jobs SET status='failed',error_code='FIXTURE',lease_until=NULL WHERE id=?").bind(jobId).run();
  const month=new Date().toISOString().slice(0,7);
  await env.DB.prepare('INSERT INTO hosted_import_budget(month,baseline_cents,ceiling_cents,paused) VALUES(?,0,9500,0)').bind(month).run();
  await env.DB.exec('UPDATE generation_control SET enabled=1');
  await env.DB.prepare('INSERT INTO generation_access(agency_id,allocation_id,enabled) VALUES(?,?,1)').bind(agencyId,'allocation-custom-flow').run();
  const listing=JSON.parse((await findImport(env.DB,agencyId,'listing-custom-flow'))!.result!);
  const fixture=await import('../fixtures/video').then(m=>m.videoFixture('paid'));
  // Real hashes and R2 verification from generated local images, no network.
  for(let i=0;i<listing.photos.length;i++){const asset=fixture.manifest.photos[i],photo=listing.photos[i];
    Object.assign(photo,{contentHash:asset.sha256,sizeBytes:asset.sizeBytes,width:asset.width,height:asset.height});
    await env.MEDIA.put(photo.objectKey,fixture.files.get(asset.id)!,{customMetadata:{sha256:asset.sha256}});}
  // A missing unselected image must not prevent the chosen images from rendering.
  listing.photos.push({...listing.photos[0],id:'unused-custom-flow',objectKey:`agencies/${agencyId}/imports/${listing.id}/unused.jpg`,contentHash:'f'.repeat(64),sourceOrder:3});
  await env.DB.prepare('UPDATE listing_imports SET result_json=? WHERE id=?').bind(JSON.stringify(listing),listing.id).run();
  const settings={...defaultVideoCustomization(),voice:'fr-FR-Chirp3-HD-Kore' as const,photoOrder:[2,0,1],narration:lines,style:'minimal' as const,photoMotion:false,transition:'cut' as const};
  await assert.rejects(admitGeneration(env.DB,agencyId,'custom-invalid-order-001',{listingId:listing.id,customization:{...settings,photoOrder:[0,1,11]}},'true'),/VALIDATION_ERROR/);
  assert.equal((await env.DB.prepare('SELECT baseline_cents n FROM hosted_import_budget').first<{n:number}>())?.n,0);
  const row=await admitGeneration(env.DB,agencyId,'custom-generation-key-01',{listingId:listing.id,customization:settings,subtitlesEnabled:false},'true');
  assert.deepEqual(await loadGenerationListing({...env,IMPORT_SERVICE:{fetch:async()=>{throw Error('NO_IMPORT_NEEDED');},connect:()=>{throw Error('NO_IMPORT_NEEDED');}},IMPORT_TOKEN:'fixture'},row),{listingId:listing.id});
  await env.DB.prepare("UPDATE jobs SET status='scripting',stage='scripting',listing_id=? WHERE id=?").bind(listing.id,row.jobId).run();
  const config=GoogleVoiceConfig.parse({projectId:'fixture-customization',voice:settings.voice});let syntheses=0;
  const google=googleTts(config,async()=> 'fixture-token-never-networked',{fetch:async()=>{syntheses++;return Response.json({audioContent:Buffer.from(toneFixture(5000)).toString('base64')});}});
  const providers={mode:'mock' as const,script:{model:DEFAULT_SCRIPT_MODEL,plan:async():Promise<never>=>{throw Error('OPENAI_MUST_NOT_RUN');}},voice:{config,synthesize:google.synthesize}};
  const prepared=await prepareJobNarration(env,agencyId,row.jobId,providers);assert.equal(syntheses,4);
  assert.deepEqual(prepared.script.scenes.map(s=>s.narrationText),lines);
  assert.equal((await env.DB.prepare("SELECT count(*) n FROM narration_calls WHERE provider='openai'").first<{n:number}>())?.n,0);
  const saved=await findNarration(env.DB,agencyId,row.jobId);assert.deepEqual(JSON.parse(saved!.snapshot).listing.photos.map((p:{id:string})=>p.id),[listing.photos[2].id,listing.photos[0].id,listing.photos[1].id]);
  assert.deepEqual(await prepareJobNarration(env,agencyId,row.jobId,providers),prepared);assert.equal(syntheses,4);
  const frozen=await prepareJobVideo(env,agencyId,row.jobId);assert.equal(frozen.manifest.visualStyle,'minimal');assert.equal(frozen.manifest.photoMotion,false);assert.equal(frozen.manifest.photoTransition,'cut');assert.equal(frozen.manifest.subtitlesEnabled,false);
  assert.deepEqual(frozen.manifest.photos.map(p=>p.id),[listing.photos[2].id,listing.photos[0].id,listing.photos[1].id]);
  assert.equal((await prepareJobVideo(env,agencyId,row.jobId)).hash,frozen.hash);
  await failGeneration(env.DB,row,'FIXTURE');
  const longVoice=GoogleVoiceConfig.parse({projectId:'fixture-customization',voice:'fr-FR-Chirp3-HD-Charon'});
  const longRow=await admitGeneration(env.DB,agencyId,'custom-long-narration-01',{listingId:listing.id,customization:{...settings,voice:longVoice.voice}},'true');
  await env.DB.prepare("UPDATE jobs SET status='scripting',stage='scripting',listing_id=? WHERE id=?").bind(listing.id,longRow.jobId).run();
  let longCalls=0;
  const slow=googleTts(longVoice,async()=> 'fixture-token-never-networked',{fetch:async()=>{longCalls++;return Response.json({audioContent:Buffer.from(toneFixture(9000)).toString('base64')});}});
  await assert.rejects(prepareJobNarration(env,agencyId,longRow.jobId,{...providers,voice:{config:longVoice,synthesize:slow.synthesize}}),/VOICE_DURATION_EXCEEDED/);
  assert.equal(longCalls,4); // No automatic rewrite or extra synthesis of user text.
  assert.equal(JSON.parse((await findNarration(env.DB,agencyId,longRow.jobId))!.script!).version,1);
  assert.equal((await env.DB.prepare("SELECT count(*) n FROM narration_calls WHERE provider='openai'").first<{n:number}>())?.n,0);
});
