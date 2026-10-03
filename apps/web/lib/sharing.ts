import {EntityId, VideoManifest, VideoReport} from '@bienvu/contracts';
import {findOwnedGeneration,generationRetained, type Database} from '@bienvu/db';
import {RequestFailure} from './http';
import {generationVideo, ownGeneration} from './generations';

type Env = Pick<CloudflareEnv, 'DB' | 'MEDIA'>;
type SharedRow = {id: string; agencyId: string; jobId: string; title: string; locality: string;
  propertyType: 'apartment' | 'house' | 'other' | null; agencyName: string;
  publishedAt: string; expiresAt: string|null; report: string};
type PublicFilters = {query?: string; category?: 'all' | 'apartments' | 'houses' | 'exceptional';
  sort?: 'newest' | 'oldest'};
const publicColumns = `s.id,g.owner_agency_id AS agencyId,s.job_id AS jobId,s.published_at AS publishedAt,
  CASE WHEN g.storage_permanent=1 THEN NULL ELSE g.expires_at END AS expiresAt,a.report_json AS report,ag.name AS agencyName,
  coalesce(json_extract(i.result_json,'$.facts.title.value'),'Votre annonce') AS title,
  coalesce(json_extract(i.result_json,'$.facts.locality.value'),'') AS locality,
  json_extract(i.result_json,'$.facts.propertyType.value') AS propertyType`;
const publicJoins = `FROM generation_shares s JOIN generation_runs g ON g.job_id=s.job_id AND g.agency_id=s.agency_id
  JOIN jobs j ON j.id=s.job_id AND j.agency_id=s.agency_id
  JOIN reservations r ON r.job_id=j.id AND r.agency_id=j.agency_id AND (r.status='consumed' OR g.credit_version=1 AND g.anonymous_session_id IS NOT NULL AND g.owner_agency_id IS NOT NULL)
  JOIN generation_artifacts a ON a.job_id=j.id JOIN agencies ag ON ag.id=g.owner_agency_id
  LEFT JOIN listing_imports i ON i.id=j.listing_id AND i.agency_id=j.agency_id`;
const visible = `g.retention='available' AND s.revoked_at IS NULL AND j.status='ready' AND (g.storage_permanent=1 OR g.expires_at>?)`;

function publicView(row: SharedRow) {
  const report = VideoReport.parse(JSON.parse(row.report));
  return {id: row.id, title: row.title, locality: row.locality, propertyType: row.propertyType,
    agency: row.agencyName, publishedAt: row.publishedAt,
    expiresAt: row.expiresAt, durationSeconds: report.durationSeconds,aspectRatio:report.width>report.height?'16:9':'9:16',
    posterUrl: `/api/explorer/${row.id}/poster`, videoUrl: `/api/explorer/${row.id}/video`,
    pageUrl: `/explorer/${row.id}`};
}

export async function ownerShares(db: Database, agencyId: string) {
  EntityId.parse(agencyId);
  const row = await db.prepare(`SELECT coalesce(json_group_array(json(record)),'[]') AS data FROM
    (SELECT json_object('jobId',s.job_id,'id',s.id) AS record FROM generation_shares s
    JOIN generation_runs g ON g.job_id=s.job_id AND g.agency_id=s.agency_id
    JOIN jobs j ON j.id=s.job_id AND j.agency_id=s.agency_id
    WHERE g.owner_agency_id=? AND s.revoked_at IS NULL AND g.retention='available' AND (g.storage_permanent=1 OR g.expires_at>?) AND j.status='ready'
    ORDER BY s.published_at DESC LIMIT 500)`)
    .bind(agencyId, new Date().toISOString()).first<{data: string}>();
  return JSON.parse(row?.data ?? '[]') as {jobId: string; id: string}[];
}

export async function publishGeneration(env: Env, agencyId: string, jobId: string) {
  const row = await ownGeneration(env, agencyId, jobId);
  if (row.status !== 'ready' || !generationRetained(row)) throw new RequestFailure('NOT_FOUND');
  // Verify the owned master before making an explicit public share.
  await generationVideo(new Request('https://bienvu.invalid/video', {method: 'HEAD'}), env, agencyId, jobId);
  const existing = await env.DB.prepare('SELECT id FROM generation_shares WHERE agency_id=? AND job_id=? AND revoked_at IS NULL')
    .bind(row.agencyId, jobId).first<{id: string}>();
  if (existing) return {id: existing.id, pageUrl: `/explorer/${existing.id}`};
  const id = crypto.randomUUID();
  try {
    await env.DB.prepare(`INSERT INTO generation_shares(id,agency_id,job_id,published_at)
      SELECT ?,j.agency_id,j.id,? FROM jobs j JOIN generation_runs g ON g.job_id=j.id AND g.agency_id=j.agency_id
      JOIN reservations r ON r.job_id=j.id AND r.agency_id=j.agency_id AND (r.status='consumed' OR g.credit_version=1 AND g.anonymous_session_id IS NOT NULL AND g.owner_agency_id IS NOT NULL)
      JOIN generation_artifacts a ON a.job_id=j.id
      WHERE g.owner_agency_id=? AND j.id=? AND g.retention='available' AND j.status='ready' AND (g.storage_permanent=1 OR g.expires_at>?)`)
      .bind(id, new Date().toISOString(), agencyId, jobId, new Date().toISOString()).run();
  } catch (error) {
    const winner = await env.DB.prepare('SELECT id FROM generation_shares WHERE agency_id=? AND job_id=? AND revoked_at IS NULL')
      .bind(row.agencyId, jobId).first<{id: string}>();
    if (winner) return {id: winner.id, pageUrl: `/explorer/${winner.id}`};
    throw error;
  }
  const created = await env.DB.prepare('SELECT id FROM generation_shares WHERE agency_id=? AND job_id=? AND revoked_at IS NULL')
    .bind(row.agencyId, jobId).first<{id: string}>();
  if (!created) throw new RequestFailure('NOT_FOUND');
  return {id: created.id, pageUrl: `/explorer/${created.id}`};
}

export async function revokeGeneration(db: Database, agencyId: string, jobId: string) {
  if (!EntityId.safeParse(jobId).success) throw new RequestFailure('NOT_FOUND');
  const row=await findOwnedGeneration(db,agencyId,jobId);if(!row)throw new RequestFailure('NOT_FOUND');
  await db.prepare('UPDATE generation_shares SET revoked_at=? WHERE agency_id=? AND job_id=? AND revoked_at IS NULL')
    .bind(new Date().toISOString(), row.agencyId, jobId).run();
}

export async function findPublic(db: Database, id: string) {
  if (!EntityId.safeParse(id).success) throw new RequestFailure('NOT_FOUND');
  const row = await db.prepare(`SELECT ${publicColumns} ${publicJoins} WHERE s.id=? AND ${visible}`)
    .bind(id, new Date().toISOString()).first<SharedRow>();
  if (!row) throw new RequestFailure('NOT_FOUND');
  return {row, view: publicView(row)};
}

export async function listPublic(db: D1Database, cursor?: string, filters: PublicFilters = {}) {
  const query = filters.query?.trim() ?? '', category = filters.category ?? 'all', sort = filters.sort ?? 'newest';
  if (query.length > 80 || !['all','apartments','houses','exceptional'].includes(category) ||
    !['newest','oldest'].includes(sort)) throw new RequestFailure('VALIDATION_ERROR');
  const ascending = sort === 'oldest';
  let beforeTime = ascending ? '0000' : '9999', beforeId = ascending ? '' : '~';
  if (cursor) {
    try {
      if (cursor.length > 256) throw 0;
      const parts = JSON.parse(atob(cursor)) as unknown;
      if (!Array.isArray(parts) || parts.length !== 2 || typeof parts[0] !== 'string' ||
        !/^\d{4}-\d\d-\d\dT/.test(parts[0]) || !EntityId.safeParse(parts[1]).success) throw 0;
      [beforeTime, beforeId] = parts as [string, string];
    } catch {throw new RequestFailure('VALIDATION_ERROR');}
  }
  // « Biens d’exception » exige une sélection éditoriale explicite ; aucun bien client n’est qualifié automatiquement.
  const categorySql = category === 'apartments' ? " AND json_extract(i.result_json,'$.facts.propertyType.value')='apartment'"
    : category === 'houses' ? " AND json_extract(i.result_json,'$.facts.propertyType.value')='house'"
      : category === 'exceptional' ? ' AND 1=0' : '';
  const searchSql = query ? ` AND (instr(lower(coalesce(json_extract(i.result_json,'$.facts.title.value'),'')),lower(?))>0
    OR instr(lower(coalesce(json_extract(i.result_json,'$.facts.locality.value'),'')),lower(?))>0
    OR instr(lower(ag.name),lower(?))>0)` : '';
  const compare = ascending ? '>' : '<', order = ascending ? 'ASC' : 'DESC';
  const result = await db.prepare(`SELECT ${publicColumns} ${publicJoins} WHERE ${visible}${categorySql}${searchSql}
    AND (s.published_at${compare}? OR (s.published_at=? AND s.id${compare}?))
    ORDER BY s.published_at ${order},s.id ${order} LIMIT 13`)
    .bind(new Date().toISOString(), ...(query ? [query,query,query] : []), beforeTime, beforeTime, beforeId).all<SharedRow>();
  const rows = result.results.slice(0, 12), last = rows.at(-1);
  return {videos: rows.map(publicView), nextCursor: result.results.length > 12 && last
    ? btoa(JSON.stringify([last.publishedAt, last.id])) : null};
}

// Les vignettes sont des photos du manifeste figé, jamais une URL fournie par le navigateur.
export async function generationPoster(env: Env, agencyId: string, jobId: string) {
  const job = await ownGeneration(env, agencyId, jobId);
  if (job.status === 'failed' || !generationRetained(job)) throw new RequestFailure('NOT_FOUND');
  const stored = await env.DB.prepare(`SELECT manifest_json AS manifest,manifest_hash AS hash,state
    FROM video_manifests WHERE agency_id=? AND job_id=? AND (?=1 OR expires_at>?)`)
    .bind(job.agencyId, jobId, job.expiresAt===null?1:0, new Date().toISOString()).first<{manifest: string; hash: string; state: string}>();
  if (!stored || stored.state !== 'prepared') throw new RequestFailure('NOT_FOUND');
  const manifest = VideoManifest.parse(JSON.parse(stored.manifest));
  if (manifest.agencyId !== job.agencyId || manifest.jobId !== jobId) throw new RequestFailure('NOT_FOUND');
  const first = manifest.photos[0], head = await env.MEDIA.head(first.objectKey);
  if (!head || head.size !== first.sizeBytes || head.customMetadata?.manifestHash !== stored.hash)
    throw new RequestFailure('NOT_FOUND');
  const object = await env.MEDIA.get(first.objectKey);
  if (!object) throw new RequestFailure('NOT_FOUND');
  return new Response(object.body, {headers: {'Content-Type': first.mime, 'Content-Length': String(first.sizeBytes),
    'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff'}});
}
