import {test} from 'node:test';
import assert from 'node:assert/strict';
import {randomBytes, createHmac} from 'node:crypto';
import {Miniflare, convertV4MiniflareOptions} from 'miniflare';
import {migrateNarrationProbe, seedNarrationFixture} from '../scripts/narration-fixtures';
import {defaultPricingSimulation, PricingSimulationInput, type PricingSavedScenario} from '../packages/contracts/src/index';
import {admitGeneration} from '../packages/db/src/index';
import {pricingRequest, pricingAction, pricingScenarios, pricingObservations, type PricingBootstrap} from '../apps/web/lib/pricing-simulator';
import {createAuth} from '../apps/web/lib/auth';
import {RequestFailure} from '../apps/web/lib/http';
import {financeAction} from '../apps/web/lib/profitability';

async function localDb(t: {after(fn: () => Promise<void>): void}) {
  const mf = new Miniflare(convertV4MiniflareOptions({modules: true, script: 'export default {fetch(){return new Response("fixture")}}',
    compatibilityDate: '2026-09-27', d1Databases: ['DB'], r2Buckets: ['MEDIA']}));
  t.after(() => mf.dispose());
  const bindings = await mf.getBindings<{DB: D1Database; MEDIA: R2Bucket}>();
  await migrateNarrationProbe(bindings.DB);
  return bindings;
}
const failure = (code: string) => (e: unknown) => e instanceof RequestFailure && e.code === code;

test('Simulateur privé : authentification, validations, sauvegardes atomiques, conflits et journal indépendant des paiements', async t => {
  const {DB, MEDIA} = await localDb(t);
  const env = {DB, MEDIA, PROBE_MODE: 'local', SUPER_ADMIN_EMAIL: 'owner@example.com', BETTER_AUTH_URL: 'http://localhost:8787',
    BETTER_AUTH_SECRET: randomBytes(32).toString('hex'), GOOGLE_CLIENT_ID: '', GOOGLE_CLIENT_SECRET: '',
    AUTH_EMAIL_MODE: 'local', GENERATIONS_ENABLED: 'true', ANONYMOUS_TRIALS_ENABLED: 'true', IMPORT_MODE: 'disabled'};
  const auth = createAuth(env), context = await auth.$context;
  const cookies: string[] = [], users = [
    {id: crypto.randomUUID(), email: 'owner@example.com', name: 'Owner', emailVerified: 1},
    {id: crypto.randomUUID(), email: 'regular@example.com', name: 'Regular', emailVerified: 1},
    {id: crypto.randomUUID(), email: 'unverified@example.com', name: 'Unverified', emailVerified: 0},
  ];
  for (const u of users) {
    await DB.prepare('INSERT INTO auth_user(id,name,email,emailVerified,createdAt,updatedAt) VALUES(?,?,?,?,?,?)')
      .bind(u.id, u.name, u.email, u.emailVerified, Date.now(), Date.now()).run();
    const session = u.emailVerified ? await context.internalAdapter.createSession(u.id) : {token: randomBytes(32).toString('hex')};
    assert.ok(session);
    if (!u.emailVerified) await DB.prepare('INSERT INTO auth_session(id,expiresAt,token,createdAt,updatedAt,userId) VALUES(?,?,?,?,?,?)')
      .bind(crypto.randomUUID(), Date.now() + 86400_000, session.token, Date.now(), Date.now(), u.id).run();
    cookies.push(context.authCookies.sessionToken.name + '=' + encodeURIComponent(session.token + '.' + createHmac('sha256', env.BETTER_AUTH_SECRET).update(session.token).digest('base64')));
  }
  const req = (query = '', cookie = cookies[0], options: RequestInit = {}) => new Request(env.BETTER_AUTH_URL + '/api/admin/pricing' + query, {...options, headers: {cookie, ...options.headers}});
  const post = (value: unknown, origin = env.BETTER_AUTH_URL, cookie = cookies[0]) => pricingRequest(req('', cookie,
    {method: 'POST', headers: {origin, 'Content-Type': 'application/json'}, body: JSON.stringify(value)}), env);
  const base = defaultPricingSimulation();
  await t.test('aucun calcul, métrique ou scénario n’est exposé aux visiteurs ou autres agences', async () => {
    for (const [cookie, status] of [['', 401], [cookies[1], 403], [cookies[2], 401]] as const) {
      for (const response of [await pricingRequest(req('', cookie), env), await post({action: 'calculate', input: base}, env.BETTER_AUTH_URL, cookie)]) {
        assert.equal(response.status, status); assert.equal(response.headers.get('Cache-Control'), 'private, no-store');
        assert.doesNotMatch(await response.text(), /Cartesia|runwayUsdPerCredit|SUPER_ADMIN_EMAIL|BETTER_AUTH_SECRET/);
      }
    }
    const get = await pricingRequest(req(), env); assert.equal(get.status, 200);
    assert.equal(get.headers.get('Cache-Control'), 'private, no-store');
    const data = await get.json() as PricingBootstrap; assert.deepEqual(data.defaults, base); assert.deepEqual(data.scenarios, []);
    assert.equal(data.observations.render.averageSeconds, null);
    assert.equal(data.observations.render.averageOutputMB, null);
    assert.equal((await pricingRequest(req(), {...env, SUPER_ADMIN_EMAIL: ''})).status, 403);
  });
  await t.test('les mutations exigent la même origine et les entrées sont bornées et strictes', async () => {
    assert.equal((await post({action: 'calculate', input: base}, 'https://foreign.example')).status, 403);
    for (const query of ['?mode=unknown', '?days=0', '?days=366', '?secret=foo']) assert.equal((await pricingRequest(req(query), env)).status, 422);
    assert.equal((await post({action: 'calculate', input: {...base, unknown: true}})).status, 422);
    assert.equal((await post({action: 'save', id: null, revision: 4, input: base})).status, 422);
    assert.equal((await pricingRequest(req('', cookies[0], {method: 'POST', headers: {origin: env.BETTER_AUTH_URL, 'Content-Type': 'text/plain'}, body: '{}'}), env)).status, 422);
    assert.equal((await pricingRequest(req('', cookies[0], {method: 'POST', headers: {origin: env.BETTER_AUTH_URL, 'Content-Type': 'application/json'}, body: ' '.repeat(65537)}), env)).status, 413);
    const calculated = await post({action: 'calculate', input: base}); assert.equal(calculated.status, 200);
    assert.equal((await DB.prepare('SELECT count(*) n FROM pricing_scenarios').first<{n: number}>())!.n, 0);
  });
  let saved: PricingSavedScenario;
  await t.test('le cycle créer, relire et mettre à jour conserve toutes les hypothèses sans modifier les tarifs', async () => {
    const before = await DB.prepare('SELECT * FROM credit_payment_policy').all();
    const response = await post({action: 'save', id: null, revision: null, input: base}); assert.equal(response.status, 200);
    saved = (await response.json() as {scenario: PricingSavedScenario}).scenario;
    assert.equal(saved.revision, 1); assert.deepEqual(saved.input, base);
    const changed = {...base, name: 'Comparaison Pro', notes: 'Hausse IA et prix, simulation uniquement.'};
    const updated = await post({action: 'save', id: saved.id, revision: 1, input: changed}); assert.equal(updated.status, 200);
    saved = (await updated.json() as {scenario: PricingSavedScenario}).scenario;
    assert.equal(saved.revision, 2); assert.deepEqual((await pricingScenarios(DB))[0].input, changed);
    assert.deepEqual((await DB.prepare('SELECT action,revision FROM pricing_scenario_audit ORDER BY revision').all()).results,
      [{action: 'create', revision: 1}, {action: 'update', revision: 2}]);
    assert.deepEqual((await DB.prepare('SELECT * FROM credit_payment_policy').all()).results, before.results);
    assert.equal((await DB.prepare('SELECT count(*) n FROM financial_audit').first<{n: number}>())!.n, 0);
    assert.equal((await DB.prepare('SELECT count(*) n FROM financial_receipts').first<{n: number}>())!.n, 0);
  });
  await t.test('une version obsolète ou deux sauvegardes simultanées n’écrasent pas les changements et ne créent pas de faux audit', async () => {
    await assert.rejects(pricingAction(DB, users[0].id, {action: 'save', id: saved.id, revision: 1, input: base}), failure('CONFLICT'));
    const results = await Promise.allSettled([1, 2].map(n => pricingAction(DB, users[0].id,
      {action: 'save', id: saved.id, revision: saved.revision, input: {...base, name: 'Concurrent ' + n}})));
    assert.equal(results.filter(r => r.status === 'fulfilled').length, 1);
    assert.ok(results.some(r => r.status === 'rejected' && failure('CONFLICT')(r.reason)));
    saved = (await pricingScenarios(DB)).find(s => s.id === saved.id)!; assert.equal(saved.revision, 3);
    assert.equal((await DB.prepare('SELECT count(*) n FROM pricing_scenario_audit').first<{n: number}>())!.n, 3);
    await assert.rejects(DB.exec('UPDATE pricing_scenario_audit SET revision=100'), /PRICING_AUDIT_IMMUTABLE/);
    await assert.rejects(DB.exec('DELETE FROM pricing_scenario_audit'), /PRICING_AUDIT_IMMUTABLE/);
  });
  await t.test('les suppressions sont versionnées et une copie reste indépendante', async () => {
    const copy = await pricingAction(DB, users[0].id, {action: 'save', id: null, revision: null, input: saved.input});
    assert.ok(copy.scenario); const copied = copy.scenario; assert.notEqual(copied.id, saved.id);
    await assert.rejects(pricingAction(DB, users[0].id, {action: 'delete', id: saved.id, revision: 1}), failure('CONFLICT'));
    await pricingAction(DB, users[0].id, {action: 'delete', id: saved.id, revision: saved.revision});
    assert.ok(!(await pricingScenarios(DB)).some(s => s.id === saved.id));
    assert.ok((await pricingScenarios(DB)).some(s => s.id === copied.id));
    assert.equal((await DB.prepare('SELECT revision,deleted_at FROM pricing_scenarios WHERE id=?').bind(saved.id).first<{revision: number; deleted_at: string}>())!.revision, 4);
    assert.equal((await post({action: 'save', id: saved.id, revision: 4, input: base})).status, 409);
  });
  await t.test('la limite de mutations annule aussi l’écriture et la limite de scénarios est explicite', async () => {
    for (let n = 0; n < 10; n++) await pricingAction(DB, 'rate-fixture', {action: 'save', id: null, revision: null, input: {...base, name: 'Rate ' + n}});
    const before = (await pricingScenarios(DB)).length;
    await assert.rejects(pricingAction(DB, 'rate-fixture', {action: 'save', id: null, revision: null, input: base}), failure('RATE_LIMITED'));
    assert.equal((await pricingScenarios(DB)).length, before);
    const at = new Date().toISOString();
    const remaining = 100 - before;
    await DB.batch(Array.from({length: remaining}, () => DB.prepare('INSERT INTO pricing_scenarios(id,name,revision,input_json,mutation_id,created_by,updated_by,created_at,updated_at) VALUES(?,?,1,?,?,?,?,?,?)')
      .bind(crypto.randomUUID(), base.name, JSON.stringify(base), crypto.randomUUID(), 'fixture', 'fixture', at, at)));
    await assert.rejects(pricingAction(DB, 'limit-fixture', {action: 'save', id: null, revision: null, input: base}), failure('CONFLICT'));
    assert.equal((await pricingScenarios(DB)).length, 100);
  });
});

test('Données observées : mesures inconnues, estimations, factures et paiements restent distincts, sans payload privé ni mélange test/live', async t => {
  const {DB} = await localDb(t), now = Date.now(), at = new Date(now).toISOString(), month = at.slice(0, 7), day = at.slice(0, 10);
  await DB.exec("UPDATE generation_control SET enabled=1; UPDATE trial_policy SET free_enabled=1");
  await DB.prepare('INSERT INTO hosted_import_budget VALUES(?,0,9000,0)').bind(month).run();
  await DB.prepare('INSERT INTO narration_budget VALUES(?,2500,0)').bind(month).run();
  const makeJob = async (label: string, mode: 'test' | 'live', ready: boolean) => {
    const f = await seedNarrationFixture(DB, label);
    await DB.prepare("UPDATE jobs SET status='failed',error_code='FIXTURE',lease_until=NULL WHERE id=?").bind(f.jobId).run();
    await DB.prepare("UPDATE allocations SET kind='paid',quota_limit=10 WHERE agency_id=?").bind(f.agencyId).run();
    await DB.prepare('INSERT INTO generation_access VALUES(?,?,1)').bind(f.agencyId, 'allocation-' + label).run();
    await DB.prepare('UPDATE credit_payment_policy SET mode=? WHERE id=1').bind(mode).run();
    const job = await admitGeneration(DB, f.agencyId, 'pricing-observation-' + label, {listingId: 'listing-' + label}, 'true');
    if (ready) await DB.prepare('INSERT INTO generation_artifacts VALUES(?,?,?,?)')
      .bind(job.jobId, 'fixture-output-' + label, JSON.stringify({renderAndVerifySeconds: 123, sizeBytes: 12_000_000, privatePrompt: 'PRIVATE_PROMPT'}), at).run();
    await DB.prepare('UPDATE jobs SET status=?,error_code=?,lease_until=NULL WHERE id=?').bind(ready ? 'ready' : 'failed', ready ? null : 'FIXTURE', job.jobId).run();
    await DB.prepare("INSERT INTO narration_runs(job_id,agency_id,input_hash,config_hash,snapshot_json,provider_mode,job_attempt,created_at,expires_at) VALUES(?,?,?,?,'{}','real',1,?,?)")
      .bind(job.jobId, f.agencyId, 'a'.repeat(64), 'b'.repeat(64), at, new Date(now + 86400_000).toISOString()).run();
    return {...f, jobId: job.jobId};
  };
  const ready = await makeJob('pricing-ready', 'test', true), partial = await makeJob('pricing-partial', 'test', true), failed = await makeJob('pricing-failed', 'test', false), live = await makeJob('pricing-live', 'live', true);
  const call = async (job: typeof ready, provider: 'openai' | 'cartesia', step: string, micros: number | null) => {
    const cost = {currency: 'USD', ...(micros === null ? {} : provider === 'openai' ? {estimatedMicrosBeforeCacheDiscount: micros} : {estimatedMicrosBeforeFreeTier: micros})};
    await DB.prepare("INSERT INTO narration_calls(id,agency_id,job_id,step_key,request_hash,provider,provider_mode,month,reservation_cents,state,result_json,created_at) VALUES(?,?,?,?,?,?,'real',?,5,'done',?,?)")
      .bind(crypto.randomUUID(), job.agencyId, job.jobId, step, 'c'.repeat(64), provider, month, JSON.stringify({metrics: {cost}, apiKey: 'PRIVATE_SECRET', plan: {privatePrompt: 'PRIVATE_PROMPT'}}), at).run();
  };
  await call(ready, 'openai', 'script-1', 2000); await call(ready, 'cartesia', 'voice-1', 0);
  await call(partial, 'openai', 'script-1', 3000); await call(partial, 'openai', 'script-2', null);
  await call(partial, 'cartesia', 'voice-1', -1); await call(failed, 'openai', 'script-1', 8000);
  await call(live, 'openai', 'script-1', 4000);
  await financeAction({DB}, 'pricing-finance-fixture', {action: 'expense', provider: 'openai', reference: 'invoice-pricing-observed', mode: 'test', kind: 'usage',
    currency: 'EUR', originalMinor: 150, eurCents: 150, quantity: 1, from: day, until: day, paidAt: day,
    note: 'Facture réelle affectée, différente de la simple estimation de requête.', allocations: [{jobId: ready.jobId, units: 1, covers: true}]});
  for (const [job, mode, gross, ht, fee, complete] of [[ready, 'test', 840, 700, 38, 1], [live, 'live', 2280, 1900, null, 0]] as const) {
    const id = 'topup-' + mode;
    await DB.prepare("INSERT INTO allocations(id,agency_id,kind,period_key,quota_limit,consumed,reserved,valid_from,valid_until) VALUES(?,?,'paid',?,10,2,1,?,?)")
      .bind(id, job.agencyId, id, at, new Date(now + 365 * 86400_000).toISOString()).run();
    await DB.prepare("INSERT INTO financial_receipts(id,agency_id,mode,kind,allocation_id,credits,gross_cents,revenue_ht_cents,currency,customer_id,fee_cents,fees_complete,paid_at) VALUES(?,?,?,'topup',?,10,?,?,'eur','cus_fixture',?,?,?)")
      .bind('receipt-' + mode, job.agencyId, mode, id, gross, ht, fee, complete, at).run();
  }
  const tested = await pricingObservations(DB, new URLSearchParams({mode: 'test'}), Date.now());
  assert.equal(tested.activity.jobs, 3); assert.equal(tested.activity.ready, 2); assert.equal(tested.activity.failed, 1);
  assert.deepEqual(tested.render, {reports: 2, averageSeconds: 123, averageOutputMB: 12});
  const openai = tested.providers.find(p => p.provider === 'openai')!;
  assert.equal(openai.realCalls, 4); assert.equal(openai.measuredCalls, 3); assert.equal(openai.completeJobs, 1);
  assert.equal(openai.estimatedTotalUsd, 0.013); assert.equal(openai.estimatedAverageJobUsd, 0.002);
  assert.equal(openai.reconciledAverageJobEur, 1.5); assert.equal(openai.reconciledJobs, 1);
  const voice = tested.providers.find(p => p.provider === 'cartesia')!;
  assert.equal(voice.measuredCalls, 1); assert.equal(voice.completeJobs, 1); assert.equal(voice.estimatedAverageJobUsd, 0);
  assert.equal(voice.reconciledAverageJobEur, null);
  assert.equal(tested.unusedPackCredits, 7); assert.equal(tested.sales[0].feeEur, 0.38); assert.equal(tested.sales[0].revenueHtEur, 7);
  const lived = await pricingObservations(DB, new URLSearchParams({mode: 'live'}), Date.now());
  assert.equal(lived.activity.jobs, 1); assert.equal(lived.providers[0].estimatedAverageJobUsd, 0.004);
  assert.equal(lived.providers[0].reconciledAverageJobEur, null); assert.equal(lived.sales[0].missingFees, 1);
  assert.equal(lived.sales[0].feeEur, null); assert.equal(lived.unusedPackCredits, 7);
  const all = await pricingObservations(DB); assert.equal(all.activity.jobs, 4); assert.equal(all.unusedPackCredits, 14);
  assert.doesNotMatch(JSON.stringify(all), /PRIVATE_SECRET|PRIVATE_PROMPT|result_json|snapshot_json|object_key|apiKey|privatePrompt/);
  // A valid zero is still measured; missing/negative metadata never becomes a zero cost.
  await DB.prepare("UPDATE narration_calls SET result_json='{}' WHERE provider='cartesia'").run();
  assert.equal((await pricingObservations(DB)).providers.find(p => p.provider === 'cartesia')!.estimatedAverageJobUsd, null);
  await DB.prepare("UPDATE narration_calls SET provider_mode='mock',reservation_cents=0").run();
  await DB.prepare("UPDATE narration_runs SET provider_mode='mock'").run();
  const mocked = await pricingObservations(DB); assert.equal(mocked.providers[0].realCalls, 0); assert.equal(mocked.providers[0].estimatedAverageJobUsd, null);
  assert.equal(mocked.providers[0].reconciledAverageJobEur, 1.5);
  assert.equal(PricingSimulationInput.safeParse(defaultPricingSimulation()).success, true);
});
