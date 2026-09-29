import {createServer} from 'node:http';
import {createHash, timingSafeEqual} from 'node:crypto';
import sharp from 'sharp';
import {ImportFailure} from '@bienvu/contracts';
import {IMPORT_LIMITS} from '@bienvu/importers';
import {nodeImportTransport, normalizePhoto} from '../../../scripts/import-transport';

const token = process.env.IMPORT_TOKEN;
if (!token || token.length < 32) throw new Error('IMPORT_TOKEN_REQUIRED');
const expected = createHash('sha256').update(`Bearer ${token}`).digest();
sharp.concurrency(1); sharp.cache({memory: 32, files: 0, items: 32});
let active = 0;
const server = createServer(async (request, response) => {
  const provided = createHash('sha256').update(request.headers.authorization ?? '').digest();
  if (!timingSafeEqual(provided, expected)) {response.writeHead(401).end(); return;}
  if (request.url === '/health' && request.method === 'GET') {response.writeHead(200).end('ok'); return;}
  if (request.method !== 'POST' || !['/resource', '/normalize-photo'].includes(request.url ?? '')) {response.writeHead(404).end(); return;}
  if (active >= 2) {response.writeHead(429).end(); return;}
  active++;
  const abort = new AbortController(), started = performance.now();
  response.on('close', () => abort.abort());
  const timer = setTimeout(() => {abort.abort(); if (!response.headersSent) response.writeHead(504); response.end();}, 20_000);
  try {
    let size = 0; const chunks: Buffer[] = [];
    const limit = request.url === '/normalize-photo' ? IMPORT_LIMITS.imageBytes : 8192;
    for await (const chunk of request) {size += chunk.length; if (size > limit) throw new ImportFailure('SOURCE_UNAVAILABLE', 'BODY_LIMIT'); chunks.push(chunk);}
    const body = new Uint8Array(Buffer.concat(chunks));
    let result;
    if (request.url === '/normalize-photo') {
      result = {...await normalizePhoto(body, request.headers['content-type']?.split(';')[0] ?? ''), sourceBytes: body.length, url: ''};
    } else {
      const input = JSON.parse(new TextDecoder().decode(body)) as {url?: unknown; kind?: unknown; hosts?: unknown; maxBytes?: unknown};
      if (typeof input.url !== 'string' || !['page', 'image', 'asset'].includes(String(input.kind)) || !Array.isArray(input.hosts)
        || input.hosts.length > 8 || !input.hosts.every(h => typeof h === 'string') || typeof input.maxBytes !== 'number'
        || !Number.isSafeInteger(input.maxBytes) || input.maxBytes <= 0) throw new ImportFailure('UNSAFE_URL', 'INVALID_INPUT');
      result = await nodeImportTransport().load(input.url, input.kind as 'page' | 'image' | 'asset', input.hosts, abort.signal, input.maxBytes);
    }
    abort.signal.throwIfAborted();
    response.writeHead(200, {'Content-Type': result.mime, 'Cache-Control': 'no-store', 'Content-Length': result.bytes.length,
      'X-Source-Url': result.url, 'X-Source-Bytes': String(result.sourceBytes),
      'X-Image-Width': String(result.width ?? 0), 'X-Image-Height': String(result.height ?? 0)});
    response.end(result.bytes);
  } catch (error) {
    if (!response.headersSent) response.writeHead(422, {'X-Import-Error': error instanceof ImportFailure ? error.code : 'SOURCE_UNAVAILABLE',
      ...(error instanceof ImportFailure && error.reason ? {'X-Import-Reason': error.reason} : {})});
    response.end();
  } finally {
    clearTimeout(timer); active--;
    console.log(JSON.stringify({event: 'import_resource', status: response.statusCode, durationMs: Math.round(performance.now() - started), rssBytes: process.memoryUsage().rss}));
  }
});
server.requestTimeout = 22_000; server.headersTimeout = 5000; server.maxHeadersCount = 30;
server.listen(Number(process.env.PORT ?? 8080), '0.0.0.0');
for (const signal of ['SIGINT', 'SIGTERM'] as const) process.on(signal, () => {server.closeAllConnections(); server.close();});
