import {test} from 'node:test';
import assert from 'node:assert/strict';
import {Miniflare, convertV4MiniflareOptions} from 'miniflare';
import {mkdtemp, rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {GoogleVoiceConfig, NarrationFailure, VoiceFailure} from '../packages/contracts/src/index';
import {claimNarrationCall, findNarration, narrationJobInput, releaseNarration, startNarration} from '../packages/db/src/index';
import {DEFAULT_SCRIPT_MODEL, hashJson, scriptContext} from '../packages/narration/src/index';
import {googleTts} from '../packages/voice/src/index';
import {prepareJobNarration, readNarrationAudio, type NarrationProviders} from '../apps/pipeline/src/narration';
import {fixturePlan, fixtureScriptMetrics} from '../fixtures/narration';
import {toneFixture} from '../fixtures/voice';
import {migrateNarrationProbe, seedNarrationFixture} from '../scripts/narration-fixtures';
import {narrationProbeRuntime} from '../scripts/narration-probe-runtime';

test('la sonde conserve scripts, budget et WAV après arrêt complet du runtime', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'bienvu-narration-persistence-'));
  const config = GoogleVoiceConfig.parse({projectId: 'bienvu-fixture'});
  const google = googleTts(config, async () => 'fixture-token-never-networked', {fetch: async () =>
    Response.json({audioContent: Buffer.from(toneFixture(5000)).toString('base64')})});
  const providers: NarrationProviders = {mode: 'real', script: {model: DEFAULT_SCRIPT_MODEL,
    plan: async context => ({plan: fixturePlan(context), metrics: fixtureScriptMetrics()})},
    voice: {config, synthesize: google.synthesize}};
  let first: Awaited<ReturnType<typeof prepareJobNarration>>;
  let scope: {agencyId: string; jobId: string};
  try {
    const initial = narrationProbeRuntime(directory);
    try {
      const env = await initial.getBindings<{DB: D1Database; MEDIA: R2Bucket}>();
      await migrateNarrationProbe(env.DB);
      await env.DB.prepare('INSERT INTO narration_budget(month,envelope_cents,paused) VALUES(?,70,0)').bind(new Date().toISOString().slice(0,7)).run();
      scope = await seedNarrationFixture(env.DB, 'persist');
      first = await prepareJobNarration(env, scope.agencyId, scope.jobId, providers);
    } finally {await initial.dispose();}
    const restarted = narrationProbeRuntime(directory);
    try {
      const env = await restarted.getBindings<{DB: D1Database; MEDIA: R2Bucket}>();
      await migrateNarrationProbe(env.DB);
      const forbidden = async (): Promise<never> => {throw new Error('PROVIDER_MUST_NOT_BE_CALLED');};
      const replay = await prepareJobNarration(env, scope.agencyId, scope.jobId,
        {...providers, script: {...providers.script, plan: forbidden}, voice: {...providers.voice, synthesize: forbidden}});
      assert.deepEqual(replay, first);
      assert.equal((await env.DB.prepare('SELECT sum(reservation_cents) n FROM narration_calls').first<{n: number}>())!.n, 25);
    } finally {await restarted.dispose();}
  } finally {await rm(directory, {recursive: true, force: true});}
});

test('narration : stockage D1/R2 local, reprise, isolation et budget persistant', async t => {
  const mf = new Miniflare(convertV4MiniflareOptions({modules: true, script: 'export default {fetch(){return new Response("fixture")}}',
    compatibilityDate: '2026-09-27', d1Databases: ['DB'], r2Buckets: ['MEDIA']}));
  t.after(() => mf.dispose());
  const env = await mf.getBindings<{DB: D1Database; MEDIA: R2Bucket}>();
  await migrateNarrationProbe(env.DB); await migrateNarrationProbe(env.DB);
  const config = GoogleVoiceConfig.parse({projectId: 'bienvu-fixture'});
  const counts = {script: 0, voice: 0};
  let duration = 5000, failVoice = false;
  const google = googleTts(config, async () => 'fixture-token-never-networked', {fetch: async () => {
    counts.voice++; if (failVoice) throw new Error('private-provider-diagnostic');
    return Response.json({audioContent: Buffer.from(toneFixture(duration)).toString('base64')});
  }});
  const providers: NarrationProviders = {mode: 'mock', voice: {config, synthesize: google.synthesize}, script: {model: DEFAULT_SCRIPT_MODEL,
    plan: async context => {counts.script++; return {plan: fixturePlan(context), metrics: fixtureScriptMetrics()};}}};
  await t.test('une piste par scène, cache sans fournisseur, contact figé et droits voisins refusés', async () => {
    const scope = await seedNarrationFixture(env.DB, 'cache');
    const first = await prepareJobNarration(env, scope.agencyId, scope.jobId, providers);
    assert.equal(counts.script, 1); assert.equal(counts.voice, 4);
    assert.equal(first.audio.length, 4); assert.equal(first.durationFrames.reduce((a,b) => a+b,0), 663);
    // Ancien timing à 30 s : une reprise corrige les silences sans API.
    await env.DB.prepare('UPDATE narration_runs SET result_json=? WHERE job_id=?')
      .bind(JSON.stringify({...first, durationFrames: [225,225,225,225]}), scope.jobId).run();
    const before = {...counts};
    await env.DB.prepare('UPDATE agencies SET name=? WHERE id=?').bind('Agence renommée après départ', scope.agencyId).run();
    assert.deepEqual(await prepareJobNarration(env, scope.agencyId, scope.jobId, providers), first);
    assert.deepEqual(counts, before);
    assert.equal(await findNarration(env.DB, 'other-agency', scope.jobId), null);
    await assert.rejects(prepareJobNarration(env, 'other-agency', scope.jobId, providers), /NARRATION_NOT_FOUND/);
    await assert.rejects(readNarrationAudio(env.MEDIA, {agencyId: 'other-agency', jobId: scope.jobId}, first.audio[0]), /NARRATION_STORAGE_INVALID/);
    const credit = await env.DB.prepare('SELECT consumed FROM allocations WHERE agency_id=?').bind(scope.agencyId).first<{consumed: number}>();
    assert.equal(credit!.consumed, 0);
    assert.equal((await env.DB.prepare("SELECT enabled FROM generation_control WHERE id='generations'").first<{enabled:number}>())!.enabled, 0);
  });
  await t.test('snapshot v1 sans version : reprise après crash et cache préservés', async () => {
    const scope = await seedNarrationFixture(env.DB, 'legacy');
    const job = await narrationJobInput(env.DB, scope.agencyId, scope.jobId);
    const ctx = await scriptContext(job.listing, job.brand, undefined, 'factual-copy/1');
    const configHash = await hashJson({voice: config, scriptModel: providers.script.model, promptVersion: 'narration-fr/1', mode: providers.mode});
    const {lease} = await startNarration(env.DB, {...scope, inputHash: ctx.inputHash, configHash,
      snapshot: JSON.stringify({listing: ctx.listing, brand: ctx.brand, contact: ctx.contact}), mode: providers.mode, attempt: 1});
    await releaseNarration(env.DB, lease);
    const first = await prepareJobNarration(env, scope.agencyId, scope.jobId, providers);
    assert.equal(first.script.copyVersion, 'factual-copy/1');
    assert.equal(first.script.inputHash, ctx.inputHash);
    const before = {...counts};
    assert.deepEqual(await prepareJobNarration(env, scope.agencyId, scope.jobId, providers), first);
    assert.deepEqual(counts, before);
  });
  await t.test('saisie manuelle reste user_provided et WAV corrompu ne provoque pas de nouvelle synthèse', async () => {
    const scope = await seedNarrationFixture(env.DB, 'manual', true);
    const first = await prepareJobNarration(env, scope.agencyId, scope.jobId, providers);
    assert.ok(first.script.provenance.every(p => p.status === 'user_provided'));
    const before = {...counts};
    await env.MEDIA.put(first.audio[0].objectKey, new Uint8Array(first.audio[0].sizeBytes));
    await assert.rejects(prepareJobNarration(env, scope.agencyId, scope.jobId, providers), /NARRATION_STORAGE_INVALID/);
    assert.deepEqual(counts, before);
  });
  await t.test('durée excessive : un seul raccourcissement, puis échec sans boucle', async () => {
    duration = 10000;
    const scope = await seedNarrationFixture(env.DB, 'long'); const before = {...counts};
    await assert.rejects(prepareJobNarration(env, scope.agencyId, scope.jobId, providers), /VOICE_DURATION_EXCEEDED/);
    assert.equal(counts.script - before.script, 1); assert.equal(counts.voice - before.voice, 8);
    const row = await findNarration(env.DB, scope.agencyId, scope.jobId);
    assert.equal(JSON.parse(row!.script!).version, 2); assert.equal(row!.state, 'failed');
    await assert.rejects(prepareJobNarration(env, scope.agencyId, scope.jobId, providers), /NARRATION_REVIEW_REQUIRED/);
    assert.equal(counts.voice - before.voice, 8); duration = 5000;
  });
  await t.test('échec TTS journalisé, pas de résultat ni de retry aveugle', async () => {
    const scope = await seedNarrationFixture(env.DB, 'error'); const before = {...counts}; failVoice = true;
    await assert.rejects(prepareJobNarration(env, scope.agencyId, scope.jobId, providers), e => e instanceof VoiceFailure && e.code === 'VOICE_UNAVAILABLE');
    failVoice = false;
    const row = await findNarration(env.DB, scope.agencyId, scope.jobId);
    assert.equal(row!.state, 'failed'); assert.equal(row!.result, null); assert.equal(counts.voice - before.voice, 1);
    await assert.rejects(prepareJobNarration(env, scope.agencyId, scope.jobId, providers), /NARRATION_REVIEW_REQUIRED/);
    assert.equal(counts.voice - before.voice, 1);
  });
  await t.test('concurrence : une seule orchestration peut engager le fournisseur', async () => {
    const scope = await seedNarrationFixture(env.DB, 'concurrent'), before = {...counts};
    const results = await Promise.allSettled([1,2].map(() => prepareJobNarration(env, scope.agencyId, scope.jobId, providers)));
    assert.equal(results.filter(r => r.status === 'fulfilled').length, 1,
      JSON.stringify(results.map(r => r.status === 'rejected' ? String(r.reason) : 'fulfilled')));
    assert.equal(counts.script - before.script, 1); assert.equal(counts.voice - before.voice, 4);
  });
  await t.test('budget réel absent ou épuisé : arrêt avant appel, consommation conservée après échec', async () => {
    const real = {...providers, mode: 'real' as const}, before = {...counts};
    const absent = await seedNarrationFixture(env.DB, 'no-budget');
    await assert.rejects(prepareJobNarration(env, absent.agencyId, absent.jobId, real), /NARRATION_BUDGET_LIMIT/);
    assert.deepEqual(counts, before);
    const month = new Date().toISOString().slice(0,7);
    await env.DB.prepare('INSERT INTO narration_budget(month,envelope_cents,paused) VALUES(?,5,0)').bind(month).run();
    const tiny = await seedNarrationFixture(env.DB, 'tiny-budget');
    await assert.rejects(prepareJobNarration(env, tiny.agencyId, tiny.jobId, real), /NARRATION_BUDGET_LIMIT/);
    assert.equal(counts.script-before.script, 1); assert.equal(counts.voice-before.voice, 0);
    const sum = await env.DB.prepare("SELECT sum(reservation_cents) n FROM narration_calls WHERE provider_mode='real'").first<{n:number}>();
    assert.equal(sum!.n, 5);
  });
  await t.test('coupure après réservation : appel incertain non relancé ; ancienne tentative refusée', async () => {
    const scope = await seedNarrationFixture(env.DB, 'interrupted');
    const job = await narrationJobInput(env.DB, scope.agencyId, scope.jobId), ctx = await scriptContext(job.listing, job.brand);
    const configHash = await hashJson({voice: config, scriptModel: providers.script.model, promptVersion: 'narration-fr/1', mode: providers.mode});
    const data = {...scope, inputHash: ctx.inputHash, configHash, snapshot: JSON.stringify({listing: ctx.listing, brand: ctx.brand, contact: ctx.contact, copyVersion: ctx.copyVersion}), mode: 'mock' as const, attempt: 1};
    const {lease} = await startNarration(env.DB, data);
    const requestHash = await hashJson({inputHash: ctx.inputHash, model: providers.script.model, promptVersion: 'narration-fr/1', correction: false});
    await claimNarrationCall(env.DB, lease, {stepKey: 'script/1', requestHash, provider: 'openai', mode: 'mock'});
    await releaseNarration(env.DB, lease);
    const before = {...counts};
    await assert.rejects(prepareJobNarration(env, scope.agencyId, scope.jobId, providers), /NARRATION_REVIEW_REQUIRED/);
    assert.deepEqual(counts, before);
    await env.DB.prepare('UPDATE jobs SET attempt=2 WHERE id=?').bind(scope.jobId).run();
    await assert.rejects(claimNarrationCall(env.DB, lease, {stepKey: 'script/2', requestHash, provider: 'openai', mode: 'mock'}), e => e instanceof NarrationFailure && e.code === 'NARRATION_CONFLICT');
  });
});
