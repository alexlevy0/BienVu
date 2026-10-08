import {test} from 'node:test';
import assert from 'node:assert/strict';
import {Miniflare,convertV4MiniflareOptions} from 'miniflare';
import {CartesiaVoiceConfig,CARTESIA_DEFAULT_VOICE,defaultVideoCustomization,createEditorDocument,GenerationRequest,type EditorVoiceSource} from '../packages/contracts/src/index';
import {cartesiaTts,localitySpeechText,LOCALITY_SPEECH_VERSION,voiceCacheKey} from '../packages/voice/src/index';
import {findNarration,narrationJobInput,startNarration,releaseNarration,admitGeneration} from '../packages/db/src/index';
import {DEFAULT_SCRIPT_MODEL,hashJson,scriptContext,scriptPromptVersion} from '../packages/narration/src/index';
import {prepareJobNarration,type NarrationProviders} from '../apps/pipeline/src/narration';
import {announcementVoiceText} from '../apps/web/lib/voices';
import {migrateNarrationProbe,seedNarrationFixture} from '../scripts/narration-fixtures';
import {fixturePlan,fixtureScriptMetrics,narrationListing} from '../fixtures/narration';
import {toneFixture} from '../fixtures/voice';

test('voix : casse des seules villes connues, accents, séparateurs, arrondissements et sigles',()=>{
  for(const [city,input,expected] of [
    ['Lyon','À LYON, DPE D et GES B.','À Lyon, DPE D et GES B.'],
    ['SAINT-ÉTIENNE','Direction SAINT-ÉTIENNE.','Direction Saint-étienne.'],
    ['SANARY-SUR-MER','À SANARY SUR MER, 5 pièces.','À Sanary sur mer, 5 pièces.'],
    ['LA ROCHELLE','À LA ROCHELLE, 200 000 euros.','À La rochelle, 200 000 euros.'],
    ["L’HAŸ-LES-ROSES","À L'HAŸ-LES-ROSES.","À L'haÿ-les-roses."],
    ['ÉVRY','À E\u0301VRY.','À Évry.'],
    ['LYON 6e','À LYON 6e.','À Lyon 6e.'],
    ['LYON','À Lyon, près de LYONNAIS et de LYON 6e.','À Lyon, près de LYONNAIS et de Lyon 6e.'],
    ['SAINT-ÉTIENNE','À Saint-Étienne et à saint-étienne.','À Saint-Étienne et à saint-étienne.'],
  ])assert.equal(localitySpeechText(input,city),expected);
  assert.equal(localitySpeechText('DPE D. GES B. À PARIS.',null),'DPE D. GES B. À PARIS.');
  assert.equal(localitySpeechText('DPE D. GES B. À PARIS.','Lyon'),'DPE D. GES B. À PARIS.');
});

test('superadmin : le texte de comparaison normalise la ville du titre et de la description',()=>{
  const listing=narrationListing();
  listing.facts.locality.value='LYON';listing.facts.title.value='Appartement à LYON';
  listing.description={text:'À LYON, 3 pièces. DPE D, GES B.',sourcePath:'fixture.description',truncated:false};
  const text=announcementVoiceText(listing);
  assert.match(text,/Appartement à Lyon/);assert.match(text,/À Lyon, 3 pièces\. DPE D, GES B\./);
  assert.doesNotMatch(text,/LYON/);assert.equal(listing.facts.locality.value,'LYON');
});

test('Cartesia : transcript réellement envoyé et cache D1/R2 normalisés, anciennes pistes conservées',async t=>{
  const mf=new Miniflare(convertV4MiniflareOptions({modules:true,script:'export default {fetch(){return new Response("fixture")}}',
    compatibilityDate:'2026-09-27',d1Databases:['DB'],r2Buckets:['MEDIA']}));t.after(()=>mf.dispose());
  const env=await mf.getBindings<{DB:D1Database;MEDIA:R2Bucket}>();await migrateNarrationProbe(env.DB);
  const config=CartesiaVoiceConfig.parse({voice:CARTESIA_DEFAULT_VOICE}),transcripts:string[]=[];
  let audioDuration=5000;
  const client=cartesiaTts(config,'cartesia-fixture-key-never-networked',{fetch:async(_url,init)=>{
    transcripts.push(JSON.parse(String(init.body)).transcript);
    return new Response(new Uint8Array(toneFixture(audioDuration)).buffer);
  }});
  const providers:NarrationProviders={mode:'mock',script:{model:DEFAULT_SCRIPT_MODEL,
    plan:async context=>({plan:fixturePlan(context),metrics:fixtureScriptMetrics()})},voice:{config,synthesize:client.synthesize}};
  async function seed(label:string){
    const scope=await seedNarrationFixture(env.DB,label),job=await narrationJobInput(env.DB,scope.agencyId,scope.jobId);
    job.listing.facts.locality.value='SAINT-ÉTIENNE';
    await env.DB.prepare('UPDATE listing_imports SET result_json=? WHERE id=?').bind(JSON.stringify(job.listing),job.listing.id).run();
    return scope;
  }
  const scope=await seed('locality-case');
  const result=await prepareJobNarration(env,scope.agencyId,scope.jobId,providers);
  assert.equal(transcripts.length,result.script.scenes.length);assert.ok(transcripts.some(text=>text.includes('Saint-étienne')));
  assert.ok(transcripts.every(text=>!text.includes('SAINT-ÉTIENNE')));
  assert.match(result.script.scenes[0].captionText,/SAINT-ÉTIENNE/);
  for(const [index,asset] of result.audio.entries())assert.equal(asset.cacheKey,await voiceCacheKey(config,transcripts[index]));
  assert.equal(JSON.parse((await findNarration(env.DB,scope.agencyId,scope.jobId))!.snapshot).localitySpeechVersion,LOCALITY_SPEECH_VERSION);
  const calls=transcripts.length;
  assert.deepEqual(await prepareJobNarration(env,scope.agencyId,scope.jobId,providers),result);assert.equal(transcripts.length,calls);

  // A run started before the fix keeps its frozen cache policy on resume.
  const oldScope=await seed('locality-legacy'),job=await narrationJobInput(env.DB,oldScope.agencyId,oldScope.jobId);
  audioDuration=4000;
  const context=await scriptContext(job.listing,job.brand),configHash=await hashJson({voice:config,scriptModel:providers.script.model,
    promptVersion:scriptPromptVersion(context),mode:providers.mode});
  const {lease}=await startNarration(env.DB,{...oldScope,inputHash:context.inputHash,configHash,
    snapshot:JSON.stringify({listing:context.listing,brand:context.brand,contact:context.contact,copyVersion:context.copyVersion}),mode:'mock',attempt:1});
  await releaseNarration(env.DB,lease);
  const legacy=await prepareJobNarration(env,oldScope.agencyId,oldScope.jobId,providers);
  assert.ok(transcripts.slice(calls).some(text=>text.includes('SAINT-ÉTIENNE')));
  const after=transcripts.length;
  assert.deepEqual(await prepareJobNarration(env,oldScope.agencyId,oldScope.jobId,providers),legacy);assert.equal(transcripts.length,after);

  // An editor export replaces the old spelling-out tracks once, then reuses the
  // corrected tracks even though the visible captions retain their capitals.
  await env.DB.prepare('INSERT INTO hosted_import_budget(month,baseline_cents,ceiling_cents,paused) VALUES(?,0,9500,0)').bind(new Date().toISOString().slice(0,7)).run();
  await env.DB.exec('UPDATE generation_control SET enabled=1');
  await env.DB.prepare('INSERT INTO generation_access VALUES(?,?,1)').bind(oldScope.agencyId,'allocation-locality-legacy').run();
  async function exportVoice(prepared:typeof legacy,label:string){
    const audio:EditorVoiceSource['audio']=[];
    for(const asset of prepared.audio){
      const bytes=await (await env.MEDIA.get(asset.objectKey))!.arrayBuffer(),objectKey=`agencies/${oldScope.agencyId}/imports/${job.listing.id}/voice/${asset.id}.wav`;
      await env.MEDIA.put(objectKey,bytes);audio.push({...asset,objectKey});
    }
    const source:EditorVoiceSource={originJobId:oldScope.jobId,audio,durationFrames:prepared.durationFrames,
      preview:{id:label,voice:config.voice,durationSeconds:20,clips:prepared.script.scenes.map((scene,index)=>({
        assetId:prepared.audio[index].id,text:scene.narrationText,durationMs:prepared.audio[index].durationMs,
        startFrame:prepared.durationFrames.slice(0,index).reduce((a,b)=>a+b,0),waveform:Array(64).fill(.5)}))}};
    await env.DB.prepare('DELETE FROM editor_voice_sources WHERE agency_id=? AND import_id=?').bind(oldScope.agencyId,job.listing.id).run();
    await env.DB.prepare('INSERT INTO editor_voice_sources(id,agency_id,import_id,source_json,created_at) VALUES(?,?,?,?,?)')
      .bind(label,oldScope.agencyId,job.listing.id,JSON.stringify(source),new Date().toISOString()).run();
    await env.DB.exec("UPDATE jobs SET status='failed',error_code='FIXTURE',lease_until=NULL");
    const customization={...defaultVideoCustomization(undefined,config.voice),voiceSourceId:label,narration:source.preview.clips.map(clip=>clip.text),
      photoOrder:job.listing.photos.map(photo=>photo.sourceOrder),editor:createEditorDocument(job.listing.photos,{}, {})};
    const input=GenerationRequest.parse({listingId:job.listing.id,durationSeconds:20,aspectRatio:'9:16',voiceEnabled:true,subtitlesEnabled:true,customization});
    const admitted=await admitGeneration(env.DB,oldScope.agencyId,'locality-export-key-'+label,input,'true');
    await env.DB.prepare("UPDATE jobs SET status='scripting',stage='scripting',listing_id=? WHERE id=?").bind(job.listing.id,admitted.jobId).run();
    return admitted.jobId;
  }
  const exportId=await exportVoice(legacy,'legacy-voice-source'),beforeExport=transcripts.length;
  const corrected=await prepareJobNarration(env,oldScope.agencyId,exportId,providers);
  assert.equal(transcripts.length-beforeExport,corrected.audio.length);
  assert.ok(transcripts.slice(beforeExport).some(text=>text.includes('Saint-étienne')));
  const cachedExport=await exportVoice(corrected,'corrected-voice-source'),beforeReuse=transcripts.length;
  const reused=await prepareJobNarration(env,oldScope.agencyId,cachedExport,{...providers,voice:{config,synthesize:async()=>{throw Error('NO_NEW_TTS');}}});
  assert.deepEqual(reused.audio.map(audio=>audio.sha256),corrected.audio.map(audio=>audio.sha256));
  assert.equal(transcripts.length,beforeReuse);
});
