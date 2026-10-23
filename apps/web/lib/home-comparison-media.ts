import { homeComparisonAssets } from './home-comparison-assets';
import { demoByteRange } from './editor-demo-media';

// R2 streaming supplies real byte ranges. Static Assets currently returns full
// 200 responses for these MP4s in production, preventing browser seeking.
export async function publicHomeComparisonMedia(bucket: Pick<R2Bucket, 'head' | 'get'>, id: string, request: Request) {
  const asset = homeComparisonAssets.find((item) => item.id === id),
    safe = { 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer' };
  const missing = () => new Response(null, { status: 404, headers: { ...safe, 'Cache-Control': 'no-store' } });
  if (!asset) return missing();
  const key = `public/home-comparison/${asset.sha256}.mp4`,
    head = await bucket.head(key);
  if (
    !head ||
    head.size !== asset.sizeBytes ||
    (head.customMetadata?.sha256 && head.customMetadata.sha256 !== asset.sha256)
  )
    return missing();
  const etag = `"${asset.sha256}"`,
    headers = new Headers({
      ...safe,
      'Content-Type': 'video/mp4',
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
  const object = await bucket.get(key, { range: interval });
  if (!object) return missing();
  return new Response(object.body, { status: partial ? 206 : 200, headers });
}
