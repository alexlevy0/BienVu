import { test } from 'node:test';
import assert from 'node:assert/strict';
import { homeHeroDepth } from '../apps/web/lib/home-hero-depth-assets';
import { publicHeroDepthMedia } from '../apps/web/lib/home-hero-depth-media';
import { hasHeroDepth, heroAvatarFormat } from '../apps/web/lib/home-hero-depth';

test('Hero desktop : aucune composition si la vidéo change et choix du format transparent selon le navigateur', () => {
  assert.equal(hasHeroDepth({ sha256: homeHeroDepth.sourceSha256 }), true);
  assert.equal(hasHeroDepth({ sha256: '0'.repeat(64) }), false);
  assert.equal(hasHeroDepth({}), false);
  assert.equal(heroAvatarFormat('Mozilla/5.0 AppleWebKit/605.1.15 Version/18.0 Safari/605.1.15'), 'avatarHevc');
  assert.equal(heroAvatarFormat('Mozilla/5.0 AppleWebKit/537.36 Chrome/131.0.0.0 Safari/537.36'), 'avatarWebm');
  assert.equal(heroAvatarFormat('Mozilla/5.0 Gecko/20100101 Firefox/131.0'), 'avatarWebm');
});
test('Hero : seules les cinq copies marketing sont publiques, les médias privés ne sont jamais adressables', async () => {
  const accessed: string[] = [];
  let current = Object.values(homeHeroDepth.assets)[0];
  const bucket = {
    head: async (key: string) => {
      accessed.push(key);
      return { size: current.sizeBytes, customMetadata: { sha256: current.sha256 } };
    },
    get: async (key: string, options?: R2GetOptions) => {
      accessed.push(key);
      const range = options?.range as { offset: number; length: number };
      return { body: new Blob([new Uint8Array(Math.min(range.length, 64))]).stream() };
    },
  } as unknown as Pick<R2Bucket, 'head' | 'get'>;
  for (const id of [
    '5641e717-c133-4852-9153-06c206d5919f',
    'agencies/private/avatars/clip.webm',
    '__proto__',
    'avatar.webm',
  ])
    assert.equal((await publicHeroDepthMedia(bucket, id, new Request('https://bienvu.test/media'))).status, 404);
  assert.equal(accessed.length, 0);
  for (const asset of Object.values(homeHeroDepth.assets)) {
    current = asset;
    const r = await publicHeroDepthMedia(
      bucket,
      asset.id,
      new Request('https://bienvu.test/media', { headers: { Range: 'bytes=10-25' } }),
    );
    assert.equal(r.status, 206);
    assert.equal(r.headers.get('Content-Type'), asset.mime);
    assert.equal(r.headers.get('Content-Range'), `bytes 10-25/${asset.sizeBytes}`);
    assert.equal((await r.arrayBuffer()).byteLength, 16);
    assert.equal(accessed.at(-1), asset.key);
    const before: number = accessed.length,
      head = await publicHeroDepthMedia(bucket, asset.id, new Request('https://bienvu.test/media', { method: 'HEAD' }));
    assert.equal(head.status, 200);
    assert.equal(accessed.length, before + 1);
    assert.equal(
      (
        await publicHeroDepthMedia(
          bucket,
          asset.id,
          new Request('https://bienvu.test/media', { headers: { 'If-None-Match': `"${asset.sha256}"` } }),
        )
      ).status,
      304,
    );
    assert.equal(
      (
        await publicHeroDepthMedia(
          bucket,
          asset.id,
          new Request('https://bienvu.test/media', { headers: { Range: 'bytes=9007199254740993-' } }),
        )
      ).status,
      416,
    );
  }
  bucket.head = async () => ({ size: 1 }) as R2Object;
  assert.equal((await publicHeroDepthMedia(bucket, current.id, new Request('https://bienvu.test/media'))).status, 404);
});
test('Parallaxe : amplitude bornée, approche progressive et repos à distance', async () => {
  const { heroParallaxTarget } = await import('../apps/web/lib/hero-parallax');
  const box = { left: 100, right: 400, top: 100, bottom: 700, width: 300, height: 600 };
  assert.deepEqual(heroParallaxTarget(250, 400, box), { x: 0, y: 0 });
  assert.deepEqual(heroParallaxTarget(400, 700, box), { x: 1, y: 1 });
  assert.equal(heroParallaxTarget(480, 400, box).x, 0.5);
  assert.deepEqual(heroParallaxTarget(600, 400, box), { x: 0, y: 0 });
  assert.deepEqual(heroParallaxTarget(NaN, 400, box), { x: 0, y: 0 });
});
