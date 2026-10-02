import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {FishVoiceConfig,GoogleVoiceConfig,VoiceFailure,defaultVideoCustomization,GenerationCustomization} from '../packages/contracts/src/index';
import {fishTts,fishWav,voiceCacheKey,measureVoiceWav,voiceRequest} from '../packages/voice/src/index';
import {toneFixture} from '../fixtures/voice';
import {fixturePlan,fixtureScriptMetrics} from '../fixtures/narration';
import {migrateNarrationProbe,seedNarrationFixture} from '../scripts/narration-fixtures';
import {narrationProbeRuntime} from '../scripts/narration-probe-runtime';
import {prepareJobNarration,type NarrationProviders} from '../apps/pipeline/src/narration';
import {adminVideoDetail} from '../packages/db/src/index';
import {realProviders} from '../apps/pipeline/src/narration-worker';

const config=FishVoiceConfig.parse({voice:'fish-manon'}),key='fixture-key-never-networked';
const audioBody=(duration=1000)=>new Uint8Array(toneFixture(duration)).buffer;
const rejected=(code:string)=>(error:unknown)=>error instanceof VoiceFailure&&error.code===code;

test('Fish : voix autorisée, modèle gratuit explicite, WAV et octets UTF-8 mesurés',async()=>{
  let calls=0;
  const client=fishTts(config,key,{fetch:async(url,init)=>{
    calls++;assert.equal(url,'https://api.fish.audio/v1/tts');assert.equal(init.redirect,'manual');
    assert.equal((init.headers as Record<string,string>).model,'s2.1-pro-free');
    const body=JSON.parse(String(init.body));assert.equal(body.reference_id,'10a3a20742114a4ea6dd441e7591850f');
    assert.equal(body.format,'wav');assert.equal(body.sample_rate,24000);
    return new Response(audioBody(900),{headers:{'x-request-id':'fish-fixture-id'}});
  }});
  const reply=await client.synthesize('À Lyon, découvrez ce bien.');assert.equal(calls,1);
  assert.equal(reply.usage.inputUtf8Bytes,new TextEncoder().encode('À Lyon, découvrez ce bien.').length);
  assert.ok(reply.usage.inputUtf8Bytes>reply.usage.inputCharacters);assert.equal(reply.cost.estimatedMicrosBeforeFreeTier,0);
  assert.equal(reply.cost.actualBilledMicros,null);assert.equal(reply.providerRequestId,'fish-fixture-id');
  assert.equal(measureVoiceWav(reply.bytes).durationMs,900);
  for(const model of ['s2.1-pro','unknown',''])assert.throws(()=>fishTts({...config,model},key),rejected('VOICE_CONFIG_INVALID'));
  assert.throws(()=>fishTts({...config,voice:'fish-celebrity'},key),rejected('VOICE_CONFIG_INVALID'));
  assert.ok(GenerationCustomization.safeParse({...defaultVideoCustomization(),voice:'fish-lucas'}).success);
  for(const text of ['', 'a'.repeat(1001),'<|speaker:1|> Bonjour','test\u0000'])await assert.rejects(client.synthesize(text),rejected('VOICE_TEXT_INVALID'));
  assert.equal(calls,1);
});

test('Fish : aucun changement aux caches Google, isolation par voix et fournisseur',async()=>{
  const google=GoogleVoiceConfig.parse({projectId:'fixture-voices'}),request=voiceRequest(google,'Bonjour');
  const historical=[...new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify({config:request.config,text:request.text}))))].map(n=>n.toString(16).padStart(2,'0')).join('');
  assert.equal(await voiceCacheKey(google,'Bonjour'),historical);
  assert.notEqual(await voiceCacheKey(config,'Bonjour'),historical);
  assert.notEqual(await voiceCacheKey(config,'Bonjour'),await voiceCacheKey({...config,voice:'fish-lucas'},'Bonjour'));
});

test('Fish : en-tête WAV de flux normalisé, audio silencieux/corrompu/trop long rejeté',()=>{
  const wav=toneFixture(1000),view=new DataView(wav.buffer);view.setUint32(4,0xffffffff,true);view.setUint32(40,0xffffffff,true);
  assert.equal(measureVoiceWav(fishWav(wav)).durationMs,1000);assert.equal(view.getUint32(4,true),0xffffffff,'input not mutated');
  view.setUint32(4,0xffffff24,true);view.setUint32(40,0xffffff00,true);
  assert.equal(measureVoiceWav(fishWav(wav)).durationMs,1000);
  assert.throws(()=>fishWav(toneFixture(1000,true)),rejected('VOICE_AUDIO_SILENT'));
  assert.throws(()=>fishWav(new Uint8Array(100)),rejected('VOICE_AUDIO_INVALID'));
  assert.throws(()=>fishWav(toneFixture(36000)),rejected('VOICE_DURATION_EXCEEDED'));
});

test('Fish : échecs expurgés, réponse bornée et délai du corps, aucune relance payante',async()=>{
  for(const [status,code] of [[401,'VOICE_AUTH_FAILED'],[402,'VOICE_BILLING_DISABLED'],[403,'VOICE_AUTH_FAILED'],[404,'VOICE_NOT_FOUND'],[429,'VOICE_RATE_LIMITED'],[503,'VOICE_UNAVAILABLE'],[302,'VOICE_REQUEST_REJECTED']] as const){
    let count=0;const client=fishTts(config,key,{fetch:async()=>{count++;return new Response('private-text-secret',{status});}});
    await assert.rejects(client.synthesize('Bonjour'),error=>rejected(code)(error)&&!String(error).includes('private'));
    assert.equal(count,1);
  }
  await assert.rejects(fishTts(config,key,{fetch:async()=>new Response(audioBody(),{headers:{'content-length':'99999999'}})}).synthesize('Bonjour'),rejected('VOICE_RESPONSE_INVALID'));
  await assert.rejects(fishTts(config,key,{fetch:async()=>new Response(new Uint8Array(7*1024*1024+1))}).synthesize('Bonjour'),rejected('VOICE_RESPONSE_INVALID'));
  await assert.rejects(fishTts(config,key,{timeoutMs:5,fetch:async(_url,init)=>new Response(new ReadableStream({start(controller){init.signal!.addEventListener('abort',()=>controller.error(new Error('private')));}}))}).synthesize('Bonjour'),rejected('VOICE_TIMEOUT'));
});

test('Fish : fournisseur indépendant des identifiants Google et mode muet sans clé',async()=>{
  const env={GOOGLE_CLOUD_PROJECT:'fixture-provider',GOOGLE_SERVICE_ACCOUNT_JSON:'',GOOGLE_TTS_VOICE:'fr-FR-Chirp3-HD-Aoede',OPENAI_API_KEY:'sk-fixture-key-not-sent',SCRIPT_MODEL:'gpt-5.4-mini-2026-03-17'};
  const providers=await realProviders({...env,FISH_API_KEY:key,FISH_TTS_ENABLED:'true'},'fish-manon');assert.equal(providers.voice.config.provider,'fish');
  await assert.rejects(realProviders(env,'fish-manon'),rejected('VOICE_UNAVAILABLE'));
  const silent=await realProviders(env,'fish-manon',false);assert.equal(silent.voice.config.provider,'fish');
});

test('Fish : D1/R2, reprise sans appel, coûts admin, migration préserve les journaux',async()=>{
  const directory=await mkdtemp(join(tmpdir(),'bienvu-fish-')),runtime=narrationProbeRuntime(directory);
  try{
    const env=await runtime.getBindings<{DB:D1Database;MEDIA:R2Bucket}>();await migrateNarrationProbe(env.DB);
    await env.DB.prepare('INSERT INTO narration_budget(month,envelope_cents,paused) VALUES(?,100,0)').bind(new Date().toISOString().slice(0,7)).run();
    const scope=await seedNarrationFixture(env.DB,'fish-cache');let count=0;
    const client=fishTts(config,key,{fetch:async()=>{count++;return new Response(audioBody(3000));}});
    const providers:NarrationProviders={mode:'real',voice:{config,synthesize:client.synthesize},script:{model:'fixture-model',plan:async context=>({plan:fixturePlan(context),metrics:fixtureScriptMetrics()})}};
    const first=await prepareJobNarration(env,scope.agencyId,scope.jobId,providers);assert.equal(count,first.audio.length);
    const forbid=async():Promise<never>=>{throw Error('NO_PROVIDER_ON_REPLAY');};
    assert.deepEqual(await prepareJobNarration(env,scope.agencyId,scope.jobId,{...providers,voice:{config,synthesize:forbid},script:{...providers.script,plan:forbid}}),first);
    const detail=await adminVideoDetail(env.DB,scope.jobId),fish=detail!.calls.filter(c=>c.provider==='fish');assert.equal(fish.length,count);
    assert.ok(fish.every(c=>c.estimatedMicros===0&&c.inputUtf8Bytes!>0&&c.model==='s2.1-pro-free'));
    const before=await env.DB.prepare('SELECT * FROM narration_calls ORDER BY id').all();
    // Exercise the table rebuild on an existing journal, independently of empty DB migration.
    await env.DB.exec((await readFile('packages/db/migrations/0030_fish_audio.sql','utf8')).replace(/^--.*$/gm,'').replace(/\n/g,' '));
    assert.deepEqual((await env.DB.prepare('SELECT * FROM narration_calls ORDER BY id').all()).results,before.results);
    assert.equal((await env.DB.prepare('PRAGMA foreign_key_check').all()).results.length,0);
    const insert=(index:number)=>env.DB.prepare("INSERT INTO narration_calls(id,agency_id,job_id,step_key,request_hash,provider,provider_mode,month,reservation_cents,state,created_at) VALUES(?,?,?,?,?,?,'real',?,5,'pending',?)")
      .bind(`cap-${index}`,scope.agencyId,scope.jobId,`voice/${index.toString(16).padStart(64,'0')}`,'d'.repeat(64),index%2?'google':'fish',new Date().toISOString().slice(0,7),new Date().toISOString()).run();
    for(let i=count;i<12;i++)await insert(i);
    await assert.rejects(insert(12),error=>String(error).includes('NARRATION_BUDGET_LIMIT'));
    await assert.rejects(prepareJobNarration(env,scope.agencyId,scope.jobId,{...providers,voice:{...providers.voice,config:FishVoiceConfig.parse({voice:'fish-lucas'})}}),error=>String(error).includes('NARRATION_CONFLICT'));
  }finally{await runtime.dispose();await rm(directory,{recursive:true,force:true});}
});
