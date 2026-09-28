import {launch, sessions, history} from '@cloudflare/playwright';
import {ImportFailure} from '@bienvu/contracts';
import {withImportBrowser, guardedBrowserHtml} from './import-browser';
import {json} from './auth';
import type {ImportTransport} from '@bienvu/importers';

type Env = ImportEnv & {PROBE_TOKEN?: string; IMPORT_TOKEN?: string; IMPORT_PROBES_ENABLED?: string};
const cases = ['success', 'exception', 'timeout', 'late-launch', 'network'] as const;
// Infrastructure réelle, contenu synthétique explicite. Désactivé hors recette.
export async function importProbe(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
  const path = new URL(request.url).pathname;
  if (path === '/operator/browser-status' && request.method === 'GET')
    return json({active: await sessions(env.BROWSER), recent: await history(env.BROWSER)});
  if (env.IMPORT_PROBES_ENABLED !== 'true' || request.method !== 'POST') return json({error: 'PROBES_DISABLED'}, 503);
  const name = path.slice('/operator/probe/'.length);
  if (!cases.includes(name as typeof cases[number])) return json({error: 'UNKNOWN_CASE'}, 404);
  const month = new Date().toISOString().slice(0, 7), costId = `probe-${name === 'network' ? 'network' : 'browser'}-${month}`;
  await env.DB.prepare(`INSERT INTO hosted_import_costs(import_id,agency_id,month,created_at)
    SELECT ?,'operator',?,? FROM hosted_import_budget b WHERE b.month=? AND paused=0
    AND baseline_cents+50+(SELECT coalesce(sum(reserved_cents),0) FROM hosted_import_costs WHERE month=b.month)<=ceiling_cents
    ON CONFLICT(import_id) DO NOTHING`).bind(costId, month, new Date().toISOString(), month).run();
  if (!await env.DB.prepare(`SELECT import_id FROM hosted_import_costs WHERE import_id=? AND EXISTS
    (SELECT 1 FROM hosted_import_budget WHERE month=? AND paused=0)`).bind(costId, month).first()) return json({error: 'BUDGET_LIMIT'}, 429);
  const key = `probes/imports/${month}/${name}`;
  if (!await env.MEDIA.put(`${key}.started`, new Date().toISOString(), {onlyIf: {etagDoesNotMatch: '*'}})) return json({error: 'CASE_ALREADY_ATTEMPTED'}, 409);
  const started = Date.now(), report: Record<string, unknown> = {at: new Date().toISOString(), name, source: 'synthetic-fixture', infrastructure: 'real-cloudflare'};
  try {
    if (name === 'network') {
      const origin = new URL(request.url).origin;
      const resource = async (url: string) => env.IMPORT_CONTAINER.getByName('imports-single-slot').fetch(new Request('http://container/resource', {
        method: 'POST', headers: {Authorization: `Bearer ${env.IMPORT_TOKEN}`, 'Content-Type': 'application/json'},
        body: JSON.stringify({url, kind: 'page', hosts: [new URL(url).hostname], maxBytes: 100_000}), signal: AbortSignal.timeout(45_000)}));
      const results = [];
      for (const url of ['https://127.0.0.1/', 'https://[::1]/', 'https://localtest.me/', `${origin}/fixtures/redirect-private`]) {
        const response = await resource(url); await response.body?.cancel();
        results.push({url, status: response.status, code: response.headers.get('X-Import-Error')});
      }
      report.network = results;
      // Vrai navigateur + vrai transport TLS. La sous-requête privée doit être
      // refusée par le routeur avant tout accès ; aucune route.continue/fetch.
      let loads = 0;
      const transport: ImportTransport = {async load(url) {
        if (++loads > 4) throw new Error('PROBE_REQUEST_LIMIT');
        const response = await resource(url);
        if (!response.ok) {await response.body?.cancel(); throw new ImportFailure('UNSAFE_URL', 'PROBE_RESOURCE_REFUSED');}
        const bytes = new Uint8Array(await response.arrayBuffer());
        return {url, bytes, sourceBytes: bytes.length, mime: 'text/html'};
      }};
      try {await guardedBrowserHtml(env.BROWSER, `${origin}/fixtures/unsafe-script`, transport, ctx, AbortSignal.timeout(55_000)); report.browserUnsafe = 'UNEXPECTED_SUCCESS';}
      catch (error) {report.browserUnsafe = error instanceof ImportFailure ? error.code : 'OTHER_ERROR';}
      report.transportLoads = loads;
      report.passed = results.every(r => r.status === 422 && r.code === 'UNSAFE_URL') && report.browserUnsafe === 'UNSAFE_URL' && loads === 1;
    } else {
      const abort = new AbortController(), tracked: Promise<unknown>[] = [];
      let closed = false, sessionId: string | null = null, taskStarted = false;
      const result = await withImportBrowser(async () => {
        const browser = await launch(env.BROWSER, {keep_alive: 60_000, guardrails: {allowedDomains: ['bienvu.online']}});
        sessionId = browser.sessionId();
        if (name === 'late-launch') {abort.abort(); await new Promise(resolve => setTimeout(resolve, 100));}
        return {browser, async close() {await browser.close(); closed = true;}};
      }, async ({browser}) => {
        taskStarted = true;
        const page = await browser.newPage(); await page.setContent('<!doctype html><title>Recette synthétique BienVu</title><p>Fixture</p>');
        if (name === 'exception') throw new Error('EXPECTED_PROBE_EXCEPTION');
        if (name === 'timeout') {abort.abort(); return new Promise<never>(() => {});}
        return await page.title();
      }, promise => {tracked.push(promise); ctx.waitUntil(promise);}, AbortSignal.any([abort.signal, AbortSignal.timeout(55_000)]))
        .then(value => ({value}), error => ({error: error instanceof ImportFailure ? error.code : error instanceof Error ? error.message : 'UNKNOWN'}));
      await Promise.all(tracked);
      Object.assign(report, {result, closed, sessionId, taskStarted, passed: closed && Boolean(sessionId)
        && (name === 'success' ? 'value' in result : 'error' in result) && (name !== 'late-launch' || !taskStarted)});
    }
  } catch (error) {report.passed = false; report.error = error instanceof ImportFailure ? error.code : error instanceof Error ? error.name : 'UNKNOWN';}
  report.durationMs = Date.now() - started;
  await env.MEDIA.put(`${key}.json`, JSON.stringify(report)); return json(report);
}

export async function importFixture(request: Request, env: Env) {
  if (env.IMPORT_PROBES_ENABLED !== 'true' || request.method !== 'GET') return new Response(null, {status: 404});
  const url = new URL(request.url);
  if (url.pathname === '/fixtures/redirect-private') return Response.redirect('https://127.0.0.1/private', 302);
  if (url.pathname === '/fixtures/unsafe-script') return new Response('<!doctype html><script>fetch("https://127.0.0.1/private").catch(()=>{});</script>', {headers: {'Content-Type': 'text/html'}});
  if (/^\/fixtures\/photo-[123]\.jpg$/.test(url.pathname)) {
    const object = await env.MEDIA.get(`probes/import-fixtures/${url.pathname.split('/').pop()}`);
    return object ? new Response(object.body, {headers: {'Content-Type': 'image/jpeg'}}) : new Response(null, {status: 404});
  }
  if (url.pathname !== '/fixtures/js-listing') return new Response(null, {status: 404});
  const data = {'@type': 'RealEstateListing', url: url.href, mainEntity: {'@type': 'Apartment', name: 'RECETTE SYNTHÉTIQUE — annonce JavaScript', identifier: 'cloudflare-js-fixture',
    description: '<p>Description synthétique issue de JavaScript.</p><p>Deuxième paragraphe conservé.</p>', address: {'@type': 'PostalAddress', addressLocality: 'Ville de recette'},
    numberOfRooms: 3, floorSize: {value: 65, unitCode: 'MTK'}, offers: {businessFunction: 'http://purl.org/goodrelations/v1#Sell', price: '280000', priceCurrency: 'EUR'},
    image: [1, 2, 3].map(n => `/fixtures/photo-${n}.jpg`)}};
  // Le JSON-LD est absent du HTML statique et créé uniquement par le JS exécuté.
  const payload = btoa(unescape(encodeURIComponent(JSON.stringify(data))));
  return new Response(`<!doctype html><html lang="fr"><head><meta charset="utf-8"></head><body><h1>Fixture JavaScript</h1><script>
    const s=document.createElement('script');s.type='application/ld+json';s.textContent=new TextDecoder().decode(Uint8Array.from(atob('${payload}'),c=>c.charCodeAt(0)));document.head.append(s);
    </script></body></html>`, {headers: {'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store'}});
}
