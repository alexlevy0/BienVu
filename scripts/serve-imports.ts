import {createServer} from 'node:http';
import {createHash, timingSafeEqual} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {ImportFailure} from '../packages/contracts/src/index';
import {normalizePhoto} from './import-transport';
import {primaryImportTransport} from './import-browser-transport';
import {photoPreview,ImportWorkSlots} from './import-photo-preview';
import {MANUAL_PHOTO_LIMITS} from '../packages/contracts/src/index';
import {fixtureImportTransport} from './import-fixtures';
const vars = await readFile('apps/web/.dev.vars', 'utf8');
const token = vars.match(/^LOCAL_IMPORT_TOKEN=(.+)$/m)?.[1]?.trim();
if (!token || token.length < 32) throw new Error('Exécutez pnpm setup:local pour créer le secret local.');
const expected = createHash('sha256').update(`Bearer ${token}`).digest();
const work=new ImportWorkSlots();
const fixtures = process.argv.includes('--fixtures');
const server = createServer(async (request, response) => {
  if (process.argv.includes('--diagnostics')) response.on('finish', () => console.log(JSON.stringify({event: 'bridge_response', status: response.statusCode, code: response.getHeader('X-Import-Error') ?? null})));
  const provided = createHash('sha256').update(request.headers.authorization ?? '').digest();
  if (request.method !== 'POST' || !['/resource', '/normalize-photo','/photo-preview'].includes(request.url ?? '') || !timingSafeEqual(provided, expected)) {response.writeHead(404).end(); return;}
  const isPreview=request.url==='/photo-preview';let release=isPreview?undefined:work.tryAcquire();
  if(!isPreview&&!release){response.writeHead(429).end();return;}
  const abort = new AbortController();
  response.on('close', () => abort.abort());
  try {
    if(isPreview)release=await work.acquire(AbortSignal.any([abort.signal,AbortSignal.timeout(20_000)]));
    let size = 0; const chunks: Buffer[] = [];
    const limit = request.url === '/normalize-photo'||isPreview ? MANUAL_PHOTO_LIMITS.fileBytes : 8192;
    for await (const chunk of request) {size += chunk.length; if (size > limit) throw new ImportFailure('UNSAFE_URL', 'Corps trop volumineux.'); chunks.push(chunk);}
    if (request.url === '/normalize-photo'||isPreview) {
      const result = await (isPreview?photoPreview:normalizePhoto)(Buffer.concat(chunks), request.headers['content-type']?.split(';')[0] ?? '');
      response.writeHead(200, {'Content-Type': result.mime, 'Cache-Control': 'no-store', 'Content-Length': result.bytes.length,
        'X-Image-Width': String(result.width), 'X-Image-Height': String(result.height)});
      response.end(result.bytes); return;
    }
    const input = JSON.parse(Buffer.concat(chunks).toString('utf8')) as {url?: unknown; kind?: unknown; hosts?: unknown; maxBytes?: unknown};
    if (typeof input.url !== 'string' || !['page', 'image', 'asset'].includes(String(input.kind)) || !Array.isArray(input.hosts)
      || input.hosts.length > 8 || !input.hosts.every(h => typeof h === 'string')
      || (input.maxBytes !== undefined && (typeof input.maxBytes !== 'number' || !Number.isSafeInteger(input.maxBytes) || input.maxBytes <= 0))) throw new ImportFailure('UNSAFE_URL', 'Entrée invalide.');
    const result = await (fixtures ? fixtureImportTransport() : primaryImportTransport()).load(input.url, input.kind as 'page' | 'image' | 'asset', input.hosts, AbortSignal.any([abort.signal, AbortSignal.timeout(15_000)]), input.maxBytes as number | undefined);
    response.writeHead(200, {'Content-Type': result.mime, 'Cache-Control': 'no-store', 'Content-Length': result.bytes.length,
      'X-Source-Url': result.url, 'X-Source-Bytes': String(result.sourceBytes),
      'X-Import-Browser': result.browserUsed ? '1' : '0',
      ...(result.width ? {'X-Image-Width': String(result.width), 'X-Image-Height': String(result.height)} : {})});
    response.end(result.bytes);
  } catch (error) {
    if (!response.headersSent) response.writeHead(422, {'X-Import-Error': error instanceof ImportFailure ? error.code : 'SOURCE_UNAVAILABLE',
      'X-Import-Browser': error instanceof ImportFailure && error.browserUsed ? '1' : '0',
      ...(error instanceof ImportFailure && error.reason ? {'X-Import-Reason': error.reason} : {})});
    response.end();
  } finally {release?.();}
});
server.requestTimeout = 20_000; server.headersTimeout = 5000; server.maxHeadersCount = 30;
server.listen(8791, '127.0.0.1', () => console.log(`Transport d’import local prêt sur 127.0.0.1:8791. Mode ${fixtures ? 'fixtures synthétiques, réseau extérieur interdit' : 'HTTPS public, IP épinglée'}.`));
for (const signal of ['SIGINT', 'SIGTERM'] as const) process.on(signal, () => {server.closeAllConnections(); server.close();});
