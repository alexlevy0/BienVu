import {test} from 'node:test';
import assert from 'node:assert/strict';
import {randomBytes,createHmac} from 'node:crypto';
import {Miniflare,convertV4MiniflareOptions} from 'miniflare';
import {migrateNarrationProbe} from '../scripts/narration-fixtures';
import {ensureAgency} from '../packages/db/src/index';
import {startManualCreationDraft} from '../apps/web/lib/creation-drafts';
import {createAuth} from '../apps/web/lib/auth';
import {adminMusicRequest,uploadLibraryMusic,updateLibraryMusic,listLibraryMusic,libraryMusicAudio,attachLibraryMusic} from '../apps/web/lib/music-library';
import {privateEditorMusic} from '../apps/web/lib/video-editor';
import {toneFixture} from '../fixtures/voice';
import {measureMusicWav,measureVoiceWav} from '../packages/voice/src/audio';
import {createEditorDocument,EditorDocument,VideoAsset,MUSIC_LIMITS,editorMusicFrames,editorMusicSourceFrame,editorMusicWaveform,editorMusicGain,fitEditorMusic,resizeEditorDocument} from '../packages/contracts/src/index';

test('Musique : source complète, vrais pics PCM et limites de voix conservées',()=>{
  const bytes=toneFixture(120000),view=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength);
  for(let i=0;i<24000*60;i++)view.setInt16(44+i*2,0,true);
  const measured=measureMusicWav(bytes);assert.equal(measured.durationMs,120000);
  assert.equal(measured.waveform.length,MUSIC_LIMITS.waveformPeaks);
  assert.ok(measured.waveform.slice(0,500).every(p=>p===0));assert.ok(measured.waveform.slice(520).every(p=>p>.1));
  assert.throws(()=>measureVoiceWav(bytes));assert.throws(()=>measureMusicWav(toneFixture(1000,true)));
  assert.throws(()=>measureMusicWav(toneFixture(300001)));assert.throws(()=>measureMusicWav(toneFixture(499)));
  const old=toneFixture(1000);old[40]=1;assert.throws(()=>measureMusicWav(old),'Chunks malformés refusés');
  const base={id:'music',objectKey:'agencies/test/jobs/test/music/fixture.wav',sha256:'a'.repeat(64),sizeBytes:14_400_044,mime:'audio/wav',durationMs:300000};
  assert.equal(VideoAsset.safeParse(base).success,true);
  assert.equal(VideoAsset.safeParse({...base,mime:'video/mp4'}).success,false,'Les limites des images et animations ne sont pas élargies');
});

test('Timeline musicale : passage au-delà de 40 s, durée explicite, boucles, fondus et anciens documents',()=>{
  const doc=createEditorDocument([{sourceOrder:0},{sourceOrder:1},{sourceOrder:2}],{},{voiceEnabled:false,subtitlesEnabled:false,durationSeconds:40});
  const peaks=Array.from({length:1024},(_,i)=>i<512?0:.5);
  doc.music={assetId:'music',name:'Longue piste',durationMs:120000,volume:.4,startFrame:60,trimFromFrame:1800,durationFrames:900,loop:false,waveform:peaks};
  assert.ok(EditorDocument.safeParse(doc).success);assert.equal(editorMusicFrames(doc),900);
  assert.equal(editorMusicSourceFrame(doc,59),null);assert.equal(editorMusicSourceFrame(doc,60),1800);
  assert.equal(editorMusicSourceFrame(doc,959),2699);assert.equal(editorMusicSourceFrame(doc,960),null);
  assert.ok(editorMusicWaveform(doc).every(p=>p===.5));assert.equal(editorMusicGain(doc,960),0);
  for(const seconds of [20,30,40] as const){const smaller=resizeEditorDocument(doc,seconds);assert.ok(EditorDocument.safeParse(smaller).success);
    assert.ok(smaller.music!.startFrame+editorMusicFrames(smaller)<=seconds*30);assert.equal(smaller.music!.trimFromFrame,1800);}
  const fitted=fitEditorMusic(doc);assert.equal(fitted.music!.startFrame,0);assert.equal(editorMusicFrames(fitted),1200);
  const short={...doc,music:{...doc.music,durationMs:2000,trimFromFrame:15,startFrame:0,durationFrames:1200,loop:true}};
  assert.ok(EditorDocument.safeParse(short).success);assert.equal(editorMusicSourceFrame(short,45),15);
  assert.equal(editorMusicSourceFrame(short,1199),15+1199%45);assert.equal(editorMusicSourceFrame(short,1200),null);
  assert.ok(editorMusicGain(short,1199)<editorMusicGain(short,500));
  assert.equal(EditorDocument.safeParse({...short,music:{...short.music,loop:false}}).success,false);
  assert.equal(EditorDocument.safeParse({...doc,music:{...doc.music,durationFrames:1200}}).success,false);
  const legacy={...doc,music:{assetId:'old-music',name:'Ancien',durationMs:1000,volume:.2,startFrame:30,trimFromFrame:0}};
  assert.deepEqual(EditorDocument.parse(legacy),legacy);assert.equal(editorMusicFrames(legacy),30);
});

test('Banque D1/R2 : admin vérifié, origine, retries, copie privée, masquage, plages audio et journal',async t=>{
  const mf=new Miniflare(convertV4MiniflareOptions({modules:true,script:'export default {fetch(){return new Response("test")}}',compatibilityDate:'2026-09-27',d1Databases:['DB'],r2Buckets:['MEDIA']}));t.after(()=>mf.dispose());
  const bindings=await mf.getBindings<{DB:D1Database;MEDIA:R2Bucket}>();await migrateNarrationProbe(bindings.DB);
  const env={...bindings,PROBE_MODE:'local',SUPER_ADMIN_EMAIL:'owner@example.com',BETTER_AUTH_URL:'http://localhost:8787',BETTER_AUTH_SECRET:randomBytes(32).toString('hex'),GOOGLE_CLIENT_ID:'',GOOGLE_CLIENT_SECRET:'',AUTH_EMAIL_MODE:'local'};
  const context=await createAuth(env).$context,cookies:string[]=[],users=[];
  for(const [i,email] of ['owner@example.com','regular@example.com','unverified@example.com'].entries()){
    const user={id:crypto.randomUUID(),name:'Musique '+i,email,emailVerified:i<2};users.push(user);
    await env.DB.prepare('INSERT INTO auth_user(id,name,email,emailVerified,createdAt,updatedAt) VALUES(?,?,?,?,?,?)').bind(user.id,user.name,user.email,user.emailVerified?1:0,Date.now(),Date.now()).run();
    let session:{token:string}|null;
    if(user.emailVerified)session=await context.internalAdapter.createSession(user.id);
    else{const token=randomBytes(32).toString('hex');await env.DB.prepare('INSERT INTO auth_session(id,expiresAt,token,createdAt,updatedAt,userId) VALUES(?,?,?,?,?,?)')
      .bind(crypto.randomUUID(),Date.now()+86400_000,token,Date.now(),Date.now(),user.id).run();session={token};}assert.ok(session);
    cookies.push(context.authCookies.sessionToken.name+'='+encodeURIComponent(session.token+'.'+createHmac('sha256',env.BETTER_AUTH_SECRET).update(session.token).digest('base64')));
  }
  const request=(method:string,cookie=cookies[0],origin=env.BETTER_AUTH_URL)=>new Request(env.BETTER_AUTH_URL+'/api/admin/music',{method,headers:{cookie,origin,'Content-Type':'audio/wav','X-Music-Metadata':encodeURIComponent(JSON.stringify({name:'Piano',description:'Calme',license:'Composition originale de test'}))},...(method==='PUT'?{body:toneFixture(1000).buffer as ArrayBuffer}:{})});
  for(const [cookie,status] of [['',401],[cookies[1],403],[cookies[2],401]] as const){
    for(const [method,audio] of [['GET',false],['PUT',true],['PATCH',false],['GET',true]] as const){
      const response=await adminMusicRequest(request(method,cookie),env,'fixture-music',audio);assert.equal(response.status,status);assert.equal(response.headers.get('cache-control'),'private, no-store');}
  }
  assert.equal((await adminMusicRequest(request('PUT',cookies[0],'https://evil.example'),env,'fixture-music',true)).status,403);
  assert.equal((await adminMusicRequest(request('PUT'),env,'fixture-music',true)).status,201);
  const metadata={name:'Piano',description:'Calme',license:'Composition originale de test'},bytes=toneFixture(120000),
    track=await uploadLibraryMusic(env,users[0].id,'full-length-track',metadata,bytes);
  assert.equal(track.durationMs,120000);assert.deepEqual(await uploadLibraryMusic(env,users[0].id,track.id,metadata,bytes),track);
  await assert.rejects(uploadLibraryMusic(env,users[0].id,track.id,metadata,toneFixture(2000)),/CONFLICT/);
  await assert.rejects(uploadLibraryMusic(env,users[0].id,'silent-track',metadata,toneFixture(1000,true)),/VALIDATION_ERROR/);
  const count=await env.DB.prepare('SELECT count(*) AS n FROM music_library').first<{n:number}>();
  await assert.rejects(uploadLibraryMusic({...env,MEDIA:{...env.MEDIA,put:async()=>{throw Error('SIMULATED_R2_FAILURE');}}},users[0].id,'failed-upload',metadata,toneFixture(1000)),/SIMULATED_R2_FAILURE/);
  assert.deepEqual(await env.DB.prepare('SELECT count(*) AS n FROM music_library').first(),count);
  const range=await libraryMusicAudio(env,track.id,new Request('https://test/audio',{headers:{range:'bytes=-44'}}));assert.equal(range.status,206);assert.equal((await range.arrayBuffer()).byteLength,44);
  for(const range of ['bytes=-','bytes=99-0','bytes=99999999999-','bytes=0-1,5-6'])assert.equal((await libraryMusicAudio(env,track.id,new Request('https://test/audio',{headers:{range}}))).status,416);
  const agency=await ensureAgency(env.DB,users[0]),other=await ensureAgency(env.DB,users[1]),draft=await startManualCreationDraft(env.DB,agency.id,'library-copy-key-001','Projet avec musique'),
    attached=await attachLibraryMusic(env,agency.id,draft.id,track.id);
  assert.equal(attached.durationMs,120000);assert.equal(attached.waveform.length,1024);
  assert.deepEqual(await attachLibraryMusic(env,agency.id,draft.id,track.id),attached);
  await assert.rejects(attachLibraryMusic(env,other.id,draft.id,track.id),/NOT_FOUND/);
  const privateRow=await env.DB.prepare('SELECT object_key AS key FROM editor_music_assets WHERE id=?').bind(attached.assetId).first<{key:string}>();
  assert.ok(privateRow?.key.startsWith(`agencies/${agency.id}/imports/${draft.id}/music/`));
  const hidden=await updateLibraryMusic(env,users[0].id,track.id,{...metadata,active:false,revision:track.revision});assert.equal(hidden.active,false);
  await assert.rejects(updateLibraryMusic(env,users[0].id,track.id,{...metadata,active:true,revision:track.revision}),/CONFLICT/);
  assert.equal((await listLibraryMusic(env,new URLSearchParams())).items.some(item=>item.id===track.id),false);
  assert.equal((await listLibraryMusic(env,new URLSearchParams(),true)).items.some(item=>item.id===track.id),true);
  await assert.rejects(attachLibraryMusic(env,agency.id,draft.id,track.id),/NOT_FOUND/);
  await assert.rejects(libraryMusicAudio(env,track.id,new Request('https://test/audio')),/NOT_FOUND/);
  assert.equal((await libraryMusicAudio(env,track.id,new Request('https://test/audio'),true)).status,200);
  assert.equal((await privateEditorMusic(env,agency.id,draft.id,attached.assetId,new Request('https://test/audio'))).status,200,'Le projet conserve sa musique après masquage');
  await assert.rejects(privateEditorMusic(env,other.id,draft.id,attached.assetId,new Request('https://test/audio')),/NOT_FOUND/);
  assert.equal((await env.DB.prepare('SELECT count(*) AS n FROM music_library_events WHERE music_id=?').bind(track.id).first<{n:number}>())!.n,2);
  await assert.rejects(env.DB.prepare('DELETE FROM music_library_events WHERE music_id=?').bind(track.id).run(),/IMMUTABLE_MUSIC_EVENT/);
  const listed=await listLibraryMusic(env,new URLSearchParams({q:"' OR 1=1 --"}));assert.equal(listed.items.length,0);
  await assert.rejects(listLibraryMusic(env,new URLSearchParams({cursor:'../private'})),/VALIDATION_ERROR/);
  assert.ok(!JSON.stringify(await listLibraryMusic(env,new URLSearchParams(),true)).includes('objectKey'),'Aucun chemin de stockage exposé');
});
