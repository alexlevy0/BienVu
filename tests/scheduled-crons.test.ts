import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { resolve, dirname } from 'node:path';
import { gunzipSync } from 'node:zlib';
import { readFile } from 'node:fs/promises';
import { Miniflare, convertV4MiniflareOptions } from 'miniflare';
import {
  runScheduledTasks,
  scheduledFailureRecord,
  ScheduledTasksFailed,
  type ScheduledTask,
} from '../packages/observability/src/index';
import { admitGeneration } from '../packages/db/src/index';
import { migrateNarrationProbe, seedNarrationFixture } from '../scripts/narration-fixtures';

const tracking = {
  POSTHOG_ENABLED: 'true',
  POSTHOG_HOST: 'https://eu.i.posthog.com',
  POSTHOG_PROJECT_TOKEN: 'phc_cron_fixture_project_token',
};
const secret = 'PRIVATE_cookie=private@example.fr Bearer PRIVATE_AUTH https://private.test/?token=PRIVATE_TOKEN';
const daily = [
  'purge_traffic',
  'purge_seo',
  'cleanup_social',
  'cleanup_homepage_assets',
  'cleanup_mail_uploads',
  'cleanup_partner_applications',
  'purge_ai_quality',
  'cleanup_showcases',
  'cleanup_push_devices',
];
const minute = [
  'run_social_batch',
  'send_mailbox_outbox',
  'run_ai_quality_batch',
  'send_showcase_notifications',
  'send_generation_notifications',
  'run_admin_alerts',
];
const generation = [
  'sync_runway_limits',
  'reconcile_generations',
  'reconcile_avatars',
  'run_admin_recovery',
  'cleanup_anonymous_trials',
  'cleanup_animations',
];
const sorted = (values: readonly string[]) => [...values].sort();

async function invokeScheduled(mf: Miniflare, cron: string) {
  const worker = await mf.getWorker();
  // Check the capability on the actual workerd service proxy, retaining its receiver.
  const scheduled = Reflect.get(worker, 'scheduled');
  assert.equal(typeof scheduled, 'function');
  const result: unknown = await scheduled.call(worker, { cron });
  assert.ok(result && typeof result === 'object' && 'outcome' in result);
  return result.outcome;
}

async function decode(body: unknown) {
  const bytes =
    body instanceof Blob
      ? Buffer.from(await body.arrayBuffer())
      : typeof body === 'string'
        ? Buffer.from(body)
        : Buffer.from(body as Uint8Array);
  return JSON.parse((bytes[0] === 31 ? gunzipSync(bytes) : bytes).toString());
}

test('crons : erreurs sur liste blanche, neuf échecs tous signalés, sans fuite ni limite à cinq', async (t) => {
  const logs: unknown[] = [],
    events: Record<string, unknown>[] = [];
  t.mock.method(console, 'error', (line: unknown) => logs.push(line));
  const tasks: ScheduledTask[] = daily.map((name) => ({
    name: name as ScheduledTask['name'],
    run: async () => {
      throw Error(secret);
    },
  }));
  await assert.rejects(
    runScheduledTasks('web', tracking, tasks, {
      fetcher: async (_url, init) => {
        const payload = await decode(init?.body);
        events.push(...(payload.batch ?? [payload]));
        return Response.json({ status: 1 });
      },
    }),
    (error) => error instanceof ScheduledTasksFailed && error.failures.length === 9,
  );
  assert.equal(logs.length, 9);
  assert.equal(events.length, 9);
  assert.doesNotMatch(JSON.stringify([logs, events]), /PRIVATE_|private@example|private\.test/);
  const properties = events.map((event) => event.properties as Record<string, unknown>);
  assert.deepEqual(properties.map((p) => p.bv_scheduled_task).sort(), sorted(daily));
  assert.equal(new Set(properties.map((p) => p.$exception_fingerprint)).size, 9);
  assert.ok(
    properties.every((p) => Array.isArray(p.$exception_list) && p.$exception_list[0]?.type === 'ScheduledTaskError'),
  );
  assert.ok(
    properties.every((p) => p.bv_error_source === 'scheduled' && p.$process_person_profile === false && p.$ip === null),
  );
  assert.deepEqual(scheduledFailureRecord(secret, secret, { code: secret, body: secret }), {
    event: 'scheduled_task_failed',
    worker: 'unknown',
    task: 'unknown',
    code: 'INTERNAL_ERROR',
  });
});

test('crons : une panne de télémétrie ne coupe pas les tâches suivantes', async (t) => {
  t.mock.method(console, 'error', () => {});
  t.mock.method(console, 'warn', () => {});
  const calls: number[] = [];
  await assert.rejects(
    runScheduledTasks(
      'generation',
      tracking,
      [
        {
          name: 'sync_runway_limits',
          run: async () => {
            calls.push(1);
            throw Error(secret);
          },
        },
        {
          name: 'cleanup_anonymous_trials',
          run: async () => {
            calls.push(2);
          },
        },
      ],
      {
        fetcher: async () => {
          throw Error(secret);
        },
      },
    ),
    ScheduledTasksFailed,
  );
  assert.deepEqual(calls, [1, 2]);
});

test('crons parallèles : attend aussi les tâches lentes et collecte tous les échecs', async (t) => {
  t.mock.method(console, 'error', () => {});
  const calls: string[] = [];
  await assert.rejects(
    runScheduledTasks(
      'web',
      {},
      [
        {
          name: 'run_social_batch',
          run: () => {
            calls.push('sync');
            throw Error('INTERNAL_ERROR');
          },
        },
        {
          name: 'send_mailbox_outbox',
          run: async () => {
            await new Promise((r) => setTimeout(r, 10));
            calls.push('late');
          },
        },
        {
          name: 'run_admin_alerts',
          run: async () => {
            throw Error('INTERNAL_ERROR');
          },
        },
      ],
      { parallel: true },
    ),
    (error) => error instanceof ScheduledTasksFailed && error.failures.length === 2,
  );
  assert.deepEqual(calls, ['sync', 'late']);
  await runScheduledTasks('web', {}, [
    {
      name: 'purge_traffic',
      run: async () => {
        calls.push('success');
      },
    },
  ]);
});

// Replace business tasks at their import boundary, but execute the actual three
// Worker scheduled handlers and the real shared runner in workerd.
const stubs: Record<string, Record<string, string | null>> = {
  'apps/web/lib/traffic': { purgeTraffic: 'purge_traffic', collectTraffic: null },
  'apps/web/lib/seo-analytics': { purgeSeo: 'purge_seo', collectSeo: null },
  'apps/web/lib/social-publisher': { runSocialBatch: 'run_social_batch' },
  'apps/web/lib/social': { cleanupSocial: 'cleanup_social' },
  'apps/web/lib/homepage-media': { cleanupHomepageAssets: 'cleanup_homepage_assets' },
  'apps/web/lib/mailbox': { sendMailboxOutbox: 'send_mailbox_outbox', cleanupMailUploads: 'cleanup_mail_uploads' },
  'apps/web/lib/ai-quality': { runAiQualityBatch: 'run_ai_quality_batch' },
  'apps/web/lib/showcase-contacts': { sendShowcaseNotifications: 'send_showcase_notifications' },
  'apps/web/lib/showcase-maintenance': { cleanupShowcases: 'cleanup_showcases', protectShowcaseResponse: null },
  'apps/web/lib/admin-alerts': { runAdminAlerts: 'run_admin_alerts' },
  'apps/pipeline/src/generation-queue': {
    syncRunwayLimits: 'sync_runway_limits',
    generationController: null,
    waitForGenerationResource: null,
  },
  'apps/pipeline/src/avatars': {
    reconcileAvatarTasks: 'reconcile_avatars',
    submitJobAvatars: null,
    pollJobAvatars: null,
    timeoutJobAvatars: null,
  },
  'apps/pipeline/src/admin-recovery': { nextAdminRecovery: 'run_admin_recovery', recoverKnownAnimations: null },
  'apps/pipeline/src/trial-cleanup': { cleanupAnonymousTrials: 'cleanup_anonymous_trials' },
  'apps/pipeline/src/animation-cleanup': { cleanupAnimations: 'cleanup_animations' },
  'apps/pipeline/src/import-cleanup': { purgeHostedImports: 'purge_hosted_imports' },
  'web-db': {
    cleanupPartnerApplications: 'cleanup_partner_applications',
    purgeAiQuality: 'purge_ai_quality',
    cleanupPushDevices: 'cleanup_push_devices',
  },
  notifications: { sendGenerationNotifications: 'send_generation_notifications' },
};
const recordTask = `async function record(arg,name,job=null){const db=arg.DB??arg;await db.prepare('INSERT INTO cron_calls(name,job_id) VALUES(?,?)').bind(name,job).run();if(await db.prepare('SELECT name FROM cron_failures WHERE name=?').bind(name).first())throw Error(${JSON.stringify(secret)});return null;}`;

async function boot(kind: 'web' | 'generation' | 'import') {
  const require = createRequire(import.meta.url),
    esbuild = createRequire(require.resolve('tsx'))('esbuild');
  const entry = kind === 'web' ? 'apps/web/worker.ts' : `apps/pipeline/src/${kind}-worker.ts`;
  const contents =
    kind !== 'generation'
      ? `export {default} from './${entry}';`
      : `
    import worker,{reconcileBatch} from './${entry}';
    ${recordTask}
    function envFor(env){
      const db=env.DB;
      return {...env,DB:{prepare(sql){const s=db.prepare(sql);
        if(sql.includes('WHERE g.agency_id=? AND g.job_id=?'))return {bind(...v){const b=s.bind(...v);return {async first(){if(await db.prepare('SELECT name FROM cron_failures WHERE name=?').bind('read:'+v[1]).first())throw Error(${JSON.stringify(secret)});return b.first();}}}};
        if(!sql.includes('LEFT JOIN generation_reconciliation_attempts'))return s;return {bind(...v){const b=s.bind(...v);return {async all(){await record(db,'reconcile_generations');return b.all();}}}};}},
        GENERATION_WORKFLOW:{async createBatch(batch){for(const job of batch){await db.prepare('INSERT INTO cron_calls(name,job_id) VALUES(?,?)').bind('launch',job.params.jobId).run();if(await db.prepare('SELECT name FROM cron_failures WHERE name=?').bind(job.params.jobId).first())throw Error(${JSON.stringify(secret)});}return [];}}};
    }
    export default {scheduled(c,env,ctx){return worker.scheduled(c,envFor(env),ctx);},async fetch(req,env){try{await reconcileBatch(envFor(env));return new Response('ok');}catch(e){return new Response(e.message,{status:500});}}};`;
  const built = await esbuild.build({
    stdin: { contents, resolveDir: resolve('.'), loader: 'ts' },
    bundle: true,
    write: false,
    format: 'esm',
    platform: 'neutral',
    mainFields: ['module', 'main'],
    conditions: ['workerd', 'worker', 'browser'],
    external: ['cloudflare:*', 'node:*'],
    define: { 'process.env.NEXT_PUBLIC_BIENVU_RELEASE': '"cron-fixture"' },
    plugins: [
      {
        name: 'cron-business-fixtures',
        setup(build: {
          onResolve: (
            options: { filter: RegExp },
            action: (args: { path: string; importer: string }) => unknown,
          ) => void;
          onLoad: (options: { filter: RegExp; namespace: string }, action: (args: { path: string }) => unknown) => void;
        }) {
          build.onResolve({ filter: /.*/ }, (args) => {
            if (args.path === './.open-next/worker.js' && args.importer === resolve('apps/web/worker.ts'))
              return { path: 'opennext', namespace: 'cron-fixture' };
            const key =
              args.path === '@bienvu/db' && args.importer === resolve('apps/web/worker.ts')
                ? 'web-db'
                : args.path === '@bienvu/notifications'
                  ? 'notifications'
                  : Object.keys(stubs).find((p) => resolve(p) === resolve(dirname(args.importer), args.path));
            return key ? { path: key, namespace: 'cron-fixture' } : undefined;
          });
          build.onLoad({ filter: /.*/, namespace: 'cron-fixture' }, (args) => ({
            contents:
              args.path === 'opennext'
                ? `export default {fetch(){return new Response('fixture')}};export class DOQueueHandler{};export class DOShardedTagCache{};export class BucketCachePurge{}`
                : recordTask +
                  Object.entries(stubs[args.path])
                    .map(
                      ([name, task]) =>
                        `export async function ${name}(arg){${task ? `return record(arg,${JSON.stringify(task)});` : 'return null;'}}`,
                    )
                    .join('\n'),
            loader: 'js',
          }));
        },
      },
    ],
  });
  const events: Record<string, unknown>[] = [];
  const mf = new Miniflare(
    convertV4MiniflareOptions({
      modules: true,
      script: built.outputFiles[0].text,
      compatibilityDate: '2026-09-27',
      compatibilityFlags: ['nodejs_compat'],
      d1Databases: ['DB'],
      r2Buckets: ['MEDIA'],
      bindings: tracking,
      outboundService: async (request) => {
        assert.equal(new URL(request.url).hostname, 'eu.i.posthog.com', 'No provider/network calls');
        const payload = await decode(new Uint8Array(await request.arrayBuffer()));
        events.push(...(payload.batch ?? [payload]));
        return Response.json({ status: 1 });
      },
    }),
  );
  const { DB } = await mf.getBindings<{ DB: D1Database }>();
  await DB.exec(
    'CREATE TABLE cron_calls(seq INTEGER PRIMARY KEY AUTOINCREMENT,name TEXT,job_id TEXT); CREATE TABLE cron_failures(name TEXT PRIMARY KEY)',
  );
  return { mf, DB, events };
}

for (const scenario of [
  { kind: 'web' as const, cron: '23 3 * * *', names: daily, fail: ['cleanup_homepage_assets'] },
  { kind: 'web' as const, cron: '* * * * *', names: minute, fail: ['run_ai_quality_batch', 'run_admin_alerts'] },
  { kind: 'generation' as const, cron: '*/5 * * * *', names: generation, fail: ['reconcile_avatars'] },
  { kind: 'generation' as const, cron: '*/5 * * * *', names: generation, fail: ['sync_runway_limits'] },
  { kind: 'import' as const, cron: '*/10 * * * *', names: ['purge_hosted_imports'], fail: ['purge_hosted_imports'] },
])
  test(`scheduled réel ${scenario.kind} ${scenario.fail.join('+')} : toutes les tâches tentées et invocation en échec`, async (t) => {
    const { mf, DB, events } = await boot(scenario.kind);
    t.after(() => mf.dispose());
    if (scenario.kind === 'generation') await migrateNarrationProbe(DB);
    for (const name of scenario.fail) await DB.prepare('INSERT INTO cron_failures VALUES(?)').bind(name).run();
    assert.equal(await invokeScheduled(mf, scenario.cron), 'exception');
    const calls = (await DB.prepare('SELECT name FROM cron_calls ORDER BY seq').all<{ name: string }>()).results.map(
      (r) => r.name,
    );
    assert.deepEqual(sorted(calls), sorted(scenario.names));
    if (scenario.kind !== 'web' || scenario.cron === '23 3 * * *') assert.deepEqual(calls, scenario.names);
    assert.equal(events.length, scenario.fail.length);
    assert.deepEqual(
      events.map((e) => (e.properties as Record<string, unknown>).bv_scheduled_task).sort(),
      sorted(scenario.fail),
    );
    assert.doesNotMatch(JSON.stringify(events), /PRIVATE_|private@example|private\.test/);
    await DB.exec('DELETE FROM cron_failures; DELETE FROM cron_calls');
    assert.equal(await invokeScheduled(mf, scenario.cron), 'ok');
    assert.deepEqual(
      (await DB.prepare('SELECT name FROM cron_calls').all<{ name: string }>()).results.map((r) => r.name).sort(),
      sorted(scenario.names),
    );
    assert.equal(events.length, scenario.fail.length, 'A successful invocation emits no exception');
  });

test('réconciliation D1 : dix échecs persistants ne bloquent pas le onzième, curseur durable et comptabilité inchangée', async (t) => {
  const { mf, DB } = await boot('generation');
  t.after(() => mf.dispose());
  await migrateNarrationProbe(DB);
  const migration = (
    await readFile(new URL('../packages/db/migrations/0085_generation_reconciliation.sql', import.meta.url), 'utf8')
  )
    .replace(/^--.*$/gm, '')
    .replace(/\n/g, ' ');
  await DB.exec(migration);
  await DB.exec(migration);
  await DB.exec('UPDATE generation_control SET enabled=1');
  await DB.prepare('INSERT INTO hosted_import_budget VALUES(?,0,9000,0)')
    .bind(new Date().toISOString().slice(0, 7))
    .run();
  const jobs: string[] = [];
  for (let n = 0; n < 11; n++) {
    const label = `cron-${n}`,
      scope = await seedNarrationFixture(DB, label, true);
    await DB.prepare("UPDATE jobs SET status='failed',error_code='FIXTURE' WHERE id=?").bind(scope.jobId).run();
    await DB.prepare("UPDATE allocations SET kind='paid',quota_limit=30 WHERE agency_id=?").bind(scope.agencyId).run();
    await DB.prepare('INSERT INTO generation_access VALUES(?,?,1)').bind(scope.agencyId, `allocation-${label}`).run();
    const row = await admitGeneration(
      DB,
      scope.agencyId,
      `cron-job-fixture-key-${n}`,
      { listingId: `listing-${label}` },
      'true',
    );
    jobs.push(row.jobId);
    // Deterministic chronology, independent of the machine clock and UUID order.
    await DB.prepare('UPDATE generation_runs SET created_at=? WHERE job_id=?')
      .bind(new Date(Date.now() - 60000 + n).toISOString(), row.jobId)
      .run();
    if (n < 10)
      await DB.prepare('INSERT INTO cron_failures VALUES(?)')
        .bind(n === 0 ? 'read:' + row.jobId : row.jobId)
        .run();
  }
  const accounting = async () => ({
    allocations: (await DB.prepare('SELECT id,reserved,consumed FROM allocations ORDER BY id').all()).results,
    budget: (await DB.prepare('SELECT * FROM hosted_import_budget').all()).results,
    reservations: (await DB.prepare('SELECT * FROM reservations ORDER BY id').all()).results,
    calls: (await DB.prepare('SELECT * FROM narration_calls').all()).results,
    jobs: (await DB.prepare('SELECT id,status,updated_at FROM jobs ORDER BY id').all()).results,
  });
  const before = await accounting();
  for (let pass = 0; pass < 3; pass++) {
    const response = await mf.dispatchFetch('https://fixture/batch');
    assert.equal(response.status, 500);
    assert.equal(await response.text(), 'GENERATION_RECONCILE_FAILED');
    const launched = (
      await DB.prepare("SELECT job_id FROM cron_calls WHERE name='launch' ORDER BY seq").all<{ job_id: string }>()
    ).results.map((r) => r.job_id);
    if (pass === 0) {
      assert.deepEqual(launched, jobs.slice(1, 10), 'A failed row read does not skip the other nine');
      assert.equal(
        (await DB.prepare('SELECT status FROM job_launch_intents WHERE job_id=?')
          .bind(jobs[10])
          .first<{ status: string }>())!.status,
        'pending',
      );
    } else
      assert.equal(
        (await DB.prepare('SELECT status FROM job_launch_intents WHERE job_id=?')
          .bind(jobs[10])
          .first<{ status: string }>())!.status,
        'started',
      );
  }
  assert.deepEqual(await accounting(), before, 'No credit, reservation, provider call or business timestamp change');
  assert.equal(
    (await DB.prepare('SELECT count(*) n FROM generation_reconciliation_attempts').first<{ n: number }>())!.n,
    11,
  );
  assert.equal(
    (await DB.prepare("SELECT count(*) n FROM cron_calls WHERE name='launch' AND job_id=?")
      .bind(jobs[10])
      .first<{ n: number }>())!.n,
    1,
  );
  assert.deepEqual((await DB.prepare('PRAGMA foreign_key_check').all()).results, []);
});
