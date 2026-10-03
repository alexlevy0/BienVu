import type {Database} from './index';

// A null expiry means permanent storage. Purged files remain unavailable;
// anonymous session proofs and other access tokens keep their own lifetimes.
export function generationRetained(row:{retention:string;expiresAt:string|null},now=Date.now()){
  return row.retention==='available'&&(row.expiresAt===null||row.expiresAt>new Date(now).toISOString());
}
export async function generationStoredPermanently(db:Database,agencyId:string,jobId:string){
  return Boolean(await db.prepare("SELECT 1 FROM generation_runs WHERE agency_id=? AND job_id=? AND retention='available' AND storage_permanent=1")
    .bind(agencyId,jobId).first());
}

// The alias l always belongs to an agency-scoped animation_library query.
// Keep both original animations and animations reused by a retained video.
export const retainedAnimationLibrarySql=`EXISTS(SELECT 1 FROM generation_runs g
  WHERE g.agency_id=l.agency_id AND g.storage_permanent=1 AND g.retention='available'
  AND (g.job_id=l.origin_job_id OR EXISTS(SELECT 1 FROM json_each(g.animation_reuses_json) r
    WHERE json_extract(r.value,'$.libraryId')=l.id)))`;
