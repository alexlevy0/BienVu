import {
  AdminGenerationQueue,
  EntityId,
  GenerationQueueResource,
  GenerationQueueSettings,
  type GenerationQueueSettings as Settings,
} from '@bienvu/contracts';
import type { Database } from './index';

export async function generationQueueSettings(db: Database) {
  const row = await db
    .prepare(
      'SELECT settings_json AS settings,revision,updated_at AS updatedAt FROM generation_queue_settings WHERE id=1',
    )
    .first<{ settings: string; revision: number; updatedAt: string }>();
  if (!row) throw Error('GENERATION_QUEUE_UNAVAILABLE');
  return {
    settings: GenerationQueueSettings.parse(JSON.parse(row.settings)),
    revision: row.revision,
    updatedAt: row.updatedAt,
  };
}
export async function adminGenerationQueue(db: Database) {
  const settings = await generationQueueSettings(db);
  const [usage, runway] = await Promise.all([
    db
      .prepare(`SELECT json_group_array(json(record)) AS data FROM (SELECT json_object('resource',c.resource,'concurrency',c.concurrency,
      'active',(SELECT count(*) FROM generation_queue q WHERE q.resource=c.resource AND q.state='active'),
      'waiting',(SELECT count(*) FROM generation_queue q WHERE q.resource=c.resource AND q.state='waiting')) AS record FROM generation_queue_capacity c)`)
      .first<{ data: string }>(),
    db
      .prepare(`SELECT concurrency,daily_limit AS dailyLimit,checked_at AS checkedAt,last_error AS error,
      json_object('credits',credit_balance,'available',(SELECT available_credits FROM runway_available_balance),
        'checkedAt',balance_checked_at,'error',balance_error) AS balance
      FROM generation_provider_limits WHERE provider='runway'`)
      .first<{
        concurrency: number;
        dailyLimit: number;
        checkedAt: string | null;
        error: string | null;
        balance: string;
      }>(),
  ]);
  return AdminGenerationQueue.parse({
    ...settings,
    usage: JSON.parse(usage?.data ?? '[]'),
    runway: runway ? { ...runway, balance: JSON.parse(runway.balance) } : null,
  });
}
export async function setGenerationQueueSettings(
  db: Database,
  actorId: string,
  settings: unknown,
  revision: number,
  now = Date.now(),
) {
  EntityId.parse(actorId);
  await db
    .prepare(
      'INSERT INTO generation_queue_setting_events(id,actor_id,settings_json,expected_revision,created_at) VALUES(?,?,?,?,?)',
    )
    .bind(
      crypto.randomUUID(),
      actorId,
      JSON.stringify(GenerationQueueSettings.parse(settings)),
      revision,
      new Date(now).toISOString(),
    )
    .run();
  return adminGenerationQueue(db);
}

// A single conditional UPDATE assigns a free slot and the oldest eligible ticket.
// No read-then-write admission race, expiring in-memory lock or external call.
export async function claimGenerationResource(
  db: Database,
  agencyId: string,
  jobId: string,
  resource: GenerationQueueResource,
  now = Date.now(),
) {
  EntityId.parse(agencyId);
  EntityId.parse(jobId);
  GenerationQueueResource.parse(resource);
  const at = new Date(now).toISOString();
  await db
    .prepare(`INSERT INTO generation_queue(job_id,agency_id,resource,created_at,updated_at)
    SELECT g.job_id,g.agency_id,?,?,? FROM generation_runs g JOIN jobs j ON j.id=g.job_id
    WHERE g.job_id=? AND g.agency_id=? AND g.retention='available' AND g.deadline>? AND j.status NOT IN ('ready','failed')
    AND EXISTS(SELECT 1 FROM generation_queue WHERE job_id=g.job_id AND resource='preparation')
    ON CONFLICT(job_id,resource) DO NOTHING`)
    .bind(resource, at, at, jobId, agencyId, at)
    .run();
  const extra =
    resource === 'preparation'
      ? `
    AND (SELECT count(*) FROM generation_queue a WHERE a.resource='preparation' AND a.state='active' AND a.agency_id=w.agency_id)
      <(SELECT json_extract(settings_json,'$.perAgencyConcurrency') FROM generation_queue_settings WHERE id=1)
    AND (g.anonymous_session_id IS NULL OR (SELECT count(*) FROM generation_queue a JOIN generation_runs ag ON ag.job_id=a.job_id
      WHERE a.resource='preparation' AND a.state='active' AND ag.anonymous_session_id IS NOT NULL)<(SELECT render_concurrency FROM trial_policy WHERE id=1))
    AND (j.listing_id IS NOT NULL OR json_type(g.input_json,'$.url') IS NULL OR NOT EXISTS(
      SELECT 1 FROM generation_queue a JOIN generation_runs ag ON ag.job_id=a.job_id JOIN jobs aj ON aj.id=a.job_id
      WHERE a.resource='preparation' AND a.state='active' AND aj.listing_id IS NULL AND json_type(ag.input_json,'$.url') IS NOT NULL))`
      : '';
  const legacy =
    resource === 'render'
      ? `+(SELECT count(*) FROM generation_runs lg JOIN jobs lj ON lj.id=lg.job_id
    WHERE lg.render_slot IS NULL AND lj.status='rendering')`
      : '';
  await db
    .prepare(`UPDATE generation_queue SET state='active',started_at=coalesce(started_at,?),updated_at=?,slot=(
    SELECT s.slot FROM generation_queue_slots s WHERE s.slot<(SELECT concurrency FROM generation_queue_capacity WHERE resource=?)
      AND NOT EXISTS(SELECT 1 FROM generation_queue a WHERE a.resource=? AND a.state='active' AND a.slot=s.slot) ORDER BY s.slot LIMIT 1)
    WHERE job_id=? AND agency_id=? AND resource=? AND state='waiting'
      AND (SELECT count(*) FROM generation_queue a WHERE a.resource=? AND a.state='active')${legacy}
        <(SELECT concurrency FROM generation_queue_capacity WHERE resource=?)
      AND sequence=(SELECT min(w.sequence) FROM generation_queue w JOIN generation_runs g ON g.job_id=w.job_id JOIN jobs j ON j.id=w.job_id
        WHERE w.resource=? AND w.state='waiting' AND g.retention='available' AND g.deadline>? AND j.status NOT IN ('ready','failed')${extra})`)
    .bind(at, at, resource, resource, jobId, agencyId, resource, resource, resource, resource, at)
    .run();
  return db
    .prepare('SELECT state,slot FROM generation_queue WHERE job_id=? AND agency_id=? AND resource=?')
    .bind(jobId, agencyId, resource)
    .first<{ state: 'waiting' | 'active' | 'released'; slot: number | null }>();
}
export async function releaseGenerationResource(
  db: Database,
  agencyId: string,
  jobId: string,
  resource: GenerationQueueResource,
  now = Date.now(),
) {
  EntityId.parse(agencyId);
  EntityId.parse(jobId);
  GenerationQueueResource.parse(resource);
  await db
    .prepare(
      "UPDATE generation_queue SET state='released',updated_at=? WHERE job_id=? AND agency_id=? AND resource=? AND state!='released'",
    )
    .bind(new Date(now).toISOString(), jobId, agencyId, resource)
    .run();
}
export async function generationQueueWaitLimit(db: Database): Promise<Settings['maxWaitMinutes']> {
  return (await generationQueueSettings(db)).settings.maxWaitMinutes;
}
