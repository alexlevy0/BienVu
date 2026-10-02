import {EntityId, Timestamp, GeneratableListing, type NormalizedListing, type ImportErrorCode} from '@bienvu/contracts';
import type {Database} from './index';
export type ImportRow = {id: string; agencyId: string; sourceKind: 'url' | 'manual'; sourceUrl: string | null; input: string | null; inputHash: string | null; status: 'importing' | 'ready' | 'failed' | 'deleting';
  draftPending:number; draftData:string|null; draftVersion:number|null; draftPhotos:string;
  errorCode: ImportErrorCode | null; result: string | null; createdAt: string; expiresAt: string; leaseUntil: string};
export type ImportSummary={id:string;sourceKind:'url'|'manual';sourceUrl:string|null;status:'importing'|'needs_input'|'ready'|'failed';
  errorCode:ImportErrorCode|null;createdAt:string;expiresAt:string;title:string|null;locality:string|null;
  transaction:'sale'|'rent'|null;previewPhotoId:string|null};
const columns = `id,agency_id AS agencyId,source_kind AS sourceKind,nullif(source_url,'') AS sourceUrl,input_json AS input,input_hash AS inputHash,status,error_code AS errorCode,result_json AS result,
  draft_pending AS draftPending,(SELECT data_json FROM creation_drafts WHERE id=listing_imports.id) AS draftData,
  (SELECT version FROM creation_drafts WHERE id=listing_imports.id) AS draftVersion,
  (SELECT json_group_array(json(photo_json)) FROM import_objects WHERE import_id=listing_imports.id AND agency_id=listing_imports.agency_id) AS draftPhotos,
  created_at AS createdAt,expires_at AS expiresAt,lease_until AS leaseUntil`;
export class ImportStateFailure extends Error {constructor(readonly code: 'CONFLICT' | 'IMPORT_LIMIT' | 'NOT_FOUND' | 'VALIDATION_ERROR') {super(code);}}
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
  return (await listImportPage(db,agencyId)).imports;
}
export async function listImportPage(db:Database,agencyId:string,cursor?:string,draftsOnly=false){
  let time='9999',id='~';
  if(cursor){try{if(cursor.length>512)throw 0;const parts=JSON.parse(atob(cursor));
    if(!Array.isArray(parts)||parts.length!==2)throw 0;
    time=Timestamp.parse(parts[0]);id=EntityId.parse(parts[1]);
  }catch{throw new ImportStateFailure('VALIDATION_ERROR');}}
  const draftFilter=draftsOnly?" AND status='importing' AND draft_pending=1":'';
  // JSON agrégé borné : compatible avec le port D1 sans étendre toute l'API SQL.
  const row = await db.prepare(`SELECT json_group_array(json_object('id',i.id,'sourceKind',i.source_kind,'sourceUrl',nullif(i.source_url,''),
    'status',iif(i.draft_pending=1 AND i.status='importing','needs_input',i.status),'errorCode',i.error_code,'createdAt',i.created_at,'expiresAt',i.expires_at,
    'title',coalesce(json_extract(i.result_json,'$.facts.title.value'),json_extract((SELECT data_json FROM creation_drafts WHERE id=i.id),'$.fields.title')),
    'locality',coalesce(json_extract(i.result_json,'$.facts.locality.value'),json_extract((SELECT data_json FROM creation_drafts WHERE id=i.id),'$.fields.locality')),
    'transaction',coalesce(json_extract(i.result_json,'$.transaction'),json_extract((SELECT data_json FROM creation_drafts WHERE id=i.id),'$.fields.transaction')),
    'previewPhotoId',(SELECT o.id FROM import_objects o WHERE o.import_id=i.id AND o.agency_id=i.agency_id
      ORDER BY json_extract(o.photo_json,'$.sourceOrder') LIMIT 1))) AS items
    FROM (SELECT * FROM listing_imports WHERE agency_id=? AND status!='deleting' AND expires_at>?${draftFilter}
      AND (created_at<? OR (created_at=? AND id<?)) ORDER BY created_at DESC,id DESC LIMIT 31) AS i`)
    .bind(agencyId,new Date().toISOString(),time,time,id).first<{items:string}>();
  const rows=JSON.parse(row?.items??'[]') as ImportSummary[],imports=rows.slice(0,30),last=imports.at(-1);
  return {imports,nextCursor:rows.length>30&&last?btoa(JSON.stringify([last.createdAt,last.id])):null};
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
  const row = await db.prepare(`SELECT json_group_array(object_key) AS keys FROM (
    SELECT object_key FROM import_objects WHERE agency_id=? AND import_id=?
    UNION ALL SELECT object_key FROM editor_music_assets WHERE agency_id=? AND import_id=?
    UNION ALL SELECT json_extract(a.value,'$.objectKey') FROM editor_voice_sources v,json_each(v.source_json,'$.audio') a
      WHERE v.agency_id=? AND v.import_id=?)`).bind(agencyId,id,agencyId,id,agencyId,id).first<{keys: string}>();
  return JSON.parse(row?.keys ?? '[]') as string[];
}
export async function removeImport(db: Database, agencyId: string, id: string) {
  await db.prepare(`DELETE FROM listing_imports WHERE agency_id=? AND id=? AND status='deleting'`).bind(agencyId, id).run();
}
