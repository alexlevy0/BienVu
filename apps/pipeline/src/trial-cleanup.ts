// Failed anonymous attempts can be purged after renderer cancellation.
// Successful videos stay stored; claims and cleanup still share a D1 fence.
export async function cleanupAnonymousTrials(env:{DB:D1Database;MEDIA:R2Bucket},now=Date.now()) {
  const at=new Date(now).toISOString();
  await env.DB.prepare(`UPDATE generation_runs SET ip_hmac=NULL,turnstile_hash=NULL
    WHERE anonymous_session_id IS NOT NULL AND created_at<? AND (ip_hmac IS NOT NULL OR turnstile_hash IS NOT NULL)`)
    .bind(new Date(now-48*3600_000).toISOString()).run();
  await env.DB.prepare('UPDATE anonymous_sessions SET proof_hash=NULL,claim_job_id=NULL WHERE expires_at<=? AND proof_hash IS NOT NULL').bind(at).run();
  await env.DB.prepare(`UPDATE anonymous_manual_imports SET ip_hmac=NULL,turnstile_hash=NULL,input_json='{}'
    WHERE created_at<? AND (ip_hmac IS NOT NULL OR turnstile_hash IS NOT NULL OR input_json!='{}')`)
    .bind(new Date(now-48*3600_000).toISOString()).run();
  await env.DB.prepare(`DELETE FROM anonymous_manual_imports WHERE created_at<?
    AND EXISTS(SELECT 1 FROM anonymous_sessions s WHERE s.id=session_id AND s.expires_at<=?)
    AND NOT EXISTS(SELECT 1 FROM listing_imports i WHERE i.id=import_id)`)
    .bind(new Date(now-31*86400_000).toISOString(),at).run();
  const expired=await env.DB.prepare(`SELECT g.job_id AS id,g.agency_id AS scope FROM generation_runs g JOIN jobs j ON j.id=g.job_id
    WHERE g.anonymous_session_id IS NOT NULL AND g.owner_agency_id IS NULL AND g.retention!='expired'
    AND g.storage_permanent=0 AND g.expires_at<=? AND j.status IN ('ready','failed') ORDER BY g.expires_at LIMIT 10`).bind(at).all<{id:string;scope:string}>();
  for(const job of expired.results){
    const winner=await env.DB.prepare(`UPDATE generation_runs SET retention='expiring' WHERE job_id=? AND owner_agency_id IS NULL
      AND storage_permanent=0 AND retention IN ('available','expiring') AND expires_at<=? RETURNING job_id`).bind(job.id,at).first();
    if(!winner)continue;
    // Scope IDs are server-generated and never change on claim. No bucket-wide
    // deletion or shared agency prefix: only this exact job's private objects.
    await removePrefix(env.MEDIA,`agencies/${job.scope}/jobs/${job.id}/`);
    const imported=await env.DB.prepare(`SELECT i.id FROM listing_imports i WHERE i.agency_id=?
      AND (i.idempotency_key=? OR i.id=(SELECT listing_id FROM jobs WHERE id=?))
      AND NOT EXISTS(SELECT 1 FROM jobs j WHERE j.agency_id=i.agency_id AND j.listing_id=i.id AND j.id!=?)`)
      .bind(job.scope,`generation-${job.id}`,job.id,job.id).first<{id:string}>();
    // Unlink before marking an import deleting; the existing preservation
    // trigger then arbitrates against any concurrent, valid import reference.
    await env.DB.batch([
      env.DB.prepare('DELETE FROM media_assets WHERE agency_id=? AND job_id=?').bind(job.scope,job.id),
      env.DB.prepare("UPDATE jobs SET listing_id=NULL,source_url='' WHERE id=?").bind(job.id),
      env.DB.prepare('DELETE FROM video_manifests WHERE job_id=?').bind(job.id),
      env.DB.prepare('DELETE FROM generation_previews WHERE job_id=?').bind(job.id),
      env.DB.prepare('DELETE FROM generation_artifacts WHERE job_id=?').bind(job.id),
      env.DB.prepare('UPDATE narration_calls SET result_json=NULL,object_key=NULL WHERE job_id=?').bind(job.id),
      env.DB.prepare('UPDATE photo_animations SET animation_json=NULL WHERE job_id=?').bind(job.id),
      env.DB.prepare("UPDATE narration_runs SET snapshot_json='{}',script_json=NULL,result_json=NULL,lock_id=NULL,lock_until=NULL WHERE job_id=?").bind(job.id),
      env.DB.prepare("UPDATE generation_runs SET input_json='{}',brand_json='{}',ip_hmac=NULL,turnstile_hash=NULL WHERE job_id=?").bind(job.id),
    ]);
    if(imported){
      await env.DB.prepare("UPDATE listing_imports SET status='deleting' WHERE agency_id=? AND id=?").bind(job.scope,imported.id).run();
      await removePrefix(env.MEDIA,`agencies/${job.scope}/imports/${imported.id}/`);
      await env.DB.prepare("DELETE FROM listing_imports WHERE agency_id=? AND id=? AND status='deleting'").bind(job.scope,imported.id).run();
    }
    await env.DB.prepare("UPDATE generation_runs SET retention='expired' WHERE job_id=? AND owner_agency_id IS NULL AND retention='expiring'").bind(job.id).run();
  }
}
async function removePrefix(bucket:R2Bucket,prefix:string) {
  let cursor:string|undefined;
  do {const page=await bucket.list({prefix,limit:1000,...(cursor?{cursor}:{})});
    if(page.objects.length)await bucket.delete(page.objects.map(object=>object.key));cursor=page.truncated?page.cursor:undefined;
  }while(cursor);
}
