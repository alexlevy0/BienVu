import {importObjectKeys, markImportDeleting, removeImport, type Database} from '@bienvu/db';
export async function purgeHostedImports(env: {DB: Database; MEDIA: Pick<R2Bucket, 'delete'>}, now = Date.now()) {
  const row = await env.DB.prepare(`SELECT json_group_array(json_object('id',id,'agencyId',agency_id)) AS items FROM
    (SELECT id,agency_id FROM listing_imports WHERE lease_until<? AND (status IN ('importing','failed','deleting') OR expires_at<?)
    ORDER BY lease_until LIMIT 30)`).bind(new Date(now - 300_000).toISOString(), new Date(now).toISOString()).first<{items: string}>();
  const candidates = JSON.parse(row?.items ?? '[]') as Array<{id: string; agencyId: string}>;
  let removed = 0;
  for (const item of candidates) {
    if (!await markImportDeleting(env.DB, item.agencyId, item.id, now)) continue;
    for (const key of await importObjectKeys(env.DB, item.agencyId, item.id)) {
      if (!key.startsWith(`agencies/${item.agencyId}/imports/${item.id}/`)) throw new Error('IMPORT_KEY_SCOPE');
      await env.MEDIA.delete(key);
    }
    await removeImport(env.DB, item.agencyId, item.id); removed++;
  }
  return {examined: candidates.length, removed};
}
