import {Container} from '@cloudflare/containers';
import {EntityId, ImportFailure} from '@bienvu/contracts';
import {findImport, claimHostedResource, settleHostedResource, claimHostedBrowser, releaseHostedBrowser, ImportStateFailure} from '@bienvu/db';
import {IMPORT_LIMITS, readLimited, scopedUrl, sourcePolicy, type ImportTransport} from '@bienvu/importers';
import {authorized, json, smallJson} from './auth';
import {guardedBrowserHtml} from './import-browser';
import {purgeHostedImports} from './import-cleanup';
import {importProbe, importFixture} from './import-probes';

type Env = ImportEnv & {IMPORT_TOKEN?: string; PROBE_TOKEN?: string; IMPORT_PROBES_ENABLED?: string};
// Un seul petit conteneur, deux ressources au maximum ; aucune logique vidéo.
export class ImportTransportContainer extends Container<Env> {
  defaultPort = 8080;
  sleepAfter = '30s';
  enableInternet = true;
  envVars = {IMPORT_TOKEN: this.env.IMPORT_TOKEN ?? ''};
  override async onStart() {await this.ctx.storage.put('lifecycle', {startedAt: Date.now(), stoppedAt: null, instanceType: 'basic'});}
  override async onStop() {
    const last = await this.ctx.storage.get<{startedAt: number}>('lifecycle');
    if (last) {const stoppedAt = Date.now(), uptimeSeconds = (stoppedAt - last.startedAt) / 1000;
      await this.ctx.storage.put('lifecycle', {...last, stoppedAt, uptimeSeconds, instanceType: 'basic',
        grossComputeUsdUpperEstimate: uptimeSeconds * (0.25 * 0.000020 + 0.0000025 + 4 * 0.00000007), actualBilledEur: null});}
  }
  async status() {return {container: await this.getState(), lifecycle: await this.ctx.storage.get('lifecycle') ?? null};}
  async halt() {await this.stop(); return this.status();}
}

async function ownerImport(request: Request, env: Env) {
  const agencyId = EntityId.parse(request.headers.get('X-Agency-ID')), importId = EntityId.parse(request.headers.get('X-Import-ID'));
  const row = await findImport(env.DB, agencyId, importId);
  if (!row || row.status !== 'importing' || row.leaseUntil <= new Date().toISOString()) throw new ImportStateFailure('NOT_FOUND');
  return row;
}
function cloudTransport(env: Env, row: {id: string; agencyId: string; sourceUrl: string | null}): ImportTransport {
  return {async load(value, kind, _hosts, signal, maxBytes) {
    if (!row.sourceUrl) throw new ImportFailure('UNSAFE_URL', 'SOURCE_REQUIRED');
    const policy = sourcePolicy(row.sourceUrl), hosts = kind === 'image' ? policy.imageHosts : policy.pageHosts;
    scopedUrl(value, hosts);
    const limit = Math.min(kind === 'image' ? IMPORT_LIMITS.imageBytes : IMPORT_LIMITS.htmlBytes, maxBytes ?? IMPORT_LIMITS.htmlBytes);
    await claimHostedResource(env.DB, row.agencyId, row.id, limit);
    const response = await env.IMPORT_CONTAINER.getByName('imports-single-slot').fetch(new Request('http://container/resource', {
      method: 'POST', signal, headers: {'Content-Type': 'application/json', Authorization: `Bearer ${env.IMPORT_TOKEN}`},
      body: JSON.stringify({url: value, kind, hosts, maxBytes: limit})}));
    if (!response.ok) {
      const code = response.headers.get('X-Import-Error'); await response.body?.cancel();
      throw new ImportFailure(code === 'UNSAFE_URL' || code === 'SOURCE_BLOCKED' || code === 'IMPORT_TIMEOUT'
        || code === 'INSUFFICIENT_PHOTOS' || code === 'NOT_A_LISTING' ? code : 'SOURCE_UNAVAILABLE', 'RESOURCE_REFUSED');
    }
    const sourceBytes = Number(response.headers.get('X-Source-Bytes'));
    const bytes = await readLimited(response, kind === 'image' ? IMPORT_LIMITS.imageBytes : IMPORT_LIMITS.htmlBytes);
    await settleHostedResource(env.DB, row.id, limit, sourceBytes);
    const url = response.headers.get('X-Source-Url') ?? value; scopedUrl(url, hosts);
    return {url, bytes, sourceBytes, mime: response.headers.get('Content-Type') ?? '',
      width: Number(response.headers.get('X-Image-Width')) || undefined, height: Number(response.headers.get('X-Image-Height')) || undefined};
  }};
}
export default {
  async fetch(request, env, ctx) {
    const path = new URL(request.url).pathname;
    if (path.startsWith('/fixtures/')) return importFixture(request, env);
    if (path.startsWith('/operator/')) {
      if (!authorized(request, env.PROBE_TOKEN)) return json({error: 'UNAUTHORIZED'}, 401);
      if (path.startsWith('/operator/probe/') || path === '/operator/browser-status') return importProbe(request, env, ctx);
      if (path === '/operator/state' && request.method === 'GET') return json(await env.IMPORT_CONTAINER.getByName('imports-single-slot').status());
      if (path === '/operator/stop' && request.method === 'POST') return json(await env.IMPORT_CONTAINER.getByName('imports-single-slot').halt());
      if (path === '/operator/purge' && request.method === 'POST') return json(await purgeHostedImports(env));
      return json({error: 'NOT_FOUND'}, 404);
    }
    if (!authorized(request, env.IMPORT_TOKEN)) return json({error: 'UNAUTHORIZED'}, 401);
    if (env.IMPORTS_ENABLED !== 'true') return json({error: 'IMPORTS_UNAVAILABLE'}, 503);
    try {
      if (request.method !== 'POST') return json({error: 'NOT_FOUND'}, 404);
      const row = await ownerImport(request, env);
      if (path === '/resource') {
        const input = await smallJson(request) as {url: string; kind: 'page' | 'image' | 'asset'; maxBytes?: number};
        if (!['page', 'image', 'asset'].includes(input.kind) || typeof input.url !== 'string') return json({error: 'INVALID_INPUT'}, 422);
        const resource = await cloudTransport(env, row).load(input.url, input.kind, [], AbortSignal.any([request.signal, AbortSignal.timeout(45_000)]), input.maxBytes);
        return new Response(resource.bytes, {headers: {'Content-Type': resource.mime, 'X-Source-Url': resource.url,
          'X-Source-Bytes': String(resource.sourceBytes), 'X-Image-Width': String(resource.width ?? 0), 'X-Image-Height': String(resource.height ?? 0)}});
      }
      if (path === '/normalize-photo' && row.sourceKind === 'manual') {
        const bytes = await readLimited(request, IMPORT_LIMITS.imageBytes);
        await claimHostedResource(env.DB, row.agencyId, row.id, bytes.length);
        return await env.IMPORT_CONTAINER.getByName('imports-single-slot').fetch(new Request('http://container/normalize-photo', {
          method: 'POST', signal: AbortSignal.timeout(45_000), headers: {'Content-Type': request.headers.get('Content-Type') ?? '', Authorization: `Bearer ${env.IMPORT_TOKEN}`}, body: bytes}));
      }
      if (path === '/browser' && row.sourceUrl) {
        await claimHostedBrowser(env.DB, row.agencyId, row.id);
        const started = Date.now();
        try {
          const html = await guardedBrowserHtml(env.BROWSER, row.sourceUrl, cloudTransport(env, row), ctx,
            AbortSignal.any([request.signal, AbortSignal.timeout(55_000)]));
          return new Response(html, {headers: {'Content-Type': 'text/html; charset=utf-8'}});
        } finally {
          await releaseHostedBrowser(env.DB, row.id);
          console.log(JSON.stringify({event: 'import_browser_finished', importId: row.id, durationMs: Date.now() - started}));
        }
      }
      return json({error: 'NOT_FOUND'}, 404);
    } catch (error) {
      const code = error instanceof ImportFailure ? error.code : error instanceof ImportStateFailure ? 'IMPORT_LIMIT' : 'SOURCE_UNAVAILABLE';
      return new Response(null, {status: code === 'IMPORT_LIMIT' ? 429 : 422, headers: {'X-Import-Error': code}});
    }
  },
  async scheduled(_event, env) {console.log(JSON.stringify({event: 'import_cleanup', ...await purgeHostedImports(env)}));},
} satisfies ExportedHandler<Env>;
