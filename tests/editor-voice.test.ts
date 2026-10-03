import {test} from 'node:test';
import assert from 'node:assert/strict';
import {Miniflare,convertV4MiniflareOptions} from 'miniflare';
import {GoogleVoiceConfig,createEditorDocument,defaultVideoCustomization,editorCanReuseVoice,editorVoiceCaption,type EditorVoicePreview} from '../packages/contracts/src/index';
import {googleTts} from '../packages/voice/src/index';
import {findCreationDraft,findEditorVoiceSource,admitGeneration,generationRights,createAnonymousSession,admitAnonymous,claimTrial} from '../packages/db/src/index';
import {migrateNarrationProbe} from '../scripts/narration-fixtures';
import {fixtureImportTransport} from '../scripts/import-fixtures';
import {toneFixture} from '../fixtures/voice';
import {videoReport} from '../fixtures/video';
import {createPrivateImport} from '../apps/web/lib/imports';
import {customizeImportedListing,patchCreationDraft,deleteCreationDraft} from '../apps/web/lib/creation-drafts';
import {editExistingVideo,snapshotEditorExport,recoverDraftVoice} from '../apps/web/lib/video-editor';
import {editorVoicePreview,privateEditorVoice} from '../apps/web/lib/editor-voice';
import {prepareJobNarration} from '../apps/pipeline/src/narration';
import {prepareJobVideo} from '../apps/pipeline/src/video-manifest';

const speech=['Découvrez ce bien à travers une visite en images.','Prenons le temps de parcourir les lieux.',
  'Retrouvez les informations de cette annonce dans votre vidéo.','Pour en savoir plus, contactez votre agence.'];
test('Voix d’éditeur : métadonnées bornées, timings, sous-titres et changements de texte/voix/durée',()=>{
  const source:EditorVoicePreview={id:'source-test',voice:'fish-manon',durationSeconds:20,clips:speech.map((text,i)=>({assetId:'asset-'+i,startFrame:i*150,durationMs:1000,text,waveform:Array(64).fill(.5)}))};
  const settings={...defaultVideoCustomization(),voiceSourceId:source.id,narration:speech,editor:createEditorDocument([],{}, {})};
  assert.equal(editorCanReuseVoice(settings,source),true);
  for(const different of [{...settings,voice:'fish-lucas'},{...settings,narration:[...speech.slice(0,3),'Une autre conclusion.']},
    {...settings,editor:{...settings.editor,durationSeconds:40 as const}},{...settings,voiceSourceId:'elsewhere'}])assert.equal(editorCanReuseVoice(different,source),false);
  assert.equal(editorVoiceCaption(source,0),speech[0]);assert.equal(editorVoiceCaption(source,35),null);assert.equal(editorVoiceCaption(source,150),speech[1]);
});

test('Voix d’éditeur D1/R2 : WAV privés retrouvés, timings identiques à l’export et zéro nouvel appel fournisseur',async t=>{
  const mf=new Miniflare(convertV4MiniflareOptions({modules:true,script:'export default {fetch(){return new Response("test")}}',compatibilityDate:'2026-09-27',d1Databases:['DB'],r2Buckets:['MEDIA']}));t.after(()=>mf.dispose());
  const env=await mf.getBindings<{DB:D1Database;MEDIA:R2Bucket}>();await migrateNarrationProbe(env.DB);
  const at=new Date().toISOString(),agencyId='voice-editor-a';
  for(const id of [agencyId,'voice-editor-b'])await env.DB.prepare('INSERT INTO agencies(id,owner_user_id,name,email,created_at,updated_at) VALUES(?,?,?,?,?,?)').bind(id,'user-'+id,'Votre agence','recette@example.com',at,at).run();
  await env.DB.prepare('INSERT INTO auth_user(id,name,email,emailVerified,createdAt,updatedAt) VALUES(?,?,?,1,?,?)').bind('user-voice-editor-a','Alex Recette','recette@example.com',at,at).run();
  await env.DB.prepare('INSERT INTO hosted_import_budget VALUES(?,0,9500,0)').bind(at.slice(0,7)).run();await env.DB.exec('UPDATE generation_control SET enabled=1; UPDATE trial_policy SET free_enabled=1');
  const imported=await createPrivateImport(env,agencyId,'https://fixtures.bienvu.example/vente','voice-editor-import-001',fixtureImportTransport());
  let draft=await customizeImportedListing(env,agencyId,imported.id,'voice-editor-source-001',AbortSignal.timeout(20000));
  const editor=createEditorDocument(draft.photos.slice(0,3),draft.data.fields,{durationSeconds:20});
  const config=GoogleVoiceConfig.parse({projectId:'fixture-project',voice:'fr-FR-Chirp3-HD-Aoede'});
  const settings={...defaultVideoCustomization(),voice:'fr-FR-Chirp3-HD-Aoede' as const,photoOrder:[0,1,2],runwayPhotos:[],narration:speech,editor};
  draft=await patchCreationDraft(env.DB,agencyId,draft.id,{version:draft.version,changes:{},confirm:[],videoCustomization:settings});
  const input=await snapshotEditorExport(env,agencyId,draft.id,draft.version,'voice-editor-first-export-001',AbortSignal.timeout(20000));
  if(!('listingId' in input))throw Error('NO_SNAPSHOT');
  const original=await admitGeneration(env.DB,agencyId,'voice-editor-first-export-001',input,'true');
  await env.DB.prepare("UPDATE jobs SET status='scripting',stage='scripting',listing_id=? WHERE id=?").bind(input.listingId,original.jobId).run();
  let calls=0;
  const tts=googleTts(config,async()=>'fixture-token-never-networked',{fetch:async()=>Response.json({audioContent:Buffer.from(toneFixture([1200,2100,1700,1600][calls++%4])).toString('base64')})});
  const providers={mode:'mock' as const,script:{model:'gpt-5.4-mini',plan:async()=>{throw Error('NO_OPENAI');}},voice:{config,synthesize:tts.synthesize}};
  const narration=await prepareJobNarration(env,agencyId,original.jobId,providers);assert.equal(calls,4);
  const frozen=await prepareJobVideo(env,agencyId,original.jobId),key=`agencies/${agencyId}/jobs/${original.jobId}/video/output.mp4`;
  await env.DB.batch([env.DB.prepare('INSERT INTO generation_artifacts VALUES(?,?,?,?)').bind(original.jobId,key,JSON.stringify(videoReport(frozen.hash,frozen.manifest)),at),env.DB.prepare("UPDATE jobs SET status='ready',lease_until=NULL WHERE id=?").bind(original.jobId)]);
  const before=(await generationRights(env.DB,agencyId,'true')).developmentRemaining;
  const past=new Date(Date.now()-86400_000).toISOString();
  await env.DB.batch([
    env.DB.prepare('UPDATE generation_runs SET expires_at=? WHERE job_id=?').bind(past,original.jobId),
    env.DB.prepare('UPDATE video_manifests SET expires_at=? WHERE job_id=?').bind(past,original.jobId),
    env.DB.prepare('UPDATE narration_runs SET expires_at=? WHERE job_id=?').bind(past,original.jobId),
  ]);
  let cloned=await editExistingVideo(env,agencyId,original.jobId,'voice-editor-copy-001',AbortSignal.timeout(20000));
  const sourceId=cloned.data.videoCustomization!.voiceSourceId!;assert.ok(sourceId);assert.equal((await generationRights(env.DB,agencyId,'true')).developmentRemaining,before);
  const preview=await editorVoicePreview(env,agencyId,cloned.id,sourceId);assert.equal(editorCanReuseVoice(cloned.data.videoCustomization!,preview),true);
  let frame=0;assert.deepEqual(preview.clips.map(c=>c.startFrame),narration.durationFrames.map(duration=>{const from=frame;frame+=duration;return from;}));
  assert.ok(!JSON.stringify(preview).includes('objectKey'));assert.ok(preview.clips.every(c=>c.waveform.length===64));
  const asset=preview.clips[1],range=await privateEditorVoice(env,agencyId,cloned.id,sourceId,asset.assetId,new Request('https://test/audio',{headers:{Range:'bytes=0-43'}}));
  assert.equal(range.status,206);assert.equal((await range.arrayBuffer()).byteLength,44);
  await assert.rejects(editorVoicePreview(env,'voice-editor-b',cloned.id,sourceId),/NOT_FOUND/);
  await assert.rejects(privateEditorVoice(env,agencyId,cloned.id,sourceId,'wrong-asset',new Request('https://test/audio')),/NOT_FOUND/);
  const retouch=await snapshotEditorExport(env,agencyId,cloned.id,cloned.version,'voice-editor-retouch-export-001',AbortSignal.timeout(20000));if(!('listingId' in retouch))throw Error('NO_SNAPSHOT');
  assert.notEqual(retouch.customization!.voiceSourceId,sourceId);
  await assert.rejects(admitGeneration(env.DB,agencyId,'voice-editor-forged-source-001',{...retouch,customization:{...retouch.customization,voiceSourceId:'forged-source'}},'true'),/VALIDATION_ERROR/);
  const job=await admitGeneration(env.DB,agencyId,'voice-editor-retouch-export-001',retouch,'true');
  await env.DB.prepare("UPDATE jobs SET status='scripting',stage='scripting',listing_id=? WHERE id=?").bind(retouch.listingId,job.jobId).run();
  const forbidden={...providers,voice:{config,synthesize:async()=>{throw Error('NO_NEW_TTS');}}};
  const recovered=await prepareJobNarration(env,agencyId,job.jobId,forbidden);
  assert.deepEqual(recovered.durationFrames,narration.durationFrames);assert.deepEqual(recovered.audio.map(a=>a.sha256),narration.audio.map(a=>a.sha256));
  assert.deepEqual(await prepareJobNarration(env,agencyId,job.jobId,forbidden),recovered);
  const rendered=await prepareJobVideo(env,agencyId,job.jobId);assert.deepEqual(rendered.manifest.scenes.map(s=>s.durationFrames),frozen.manifest.scenes.map(s=>s.durationFrames));
  assert.equal((await env.DB.prepare('SELECT count(*) n FROM narration_calls WHERE job_id=?').bind(job.jobId).first<{n:number}>())!.n,0);assert.equal(calls,4);
  await env.DB.batch([env.DB.prepare('INSERT INTO generation_artifacts VALUES(?,?,?,?)').bind(job.jobId,`agencies/${agencyId}/jobs/${job.jobId}/video/output.mp4`,JSON.stringify(videoReport(rendered.hash,rendered.manifest)),at),env.DB.prepare("UPDATE jobs SET status='ready',lease_until=NULL WHERE id=?").bind(job.jobId)]);
  // An intentional narration change leaves the old audio intact and uses TTS.
  cloned=await patchCreationDraft(env.DB,agencyId,cloned.id,{version:cloned.version,changes:{},confirm:[],videoCustomization:{...cloned.data.videoCustomization!,narration:['Une nouvelle visite de ce bien vous attend.',...speech.slice(1)]}});
  assert.equal(editorCanReuseVoice(cloned.data.videoCustomization!,preview),false);
  const changed=await snapshotEditorExport(env,agencyId,cloned.id,cloned.version,'voice-editor-changed-export-001',AbortSignal.timeout(20000));if(!('listingId' in changed))throw Error('NO_SNAPSHOT');
  const changedJob=await admitGeneration(env.DB,agencyId,'voice-editor-changed-export-001',changed,'true');
  await env.DB.prepare("UPDATE jobs SET status='scripting',stage='scripting',listing_id=? WHERE id=?").bind(changed.listingId,changedJob.jobId).run();
  const changedVoice=await prepareJobNarration(env,agencyId,changedJob.jobId,providers);assert.equal(changedVoice.script.scenes[0].narrationText,'Une nouvelle visite de ce bien vous attend.');assert.equal(calls,8);
  // Recover a pre-fix project without replacing the user's visual changes.
  const old=await editExistingVideo(env,agencyId,original.jobId,'voice-editor-legacy-copy-001',AbortSignal.timeout(20000)),oldSettings={...old.data.videoCustomization!};delete oldSettings.voiceSourceId;
  oldSettings.editor={...oldSettings.editor!,layers:oldSettings.editor!.layers.map(l=>({...l,text:'Retouche conservée'}))};
  await patchCreationDraft(env.DB,agencyId,old.id,{version:old.version,changes:{title:'Titre retouché'},confirm:[],videoCustomization:oldSettings});
  await env.DB.prepare('DELETE FROM editor_voice_sources WHERE import_id=?').bind(old.id).run();
  const legacy=await recoverDraftVoice(env,agencyId,old.id,AbortSignal.timeout(20000));assert.ok(legacy.data.videoCustomization!.voiceSourceId);assert.equal(legacy.data.fields.title,'Titre retouché');assert.deepEqual(legacy.data.videoCustomization!.editor!.layers,oldSettings.editor.layers);
  const stored=(await findEditorVoiceSource(env.DB,agencyId,cloned.id,sourceId))!;
  await env.MEDIA.delete(frozen.manifest.audio.map(a=>a.objectKey));
  assert.equal((await privateEditorVoice(env,agencyId,cloned.id,sourceId,preview.clips[0].assetId,new Request('https://test/audio'))).status,200,'La copie reste lisible après suppression des WAV du job d’origine');
  await deleteCreationDraft(env,agencyId,cloned.id);for(const a of stored.audio)assert.equal(await env.MEDIA.head(a.objectKey),null);
  assert.equal(await findEditorVoiceSource(env.DB,agencyId,cloned.id,sourceId),null);assert.ok(await findCreationDraft(env.DB,agencyId,draft.id));
  // A claimed anonymous video keeps its immutable media in the guest scope.
  const changedManifest=await prepareJobVideo(env,agencyId,changedJob.jobId);
  await env.DB.batch([env.DB.prepare('INSERT INTO generation_artifacts VALUES(?,?,?,?)').bind(changedJob.jobId,`agencies/${agencyId}/jobs/${changedJob.jobId}/video/output.mp4`,JSON.stringify(videoReport(changedManifest.hash,changedManifest.manifest)),at),env.DB.prepare("UPDATE jobs SET status='ready',lease_until=NULL WHERE id=?").bind(changedJob.jobId)]);
  await env.DB.exec('UPDATE trial_policy SET enabled=1');
  const {session}=await createAnonymousSession(env.DB),guest=await admitAnonymous(env.DB,session,'voice-editor-guest-001',{
    url:'https://www.century21.fr/trouver_logement/detail/123456789/',durationSeconds:20,
    customization:{...defaultVideoCustomization(),voice:'fr-FR-Chirp3-HD-Aoede',narration:speech}},
    {ipHmac:'a'.repeat(64),turnstileHash:'b'.repeat(64)},'true');
  const guestImport=await createPrivateImport(env,session.scopeId,'https://fixtures.bienvu.example/vente','voice-editor-guest-import-001',fixtureImportTransport());
  await env.DB.prepare("UPDATE jobs SET status='scripting',stage='scripting',listing_id=? WHERE id=?").bind(guestImport.id,guest.jobId).run();
  await prepareJobNarration(env,session.scopeId,guest.jobId,providers);
  const guestVideo=await prepareJobVideo(env,session.scopeId,guest.jobId);
  await env.DB.batch([env.DB.prepare('INSERT INTO generation_artifacts VALUES(?,?,?,?)').bind(guest.jobId,`agencies/${session.scopeId}/jobs/${guest.jobId}/video/output.mp4`,JSON.stringify(videoReport(guestVideo.hash,guestVideo.manifest)),at),
    env.DB.prepare('INSERT INTO generation_previews VALUES(?,?,?,?)').bind(guest.jobId,`agencies/${session.scopeId}/jobs/${guest.jobId}/video/preview.mp4`,'{}',at),env.DB.prepare("UPDATE jobs SET status='ready',lease_until=NULL WHERE id=?").bind(guest.jobId)]);
  await assert.rejects(editExistingVideo(env,agencyId,guest.jobId,'voice-editor-guest-copy-001',AbortSignal.timeout(20000)),/NOT_FOUND/);
  await claimTrial(env.DB,session,agencyId,guest.jobId);
  const guestCopy=await editExistingVideo(env,agencyId,guest.jobId,'voice-editor-guest-copy-001',AbortSignal.timeout(20000));
  const guestSource=await findEditorVoiceSource(env.DB,agencyId,guestCopy.id,guestCopy.data.videoCustomization!.voiceSourceId!);
  assert.ok(guestSource);assert.ok(guestSource.audio.every(a=>a.objectKey.startsWith(`agencies/${agencyId}/imports/${guestCopy.id}/voice/`)));
  assert.deepEqual(guestSource.audio.map(a=>a.sha256),guestVideo.manifest.audio.map(a=>a.sha256));
  await assert.rejects(editorVoicePreview(env,'voice-editor-b',guestCopy.id,guestSource.preview.id),/NOT_FOUND/);
  const guestSettings={...guestCopy.data.videoCustomization!};delete guestSettings.voiceSourceId;
  await patchCreationDraft(env.DB,agencyId,guestCopy.id,{version:guestCopy.version,changes:{},confirm:[],videoCustomization:guestSettings});
  await env.DB.prepare('DELETE FROM editor_voice_sources WHERE import_id=?').bind(guestCopy.id).run();
  assert.ok((await recoverDraftVoice(env,agencyId,guestCopy.id,AbortSignal.timeout(20000))).data.videoCustomization!.voiceSourceId);
});
