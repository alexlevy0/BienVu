import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Miniflare, convertV4MiniflareOptions } from 'miniflare';
import { migrateNarrationProbe } from '../scripts/narration-fixtures';
import {
  admitAnonymous,
  createAnonymousSession,
  failGeneration,
  claimTrial,
  ensureAgency,
  findGeneration,
  generationView,
} from '../packages/db/src/index';
import { cleanupAnonymousTrials } from '../apps/pipeline/src/trial-cleanup';
import { trialSessionResponse, trialHistoryResponse, type TrialEnv } from '../apps/web/lib/trials';
test('purge R2 réelle locale : aucun fichier récupéré supprimé, reprise idempotente, IP et preuve effacées', async (t) => {
  const mf = new Miniflare(
    convertV4MiniflareOptions({
      modules: true,
      script: 'export default {fetch(){return new Response("fixture")}}',
      compatibilityDate: '2026-09-27',
      d1Databases: ['DB'],
      r2Buckets: ['MEDIA'],
    }),
  );
  t.after(() => mf.dispose());
  const env = await mf.getBindings<{ DB: D1Database; MEDIA: R2Bucket }>(),
    DB = env.DB;
  await migrateNarrationProbe(DB);
  await DB.exec('UPDATE trial_policy SET enabled=1,free_enabled=1; UPDATE generation_control SET enabled=1');
  await DB.prepare('INSERT INTO hosted_import_budget VALUES(?,0,2500,0)')
    .bind(new Date().toISOString().slice(0, 7))
    .run();
  const { session, proof: cookie } = await createAnonymousSession(DB),
    input = { url: 'https://www.century21.fr/trouver_logement/detail/123456/' },
    proof = { ipHmac: 'a'.repeat(64), turnstileHash: 'b'.repeat(64) };
  const old = await admitAnonymous(DB, session, 'purge-abandoned-key', input, proof, 'true');
  const map = JSON.stringify({
    position: 'start',
    durationSeconds: 4,
    view: 'satellite',
    zoomStart: 12,
    zoomEnd: 14.5,
    location: {
      latitude: 45.772,
      longitude: 4.856,
      label: 'Lyon 6e',
      precision: 'approximate',
      sourceType: 'municipality',
    },
  });
  await DB.prepare('INSERT INTO generation_map_resolutions(job_id,agency_id,map_json,created_at) VALUES(?,?,?,?)')
    .bind(old.jobId, old.agencyId, map, new Date().toISOString())
    .run();
  await failGeneration(DB, old, 'GENERATION_FAILED');
  const current = await admitAnonymous(
    DB,
    session,
    'purge-claimed-key-123',
    input,
    { ...proof, turnstileHash: 'c'.repeat(64) },
    'true',
  );
  await DB.prepare('INSERT INTO generation_map_resolutions(job_id,agency_id,map_json,created_at) VALUES(?,?,?,?)')
    .bind(current.jobId, current.agencyId, map, new Date().toISOString())
    .run();
  const now = Date.now(),
    at = new Date(now).toISOString();
  await DB.prepare('INSERT INTO auth_user VALUES(?,?,?,1,NULL,?,?)')
    .bind('purge-owner', 'Owner', 'owner@example.com', now - 1000, now)
    .run();
  const user = await ensureAgency(DB, { id: 'purge-owner', email: 'owner@example.com' });
  await claimTrial(DB, session, user.id, current.jobId);
  await failGeneration(DB, current, 'GENERATION_FAILED');
  const discarded = `agencies/${session.scopeId}/jobs/${old.jobId}/video/master.mp4`,
    kept = `agencies/${session.scopeId}/jobs/${current.jobId}/video/master.mp4`;
  await env.MEDIA.put(discarded, 'abandoned');
  await env.MEDIA.put(kept, 'claimed');
  // Include imported metadata/photos, plus a different retained import in this scope.
  for (const [id, job] of [
    ['expired-import', old],
    ['kept-import', current],
  ] as const) {
    await DB.prepare(`INSERT INTO listing_imports(id,agency_id,idempotency_key,source_url,status,result_json,created_at,lease_until,expires_at)
      VALUES(?,?,?,?,'ready','{}',?,?,?)`)
      .bind(id, session.scopeId, `generation-${job.jobId}`, input.url, at, at, at)
      .run();
    await DB.prepare(`INSERT INTO listings(id,agency_id,source_url,canonical_url,source_host,fetched_at,adapter_version,transaction_kind,facts_json)
      VALUES(?,?,?,?,'www.century21.fr',?,'fixture','sale','{}')`)
      .bind(id, session.scopeId, input.url, input.url, at)
      .run();
    await DB.prepare('UPDATE jobs SET listing_id=? WHERE id=?').bind(id, job.jobId).run();
    await env.MEDIA.put(`agencies/${session.scopeId}/imports/${id}/photo.jpg`, 'fixture photo');
  }
  await DB.prepare('UPDATE generation_runs SET expires_at=?')
    .bind(new Date(now - 1).toISOString())
    .run();
  await Promise.all([
    cleanupAnonymousTrials(env, now),
    claimTrial(DB, session, user.id, old.jobId, now).catch(() => {}),
  ]);
  assert.equal(await env.MEDIA.head(discarded), null);
  assert.ok(await env.MEDIA.head(kept));
  assert.equal(await env.MEDIA.head(`agencies/${session.scopeId}/imports/expired-import/photo.jpg`), null);
  assert.ok(await env.MEDIA.head(`agencies/${session.scopeId}/imports/kept-import/photo.jpg`));
  assert.equal(await DB.prepare("SELECT id FROM listings WHERE id='expired-import'").first(), null);
  assert.equal(await DB.prepare("SELECT id FROM listing_imports WHERE id='expired-import'").first(), null);
  assert.ok(await DB.prepare("SELECT id FROM listings WHERE id='kept-import'").first());
  assert.equal((await findGeneration(DB, session.scopeId, old.jobId))!.retention, 'expired');
  assert.equal((await findGeneration(DB, session.scopeId, current.jobId))!.retention, 'available');
  const expired = (await findGeneration(DB, session.scopeId, old.jobId))!;
  assert.equal(expired.input, '{}');
  for (const retention of ['expiring', 'expired'] as const) {
    const view = generationView({ ...expired, retention }, now, 'anonymous');
    assert.equal(view.retention, retention);
    assert.equal(view.videoUrl, null);
    assert.equal(view.downloadUrl, null);
    assert.equal(view.retryAllowed, false);
  }
  const historicalSuccess = generationView(
    { ...expired, status: 'ready', stage: 'rendering', progressPercent: 100 },
    now,
    'anonymous',
  );
  assert.equal(historicalSuccess.retention, 'expired');
  assert.equal(historicalSuccess.videoUrl, null);
  // A purged anonymous input is expected; a corrupt active/owned input still fails loudly.
  assert.throws(() => generationView({ ...expired, retention: 'available' }, now));
  assert.throws(() => generationView({ ...expired, ownerAgencyId: user.id }, now));
  const trialEnv = {
    ...env,
    BETTER_AUTH_URL: 'https://bienvu.online',
    BETTER_AUTH_SECRET: 'fixture-secret-'.repeat(3),
  } as unknown as TrialEnv;
  const request = new Request('https://bienvu.online/api/trial', {
    headers: { Cookie: `__Host-bienvu-trial=${cookie}` },
  });
  const sessionResponse = await trialSessionResponse(request, trialEnv),
    historyResponse = await trialHistoryResponse(request, trialEnv);
  assert.equal(sessionResponse.status, 200);
  assert.equal(historyResponse.status, 200);
  const history = (await historyResponse.json()) as {
    jobs: { id: string; retention: string; videoUrl: string | null }[];
  };
  assert.deepEqual(
    history.jobs.map((job) => ({ id: job.id, retention: job.retention, videoUrl: job.videoUrl })),
    [{ id: old.jobId, retention: 'expired', videoUrl: null }],
  );
  assert.equal(
    await DB.prepare('SELECT job_id FROM generation_map_resolutions WHERE job_id=?').bind(old.jobId).first(),
    null,
  );
  assert.ok(
    await DB.prepare('SELECT job_id FROM generation_map_resolutions WHERE job_id=?').bind(current.jobId).first(),
  );
  await cleanupAnonymousTrials(env, now);
  assert.ok(await env.MEDIA.head(kept));
  await cleanupAnonymousTrials(env, now + 31 * 86400_000);
  assert.deepEqual(
    await DB.prepare('SELECT proof_hash,claim_job_id FROM anonymous_sessions WHERE id=?').bind(session.id).first(),
    { proof_hash: null, claim_job_id: null },
  );
  assert.equal(
    (await DB.prepare('SELECT count(*) AS n FROM generation_runs WHERE ip_hmac IS NOT NULL').first<{ n: number }>())!.n,
    0,
  );
  assert.equal(
    (await DB.prepare('SELECT baseline_cents AS n FROM hosted_import_budget').first<{ n: number }>())!.n,
    300,
  );
});

test('session et historique : dernier essai nettoyé toujours lisible, sans recréer de données privées', async (t) => {
  const mf = new Miniflare(
    convertV4MiniflareOptions({
      modules: true,
      script: 'export default {fetch(){return new Response("fixture")}}',
      compatibilityDate: '2026-09-27',
      d1Databases: ['DB'],
      r2Buckets: ['MEDIA'],
    }),
  );
  t.after(() => mf.dispose());
  const env = await mf.getBindings<{ DB: D1Database; MEDIA: R2Bucket }>(),
    DB = env.DB;
  await migrateNarrationProbe(DB);
  await DB.exec('UPDATE trial_policy SET enabled=1,free_enabled=1; UPDATE generation_control SET enabled=1');
  await DB.prepare('INSERT INTO hosted_import_budget VALUES(?,0,2500,0)')
    .bind(new Date().toISOString().slice(0, 7))
    .run();
  const { session, proof: cookie } = await createAnonymousSession(DB);
  const row = await admitAnonymous(
    DB,
    session,
    'purged-latest-trial',
    { url: 'https://www.century21.fr/trouver_logement/detail/123456/' },
    { ipHmac: 'a'.repeat(64), turnstileHash: 'b'.repeat(64) },
    'true',
  );
  await failGeneration(DB, row, 'GENERATION_FAILED');
  await DB.prepare('UPDATE generation_runs SET expires_at=? WHERE job_id=?')
    .bind(new Date(Date.now() - 1).toISOString(), row.jobId)
    .run();
  await cleanupAnonymousTrials(env);
  const trialEnv = {
    ...env,
    BETTER_AUTH_URL: 'https://bienvu.online',
    BETTER_AUTH_SECRET: 'fixture-secret-'.repeat(3),
  } as unknown as TrialEnv;
  const request = new Request('https://bienvu.online/api/trial', {
    headers: { Cookie: `__Host-bienvu-trial=${cookie}` },
  });
  const status = (await (await trialSessionResponse(request, trialEnv)).json()) as {
    job: { id: string; retention: string; videoUrl: string | null };
  };
  const history = (await (await trialHistoryResponse(request, trialEnv)).json()) as {
    jobs: { id: string; retention: string; videoUrl: string | null }[];
  };
  assert.equal(status.job.id, row.jobId);
  assert.equal(status.job.retention, 'expired');
  assert.equal(status.job.videoUrl, null);
  assert.equal(history.jobs[0].id, row.jobId);
  assert.equal(history.jobs[0].retention, 'expired');
  assert.deepEqual(
    await DB.prepare('SELECT input_json,brand_json FROM generation_runs WHERE job_id=?').bind(row.jobId).first(),
    { input_json: '{}', brand_json: '{}' },
  );
});
