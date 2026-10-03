import {VideoAsset} from '@bienvu/contracts';
export async function cleanupAnimations(env:{DB:D1Database;MEDIA:R2Bucket},now=Date.now()){
 const at=new Date(now).toISOString(),rows=await env.DB.prepare(`SELECT id,agency_id AS agencyId,asset_json AS asset FROM animation_library l WHERE expires_at<=? AND NOT EXISTS(SELECT 1 FROM generation_runs g JOIN jobs j ON j.id=g.job_id,json_each(g.animation_reuses_json) r WHERE j.status NOT IN ('ready','failed') AND json_extract(r.value,'$.libraryId')=l.id) ORDER BY expires_at LIMIT 30`).bind(at).all<{id:string;agencyId:string;asset:string}>();
 let removed=0;for(const row of rows.results){const asset=VideoAsset.parse(JSON.parse(row.asset));if(!asset.objectKey.startsWith(`agencies/${row.agencyId}/imports/animation-library/`))throw Error('ANIMATION_SCOPE_INVALID');
  // Lock the expired library entry before touching R2. Publishers never replace
  // an entry being purged; the separate MP4 in each original job stays intact.
  const claimed=await env.DB.prepare("UPDATE animation_library SET state='expiring' WHERE id=? AND expires_at<=? AND NOT EXISTS(SELECT 1 FROM generation_runs g JOIN jobs j ON j.id=g.job_id,json_each(g.animation_reuses_json) r WHERE j.status NOT IN ('ready','failed') AND json_extract(r.value,'$.libraryId')=animation_library.id) RETURNING id").bind(row.id,at).first();if(!claimed)continue;
  const shared=await env.DB.prepare("SELECT 1 FROM animation_library WHERE id!=? AND state='available' AND json_extract(asset_json,'$.objectKey')=?").bind(row.id,asset.objectKey).first();
  if(!shared)await env.MEDIA.delete(asset.objectKey); // A failed deletion remains retryable.
  await env.DB.prepare("DELETE FROM animation_library WHERE id=? AND state='expiring'").bind(row.id).run();removed++;
 }return {removed};
}
