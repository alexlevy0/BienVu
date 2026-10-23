import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes, createHmac } from 'node:crypto';
import { Miniflare, convertV4MiniflareOptions } from 'miniflare';
import { migrateNarrationProbe, seedNarrationFixture } from '../scripts/narration-fixtures';
import { createAuth } from '../apps/web/lib/auth';
import {
  WorkspaceAction,
  adminWorkspaceRequest,
  workspaceRead,
  workspaceWrite,
  workspaceDocument,
  saveWorkspaceDocument,
  configurationHistory,
  defaultPreferences,
} from '../apps/web/lib/admin-workspace';
import { evaluateAdminAlerts, runAdminAlerts } from '../apps/web/lib/admin-alerts';
import { operationsRead, OperationsQuery } from '../apps/web/lib/admin-operations';
import { adminCustomerHealth } from '../apps/web/lib/admin-customer-health';
import { admitGeneration, findImport, findGeneration, savePushDevice } from '../packages/db/src/index';
import { defaultVideoCustomization } from '../packages/contracts/src/index';
import { recoverKnownAnimations } from '../apps/pipeline/src/admin-recovery';

test('Workspace : validation stricte, pas de lien externe ni identité forgée', () => {
  const view = {
    action: 'view',
    id: 'sample-view',
    revision: 0,
    value: { name: 'Ma vue', href: '/admin?view=videos', shared: true, deleted: false },
  };
  assert.ok(WorkspaceAction.safeParse(view).success);
  for (const href of ['https://evil.test', '//evil.test', '/admin\\evil.test', '/administration', '/admin\n'])
    assert.equal(WorkspaceAction.safeParse({ ...view, value: { ...view.value, href } }).success, false);
  assert.equal(WorkspaceAction.safeParse({ ...view, actor: 'forged' }).success, false);
});

test('Workspace complet : D1, droits, synchronisation, suivi, alertes, restauration et récupération', async (t) => {
  const mf = new Miniflare(
    convertV4MiniflareOptions({
      modules: true,
      script: 'export default{fetch(){return new Response("fixture")}}',
      compatibilityDate: '2026-09-27',
      d1Databases: ['DB'],
      r2Buckets: ['MEDIA'],
    }),
  );
  t.after(() => mf.dispose());
  const { DB: db, MEDIA } = await mf.getBindings<{ DB: D1Database; MEDIA: R2Bucket }>();
  await migrateNarrationProbe(db);
  const now = Date.now(),
    at = new Date(now).toISOString(),
    env = {
      DB: db,
      BETTER_AUTH_URL: 'http://localhost:8787',
      BETTER_AUTH_SECRET: randomBytes(32).toString('hex'),
      PROBE_MODE: 'local',
      SUPER_ADMIN_EMAIL: 'owner@example.test',
      ADMIN_EMAIL: 'greg@example.test',
      GOOGLE_CLIENT_ID: '',
      GOOGLE_CLIENT_SECRET: '',
    };
  const auth = createAuth(env),
    context = await auth.$context,
    cookies: string[] = [];
  const people = [
    { id: 'workspace-admin', email: env.SUPER_ADMIN_EMAIL, emailVerified: true },
    { id: 'workspace-staff', email: env.ADMIN_EMAIL, emailVerified: true },
    { id: 'workspace-client', email: 'client@example.test', emailVerified: true },
  ];
  for (const p of people) {
    await db
      .prepare('INSERT INTO auth_user(id,name,email,emailVerified,createdAt,updatedAt) VALUES(?,?,?,1,?,?)')
      .bind(p.id, p.id, p.email, now, now)
      .run();
    const session = await context.internalAdapter.createSession(p.id);
    assert.ok(session);
    cookies.push(
      context.authCookies.sessionToken.name +
        '=' +
        encodeURIComponent(
          session.token + '.' + createHmac('sha256', env.BETTER_AUTH_SECRET).update(session.token).digest('base64'),
        ),
    );
  }
  const request = (section: string, actor = 0, body?: unknown, origin = env.BETTER_AUTH_URL) =>
    new Request(env.BETTER_AUTH_URL + '/api/admin/workspace?section=' + section, {
      method: body ? 'POST' : 'GET',
      headers: { cookie: actor < 0 ? '' : cookies[actor], origin, 'Content-Type': 'application/json' },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
  const admin = people[0],
    staff = people[1];
  await t.test('frontière staff / super admin et origine avant écriture', async () => {
    assert.equal((await adminWorkspaceRequest(request('overview', -1), env)).status, 401);
    assert.equal((await adminWorkspaceRequest(request('overview', 2), env)).status, 403);
    for (const section of ['search', 'configuration', 'audience', 'health', 'recovery'])
      assert.equal((await adminWorkspaceRequest(request(section, 1), env)).status, 403);
    assert.equal(
      (
        await adminWorkspaceRequest(
          request(
            'overview',
            0,
            { action: 'preferences', revision: 0, value: defaultPreferences },
            'https://evil.test',
          ),
          env,
        )
      ).status,
      403,
    );
    const r = await adminWorkspaceRequest(request('overview', 1), env);
    assert.equal(r.status, 200);
    assert.equal(r.headers.get('Cache-Control'), 'private, no-store');
    const body = (await r.json()) as { alerts: unknown[]; rules: unknown };
    assert.deepEqual(body.alerts, []);
    assert.equal(body.rules, null);
  });
  await t.test('préférences persistantes isolées et conflit concurrent', async () => {
    await workspaceWrite(env, admin, {
      action: 'preferences',
      revision: 0,
      value: { ...defaultPreferences, favorites: ['videos'], filters: { videos: { q: 'Lyon' } } },
    });
    const doc = await workspaceDocument(db, 'preferences:' + admin.id);
    assert.equal(doc?.revision, 1);
    await assert.rejects(
      workspaceWrite(env, admin, { action: 'preferences', revision: 0, value: defaultPreferences }),
      /CONFLICT/,
    );
    const other = await workspaceRead(env, staff, 'preferences');
    assert.ok('document' in other);
    assert.equal(other.document, null);
    await assert.rejects(db.prepare("UPDATE admin_workspace_events SET body_json='{}'").run(), /AUDIT_IMMUTABLE/);
  });
  await t.test('vues privées et partagées, suppression historisée', async () => {
    const value = { name: 'Échecs clients', href: '/admin?view=videos&status=failed', shared: false, deleted: false };
    await workspaceWrite(env, admin, { action: 'view', id: 'private-view', revision: 0, value });
    await workspaceWrite(env, admin, {
      action: 'view',
      id: 'shared-view',
      revision: 0,
      value: { ...value, shared: true },
    });
    const result = await workspaceRead(env, staff, 'views');
    assert.ok('items' in result && result.items);
    assert.deepEqual(
      result.items.map((v) => ('key' in v ? v.key : null)),
      ['view:shared-view'],
    );
    await assert.rejects(
      workspaceWrite(env, staff, {
        action: 'view',
        id: 'private-view',
        revision: 1,
        value: { ...value, deleted: true },
      }),
      /FORBIDDEN/,
    );
    await workspaceWrite(env, staff, {
      action: 'view',
      id: 'shared-view',
      revision: 1,
      value: { ...value, shared: true, deleted: true },
    });
    const again = await workspaceRead(env, staff, 'views');
    assert.ok('items' in again && again.items);
    assert.equal(again.items.length, 0);
  });
  const seed = await seedNarrationFixture(db, 'workspace-fixture', true);
  await db
    .prepare("UPDATE jobs SET status='failed',error_code='FIXTURE',lease_until=NULL WHERE id=?")
    .bind(seed.jobId)
    .run();
  await db
    .prepare("UPDATE agencies SET owner_user_id='orphan-workspace-client' WHERE owner_user_id=? AND id!=?")
    .bind(people[2].id, seed.agencyId)
    .run();
  await db.prepare('UPDATE agencies SET owner_user_id=? WHERE id=?').bind(people[2].id, seed.agencyId).run();
  await t.test('attribution, échéance et report ; destinataire non staff refusé', async () => {
    const value = {
      title: 'Vérifier cette vidéo',
      targetKind: 'video' as const,
      target: seed.jobId,
      assignee: staff.id,
      priority: 'urgent' as const,
      status: 'open' as const,
      due: at.slice(0, 10),
      snoozedUntil: new Date(now + 86400000).toISOString(),
      note: 'Échange avec le client',
    };
    await workspaceWrite(env, admin, { action: 'task', id: 'case-one', revision: 0, value });
    await assert.rejects(
      workspaceWrite(env, admin, {
        action: 'task',
        id: 'case-invalid',
        revision: 0,
        value: { ...value, assignee: people[2].id },
      }),
      /VALIDATION_ERROR/,
    );
    await assert.rejects(
      workspaceWrite(env, staff, { action: 'task', id: 'case-one', revision: 0, value: { ...value, status: 'done' } }),
      /CONFLICT/,
    );
    const result = await workspaceRead(env, staff, 'overview');
    assert.ok('tasks' in result && result.tasks);
    assert.equal(result.tasks[0].value.assignee, staff.id);
    assert.equal(result.tasks[0].value.snoozedUntil, value.snoozedUntil);
  });
  await t.test('recherche transversale et comptes internes exclus des métriques', async () => {
    const search = await workspaceRead(env, admin, 'search', seed.jobId);
    assert.ok('items' in search && search.items?.some((r) => 'kind' in r && r.kind === 'video'));
    const before = await operationsRead(
      db,
      OperationsQuery.parse({ section: 'performance', compare: 'no' }),
      now + 10000,
    );
    assert.ok('total' in before && before.total === 1);
    await workspaceWrite(env, admin, {
      action: 'audience',
      id: seed.agencyId,
      revision: 0,
      value: { audience: 'demo', reason: 'Compte de démonstration' },
    });
    const after = await operationsRead(
      db,
      OperationsQuery.parse({ section: 'performance', compare: 'no' }),
      now + 10000,
    );
    assert.ok('total' in after && after.total === 0);
    const internal = await operationsRead(
      db,
      OperationsQuery.parse({ section: 'performance', audience: 'internal', compare: 'no' }),
      now + 10000,
    );
    assert.ok('total' in internal && internal.total === 1);
    await workspaceWrite(env, admin, {
      action: 'audience',
      id: seed.agencyId,
      revision: 1,
      value: { audience: 'client', reason: 'Compte client réel' },
    });
    const staffMetrics = await operationsRead(
      db,
      OperationsQuery.parse({ section: 'performance', compare: 'no' }),
      now + 10000,
      [people[2].email],
    );
    assert.ok('total' in staffMetrics && staffMetrics.total === 0);
  });
  await t.test('comparaison à durée égale, coûts sans inventer de marge', async () => {
    const metrics = await operationsRead(db, OperationsQuery.parse({ section: 'performance' }), now + 10000);
    assert.ok('comparison' in metrics && metrics.comparison && 'stats' in metrics.comparison);
    const from =
      Date.UTC(new Date(now).getUTCFullYear(), new Date(now).getUTCMonth(), new Date(now).getUTCDate()) - 29 * 86400000;
    assert.equal(Date.parse(metrics.comparison.to) - Date.parse(metrics.comparison.from), now + 10000 - from);
    const profit = await operationsRead(db, OperationsQuery.parse({ section: 'profit' }));
    assert.ok('groups' in profit && 'comparison' in profit);
  });
  await t.test('agences à accompagner, critères explicables et comptes internes écartés', async () => {
    await db
      .prepare('UPDATE agencies SET created_at=? WHERE id=?')
      .bind(new Date(now - 5 * 86400000).toISOString(), seed.agencyId)
      .run();
    let health = await adminCustomerHealth(db, env, now + 10000);
    assert.equal(health.items[0]?.signal, 'first_video');
    health = await adminCustomerHealth(db, { SUPER_ADMIN_EMAIL: people[2].email }, now + 10000);
    assert.equal(health.items.length, 0);
  });
  await t.test('restauration atomique avec version initiale et refus d’un état périmé', async () => {
    const history = await configurationHistory(db, 'features');
    assert.equal(history.history[0]?.id, 'baseline-features');
    await db
      .prepare('INSERT INTO site_feature_events VALUES(?,?,?,?,?)')
      .bind('feature-enable', admin.id, '{"explorer":true}', history.current.revision, at)
      .run();
    const restore = {
      action: 'restore' as const,
      kind: 'features' as const,
      eventId: 'baseline-features',
      revision: history.current.revision + 1,
      reason: 'Retour à la configuration initiale',
    };
    await workspaceWrite(env, admin, restore);
    const result = await configurationHistory(db, 'features');
    assert.ok('explorer' in result.current.value);
    assert.equal(result.current.value.explorer, false);
    const count = await db
      .prepare("SELECT count(*) AS n FROM admin_operation_entries WHERE kind='change'")
      .first<{ n: number }>();
    await assert.rejects(workspaceWrite(env, admin, restore), /CONFLICT/);
    assert.equal(
      (await db.prepare("SELECT count(*) AS n FROM admin_operation_entries WHERE kind='change'").first<{ n: number }>())
        ?.n,
      count?.n,
    );
  });
  await t.test('alertes dédupliquées, résolues et sans push implicite', async () => {
    await db
      .prepare(
        "UPDATE generation_provider_limits SET credit_balance=50,balance_checked_at=?,balance_error=NULL WHERE provider='runway'",
      )
      .bind(new Date().toISOString())
      .run();
    await evaluateAdminAlerts(db);
    await evaluateAdminAlerts(db);
    assert.equal(
      (
        await db
          .prepare("SELECT count(*) AS n FROM admin_alerts WHERE rule='runway' AND resolved_at IS NULL")
          .first<{ n: number }>()
      )?.n,
      1,
    );
    const original = await db
      .prepare("SELECT id,opened_at FROM admin_alerts WHERE rule='runway' AND resolved_at IS NULL")
      .first();
    let batches = 0;
    const interrupted = new Proxy(db, {
      get(target, key) {
        if (key === 'batch')
          return async (statements: D1PreparedStatement[]) => {
            const result = await target.batch(statements);
            if (++batches === 1) throw new Error('D1_ERROR: Network connection lost.');
            return result;
          };
        const value = Reflect.get(target, key);
        return typeof value === 'function' ? value.bind(target) : value;
      },
    });
    // Lost acknowledgement after a committed batch must not create a second alert or send twice.
    await runAdminAlerts({ ...env, DB: interrupted, WEB_PUSH_ENABLED: 'false' });
    assert.equal(batches, 2);
    assert.deepEqual(
      await db.prepare("SELECT id,opened_at FROM admin_alerts WHERE rule='runway' AND resolved_at IS NULL").first(),
      original,
    );
    await runAdminAlerts({ ...env, WEB_PUSH_ENABLED: 'false' });
    assert.equal((await db.prepare('SELECT count(*) AS n FROM admin_alert_deliveries').first<{ n: number }>())?.n, 0);
    await db
      .prepare("UPDATE generation_provider_limits SET balance_checked_at=? WHERE provider='runway'")
      .bind(new Date(Date.now() - 10 * 60000).toISOString())
      .run();
    await evaluateAdminAlerts(db);
    assert.equal(
      (
        await db
          .prepare("SELECT count(*) AS n FROM admin_alerts WHERE rule='runway' AND resolved_at IS NULL")
          .first<{ n: number }>()
      )?.n,
      1,
      'Une mesure périmée ne résout pas une réserve faible',
    );
    await db
      .prepare("UPDATE generation_provider_limits SET credit_balance=1000,balance_checked_at=? WHERE provider='runway'")
      .bind(new Date().toISOString())
      .run();
    await evaluateAdminAlerts(db);
    assert.ok(
      (
        await db
          .prepare("SELECT resolved_at AS at FROM admin_alerts WHERE rule='runway'")
          .first<{ at: string | null }>()
      )?.at,
    );
  });
  await t.test('push admin : uniquement le staff ayant opté pour les alertes, une livraison par incident', async () => {
    const b64 = (v: Uint8Array) => Buffer.from(v).toString('base64url');
    const vapid = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']),
      privateJwk = await crypto.subtle.exportKey('jwk', vapid.privateKey),
      publicRaw = new Uint8Array(await crypto.subtle.exportKey('raw', vapid.publicKey));
    const receiver = await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits']),
      receiverPublic = new Uint8Array(await crypto.subtle.exportKey('raw', receiver.publicKey));
    const pushEnv = {
      ...env,
      WEB_PUSH_ENABLED: 'true',
      WEB_PUSH_PUBLIC_KEY: b64(publicRaw),
      WEB_PUSH_PRIVATE_KEY: privateJwk.d!,
      WEB_PUSH_SUBJECT: 'mailto:owner@example.test',
    };
    for (const [i, p] of people.entries()) {
      const subscription = {
        endpoint: 'https://fcm.googleapis.com/fcm/send/workspace-' + i,
        expirationTime: null,
        keys: { p256dh: b64(receiverPublic), auth: b64(randomBytes(16)) },
      };
      await savePushDevice(db, { kind: 'user', id: p.id }, b64(randomBytes(32)), subscription);
      const prior = await workspaceDocument(db, 'preferences:' + p.id);
      await saveWorkspaceDocument(
        db,
        admin.id,
        'preferences:' + p.id,
        'preferences',
        { ...defaultPreferences, alerts: p.id !== staff.id },
        prior?.revision ?? 0,
        p.id,
      );
    }
    await db
      .prepare("UPDATE generation_provider_limits SET credit_balance=10,balance_checked_at=? WHERE provider='runway'")
      .bind(new Date().toISOString())
      .run();
    const recipients: string[] = [];
    const fetcher: typeof fetch = async (input, init) => {
      recipients.push(String(input));
      assert.equal(init?.redirect, 'manual');
      assert.ok(init?.body);
      return new Response(null, { status: 201 });
    };
    await runAdminAlerts(pushEnv, Date.now(), fetcher);
    await runAdminAlerts(pushEnv, Date.now(), fetcher);
    assert.deepEqual(
      recipients,
      ['https://fcm.googleapis.com/fcm/send/workspace-0'],
      'Ni client opt-in ni staff non opt-in ne reçoit ces alertes',
    );
    assert.equal(
      (await db.prepare("SELECT count(*) AS n FROM admin_alert_deliveries WHERE state='sent'").first<{ n: number }>())
        ?.n,
      1,
    );
    await db
      .prepare("UPDATE generation_provider_limits SET credit_balance=1000,balance_checked_at=? WHERE provider='runway'")
      .bind(new Date().toISOString())
      .run();
    await evaluateAdminAlerts(db);
    await db
      .prepare("UPDATE generation_provider_limits SET credit_balance=10,balance_checked_at=? WHERE provider='runway'")
      .bind(new Date().toISOString())
      .run();
    const tick = Date.now();
    await runAdminAlerts(pushEnv, tick + 1000, fetcher);
    assert.equal(recipients.length, 1, 'Une réapparition immédiate respecte le délai de regroupement');
    await runAdminAlerts(pushEnv, tick + 61 * 60000, fetcher);
    assert.equal(
      recipients.length,
      2,
      'Une alerte toujours active est notifiée après le délai, même si elle a plus de 30 minutes',
    );
    await db
      .prepare("UPDATE generation_provider_limits SET credit_balance=1000,balance_checked_at=? WHERE provider='runway'")
      .bind(new Date().toISOString())
      .run();
  });
  await db.exec(
    "UPDATE generation_control SET enabled=1; UPDATE trial_policy SET enabled=1,free_enabled=1; UPDATE allocations SET kind='paid',quota_limit=50",
  );
  await db
    .prepare('INSERT INTO generation_access VALUES(?,?,1)')
    .bind(seed.agencyId, 'allocation-workspace-fixture')
    .run();
  await db.prepare('INSERT INTO hosted_import_budget VALUES(?,0,9000,0)').bind(at.slice(0, 7)).run();
  const job = await admitGeneration(
    db,
    seed.agencyId,
    'workspace-recovery-once',
    { listingId: 'listing-workspace-fixture', customization: { ...defaultVideoCustomization(), runwayPhotos: [0] } },
    'true',
  );
  const listing = JSON.parse((await findImport(db, seed.agencyId, 'listing-workspace-fixture'))!.result!);
  await db
    .prepare(`INSERT INTO photo_animations(id,agency_id,job_id,photo_id,source_sha256,slot,month,mode,model,credits,reserved_cents,state,task_id,error_code,created_at,updated_at,duration_seconds)
 VALUES(?,?,?,?,?,0,?,'real','gen4_turbo',25,35,'failed',?,'RUNWAY_TIMEOUT',?,?,5)`)
    .bind(
      'recover-photo',
      seed.agencyId,
      job.jobId,
      listing.photos[0].id,
      listing.photos[0].contentHash,
      at.slice(0, 7),
      '11111111-1111-4111-8111-111111111111',
      at,
      at,
    )
    .run();
  await db
    .prepare("UPDATE jobs SET status='failed',lease_until=NULL,error_code='GENERATION_TIMEOUT' WHERE id=?")
    .bind(job.jobId)
    .run();
  await t.test('récupérer une tâche existante sans achat, débit, remplacement ni double traitement', async () => {
    const before = await findGeneration(db, seed.agencyId, job.jobId),
      created = await workspaceWrite(env, admin, {
        action: 'recover',
        id: job.jobId,
        reason: 'Retrouver le clip après timeout',
      });
    assert.ok(created && 'id' in created);
    await assert.rejects(
      workspaceWrite(env, admin, { action: 'recover', id: job.jobId, reason: 'Double demande concurrente' }),
      /CONFLICT/,
    );
    let calls = 0;
    const bytes = new Uint8Array(512);
    bytes.set(new TextEncoder().encode('ftyp'), 4);
    const result = await recoverKnownAnimations({ DB: db, MEDIA }, String(created.id), {
      resume: async (id) => {
        assert.equal(id, '11111111-1111-4111-8111-111111111111');
        calls++;
        return bytes;
      },
    });
    assert.equal(result?.progress.recovered, 1);
    assert.equal(calls, 1);
    await recoverKnownAnimations({ DB: db, MEDIA }, String(created.id), {
      resume: async () => {
        throw Error('MUST_NOT_CALL');
      },
    });
    assert.equal(calls, 1);
    const after = await findGeneration(db, seed.agencyId, job.jobId);
    assert.equal(after?.status, 'failed');
    assert.equal(after?.creditsUsed, before?.creditsUsed);
    assert.equal(after?.objectKey, before?.objectKey);
    assert.equal(
      (await db.prepare("SELECT state FROM photo_animations WHERE id='recover-photo'").first<{ state: string }>())
        ?.state,
      'failed',
      'Le diagnostic de la vidéo originale reste exact',
    );
    assert.equal(
      (
        await db
          .prepare('SELECT count(*) AS n FROM animation_library WHERE origin_job_id=?')
          .bind(job.jobId)
          .first<{ n: number }>()
      )?.n,
      1,
    );
  });
  await t.test('récupération active : média dans le périmètre du manifeste et copie réutilisable séparée', async () => {
    const active = await admitGeneration(
      db,
      seed.agencyId,
      'workspace-recovery-active',
      { listingId: 'listing-workspace-fixture', customization: { ...defaultVideoCustomization(), runwayPhotos: [1] } },
      'true',
    );
    const photo = listing.photos[1];
    await db
      .prepare(`INSERT INTO photo_animations(id,agency_id,job_id,photo_id,source_sha256,slot,month,mode,model,credits,reserved_cents,state,task_id,error_code,created_at,updated_at,duration_seconds)
  VALUES(?,?,?,?,?,0,?,'real','gen4_turbo',25,35,'submitted',?,'RUNWAY_TIMEOUT',?,?,5)`)
      .bind(
        'recover-active-photo',
        seed.agencyId,
        active.jobId,
        photo.id,
        photo.contentHash,
        at.slice(0, 7),
        '22222222-2222-4222-8222-222222222222',
        at,
        at,
      )
      .run();
    const request = await workspaceWrite(env, admin, {
      action: 'recover',
      id: active.jobId,
      reason: 'Reprendre le résultat de la préparation active',
    });
    assert.ok(request && 'id' in request);
    const clip = new Uint8Array(512);
    clip.set(new TextEncoder().encode('ftyp'), 4);
    await recoverKnownAnimations({ DB: db, MEDIA }, String(request.id), { resume: async () => clip });
    const row = await db
      .prepare("SELECT state,animation_json AS animation FROM photo_animations WHERE id='recover-active-photo'")
      .first<{ state: string; animation: string }>();
    assert.equal(row?.state, 'ready');
    const parsed = JSON.parse(row!.animation);
    assert.ok(parsed.asset.objectKey.startsWith(`agencies/${seed.agencyId}/jobs/${active.jobId}/animations/`));
    assert.ok(await MEDIA.head(parsed.asset.objectKey));
    const library = await db
      .prepare('SELECT asset_json AS asset FROM animation_library WHERE source_sha256=?')
      .bind(photo.contentHash)
      .first<{ asset: string }>();
    assert.ok(JSON.parse(library!.asset).objectKey.startsWith(`agencies/${seed.agencyId}/imports/animation-library/`));
  });
});
