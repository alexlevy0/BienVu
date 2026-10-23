import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { Miniflare, convertV4MiniflareOptions } from 'miniflare';
import { migrateNarrationProbe, seedNarrationFixture } from '../scripts/narration-fixtures';
import {
  admitGeneration,
  findGeneration,
  failGeneration,
  generationView,
  claimGenerationResource,
  releaseGenerationResource,
  adminGenerationQueue,
  setGenerationQueueSettings,
  type GenerationRow,
} from '../packages/db/src/index';
import {
  DEFAULT_GENERATION_QUEUE,
  generationRendererName,
  type GenerationQueueResource,
} from '../packages/contracts/src/index';

async function seed(db: D1Database, label: string) {
  const scope = await seedNarrationFixture(db, label, true);
  await db
    .prepare("UPDATE jobs SET status='failed',error_code='FIXTURE',lease_until=NULL WHERE id=?")
    .bind(scope.jobId)
    .run();
  await db.prepare("UPDATE allocations SET kind='paid',quota_limit=30 WHERE agency_id=?").bind(scope.agencyId).run();
  await db.prepare('INSERT INTO generation_access VALUES(?,?,1)').bind(scope.agencyId, `allocation-${label}`).run();
  return { agencyId: scope.agencyId, listingId: `listing-${label}` };
}
async function enable(db: D1Database) {
  await db
    .prepare('INSERT INTO hosted_import_budget VALUES(?,0,9000,0)')
    .bind(new Date().toISOString().slice(0, 7))
    .run();
  await db.exec('UPDATE generation_control SET enabled=1');
}

test('file D1 : admission concurrente, places atomiques, équité par agence et reprise après redémarrage', async (t) => {
  const directory = await mkdtemp(path.join(tmpdir(), 'bienvu-queue-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const options = {
    ...convertV4MiniflareOptions({
      modules: true,
      script: 'export default {fetch(){return new Response("fixture")}}',
      compatibilityDate: '2026-09-27',
      d1Databases: ['DB'],
    }),
    resourcePersistencePath: path.join(directory, 'storage'),
  };
  let mf = new Miniflare(options);
  t.after(() => mf.dispose());
  let db = await mf.getD1Database('DB');
  await migrateNarrationProbe(db);
  await enable(db);
  const a = await seed(db, 'queue-a'),
    b = await seed(db, 'queue-b');
  await setGenerationQueueSettings(
    db,
    'queue-admin',
    { ...DEFAULT_GENERATION_QUEUE, preparationConcurrency: 2, perAgencyConcurrency: 1, renderConcurrency: 2 },
    1,
  );
  const first = await admitGeneration(db, a.agencyId, 'queue-first-key-1234', { listingId: a.listingId }, 'true');
  const second = await admitGeneration(db, a.agencyId, 'queue-second-key-1234', { listingId: a.listingId }, 'true');
  const third = await admitGeneration(db, b.agencyId, 'queue-third-key-1234', { listingId: b.listingId }, 'true');
  const refs = [first, second, third];
  for (let pass = 0; pass < 2; pass++)
    await Promise.all(refs.map((r) => claimGenerationResource(db, r.agencyId, r.jobId, 'preparation')));
  const prep = (await adminGenerationQueue(db)).usage.find((u) => u.resource === 'preparation')!;
  assert.deepEqual(prep, { resource: 'preparation', active: 2, waiting: 1, concurrency: 2 });
  assert.equal(
    (await claimGenerationResource(db, a.agencyId, second.jobId, 'preparation'))!.state,
    'waiting',
    'Une agence ne monopolise pas la préparation',
  );
  assert.deepEqual(generationView((await findGeneration(db, a.agencyId, second.jobId))!).queue?.position, 1);
  assert.equal(
    await claimGenerationResource(db, b.agencyId, second.jobId, 'render'),
    null,
    'Une autre agence ne peut ni entrer ni réclamer une place',
  );
  assert.equal(await findGeneration(db, b.agencyId, second.jobId), null);
  await releaseGenerationResource(db, a.agencyId, first.jobId, 'preparation');
  assert.equal((await claimGenerationResource(db, a.agencyId, second.jobId, 'preparation'))!.state, 'active');
  for (const r of refs) await claimGenerationResource(db, r.agencyId, r.jobId, 'render');
  const rows = await Promise.all(refs.map((r) => findGeneration(db, r.agencyId, r.jobId)));
  assert.deepEqual(
    rows.map((r) => r!.renderSlot),
    [0, 1, null],
  );
  assert.notEqual(generationRendererName(rows[0]!.renderSlot), generationRendererName(rows[1]!.renderSlot));
  assert.equal(generationView(rows[2]!).queue?.resource, 'render');
  assert.equal(generationView(rows[2]!).queue?.position, 1);
  await mf.dispose();
  mf = new Miniflare(options);
  db = await mf.getD1Database('DB');
  assert.deepEqual(
    (await adminGenerationQueue(db)).usage.find((u) => u.resource === 'render'),
    { resource: 'render', active: 2, waiting: 1, concurrency: 2 },
  );
  assert.equal((await findGeneration(db, a.agencyId, first.jobId))!.renderSlot, 0);
  assert.equal((await claimGenerationResource(db, b.agencyId, third.jobId, 'render'))!.state, 'waiting');
  await failGeneration(db, first, 'GENERATION_FAILED');
  await Promise.all([1, 2, 3].map(() => claimGenerationResource(db, b.agencyId, third.jobId, 'render')));
  assert.equal(
    (await findGeneration(db, b.agencyId, third.jobId))!.renderSlot,
    0,
    'Une seule nouvelle attribution de la place libérée',
  );
  await failGeneration(db, first, 'GENERATION_FAILED');
  assert.equal(
    (await adminGenerationQueue(db)).usage.find((u) => u.resource === 'render')!.active,
    2,
    'Un règlement rejoué ne libère pas la place du suivant',
  );
  assert.deepEqual(
    await db.prepare('SELECT reserved,consumed FROM allocations WHERE agency_id=?').bind(a.agencyId).first(),
    { reserved: 1, consumed: 0 },
  );
  assert.equal(
    (await db.prepare('SELECT baseline_cents AS n FROM hosted_import_budget').first<{ n: number }>())!.n,
    360,
    'Une seule provision par vidéo',
  );
  assert.deepEqual((await db.prepare('PRAGMA foreign_key_check').all()).results, []);
});

test('file D1 : quotas Runway réels, réduction de capacité sans interruption et audits de réglages', async (t) => {
  const mf = new Miniflare(
    convertV4MiniflareOptions({
      modules: true,
      script: 'export default {fetch(){return new Response("fixture")}}',
      compatibilityDate: '2026-09-27',
      d1Databases: ['DB'],
    }),
  );
  t.after(() => mf.dispose());
  const db = await mf.getD1Database('DB');
  await migrateNarrationProbe(db);
  await enable(db);
  const a = await seed(db, 'queue-runway');
  const jobs: GenerationRow[] = [];
  for (let n = 0; n < 4; n++)
    jobs.push(await admitGeneration(db, a.agencyId, `queue-runway-${n}-key`, { listingId: a.listingId }, 'true'));
  async function claim(resource: GenerationQueueResource) {
    for (const r of jobs) await claimGenerationResource(db, r.agencyId, r.jobId, resource);
  }
  await claim('runway');
  assert.equal(
    (await adminGenerationQueue(db)).usage.find((u) => u.resource === 'runway')!.active,
    1,
    'Snapshot inconnu : une animation à la fois',
  );
  await db
    .prepare("UPDATE generation_provider_limits SET concurrency=3,checked_at=?,last_error=NULL WHERE provider='runway'")
    .bind(new Date().toISOString())
    .run();
  await claim('runway');
  assert.equal((await adminGenerationQueue(db)).usage.find((u) => u.resource === 'runway')!.active, 3);
  const before = await adminGenerationQueue(db);
  await setGenerationQueueSettings(db, 'queue-admin', { ...before.settings, runwayConcurrency: 1 }, before.revision);
  assert.equal(
    (await adminGenerationQueue(db)).usage.find((u) => u.resource === 'runway')!.active,
    3,
    'Les tâches actives finissent avant réduction',
  );
  assert.equal((await claimGenerationResource(db, a.agencyId, jobs[3].jobId, 'runway'))!.state, 'waiting');
  for (const r of jobs.slice(0, 3)) await releaseGenerationResource(db, a.agencyId, r.jobId, 'runway');
  assert.equal((await claimGenerationResource(db, a.agencyId, jobs[3].jobId, 'runway'))!.state, 'active');
  await assert.rejects(
    setGenerationQueueSettings(db, 'queue-admin', before.settings, before.revision),
    /GENERATION_QUEUE_SETTING_CONFLICT/,
  );
  const next = await adminGenerationQueue(db);
  await setGenerationQueueSettings(db, 'queue-admin', { ...next.settings, runwayConcurrency: 5 }, next.revision);
  await db.exec("UPDATE generation_provider_limits SET last_error='RUNWAY_LIMITS_UNAVAILABLE'");
  assert.equal(
    (await adminGenerationQueue(db)).usage.find((u) => u.resource === 'runway')!.concurrency,
    1,
    'Lecture en échec : retour à une place',
  );
  await db.exec("UPDATE generation_provider_limits SET last_error=NULL,checked_at='2020-01-01T00:00:00.000Z'");
  assert.equal(
    (await adminGenerationQueue(db)).usage.find((u) => u.resource === 'runway')!.concurrency,
    1,
    'Quota périmé : retour à une place',
  );
  const revision = (await adminGenerationQueue(db)).revision,
    at = new Date().toISOString();
  await assert.rejects(
    db
      .prepare('INSERT INTO generation_queue_setting_events VALUES(?,?,?,?,?)')
      .bind('bad-setting', 'queue-admin', '{}', revision, at)
      .run(),
    /VALIDATION_ERROR/,
  );
  await assert.rejects(
    db
      .prepare('INSERT INTO generation_queue_setting_events VALUES(?,?,?,?,?)')
      .bind(
        'fraction-setting',
        'queue-admin',
        JSON.stringify({ ...DEFAULT_GENERATION_QUEUE, renderConcurrency: 1.5 }),
        revision,
        at,
      )
      .run(),
    /VALIDATION_ERROR/,
  );
  assert.equal((await adminGenerationQueue(db)).revision, revision);
});

test('admissions de file simultanées : limite par agence, quota et budget restent atomiques', async (t) => {
  const mf = new Miniflare(
    convertV4MiniflareOptions({
      modules: true,
      script: 'export default {fetch(){return new Response("fixture")}}',
      compatibilityDate: '2026-09-27',
      d1Databases: ['DB'],
    }),
  );
  t.after(() => mf.dispose());
  const db = await mf.getD1Database('DB');
  await migrateNarrationProbe(db);
  await enable(db);
  const a = await seed(db, 'queue-limits');
  await setGenerationQueueSettings(
    db,
    'queue-admin',
    { ...DEFAULT_GENERATION_QUEUE, maxPending: 3, maxPerAgency: 2 },
    1,
  );
  const results = await Promise.allSettled(
    Array.from({ length: 6 }, (_, n) =>
      admitGeneration(db, a.agencyId, `queue-race-${n}-key`, { listingId: a.listingId }, 'true'),
    ),
  );
  assert.equal(results.filter((r) => r.status === 'fulfilled').length, 2);
  for (const result of results)
    if (result.status === 'rejected') assert.match(String(result.reason), /GENERATION_QUEUE_FULL/);
  assert.deepEqual(
    await db.prepare('SELECT reserved,consumed FROM allocations WHERE agency_id=?').bind(a.agencyId).first(),
    { reserved: 2, consumed: 0 },
  );
  assert.equal(
    (await db.prepare('SELECT baseline_cents AS n FROM hosted_import_budget').first<{ n: number }>())!.n,
    240,
  );
  const accepted = results.find((r) => r.status === 'fulfilled')!;
  if (accepted.status !== 'fulfilled') throw Error('FIXTURE');
  await failGeneration(db, accepted.value, 'GENERATION_FAILED');
  // Lowering the money envelope blocks another request even though a queue slot is free.
  await db.exec('UPDATE hosted_import_budget SET ceiling_cents=250');
  await assert.rejects(
    admitGeneration(db, a.agencyId, 'queue-no-budget-key', { listingId: a.listingId }, 'true'),
    /GENERATION_BUDGET_LIMIT/,
  );
  assert.equal((await db.prepare('SELECT count(*) AS n FROM generation_runs').first<{ n: number }>())!.n, 2);
});

test('les imports URL attendent l’importeur ; les fiches préparées continuent en parallèle', async (t) => {
  const mf = new Miniflare(
    convertV4MiniflareOptions({
      modules: true,
      script: 'export default {fetch(){return new Response("fixture")}}',
      compatibilityDate: '2026-09-27',
      d1Databases: ['DB'],
    }),
  );
  t.after(() => mf.dispose());
  const db = await mf.getD1Database('DB');
  await migrateNarrationProbe(db);
  await enable(db);
  const a = await seed(db, 'queue-import-a'),
    b = await seed(db, 'queue-import-b');
  const input = { url: 'https://www.century21.fr/trouver_logement/detail/123456/' };
  const first = await admitGeneration(db, a.agencyId, 'queue-import-first-key', input, 'true'),
    second = await admitGeneration(db, b.agencyId, 'queue-import-second-key', input, 'true');
  const prepared = await admitGeneration(db, a.agencyId, 'queue-import-manual-key', { listingId: a.listingId }, 'true');
  assert.equal((await claimGenerationResource(db, a.agencyId, first.jobId, 'preparation'))!.state, 'active');
  assert.equal((await claimGenerationResource(db, b.agencyId, second.jobId, 'preparation'))!.state, 'waiting');
  assert.equal(
    (await claimGenerationResource(db, a.agencyId, prepared.jobId, 'preparation'))!.state,
    'active',
    'La lecture d’un portail ne bloque pas une fiche prête',
  );
  await db.prepare('UPDATE jobs SET listing_id=? WHERE id=?').bind(a.listingId, first.jobId).run();
  assert.equal(
    (await claimGenerationResource(db, b.agencyId, second.jobId, 'preparation'))!.state,
    'active',
    'La place d’import est libérée avant la narration et le rendu',
  );
});
