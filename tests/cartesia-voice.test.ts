import {test} from 'node:test';
import assert from 'node:assert/strict';
import {randomBytes,createHmac} from 'node:crypto';
import {Miniflare,convertV4MiniflareOptions} from 'miniflare';
import {CartesiaVoiceConfig,CARTESIA_DEFAULT_VOICE,cartesiaParisianVoices,VoiceFailure,VideoVoice,defaultVideoCustomization,VoiceCatalog} from '../packages/contracts/src/index';
import {cartesiaTts,voiceCacheKey,measureVoiceWav} from '../packages/voice/src/index';
import {reserveCartesiaVoice,finishCartesiaVoice,cartesiaFreeUsage,voiceSettings,setDefaultVoice,admitGeneration,ensureAgency} from '../packages/db/src/index';
import {migrateNarrationProbe,seedNarrationFixture} from '../scripts/narration-fixtures';
import {toneFixture} from '../fixtures/voice';
import {adminVoiceCatalog,publicVoiceCatalog,createVoiceSample,adminVoicesRequest} from '../apps/web/lib/voices';
import {createAuth} from '../apps/web/lib/auth';

const config=CartesiaVoiceConfig.parse({voice:CARTESIA_DEFAULT_VOICE}),key='cartesia-fixture-key-never-networked';
const rejected=(code:string)=>(e:unknown)=>e instanceof VoiceFailure&&e.code===code;
test('Cartesia : accent natif parisien autorisé, snapshot Sonic 3.6, WAV portable et cache distinct',async()=>{
  let calls=0;const bytes=new Uint8Array(toneFixture(1000));
  const client=cartesiaTts(config,key,{fetch:async(url,init)=>{
    calls++;assert.equal(url,'https://api.cartesia.ai/tts/bytes');assert.equal(init.redirect,'manual');
    assert.equal((init.headers as Record<string,string>)['Cartesia-Version'],'2026-08-14');
    const body=JSON.parse(String(init.body));assert.equal(body.model_id,'sonic-3.6-2026-08-27');
    assert.equal(body.voice,'7c58f4a4-a72c-42fa-a503-41b9408820f3');assert.equal(body.language,'fr-FR');assert.equal(body.locale,undefined);assert.equal(body.accent,'parisian');
    assert.deepEqual(body.output_format,{container:'wav',encoding:'pcm_s16le',sample_rate:24000});
    return new Response(new Uint8Array(bytes).buffer,{headers:{'x-request-id':'cartesia-fixture'}});
  }});
  const reply=await client.synthesize(' À Lyon, découvrez cet appartement. ');assert.equal(calls,1);assert.equal(measureVoiceWav(reply.bytes).durationMs,1000);
  assert.equal(reply.cost.actualBilledMicros,null);assert.equal(reply.providerRequestId,'cartesia-fixture');
  assert.equal(reply.cacheKey,await voiceCacheKey(config,'À Lyon, découvrez cet appartement.'));
  assert.notEqual(reply.cacheKey,await voiceCacheKey({...config,voice:cartesiaParisianVoices[1].id},'À Lyon, découvrez cet appartement.'));
  assert.throws(()=>cartesiaTts({...config,voice:'cartesia-c6ccfe32-6bee-484a-a8a2-7a51bee93f99'},key),rejected('VOICE_CONFIG_INVALID'));
  assert.throws(()=>cartesiaTts({...config,accent:'canadian-french'},key),rejected('VOICE_CONFIG_INVALID'));
  assert.equal(cartesiaParisianVoices.length,41);assert.ok(VideoVoice.safeParse(config.voice).success);
  for(const text of ['', 'a'.repeat(1001),'<speak>test</speak>','x\u0000'])await assert.rejects(client.synthesize(text),rejected('VOICE_TEXT_INVALID'));
  assert.equal(calls,1);assert.equal(defaultVideoCustomization().voice,'fish-manon');assert.equal(defaultVideoCustomization(undefined,config.voice).voice,config.voice);
});
test('Cartesia : HTTP, flux trop long, silence et délai sont refusés sans retry',async()=>{
  for(const [status,code] of [[401,'VOICE_AUTH_FAILED'],[402,'VOICE_FREE_LIMIT'],[429,'VOICE_RATE_LIMITED'],[503,'VOICE_UNAVAILABLE'],[302,'VOICE_REQUEST_REJECTED']] as const){
    let calls=0;await assert.rejects(cartesiaTts(config,key,{fetch:async()=>{calls++;return new Response('private provider detail',{status});}}).synthesize('Bonjour'),rejected(code));assert.equal(calls,1);}
  await assert.rejects(cartesiaTts(config,key,{fetch:async()=>new Response(new Uint8Array(7*1024*1024+1).buffer)}).synthesize('Bonjour'),rejected('VOICE_RESPONSE_INVALID'));
  await assert.rejects(cartesiaTts(config,key,{fetch:async()=>new Response(new Uint8Array(toneFixture(1000,true)).buffer)}).synthesize('Bonjour'),rejected('VOICE_AUDIO_SILENT'));
  await assert.rejects(cartesiaTts(config,key,{timeoutMs:5,fetch:async(_url,init)=>new Promise((_resolve,reject)=>init.signal?.addEventListener('abort',()=>reject(Error('private timeout'))))}).synthesize('Bonjour'),rejected('VOICE_TIMEOUT'));
  const longAudio=async()=>new Response(new Uint8Array(toneFixture(45000)).buffer);
  await assert.rejects(cartesiaTts(config,key,{fetch:longAudio}).synthesize('Bonjour'),rejected('VOICE_DURATION_EXCEEDED'));
  const preview=await cartesiaTts(config,key,{fetch:longAudio,maximumDurationMs:300000}).synthesize('Bonjour');
  assert.equal(measureVoiceWav(preview.bytes,300000).durationMs,45000);
});
test('Voix : Free partagé, courses, audit, vrais textes, cache et accès superadmin',async t=>{
  const mf=new Miniflare(convertV4MiniflareOptions({modules:true,script:'export default {fetch(){return new Response("fixture")}}',compatibilityDate:'2026-09-27',d1Databases:['DB'],r2Buckets:['MEDIA']}));t.after(()=>mf.dispose());
  const bindings=await mf.getBindings<{DB:D1Database;MEDIA:R2Bucket}>();await migrateNarrationProbe(bindings.DB);const db=bindings.DB;
  const env={...bindings,PROBE_MODE:'local',BETTER_AUTH_URL:'http://localhost:8787',BETTER_AUTH_SECRET:randomBytes(32).toString('hex'),GOOGLE_CLIENT_ID:'',GOOGLE_CLIENT_SECRET:'',AUTH_EMAIL_MODE:'local',SUPER_ADMIN_EMAIL:'owner@example.com',CARTESIA_API_KEY:key,CARTESIA_TTS_ENABLED:'true',GOOGLE_CLOUD_PROJECT:'bienvu-fixture'};
  const auth=createAuth(env),context=await auth.$context;const cookies:string[]=[];let owner='';
  for(const [email,verified] of [['owner@example.com',1],['regular@example.com',1],['unverified@example.com',0]] as const){const id=crypto.randomUUID();if(email===env.SUPER_ADMIN_EMAIL)owner=id;
    await db.prepare('INSERT INTO auth_user(id,name,email,emailVerified,createdAt,updatedAt) VALUES(?,?,?,?,?,?)').bind(id,'Fixture',email,verified,Date.now(),Date.now()).run();
    let session:{token:string}|null;
    if(verified)session=await context.internalAdapter.createSession(id);
    else{const token=randomBytes(32).toString('hex');await db.prepare('INSERT INTO auth_session(id,expiresAt,token,createdAt,updatedAt,userId) VALUES(?,?,?,?,?,?)')
      .bind(crypto.randomUUID(),Date.now()+86400_000,token,Date.now(),Date.now(),id).run();session={token};}
    assert.ok(session);cookies.push(context.authCookies.sessionToken.name+'='+encodeURIComponent(session.token+'.'+createHmac('sha256',env.BETTER_AUTH_SECRET).update(session.token).digest('base64')));}
  const req=(cookie:string,method='GET',body?:unknown,origin=env.BETTER_AUTH_URL)=>new Request(env.BETTER_AUTH_URL+'/api/admin/voices',{method,headers:{cookie,origin,'Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{})});
  for(const [cookie,status] of [['',401],[cookies[1],403],[cookies[2],401]] as const){assert.equal((await adminVoicesRequest(req(cookie),env)).status,status);assert.equal((await adminVoicesRequest(req(cookie,'PATCH',{voice:config.voice,revision:1}),env)).status,status);}
  assert.equal((await adminVoicesRequest(req(cookies[0],'PATCH',{voice:config.voice,revision:1},'https://evil.example'),env)).status,403);
  const settings=await voiceSettings(db);assert.equal(settings.voice,config.voice);
  const next=await setDefaultVoice(db,owner,'fish-lucas',settings.revision);assert.equal(next.voice,'fish-lucas');
  await assert.rejects(setDefaultVoice(db,owner,config.voice,settings.revision),/VOICE_SETTING_CONFLICT/);
  await assert.rejects(db.prepare('DELETE FROM voice_setting_events').run(),/VOICE_AUDIT_IMMUTABLE/);
  await seedNarrationFixture(db,'cartesia');const page=await adminVoiceCatalog(env);assert.ok(page.listings[0].text.includes('42'));assert.equal(page.catalog.voices.filter(v=>v.provider==='cartesia').length,41);
  const publicPage=VoiceCatalog.parse(await publicVoiceCatalog(env));assert.equal(publicPage.defaultVoice,'fish-lucas');assert.doesNotMatch(JSON.stringify(publicPage),/object_key|cartesia-fixture-key|annonce|description|listingId/);
  let calls=0;const client=cartesiaTts(config,key,{fetch:async()=>{calls++;await new Promise(resolve=>setTimeout(resolve,15));return new Response(new Uint8Array(toneFixture(1000)).buffer);}});
  const input={voice:config.voice,text:page.listings[0].text},provider=async()=>({config,synthesize:client.synthesize});
  const results=await Promise.allSettled([createVoiceSample(env,owner,input,{provider}),createVoiceSample(env,owner,input,{provider})]);assert.equal(results.filter(r=>r.status==='fulfilled').length,1);assert.equal(calls,1);
  const sample=await createVoiceSample(env,owner,input,{provider});assert.equal(sample.cached,true);assert.equal(calls,1);
  const stored=await db.prepare('SELECT object_key,metrics_json FROM voice_samples WHERE id=?').bind(sample.id).first<{object_key:string;metrics_json:string}>();
  const object=await env.MEDIA.get(stored!.object_key);assert.ok(object&&'arrayBuffer' in object);
  const storedBytes=await object.arrayBuffer();assert.equal(storedBytes.byteLength,JSON.parse(stored!.metrics_json).sizeBytes);
  assert.equal((await adminVoicesRequest(req(cookies[0]),env,sample.id)).status,200);assert.equal((await adminVoicesRequest(req(''),env,sample.id)).status,401);
  const used=(await cartesiaFreeUsage(db)).used;assert.equal(used,input.text.length);
  const slots=await Promise.allSettled([reserveCartesiaVoice(db,'slot-one','Bonjour'),reserveCartesiaVoice(db,'slot-two','Bonjour'),reserveCartesiaVoice(db,'slot-three','Bonjour')]);assert.equal(slots.filter(s=>s.status==='fulfilled').length,2);assert.equal((await cartesiaFreeUsage(db)).active,2);
  for(const [i,s] of slots.entries())if(s.status==='fulfilled')await finishCartesiaVoice(db,['slot-one','slot-two','slot-three'][i],false);
  assert.equal((await cartesiaFreeUsage(db)).used,used+14);await assert.rejects(db.prepare('DELETE FROM cartesia_usage').run(),/VOICE_USAGE_IMMUTABLE/);
  for(let i=0;i<20;i++){try{await reserveCartesiaVoice(db,'budget-'+i,'x'.repeat(1000));await finishCartesiaVoice(db,'budget-'+i,true);}catch(error){assert.ok(rejected('VOICE_FREE_LIMIT')(error));}}
  await assert.rejects(reserveCartesiaVoice(db,'over-budget','x'.repeat(1000)),rejected('VOICE_FREE_LIMIT'));
  assert.equal((await cartesiaFreeUsage(db,Date.now()+32*86400_000)).used,0);
  await db.prepare('INSERT INTO hosted_import_budget VALUES(?,0,9500,0)').bind(new Date().toISOString().slice(0,7)).run();
  await db.exec("UPDATE generation_control SET enabled=1; UPDATE jobs SET status='failed',error_code='FIXTURE',lease_until=NULL WHERE id='job-cartesia'");
  await db.prepare('INSERT INTO generation_access VALUES(?,?,1)').bind('s05-cartesia','allocation-cartesia').run();
  const generationInput={listingId:'listing-cartesia'},admitted=await admitGeneration(db,'s05-cartesia','cartesia-default-key-01',generationInput,'true');
  assert.equal(admitted.selectedVoice,'fish-lucas');const beforeChange=await voiceSettings(db);
  await setDefaultVoice(db,owner,config.voice,beforeChange.revision);
  assert.equal((await admitGeneration(db,'s05-cartesia','cartesia-default-key-01',generationInput,'true')).selectedVoice,'fish-lucas');
  await assert.rejects(db.prepare('UPDATE generation_runs SET selected_voice=? WHERE job_id=?').bind(config.voice,admitted.jobId).run(),/GENERATION_IMMUTABLE/);
  assert.equal((await db.prepare('SELECT count(*) AS n FROM finance_video_summary').first<{n:number}>())!.n,1);
});
