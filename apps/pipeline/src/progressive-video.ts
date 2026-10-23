import { ProgressiveVideo, streamPrefix, type VideoManifest } from '@bienvu/contracts';
import { storeRenderArtifact } from './render-artifact';
export async function publishProgressiveVideo(
  bucket: R2Bucket,
  call: (path: string, init?: RequestInit) => Promise<Response>,
  m: VideoManifest,
  hash: string,
) {
  const response = await call(`/videos/${hash}/stream`);
  if (!response.ok) {
    await response.body?.cancel();
    return;
  }
  const length = Number(response.headers.get('content-length'));
  if (length > 16384) throw Error('VIDEO_STREAM_INVALID');
  const stream = ProgressiveVideo.parse(await response.json());
  const frames = m.scenes.reduce((n, s) => n + s.durationFrames, 0);
  const seconds = stream.segments.reduce((n, s) => n + s.durationSeconds, 0);
  if (
    stream.manifestHash !== hash ||
    stream.watermarked !== (m.rights.kind === 'anonymous' || m.rights.watermarked) ||
    seconds > frames / 30 + 0.1 ||
    (stream.complete && Math.abs(seconds - frames / 30) > 0.1)
  )
    throw Error('VIDEO_STREAM_INVALID');
  const prefix = streamPrefix(m, hash),
    old = await bucket.get(prefix + 'manifest.json');
  const previous = old ? ProgressiveVideo.parse(await old.json()) : null;
  if (previous) {
    if (
      previous.manifestHash !== hash ||
      previous.watermarked !== stream.watermarked ||
      previous.segments.length > stream.segments.length ||
      previous.segments.some((s, i) => JSON.stringify(s) !== JSON.stringify(stream.segments[i])) ||
      (previous.complete && !stream.complete)
    )
      throw Error('VIDEO_STREAM_CONFLICT');
    if (JSON.stringify(previous) === JSON.stringify(stream)) return;
  }
  for (const segment of stream.segments.slice(previous?.segments.length ?? 0)) {
    const file = await call(`/videos/${hash}/stream/${segment.file}`);
    if (!file.ok || !file.body) throw Error('VIDEO_STREAM_MISSING');
    await storeRenderArtifact(bucket, prefix + segment.file, file.body, segment, {
      manifestHash: hash,
      sha256: segment.sha256,
      watermarked: String(stream.watermarked),
      progressive: 'true',
    });
  }
  // Publish the playlist only after every referenced object was stored and its
  // SHA-256 checked by R2. Retried polls never advertise partial objects.
  await bucket.put(prefix + 'manifest.json', JSON.stringify(stream), {
    httpMetadata: { contentType: 'application/json', cacheControl: 'private, no-store' },
    customMetadata: { manifestHash: hash, watermarked: String(stream.watermarked), progressive: 'true' },
  });
}
