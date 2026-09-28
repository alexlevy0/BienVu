import {EntityId, GeneratableListing, ImportFailure, type NormalizedListing} from '@bienvu/contracts';
import {extractListingHtml} from './listing';
import {IMPORT_LIMITS, publicUrl, scopedUrl, sourcePolicy, type ImportTransport} from './network';

export type ImportDiagnostics = {durationMs: number; resources: number; sourceBytes: number; storedBytes: number;
  rejected: Array<{order: number; reason: string}>; duplicatePhotos: number; mode: 'local' | 'cloudflare'; browserUsed: boolean};
export async function abortable<T>(promise: Promise<T>, signal: AbortSignal): Promise<T> {
  signal.throwIfAborted();
  let onAbort: () => void = () => {};
  try {return await Promise.race([promise, new Promise<never>((_, reject) => {
    onAbort = () => reject(signal.reason); signal.addEventListener('abort', onAbort, {once: true});
  })]);} finally {signal.removeEventListener('abort', onAbort);}
}
export async function importListing(url: string, context: {agencyId: string; importId: string}, ports: {
  transport: ImportTransport;
  store(photo: NormalizedListing['photos'][number], bytes: Uint8Array<ArrayBuffer>, signal: AbortSignal): Promise<void>;
  browserHtml?: (url: string, signal: AbortSignal) => Promise<string>;
}, options: {signal?: AbortSignal; maxPhotos?: number; mode?: 'local' | 'cloudflare'} = {}) {
  const start = Date.now(), timeout = AbortSignal.timeout(IMPORT_LIMITS.durationMs);
  const signal = options.signal ? AbortSignal.any([options.signal, timeout]) : timeout;
  const agencyId = EntityId.parse(context.agencyId), id = EntityId.parse(context.importId), source = publicUrl(url).href;
  const policy = sourcePolicy(source);
  const diagnostics: ImportDiagnostics = {durationMs: 0, resources: 0, sourceBytes: 0, storedBytes: 0, rejected: [], duplicatePhotos: 0, mode: options.mode ?? 'local', browserUsed: false};
  // Une récupération échouée garde sa réservation : ses octets ne sont pas
  // toujours mesurables (flux interrompu ou image indécodable).
  let byteBudgetUsed = 0;
  const maxPhotos = Math.min(IMPORT_LIMITS.photos, Math.max(3, options.maxPhotos ?? IMPORT_LIMITS.photos));
  const load = async (value: string, kind: 'page' | 'image') => {
    signal.throwIfAborted();
    if (++diagnostics.resources > IMPORT_LIMITS.requests) throw new ImportFailure('IMPORT_TIMEOUT', 'Plafond de requêtes atteint.');
    const hosts = kind === 'page' ? policy.pageHosts : policy.imageHosts;
    scopedUrl(value, hosts);
    const limit = Math.min(kind === 'page' ? IMPORT_LIMITS.htmlBytes : IMPORT_LIMITS.imageBytes, IMPORT_LIMITS.totalBytes - byteBudgetUsed);
    if (limit <= 0) throw new ImportFailure('SOURCE_UNAVAILABLE', 'Plafond total de médias atteint.');
    byteBudgetUsed += limit;
    const resource = await abortable(ports.transport.load(value, kind, hosts, signal, limit), signal);
    scopedUrl(resource.url, hosts); signal.throwIfAborted();
    if (!Number.isInteger(resource.sourceBytes) || resource.sourceBytes < 0 || resource.sourceBytes > limit)
      throw new ImportFailure('SOURCE_UNAVAILABLE', 'Réponse hors limites.');
    byteBudgetUsed -= limit - resource.sourceBytes;
    diagnostics.sourceBytes += resource.sourceBytes;
    if (diagnostics.sourceBytes > IMPORT_LIMITS.totalBytes) throw new ImportFailure('SOURCE_UNAVAILABLE', 'Plafond total de médias atteint.');
    return resource;
  };
  try {
    const page = await load(source, 'page');
    let extracted;
    try {extracted = extractListingHtml(new TextDecoder('utf-8', {fatal: true}).decode(page.bytes), page.url);} catch (error) {
      if (!(error instanceof ImportFailure) || error.code !== 'NOT_A_LISTING' || !ports.browserHtml) throw error;
      diagnostics.browserUsed = true;
      extracted = extractListingHtml(await abortable(ports.browserHtml(page.url, signal), signal), page.url);
    }
    // Validation de TOUTE la galerie avant récupération ; une URL privée ne passe
    // pas simplement en warning parce que trois autres images fonctionnent.
    for (const value of extracted.photoUrls) scopedUrl(value, policy.imageHosts);
    const photos: NormalizedListing['photos'] = [], hashes = new Set<string>();
    for (const [order, candidate] of extracted.photoUrls.entries()) {
      if (photos.length >= maxPhotos) break;
      if (diagnostics.resources >= IMPORT_LIMITS.requests) break;
      if (byteBudgetUsed >= IMPORT_LIMITS.totalBytes) {extracted.warnings.push('Galerie limitée au plafond de téléchargement de cet import.'); break;}
      signal.throwIfAborted();
      let resource;
      try {resource = await load(candidate, 'image');} catch (error) {
        if (signal.aborted || !(error instanceof ImportFailure) || ['UNSAFE_URL', 'IMPORT_TIMEOUT'].includes(error.code)) throw error;
        diagnostics.rejected.push({order, reason: error.code}); continue;
      }
      if (resource.mime !== 'image/jpeg' || !resource.width || !resource.height || resource.width < 640 || resource.height < 360
        || resource.width > 2048 || resource.height > 2048 || resource.bytes.length > IMPORT_LIMITS.imageBytes || resource.bytes.length < 4
        || resource.bytes[0] !== 255 || resource.bytes[1] !== 216 || resource.bytes.at(-2) !== 255 || resource.bytes.at(-1) !== 217) {
        diagnostics.rejected.push({order, reason: 'INVALID_PHOTO'}); continue;
      }
      const digest = await crypto.subtle.digest('SHA-256', resource.bytes);
      const hash = Array.from(new Uint8Array(digest), n => n.toString(16).padStart(2, '0')).join('');
      if (hashes.has(hash)) {diagnostics.duplicatePhotos++; continue;}
      hashes.add(hash);
      const photo = {id: crypto.randomUUID(), agencyId, listingId: id, sourceUrl: candidate,
        objectKey: `agencies/${agencyId}/imports/${id}/${hash}.jpg`, contentHash: hash,
        width: resource.width, height: resource.height, mime: 'image/jpeg' as const, sizeBytes: resource.bytes.length, sourceOrder: photos.length};
      await abortable(ports.store(photo, resource.bytes, signal), signal);
      signal.throwIfAborted(); photos.push(photo); diagnostics.storedBytes += resource.bytes.length;
    }
    if (photos.length < 3) throw new ImportFailure('INSUFFICIENT_PHOTOS', 'Moins de trois photos distinctes et décodées.');
    const {photoUrls: _sourceCandidates, ...data} = extracted;
    const listing = GeneratableListing.parse({...data, id, agencyId, sourceUrl: source, sourceHost: new URL(source).hostname,
      fetchedAt: new Date().toISOString(), photos});
    diagnostics.durationMs = Date.now() - start;
    return {listing, diagnostics};
  } catch (error) {
    diagnostics.durationMs = Date.now() - start;
    const failure = signal.aborted ? new ImportFailure('IMPORT_TIMEOUT', 'Temps maximal d’import dépassé.')
      : error instanceof ImportFailure ? error : new ImportFailure('INCOMPLETE_LISTING', 'Les données ne respectent pas le contrat d’import.');
    throw Object.assign(failure, {diagnostics});
  }
}
