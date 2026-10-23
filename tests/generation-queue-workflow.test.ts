import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdtemp, rm, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { Miniflare, convertV4MiniflareOptions } from 'miniflare';
import { migrateNarrationProbe, seedNarrationFixture } from '../scripts/narration-fixtures';
import {
  admitGeneration,
  findGeneration,
  generationView,
  adminGenerationQueue,
  setGenerationQueueSettings,
  type GenerationRow,
} from '../packages/db/src/index';
import { DEFAULT_GENERATION_QUEUE, generationRendererName } from '../packages/contracts/src/index';
import { videoFixture } from '../fixtures/video';

test('trois workflows workerd : deux serveurs distincts, attente du troisième et conservation sans double coût', async (t) => {
  const directory = await mkdtemp(path.join(tmpdir(), 'bienvu-queue-workflows-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const require = createRequire(import.meta.url),
    wrangler = createRequire(require.resolve('wrangler/package.json'));
  const esbuild = (await import(pathToFileURL(wrangler.resolve('esbuild')).href)) as {
    build: (o: unknown) => Promise<unknown>;
  };
  const file = path.join(directory, 'worker.mjs');
  await esbuild.build({
    entryPoints: ['fixtures/generation-worker.ts'],
    outfile: file,
    bundle: true,
    platform: 'neutral',
    mainFields: ['module', 'main'],
    format: 'esm',
    target: 'es2022',
    external: ['cloudflare:*', 'node:*'],
    conditions: ['workerd', 'worker', 'browser'],
  });
  const options = {
    ...convertV4MiniflareOptions({
      modules: true,
      script: await readFile(file, 'utf8'),
      compatibilityDate: '2026-09-27',
      compatibilityFlags: ['nodejs_compat'],
      bindings: { GENERATION_TOKEN: 'fixture-generation-token-1234567890', GENERATIONS_ENABLED: 'true' },
      d1Databases: ['DB'],
      r2Buckets: ['MEDIA'],
      durableObjects: { RENDERER: { className: 'FixtureHeldGenerationRenderer', useSQLite: true } },
      workflows: { GENERATION_WORKFLOW: { name: 'fixture-generation-queue', className: 'FixtureGenerationWorkflow' } },
    }),
    resourcePersistencePath: path.join(directory, 'storage'),
  };
  let mf = new Miniflare(options);
  t.after(() => mf.dispose());
  let env = await mf.getBindings<{ DB: D1Database; MEDIA: R2Bucket; RENDERER: DurableObjectNamespace }>();
  await migrateNarrationProbe(env.DB);
  await env.DB.prepare('INSERT INTO hosted_import_budget VALUES(?,0,9000,0)')
    .bind(new Date().toISOString().slice(0, 7))
    .run();
  await env.DB.exec('UPDATE generation_control SET enabled=1');
  await setGenerationQueueSettings(env.DB, 'queue-admin', { ...DEFAULT_GENERATION_QUEUE, renderConcurrency: 2 }, 1);
  const fixture = await videoFixture(),
    jobs: GenerationRow[] = [];
  for (let n = 0; n < 3; n++) {
    const label = `queue-workflow-${n}`,
      scope = await seedNarrationFixture(env.DB, label, true);
    await env.DB.prepare("UPDATE jobs SET status='failed',error_code='FIXTURE',lease_until=NULL WHERE id=?")
      .bind(scope.jobId)
      .run();
    await env.DB.prepare('INSERT INTO generation_access VALUES(?,?,1)')
      .bind(scope.agencyId, `allocation-${label}`)
      .run();
    const listing = structuredClone(fixture.listing);
    listing.agencyId = scope.agencyId;
    listing.id = `listing-${label}`;
    for (const p of listing.photos) {
      p.agencyId = scope.agencyId;
      p.listingId = listing.id;
      p.objectKey = `agencies/${scope.agencyId}/imports/${listing.id}/${p.id}.png`;
      await env.MEDIA.put(p.objectKey, new Uint8Array(fixture.files.get(p.id)!), {
        customMetadata: { sha256: p.contentHash },
      });
    }
    await env.DB.prepare('UPDATE listing_imports SET result_json=? WHERE id=?')
      .bind(JSON.stringify(listing), listing.id)
      .run();
    jobs.push(
      await admitGeneration(
        env.DB,
        scope.agencyId,
        `queue-workflow-${n}-key`,
        { listingId: listing.id, voiceEnabled: false },
        'true',
      ),
    );
  }
  const headers = { Authorization: 'Bearer fixture-generation-token-1234567890', 'X-Agency-ID': jobs[0].agencyId };
  await mf.dispatchFetch('https://test/tick', { headers });
  async function waitFor(check: () => Promise<boolean>, seconds: number) {
    const until = Date.now() + seconds * 1000;
    while (Date.now() < until) {
      if (await check()) return;
      await new Promise((r) => setTimeout(r, 150));
    }
    assert.fail('Le workflow de recette n’a pas atteint l’état attendu.');
  }
  await waitFor(async () => {
    const usage = (await adminGenerationQueue(env.DB)).usage.find((u) => u.resource === 'render')!;
    return usage.active === 2 && usage.waiting === 1;
  }, 45);
  const rows = await Promise.all(jobs.map((j) => findGeneration(env.DB, j.agencyId, j.jobId))),
    active = rows.filter((r) => r!.renderSlot !== null),
    waiting = rows.find((r) => r!.renderSlot === null)!;
  assert.equal(active.length, 2);
  assert.notEqual(active[0]!.renderSlot, active[1]!.renderSlot);
  assert.equal(generationView(waiting!).queue?.resource, 'render');
  assert.equal(generationView(waiting!).queue?.position, 1);
  for (const row of active) {
    const count = await env.RENDERER.getByName(generationRendererName(row!.renderSlot)).fetch('https://fixture/count');
    assert.equal(((await count.json()) as { starts: number }).starts, 1);
  }
  const calls = (await env.DB.prepare('SELECT count(*) AS n FROM narration_calls').first<{ n: number }>())!.n;
  assert.equal(calls, 3);
  assert.equal((await adminGenerationQueue(env.DB)).usage.find((u) => u.resource === 'render')!.active, 2);
  const released = active[0]!;
  await env.RENDERER.getByName(generationRendererName(released!.renderSlot)).fetch('https://fixture/release', {
    method: 'POST',
  });
  await mf.dispatchFetch(`https://test/reconcile/${released!.jobId}`, {
    headers: { ...headers, 'X-Agency-ID': released!.agencyId },
  });
  await waitFor(async () => {
    const row = await findGeneration(env.DB, waiting!.agencyId, waiting!.jobId);
    return row!.renderSlot !== null;
  }, 40);
  assert.equal(
    (await findGeneration(env.DB, waiting!.agencyId, waiting!.jobId))!.renderSlot,
    released!.renderSlot,
    'Le troisième utilise seulement une place confirmée libre',
  );
  for (const row of active)
    await env.RENDERER.getByName(generationRendererName(row!.renderSlot)).fetch('https://fixture/release', {
      method: 'POST',
    });
  await waitFor(async () => {
    const latest = await Promise.all(jobs.map((j) => findGeneration(env.DB, j.agencyId, j.jobId)));
    return latest.every((r) => r!.status === 'ready');
  }, 20);
  // Active lease persistence is exercised separately in generation-queue.test.
  // Miniflare does not restore the in-flight Workflow engine after disposal.
  await mf.dispose();
  mf = new Miniflare(options);
  env = await mf.getBindings<{ DB: D1Database; MEDIA: R2Bucket; RENDERER: DurableObjectNamespace }>();
  assert.equal((await env.DB.prepare('SELECT count(*) AS n FROM narration_calls').first<{ n: number }>())!.n, calls);
  assert.equal((await env.DB.prepare('SELECT count(*) AS n FROM generation_artifacts').first<{ n: number }>())!.n, 3);
  assert.equal(
    (await env.DB.prepare('SELECT baseline_cents AS n FROM hosted_import_budget').first<{ n: number }>())!.n,
    360,
  );
  assert.deepEqual((await env.DB.prepare('SELECT reserved,consumed FROM allocations ORDER BY id').all()).results, [
    { reserved: 0, consumed: 1 },
    { reserved: 0, consumed: 1 },
    { reserved: 0, consumed: 1 },
  ]);
  assert.equal(
    (await adminGenerationQueue(env.DB)).usage.every((u) => u.active === 0 && u.waiting === 0),
    true,
  );
});
