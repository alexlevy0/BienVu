import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import {
  defaultVideoCustomization,
  VideoCustomization,
  GenerationRequest,
  VideoManifest,
  videoStyles,
  generationCreditCost,
  videoPresentation,
  videoPhotoTimeline,
} from '../packages/contracts/src/index';
import {
  DesignedPhotoScene,
  PreviewLayers,
  photoStage,
  canvasColor,
  galleryMotion,
  galleryPhotoIndex,
} from '../packages/presentation/src/index';
import { videoFixture } from '../fixtures/video';
const require = createRequire(new URL('../apps/web/package.json', import.meta.url)),
  { createElement } = require('react'),
  { renderToStaticMarkup } = require('react-dom/server');
const added = ['signature', 'mosaic', 'dynamic'] as const;
test('Six styles : contrats communs, choix mémorisé et aucun supplément de crédit', () => {
  assert.equal(videoStyles.length, 6);
  assert.equal(new Set(videoStyles.map((s) => s.id)).size, 6);
  assert.equal(defaultVideoCustomization().style, 'cinematic');
  for (const style of added) {
    const settings = { ...defaultVideoCustomization(), style };
    assert.ok(VideoCustomization.safeParse(settings).success);
    assert.ok(GenerationRequest.safeParse({ listingId: 'listing-styles', customization: settings }).success);
    assert.equal(generationCreditCost(settings, 40), generationCreditCost(defaultVideoCustomization(), 40));
    assert.equal(VideoCustomization.parse(JSON.parse(JSON.stringify(settings))).style, style);
  }
  assert.equal(VideoCustomization.safeParse({ ...defaultVideoCustomization(), style: 'unknown-style' }).success, false);
});
test('Photos encadrées : cadrages dans le canevas et déplacements sans bord vide', () => {
  for (const style of added)
    for (const [width, height] of [
      [1080, 1920],
      [1920, 1080],
    ]) {
      const stage = photoStage(style, width, height) ?? { left: 0, top: 0, width, height };
      assert.ok(
        stage.left >= 0 && stage.top >= 0 && stage.left + stage.width <= width && stage.top + stage.height <= height,
      );
      for (let index = 0; index < 12; index++)
        for (let frame = 0; frame < 600; frame += 17) {
          const m = galleryMotion(frame, 180, index, true, style, width, height);
          assert.ok(Math.abs(m.x) <= ((m.scale - 1) * stage.width) / 2);
          assert.ok(Math.abs(m.y) <= ((m.scale - 1) * stage.height) / 2);
        }
      assert.deepEqual(galleryMotion(90, 180, 0, false, style, width, height), { scale: 1, x: 0, y: 0 });
    }
  assert.notEqual(canvasColor('signature'), canvasColor('mosaic'));
});
test('Trois compositions distinctes : vrais biens, textes complets, sous-titres et mosaïque des seules photos choisies', async () => {
  const fixture = await videoFixture('paid', 4),
    media = Object.fromEntries(fixture.manifest.photos.map((p) => [p.id, `/media/${p.id}.png`]));
  const total = fixture.manifest.scenes.reduce((sum, scene) => sum + scene.durationFrames, 0);
  for (const style of added)
    for (const wide of [false, true]) {
      const manifest = VideoManifest.parse({
        ...fixture.manifest,
        visualStyle: style,
        templateVersion: wide ? 'bienvu-horizontal/1' : 'bienvu-vertical/2',
        width: wide ? 1920 : 1080,
        height: wide ? 1080 : 1920,
        presentation: videoPresentation(fixture.listing),
        photoTimeline: videoPhotoTimeline(fixture.manifest.photos, total),
        subtitlesEnabled: true,
      });
      for (const index of [0, 1, manifest.scenes.length - 1])
        for (const frame of [0, 45]) {
          const html = renderToStaticMarkup(
            createElement(DesignedPhotoScene, { manifest, media, index, frame, Layers: PreviewLayers }),
          );
          assert.ok(html.includes(`data-bienvu-style="${style}"`));
          assert.ok(html.includes('data-bienvu-subtitle="true"'));
          assert.ok(html.includes(manifest.brand.name));
          assert.ok(!html.includes('NaN') && !html.includes('undefined'));
          assert.equal((html.match(/data-bienvu-mosaic-photo=/g) ?? []).length, style === 'mosaic' ? 2 : 0);
          for (const match of html.matchAll(/data-bienvu-mosaic-photo="([^"]+)"/g))
            assert.ok(manifest.photos.some((photo) => photo.id === match[1]));
          const hidden = renderToStaticMarkup(
            createElement(DesignedPhotoScene, {
              manifest: { ...manifest, subtitlesEnabled: false },
              media,
              index,
              frame,
              Layers: PreviewLayers,
            }),
          );
          assert.ok(!hidden.includes('data-bienvu-subtitle'));
        }
      assert.equal(galleryPhotoIndex(manifest, -1), 0);
      assert.equal(galleryPhotoIndex(manifest, total - 1), 3);
    }
});
