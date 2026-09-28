import {localSql, deleteLocalObject, sqlQuote} from './local-import-db';
const now = new Date().toISOString(), threshold = new Date(Date.now() - 300_000).toISOString();
const rows = await localSql<{id: string; agency_id: string}>(`SELECT id,agency_id FROM listing_imports WHERE lease_until<${sqlQuote(threshold)}
  AND (status IN ('importing','failed','deleting') OR expires_at<${sqlQuote(now)}) LIMIT 30;`);
let removed = 0;
for (const row of rows) {
  const where = `agency_id=${sqlQuote(row.agency_id)} AND id=${sqlQuote(row.id)}`;
  const marked = await localSql(`UPDATE listing_imports SET status='deleting' WHERE ${where} AND lease_until<${sqlQuote(threshold)}
    AND NOT EXISTS(SELECT 1 FROM jobs WHERE agency_id=${sqlQuote(row.agency_id)} AND listing_id=${sqlQuote(row.id)}) RETURNING id;`);
  if (!marked.length) continue;
  for (const asset of await localSql<{object_key: string}>(`SELECT object_key FROM import_objects WHERE agency_id=${sqlQuote(row.agency_id)} AND import_id=${sqlQuote(row.id)};`))
    await deleteLocalObject(asset.object_key);
  await localSql(`DELETE FROM listing_imports WHERE ${where} AND status='deleting';`); removed++;
}
console.log(`${removed} import(s) expiré(s) ou abandonné(s) supprimé(s) en local. Les références de jobs sont conservées.`);
