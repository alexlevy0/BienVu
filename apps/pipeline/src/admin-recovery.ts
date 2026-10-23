import { GenerationRequest, PhotoAnimation } from '@bienvu/contracts';
import { findGeneration } from '@bienvu/db';
import type { AnimationProvider } from './runway';
import { runwayProvider, runwayError } from './runway';
import { videoBytesHash } from './video-manifest';
import type { NarrationBucket } from './narration';

type Env = { DB: D1Database; MEDIA: NarrationBucket; RUNWAY_ENABLED?: string; RUNWAYML_API_SECRET?: string };
type RecoveryResult = {
  message: string;
  recovered: number;
  checked: string[];
  errors: { photo: number; code: string }[];
  launchChecked?: boolean;
};
// This path has no upload, generate, admitGeneration, or credit mutation. A task
// with an unknown creation outcome must never be purchased again by recovery.
export async function recoverKnownAnimations(
  env: Env,
  id: string,
  adapter?: Pick<AnimationProvider, 'resume'>,
  now = Date.now(),
) {
  const at = new Date(now).toISOString();
  const request = await env.DB.prepare(
    "UPDATE admin_recovery_requests SET state='working',updated_at=? WHERE id=? AND (state='pending' OR (state='working' AND updated_at<?)) RETURNING job_id AS jobId,result_json AS result",
  )
    .bind(at, id, new Date(now - 10 * 60000).toISOString())
    .first<{ jobId: string; result: string | null }>();
  if (!request) return null;
  const progress: RecoveryResult = request.result
    ? JSON.parse(request.result)
    : { message: 'Vérification des tâches existantes.', recovered: 0, checked: [], errors: [] };
  try {
    const ref = await env.DB.prepare('SELECT agency_id AS agencyId FROM generation_runs WHERE job_id=?')
      .bind(request.jobId)
      .first<{ agencyId: string }>();
    const job = ref ? await findGeneration(env.DB, ref.agencyId, request.jobId) : null;
    if (job?.retention !== 'available') throw Error('RECOVERY_MEDIA_EXPIRED');
    const input = GenerationRequest.parse(JSON.parse(job.input));
    const candidates = (
      await env.DB.prepare(`SELECT p.id,p.slot,p.photo_id AS photoId,p.source_sha256 AS sourceSha256,p.task_id AS taskId,p.duration_seconds AS durationSeconds FROM photo_animations p
   WHERE p.job_id=? AND p.mode='real' AND p.state!='ready' AND p.task_id IS NOT NULL AND p.error_code IS NOT 'RUNWAY_TASK_FAILED'
   AND NOT EXISTS(SELECT 1 FROM admin_recovered_animations r WHERE r.animation_id=p.id) ORDER BY p.slot`)
        .bind(job.jobId)
        .all<{
          id: string;
          slot: number;
          photoId: string;
          sourceSha256: string;
          taskId: string;
          durationSeconds: number;
        }>()
    ).results.filter((p) => !progress.checked.includes(p.id));
    if (candidates.length && !adapter && (env.RUNWAY_ENABLED !== 'true' || !env.RUNWAYML_API_SECRET))
      throw Error('RUNWAY_DISABLED');
    for (const p of candidates.slice(0, 2)) {
      try {
        const bytes = await (adapter ?? runwayProvider(env.RUNWAYML_API_SECRET!)).resume(
          p.taskId,
          AbortSignal.timeout(140000),
        );
        if (bytes.length < 16 || bytes.length > 10 * 1024 * 1024) throw Error('RUNWAY_OUTPUT_INVALID');
        const current = await findGeneration(env.DB, job.agencyId, job.jobId);
        if (current?.retention !== 'available') throw Error('RECOVERY_MEDIA_EXPIRED');
        const hash = await videoBytesHash(bytes),
          libraryKey = `agencies/${job.agencyId}/imports/animation-library/${hash}.mp4`,
          asset = {
            id: p.id,
            objectKey: libraryKey,
            sha256: hash,
            sizeBytes: bytes.length,
            mime: 'video/mp4' as const,
            width: input.aspectRatio === '16:9' ? 1280 : 720,
            height: input.aspectRatio === '16:9' ? 720 : 1280,
            durationMs: p.durationSeconds * 1000,
          };
        const jobKey = `agencies/${job.agencyId}/jobs/${job.jobId}/animations/${hash}.mp4`;
        const animation = PhotoAnimation.parse({
          photoAssetId: p.photoId,
          sourceSha256: p.sourceSha256,
          provider: 'runway',
          model: 'gen4_turbo',
          asset: { ...asset, objectKey: jobKey },
        });
        // Every manifest asset must be inside its job namespace. The library copy
        // is separate, just as in the normal preparation path.
        await env.MEDIA.put(jobKey, bytes, {
          httpMetadata: { contentType: 'video/mp4' },
          customMetadata: { sha256: hash, sourceSha256: p.sourceSha256 },
        });
        await env.MEDIA.put(libraryKey, bytes, {
          httpMetadata: { contentType: 'video/mp4' },
          customMetadata: { sha256: hash, sourceSha256: p.sourceSha256 },
        });
        const savedAt = new Date().toISOString();
        await env.DB.batch([
          env.DB.prepare(`INSERT INTO animation_library(id,agency_id,source_sha256,aspect_ratio,model,mode,origin_job_id,asset_json,created_at,expires_at)
      VALUES(?,?,?,?,'gen4_turbo','real',?,?,?,?) ON CONFLICT(agency_id,source_sha256,aspect_ratio,model,mode) DO UPDATE SET asset_json=excluded.asset_json,origin_job_id=excluded.origin_job_id,expires_at=excluded.expires_at WHERE animation_library.state='available'`).bind(
            p.id,
            job.agencyId,
            p.sourceSha256,
            input.aspectRatio ?? '9:16',
            job.jobId,
            JSON.stringify(asset),
            savedAt,
            new Date(Date.now() + 90 * 86400_000).toISOString(),
          ),
          env.DB.prepare(
            'INSERT INTO admin_recovered_animations VALUES(?,?,?,?) ON CONFLICT(animation_id) DO NOTHING',
          ).bind(p.id, id, JSON.stringify(animation), savedAt),
          // Feed a still-running preparation only. Frozen/finished videos and their
          // settled credits remain immutable; recovered clips are reusable in edits.
          env.DB.prepare(
            "UPDATE photo_animations SET state='ready',animation_json=?,error_code=NULL,updated_at=? WHERE id=? AND EXISTS(SELECT 1 FROM jobs j WHERE j.id=? AND j.status NOT IN ('ready','failed','rendering')) AND NOT EXISTS(SELECT 1 FROM video_manifests WHERE job_id=?)",
          ).bind(JSON.stringify(animation), savedAt, p.id, job.jobId, job.jobId),
        ]);
        progress.recovered++;
      } catch (error) {
        progress.errors.push({ photo: p.slot + 1, code: runwayError(error) });
      }
      progress.checked.push(p.id);
    }
    progress.recovered =
      (
        await env.DB.prepare('SELECT count(*) AS n FROM admin_recovered_animations WHERE request_id=?')
          .bind(id)
          .first<{ n: number }>()
      )?.n ?? progress.recovered;
    const more = candidates.length > 2;
    progress.message = more
      ? 'Récupération en cours, sans création de tâche payante.'
      : `${progress.recovered} clip(s) récupéré(s) dans la bibliothèque réutilisable. ${progress.errors.length} tâche(s) indisponible(s). La vidéo déjà assemblée et ses crédits restent inchangés.`;
    await env.DB.prepare('UPDATE admin_recovery_requests SET state=?,result_json=?,updated_at=? WHERE id=?')
      .bind(more ? 'pending' : 'done', JSON.stringify(progress), new Date().toISOString(), id)
      .run();
    return { job, progress, done: !more };
  } catch (error) {
    progress.message =
      error instanceof Error && error.message === 'RECOVERY_MEDIA_EXPIRED'
        ? 'Les médias ont expiré. Aucune nouvelle génération n’a été lancée.'
        : 'Vérification momentanément indisponible. Aucune nouvelle génération n’a été lancée.';
    await env.DB.prepare("UPDATE admin_recovery_requests SET state='failed',result_json=?,updated_at=? WHERE id=?")
      .bind(JSON.stringify(progress), new Date().toISOString(), id)
      .run();
    return null;
  }
}
export async function nextAdminRecovery(db: D1Database) {
  return db
    .prepare(
      "SELECT id FROM admin_recovery_requests WHERE state='pending' OR (state='working' AND updated_at<?) ORDER BY created_at LIMIT 1",
    )
    .bind(new Date(Date.now() - 10 * 60000).toISOString())
    .first<{ id: string }>();
}
