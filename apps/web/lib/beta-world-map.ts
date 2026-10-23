import { EntityId, VideoManifest } from '@bienvu/contracts';
import { findOwnedGeneration, generationMasterUnlocked, generationRetained } from '@bienvu/db';
import { RequestFailure } from './http';
import { streamGenerationMedia } from './generations';
import { readHomepageConfig } from './homepage-media';
import { publicShowcaseProperty, resolvePublicShowcase } from './showcases';
import { groupWorldLocations, type WorldActivity, type WorldLocation } from './world-map-view';

type Env = Pick<CloudflareEnv, 'DB' | 'MEDIA'>;
type LocatedRow = WorldLocation & {
  contributor: string | null;
  width: number | null;
  height: number | null;
  seconds: number | null;
};
const location = `coalesce(json_extract(m.manifest_json,'$.map.settings.location'),json_extract(mr.map_json,'$.location'),json_extract(g.input_json,'$.customization.map.location'))`;
export async function worldContributor(db: D1Database, id: string) {
  if (!EntityId.safeParse(id).success) throw new RequestFailure('NOT_FOUND');
  return db
    .prepare(`SELECT c.agency_id AS agencyId FROM beta_world_map_contributors c
  JOIN agencies a ON a.id=c.agency_id AND a.owner_user_id=c.approved_by_user_id
  JOIN generation_runs g ON g.owner_agency_id=c.agency_id
  WHERE c.enabled=1 AND g.job_id=?`)
    .bind(id)
    .first<{ agencyId: string }>();
}
export async function readBetaWorldMap(env: Env): Promise<WorldActivity> {
  const now = new Date().toISOString();
  const result = await env.DB.prepare(`SELECT j.id AS jobId,
  coalesce(json_extract(m.manifest_json,'$.presentation.locality'),json_extract(i.result_json,'$.facts.locality.value'),
   CASE WHEN json_extract(${location},'$.sourceType')='municipality' THEN json_extract(${location},'$.label') END) AS locality,
  round(json_extract(${location},'$.latitude'),1) AS latitude,round(json_extract(${location},'$.longitude'),1) AS longitude,
  CASE WHEN a.id IS NOT NULL AND c.enabled=1 AND v.job_id IS NOT NULL AND g.retention='available'
    AND (g.storage_permanent=1 OR g.expires_at>?) AND (r.status='consumed' OR g.credit_version=1 AND g.anonymous_session_id IS NOT NULL)
   THEN c.agency_id END AS contributor,
  json_extract(v.report_json,'$.width') AS width,json_extract(v.report_json,'$.height') AS height,json_extract(v.report_json,'$.durationSeconds') AS seconds
  FROM video_manifests m JOIN jobs j ON j.id=m.job_id
  LEFT JOIN generation_runs g ON g.job_id=j.id LEFT JOIN reservations r ON r.job_id=j.id
  LEFT JOIN generation_map_resolutions mr ON mr.job_id=j.id AND mr.agency_id=j.agency_id
  LEFT JOIN generation_artifacts v ON v.job_id=j.id
  LEFT JOIN beta_world_map_contributors c ON c.agency_id=g.owner_agency_id
  LEFT JOIN agencies a ON a.id=c.agency_id AND a.owner_user_id=c.approved_by_user_id
  LEFT JOIN listing_imports i ON i.id=j.listing_id AND i.agency_id=j.agency_id
  WHERE j.status='ready' AND json_type(${location})='object'
   AND json_type(${location},'$.latitude') IN ('integer','real') AND json_type(${location},'$.longitude') IN ('integer','real')
  ORDER BY j.created_at DESC,j.id LIMIT 10000`)
    .bind(now)
    .all<LocatedRow>();
  const rows = result.results,
    places = groupWorldLocations(rows),
    byJob = new Map<string, (typeof places)[number]>();
  for (const row of rows) {
    const place = places.find((p) => p.latitude === row.latitude && p.longitude === row.longitude);
    if (place) byJob.set(row.jobId, place);
  }
  const publishedJobs = new Set<string>(),
    config = await readHomepageConfig(env.DB);
  const assets =
    await env.DB.prepare(`SELECT id,source_id AS jobId FROM homepage_assets WHERE source_kind='video' AND state='active'
  AND id IN (SELECT value FROM homepage_settings,json_each(homepage_settings.published_json))`).all<{
      id: string;
      jobId: string;
    }>();
  for (const asset of assets.results) {
    const place = byJob.get(asset.jobId),
      media = Object.values(config.slots).find((m) => m?.id === asset.id);
    if (!place || !media || media.kind !== 'video') continue;
    place.videos.push({
      id: asset.id,
      url: media.url,
      poster: media.posterUrl,
      title: media.title || `Un bien à ${place.locality}`,
      width: media.width ?? 1080,
      height: media.height ?? 1920,
      seconds: (media.durationMs ?? 20000) / 1000,
    });
    publishedJobs.add(asset.jobId);
  }
  // Reuse the existing publication guard, including withdrawn, archived and outdated videos.
  const showcases = await env.DB.prepare(`SELECT p.id,json_extract(s.published_json,'$.slug') AS slug,
  json_extract(p.published_json,'$.video.jobId') AS jobId FROM showcase_properties p JOIN agency_showcases s ON s.agency_id=p.agency_id
  WHERE s.status='published' AND p.removed=0 AND json_type(p.published_json,'$.video')='object' LIMIT 100`).all<{
    id: string;
    slug: string;
    jobId: string;
  }>();
  for (const item of showcases.results) {
    const place = byJob.get(item.jobId);
    if (!place || publishedJobs.has(item.jobId)) continue;
    try {
      const property = await publicShowcaseProperty(env, await resolvePublicShowcase(env, item.slug), item.id);
      if (!property?.video) continue;
      place.videos.push({
        id: item.id,
        url: property.video.url,
        poster: property.cover?.url ?? null,
        title: property.fields.title || `Un bien à ${place.locality}`,
        width: property.video.aspectRatio === '16:9' ? 1920 : 1080,
        height: property.video.aspectRatio === '16:9' ? 1080 : 1920,
        seconds: property.video.durationSeconds,
        href: property.url,
      });
      publishedJobs.add(item.jobId);
    } catch {
      /* A withdrawn publication is absent from this public projection. */
    }
  }
  for (const row of rows) {
    const place = byJob.get(row.jobId);
    if (!place || !row.contributor || publishedJobs.has(row.jobId) || place.videos.length >= 30) continue;
    place.videos.push({
      id: row.jobId,
      url: `/api/beta/world/videos/${row.jobId}`,
      poster: `/api/beta/world/videos/${row.jobId}?poster=1`,
      title: `Un bien à ${place.locality}`,
      width: row.width ?? 1080,
      height: row.height ?? 1920,
      seconds: row.seconds ?? 20,
    });
  }
  return { places, videoCount: places.reduce((n, p) => n + p.count, 0), placeCount: places.length, updatedAt: now };
}
export async function betaWorldVideo(request: Request, env: Env, id: string) {
  const contributor = await worldContributor(env.DB, id);
  if (!contributor) throw new RequestFailure('NOT_FOUND');
  const row = await findOwnedGeneration(env.DB, contributor.agencyId, id);
  if (row?.status !== 'ready' || !generationRetained(row) || !generationMasterUnlocked(row))
    throw new RequestFailure('NOT_FOUND');
  if (new URL(request.url).searchParams.get('poster') !== '1')
    return streamGenerationMedia(request, env, row, 'master');
  const frozen = await env.DB.prepare('SELECT manifest_json AS manifest FROM video_manifests WHERE job_id=?')
    .bind(id)
    .first<{ manifest: string }>();
  const manifest = frozen ? VideoManifest.parse(JSON.parse(frozen.manifest)) : null,
    photo = manifest?.photos[0];
  // Only the first image in this immutable manifest, within the source agency.
  // Imports may retain their original /imports/ key after a generation is claimed.
  if (!photo?.objectKey.startsWith(`agencies/${row.agencyId}/`)) throw new RequestFailure('NOT_FOUND');
  const head = await env.MEDIA.head(photo.objectKey);
  if (
    !head ||
    head.size !== photo.sizeBytes ||
    (head.customMetadata?.sha256 && head.customMetadata.sha256 !== photo.sha256)
  )
    throw new RequestFailure('NOT_FOUND');
  const object = request.method === 'HEAD' ? null : await env.MEDIA.get(photo.objectKey);
  if (request.method !== 'HEAD' && !object) throw new RequestFailure('NOT_FOUND');
  return new Response(object?.body ?? null, {
    headers: {
      'Content-Type': photo.mime,
      'Content-Length': String(head.size),
      'Cache-Control': 'private, no-store',
      'X-Content-Type-Options': 'nosniff',
    },
  });
}
