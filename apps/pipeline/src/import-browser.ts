import type {BrowserEndpoint} from '@cloudflare/playwright';
import {ImportFailure} from '@bienvu/contracts';
import {abortable, assertListingDestination, IMPORT_LIMITS, scopedUrl, sourcePolicy, type ImportTransport} from '@bienvu/importers';

// Le service d'import réserve le budget et le slot avant cet appel. Tout accès
// réseau du navigateur passe par le transport à IP épinglée, sans credentials.
export async function withImportBrowser<B extends {close(): Promise<void>}, T>(open: () => Promise<B>,
  task: (browser: B, signal: AbortSignal) => Promise<T>, waitUntil: (promise: Promise<unknown>) => void,
  signal = AbortSignal.timeout(60_000)): Promise<T> {
  signal.throwIfAborted();
  let browser: B | undefined;
  const pending = open();
  try {
    browser = await abortable(pending, signal);
    return await abortable(task(browser, signal), signal);
  } catch (error) {
    if (signal.aborted) throw new ImportFailure('IMPORT_TIMEOUT', 'Délai du navigateur dépassé.');
    throw error;
  } finally {
    if (browser) await browser.close();
    // Un launch acquis après le timeout doit aussi être fermé et suivi par le runtime.
    else waitUntil(pending.then(late => late.close()).catch(() => undefined));
  }
}

export async function guardedBrowserHtml(binding: BrowserEndpoint, url: string, transport: ImportTransport,
  ctx: {waitUntil(promise: Promise<unknown>): void}, signal: AbortSignal) {
  const {launch} = await import('@cloudflare/playwright');
  const policy = sourcePolicy(url), hosts = policy.pageHosts;
  return withImportBrowser(() => launch(binding, {keep_alive: 60_000, guardrails: {allowedDomains: [...hosts]}}), async (browser, abort) => {
    const context = await browser.newContext({serviceWorkers: 'block', acceptDownloads: false});
    await context.routeWebSocket('**/*', socket => socket.close());
    const page = await context.newPage();
    context.on('page', extra => {if (extra !== page) ctx.waitUntil(extra.close());});
    let requests = 0, bytes = 0, unsafe = false;
    let documentFailure: ImportFailure | undefined;
    await context.route('**/*', async route => {
      try {
        const request = route.request();
        if (abort.aborted || ++requests > IMPORT_LIMITS.requests || request.method() !== 'GET') throw new Error('REQUEST_REFUSED');
        scopedUrl(request.url(), hosts);
        const kind = request.resourceType();
        if (!['document', 'script', 'xhr', 'fetch'].includes(kind) || request.frame() !== page.mainFrame()) throw new Error('RESOURCE_REFUSED');
        // Jamais route.continue()/route.fetch() : le navigateur ne résout pas
        // lui-même une destination issue de l'annonce ni ne suit une redirection.
        const remaining = Math.min(IMPORT_LIMITS.htmlBytes, IMPORT_LIMITS.totalBytes - bytes);
        if (remaining <= 0) throw new Error('BODY_LIMIT');
        const resource = await transport.load(request.url(), kind === 'document' ? 'page' : 'asset', hosts, abort, remaining);
        scopedUrl(resource.url, hosts); bytes += resource.sourceBytes;
        if (resource.bytes.length > IMPORT_LIMITS.htmlBytes || bytes > IMPORT_LIMITS.totalBytes) throw new Error('BODY_LIMIT');
        if (resource.url !== request.url()) await route.fulfill({status: 302, headers: {location: resource.url}, body: ''});
        else await route.fulfill({status: 200, headers: {'content-type': resource.mime}, body: Buffer.from(resource.bytes)});
      } catch (error) {
        if (error instanceof ImportFailure && route.request().isNavigationRequest() && route.request().frame() === page.mainFrame()) documentFailure = error;
        if (error instanceof ImportFailure && error.code === 'UNSAFE_URL') unsafe = true;
        await route.abort().catch(() => undefined);
      }
    });
    try {await page.goto(scopedUrl(url, hosts).href, {waitUntil: 'networkidle', timeout: 45_000});}
    catch (error) {throw documentFailure ?? error;}
    if (documentFailure) throw documentFailure;
    if (unsafe) throw new ImportFailure('UNSAFE_URL', 'Sous-requête dangereuse détectée.');
    scopedUrl(page.url(), hosts);
    assertListingDestination(url, page.url());
    const html = await page.evaluate(limit => {
      const content = document.documentElement.outerHTML;
      return content.length <= limit ? content : null;
    }, IMPORT_LIMITS.htmlBytes);
    if (!html) throw new ImportFailure('INCOMPLETE_LISTING', 'DOM trop volumineux.');
    return html;
  }, promise => ctx.waitUntil(promise), AbortSignal.any([signal, AbortSignal.timeout(60_000)]));
}
