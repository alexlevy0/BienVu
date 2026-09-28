import {ImportFailure} from '@bienvu/contracts';
import {IMPORT_LIMITS, readLimited, type ImportTransport} from '@bienvu/importers';
import {RequestFailure} from './http';
import type {PhotoNormalizer} from './manual-listings';

type ImportEnv = {PROBE_MODE: string; IMPORT_MODE?: string; LOCAL_IMPORT_TOKEN?: string};
function localToken(request: Request, env: ImportEnv) {
  const u = new URL(request.url);
  if (env.PROBE_MODE !== 'local' || env.IMPORT_MODE !== 'local' || u.protocol !== 'http:'
    || !['localhost', '127.0.0.1'].includes(u.hostname) || !env.LOCAL_IMPORT_TOKEN || env.LOCAL_IMPORT_TOKEN.length < 32)
    throw new RequestFailure('IMPORTS_UNAVAILABLE');
  return env.LOCAL_IMPORT_TOKEN;
}
export function localImportTransport(request: Request, env: ImportEnv): ImportTransport {
  const token = localToken(request, env);
  return {async load(url, kind, hosts, signal, maxBytes) {
    let response: Response;
    try {
      response = await fetch('http://127.0.0.1:8791/resource', {method: 'POST', redirect: 'manual', signal,
        headers: {'Content-Type': 'application/json', Authorization: `Bearer ${token}`}, body: JSON.stringify({url, kind, hosts, maxBytes})});
    } catch {throw new ImportFailure(signal.aborted ? 'IMPORT_TIMEOUT' : 'SOURCE_UNAVAILABLE', 'Transport local indisponible.');}
    if (!response.ok) {
      const code = response.headers.get('X-Import-Error'); await response.body?.cancel();
      throw new ImportFailure(code === 'UNSAFE_URL' || code === 'SOURCE_BLOCKED' || code === 'IMPORT_TIMEOUT'
        || code === 'INSUFFICIENT_PHOTOS' || code === 'NOT_A_LISTING' ? code : 'SOURCE_UNAVAILABLE', 'Ressource non importable.');
    }
    return {url: response.headers.get('X-Source-Url') ?? url, mime: response.headers.get('Content-Type') ?? '',
      sourceBytes: Number(response.headers.get('X-Source-Bytes')), width: Number(response.headers.get('X-Image-Width')) || undefined,
      height: Number(response.headers.get('X-Image-Height')) || undefined,
      bytes: await readLimited(response, kind === 'image' ? IMPORT_LIMITS.imageBytes : IMPORT_LIMITS.htmlBytes)};
  }};
}
export function localPhotoNormalizer(request: Request, env: ImportEnv): PhotoNormalizer {
  const token = localToken(request, env);
  return async (bytes, mime, signal) => {
    const response = await fetch('http://127.0.0.1:8791/normalize-photo', {method: 'POST', redirect: 'manual',
      signal: AbortSignal.any([signal, AbortSignal.timeout(20_000)]), headers: {'Content-Type': mime, Authorization: `Bearer ${token}`}, body: bytes});
    if (!response.ok) {await response.body?.cancel(); throw new RequestFailure(response.status === 429 ? 'RATE_LIMITED' : 'INVALID_PHOTO');}
    return {bytes: await readLimited(response, IMPORT_LIMITS.imageBytes), mime: response.headers.get('Content-Type') ?? '',
      width: Number(response.headers.get('X-Image-Width')), height: Number(response.headers.get('X-Image-Height'))};
  };
}
