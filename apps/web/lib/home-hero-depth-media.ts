import { homeHeroDepth } from './home-hero-depth-assets';
import { demoByteRange } from './editor-demo-media';
// Only these explicitly exported marketing copies are public. The route accepts
// no job ID, bucket key, original avatar path or arbitrary file name.
export async function publicHeroDepthMedia(bucket: Pick<R2Bucket, 'head' | 'get'>, id: string, request: Request) {
  const asset = Object.values(homeHeroDepth.assets).find((a) => a.id === id),
    safe = { 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer' };
  const missing = () => new Response(null, { status: 404, headers: { ...safe, 'Cache-Control': 'no-store' } });
  if (!asset) return missing();
  const head = await bucket.head(asset.key);
  if (
    !head ||
    head.size !== asset.sizeBytes ||
    (head.customMetadata?.sha256 && head.customMetadata.sha256 !== asset.sha256)
  )
    return missing();
  const etag = `"${asset.sha256}"`,
    headers = new Headers({
      ...safe,
      'Content-Type': asset.mime,
      'Content-Length': String(head.size),
      'Accept-Ranges': 'bytes',
      ETag: etag,
      'Cache-Control': 'public, max-age=86400, immutable',
      'Content-Security-Policy': "default-src 'none'; sandbox",
    });
  if (request.headers.get('if-none-match') === etag) {
    headers.delete('Content-Length');
    return new Response(null, { status: 304, headers });
  }
  const range = request.headers.get('range'),
    partial = Boolean(range && (!request.headers.has('if-range') || request.headers.get('if-range') === etag));
  const interval = partial ? demoByteRange(range!, head.size) : { offset: 0, length: head.size };
  if (!interval)
    return new Response(null, {
      status: 416,
      headers: { ...safe, 'Cache-Control': 'no-store', 'Content-Range': `bytes */${head.size}` },
    });
  if (partial) {
    headers.set('Content-Range', `bytes ${interval.offset}-${interval.offset + interval.length - 1}/${head.size}`);
    headers.set('Content-Length', String(interval.length));
  }
  if (request.method === 'HEAD') return new Response(null, { status: partial ? 206 : 200, headers });
  const object = await bucket.get(asset.key, { range: interval });
  if (!object) return missing();
  return new Response(object.body, { status: partial ? 206 : 200, headers });
}
