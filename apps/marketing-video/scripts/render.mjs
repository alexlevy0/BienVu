import { bundle } from '@remotion/bundler';
import { renderMedia, renderStill, selectComposition } from '@remotion/renderer';
import { createRequire } from 'node:module';
import { mkdir, writeFile, stat, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { join, dirname } from 'node:path';
import { createHash } from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const root = fileURLToPath(new URL('../', import.meta.url));
const out = join(root, 'renders');
await mkdir(out, { recursive: true });
const require = createRequire(import.meta.url);
const rendererRequire = createRequire(require.resolve('@remotion/renderer'));
const native = dirname(
  rendererRequire.resolve(`@remotion/compositor-${process.platform}-${process.arch}/package.json`),
);
const exec = promisify(execFile);
const started = Date.now();
// The packaged macOS native binaries load dylibs relative to their current directory.
process.chdir(native);
console.log('Bundling the 36-second film…');
const serveUrl = await bundle({
  entryPoint: join(root, 'src/index.tsx'),
  publicDir: join(root, 'public'),
  outDir: join(root, 'out'),
  onProgress: () => {},
});
const browser = {
  browserExecutable:
    process.env.REMOTION_BROWSER_EXECUTABLE ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  chromeMode: 'chrome-for-testing',
};
const composition = await selectComposition({
  serveUrl,
  id: 'BienVuMarketing',
  ...browser,
  timeoutInMilliseconds: 120000,
});
if (process.argv.includes('--stills')) {
  const frames = [105, 225, 405, 555, 735, 885, 1035];
  for (const frame of frames) {
    await renderStill({
      composition,
      serveUrl,
      ...browser,
      frame,
      output: join(out, `frame-${frame}.png`),
      imageFormat: 'png',
      timeoutInMilliseconds: 120000,
    });
    console.log(`Checked frame ${frame} (${(frame / 30).toFixed(1)}s)`);
  }
} else {
  const outputLocation = join(out, 'BienVu-marketing-v1-1080p.mp4');
  let last = -1;
  console.log('Rendering 1920 × 1080 / 30 fps / H.264 + AAC…');
  await renderMedia({
    composition,
    serveUrl,
    ...browser,
    codec: 'h264',
    audioCodec: 'aac',
    pixelFormat: 'yuv420p',
    crf: 18,
    concurrency: 4,
    outputLocation,
    timeoutInMilliseconds: 120000,
    onProgress: (p) => {
      const step = Math.floor(p.progress * 20);
      if (step !== last) {
        last = step;
        console.log(`Render ${Math.round(p.progress * 100)}% — ${p.renderedFrames}/1080 frames`);
      }
    },
  });
  const { stdout } = await exec(
    join(native, 'ffprobe'),
    ['-v', 'error', '-show_format', '-show_streams', '-of', 'json', outputLocation],
    { cwd: native },
  );
  const metadata = JSON.parse(stdout),
    video = metadata.streams.find((s) => s.codec_type === 'video'),
    audio = metadata.streams.find((s) => s.codec_type === 'audio');
  if (
    video?.width !== 1920 ||
    video?.height !== 1080 ||
    video?.avg_frame_rate !== '30/1' ||
    video?.codec_name !== 'h264' ||
    audio?.codec_name !== 'aac' ||
    Math.abs(Number(metadata.format.duration) - 36) > 0.1
  )
    throw new Error('INVALID_DELIVERY_FILE');
  const report = {
    title: 'BienVu — Du mandat au marketing',
    version: '1.0.0',
    sourceVideoId: '5641e717-c133-4852-9153-06c206d5919f',
    durationSeconds: Number(metadata.format.duration),
    width: video.width,
    height: video.height,
    fps: 30,
    videoCodec: video.codec_name,
    audioCodec: audio.codec_name,
    sizeBytes: (await stat(outputLocation)).size,
    sha256: createHash('sha256')
      .update(await readFile(outputLocation))
      .digest('hex'),
    renderSeconds: (Date.now() - started) / 1000,
    paidApiCalls: 0,
    outputLocation,
  };
  await writeFile(join(out, 'delivery.json'), JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify(report, null, 2));
}
