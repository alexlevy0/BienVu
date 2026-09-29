import {ImportFailure, importFailureReason} from '@bienvu/contracts';
import {IMPORT_LIMITS, readLimited, type ImportTransport} from '@bienvu/importers';
import {RequestFailure} from './http';
import type {PhotoNormalizer} from './manual-listings';
import {reserveHostedImport, ImportStateFailure, type Database} from '@bienvu/db';

type ImportEnv = {PROBE_MODE: string; IMPORT_MODE?: string; LOCAL_IMPORT_TOKEN?: string};
type HostedEnv = ImportEnv & {DB: Database; BETTER_AUTH_URL: string; IMPORT_SERVICE?: Fetcher; IMPORT_TOKEN?: string};
export function assertImportMode(request: Request, env: HostedEnv) {
  if (env.IMPORT_MODE === 'local') {localToken(request, env); return 'local' as const;}
  if (env.IMPORT_MODE === 'cloudflare' && env.PROBE_MODE === 'remote' && new URL(request.url).origin === env.BETTER_AUTH_URL
    && env.BETTER_AUTH_URL.startsWith('https://') && env.IMPORT_SERVICE && env.IMPORT_TOKEN && env.IMPORT_TOKEN.length >= 32) return 'cloudflare' as const;
  throw new RequestFailure('IMPORTS_UNAVAILABLE');
}
export async function reserveCloudflareImport(env: HostedEnv, agencyId: string, id: string) {
  try {await reserveHostedImport(env.DB, agencyId, id);} catch (error) {
    if (error instanceof ImportStateFailure) throw new RequestFailure(error.code); throw error;
  }
}
async function hostedCall(env: HostedEnv, agencyId: string, id: string, path: string, body: BodyInit, mime: string, signal: AbortSignal) {
  const response = await env.IMPORT_SERVICE!.fetch(new Request(`https://import.internal${path}`, {method: 'POST', body,
    signal: AbortSignal.any([signal, AbortSignal.timeout(58_000)]), headers: {'Content-Type': mime,
      Authorization: `Bearer ${env.IMPORT_TOKEN}`, 'X-Agency-ID': agencyId, 'X-Import-ID': id}}));
  if (!response.ok) {
    const code = response.headers.get('X-Import-Error'); await response.body?.cancel();
    if (response.status === 429) throw new RequestFailure('IMPORT_LIMIT');
    throw new ImportFailure(code === 'UNSAFE_URL' || code === 'SOURCE_BLOCKED' || code === 'IMPORT_TIMEOUT'
      || code === 'INSUFFICIENT_PHOTOS' || code === 'NOT_A_LISTING' ? code : 'SOURCE_UNAVAILABLE', 'Import hébergé indisponible.', importFailureReason(response.headers.get('X-Import-Reason')));
  }
  return response;
}
export function importPorts(request: Request, env: HostedEnv, agencyId: string) {
  const mode = assertImportMode(request, env);
  if (mode === 'local') return {transport: localImportTransport(request, env), mode};
  let id = '';
  const transport: ImportTransport = {async load(url, kind, _hosts, signal, maxBytes) {
    const response = await hostedCall(env, agencyId, id, '/resource', JSON.stringify({url, kind, maxBytes}), 'application/json', signal);
    return {url: response.headers.get('X-Source-Url') ?? url, mime: response.headers.get('Content-Type') ?? '',
      sourceBytes: Number(response.headers.get('X-Source-Bytes')), width: Number(response.headers.get('X-Image-Width')) || undefined,
      height: Number(response.headers.get('X-Image-Height')) || undefined,
      bytes: await readLimited(response, kind === 'image' ? IMPORT_LIMITS.imageBytes : IMPORT_LIMITS.htmlBytes)};
  }};
  return {transport, mode, beforeStart: async (importId: string) => {id = importId; await reserveCloudflareImport(env, agencyId, id);},
    browserHtml: async (_url: string, signal: AbortSignal) => new TextDecoder('utf-8', {fatal: true}).decode(
      await readLimited(await hostedCall(env, agencyId, id, '/browser', '{}', 'application/json', signal), IMPORT_LIMITS.htmlBytes))};
}
export function photoNormalizer(request: Request, env: HostedEnv, agencyId: string, id: string): PhotoNormalizer {
  if (assertImportMode(request, env) === 'local') return localPhotoNormalizer(request, env);
  return async (bytes, mime, signal) => {
    try {
      const response = await hostedCall(env, agencyId, id, '/normalize-photo', bytes, mime, signal);
      return {bytes: await readLimited(response, IMPORT_LIMITS.imageBytes), mime: response.headers.get('Content-Type') ?? '',
        width: Number(response.headers.get('X-Image-Width')), height: Number(response.headers.get('X-Image-Height'))};
    } catch (error) {if (error instanceof RequestFailure) throw error; throw new RequestFailure('INVALID_PHOTO');}
  };
}
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
        || code === 'INSUFFICIENT_PHOTOS' || code === 'NOT_A_LISTING' ? code : 'SOURCE_UNAVAILABLE', 'Ressource non importable.', importFailureReason(response.headers.get('X-Import-Reason')));
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
