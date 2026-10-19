import {test} from 'node:test';
import assert from 'node:assert/strict';
import {Miniflare,convertV4MiniflareOptions} from 'miniflare';
import {CustomNarration,GoogleVoiceConfig} from '../packages/contracts/src/index';
import {compileScript,customScript,filledNarrationPlan,fitNarrationDuration,fitCachedNarration,generateScript,narrationWordLimit,scriptContext,
  scriptRequest,validateScript,wordCount,DEFAULT_SCRIPT_MODEL} from '../packages/narration/src/index';
import {compactVoiceSceneTiming,googleTts,voiceSceneTiming} from '../packages/voice/src/index';
import {narrationListing,narrationBrand,fixturePlan,fixtureScriptMetrics} from '../fixtures/narration';
import {toneFixture} from '../fixtures/voice';
import {migrateNarrationProbe,seedNarrationFixture} from '../scripts/narration-fixtures';
import {admitGeneration,findNarration} from '../packages/db/src/index';
import {prepareJobNarration} from '../apps/pipeline/src/narration';
const description='Le séjour lumineux ouvre sur une terrasse exposée au sud et sur un jardin arboré. La cuisine dispose de nombreux rangements et donne directement sur le séjour. Deux chambres avec placard permettent de séparer les espaces de vie et de repos. Une salle de bain avec douche complète cet étage. Le balcon offre une vue sur le jardin sans vis-à-vis. Une cave et un garage sont proposés en supplément. Un rafraîchissement est à prévoir pour plus de modernité. Les commerces et les transports sont accessibles à pied depuis la résidence au calme. Un bureau avec fenêtre peut accueillir un espace de travail à domicile. Une seconde terrasse permet de profiter de l’extérieur depuis la chambre. La maison est sans ascenseur. RSAC 123456789.';
const listing=()=>{const l=narrationListing();l.description={text:description,sourcePath:'fixture.description',truncated:false};return l;};
const words=(s:{scenes:{narrationText:string}[]})=>wordCount(s.scenes.map(s=>s.narrationText).join(' '));

test('couverture : narration 20/30/40 s développée, conditions conservées et IDs étrangers refusés',async()=>{
  const counts:number[]=[];
  for(const duration of [20,30,40] as const){
    const context=await scriptContext(listing(),narrationBrand,undefined,'description-copy/2',undefined,duration);
    const plan=fixturePlan(context),script=compileScript(context,filledNarrationPlan(context,plan),DEFAULT_SCRIPT_MODEL),text=script.scenes.map(s=>s.narrationText).join(' ');
    counts.push(words(script));assert.ok(words(script)<=narrationWordLimit(duration));assert.ok(words(script)>duration*2);
    assert.equal(script.scenes.length,4);assert.match(text,/rafraîchissement est à prévoir/);
    if(/garage/.test(text))assert.match(text,/garage sont proposés en supplément/);
    assert.doesNotMatch(text,/RSAC|123456789|vue mer|rénové/);assert.equal(script.promptVersion,'narration-fr/3');
    assert.deepEqual(validateScript(context,script),script);
    const request=scriptRequest(context,DEFAULT_SCRIPT_MODEL,false),payload=JSON.parse(request.input[1].content);
    assert.ok(Buffer.byteLength(JSON.stringify(request))<24000);assert.equal(payload.durationSeconds,duration);
    assert.ok(payload.copies.every((c:{id:string})=>c.id.includes('/description-')));
    const rejected=async(plan:unknown)=>generateScript(context,{model:DEFAULT_SCRIPT_MODEL,plan:async()=>({plan,metrics:fixtureScriptMetrics()})});
    await assert.rejects(rejected({scenes:plan.scenes.map((s,i)=>i===1?{...s,copyId:'gallery/description-99'}:s)}),/SCRIPT_INVALID/);
    await assert.rejects(rejected({scenes:plan.scenes.map((s,i)=>i===1?{...s,photoAssetId:'photo-foreign'}:s)}),/SCRIPT_INVALID/);
  }
  assert.ok(counts[0]<counts[1]&&counts[1]<counts[2]);
});

test('couverture : adaptation mesurée une seule fois, sans couper ni répéter les clauses',async()=>{
  const context=await scriptContext(listing(),narrationBrand,undefined,'description-copy/2',undefined,40);
  const script=compileScript(context,filledNarrationPlan(context,fixturePlan(context)),DEFAULT_SCRIPT_MODEL);
  const fast=script.scenes.map(s=>Math.ceil(wordCount(s.narrationText)*1000/3.5)),slow=script.scenes.map(s=>Math.ceil(wordCount(s.narrationText)*1000/2));
  const longer=fitNarrationDuration(context,script,fast)!;assert.ok(longer);assert.equal(longer.version,2);assert.ok(words(longer)>words(script));
  assert.deepEqual(validateScript(context,longer),longer);assert.equal(fitNarrationDuration(context,longer,fast),null);
  const shorter=fitNarrationDuration(context,script,slow)!;assert.ok(shorter);assert.ok(words(shorter)<words(script));
  assert.match(shorter.scenes.map(s=>s.narrationText).join(' '),/rafraîchissement est à prévoir/);
  assert.equal(longer.scenes[0].narrationText,script.scenes[0].narrationText);assert.equal(longer.scenes.at(-1)!.narrationText,script.scenes.at(-1)!.narrationText);
  const sparse=listing();sparse.description=null;const c=await scriptContext(sparse,narrationBrand,undefined,'description-copy/2',undefined,40);
  const factual=compileScript(c,filledNarrationPlan(c,fixturePlan(c)),DEFAULT_SCRIPT_MODEL);
  assert.doesNotMatch(factual.scenes.map(s=>s.narrationText).join(' '),/jardin|terrasse|lumineux/);
  assert.equal(fitNarrationDuration(c,factual,[1000,2000,2000,1000]),null);
});

test('cache mesuré : variante plus remplie sans nouvel appel vocal',async()=>{
  const context=await scriptContext(listing(),narrationBrand,undefined,'description-copy/2',undefined,40);
  const script=compileScript(context,filledNarrationPlan(context,fixturePlan(context)),DEFAULT_SCRIPT_MODEL);
  const available=context.copies.map(c=>({text:c.narrationText,durationMs:Math.ceil(wordCount(c.narrationText)*1000/3.2)}));
  const cached=fitCachedNarration(context,script,available)!;
  assert.ok(cached);assert.ok(words(cached)>words(script));assert.equal(cached.version,2);
  assert.deepEqual(validateScript(context,cached),cached);
  const onlyCurrent=script.scenes.map(s=>available.find(t=>t.text===s.narrationText)!);
  assert.equal(fitCachedNarration(context,script,onlyCurrent),null);
});

test('timing : pas de blancs répartis, WAV complets et durée exacte ; ancien rythme conservé',()=>{
  const wavs=[2400,16900,16400,2500],frames=compactVoiceSceneTiming(wavs,40);
  assert.equal(frames.reduce((a,b)=>a+b,0),1200);
  for(let i=0;i<3;i++)assert.equal(frames[i]-Math.ceil(wavs[i]*30/1000),4);
  assert.ok(frames.at(-1)!>=Math.ceil(wavs.at(-1)!*30/1000));
  assert.throws(()=>compactVoiceSceneTiming([8000,8000,8000,8000],30),/VOICE_DURATION_EXCEEDED/);
  assert.throws(()=>compactVoiceSceneTiming([0,1000,1000,1000],20),/VOICE_AUDIO_INVALID/);
  assert.notDeepEqual(voiceSceneTiming([2000,3000,3000,2000],40),compactVoiceSceneTiming([2000,3000,3000,2000],40));
});

test('narration personnelle longue : texte intact et jamais allongé automatiquement',async()=>{
  const paragraphs=['Mon introduction.','Le séjour lumineux ouvre sur une terrasse exposée au sud. '.repeat(6).trim(),'La cuisine donne directement sur le séjour. '.repeat(3).trim(),'Ma conclusion.'];
  assert.ok(paragraphs[1].length>300);assert.ok(CustomNarration.safeParse(paragraphs).success);
  const c=await scriptContext(listing(),narrationBrand,undefined,'description-copy/2',paragraphs,40),s=customScript(c);
  assert.deepEqual(s.scenes.map(s=>s.narrationText),paragraphs);assert.equal(fitNarrationDuration(c,s,[1000,5000,3000,1000]),null);
});

test('D1/R2 : voix lentes et rapides sur 20/40 s, WAV complets et reprise sans nouvelle dépense',async t=>{
  const mf=new Miniflare(convertV4MiniflareOptions({modules:true,script:'export default {fetch(){return new Response("fixture")}}',compatibilityDate:'2026-09-27',d1Databases:['DB'],r2Buckets:['MEDIA']}));
  t.after(()=>mf.dispose());const env=await mf.getBindings<{DB:D1Database;MEDIA:R2Bucket}>();await migrateNarrationProbe(env.DB);
  await env.DB.prepare('INSERT INTO hosted_import_budget VALUES(?,0,9500,0)').bind(new Date().toISOString().slice(0,7)).run();
  await env.DB.exec('UPDATE generation_control SET enabled=1');
  for(const durationSeconds of [20,40] as const)for(const pace of [2.2,2.6,3.2])await t.test(`${durationSeconds} s à ${pace} mots/s`,async()=>{
  const label=`coverage-${durationSeconds}-${pace*10}`,scope=await seedNarrationFixture(env.DB,label),l=listing();l.id=`listing-${label}`;l.agencyId=scope.agencyId;
  for(const photo of l.photos){photo.agencyId=scope.agencyId;photo.listingId=l.id;photo.objectKey=`agencies/${scope.agencyId}/imports/${l.id}/${photo.id}.png`;}
  await env.DB.prepare('UPDATE listing_imports SET result_json=? WHERE id=?').bind(JSON.stringify(l),l.id).run();
  await env.DB.prepare("UPDATE jobs SET status='failed',error_code='FIXTURE',lease_until=NULL WHERE id=?").bind(scope.jobId).run();
  await env.DB.prepare('INSERT INTO generation_access VALUES(?,?,1)').bind(scope.agencyId,`allocation-${label}`).run();
  const job=await admitGeneration(env.DB,scope.agencyId,`generation-${label}`,{listingId:l.id,durationSeconds},'true');
  await env.DB.prepare("UPDATE jobs SET status='scripting',stage='scripting',listing_id=? WHERE id=?").bind(l.id,job.jobId).run();
  const config=GoogleVoiceConfig.parse({projectId:'fixture-coverage'}),spokenTexts:string[]=[];let scriptCalls=0;
  const voice=googleTts(config,async()=> 'fixture-token-not-sent',{fetch:async(_url,init)=>{
    const body=JSON.parse(String(init?.body));spokenTexts.push(body.input.text);return Response.json({audioContent:Buffer.from(toneFixture(Math.ceil(wordCount(body.input.text)*1000/pace))).toString('base64')});}});
  const providers={mode:'mock' as const,script:{model:DEFAULT_SCRIPT_MODEL,plan:async(c:Parameters<typeof fixturePlan>[0])=>{scriptCalls++;return {plan:fixturePlan(c),metrics:fixtureScriptMetrics()};}},voice:{config,synthesize:voice.synthesize}};
  const prepared=await prepareJobNarration(env,scope.agencyId,job.jobId,providers);
  assert.equal(prepared.script.copyVersion,'description-copy/2');assert.equal(scriptCalls,1);
  assert.ok(spokenTexts.length>=4&&spokenTexts.length<=6);assert.equal(new Set(spokenTexts).size,spokenTexts.length);
  if(durationSeconds===40&&pace===3.2){assert.equal(prepared.script.version,2);assert.equal(spokenTexts.length,6);}
  assert.equal(prepared.durationFrames.reduce((a,b)=>a+b,0),durationSeconds*30);
  for(const [index,audio] of prepared.audio.entries())assert.ok(prepared.durationFrames[index]>=Math.ceil(audio.durationMs*30/1000));
  const spokenMs=prepared.audio.reduce((n,a)=>n+a.durationMs,0);
  assert.ok(spokenMs>=durationSeconds*850&&spokenMs<=durationSeconds*1000);
  const endMs=prepared.durationFrames.slice(0,-1).reduce((n,f)=>n+f,0)*1000/30+prepared.audio.at(-1)!.durationMs;
  assert.ok(durationSeconds*1000-endMs<=durationSeconds*150);
  const row=(await findNarration(env.DB,scope.agencyId,job.jobId))!;assert.deepEqual(JSON.parse(row.script!),prepared.script);
  const before={voice:spokenTexts.length,script:scriptCalls};assert.deepEqual(await prepareJobNarration(env,scope.agencyId,job.jobId,providers),prepared);
  assert.deepEqual({voice:spokenTexts.length,script:scriptCalls},before);
  assert.equal((await env.DB.prepare('SELECT consumed FROM allocations WHERE agency_id=?').bind(scope.agencyId).first<{consumed:number}>())!.consumed,0);
  await env.DB.prepare("UPDATE jobs SET status='failed',error_code='FIXTURE_FINISHED',lease_until=NULL WHERE id=?").bind(job.jobId).run();
  });
});
