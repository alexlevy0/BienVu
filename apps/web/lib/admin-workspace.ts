import { z } from 'zod';
import {
  EntityId,
  AdminQuery,
  SiteFeatures,
  GenerationQueueSettings,
  VideoMapDefaults,
  AvatarSettings,
} from '@bienvu/contracts';
import {
  adminPage,
  siteFeatures,
  generationQueueSettings,
  videoMapSettings,
  avatarSettings,
  findAvatarLook,
} from '@bienvu/db';
import { requireStaff, isSuperAdmin, type AdminIdentity } from './admin-access';
import { staffEmails } from './admin-audience';
import type { AuthEnvironment } from './auth';
import { respond, RequestFailure, assertSameOrigin, boundedJson } from './http';
import { adminCustomerHealth } from './admin-customer-health';

export type WorkspaceEnv = AuthEnvironment & { SUPER_ADMIN_EMAIL?: string; ADMIN_EMAIL?: string };
const revision = z.number().int().min(0);
const filterRecord = z
  .record(z.string().regex(/^[a-z][a-z-]{0,30}$/), z.record(z.string().max(30), z.string().max(200)))
  .refine((v) => Object.keys(v).length <= 35);
export const Preferences = z
  .object({
    favorites: z.array(z.string().regex(/^[a-z][a-z-]{0,30}$/)).max(35),
    filters: filterRecord,
    alerts: z.boolean(),
  })
  .strict();
export type AdminPreferences = z.infer<typeof Preferences>;
export const defaultPreferences: AdminPreferences = { favorites: [], filters: {}, alerts: false };
export const AlertRules = z
  .object({
    enabled: z.boolean(),
    stallMinutes: z.number().int().min(5).max(120),
    failurePercent: z.number().int().min(5).max(100),
    minimumJobs: z.number().int().min(3).max(100),
    runwayCredits: z.number().int().min(0).max(100000),
    cooldownMinutes: z.number().int().min(15).max(1440),
  })
  .strict();
export const defaultAlertRules: z.infer<typeof AlertRules> = {
  enabled: true,
  stallMinutes: 20,
  failurePercent: 30,
  minimumJobs: 5,
  runwayCredits: 100,
  cooldownMinutes: 60,
};
export const Task = z
  .object({
    title: z.string().trim().min(3).max(150),
    targetKind: z.enum(['video', 'agency', 'incident']),
    target: z.string().min(1).max(200),
    assignee: EntityId.nullable(),
    priority: z.enum(['normal', 'high', 'urgent']),
    status: z.enum(['open', 'doing', 'done']),
    due: z.iso.date().nullable(),
    snoozedUntil: z.iso.datetime().nullable(),
    note: z.string().trim().max(1500),
  })
  .strict();
export type AdminTask = z.infer<typeof Task>;
const adminHref = z
  .string()
  .max(2000)
  .refine((v) => /^\/admin(?:\?|\/|$)/.test(v) && !v.includes('\\') && !/[\r\n]/.test(v));
export const WorkspaceAction = z.discriminatedUnion('action', [
  z.object({ action: z.literal('preferences'), revision, value: Preferences }).strict(),
  z
    .object({
      action: z.literal('view'),
      id: EntityId,
      revision,
      value: z
        .object({ name: z.string().trim().min(2).max(60), href: adminHref, shared: z.boolean(), deleted: z.boolean() })
        .strict(),
    })
    .strict(),
  z.object({ action: z.literal('task'), id: EntityId, revision, value: Task }).strict(),
  z
    .object({
      action: z.literal('audience'),
      id: EntityId,
      revision,
      value: z
        .object({ audience: z.enum(['client', 'internal', 'demo']), reason: z.string().trim().min(5).max(500) })
        .strict(),
    })
    .strict(),
  z.object({ action: z.literal('rules'), revision, value: AlertRules }).strict(),
  z
    .object({
      action: z.literal('restore'),
      kind: z.enum(['features', 'queue', 'map', 'avatars']),
      eventId: EntityId,
      revision: z.number().int().positive(),
      reason: z.string().trim().min(5).max(500),
    })
    .strict(),
  z.object({ action: z.literal('recover'), id: EntityId, reason: z.string().trim().min(5).max(1000) }).strict(),
]);
export type WorkspaceDocument<T> = {
  key: string;
  revision: number;
  value: T;
  at: string;
  actor: string;
  owner: string | null;
};
type RawDocument = { key: string; revision: number; body: string; at: string; actor: string; owner: string | null };
async function documents<T>(db: D1Database, where: string, binds: (string | number)[] = []) {
  const result = await db
    .prepare(
      `SELECT d.key,d.revision,d.body_json AS body,d.updated_at AS at,coalesce(u.name,'Administrateur') AS actor,d.owner_id AS owner FROM admin_workspace_documents d LEFT JOIN auth_user u ON u.id=d.updated_by WHERE ${where} ORDER BY CASE WHEN d.kind='task' AND json_extract(d.body_json,'$.status')!='done' THEN 0 ELSE 1 END,CASE json_extract(d.body_json,'$.priority') WHEN 'urgent' THEN 0 WHEN 'high' THEN 1 ELSE 2 END,CASE WHEN d.kind='task' THEN coalesce(json_extract(d.body_json,'$.due'),'9999') ELSE '9999' END,d.updated_at DESC,d.key LIMIT 150`,
    )
    .bind(...binds)
    .all<RawDocument>();
  return result.results.map(({ body, ...r }) => ({ ...r, value: JSON.parse(body) as T }));
}
export async function workspaceDocument<T>(db: D1Database, key: string) {
  return (await documents<T>(db, 'd.key=?', [key]))[0] ?? null;
}
async function staff(db: D1Database, env: WorkspaceEnv) {
  return (
    await db
      .prepare(
        'SELECT id,name,email FROM auth_user WHERE emailVerified=1 AND lower(email) IN (SELECT value FROM json_each(?)) ORDER BY name',
      )
      .bind(JSON.stringify(staffEmails(env)))
      .all<{ id: string; name: string; email: string }>()
  ).results;
}
export async function saveWorkspaceDocument(
  db: D1Database,
  actor: string,
  key: string,
  kind: string,
  value: unknown,
  expected: number,
  owner: string | null = null,
  now = Date.now(),
) {
  try {
    await db
      .prepare('INSERT INTO admin_workspace_events VALUES(?,?,?,?,?,?,?,?)')
      .bind(crypto.randomUUID(), key, kind, owner, actor, JSON.stringify(value), expected, new Date(now).toISOString())
      .run();
  } catch (e) {
    if (String(e).includes('ADMIN_WORKSPACE_CONFLICT')) throw new RequestFailure('CONFLICT');
    if (String(e).includes('ADMIN_WORKSPACE_RATE_LIMIT')) throw new RequestFailure('RATE_LIMITED');
    throw e;
  }
  return workspaceDocument(db, key);
}
export async function workspaceSearch(db: D1Database, q: string) {
  const pages = await Promise.all(
    (['videos', 'agencies', 'users', 'reports'] as const).map((section) =>
      adminPage(db, AdminQuery.parse({ section, q })),
    ),
  );
  return pages.flatMap((p, i) =>
    p.rows.slice(0, 6).map((r) => ({
      id: String(r.id),
      kind: ['video', 'agency', 'user', 'report'][i]!,
      title: String(r.title ?? r.agency ?? r.name ?? r.category ?? r.id),
      subtitle: String(r.email ?? r.comment ?? r.status ?? ''),
      href:
        i === 0
          ? '/admin/videos/' + encodeURIComponent(String(r.id))
          : i === 1
            ? '/admin/agencies/' + encodeURIComponent(String(r.id))
            : i === 2 && r.agencyId
              ? '/admin/agencies/' + encodeURIComponent(String(r.agencyId))
              : '/admin?view=' +
                ['videos', 'agencies', 'users', 'reports'][i] +
                '&q=' +
                encodeURIComponent(String(r.id)),
    })),
  );
}
const configs = {
  features: {
    table: 'site_feature_events',
    column: 'features_json',
    current: siteFeatures,
    schema: SiteFeatures,
    title: 'Fonctionnalités',
  },
  queue: {
    table: 'generation_queue_setting_events',
    column: 'settings_json',
    current: generationQueueSettings,
    schema: GenerationQueueSettings,
    title: 'Capacités de génération',
  },
  map: {
    table: 'video_map_setting_events',
    column: 'settings_json',
    current: videoMapSettings,
    schema: VideoMapDefaults,
    title: 'Carte par défaut',
  },
  avatars: {
    table: 'avatar_setting_events',
    column: 'settings_json',
    current: avatarSettings,
    schema: AvatarSettings,
    title: 'Avatars IA',
  },
} as const;
export type ConfigurationKind = keyof typeof configs;
export async function configurationHistory(db: D1Database, kind: ConfigurationKind) {
  const config = configs[kind],
    state = await config.current(db),
    value = 'features' in state ? state.features : state.settings;
  const history = (
    await db
      .prepare(`SELECT * FROM (
 SELECT e.id,e.${config.column} AS body,e.created_at AS at,u.name AS actor FROM ${config.table} e LEFT JOIN auth_user u ON u.id=e.actor_id
 UNION ALL SELECT 'baseline-'||kind,body_json,created_at,'État initial conservé' FROM admin_configuration_baselines WHERE kind=?
 ) ORDER BY at DESC,id DESC LIMIT 30`)
      .bind(kind)
      .all<{ id: string; body: string; at: string; actor: string | null }>()
  ).results;
  return {
    kind,
    title: config.title,
    current: { revision: state.revision, value },
    history: history.map(({ body, ...r }) => ({ ...r, value: JSON.parse(body) as Record<string, unknown> })),
  };
}
async function restoreConfiguration(
  db: D1Database,
  actor: string,
  input: Extract<z.infer<typeof WorkspaceAction>, { action: 'restore' }>,
) {
  const c = configs[input.kind],
    saved =
      input.eventId === 'baseline-' + input.kind
        ? await db
            .prepare('SELECT body_json AS body FROM admin_configuration_baselines WHERE kind=?')
            .bind(input.kind)
            .first<{ body: string }>()
        : await db
            .prepare(`SELECT ${c.column} AS body FROM ${c.table} WHERE id=?`)
            .bind(input.eventId)
            .first<{ body: string }>();
  if (!saved) throw new RequestFailure('NOT_FOUND');
  const value = c.schema.safeParse(JSON.parse(saved.body));
  if (!value.success) throw new RequestFailure('VALIDATION_ERROR');
  if (input.kind === 'avatars' && 'defaultLookId' in value.data && value.data.defaultLookId) {
    const look = await findAvatarLook(db, value.data.defaultLookId);
    if (!look?.look.enabled) throw new RequestFailure('VALIDATION_ERROR');
  }
  const at = new Date().toISOString();
  try {
    await db.batch([
      db
        .prepare(`INSERT INTO ${c.table}(id,actor_id,${c.column},expected_revision,created_at) VALUES(?,?,?,?,?)`)
        .bind(crypto.randomUUID(), actor, JSON.stringify(value.data), input.revision, at),
      db
        .prepare(
          "INSERT INTO admin_operation_entries(id,actor_id,kind,target,body,state,created_at) VALUES(?,?,'change',?,?,NULL,?)",
        )
        .bind(crypto.randomUUID(), actor, 'Restauration · ' + c.title, `Version ${input.eventId}. ${input.reason}`, at),
    ]);
  } catch (e) {
    if (/CONFLICT/.test(String(e))) throw new RequestFailure('CONFLICT');
    if (/RATE_LIMIT/.test(String(e))) throw new RequestFailure('RATE_LIMITED');
    throw e;
  }
  return configurationHistory(db, input.kind);
}
export async function workspaceWrite(env: WorkspaceEnv, actor: AdminIdentity, input: z.infer<typeof WorkspaceAction>) {
  const db = env.DB;
  if (input.action === 'preferences')
    return saveWorkspaceDocument(
      db,
      actor.id,
      'preferences:' + actor.id,
      'preferences',
      input.value,
      input.revision,
      actor.id,
    );
  if (input.action === 'view') {
    const old = await workspaceDocument<{ shared: boolean }>(db, 'view:' + input.id);
    if (old?.owner && old.owner !== actor.id) throw new RequestFailure('FORBIDDEN');
    if (
      !old &&
      (await documents(db, "d.kind='view' AND (d.owner_id=? OR d.owner_id IS NULL)", [actor.id])).length >= 100
    )
      throw new RequestFailure('RATE_LIMITED');
    return saveWorkspaceDocument(
      db,
      actor.id,
      'view:' + input.id,
      'view',
      input.value,
      input.revision,
      input.value.shared ? null : actor.id,
    );
  }
  if (input.action === 'task') {
    const task = input.value;
    if (task.assignee && !(await staff(db, env)).some((s) => s.id === task.assignee))
      throw new RequestFailure('VALIDATION_ERROR');
    if (task.targetKind === 'incident') {
      if (!/^[a-z_]+:[A-Z0-9_]{3,80}$/.test(task.target)) throw new RequestFailure('VALIDATION_ERROR');
    } else {
      if (!EntityId.safeParse(task.target).success) throw new RequestFailure('VALIDATION_ERROR');
      if (
        !(await db
          .prepare(`SELECT 1 FROM ${task.targetKind === 'video' ? 'jobs' : 'agencies'} WHERE id=?`)
          .bind(task.target)
          .first())
      )
        throw new RequestFailure('NOT_FOUND');
    }
    return saveWorkspaceDocument(db, actor.id, 'task:' + input.id, 'task', task, input.revision);
  }
  if (input.action === 'audience') {
    if (!(await db.prepare('SELECT 1 FROM agencies WHERE id=?').bind(input.id).first()))
      throw new RequestFailure('NOT_FOUND');
    return saveWorkspaceDocument(db, actor.id, 'agency:' + input.id, 'audience', input.value, input.revision);
  }
  if (input.action === 'rules')
    return saveWorkspaceDocument(db, actor.id, 'rules:alerts', 'rules', input.value, input.revision);
  if (input.action === 'restore') return restoreConfiguration(db, actor.id, input);
  const job = await db
    .prepare('SELECT g.retention FROM generation_runs g WHERE g.job_id=?')
    .bind(input.id)
    .first<{ retention: string }>();
  if (!job) throw new RequestFailure('NOT_FOUND');
  if (job.retention !== 'available') throw new RequestFailure('CONFLICT');
  const id = crypto.randomUUID(),
    at = new Date().toISOString();
  try {
    await db
      .prepare(
        'INSERT INTO admin_recovery_requests(id,job_id,actor_id,reason,created_at,updated_at) VALUES(?,?,?,?,?,?)',
      )
      .bind(id, input.id, actor.id, input.reason, at, at)
      .run();
  } catch (e) {
    if (String(e).includes('UNIQUE')) throw new RequestFailure('CONFLICT');
    if (String(e).includes('ADMIN_WORKSPACE_RATE_LIMIT')) throw new RequestFailure('RATE_LIMITED');
    throw e;
  }
  return { id, state: 'pending' };
}
export async function workspaceRead(
  env: WorkspaceEnv,
  actor: AdminIdentity,
  section: string,
  q = '',
  kind: ConfigurationKind = 'features',
  id?: string,
) {
  const db = env.DB,
    at = new Date().toISOString();
  if (section === 'search') return { items: q.trim().length >= 2 ? await workspaceSearch(db, q.trim()) : [] };
  if (section === 'health') return adminCustomerHealth(db, env);
  if (section === 'preferences')
    return { document: await workspaceDocument<AdminPreferences>(db, 'preferences:' + actor.id) };
  if (section === 'views')
    return {
      items: await documents<{ name: string; href: string; shared: boolean; deleted: boolean }>(
        db,
        "d.kind='view' AND (d.owner_id=? OR d.owner_id IS NULL) AND json_extract(d.body_json,'$.deleted')=0",
        [actor.id],
      ),
    };
  if (section === 'configuration') return configurationHistory(db, kind);
  if (section === 'audience')
    return {
      document: id
        ? await workspaceDocument<{ audience: 'client' | 'internal' | 'demo'; reason: string }>(db, 'agency:' + id)
        : null,
    };
  if (section === 'recovery') {
    if (!id) throw new RequestFailure('VALIDATION_ERROR');
    const requests = (
      await db
        .prepare(
          'SELECT id,state,reason,result_json AS result,created_at AS at,updated_at AS updatedAt FROM admin_recovery_requests WHERE job_id=? ORDER BY created_at DESC LIMIT 10',
        )
        .bind(id)
        .all<{ id: string; state: string; reason: string; result: string | null; at: string; updatedAt: string }>()
    ).results;
    const known = (
      await db
        .prepare(
          "SELECT id,slot,state,task_id AS taskId,error_code AS error FROM photo_animations WHERE job_id=? AND state!='ready' ORDER BY slot",
        )
        .bind(id)
        .all<{ id: string; slot: number; state: string; taskId: string | null; error: string | null }>()
    ).results;
    const job = await db
      .prepare(`SELECT j.status,l.status AS launch,g.retention,EXISTS(SELECT 1 FROM video_manifests WHERE job_id=j.id) AS manifest FROM jobs j
   JOIN generation_runs g ON g.job_id=j.id JOIN job_launch_intents l ON l.job_id=j.id WHERE j.id=?`)
      .bind(id)
      .first<{ status: string; launch: string; retention: string; manifest: number }>();
    if (!job) throw new RequestFailure('NOT_FOUND');
    const available = await db
      .prepare(
        "SELECT count(*) AS n FROM photo_animations p WHERE p.job_id=? AND p.mode='real' AND p.state!='ready' AND p.task_id IS NOT NULL AND p.error_code IS NOT 'RUNWAY_TASK_FAILED' AND NOT EXISTS(SELECT 1 FROM admin_recovered_animations r WHERE r.animation_id=p.id)",
      )
      .bind(id)
      .first<{ n: number }>();
    const canRecover =
      job.retention === 'available' &&
      (Boolean(available?.n) ||
        (!['ready', 'failed'].includes(job.status) && (job.launch === 'pending' || Boolean(job.manifest))));
    return {
      canRecover,
      requests: requests.map((r) => ({
        ...r,
        result: r.result ? (JSON.parse(r.result) as { message: string; recovered: number }) : null,
      })),
      known,
    };
  }
  const [tasks, people, alerts, rules] = await Promise.all([
    documents<AdminTask>(db, "d.kind='task'"),
    staff(db, env),
    db
      .prepare(
        'SELECT id,rule,title,body,href,opened_at AS at,resolved_at AS resolvedAt FROM admin_alerts ORDER BY opened_at DESC LIMIT 30',
      )
      .all<{
        id: string;
        rule: string;
        title: string;
        body: string;
        href: string;
        at: string;
        resolvedAt: string | null;
      }>(),
    workspaceDocument<z.infer<typeof AlertRules>>(db, 'rules:alerts'),
  ]);
  return { at, actorId: actor.id, tasks, people, alerts: alerts.results, rules };
}
export function adminWorkspaceRequest(request: Request, env: WorkspaceEnv) {
  return respond(async () => {
    const actor = await requireStaff(request, env),
      superAdmin = isSuperAdmin(env, actor);
    if (request.method === 'GET') {
      const query = z
        .object({
          section: z.enum([
            'overview',
            'search',
            'preferences',
            'views',
            'configuration',
            'audience',
            'recovery',
            'health',
          ]),
          q: z.string().max(100).optional(),
          kind: z.enum(['features', 'queue', 'map', 'avatars']).optional(),
          id: EntityId.optional(),
        })
        .strict()
        .safeParse(Object.fromEntries(new URL(request.url).searchParams));
      if (!query.success) throw new RequestFailure('VALIDATION_ERROR');
      if (!superAdmin && !['overview', 'preferences', 'views'].includes(query.data.section))
        throw new RequestFailure('FORBIDDEN');
      const data = await workspaceRead(env, actor, query.data.section, query.data.q, query.data.kind, query.data.id);
      if (!superAdmin && 'alerts' in data) return Response.json({ ...data, alerts: [], rules: null });
      return Response.json(data);
    }
    if (request.method !== 'POST') throw new RequestFailure('FORBIDDEN');
    assertSameOrigin(request, env);
    const input = WorkspaceAction.safeParse(await boundedJson(request, 20000));
    if (!input.success) throw new RequestFailure('VALIDATION_ERROR');
    if (!superAdmin && !['task', 'preferences', 'view'].includes(input.data.action))
      throw new RequestFailure('FORBIDDEN');
    return Response.json(await workspaceWrite(env, actor, input.data));
  });
}
