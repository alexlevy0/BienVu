import {GeneratableListing, ManualListingInput, MANUAL_PHOTO_LIMITS, PhotoAsset, type NormalizedListing} from '@bienvu/contracts';
import {beginManualImport, completeImport, findImport, ImportStateFailure, type Database, type ImportRow} from '@bienvu/db';
import {RequestFailure} from './http';

type Env = {DB: Database; MEDIA: Pick<R2Bucket, 'head' | 'put'>};
export type PhotoNormalizer = (bytes: Uint8Array<ArrayBuffer>, mime: string, signal: AbortSignal) => Promise<{
  bytes: Uint8Array<ArrayBuffer>; width: number; height: number; mime: string;
}>;
export async function contentHash(bytes: Uint8Array<ArrayBuffer>) {
  return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)), n => n.toString(16).padStart(2, '0')).join('');
}
export function parseManualInput(value: unknown) {
  const parsed = ManualListingInput.safeParse(value);
  if (!parsed.success) {
    const fields: Record<string, string> = {};
    for (const issue of parsed.error.issues) {
      const name = String(issue.path[0] ?? 'form');
      fields[name] = issue.code === 'custom' ? issue.message : name === 'photos'
        ? 'Ajoutez 3 à 12 photos JPEG, PNG ou WebP, de 10 Mo maximum chacune.' : 'Vérifiez ce champ et ses limites.';
    }
    throw new RequestFailure('VALIDATION_ERROR', fields);
  }
  return parsed.data;
}
export async function createManualListing(env: Env, agencyId: string, key: string, value: unknown) {
  const input = parseManualInput(value), serialized = JSON.stringify(input);
  try {return (await beginManualImport(env.DB, agencyId, key, serialized, await contentHash(new TextEncoder().encode(serialized)))).row;}
  catch (error) {if (error instanceof ImportStateFailure) throw new RequestFailure(error.code); throw error;}
}
export async function manualDraft(db: Database, agencyId: string, id: string) {
  const row = await findImport(db, agencyId, id);
  if (!row || row.sourceKind !== 'manual' || !row.input || row.status === 'deleting' || row.expiresAt <= new Date().toISOString())
    throw new RequestFailure('NOT_FOUND');
  if (row.status !== 'ready' && (row.status !== 'importing' || row.leaseUntil <= new Date().toISOString())) throw new RequestFailure('CONFLICT');
  return {row, input: ManualListingInput.parse(JSON.parse(row.input))};
}
async function savedPhotos(db: Database, agencyId: string, id: string): Promise<NormalizedListing['photos']> {
  const result = await db.prepare(`SELECT json_group_array(json(photo_json)) AS photos FROM
    (SELECT photo_json FROM import_objects WHERE agency_id=? AND import_id=? ORDER BY json_extract(photo_json,'$.sourceOrder'))`)
    .bind(agencyId, id).first<{photos: string}>();
  return PhotoAsset.array().parse(JSON.parse(result?.photos ?? '[]'));
}
export async function uploadManualPhoto(env: Env, agencyId: string, id: string, index: number,
  bytes: Uint8Array<ArrayBuffer>, mime: string, normalize: PhotoNormalizer, signal: AbortSignal) {
  const {row, input} = await manualDraft(env.DB, agencyId, id);
  const expected = input.photos[index];
  if (!Number.isInteger(index) || index < 0 || !expected || bytes.length !== expected.size || mime !== expected.mime
    || await contentHash(bytes) !== expected.hash) throw new RequestFailure('VALIDATION_ERROR');
  if (bytes.length > MANUAL_PHOTO_LIMITS.fileBytes) throw new RequestFailure('PHOTO_TOO_LARGE');
  const saved = await savedPhotos(env.DB, agencyId, id), existing = saved.find(p => p.sourceOrder === index);
  if (existing) {
    const object = await env.MEDIA.head(existing.objectKey);
    if (object?.size === existing.sizeBytes && object.customMetadata?.sha256 === existing.contentHash) return existing;
  }
  if (row.status !== 'importing') throw new RequestFailure('CONFLICT');
  signal.throwIfAborted();
  const normalized = await normalize(bytes, mime, signal);
  if (normalized.mime !== 'image/jpeg' || normalized.width > 2048 || normalized.height > 2048
    || normalized.bytes.length > MANUAL_PHOTO_LIMITS.fileBytes || normalized.bytes[0] !== 255 || normalized.bytes[1] !== 216
    || normalized.bytes.at(-2) !== 255 || normalized.bytes.at(-1) !== 217) throw new RequestFailure('INVALID_PHOTO');
  const hash = await contentHash(normalized.bytes);
  if (saved.some(p => p.contentHash === hash && p.sourceOrder !== index)) throw new RequestFailure('DUPLICATE_PHOTO');
  const photo = PhotoAsset.parse({id: `${id}_${index}`, agencyId, listingId: id, sourceUrl: null,
    objectKey: `agencies/${agencyId}/imports/${id}/${hash}.jpg`, contentHash: hash,
    width: normalized.width, height: normalized.height, mime: 'image/jpeg', sizeBytes: normalized.bytes.length, sourceOrder: index});
  if (existing && JSON.stringify(existing) !== JSON.stringify(photo)) throw new RequestFailure('CONFLICT');
  signal.throwIfAborted();
  // Le même slot et les mêmes octets peuvent être rejoués après un put incertain.
  // Le journal précède R2 ; aucun fichier non journalisé ou URL cliente n'est accepté.
  try {
    await env.DB.prepare(`INSERT INTO import_objects(id,agency_id,import_id,object_key,photo_json)
      SELECT ?,?,?,?,? WHERE EXISTS(SELECT 1 FROM listing_imports WHERE agency_id=? AND id=? AND source_kind='manual' AND status='importing' AND lease_until>?)
      ON CONFLICT(id) DO NOTHING`).bind(photo.id, agencyId, id, photo.objectKey, JSON.stringify(photo), agencyId, id, new Date().toISOString()).run();
  } catch (error) {
    if (String(error).includes('UNIQUE')) throw new RequestFailure('DUPLICATE_PHOTO');
    throw new RequestFailure('CONFLICT');
  }
  const journal = (await savedPhotos(env.DB, agencyId, id)).find(p => p.id === photo.id);
  if (!journal || JSON.stringify(journal) !== JSON.stringify(photo)) throw new RequestFailure('CONFLICT');
  if (!await env.MEDIA.put(photo.objectKey, normalized.bytes, {httpMetadata: {contentType: 'image/jpeg', cacheControl: 'private, no-store'},
    customMetadata: {agencyId, importId: id, sha256: hash}})) throw new RequestFailure('INTERNAL_ERROR');
  return photo;
}
const provided = <T, U extends string>(value: T, unit: U, field: string) => ({status: 'user_provided' as const, value, unit,
  sourcePath: `manual.${field}`, rawEvidence: (typeof value === 'string' ? value : JSON.stringify(value)).slice(0, 500)});
const missing = <U extends string>(unit: U) => ({status: 'missing' as const, value: null, unit, sourcePath: null, rawEvidence: null});
export function manualListing(row: ImportRow, input: ManualListingInput, photos: NormalizedListing['photos']) {
  return GeneratableListing.parse({id: row.id, agencyId: row.agencyId, sourceKind: 'manual', sourceUrl: null, canonicalUrl: null,
    sourceHost: null, sourceListingId: null, fetchedAt: row.createdAt, adapterVersion: 'manual/1', transaction: input.transaction,
    description: input.description ? {text: input.description, sourcePath: 'manual.description', truncated: false} : null,
    facts: {title: provided(input.title, 'text', 'title'), propertyType: provided(input.propertyType, 'category', 'propertyType'),
      locality: provided(input.locality, 'text', 'locality'),
      price: input.priceCents === null ? missing('EUR_cent') : provided({amountCents: input.priceCents, currency: 'EUR',
        period: input.transaction === 'sale' ? 'total' : 'month', charges: input.transaction === 'sale' ? 'not_applicable' : input.charges}, 'EUR_cent', 'priceCents'),
      area: input.area === null ? missing('m2') : provided(input.area, 'm2', 'area'),
      rooms: input.rooms === null ? missing('rooms') : provided(input.rooms, 'rooms', 'rooms')}, photos, warnings: []});
}
export async function finishManualListing(env: Env, agencyId: string, id: string) {
  const {row, input} = await manualDraft(env.DB, agencyId, id);
  if (row.status === 'ready') return row;
  const photos = await savedPhotos(env.DB, agencyId, id);
  if (photos.length !== input.photos.length || photos.some((p, index) => p.sourceOrder !== index)) throw new RequestFailure('INSUFFICIENT_PHOTOS');
  for (const photo of photos) {
    const object = await env.MEDIA.head(photo.objectKey);
    if (!object || object.size !== photo.sizeBytes || object.customMetadata?.sha256 !== photo.contentHash) throw new RequestFailure('INSUFFICIENT_PHOTOS');
  }
  try {await completeImport(env.DB, manualListing(row, input, photos), {mode: 'manual', photos: photos.length});}
  catch (error) {
    const current = await findImport(env.DB, agencyId, id);
    if (current?.status === 'ready') return current;
    if (error instanceof ImportStateFailure) throw new RequestFailure(error.code);
    throw error;
  }
  return (await findImport(env.DB, agencyId, id))!;
}
