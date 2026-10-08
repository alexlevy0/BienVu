// Node only. A real Chrome network request, DNS pinned before launch. The HTML
// is intercepted as a bounded stream BEFORE any document can run or render.
import {lookup} from 'node:dns/promises';
import {chromium} from 'playwright-core';
import {ImportFailure, sourceForHost} from '../packages/contracts/src/index';
import {abortable, assertListingDestination, IMPORT_LIMITS, publicAddresses, scopedUrl, selectAdapter, sourcePolicy,
  type ImportTransport, type Resource} from '../packages/importers/src/index';
import {nodeImportTransport} from './import-transport';

type Address = {address: string; family: number};
export type BrowserPlan = {url: string; hosts: readonly string[]; resolverRules: string; addresses: ReadonlyMap<string, Address[]>};
export async function pinnedBrowserPlan(value: string, hosts: readonly string[], resolve = (host: string) => lookup(host, {all: true, verbatim: true})): Promise<BrowserPlan> {
  const url = scopedUrl(value, hosts), source = selectAdapter(url.href);
  if (source.source?.documentTransport !== 'browser') throw new ImportFailure('UNSAFE_URL', 'Native browser source not authorized.');
  const allowed = sourcePolicy(url.href).pageHosts;
  if (hosts.some(host => !allowed.includes(host))) throw new ImportFailure('UNSAFE_URL', 'Native browser hosts not authorized.');
  const entries = await Promise.all(allowed.map(async host => [host, publicAddresses(await resolve(host))] as const));
  const addresses = new Map(entries), rules = entries.map(([host, values]) => {
    const address = values[0]; return `MAP ${host} ${address.family === 6 ? `[${address.address}]` : address.address}`;
  });
  // Also prevent background DNS and any host not registered for this source.
  return {url: url.href, hosts: allowed, addresses, resolverRules: [...rules, 'MAP * ~NOTFOUND'].join(', ')};
}

export type Paused = {requestId: string; frameId: string; resourceType: string; request: {url: string; method: string; headers: Record<string, string>};
  responseStatusCode?: number; responseErrorReason?: string; responseHeaders?: Array<{name: string; value: string}>};
type BrowserCommand = 'Page.enable' | 'Page.getFrameTree' | 'Page.navigate' | 'Network.setCacheDisabled' | 'Fetch.enable'
  | 'Fetch.failRequest' | 'Fetch.continueRequest' | 'Fetch.continueWithAuth' | 'Fetch.takeResponseBodyAsStream' | 'IO.read' | 'IO.close';
type BrowserSession = {send(method: BrowserCommand, params?: Record<string, unknown>): Promise<unknown>;
  on(event: string, handler: (event: Paused) => void): void};
const record = (value: unknown): Record<string, unknown> => value !== null && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
export type BrowserHandle = {session: BrowserSession; close(): Promise<void>};
export type BrowserPorts = {resolve(host: string): Promise<Address[]>; open(plan: BrowserPlan, signal?: AbortSignal): Promise<BrowserHandle>};
const nativePorts: BrowserPorts = {
  resolve: host => lookup(host, {all: true, verbatim: true}),
  open: async (plan, signal) => {
    const browser = await chromium.launch({
    executablePath: process.env.CHROMIUM_PATH ?? (process.platform === 'darwin' ? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' : '/usr/bin/chromium'),
    headless: true, timeout: 8_000,
    args: [`--host-resolver-rules=${plan.resolverRules}`, '--no-proxy-server', '--disable-quic', '--disable-background-networking',
      '--disable-component-update', '--disable-sync', '--disable-features=DnsOverHttps,UseDnsHttpsSvcbAlpn,UseDnsHttpsSvcb,EncryptedClientHello'],
    // Never give the browser IMPORT_TOKEN, local secrets, or a user profile.
    env: Object.fromEntries(['PATH','LANG','LC_ALL','TZ'].flatMap(key => process.env[key] ? [[key, process.env[key]!]] : [])),
    });
    let closing: Promise<void> | undefined;
    const close = () => closing ??= browser.close();
    const onAbort = () => {void close().catch(() => undefined);};
    signal?.addEventListener('abort', onAbort, {once: true});
    try {
      signal?.throwIfAborted();
      const context = await browser.newContext({javaScriptEnabled: false, serviceWorkers: 'block', acceptDownloads: false, ignoreHTTPSErrors: false});
      const page = await context.newPage(), session = await context.newCDPSession(page);
      return {session, close: async () => {signal?.removeEventListener('abort', onAbort); await close();}};
    } catch (error) {signal?.removeEventListener('abort', onAbort); await close(); throw error;}
  },
};

export async function readBrowserStream(session: Pick<BrowserSession, 'send'>, handle: string, limit: number, signal: AbortSignal) {
  const parts: Buffer[] = []; let size = 0;
  try {
    for (;;) {
      signal.throwIfAborted();
      const result = record(await abortable(session.send('IO.read', {handle, size: Math.min(65_536, limit - size + 1)}), signal));
      if (typeof result.data !== 'string' || typeof result.eof !== 'boolean') throw new ImportFailure('SOURCE_UNAVAILABLE', 'Invalid browser stream.');
      const chunk = Buffer.from(result.data, result.base64Encoded ? 'base64' : 'utf8'); size += chunk.length;
      if (size > limit) throw new ImportFailure('SOURCE_UNAVAILABLE', 'Browser response body limit.');
      parts.push(chunk);
      if (result.eof) return new Uint8Array(Buffer.concat(parts));
      if (!chunk.length) throw new ImportFailure('SOURCE_UNAVAILABLE', 'Empty browser stream without EOF.');
    }
  } finally {await session.send('IO.close', {handle}).catch(() => undefined);}
}

export async function nativeBrowserPage(value: string, hosts: readonly string[], signal: AbortSignal, maxBytes = IMPORT_LIMITS.htmlBytes,
  ports: BrowserPorts = nativePorts): Promise<Resource> {
  const deadline = AbortSignal.any([signal, AbortSignal.timeout(18_000)]), limit = Math.min(maxBytes, IMPORT_LIMITS.htmlBytes);
  if (!Number.isSafeInteger(limit) || limit <= 0) throw new ImportFailure('SOURCE_UNAVAILABLE', 'Invalid browser body limit.');
  let browser: BrowserHandle | undefined, pending: Promise<BrowserHandle> | undefined;
  const tasks = new Set<Promise<unknown>>();
  try {
    deadline.throwIfAborted();
    const plan = await abortable(pinnedBrowserPlan(value, hosts, ports.resolve), deadline);
    pending = ports.open(plan, deadline); browser = await abortable(pending, deadline);
    const session = browser.session;
    await session.send('Page.enable');
    await session.send('Network.setCacheDisabled', {cacheDisabled: true});
    const frameId = record(record(record(await session.send('Page.getFrameTree')).frameTree).frame).id;
    if (typeof frameId !== 'string') throw new ImportFailure('SOURCE_UNAVAILABLE', 'Missing browser main frame.');
    let expected = plan.url, hops = 0, requestActive = false;
    let resolveResult: (result: Resource) => void = () => {}, rejectResult: (error: unknown) => void = () => {};
    const result = new Promise<Resource>((resolve, reject) => {resolveResult = resolve; rejectResult = reject;});
    const tracked = (task: Promise<unknown>) => {
      const safe = task.catch(rejectResult).finally(() => tasks.delete(safe)); tasks.add(safe);
    };
    const navigate = () => tracked(session.send('Page.navigate', {url: expected}));
    session.on('Fetch.requestPaused', (event: Paused) => tracked((async () => {
      deadline.throwIfAborted();
      if (event.frameId !== frameId || event.resourceType !== 'Document' || event.request.method !== 'GET' || event.request.url !== expected) {
        await session.send('Fetch.failRequest', {requestId: event.requestId, errorReason: 'Aborted'}); return;
      }
      if (event.responseErrorReason) throw new ImportFailure('SOURCE_UNAVAILABLE', 'Browser TLS or connection refused.');
      if (event.responseStatusCode === undefined) {
        if (requestActive) throw new ImportFailure('SOURCE_UNAVAILABLE', 'Duplicate browser document request.');
        requestActive = true;
        await session.send('Fetch.continueRequest', {requestId: event.requestId, interceptResponse: true,
          headers: Object.entries(event.request.headers).filter(([name]) => !/^(cookie|authorization|proxy-authorization)$/i.test(name)).map(([name, value]) => ({name, value}))});
        return;
      }
      const status = event.responseStatusCode, headers = Object.fromEntries((event.responseHeaders ?? []).map(h => [h.name.toLowerCase(), h.value]));
      if ([301,302,303,307,308].includes(status)) {
        if (!headers.location || hops++ >= IMPORT_LIMITS.redirects) throw new ImportFailure('UNSAFE_URL', 'Browser redirect limit.');
        const next = scopedUrl(new URL(headers.location, expected).href, plan.hosts); assertListingDestination(plan.url, next.href);
        // Recheck DNS at each hop. Chrome keeps using the original pinned public
        // address, even if a later DNS answer changes or attempts rebinding.
        publicAddresses(await abortable(ports.resolve(next.hostname), deadline));
        await session.send('Fetch.failRequest', {requestId: event.requestId, errorReason: 'Aborted'});
        expected = next.href; requestActive = false; navigate(); return;
      }
      if ([401,403,429].includes(status)) throw new ImportFailure('SOURCE_BLOCKED', 'Native browser access refused.',
        status === 401 ? 'login_required' : status === 403 ? 'access_denied' : 'rate_limited');
      if ([404,410].includes(status)) throw new ImportFailure('SOURCE_UNAVAILABLE', 'Listing unavailable.', 'not_found');
      if (status < 200 || status >= 300) throw new ImportFailure('SOURCE_UNAVAILABLE', 'Browser source unavailable.');
      const mime = (headers['content-type'] ?? '').split(';')[0].trim().toLowerCase();
      if (mime !== 'text/html') throw new ImportFailure('NOT_A_LISTING', 'Browser source is not HTML.');
      if (Number(headers['content-length']) > limit) throw new ImportFailure('SOURCE_UNAVAILABLE', 'Browser response header body limit.');
      const stream = record(await session.send('Fetch.takeResponseBodyAsStream', {requestId: event.requestId}));
      if (typeof stream.stream !== 'string') throw new ImportFailure('SOURCE_UNAVAILABLE', 'Missing browser body stream.');
      const bytes = await readBrowserStream(session, stream.stream, limit, deadline);
      await session.send('Fetch.failRequest', {requestId: event.requestId, errorReason: 'Aborted'});
      resolveResult({url: expected, mime, bytes, sourceBytes: bytes.length, browserUsed: true});
    })()));
    await session.send('Fetch.enable', {patterns: [{urlPattern: '*', requestStage: 'Request'}], handleAuthRequests: true});
    session.on('Fetch.authRequired', event => tracked(session.send('Fetch.continueWithAuth', {requestId: event.requestId, authChallengeResponse: {response: 'CancelAuth'}})));
    navigate();
    return await abortable(result, deadline);
  } catch (error) {
    const failure = deadline.aborted ? new ImportFailure('IMPORT_TIMEOUT', 'Native browser deadline exceeded.')
      : error instanceof ImportFailure ? error : new ImportFailure('SOURCE_UNAVAILABLE', 'Native browser unavailable.');
    failure.browserUsed = Boolean(browser); throw failure;
  } finally {
    if (browser) await browser.close();
    else if (pending) await pending.then(late => late.close()).catch(() => undefined);
    await Promise.allSettled(tasks);
  }
}

export function primaryImportTransport(): ImportTransport {
  const native = nodeImportTransport();
  return {load(value, kind, hosts, signal, maxBytes) {
    if (kind === 'page' && sourceForHost(scopedUrl(value, hosts).hostname)?.documentTransport === 'browser')
      return nativeBrowserPage(value, hosts, signal, maxBytes);
    return native.load(value, kind, hosts, signal, maxBytes);
  }};
}
