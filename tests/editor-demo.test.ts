import {test} from 'node:test';
import assert from 'node:assert/strict';
import {Miniflare,convertV4MiniflareOptions} from 'miniflare';
import {createEditorDocument,defaultVideoCustomization,emptyCreationFields,EditorVoicePreview,editorCanReuseVoice,type PhotoAsset} from '../packages/contracts/src/index';
import {generationRights,admitGeneration,findCreationDraft,retainedAnimations,beginManualImport} from '../packages/db/src/index';
import {migrateNarrationProbe} from '../scripts/narration-fixtures';
import {fixtureImportTransport} from '../scripts/import-fixtures';
import {toneFixture} from '../fixtures/voice';
import {contentHash} from '../apps/web/lib/manual-listings';
import {createPrivateImport} from '../apps/web/lib/imports';
import {startManualCreationDraft,patchCreationDraft} from '../apps/web/lib/creation-drafts';
import {buildEditorDemo,editorDemo,demoObjectKey,guestAgency} from '../apps/web/lib/editor-demo';
import {demoByteRange,publicDemoMedia,copyDemoMedia} from '../apps/web/lib/editor-demo-media';
import {newGuestRecord,parseGuestRecord,guestResources} from '../apps/web/lib/editor-guest';

test('Démo publique : copie portable, aucun identifiant de compte ni chemin privé, médias conservés',()=>{
  const publicDemo=editorDemo(),before=JSON.stringify(publicDemo),record=newGuestRecord('demo','guest-test');
  assert.equal(publicDemo.draft.photos.length,4);assert.equal(publicDemo.voice?.clips.length,4);assert.equal(publicDemo.media.length,13);
  assert.equal(editorCanReuseVoice(record.draft.data.videoCustomization!,publicDemo.voice),true);
  assert.equal(guestResources(record.draft.data.videoCustomization!,record.draft.photos).availableAnimations.length,4);
  record.draft.data.videoCustomization!.editor!.layers[0].text='Une retouche locale';
  assert.equal(JSON.stringify(editorDemo()),before,'Une retouche ne doit jamais modifier la démo partagée');
  const empty=newGuestRecord('empty','empty-test');assert.equal(empty.draft.photos.length,0);assert.equal(empty.draft.data.videoCustomization!.editor!.clips.length,0);
  assert.equal(empty.draft.data.videoCustomization!.editor!.layers.length,0);assert.equal(empty.draft.data.fields.title,null);
  assert.equal(guestAgency().email,null);assert.equal(guestAgency().phone,null);
  assert.ok(publicDemo.draft.photos.every(p=>p.agencyId==='editor-demo'&&!p.sourceUrl));
  assert.equal(publicDemo.draft.sourceUrl,null);assert.equal(publicDemo.draft.data.originalText,null);assert.deepEqual(publicDemo.draft.data.provenance,{});
  const rebuilt=buildEditorDemo({fields:emptyCreationFields(),settings:{...defaultVideoCustomization(),editor:createEditorDocument([], {})},photos:[],voice:null,
    animations:[{...publicDemo.media[0],objectKey:'private/DO_NOT_EXPOSE',agencyId:'private-owner'} as typeof publicDemo.media[number]]});
  assert.ok(!JSON.stringify(rebuilt).includes('DO_NOT_EXPOSE'));assert.ok(!JSON.stringify(rebuilt).includes('private-owner'));
});
test('Retouches locales : recharge, champs en cours de saisie, rejet du stockage périmé ou des médias étrangers',()=>{
  const record=newGuestRecord('demo','local-test');record.draft.data.fields.title='A';record.draft.data.fields.priceCents=0;
  assert.ok(parseGuestRecord(record));assert.ok(parseGuestRecord(newGuestRecord('empty','empty-test')));
  assert.equal(parseGuestRecord({...record,savedAt:Date.now()-31*86400_000}),null);
  assert.equal(parseGuestRecord({...record,draft:{...record.draft,photos:[{...record.draft.photos[0],agencyId:'someone-else'}]}}),null);
  assert.equal(parseGuestRecord({...record,draft:{...record.draft,photos:[{...record.draft.photos[0],id:'private-photo'}]}}),null);
  const files=Array.from({length:25},(_,i)=>({id:`file-${i}`,blob:new Blob(['a'])}));assert.equal(parseGuestRecord({...record,files}),null);
  const settings=record.draft.data.videoCustomization!;
  assert.equal(guestResources({...settings,editor:{...settings.editor!,aspectRatio:'16:9'}},record.draft.photos).availableAnimations.length,0);
  assert.equal(guestResources(settings,[{...record.draft.photos[0],contentHash:'a'.repeat(64)}]).availableAnimations.length,0);
});
test('Médias de démo : accès limité à la publication, plages audio/vidéo, HEAD et cache',async()=>{
  const asset=editorDemo().media[0],accesses:string[]=[],bytes=new Uint8Array(64).fill(7),bucket={
    head:async(key:string)=>{accesses.push(key);return {size:asset.sizeBytes};},
    get:async(key:string,options:{range:{offset:number;length:number}})=>{accesses.push(key);return {body:new Blob([bytes.slice(options.range.offset,options.range.offset+options.range.length)]).stream()};},
  } as unknown as Pick<R2Bucket,'head'|'get'>;
  assert.equal((await publicDemoMedia(bucket,'private-source',new Request('https://test/asset'))).status,404);assert.equal(accesses.length,0);
  const response=await publicDemoMedia(bucket,asset.id,new Request('https://test/asset',{headers:{Range:'bytes=0-43'}}));
  assert.equal(response.status,206);assert.equal((await response.arrayBuffer()).byteLength,44);assert.equal(response.headers.get('Content-Range'),`bytes 0-43/${asset.sizeBytes}`);
  assert.ok(accesses.every(key=>key.startsWith('public/editor-demo/')));
  const count=accesses.length,head=await publicDemoMedia(bucket,asset.id,new Request('https://test/asset',{method:'HEAD'}));assert.equal(accesses.length,count+1);assert.equal((await head.arrayBuffer()).byteLength,0);
  assert.equal((await publicDemoMedia(bucket,asset.id,new Request('https://test/asset',{headers:{'If-None-Match':`"${asset.sha256}"`}}))).status,304);
  assert.equal((await publicDemoMedia(bucket,asset.id,new Request('https://test/asset',{headers:{Range:`bytes=${asset.sizeBytes}-`}}))).status,416);
  assert.deepEqual(demoByteRange('bytes=-10',100),{offset:90,length:10});assert.deepEqual(demoByteRange('bytes=10-999',100),{offset:10,length:90});
  for(const range of ['bytes=100-','bytes=-0','bytes=20-10','bytes=0-1,2-3','bytes=9007199254740993-','bytes=-'])assert.equal(demoByteRange(range,100),null);
});
test('Connexion après essai : copies privées idempotentes avec voix, musique et animations, aucun débit et isolation des agences',async()=>{
  const mf=new Miniflare(convertV4MiniflareOptions({modules:true,script:'export default {fetch(){return new Response("fixture")}}',compatibilityDate:'2026-09-27',d1Databases:['DB'],r2Buckets:['MEDIA']}));
  try{const env={DB:await mf.getD1Database('DB'),MEDIA:await mf.getR2Bucket('MEDIA') as unknown as R2Bucket};await migrateNarrationProbe(env.DB);const at=new Date().toISOString();
    for(const id of ['demo-owner-a','demo-owner-b'])await env.DB.prepare('INSERT INTO agencies(id,owner_user_id,name,email,created_at,updated_at) VALUES(?,?,?,?,?,?)').bind(id,'user-'+id,'Agence test','test@example.com',at,at).run();
    for(const id of ['demo-owner-a','demo-owner-b'])await env.DB.prepare('INSERT INTO auth_user(id,name,email,emailVerified,createdAt,updatedAt) VALUES(?,?,?,1,?,?)').bind('user-'+id,'Recette',id+'@example.com',at,at).run();
    await env.DB.prepare('INSERT INTO hosted_import_budget VALUES(?,0,9500,0)').bind(at.slice(0,7)).run();await env.DB.exec('UPDATE generation_control SET enabled=1; UPDATE trial_policy SET free_enabled=1');
    const listing=await createPrivateImport(env,'demo-owner-a','https://fixtures.bienvu.example/vente','demo-origin-fixture-001',fixtureImportTransport());
    const origin=await admitGeneration(env.DB,'demo-owner-a','demo-origin-job-001',{listingId:listing.id},'true');
    for(let i=0;i<30;i++)await beginManualImport(env.DB,'demo-owner-b',`existing-demo-project-${i}`,'{}','a'.repeat(64));
    await env.DB.prepare('UPDATE hosted_import_budget SET paused=1').run();
    await env.DB.prepare('UPDATE import_usage SET attempts=60 WHERE day=?').bind(at.slice(0,10)).run();
    const usageBefore=(await env.DB.prepare('SELECT * FROM import_usage ORDER BY day').all()).results;
    const target=await startManualCreationDraft(env.DB,'demo-owner-b','demo-target-fixture-001'),foreign=await startManualCreationDraft(env.DB,'demo-owner-a','demo-foreign-fixture-001');
    const wav=new Uint8Array(toneFixture(1000)),audioHash=await contentHash(wav),photos:PhotoAsset[]=[],assets:ReturnType<typeof editorDemo>['media']=[];
    for(let slot=0;slot<4;slot++){const image=new Uint8Array([255,216,slot,7,255,217]),sha256=await contentHash(image),id=`demo-photo-${slot}`;
      photos.push({id,agencyId:'private-owner',listingId:'private-listing',sourceUrl:null,objectKey:`agencies/private-owner/imports/private-listing/${id}.jpg`,contentHash:sha256,mime:'image/jpeg',width:1024,height:768,sizeBytes:image.length,sourceOrder:slot});
      const asset={id,sha256,sizeBytes:image.length,mime:'image/jpeg' as const,width:1024,height:768};assets.push(asset);await env.MEDIA.put(demoObjectKey(asset),image);
      const animation={id:`demo-animation-${slot}`,sha256:await contentHash(new Uint8Array([slot,0,1,2])),sizeBytes:4,mime:'video/mp4' as const,width:720,height:1280,durationMs:5000};
      assets.push(animation);await env.MEDIA.put(demoObjectKey(animation),new Uint8Array([slot,0,1,2]));
      const voice={id:`demo-voice-${slot}`,sha256:audioHash,sizeBytes:wav.length,mime:'audio/wav' as const,durationMs:1000};assets.push(voice);await env.MEDIA.put(demoObjectKey(voice),wav);
    }
    const music={id:'demo-music',sha256:audioHash,sizeBytes:wav.length,mime:'audio/wav' as const,durationMs:1000};assets.push(music);await env.MEDIA.put(demoObjectKey(music),wav);
    const voice=EditorVoicePreview.parse({id:'private-voice',voice:'fish-manon',durationSeconds:20,clips:photos.map((_,i)=>({assetId:`private-voice-${i}`,startFrame:i*150,durationMs:1000,text:'Découvrez ce bien.',waveform:Array(64).fill(.5)}))});
    const editor=createEditorDocument(photos,{title:'Votre bien',locality:'Lyon'}),snapshot=buildEditorDemo({fields:{...emptyCreationFields(),title:'Votre bien',locality:'Lyon'},photos,voice,
      settings:{...defaultVideoCustomization(),voiceSourceId:voice.id,narration:voice.clips.map(c=>c.text),photoOrder:[0,1,2,3],runwayPhotos:[0,1,2,3],editor},animations:assets});
    const provenance={voice:{originJobId:origin.jobId,durationFrames:[150,150,150,150]},animations:Object.fromEntries(photos.map(p=>[`demo-animation-${p.sourceOrder}`,origin.jobId]))},
      input={draftId:target.id,photos:snapshot.draft.photos.map(p=>({id:p.id,slot:p.sourceOrder})),voice:true,music:true},rights=await generationRights(env.DB,'demo-owner-b','true');
    await assert.rejects(copyDemoMedia(env,'demo-owner-b',{...input,draftId:foreign.id},AbortSignal.timeout(20000),snapshot,provenance),/NOT_FOUND/);
    await assert.rejects(copyDemoMedia(env,'demo-owner-b',{...input,photos:[{id:'private-photo',slot:0}]},AbortSignal.timeout(20000),snapshot,provenance),/VALIDATION_ERROR/);
    await assert.rejects(copyDemoMedia(env,'demo-owner-b',{...input,sourceDraftId:'private'},AbortSignal.timeout(20000),snapshot,provenance),/VALIDATION_ERROR/);
    const copy=await copyDemoMedia(env,'demo-owner-b',input,AbortSignal.timeout(20000),snapshot,provenance),repeat=await copyDemoMedia(env,'demo-owner-b',input,AbortSignal.timeout(20000),snapshot,provenance);
    assert.deepEqual(copy,repeat);assert.equal(copy.draft.photos.length,4);assert.ok(copy.voiceSourceId);assert.ok(copy.music);
    assert.ok(copy.draft.photos.every(p=>p.agencyId==='demo-owner-b'&&p.objectKey.startsWith(`agencies/demo-owner-b/imports/${target.id}/`)));
    const source=await env.DB.prepare('SELECT source_json source FROM editor_voice_sources WHERE id=?').bind(copy.voiceSourceId).first<{source:string}>();
    assert.ok(JSON.parse(source!.source).audio.every((a:{objectKey:string})=>a.objectKey.startsWith(`agencies/demo-owner-b/imports/${target.id}/voice/`)));
    const settings={...snapshot.draft.data.videoCustomization!,voiceSourceId:copy.voiceSourceId,narration:voice.clips.map(c=>c.text)};
    assert.equal((await retainedAnimations(env.DB,'demo-owner-b',{agencyId:'demo-owner-b',photos:copy.draft.photos},settings)).length,4);
    await patchCreationDraft(env.DB,'demo-owner-b',target.id,{version:copy.draft.version,changes:snapshot.draft.data.fields,confirm:[],videoCustomization:settings});
    assert.equal((await findCreationDraft(env.DB,'demo-owner-a',foreign.id))!.version,1);
    assert.deepEqual(await generationRights(env.DB,'demo-owner-b','true'),rights);assert.equal((await env.DB.prepare('SELECT count(*) n FROM generation_runs').first<{n:number}>())!.n,1);
    assert.equal((await env.DB.prepare('SELECT count(*) n FROM animation_library').first<{n:number}>())!.n,4);
    assert.equal((await env.DB.prepare('SELECT count(*) n FROM editor_voice_sources').first<{n:number}>())!.n,1);
    assert.equal((await env.DB.prepare('SELECT count(*) n FROM editor_music_assets').first<{n:number}>())!.n,1);
    assert.equal((await env.DB.prepare("SELECT count(*) n FROM listing_imports WHERE agency_id='demo-owner-b'").first<{n:number}>())!.n,31);
    assert.equal((await env.DB.prepare('SELECT count(*) n FROM hosted_import_costs').first<{n:number}>())!.n,0);
    assert.deepEqual((await env.DB.prepare('SELECT * FROM import_usage ORDER BY day').all()).results,usageBefore);
    assert.equal((await env.DB.prepare('PRAGMA foreign_key_check').all()).results.length,0);
  }finally{await mf.dispose();}
});
