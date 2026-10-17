import {test} from 'node:test';
import assert from 'node:assert/strict';
import {Miniflare,convertV4MiniflareOptions} from 'miniflare';
import {DEFAULT_MUSIC_VOLUME,VideoMusic,defaultVideoCustomization,GenerationRequest,VideoManifest,createEditorDocument,
  musicForTimeline,defaultEditorMix,editorMusicGain,editorMusicFrames,editorHasAudio,generationCreditCost,GoogleVoiceConfig} from '../packages/contracts/src/index';
import {videoFixture,videoReport} from '../fixtures/video';
import {toneFixture} from '../fixtures/voice';
import {migrateNarrationProbe} from '../scripts/narration-fixtures';
import {fixtureImportTransport} from '../scripts/import-fixtures';
import {createPrivateImport} from '../apps/web/lib/imports';
import {customizeImportedListing,patchCreationDraft,finishCreationDraft} from '../apps/web/lib/creation-drafts';
import {uploadLibraryMusic,attachLibraryMusic,updateLibraryMusic} from '../apps/web/lib/music-library';
import {editExistingVideo} from '../apps/web/lib/video-editor';
import {admitGeneration,generationRights} from '../packages/db/src/index';
import {prepareJobNarration} from '../apps/pipeline/src/narration';
import {prepareJobVideo} from '../apps/pipeline/src/video-manifest';
import {googleTts} from '../packages/voice/src/index';
import {trialInput} from '../packages/db/src/anonymous';

const selection=VideoMusic.parse({assetId:'private-music',libraryId:'library-music',name:'Piano doux',durationMs:3000,volume:DEFAULT_MUSIC_VOLUME});
test('Musique Personnaliser : choix strict, gain bas, boucle, baisse sur la voix et fondus',async()=>{
  const customization={...defaultVideoCustomization(),music:selection},input={listingId:'listing-music',customization};
  assert.ok(GenerationRequest.safeParse(input).success);assert.equal(generationCreditCost(customization,20),1);
  assert.throws(()=>trialInput(input),/VALIDATION_ERROR/,'Un visiteur ne peut référencer une piste privée');
  for(const music of [{...selection,volume:-.01},{...selection,volume:1.01},{...selection,durationMs:300001},
    {...selection,url:'https://other.example/private.wav'},{...selection,assetId:'../private'}])assert.equal(GenerationRequest.safeParse({...input,customization:{...customization,music}}).success,false);
  assert.equal(GenerationRequest.safeParse({url:'https://www.orpi.com/annonce-vente-test/',customization}).success,false);
  const doc=createEditorDocument([{sourceOrder:0},{sourceOrder:1},{sourceOrder:2}],{});
  assert.equal(GenerationRequest.safeParse({...input,durationSeconds:20,aspectRatio:'9:16',customization:{...customization,photoOrder:[0,1,2],editor:doc}}).success,false);
  for(const total of [600,900,1200]){
    const music=musicForTimeline(selection,total),mix={music,durationSeconds:total/30,voiceEnabled:true,audioMix:defaultEditorMix};
    assert.equal(music.loop,true);assert.equal(editorMusicFrames(mix),total);assert.equal('libraryId' in music,false);
    assert.equal(editorMusicGain(mix,0),0);assert.equal(editorMusicGain(mix,total),0);
    assert.ok(editorMusicGain(mix,total-1)<editorMusicGain(mix,300));
    assert.equal(editorMusicGain(mix,100,[{startFrame:60,durationMs:3000}]),DEFAULT_MUSIC_VOLUME*defaultEditorMix.duckLevel);
    assert.equal(editorMusicGain({...mix,voiceEnabled:false},100,[{startFrame:60,durationMs:3000}]),DEFAULT_MUSIC_VOLUME);
  }
  const fixture=await videoFixture('paid'),asset={id:selection.assetId,objectKey:`agencies/${fixture.manifest.agencyId}/jobs/${fixture.manifest.jobId}/music/test.wav`,
    sha256:'a'.repeat(64),sizeBytes:144044,mime:'audio/wav' as const,durationMs:selection.durationMs};
  const silent={...fixture.manifest,voiceEnabled:false,subtitlesEnabled:false,audio:[],scenes:fixture.manifest.scenes.map(s=>({...s,audioAssetId:null}))};
  const manifest=VideoManifest.parse({...silent,music:{asset,settings:selection}});assert.equal(editorHasAudio(manifest),true);
  assert.equal(editorHasAudio({...manifest,music:{asset,settings:{...selection,volume:0}}}),false);
  assert.equal(VideoManifest.safeParse({...silent,music:{asset}}).success,false);
  assert.equal(VideoManifest.safeParse({...manifest,music:{asset:{...asset,durationMs:3001},settings:selection}}).success,false);
  assert.equal(VideoManifest.safeParse({...manifest,music:{asset:{...asset,objectKey:'agencies/other/jobs/other/music/test.wav'},settings:selection}}).success,false);
});

test('Musique D1/R2 : choix privé, admission sans supplément, rendu figé et réouverture dans l’Éditeur',async t=>{
  const mf=new Miniflare(convertV4MiniflareOptions({modules:true,script:'export default {fetch(){return new Response("test")}}',compatibilityDate:'2026-09-27',d1Databases:['DB'],r2Buckets:['MEDIA']}));t.after(()=>mf.dispose());
  const env=await mf.getBindings<{DB:D1Database;MEDIA:R2Bucket}>();await migrateNarrationProbe(env.DB);
  const at=new Date().toISOString(),agencyId='music-customizer';
  await env.DB.prepare('INSERT INTO agencies(id,owner_user_id,name,email,created_at,updated_at) VALUES(?,?,?,?,?,?)').bind(agencyId,'music-user','Agence de recette','recette@example.com',at,at).run();
  await env.DB.prepare('INSERT INTO auth_user(id,name,email,emailVerified,createdAt,updatedAt) VALUES(?,?,?,1,?,?)').bind('music-user','Recette','recette@example.com',at,at).run();
  await env.DB.prepare('INSERT INTO hosted_import_budget VALUES(?,0,9500,0)').bind(at.slice(0,7)).run();
  await env.DB.exec("UPDATE generation_control SET enabled=1; UPDATE trial_policy SET free_enabled=1; UPDATE video_map_settings SET settings_json=json_set(settings_json,'$.enabled',0)");
  const source=await createPrivateImport(env,agencyId,'https://fixtures.bienvu.example/vente','music-source-key-001',fixtureImportTransport());assert.equal(source.status,'ready');
  let draft=await customizeImportedListing(env,agencyId,source.id,'music-customize-key-001',AbortSignal.timeout(20000));
  const track=await uploadLibraryMusic(env,'music-user','music-library-original',{name:'Piano doux',description:'Recette',license:'Composition de test'},toneFixture(3000)),
    attached=await attachLibraryMusic(env,agencyId,draft.id,track.id),music=VideoMusic.parse({assetId:attached.assetId,libraryId:track.id,name:track.name,durationMs:attached.durationMs,volume:.15}),
    settings={...defaultVideoCustomization(),voice:'fr-FR-Chirp3-HD-Kore' as const,photoOrder:draft.photos.map(photo=>photo.sourceOrder),mapDisabled:true,music,
      narration:['Découvrez ce bien à travers une visite en images.','Prenons le temps de parcourir les lieux.','Retrouvez les informations de cette annonce dans votre vidéo.','Pour en savoir plus, contactez votre agence.']};
  draft=await patchCreationDraft(env.DB,agencyId,draft.id,{version:draft.version,changes:{},confirm:[],videoCustomization:settings});
  assert.deepEqual(draft.data.videoCustomization?.music,music);await finishCreationDraft(env,agencyId,draft.id,draft.version);
  const before=(await generationRights(env.DB,agencyId,'true')).developmentRemaining;
  for(const change of [{assetId:'foreign-asset'},{durationMs:4000}])await assert.rejects(admitGeneration(env.DB,agencyId,'music-invalid-'+Object.keys(change)[0],{listingId:draft.id,customization:{...settings,music:{...music,...change}}},'true'),/VALIDATION_ERROR/);
  assert.equal((await generationRights(env.DB,agencyId,'true')).developmentRemaining,before);
  await updateLibraryMusic(env,'music-user',track.id,{name:track.name,description:track.description,license:track.license,revision:track.revision,active:false});
  const config=GoogleVoiceConfig.parse({projectId:'music-fixture',voice:settings.voice});let speechCalls=0;
  const tts=googleTts(config,async()=>'fixture-token-never-networked',{fetch:async()=>{speechCalls++;return Response.json({audioContent:Buffer.from(toneFixture(1000)).toString('base64')});}}),
    providers={mode:'mock' as const,script:{model:'gpt-5.4-mini',plan:async():Promise<never>=>{throw Error('NO_EXTERNAL_SCRIPT');}},voice:{config,synthesize:tts.synthesize}};
  for(const [i,voiceEnabled]of [false,true].entries()){
    const key='music-generation-key-00'+i,input={listingId:draft.id,customization:settings,durationSeconds:20 as const,aspectRatio:i?'9:16' as const:'16:9' as const,voiceEnabled,subtitlesEnabled:false},
      row=await admitGeneration(env.DB,agencyId,key,input,'true');assert.equal(row.creditsReserved,1);
    assert.equal((await admitGeneration(env.DB,agencyId,key,input,'true')).jobId,row.jobId);
    await env.DB.prepare("UPDATE jobs SET status='scripting',stage='scripting',listing_id=? WHERE id=?").bind(draft.id,row.jobId).run();
    await prepareJobNarration(env,agencyId,row.jobId,providers);const frozen=await prepareJobVideo(env,agencyId,row.jobId);
    assert.equal(frozen.manifest.editor,undefined);assert.deepEqual(frozen.manifest.music?.settings,music);assert.equal(frozen.manifest.music?.asset.normalizationGain,attached.normalizationGain);
    assert.equal(editorHasAudio(frozen.manifest),true);assert.equal(frozen.manifest.voiceEnabled===false,!voiceEnabled);
    assert.equal((await prepareJobVideo(env,agencyId,row.jobId)).hash,frozen.hash);
    const bytes=await env.MEDIA.get(frozen.manifest.music!.asset.objectKey);assert.deepEqual(new Uint8Array(await bytes!.arrayBuffer()),toneFixture(3000));
    await env.DB.prepare('INSERT INTO generation_artifacts VALUES(?,?,?,?)').bind(row.jobId,`agencies/${agencyId}/jobs/${row.jobId}/output.mp4`,JSON.stringify(videoReport(frozen.hash,frozen.manifest)),at).run();
    await env.DB.prepare("UPDATE jobs SET status='ready',stage='rendering',lease_until=NULL WHERE id=?").bind(row.jobId).run();
    const reopened=await editExistingVideo(env,agencyId,row.jobId,'music-edit-result-00'+i,AbortSignal.timeout(20000));
    assert.equal(reopened.data.videoCustomization?.music,undefined);assert.equal(reopened.data.videoCustomization?.editor?.music?.volume,.15);
    assert.equal(reopened.data.videoCustomization?.editor?.music?.name,track.name);assert.equal(reopened.data.videoCustomization?.editor?.music?.loop,true);
    assert.notEqual(reopened.data.videoCustomization?.editor?.music?.assetId,music.assetId);assert.ok(GenerationRequest.safeParse({listingId:reopened.id,customization:reopened.data.videoCustomization,aspectRatio:input.aspectRatio,durationSeconds:20,voiceEnabled,subtitlesEnabled:false}).success);
  }
  assert.equal(speechCalls,4,'Aucun appel de voix pour la vidéo sans narration, quatre synthèses simulées pour celle avec voix');
});
