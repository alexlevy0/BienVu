import { test } from 'node:test';
import assert from 'node:assert/strict';
import sharp from 'sharp';
import { TRIAL_WATERMARK_SVG, trialWatermarkLayout } from '../packages/video/src/watermark-artwork';
import { writeTrialWatermark } from '../apps/renderer/src/listing-render';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

test('filigrane : signature BienVu vectorielle, sans mention aperçu ni essai', async () => {
  assert.ok(TRIAL_WATERMARK_SVG.includes('<title>BienVu · bienvu.online</title>'));
  assert.doesNotMatch(TRIAL_WATERMARK_SVG, /aperçu|essai|<text|<image|https?:\/\/(?!www.w3.org)/i);
  const { data, info } = await sharp(Buffer.from(TRIAL_WATERMARK_SVG))
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  assert.equal(info.width, 236);
  assert.equal(info.height, 104);
  const alpha = (x: number, y: number) => data[(y * info.width + x) * 4 + 3];
  assert.equal(alpha(0, 0), 0, 'Les coins arrondis restent transparents');
  assert.ok(alpha(12, 52) > 150 && alpha(12, 52) < 220, 'Le fond laisse voir la vidéo');
  assert.ok(
    data.some((v, i) => i % 4 === 3 && v === 255),
    'Le logo reste lisible et opaque',
  );
});

test('filigrane : même coin et même taille en portrait et paysage', () => {
  for (const size of [
    { width: 1080, height: 1920 },
    { width: 1920, height: 1080 },
  ]) {
    assert.deepEqual(trialWatermarkLayout(size), { x: 32, y: 32, width: 236, height: 104 });
  }
});

test('filigrane FFmpeg : mêmes dimensions que la composition, y compris à résolution réduite', async (t) => {
  const dir = await mkdtemp(path.join(tmpdir(), 'bienvu-watermark-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  for (const size of [
    { width: 1080, height: 1920 },
    { width: 1920, height: 1080 },
    { width: 540, height: 960 },
  ]) {
    const file = path.join(dir, 'watermark.png');
    await writeTrialWatermark(file, size);
    const info = await sharp(file).metadata(),
      layout = trialWatermarkLayout(size);
    assert.equal(info.width, layout.width);
    assert.equal(info.height, layout.height);
    assert.ok(info.hasAlpha);
  }
});
