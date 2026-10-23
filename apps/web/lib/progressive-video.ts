import { ProgressiveVideo, streamPlaylist, streamPrefix } from '@bienvu/contracts';
import { generationRetained, type GenerationRow } from '@bienvu/db';
import { RequestFailure } from './http';

export async function generationStream(
  request: Request,
  env: Pick<CloudflareEnv, 'DB' | 'MEDIA'>,
  row: GenerationRow,
  file?: string,
) {
  if (file !== undefined && file !== 'index.m3u8' && !/^segment-\d{6}\.ts$/.test(file))
    throw new RequestFailure('NOT_FOUND');
  if (!generationRetained(row) || !['rendering', 'ready'].includes(row.status))
    return new Response(null, { status: file ? 404 : 204, headers: { 'Cache-Control': 'private, no-store' } });
  const frozen = await env.DB.prepare(
    "SELECT manifest_hash AS hash,json_extract(manifest_json,'$.rights.kind') AS kind,json_extract(manifest_json,'$.rights.watermarked') AS watermarked FROM video_manifests WHERE job_id=? AND agency_id=? AND state='prepared'",
  )
    .bind(row.jobId, row.agencyId)
    .first<{ hash: string; kind: string; watermarked: number }>();
  if (!frozen)
    return new Response(null, { status: file ? 404 : 204, headers: { 'Cache-Control': 'private, no-store' } });
  const prefix = streamPrefix({ agencyId: row.agencyId, jobId: row.jobId }, frozen.hash),
    object = await env.MEDIA.get(prefix + 'manifest.json');
  if (!object || object.size > 16384 || Date.now() - object.uploaded.getTime() > 86400_000)
    return new Response(null, { status: file ? 404 : 204, headers: { 'Cache-Control': 'private, no-store' } });
  const stream = ProgressiveVideo.parse(await object.json());
  if (
    stream.manifestHash !== frozen.hash ||
    stream.watermarked !== (frozen.kind === 'anonymous' || Boolean(frozen.watermarked))
  )
    throw new RequestFailure('NOT_FOUND');
  if (!stream.segments.length) return new Response(null, { status: file ? 404 : 204 });
  const headers = { 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff', Vary: 'Cookie' };
  if (file === undefined)
    return Response.json(
      {
        url: new URL(request.url).pathname.replace(/\/$/, '') + '/index.m3u8',
        availableSeconds: stream.segments.reduce((n, s) => n + s.durationSeconds, 0),
        complete: stream.complete,
        watermarked: stream.watermarked,
      },
      { headers },
    );
  if (file === 'index.m3u8')
    return new Response(request.method === 'HEAD' ? null : streamPlaylist(stream), {
      headers: { ...headers, 'Content-Type': 'application/vnd.apple.mpegurl' },
    });
  const segment = stream.segments.find((s) => s.file === file);
  if (!segment) throw new RequestFailure('NOT_FOUND');
  const head = await env.MEDIA.head(prefix + file);
  if (
    !head ||
    head.size !== segment.sizeBytes ||
    head.customMetadata?.sha256 !== segment.sha256 ||
    head.customMetadata?.manifestHash !== frozen.hash ||
    head.customMetadata?.watermarked !== String(stream.watermarked)
  )
    throw new RequestFailure('NOT_FOUND');
  const bytes = request.method === 'HEAD' ? null : await env.MEDIA.get(prefix + file);
  if (!bytes && request.method !== 'HEAD') throw new RequestFailure('NOT_FOUND');
  return new Response(bytes?.body ?? null, {
    headers: { ...headers, 'Content-Type': 'video/mp2t', 'Content-Length': String(head.size) },
  });
}
