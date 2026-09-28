import {EntityId, GeneratableListing, type NormalizedListing, type ImportErrorCode} from '@bienvu/contracts';
import type {Database} from './index';
export type ImportRow = {id: string; agencyId: string; sourceKind: 'url' | 'manual'; sourceUrl: string | null; input: string | null; inputHash: string | null; status: 'importing' | 'ready' | 'failed' | 'deleting';
  errorCode: ImportErrorCode | null; result: string | null; createdAt: string; expiresAt: string; leaseUntil: string};
const columns = `id,agency_id AS agencyId,source_kind AS sourceKind,nullif(source_url,'') AS sourceUrl,input_json AS input,input_hash AS inputHash,status,error_code AS errorCode,result_json AS result,
  created_at AS createdAt,expires_at AS expiresAt,lease_until AS leaseUntil`;
export class ImportStateFailure extends Error {constructor(readonly code: 'CONFLICT' | 'IMPORT_LIMIT' | 'NOT_FOUND') {super(code);}}
export async function findImport(db: Database, agencyId: string, id: string) {
  if (!EntityId.safeParse(id).success) return null;
  return db.prepare(`SELECT ${columns} FROM listing_imports WHERE agency_id=? AND id=?`).bind(agencyId, id).first<ImportRow>();
}
export async function beginImport(db: Database, agencyId: string, url: string, key: string, now = Date.now()) {
  return startImport(db, agencyId, url, key, null, null, now);
}
export async function beginManualImport(db: Database, agencyId: string, key: string, input: string, inputHash: string, now = Date.now()) {
  return startImport(db, agencyId, null, key, input, inputHash, now);
}
async function startImport(db: Database, agencyId: string, url: string | null, key: string, input: string | null, inputHash: string | null, now: number) {
  EntityId.parse(agencyId);
  if (!/^[a-zA-Z0-9_-]{16,128}$/.test(key)) throw new ImportStateFailure('CONFLICT');
  const previous = () => db.prepare(`SELECT ${columns} FROM listing_imports WHERE agency_id=? AND idempotency_key=?`).bind(agencyId, key).first<ImportRow>();
  const existing = await previous();
  const matches = (row: ImportRow) => row.sourceUrl === url && row.inputHash === inputHash && row.sourceKind === (url === null ? 'manual' : 'url');
  if (existing) {if (!matches(existing)) throw new ImportStateFailure('CONFLICT'); return {row: existing, fresh: false};}
  const id = crypto.randomUUID(), created = new Date(now).toISOString();
  try {
    // INSERT SELECT = un seul contrôle atomique sous concurrence, limites hors crédits vidéo.
    await db.prepare(`INSERT INTO listing_imports(id,agency_id,idempotency_key,source_url,source_kind,input_json,input_hash,status,created_at,lease_until,expires_at)
      SELECT ?,?,?,?,?,?,?,'importing',?,?,? WHERE
      (SELECT count(*) FROM listing_imports WHERE agency_id=?) < 30
      ON CONFLICT(agency_id,idempotency_key) DO NOTHING`)
      .bind(id, agencyId, key, url ?? '', url === null ? 'manual' : 'url', input, inputHash, created,
        new Date(now + (url === null ? 900_000 : 90_000)).toISOString(), new Date(now + 30 * 86400_000).toISOString(),
        agencyId).run();
  } catch (error) {throw new ImportStateFailure(String(error).includes('IMPORT_LIMIT') ? 'IMPORT_LIMIT' : 'CONFLICT');}
  const row = await previous();
  if (!row) throw new ImportStateFailure('IMPORT_LIMIT');
  if (!matches(row)) throw new ImportStateFailure('CONFLICT');
  return {row, fresh: row.id === id};
}
export async function journalImportPhoto(db: Database, agencyId: string, id: string, photo: NormalizedListing['photos'][number], now = Date.now()) {
  const row = await db.prepare(`INSERT INTO import_objects(id,agency_id,import_id,object_key,photo_json)
    SELECT ?,?,?,?,? WHERE EXISTS(SELECT 1 FROM listing_imports WHERE agency_id=? AND id=? AND status='importing' AND lease_until>?)
    RETURNING id`).bind(photo.id, agencyId, id, photo.objectKey, JSON.stringify(photo), agencyId, id, new Date(now).toISOString()).first();
  if (!row) throw new ImportStateFailure('CONFLICT');
}
export async function completeImport(db: Database, listing: NormalizedListing, diagnostics: unknown, now = Date.now()) {
  const result = GeneratableListing.parse(listing);
  const row = await db.prepare(`UPDATE listing_imports SET status='ready',result_json=?,diagnostics_json=?
    WHERE agency_id=? AND id=? AND status='importing' AND lease_until>? RETURNING id`)
    .bind(JSON.stringify(result), JSON.stringify(diagnostics), result.agencyId, result.id, new Date(now).toISOString()).first();
  if (!row) throw new ImportStateFailure('CONFLICT');
}
export async function failImport(db: Database, agencyId: string, id: string, code: ImportErrorCode, diagnostics: unknown) {
  await db.prepare(`UPDATE listing_imports SET status='failed',error_code=?,diagnostics_json=?
    WHERE agency_id=? AND id=? AND status='importing'`).bind(code, JSON.stringify(diagnostics), agencyId, id).run();
}
export async function listImports(db: Database, agencyId: string) {
  // JSON agrégé borné : compatible avec le port D1 sans étendre toute l'API SQL.
  const row = await db.prepare(`SELECT json_group_array(json_object('id',id,'sourceKind',source_kind,'sourceUrl',nullif(source_url,''),'status',status,'errorCode',error_code,'createdAt',created_at,'expiresAt',expires_at,
    'title',json_extract(result_json,'$.facts.title.value'),'transaction',json_extract(result_json,'$.transaction'))) AS items
    FROM (SELECT * FROM listing_imports WHERE agency_id=? AND status!='deleting' AND expires_at>? ORDER BY created_at DESC,id LIMIT 30)`)
    .bind(agencyId, new Date().toISOString()).first<{items: string}>();
  return JSON.parse(row?.items ?? '[]') as Array<Pick<ImportRow, 'id' | 'sourceKind' | 'sourceUrl' | 'status' | 'errorCode' | 'createdAt' | 'expiresAt'> & {title: string | null; transaction: 'sale' | 'rent' | null}>;
}

export async function markImportDeleting(db: Database, agencyId: string, id: string, now = Date.now(), explicit = false) {
  // 5 minutes après la fin du lease : laisse mourir une écriture R2 interrompue (timeout 60 s).
  const row = await db.prepare(`UPDATE listing_imports SET status='deleting' WHERE agency_id=? AND id=? AND lease_until<?
    AND (status IN ('importing','failed','deleting') OR expires_at<? OR ?=1)
    AND NOT EXISTS(SELECT 1 FROM jobs WHERE agency_id=? AND listing_id=?) RETURNING id`)
    .bind(agencyId, id, new Date(now - 300_000).toISOString(), new Date(now).toISOString(), explicit ? 1 : 0, agencyId, id).first();
  return Boolean(row);
}
export async function importObjectKeys(db: Database, agencyId: string, id: string) {
  const row = await db.prepare(`SELECT json_group_array(object_key) AS keys FROM import_objects WHERE agency_id=? AND import_id=?`).bind(agencyId, id).first<{keys: string}>();
  return JSON.parse(row?.keys ?? '[]') as string[];
}
export async function removeImport(db: Database, agencyId: string, id: string) {
  await db.prepare(`DELETE FROM listing_imports WHERE agency_id=? AND id=? AND status='deleting'`).bind(agencyId, id).run();
}
