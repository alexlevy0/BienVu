import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { Miniflare, convertV4MiniflareOptions } from 'miniflare';
import {
  ProgressiveVideo,
  streamPrefix,
  streamSegmentFile,
  streamPlaylist,
  videoAssets,
  VideoManifest,
  videoManifestHash,
} from '../packages/contracts/src/index';
import { videoFixture } from '../fixtures/video';
import { migrateNarrationProbe, seedNarrationFixture } from '../scripts/narration-fixtures';
import { admitGeneration } from '../packages/db/src/index';
import { readProgressiveVideo } from '../apps/renderer/src/progressive-video';
const require = createRequire(import.meta.url),
  esbuild = createRequire(require.resolve('tsx'))('esbuild');

test('stream : uniquement les segments ordonnés et complets, aucune URL ou traversée de chemin', () => {
  const value = {
    version: 1,
    manifestHash: 'a'.repeat(64),
    watermarked: true,
    complete: false,
    segments: [{ file: streamSegmentFile(0), durationSeconds: 2, sizeBytes: 3, sha256: 'b'.repeat(64) }],
  };
  assert.ok(ProgressiveVideo.safeParse(value).success);
  const playlist = streamPlaylist(ProgressiveVideo.parse(value));
  assert.ok(playlist.includes('#EXTINF:2.000000,\nsegment-000000.ts'));
  assert.ok(!playlist.includes('#EXT-X-ENDLIST'));
  for (const file of [
    '../video.mp4',
    'https://example.com/segment.ts',
    'segment-000001.ts',
    'segment-000000.ts?token=a',
  ])
    assert.ok(!ProgressiveVideo.safeParse({ ...value, segments: [{ ...value.segments[0], file }] }).success);
  assert.ok(!ProgressiveVideo.safeParse({ ...value, segments: [value.segments[0], value.segments[0]] }).success);
  assert.ok(
    !ProgressiveVideo.safeParse({ ...value, segments: [{ ...value.segments[0], durationSeconds: 3 }] }).success,
  );
  assert.ok(
    ProgressiveVideo.safeParse({ ...value, segments: [{ ...value.segments[0], sizeBytes: 8628636 }] }).success,
    'A valid satellite segment can exceed 8 MiB',
  );
  assert.ok(
    !ProgressiveVideo.safeParse({ ...value, segments: [{ ...value.segments[0], sizeBytes: 16 * 1024 * 1024 + 1 }] })
      .success,
  );
  assert.ok(
    !ProgressiveVideo.safeParse({
      ...value,
      segments: Array.from({ length: 4 }, (_, i) => ({
        ...value.segments[0],
        file: streamSegmentFile(i),
        sizeBytes: 16 * 1024 * 1024,
      })),
    }).success,
    'The total stream must stay below 60 MiB',
  );
  assert.ok(streamPlaylist(ProgressiveVideo.parse({ ...value, complete: true })).endsWith('#EXT-X-ENDLIST\n'));
});

test('renderer : un segment satellite valide de plus de 8 MiB est lisible et vérifié', async (t) => {
  const directory = await mkdtemp(path.join(tmpdir(), 'bienvu-stream-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  await mkdir(path.join(directory, 'stream'));
  const bytes = Buffer.alloc(8628636, 0x47),
    hash = 'a'.repeat(64),
    { manifest } = await videoFixture();
  await writeFile(path.join(directory, 'stream/segment-000000.ts'), bytes);
  await writeFile(path.join(directory, 'stream/index.m3u8'), '#EXTM3U\n#EXTINF:2.000000,\nsegment-000000.ts\n');
  const stream = await readProgressiveVideo(directory, manifest, hash);
  assert.equal(stream?.segments[0].sizeBytes, bytes.length);
  assert.equal(stream?.segments[0].sha256, createHash('sha256').update(bytes).digest('hex'));
  assert.equal(stream?.complete, false);
});

test('R2 : publication atomique, reprise, checksum, filigrane, isolation et échec du rendu', async (t) => {
  const bundle = await esbuild.build({
    entryPoints: ['fixtures/progressive-video-worker.ts'],
    bundle: true,
    write: false,
    platform: 'browser',
    format: 'esm',
    conditions: ['workerd'],
    external: ['cloudflare:workers', 'node:*'],
    logLevel: 'silent',
  });
  const mf = new Miniflare(
    convertV4MiniflareOptions({
      modules: true,
      script: bundle.outputFiles[0].text,
      compatibilityDate: '2026-10-01',
      compatibilityFlags: ['nodejs_compat'],
      d1Databases: ['DB'],
      r2Buckets: ['MEDIA'],
    }),
  );
  t.after(() => mf.dispose());
  const env = await mf.getBindings<{ DB: D1Database; MEDIA: R2Bucket }>();
  await migrateNarrationProbe(env.DB);
  const { agencyId, jobId } = await seedNarrationFixture(env.DB, 'stream', true),
    at = new Date().toISOString();
  await env.DB.prepare("UPDATE jobs SET status='failed',error_code='FIXTURE',lease_until=NULL WHERE id=?")
    .bind(jobId)
    .run();
  await env.DB.prepare('INSERT INTO hosted_import_budget(month,baseline_cents,ceiling_cents,paused) VALUES(?,0,3500,0)')
    .bind(at.slice(0, 7))
    .run();
  await env.DB.exec('UPDATE generation_control SET enabled=1');
  await env.DB.prepare('INSERT INTO generation_access(agency_id,allocation_id,enabled) VALUES(?,?,1)')
    .bind(agencyId, 'allocation-stream')
    .run();
  const row = await admitGeneration(env.DB, agencyId, 'stream-test-123456', { listingId: 'listing-stream' }, 'true');
  await env.DB.prepare("UPDATE jobs SET status='rendering',stage='rendering' WHERE id=?").bind(row.jobId).run();
  const original = (await videoFixture('anonymous', 4)).manifest,
    m = structuredClone(original);
  m.agencyId = agencyId;
  m.brand.id = agencyId;
  m.jobId = row.jobId;
  for (const asset of videoAssets(m))
    asset.objectKey = asset.objectKey.replace(
      `agencies/${original.agencyId}/jobs/${original.jobId}/`,
      `agencies/${agencyId}/jobs/${row.jobId}/`,
    );
  const manifest = VideoManifest.parse(m),
    hash = await videoManifestHash(manifest);
  await env.DB.prepare(
    "INSERT INTO video_manifests(job_id,agency_id,job_attempt,manifest_hash,manifest_json,sources_json,state,created_at,expires_at) VALUES(?,?,1,?,?,?,'prepared',?,?)",
  )
    .bind(row.jobId, agencyId, hash, JSON.stringify(manifest), '[]', at, new Date(Date.now() + 86400_000).toISOString())
    .run();
  const bytes = [1, 2, 3],
    sha = createHash('sha256').update(new Uint8Array(bytes)).digest('hex'),
    segment = { file: streamSegmentFile(0), durationSeconds: 2, sizeBytes: 3, sha256: sha };
  const stream = { version: 1, manifestHash: hash, watermarked: true, complete: false, segments: [segment] },
    body = { manifest, hash, stream, bytes };
  const publish = (body: unknown) =>
    mf.dispatchFetch('https://test/publish', { method: 'POST', body: JSON.stringify(body) });
  const view = (agency = agencyId, file?: string) =>
    mf.dispatchFetch(
      `https://test/view?agency=${agency}&job=${row.jobId}${file ? '&file=' + encodeURIComponent(file) : ''}`,
    );
  assert.equal((await view()).status, 204);
  assert.equal((await publish({ ...body, corrupt: true })).status, 404);
  assert.equal(await env.MEDIA.head(streamPrefix(manifest, hash) + 'manifest.json'), null);
  assert.equal((await publish(body)).status, 200);
  assert.equal((await publish(body)).status, 200);
  assert.equal((await view()).status, 200);
  assert.equal((await view('foreign-agency', 'segment-000000.ts')).status, 404);
  const list = await view(agencyId, 'index.m3u8');
  assert.ok((await list.text()).includes('segment-000000.ts'));
  assert.equal(list.headers.get('cache-control'), 'private, no-store');
  assert.deepEqual(
    new Uint8Array(await (await view(agencyId, 'segment-000000.ts')).arrayBuffer()),
    new Uint8Array(bytes),
  );
  assert.equal((await view(agencyId, '../video.mp4')).status, 404);
  assert.equal((await view(agencyId, 'segment-000001.ts')).status, 404);
  assert.equal((await publish({ ...body, stream: { ...stream, watermarked: false } })).status, 404);
  assert.equal(
    (await publish({ ...body, stream: { ...stream, complete: true } })).status,
    404,
    'A complete preview must cover the whole video',
  );
  assert.equal(
    (await publish({ ...body, stream: { ...stream, segments: [] } })).status,
    404,
    'A late poll cannot remove playable content',
  );
  const totalSeconds = manifest.scenes.reduce((n, s) => n + s.durationFrames, 0) / 30;
  const finished = {
    ...stream,
    complete: true,
    segments: Array.from({ length: Math.ceil(totalSeconds / 2) }, (_, i) => ({
      ...segment,
      file: streamSegmentFile(i),
      durationSeconds: Math.min(2, totalSeconds - i * 2),
    })),
  };
  const finishedResponse = await publish({ ...body, stream: finished });
  assert.equal(finishedResponse.status, 200, await finishedResponse.text());
  const status = (await (await view()).json()) as { complete: boolean; availableSeconds: number };
  assert.equal(status.complete, true);
  assert.equal(status.availableSeconds, totalSeconds);
  assert.ok((await (await view(agencyId, 'index.m3u8')).text()).endsWith('#EXT-X-ENDLIST\n'));
  assert.equal((await publish(body)).status, 404, 'A finished playlist cannot be rolled back to a partial one');
  await env.DB.prepare("UPDATE jobs SET status='failed',error_code='GENERATION_FAILED',lease_until=NULL WHERE id=?")
    .bind(row.jobId)
    .run();
  assert.equal((await view(agencyId, 'segment-000000.ts')).status, 404);
});
