import {test} from 'node:test';
import assert from 'node:assert/strict';
import {factualNarrationChecks,qualificationChecks,qualityCoverage,qualitySample,narrationQualityChecks} from '../packages/contracts/src/ai-quality';
import {redactAiPayload,flushAiEvents,collectAiQuality} from '../packages/observability/src/ai';
import {enqueueAiEvent,claimAiEvent,finishAiEvent,aiQualitySettings,updateAiQualitySettings,listQualityRuns,insertAiQualityRun,reviewQualityRun,addQualityDatasetCase,rememberAiContext,type StoredQualityPayload} from '../packages/db/src/ai-quality';
import {qualitySummary,runAiQualityBatch,adminAiQualityRequest} from '../apps/web/lib/ai-quality';
import {qualityReferences} from '../fixtures/ai-quality';
import {localitySpeechText} from '../packages/voice/src/index';
import {Miniflare,convertV4MiniflareOptions} from 'miniflare';
import {migrateNarrationProbe,seedNarrationFixture} from '../scripts/narration-fixtures';
import {narrationListing} from '../fixtures/narration';
import {admitGeneration,setGenerationStage,failGeneration} from '../packages/db/src/index';

test('jeu de référence : faits, unités, conditions et villes sans fournisseur IA',async t=>{
  assert.ok(qualityReferences.length>=60);assert.equal(new Set(qualityReferences.map(c=>c.id)).size,qualityReferences.length);
  for(const c of qualityReferences)await t.test(c.id,()=>{
    const checks=[...factualNarrationChecks(c.facts,c.narration),qualificationChecks(c.source,c.narration)];
    for(const expected of c.expected)assert.equal(checks.find(k=>k.key===expected.key)?.status,expected.status,c.id);
    if(c.id.startsWith('speech-locality')){const spoken=localitySpeechText(c.narration,String(c.facts.locality));assert.ok(spoken);if(c.facts.locality==='LYON')assert.match(spoken,/Lyon/);}
  });
});

test('mesures de couverture : N/A et erreurs ne deviennent pas des échecs',()=>{
  const check={key:'a',label:'a',reason:'a'};assert.deepEqual(qualityCoverage([{...check,status:'pass'},{...check,status:'fail'},{...check,status:'na'},{...check,status:'error'},{...check,status:'pending'}]),{assessed:2,passed:1,failed:1,na:1,errors:1,pending:1});
  assert.equal(qualitySample('stable',0),false);assert.equal(qualitySample('stable',100),true);assert.equal(qualitySample('stable',10),qualitySample('stable',10));
  const selected=Array.from({length:10000},(_,i)=>qualitySample('sample-'+i,10)).filter(Boolean).length;assert.ok(selected>850&&selected<1150);
});

test('télémétrie : références privées et secrets exclus sans masquer les faits',()=>{
  const safe=redactAiPayload({price:{amountCents:20000000},city:'LYON',objectKey:'agencies/a/jobs/j/x.wav',headers:{authorization:'Bearer private'},apiKey:'sk-PRIVATESECRETKEYVALUE',input:'200 000 € à Lyon. Contact alex@example.com au 06 12 34 56 78. https://media.example/private?token=SECRET agencies/a/jobs/j/audio.wav sk-SECRETSECRETSECRET'}) as Record<string,unknown>;
  assert.deepEqual(safe.price,{amountCents:20000000});assert.equal(safe.city,'LYON');assert.doesNotMatch(JSON.stringify(safe),/PRIVATE|SECRET|example.com|06 12|agencies\//);assert.match(String(safe.input),/200 000 € à Lyon/);
});

test('D1 : reprises, consentement, isolation admin, aucun appel fournisseur',async t=>{
  const mf=new Miniflare(convertV4MiniflareOptions({modules:true,script:'export default {fetch(){return new Response("test")}}',compatibilityDate:'2026-09-27',d1Databases:['DB'],r2Buckets:['MEDIA']}));t.after(()=>mf.dispose());
  const env=await mf.getBindings<{DB:D1Database;MEDIA:R2Bucket}>();await migrateNarrationProbe(env.DB);await migrateNarrationProbe(env.DB);
  await t.test('outbox idempotente, bail exclusif, expiration et acquittement clôturé',async()=>{
    await enqueueAiEvent(env.DB,'same','$ai_span','trace',{distinct_id:'fixture'});await enqueueAiEvent(env.DB,'same','$ai_span','trace',{distinct_id:'fixture'});
    assert.equal((await env.DB.prepare('SELECT count(*) AS n FROM ai_telemetry_outbox').first<{n:number}>())?.n,1);
    const claims=await Promise.all([claimAiEvent(env.DB),claimAiEvent(env.DB)]);assert.equal(claims.filter(Boolean).length,1);const first=claims.find(Boolean)!;
    const later=await claimAiEvent(env.DB,Date.now()+31000);assert.ok(later);assert.equal(later.id,first.id);assert.notEqual(later.lease,first.lease);
    await finishAiEvent(env.DB,first,true,null);assert.equal((await env.DB.prepare('SELECT state FROM ai_telemetry_outbox WHERE id=?').bind(first.id).first<{state:string}>())?.state,'sending');
    await finishAiEvent(env.DB,later,false,'POSTHOG_UNAVAILABLE');assert.equal((await env.DB.prepare('SELECT state FROM ai_telemetry_outbox WHERE id=?').bind(first.id).first<{state:string}>())?.state,'pending');
    await env.DB.prepare("UPDATE ai_telemetry_outbox SET next_at=? WHERE id=?").bind(new Date(0).toISOString(),first.id).run();
    const received:Record<string,unknown>[]=[];const fetcher:typeof fetch=async(url,init)=>{assert.equal(String(url),'https://eu.i.posthog.com/i/v0/e/');received.push(JSON.parse(String(init?.body)));return new Response('1');};
    assert.deepEqual(await flushAiEvents({...env,POSTHOG_ENABLED:'true',POSTHOG_PROJECT_TOKEN:'phc_testprojecttokenlongenough',POSTHOG_HOST:'https://eu.i.posthog.com'},fetcher),{sent:1,failed:0});
    assert.equal(received[0].uuid,first.id);assert.equal((received[0].properties as Record<string,unknown>).$insert_id,first.id);
  });
  await t.test('consentement refusé : aucune corrélation de session enregistrée',async()=>{
    await rememberAiContext(env.DB,'no-consent',new Request('https://test',{headers:{'X-PostHog-Session-ID':'session-1234567890','X-PostHog-Distinct-ID':'user-id'}}));
    assert.equal(await env.DB.prepare('SELECT operation_id FROM ai_quality_contexts').first(),null);
    await rememberAiContext(env.DB,'consented',new Request('https://test',{headers:{'X-Analytics-Consent':'2','X-PostHog-Session-ID':'session-1234567890','X-PostHog-Distinct-ID':'user-id'}}));
    assert.ok(await env.DB.prepare('SELECT operation_id FROM ai_quality_contexts').first());
  });
  await t.test('configuration : validation stricte et concurrence',async()=>{
    const current=await aiQualitySettings(env.DB);assert.equal(current.settings.enabled,true);
    assert.equal(Object.hasOwn(current.settings,'judgeEnabled'),false);
    const saved=await updateAiQualitySettings(env.DB,'admin',current.settings,current.revision);assert.equal(saved.revision,current.revision+1);
    await assert.rejects(updateAiQualitySettings(env.DB,'admin',current.settings,current.revision),/CONFLICT/);
  });
  await t.test('contrôles de journaux existants : jamais de service de génération',async()=>{
    const scope=await seedNarrationFixture(env.DB,'quality',true);await env.DB.prepare("UPDATE jobs SET status='failed',error_code='FIXTURE',lease_until=NULL WHERE id=?").bind(scope.jobId).run();
    const month=new Date().toISOString().slice(0,7);await env.DB.prepare('INSERT INTO hosted_import_budget(month,baseline_cents,ceiling_cents,paused) VALUES(?,0,9500,0)').bind(month).run();await env.DB.exec('UPDATE generation_control SET enabled=1');await env.DB.prepare('INSERT INTO generation_access(agency_id,allocation_id,enabled) VALUES(?,?,1)').bind(scope.agencyId,'allocation-quality').run();
    const job=await admitGeneration(env.DB,scope.agencyId,'ai-quality-existing-journal',{listingId:'listing-quality'},'true');await failGeneration(env.DB,job,'GENERATION_FAILED');
    let paidCalls=0;const services={GENERATION_SERVICE:{fetch:()=>{paidCalls++;throw Error('PAID_PROVIDER_FORBIDDEN');}},GENERATION_TOKEN:'fixture'};
    await runAiQualityBatch({...env,...services,PROBE_MODE:'local',BETTER_AUTH_URL:'http://localhost:8787',BETTER_AUTH_SECRET:'not-used',POSTHOG_ENABLED:'false'} as never);
    assert.equal(paidCalls,0);const runs=await listQualityRuns(env.DB);assert.equal(runs.length,1);assert.equal(runs[0].jobId,job.jobId);assert.equal(runs[0].status,'failed');
    const before=(await env.DB.prepare('SELECT count(*) AS n FROM ai_telemetry_outbox').first<{n:number}>())!.n;
    await collectAiQuality(env.DB);assert.equal((await env.DB.prepare('SELECT count(*) AS n FROM ai_telemetry_outbox').first<{n:number}>())!.n,before);
    const summary=await qualitySummary(env.DB,30,'','');assert.equal((summary.counts as {total:number}).total,1);assert.ok(summary.checks.some(c=>c.key==='render'&&c.error===1));
    assert.equal((await qualitySummary(env.DB,30,'account','')).checks.length,0);
  });
  await t.test('verdict humain et cas figé exportable, sans nouvelle IA',async()=>{
    const run=(await listQualityRuns(env.DB))[0];await assert.rejects(addQualityDatasetCase(env.DB,run.id,'admin','test'),/REVIEW_REQUIRED/);
    await reviewQualityRun(env.DB,run.id,'admin','intentional','Choix volontaire.');await addQualityDatasetCase(env.DB,run.id,'admin','Cas revu');await addQualityDatasetCase(env.DB,run.id,'admin','Cas revu');
    assert.equal((await env.DB.prepare('SELECT count(*) AS n FROM ai_quality_dataset').first<{n:number}>())!.n,1);
  });
});
