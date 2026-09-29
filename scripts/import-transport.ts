// Transport Node du pont local et du conteneur privé d'import. Jamais dans un Worker.
import {lookup} from 'node:dns/promises';
import {request} from 'node:https';
import sharp from 'sharp';
import {ImportFailure} from '../packages/contracts/src/index';
import {IMPORT_LIMITS, publicAddresses, scopedUrl, type ImportTransport, type Resource} from '../packages/importers/src/network';

type Reply = {status: number; headers: Record<string, string | string[] | undefined>; bytes: Uint8Array<ArrayBuffer>};
export type NetworkPorts = {
  resolve(host: string): Promise<{address: string; family: number}[]>;
  request(url: URL, address: {address: string; family: number}, limit: number, signal: AbortSignal): Promise<Reply>;
};
const realPorts: NetworkPorts = {
  resolve: host => lookup(host, {all: true, verbatim: true}),
  request: (url, address, limit, signal) => new Promise((resolve, reject) => {
    const req = request(url, {agent: false, method: 'GET', servername: url.hostname, rejectUnauthorized: true,
      maxHeaderSize: 16_384, signal, family: address.family,
      // Le nom TLS et le Host restent ceux de l'URL ; aucune seconde résolution.
      lookup: (_host, _options, callback) => callback(null, address.address, address.family),
      headers: {'Accept-Encoding': 'identity', 'Accept': '*/*', 'User-Agent': 'BienVu-Import/0.3'}}, res => {
      const status = res.statusCode ?? 502;
      if (status < 200 || status >= 300) {
        resolve({status, headers: res.headers, bytes: new Uint8Array()}); res.destroy(); return;
      }
      if (Number(res.headers['content-length']) > limit || res.headers['content-encoding'] && res.headers['content-encoding'] !== 'identity') {
        res.destroy(); reject(new ImportFailure('SOURCE_UNAVAILABLE', 'Réponse trop volumineuse ou encodage non pris en charge.')); return;
      }
      let size = 0; const parts: Buffer[] = [];
      res.on('data', (chunk: Buffer) => {
        size += chunk.length;
        if (size > limit) {res.destroy(); reject(new ImportFailure('SOURCE_UNAVAILABLE', 'Plafond du flux dépassé.'));}
        else parts.push(chunk);
      });
      res.on('end', () => resolve({status, headers: res.headers, bytes: new Uint8Array(Buffer.concat(parts))}));
      res.on('error', reject);
    });
    req.on('error', reject); req.end();
  }),
};

export async function normalizePhoto(bytes: Uint8Array, mime: string) {
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(mime) || bytes.length > IMPORT_LIMITS.imageBytes)
    throw new ImportFailure('INSUFFICIENT_PHOTOS', 'Format ou poids de photo refusé.');
  try {
    const input = sharp(bytes, {limitInputPixels: 16_000_000, failOn: 'warning', animated: false}).timeout({seconds: 12});
    const meta = await input.metadata();
    const formats: Record<string, string> = {jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp'};
    const format = formats[meta.format ?? ''];
    if (format !== mime || !meta.width || !meta.height || meta.width < 640 || meta.height < 360 || (meta.pages ?? 1) > 1)
      throw new Error('INVALID_IMAGE');
    // Décodage complet, orientation puis retrait des métadonnées/charges actives.
    const {data, info} = await input.rotate().resize({width: 2048, height: 2048, fit: 'inside', withoutEnlargement: true})
      .flatten({background: '#fff'}).jpeg({quality: 88}).toBuffer({resolveWithObject: true});
    if (info.width < 640 || info.height < 360) throw new Error('SMALL_IMAGE');
    return {bytes: new Uint8Array(data), width: info.width, height: info.height, mime: 'image/jpeg'};
  } catch {throw new ImportFailure('INSUFFICIENT_PHOTOS', 'Image corrompue, trop petite ou non décodable.');}
}

export function nodeImportTransport(ports: NetworkPorts = realPorts): ImportTransport {
  return {async load(value, kind, hosts, signal, maxBytes): Promise<Resource> {
    const deadline = AbortSignal.any([signal, AbortSignal.timeout(12_000)]);
    const limit = Math.min(kind === 'image' ? IMPORT_LIMITS.imageBytes : IMPORT_LIMITS.htmlBytes, maxBytes ?? IMPORT_LIMITS.totalBytes);
    if (!Number.isSafeInteger(limit) || limit <= 0) throw new ImportFailure('SOURCE_UNAVAILABLE', 'Plafond de téléchargement invalide.');
    let url = scopedUrl(value, hosts);
    try {
      for (let hop = 0; hop <= IMPORT_LIMITS.redirects; hop++) {
        deadline.throwIfAborted();
        const addresses = publicAddresses(await Promise.race([ports.resolve(url.hostname), new Promise<never>((_, reject) => {
          if (deadline.aborted) reject(deadline.reason);
          else deadline.addEventListener('abort', () => reject(deadline.reason), {once: true});
        })]));
        deadline.throwIfAborted();
        const reply = await ports.request(url, addresses[0], limit, deadline);
        if (reply.bytes.length > limit) throw new ImportFailure('SOURCE_UNAVAILABLE', 'Réponse hors limites.');
        if ([301, 302, 303, 307, 308].includes(reply.status)) {
          const location = reply.headers.location;
          if (typeof location !== 'string' || hop === IMPORT_LIMITS.redirects) throw new ImportFailure('UNSAFE_URL', 'Redirection non vérifiable.');
          url = scopedUrl(new URL(location, url).href, hosts); continue;
        }
        if ([401, 403, 429].includes(reply.status)) throw new ImportFailure('SOURCE_BLOCKED', 'Accès refusé par la source.',
          reply.status === 401 ? 'login_required' : reply.status === 429 ? 'rate_limited' : 'access_denied');
        if ([404, 410].includes(reply.status)) throw new ImportFailure('SOURCE_UNAVAILABLE', 'Annonce introuvable.', 'not_found');
        if (reply.status < 200 || reply.status >= 300) throw new ImportFailure('SOURCE_UNAVAILABLE', 'La source est indisponible.');
        const mime = String(reply.headers['content-type'] ?? '').split(';')[0].toLowerCase().trim();
        if (kind !== 'image') {
          if (kind === 'page' && mime !== 'text/html') throw new ImportFailure('NOT_A_LISTING', 'La source ne fournit pas de page HTML.');
          return {url: url.href, bytes: reply.bytes, mime, sourceBytes: reply.bytes.length};
        }
        return {url: url.href, sourceBytes: reply.bytes.length, ...await normalizePhoto(reply.bytes, mime)};
      }
      throw new ImportFailure('UNSAFE_URL', 'Trop de redirections.');
    } catch (error) {
      if (deadline.aborted) throw new ImportFailure('IMPORT_TIMEOUT', 'Délai de récupération dépassé.');
      if (error instanceof ImportFailure) throw error;
      throw new ImportFailure('SOURCE_UNAVAILABLE', 'Connexion sécurisée à la source impossible.');
    }
  }};
}
