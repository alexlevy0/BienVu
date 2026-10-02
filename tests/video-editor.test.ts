import {test} from 'node:test';
import assert from 'node:assert/strict';
import {Miniflare,convertV4MiniflareOptions} from 'miniflare';
import {createEditorDocument,EditorDocument,GenerationRequest,GenerationCustomization,VideoManifest,videoManifestHash,videoAssets,videoPhotoTimeline,
  editorClipStarts,resizeEditorDocument,resizeEditorClip,splitEditorClip,editorHasAudio,defaultVideoCustomization,FishVoiceConfig} from '../packages/contracts/src/index';
import {videoFixture,videoReport} from '../fixtures/video';
import {toneFixture} from '../fixtures/voice';
import {migrateNarrationProbe} from '../scripts/narration-fixtures';
import {fixtureImportTransport} from '../scripts/import-fixtures';
import {createPrivateImport} from '../apps/web/lib/imports';
import {customizeImportedListing,patchCreationDraft,deleteCreationDraft} from '../apps/web/lib/creation-drafts';
import {putEditorMusic,privateEditorMusic,snapshotEditorExport,editExistingVideo} from '../apps/web/lib/video-editor';
import {findCreationDraft,findImport,admitGeneration,generationRights} from '../packages/db/src/index';
import {prepareJobNarration} from '../apps/pipeline/src/narration';
import {prepareJobVideo} from '../apps/pipeline/src/video-manifest';

const speech=['Découvrez ce bien à travers une visite en images.','Prenons le temps de parcourir les lieux.',
  'Retrouvez les informations de cette annonce dans votre vidéo.','Pour en savoir plus, contactez votre agence.'];
test('Éditeur : plans, scission et redimensionnement restent complets à 20, 30 et 40 secondes',()=>{
  const doc=createEditorDocument([{sourceOrder:2},{sourceOrder:0},{sourceOrder:1}],{title:'Un lieu à part',locality:'Lyon',priceCents:38500000,area:65,rooms:3},{durationSeconds:40});
  const split=splitEditorClip(doc,doc.clips[0].id,15,'split-minimum');
  assert.equal(split.clips.length,4);assert.equal(split.clips[0].durationFrames,15);
  for(const seconds of [20,30,40] as const){const resized=resizeEditorDocument(split,seconds);
    assert.equal(resized.clips.reduce((n,c)=>n+c.durationFrames,0),seconds*30);
    assert.ok(resized.clips.every(c=>c.durationFrames>=15));assert.ok(resized.layers.every(l=>l.startFrame+l.durationFrames<=seconds*30));
    assert.equal(editorClipStarts(resized).at(-1)!.startFrame+resized.clips.at(-1)!.durationFrames,seconds*30);
    const stretched=resizeEditorClip(resized,resized.clips[0].id,1200);
    assert.ok(stretched.clips.every(c=>c.durationFrames>=15));assert.equal(stretched.clips.reduce((n,c)=>n+c.durationFrames,0),seconds*30);
  }
  assert.deepEqual(splitEditorClip(doc,doc.clips[0].id,8,'too-short'),doc);
  const settings={...defaultVideoCustomization(),photoOrder:[2,0,1],editor:resizeEditorDocument(doc,20)};
  assert.ok(GenerationRequest.safeParse({listingId:'editor-listing',customization:settings,durationSeconds:20,aspectRatio:'9:16'}).success);
  assert.equal(GenerationRequest.safeParse({listingId:'editor-listing',customization:settings,durationSeconds:40}).success,false);
  assert.equal(GenerationRequest.safeParse({listingId:'editor-listing',customization:settings,aspectRatio:'16:9'}).success,false);
  assert.equal(GenerationRequest.safeParse({url:'https://www.orpi.com/annonce-vente-example/',customization:settings}).success,false);
  assert.equal(GenerationCustomization.safeParse({...settings,photoOrder:[2,0]}).success,false);
  for(const editor of [{...doc,extraKey:'no'}, {...doc,layers:[{...doc.layers[0],objectKey:'private'}]},
    {...doc,clips:doc.clips.slice(1)},{...doc,voiceEnabled:false,subtitlesEnabled:true},
    {...doc,music:{assetId:'music-test',durationMs:1000,name:'Musique',volume:.15,startFrame:1199,trimFromFrame:0}}])
    assert.equal(EditorDocument.safeParse(editor).success,false);
});

test('Éditeur : ancien hash immuable, médias musicaux bornés et cohérence audio',async()=>{
  const f=await videoFixture('paid',4),old=await videoManifestHash(f.manifest);
  assert.equal(await videoManifestHash(VideoManifest.parse(f.manifest)),old);
  const base={...f.manifest,voiceEnabled:false,subtitlesEnabled:false,audio:[],scenes:f.manifest.scenes.map(s=>({...s,audioAssetId:null,durationFrames:150})),photoTimeline:videoPhotoTimeline(f.manifest.photos,600)},
    doc=createEditorDocument(f.manifest.photos.map((_,sourceOrder)=>({sourceOrder})),{}, {voiceEnabled:false,subtitlesEnabled:false});
  const silent=VideoManifest.parse({...base,editor:doc});assert.equal(editorHasAudio(silent),false);assert.notEqual(await videoManifestHash(silent),old);
  const music={id:'music-test',objectKey:`agencies/${silent.agencyId}/jobs/${silent.jobId}/music/test.wav`,sha256:'b'.repeat(64),sizeBytes:1024,mime:'audio/wav' as const,durationMs:1000};
  const mixed=VideoManifest.parse({...silent,editor:{...doc,music:{assetId:music.id,durationMs:1000,name:'Musique',volume:.15,startFrame:0,trimFromFrame:0}},music:{asset:music}});
  assert.equal(editorHasAudio(mixed),true);assert.ok(videoAssets(mixed).some(a=>a.id===music.id));
  assert.equal(editorHasAudio({...mixed,editor:{...mixed.editor!,music:{...mixed.editor!.music!,volume:0}}}),false);
  assert.equal(VideoManifest.safeParse({...mixed,music:{asset:{...music,durationMs:2000}}}).success,false);
  assert.equal(VideoManifest.safeParse({...mixed,music:{asset:{...music,objectKey:'agencies/elsewhere/jobs/another/audio.wav'}}}).success,false);
  assert.equal(VideoManifest.safeParse({...silent,editor:{...doc,clips:doc.clips.map(c=>({...c,photoSlot:11}))}}).success,false);
});

test('Éditeur D1/R2 : projet conservé, export figé, musique privée, reprise et retouche d’un MP4',async t=>{
  const mf=new Miniflare(convertV4MiniflareOptions({modules:true,script:'export default {fetch(){return new Response("test")}}',compatibilityDate:'2026-09-27',d1Databases:['DB'],r2Buckets:['MEDIA']}));t.after(()=>mf.dispose());
  const env=await mf.getBindings<{DB:D1Database;MEDIA:R2Bucket}>();await migrateNarrationProbe(env.DB);
  const at=new Date().toISOString(),agencyId='editor-a';for(const id of [agencyId,'editor-b'])await env.DB.prepare('INSERT INTO agencies(id,owner_user_id,name,email,created_at,updated_at) VALUES(?,?,?,?,?,?)').bind(id,'user-'+id,'Votre agence','recette@example.com',at,at).run();
  await env.DB.prepare('INSERT INTO auth_user(id,name,email,emailVerified,createdAt,updatedAt) VALUES(?,?,?,1,?,?)').bind('user-editor-a','Alex Recette','recette@example.com',at,at).run();
  await env.DB.prepare('INSERT INTO hosted_import_budget VALUES(?,0,9500,0)').bind(at.slice(0,7)).run();await env.DB.exec('UPDATE generation_control SET enabled=1; UPDATE trial_policy SET free_enabled=1');
  const source=await createPrivateImport(env,agencyId,'https://fixtures.bienvu.example/vente','editor-source-key-001',fixtureImportTransport());assert.equal(source.status,'ready');
  let draft=await customizeImportedListing(env,agencyId,source.id,'editor-customize-key-001',AbortSignal.timeout(20000));
  const musicBytes=toneFixture(1000),music=await putEditorMusic(env,agencyId,draft.id,'music-editor-asset-001',musicBytes);
  assert.equal(music.durationMs,1000);assert.deepEqual(await putEditorMusic(env,agencyId,draft.id,'music-editor-asset-001',musicBytes),music);
  await assert.rejects(putEditorMusic(env,agencyId,draft.id,'music-editor-asset-001',toneFixture(2000)),/CONFLICT/);
  await assert.rejects(putEditorMusic(env,'editor-b',draft.id,'music-editor-asset-002',musicBytes),/NOT_FOUND/);
  await assert.rejects(putEditorMusic(env,agencyId,draft.id,'music-editor-asset-002',toneFixture(1000,true)),/VALIDATION_ERROR/);
  const range=await privateEditorMusic(env,agencyId,draft.id,music.assetId,new Request('https://test/music',{headers:{Range:'bytes=0-43'}}));
  assert.equal(range.status,206);assert.equal((await range.arrayBuffer()).byteLength,44);
  assert.equal((await privateEditorMusic(env,agencyId,draft.id,music.assetId,new Request('https://test/music',{headers:{Range:'bytes=999999999-'}}))).status,416);
  await assert.rejects(privateEditorMusic(env,'editor-b',draft.id,music.assetId,new Request('https://test/music')),/NOT_FOUND/);
  const editor=createEditorDocument([draft.photos[2],draft.photos[0],draft.photos[1]],draft.data.fields,{durationSeconds:40,aspectRatio:'16:9',voiceEnabled:false,subtitlesEnabled:false});
  editor.music={...music,name:'Musique personnelle',volume:.15,startFrame:30,trimFromFrame:0};
  const settings={...defaultVideoCustomization(),photoOrder:[2,0,1],editor,narration:speech,runwayPhotos:[2]};
  draft=await patchCreationDraft(env.DB,agencyId,draft.id,{version:draft.version,changes:{transaction:'rent',priceCents:120000,charges:'included'},confirm:[],videoCustomization:settings});
  assert.equal(draft.data.fields.priceCents,120000,'Prix explicitement donné lors du changement de transaction');
  const version=draft.version,input=await snapshotEditorExport(env,agencyId,draft.id,version,'editor-export-key-001',AbortSignal.timeout(20000));
  assert.ok('listingId' in input);if(!('listingId' in input))throw Error('NOT_SNAPSHOT');assert.notEqual(input.listingId,draft.id);
  assert.equal((await findImport(env.DB,agencyId,draft.id))!.status,'importing');assert.equal((await findCreationDraft(env.DB,agencyId,draft.id))!.version,version);
  const snapshot=(await findImport(env.DB,agencyId,input.listingId))!,listing=JSON.parse(snapshot.result!);
  assert.equal(snapshot.status,'ready');assert.equal(listing.transaction,'rent');assert.equal(listing.facts.price.value.amountCents,120000);
  assert.notEqual(input.customization!.editor!.music!.assetId,music.assetId);assert.equal(input.voiceEnabled,false);assert.equal(input.durationSeconds,40);assert.equal(input.aspectRatio,'16:9');
  assert.deepEqual(await snapshotEditorExport(env,agencyId,draft.id,version,'editor-export-key-001',AbortSignal.timeout(20000)),input);
  await assert.rejects(snapshotEditorExport(env,'editor-b',draft.id,version,'editor-foreign-export-001',AbortSignal.timeout(20000)),/NOT_FOUND/);
  await assert.rejects(snapshotEditorExport(env,agencyId,draft.id,version+1,'editor-export-key-001',AbortSignal.timeout(20000)),/CONFLICT/);
  assert.equal((await env.DB.prepare('SELECT count(*) n FROM generation_runs').first<{n:number}>())!.n,0);
  const before=(await generationRights(env.DB,agencyId,'true')).developmentRemaining;
  const badInput={...input,customization:{...input.customization,editor:{...input.customization!.editor!,music:{...input.customization!.editor!.music!,durationMs:2000}}}};
  await assert.rejects(admitGeneration(env.DB,agencyId,'editor-invalid-music-001',badInput,'true'),/VALIDATION_ERROR/);
  assert.equal((await generationRights(env.DB,agencyId,'true')).developmentRemaining,before,'Faux média rejeté avant débit');
  const row=await admitGeneration(env.DB,agencyId,'editor-export-key-001',input,'true');assert.equal(row.creditsReserved,2);
  assert.equal((await admitGeneration(env.DB,agencyId,'editor-export-key-001',input,'true')).jobId,row.jobId);
  await env.DB.prepare("UPDATE jobs SET status='scripting',stage='scripting',listing_id=? WHERE id=?").bind(input.listingId,row.jobId).run();
  await prepareJobNarration(env,agencyId,row.jobId,{mode:'mock',script:{model:'gpt-5.4-mini',plan:async()=>{throw Error('NO_OPENAI');}},voice:{config:FishVoiceConfig.parse({voice:'fish-manon'}),synthesize:async()=>{throw Error('NO_TTS');}}});
  const frozen=await prepareJobVideo(env,agencyId,row.jobId);
  assert.equal(frozen.manifest.music!.asset.id,input.customization!.editor!.music!.assetId);assert.deepEqual(frozen.manifest.editor!.clips.map(c=>c.photoSlot),[0,1,2]);
  assert.equal(frozen.manifest.width,1920);assert.equal(frozen.manifest.height,1080);assert.equal(frozen.manifest.audio.length,0);
  assert.equal((await prepareJobVideo(env,agencyId,row.jobId)).hash,frozen.hash);
  const report={...videoReport(frozen.hash,frozen.manifest),audioCodec:'aac' as const},key=`agencies/${agencyId}/jobs/${row.jobId}/video/output.mp4`;
  await env.DB.batch([env.DB.prepare('INSERT INTO generation_artifacts VALUES(?,?,?,?)').bind(row.jobId,key,JSON.stringify(report),at),env.DB.prepare("UPDATE jobs SET status='ready',lease_until=NULL WHERE id=?").bind(row.jobId)]);
  const jobs=(await env.DB.prepare('SELECT count(*) n FROM generation_runs').first<{n:number}>())!.n,
    cloned=await editExistingVideo(env,agencyId,row.jobId,'editor-retouch-key-001',AbortSignal.timeout(20000));
  assert.notEqual(cloned.id,draft.id);assert.equal(cloned.photos.length,3);assert.deepEqual(cloned.data.videoCustomization!.editor!.clips.map(c=>c.photoSlot),[0,1,2]);
  assert.deepEqual(cloned.data.videoCustomization!.runwayPhotos,[0]);assert.notEqual(cloned.data.videoCustomization!.editor!.music!.assetId,input.customization!.editor!.music!.assetId);
  assert.equal(cloned.data.fields.priceCents,120000);assert.equal(cloned.data.fields.transaction,'rent');
  assert.equal((await editExistingVideo(env,agencyId,row.jobId,'editor-retouch-key-001',AbortSignal.timeout(20000))).id,cloned.id);
  await assert.rejects(editExistingVideo(env,'editor-b',row.jobId,'editor-retouch-key-001',AbortSignal.timeout(20000)),/NOT_FOUND/);
  assert.equal((await env.DB.prepare('SELECT object_key AS k FROM generation_artifacts WHERE job_id=?').bind(row.jobId).first<{k:string}>())!.k,key,'MP4 original conservé');
  assert.equal((await env.DB.prepare('SELECT count(*) n FROM generation_runs').first<{n:number}>())!.n,jobs,'Retoucher ne débite aucun crédit');
  const musicRow=await env.DB.prepare('SELECT object_key AS k FROM editor_music_assets WHERE agency_id=? AND import_id=?').bind(agencyId,cloned.id).first<{k:string}>();assert.ok(musicRow);
  await deleteCreationDraft(env,agencyId,cloned.id);assert.equal(await env.MEDIA.head(musicRow!.k),null,'La suppression inclut la musique privée');
  assert.equal((await findCreationDraft(env.DB,agencyId,draft.id))!.status,'needs_input','Le projet d’origine reste modifiable');
});
