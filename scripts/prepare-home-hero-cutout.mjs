// Offline marketing export. Reads verified local sources only; no generation,
// customer job mutation or provider API call is made by this script.
// node --import tsx scripts/prepare-home-hero-cutout.mjs evidence/local/hero-cutout
import assert from 'node:assert/strict';
import { readFile, writeFile, mkdir, copyFile, stat, chmod } from 'node:fs/promises';
import { resolve, join, dirname } from 'node:path';
import { createRequire } from 'node:module';
import { createHash } from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { VideoManifest, videoAssets, videoAssetFile } from '../packages/contracts/src/index.ts';
import { withVideoAssets } from '../apps/renderer/src/listing-render.ts';
import { measureAvatarContent } from '../apps/renderer/src/avatar-bounds.ts';
const work = resolve(process.argv[2] ?? ''),
  source = VideoManifest.parse(JSON.parse(await readFile(join(work, 'source-manifest.json'), 'utf8')));
const before = JSON.parse(await readFile(join(work, 'homepage-before.json'), 'utf8')),
  sourceSha256 = JSON.parse(before.asset.metadata_json).sha256;
assert.ok(!source.editor, 'Marketing layer export requires the listing composition');
try {
  const previous = JSON.parse(await readFile(join(work, 'prepared.json'), 'utf8'));
  assert.equal(previous.sourceSha256, sourceSha256, 'Use a fresh working directory for a different source movie');
} catch (error) {
  if (error.code !== 'ENOENT') throw error;
}
assert.equal(source.avatar?.clips.length, 1);
const clip = source.avatar.clips[0];
assert.ok(clip.transparent);
assert.equal(clip.startFrame, 0);
assert.equal(clip.durationFrames, 1200);
const require = createRequire(new URL('../apps/renderer/package.json', import.meta.url)),
  { renderMedia, selectComposition } = require('@remotion/renderer'),
  sharp = require('sharp');
const rr = createRequire(require.resolve('@remotion/renderer')),
  binaries = dirname(rr.resolve(`@remotion/compositor-darwin-${process.arch}/package.json`));
const ffmpeg = join(binaries, 'ffmpeg'),
  ffprobe = join(binaries, 'ffprobe');
process.env.BIENVU_FFMPEG_PATH = ffmpeg;
process.env.BIENVU_FFPROBE_PATH = ffprobe;
process.env.DYLD_LIBRARY_PATH = binaries;
const run = (args) =>
  promisify(execFile)(ffmpeg, ['-hide_banner', '-loglevel', 'error', ...args], {
    env: { ...process.env, DYLD_LIBRARY_PATH: binaries },
    timeout: 600000,
    maxBuffer: 1000000,
  });
const renderDir = join(work, 'render');
await mkdir(renderDir, { recursive: true, mode: 0o700 });
const background = VideoManifest.parse({ ...source, avatar: undefined });
for (const asset of videoAssets(background)) {
  const bytes = await readFile(join(work, 'assets', asset.sha256));
  assert.equal(bytes.length, asset.sizeBytes);
  assert.equal(createHash('sha256').update(bytes).digest('hex'), asset.sha256);
  await copyFile(join(work, 'assets', asset.sha256), join(renderDir, videoAssetFile(asset)));
}
await writeFile(join(renderDir, 'manifest.json'), JSON.stringify(background), { mode: 0o600 });
const backgroundFile = join(work, 'background-clean.mp4');
try {
  await stat(backgroundFile);
} catch {
  await withVideoAssets(background, renderDir, async (props) => {
    const serveUrl = resolve('out/remotion-bundle'),
      composition = await selectComposition({
        serveUrl,
        id: 'BienVuListing',
        inputProps: { ...props, marketingLayer: 'background' },
      });
    let last = -1;
    await renderMedia({
      serveUrl,
      composition,
      inputProps: { ...props, marketingLayer: 'background' },
      codec: 'h264',
      audioCodec: 'aac',
      scale: 1 / 2,
      outputLocation: backgroundFile,
      concurrency: 4,
      crf: 25,
      audioBitrate: '96k',
      pixelFormat: 'yuv420p',
      logLevel: 'error',
      timeoutInMilliseconds: 120000,
      onProgress: (p) => {
        const n = Math.floor(p.progress * 10);
        if (n !== last) {
          last = n;
          console.log(JSON.stringify({ backgroundPercent: n * 10 }));
        }
      },
    });
  });
}
const foregroundProres = join(work, 'foreground-prores.mov'),
  foregroundWebm = join(work, 'foreground.webm'),
  foregroundHevc = join(work, 'foreground.mov');
try {
  await stat(foregroundProres);
} catch {
  await withVideoAssets(background, renderDir, async (props) => {
    const serveUrl = resolve('out/remotion-bundle'),
      inputProps = { ...props, marketingLayer: 'foreground' },
      composition = await selectComposition({ serveUrl, id: 'BienVuListing', inputProps });
    let last = -1;
    await renderMedia({
      serveUrl,
      composition,
      inputProps,
      codec: 'prores',
      proResProfile: '4444',
      pixelFormat: 'yuva444p10le',
      imageFormat: 'png',
      scale: 1 / 2,
      outputLocation: foregroundProres,
      concurrency: 4,
      muted: true,
      logLevel: 'error',
      timeoutInMilliseconds: 120000,
      onProgress: (p) => {
        const n = Math.floor(p.progress * 10);
        if (n !== last) {
          last = n;
          console.log(JSON.stringify({ foregroundPercent: n * 10 }));
        }
      },
    });
  });
}
try {
  await stat(foregroundWebm);
} catch {
  await run([
    '-i',
    foregroundProres,
    '-an',
    '-c:v',
    'libvpx-vp9',
    '-crf',
    '24',
    '-b:v',
    '0',
    '-deadline',
    'good',
    '-cpu-used',
    '4',
    '-row-mt',
    '1',
    '-threads',
    '4',
    '-pix_fmt',
    'yuva420p',
    '-y',
    foregroundWebm,
  ]);
}
try {
  await stat(foregroundHevc);
} catch {
  await promisify(execFile)(
    '/usr/bin/avconvert',
    [
      '--source',
      foregroundProres,
      '--preset',
      'PresetHEVCHighestQualityWithAlpha',
      '--output',
      foregroundHevc,
      '--replace',
    ],
    { timeout: 240000, maxBuffer: 1000000 },
  );
}
const avatarFile = join(work, 'assets', clip.asset.sha256),
  bounds = await measureAvatarContent(avatarFile, 720, 1280, 40000, ffmpeg);
// Crop the union of moving content, with even dimensions and a small edge guard.
const x = Math.max(0, Math.floor((bounds.left - 10) / 2) * 2),
  y = Math.max(0, Math.floor((bounds.top - 10) / 2) * 2);
const width = Math.min(720 - x, Math.ceil((bounds.left + bounds.width + 10 - x) / 2) * 2),
  height = Math.min(1280 - y, Math.ceil((bounds.top + bounds.height + 2 - y) / 2) * 2);
const filter = `crop=${width}:${height}:${x}:${y},scale=480:-2:flags=lanczos,format=yuva420p`;
console.log(JSON.stringify({ avatarCrop: { x, y, width, height } }));
const avatarWebm = join(work, 'avatar.webm'),
  prores = join(work, 'avatar-prores.mov'),
  avatarHevc = join(work, 'avatar.mov');
try {
  await stat(avatarWebm);
} catch {
  await run([
    '-c:v',
    'libvpx-vp9',
    '-i',
    avatarFile,
    '-vf',
    filter,
    '-an',
    '-c:v',
    'libvpx-vp9',
    '-crf',
    '32',
    '-b:v',
    '0',
    '-deadline',
    'good',
    '-cpu-used',
    '4',
    '-row-mt',
    '1',
    '-threads',
    '4',
    '-pix_fmt',
    'yuva420p',
    '-y',
    avatarWebm,
  ]);
}
try {
  await stat(avatarHevc);
} catch {
  await run([
    '-c:v',
    'libvpx-vp9',
    '-i',
    avatarFile,
    '-vf',
    filter,
    '-an',
    '-c:v',
    'prores_ks',
    '-profile:v',
    '4',
    '-pix_fmt',
    'yuva444p10le',
    '-threads',
    '4',
    '-y',
    prores,
  ]);
  await promisify(execFile)(
    '/usr/bin/avconvert',
    ['--source', prores, '--preset', 'PresetHEVCHighestQualityWithAlpha', '--output', avatarHevc, '--replace'],
    { timeout: 240000, maxBuffer: 1000000 },
  );
}
const publicImages = resolve('apps/web/public/images/studio-home'),
  prefix = 'hero-depth-' + sourceSha256.slice(0, 12);
await mkdir(publicImages, { recursive: true });
const bgPng = join(work, 'background.png'),
  avatarPng = join(work, 'avatar.png'),
  foregroundPng = join(work, 'foreground.png');
await run(['-ss', '0.5', '-i', backgroundFile, '-frames:v', '1', '-y', bgPng]);
await run(['-c:v', 'libvpx-vp9', '-ss', '0.5', '-i', avatarWebm, '-frames:v', '1', '-y', avatarPng]);
await run(['-c:v', 'libvpx-vp9', '-ss', '0.5', '-i', foregroundWebm, '-frames:v', '1', '-y', foregroundPng]);
await sharp(foregroundPng)
  .webp({ quality: 90, alphaQuality: 100 })
  .toFile(join(publicImages, prefix + '-foreground.webp'));
await sharp(bgPng)
  .resize({ width: 640 })
  .webp({ quality: 80 })
  .toFile(join(publicImages, prefix + '-background.webp'));
await sharp(avatarPng)
  .webp({ quality: 85, alphaQuality: 95 })
  .toFile(join(publicImages, prefix + '-avatar.webp'));
const assets = [];
for (const [kind, file, mime] of [
  ['background', backgroundFile, 'video/mp4'],
  ['avatarWebm', avatarWebm, 'video/webm'],
  ['avatarHevc', avatarHevc, 'video/quicktime'],
  ['foregroundWebm', foregroundWebm, 'video/webm'],
  ['foregroundHevc', foregroundHevc, 'video/quicktime'],
]) {
  const bytes = await readFile(file),
    sha256 = createHash('sha256').update(bytes).digest('hex'),
    extension = file.split('.').at(-1);
  const metadata = JSON.parse(
    (
      await promisify(execFile)(ffprobe, ['-v', 'error', '-show_format', '-show_streams', '-of', 'json', file], {
        env: { ...process.env, DYLD_LIBRARY_PATH: binaries },
      })
    ).stdout,
  );
  const video = metadata.streams.find((s) => s.codec_type === 'video');
  assert.ok(Math.abs(Number(metadata.format.duration) - 40) < 0.12);
  if (kind === 'background') assert.equal(Number(video.nb_frames), 1200);
  if (kind.endsWith('Webm')) assert.equal(String(video.tags?.alpha_mode ?? video.tags?.ALPHA_MODE), '1');
  assets.push({
    kind,
    id: kind + '-' + sha256.slice(0, 16) + '.' + extension,
    sha256,
    sizeBytes: bytes.length,
    mime,
    key: 'public/home-hero-depth/' + sha256 + '.' + extension,
    width: video.width,
    height: video.height,
    duration: 40,
  });
  await chmod(file, 0o600);
}
const result = {
  sourceSha256,
  duration: 40,
  backgroundPoster: '/images/studio-home/' + prefix + '-background.webp',
  avatarPoster: '/images/studio-home/' + prefix + '-avatar.webp',
  foregroundPoster: '/images/studio-home/' + prefix + '-foreground.webp',
  assets,
};
await writeFile(join(work, 'prepared.json'), JSON.stringify(result, null, 2), { mode: 0o600 });
await writeFile(
  'apps/web/lib/home-hero-depth-assets.ts',
  '// Explicit marketing copies of the existing homepage movie. Rebuild with scripts/prepare-home-hero-cutout.mjs.\nexport const homeHeroDepth = ' +
    JSON.stringify({ ...result, assets: Object.fromEntries(assets.map((asset) => [asset.kind, asset])) }, null, 2) +
    ' as const;\n',
);
console.log(
  JSON.stringify({
    prepared: true,
    sourceSha256,
    assets: assets.map(({ kind, sizeBytes, width, height }) => ({ kind, sizeBytes, width, height })),
  }),
);
