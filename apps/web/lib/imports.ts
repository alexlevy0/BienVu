import {GeneratableListing, ImportFailure, type NormalizedListing} from '@bienvu/contracts';
import {beginImport, completeImport, failImport, findImport, importObjectKeys, ImportStateFailure,
  journalImportPhoto, markImportDeleting, removeImport, type Database} from '@bienvu/db';
import {importListing, publicUrl, type ImportTransport} from '@bienvu/importers';
import {RequestFailure} from './http';

// Ports réels D1/R2 en workerd, injectables en recette sans réseau extérieur.
type ImportBucket = Pick<R2Bucket, 'put' | 'get' | 'delete'>;
export async function createPrivateImport(env: {DB: Database; MEDIA: ImportBucket}, agencyId: string, url: string, key: string,
  transport: ImportTransport, signal?: AbortSignal, options: {mode?: 'local' | 'cloudflare'; beforeStart?: (id: string) => Promise<void>;
    browserHtml?: (url: string, signal: AbortSignal) => Promise<string>} = {}) {
  try {
    const {row, fresh} = await beginImport(env.DB, agencyId, publicUrl(url).href, key);
    if (!fresh) return row;
    try {
      await options.beforeStart?.(row.id);
      const {listing, diagnostics} = await importListing(url, {agencyId, importId: row.id}, {transport, browserHtml: options.browserHtml,
        store: async (photo, bytes, abort) => {
          abort.throwIfAborted();
          await journalImportPhoto(env.DB, agencyId, row.id, photo);
          await env.MEDIA.put(photo.objectKey, bytes, {httpMetadata: {contentType: photo.mime, cacheControl: 'private, no-store'},
            customMetadata: {importId: row.id, agencyId, sha256: photo.contentHash}});
          abort.throwIfAborted();
        }}, {signal, mode: options.mode});
      await completeImport(env.DB, listing, diagnostics);
    } catch (error) {
      const code = error instanceof ImportFailure ? error.code : 'SOURCE_UNAVAILABLE';
      await failImport(env.DB, agencyId, row.id, code,
        error && typeof error === 'object' && 'diagnostics' in error ? error.diagnostics : {stage: 'storage'});
      // Nettoyage immédiat des objets connus ; le journal reste pour réconcilier
      // une requête put dont l'issue serait incertaine. Aucune clé de job n'est touchée.
      try {for (const objectKey of await importObjectKeys(env.DB, agencyId, row.id)) await env.MEDIA.delete(objectKey);} catch { /* reprise par purgeImports */ }
      if (error instanceof RequestFailure) throw error;
    }
    return (await findImport(env.DB, agencyId, row.id))!;
  } catch (error) {
    if (error instanceof ImportStateFailure) throw new RequestFailure(error.code);
    if (error instanceof ImportFailure) throw new RequestFailure(error.code);
    throw error;
  }
}
export function importResult(row: Awaited<ReturnType<typeof findImport>>) {
  if (!row || row.status === 'deleting' || row.expiresAt <= new Date().toISOString()) throw new RequestFailure('NOT_FOUND');
  return {id: row.id, sourceKind: row.sourceKind, sourceUrl: row.sourceUrl, status: row.status, errorCode: row.errorCode, createdAt: row.createdAt,
    expiresAt: row.expiresAt, listing: row.result ? GeneratableListing.parse(JSON.parse(row.result)) : null};
}
export async function privateImportPhoto(env: {DB: Database; MEDIA: ImportBucket}, agencyId: string, id: string, photoId: string) {
  const row = await findImport(env.DB, agencyId, id);
  if (row?.status !== 'ready' || !row.result || row.expiresAt <= new Date().toISOString()) throw new RequestFailure('NOT_FOUND');
  const listing: NormalizedListing = GeneratableListing.parse(JSON.parse(row.result));
  const photo = listing.photos.find(p => p.id === photoId);
  if (!photo) throw new RequestFailure('NOT_FOUND');
  const object = await env.MEDIA.get(photo.objectKey);
  if (!object || object.size !== photo.sizeBytes || object.customMetadata?.sha256 !== photo.contentHash) throw new RequestFailure('NOT_FOUND');
  return new Response(object.body, {headers: {'Content-Type': photo.mime, 'Content-Length': String(photo.sizeBytes), 'Cache-Control': 'private, no-store'}});
}
export async function purgeImport(env: {DB: Database; MEDIA: ImportBucket}, agencyId: string, id: string, now = Date.now(), explicit = false) {
  if (!await markImportDeleting(env.DB, agencyId, id, now, explicit)) return false;
  const keys = await importObjectKeys(env.DB, agencyId, id);
  for (const key of keys) await env.MEDIA.delete(key);
  await removeImport(env.DB, agencyId, id);
  return true;
}
