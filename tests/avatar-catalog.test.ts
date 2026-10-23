import { test } from 'node:test';
import { Miniflare, convertV4MiniflareOptions } from 'miniflare';
import { avatarPublicationFixture } from './avatar-publication-fixture';
import assert from 'node:assert/strict';
import { AvatarLook, DEFAULT_AVATAR_SETTINGS } from '../packages/contracts/src/index';
import { avatarCatalog } from '../packages/db/src/avatars';
import { avatarMediaVersion, avatarCatalogKey, heygenClient } from '../packages/avatars/src/index';
import { streamAvatarCatalogue } from '../apps/web/lib/avatar-media-stream';
import { avatarMediaRequest } from '../apps/web/lib/avatars';

const look = AvatarLook.parse({
  id: 'fixture-look',
  name: 'Avatar de recette',
  gender: 'female',
  type: 'studio_avatar',
  engines: ['avatar_iii'],
  enabled: true,
  thumbnail: '/portrait',
  preview: '/extrait',
  transparentVerified: false,
  ownership: 'public',
  updatedAt: '2026-10-09',
});
const bytes = new TextEncoder().encode('abcdefghij'),
  reads: { offset: number; length: number }[] = [];
const bucket = {
  async head() {
    return { size: bytes.length, httpEtag: '"fixture"', httpMetadata: { contentType: 'video/mp4' } };
  },
  async get(_key: string, options?: { range: { offset: number; length: number } }) {
    const range = options?.range;
    if (range) reads.push(range);
    return { body: range ? bytes.slice(range.offset, range.offset + range.length) : bytes };
  },
} as unknown as Pick<R2Bucket, 'head' | 'get'>;
test('Extraits publics : Range, suffixe, HEAD, ETag et revalidation sans lecture du corps', async () => {
  const request = (headers: Record<string, string>, method = 'GET') =>
    new Request('https://bienvu.online/extrait', { headers, method });
  let response = await streamAvatarCatalogue(request({ Range: 'bytes=2-4' }), bucket, 'fixture');
  assert.equal(response.status, 206);
  assert.equal(await response.text(), 'cde');
  assert.equal(response.headers.get('content-range'), 'bytes 2-4/10');
  assert.equal(response.headers.get('content-length'), '3');
  assert.equal(response.headers.get('accept-ranges'), 'bytes');
  response = await streamAvatarCatalogue(request({ Range: 'bytes=-3' }), bucket, 'fixture');
  assert.equal(await response.text(), 'hij');
  const before = reads.length;
  response = await streamAvatarCatalogue(request({ 'If-None-Match': '"fixture"' }), bucket, 'fixture');
  assert.equal(response.status, 304);
  assert.equal(reads.length, before);
  response = await streamAvatarCatalogue(request({ Range: 'bytes=0-2' }, 'HEAD'), bucket, 'fixture');
  assert.equal(response.status, 206);
  assert.equal(await response.text(), '');
  assert.equal(reads.length, before);
  response = await streamAvatarCatalogue(request({ Range: 'bytes=0-2', 'If-Range': '"old"' }), bucket, 'fixture');
  assert.equal(response.status, 200);
  assert.equal(await response.text(), 'abcdefghij');
  for (const range of ['bytes=99-', 'bytes=3-1', 'bytes=-0', 'bytes=0-1,4-5', 'bytes=9007199254740992-'])
    assert.equal((await streamAvatarCatalogue(request({ Range: range }), bucket, 'fixture')).status, 416);
});
test('Catalogue : public, actif et moteur compatible, défaut conservé en premier', async (t) => {
  const looks = [
    { ...look, id: 'inactive', enabled: false },
    { ...look, id: 'private', ownership: 'private' },
    { ...look, id: 'premium', engines: ['avatar_iv'] },
    { ...look, id: 'other' },
    look,
  ];
  const mf = new Miniflare(
    convertV4MiniflareOptions({
      modules: true,
      script: 'export default {fetch(){return new Response("fixture")}}',
      compatibilityDate: '2026-09-27',
      d1Databases: ['DB'],
    }),
  );
  t.after(() => mf.dispose());
  const db = await mf.getD1Database('DB');
  await db.exec(
    'CREATE TABLE avatar_settings(id INTEGER PRIMARY KEY,settings_json TEXT,revision INTEGER); CREATE TABLE avatar_looks(id TEXT PRIMARY KEY,look_json TEXT,source_json TEXT,enabled INTEGER);',
  );
  await db
    .prepare('INSERT INTO avatar_settings VALUES(1,?,1)')
    .bind(JSON.stringify({ ...DEFAULT_AVATAR_SETTINGS, enabled: true, defaultLookId: look.id }))
    .run();
  for (const item of looks)
    await db
      .prepare('INSERT INTO avatar_looks VALUES(?,?,?,?)')
      .bind(item.id, JSON.stringify(item), '{}', item.enabled ? 1 : 0)
      .run();
  await avatarPublicationFixture(
    db,
    [look.id, ...looks.map((item) => item.id).filter((id) => id !== look.id)],
    look.id,
  );
  const catalog = await avatarCatalog(db as never);
  assert.deepEqual(
    catalog.looks.map((l) => l.id),
    [look.id, 'other'],
  );
  assert.equal(catalog.defaultLookId, look.id);
});
test('Version des médias : changement de source invalide les dérivés sans exposer l’URL fournisseur', async () => {
  const a = await avatarMediaVersion('https://files.heygen.ai/a.webp'),
    b = await avatarMediaVersion('https://files.heygen.ai/b.webp');
  assert.match(a, /^[a-f0-9]{16}$/);
  assert.notEqual(a, b);
  assert.equal(await avatarMediaVersion('https://files.heygen.ai/a.webp'), a);
  assert.match(avatarCatalogKey(look.id, 'thumbnail', a), /^catalogue\/heygen\/fixture-look\/thumbnail-320-v1-/);
  assert.match(avatarCatalogKey(look.id, 'preview', a), /^catalogue\/heygen\/fixture-look\/preview-source-v2-/);
  assert.throws(() => avatarCatalogKey('../private', 'preview', a));
});
test('Catalogue HeyGen : exclut les portraits non prêts et conserve le curseur opaque', async () => {
  let called = '';
  const raw = {
    id: look.id,
    name: look.name,
    avatar_type: 'studio_avatar',
    gender: 'female',
    group_id: 'heygen-identity',
    tags: ['business', 'formal'],
    supported_api_engines: ['avatar_iii'],
    preview_image_url: 'https://files.heygen.ai/a.webp',
    status: 'completed',
  };
  const client = heygenClient('fixture', async (url) => {
    called = String(url);
    return Response.json({
      data: [
        raw,
        { ...raw, id: 'pending', status: 'processing' },
        { ...raw, id: 'failed', status: 'failed' },
        { ...raw, id: 'unsupported', supported_api_engines: ['avatar_v'] },
      ],
      next_token: 'opaque-next',
    });
  });
  const page = await client.looks('studio_avatar', 'opaque-current');
  assert.equal(page.looks.length, 1);
  assert.equal(page.looks[0].look.enabled, false);
  assert.equal(page.looks[0].look.groupId, 'heygen-identity');
  assert.deepEqual(page.looks[0].look.tags, ['business', 'formal']);
  assert.equal(page.nextToken, 'opaque-next');
  assert.equal(new URL(called).searchParams.get('token'), 'opaque-current');
  assert.equal(new URL(called).searchParams.get('ownership'), 'public');
});
test('Média catalogue : visibilité avant R2, cache uniquement des réponses publiques réussies', async () => {
  const source = { image: 'https://files.heygen.ai/a.webp', video: 'https://files.heygen.ai/a.mp4' };
  function env(value: typeof look) {
    return {
      DB: {
        async batch() {
          return [];
        },
        async exec() {
          return {};
        },
        prepare() {
          return {
            bind() {
              return this;
            },
            async first() {
              return { look: JSON.stringify(value), source: JSON.stringify(source) };
            },
          };
        },
      },
      MEDIA: bucket,
      BETTER_AUTH_URL: 'https://bienvu.online',
      BETTER_AUTH_SECRET: 'fixture-secret-longer-than-thirty-two-characters',
    } as never;
  }
  let response = await avatarMediaRequest(
    new Request('https://bienvu.online/api/avatars/fixture-look/media?kind=preview'),
    env(look),
    look.id,
  );
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('cache-control'), 'public, max-age=300');
  response = await avatarMediaRequest(
    new Request('https://bienvu.online/api/avatars/fixture-look/media?kind=preview', {
      headers: { 'If-None-Match': '"fixture"' },
    }),
    env(look),
    look.id,
  );
  assert.equal(response.status, 304);
  response = await avatarMediaRequest(
    new Request('https://bienvu.online/api/avatars/fixture-look/media?kind=preview&v=obsolete'),
    env(look),
    look.id,
  );
  assert.equal(response.status, 404);
  assert.equal(response.headers.get('cache-control'), 'private, no-store');
  response = await avatarMediaRequest(
    new Request('https://bienvu.online/api/avatars/fixture-look/media?kind=preview'),
    env({ ...look, ownership: 'private' }),
    look.id,
  );
  assert.equal(response.status, 404);
  response = await avatarMediaRequest(
    new Request('https://bienvu.online/api/avatars/fixture-look/media?kind=preview'),
    env({ ...look, enabled: false }),
    look.id,
  );
  assert.equal(response.status, 401);
  assert.equal(response.headers.get('cache-control'), 'private, no-store');
});
test('Extraits : ignore l’ancien dérivé 320px et sert la source exacte puis ses plages depuis R2', async (t) => {
  const mf = new Miniflare(
    convertV4MiniflareOptions({
      modules: true,
      script: 'export default {fetch(){return new Response("fixture")}}',
      compatibilityDate: '2026-09-27',
      r2Buckets: ['MEDIA'],
    }),
  );
  t.after(() => mf.dispose());
  const { MEDIA: media } = await mf.getBindings<{ MEDIA: R2Bucket }>(),
    source = { image: null, video: 'https://files.heygen.ai/original-demo.mp4' },
    version = await avatarMediaVersion(source.video);
  const original = new Uint8Array([
    0,
    0,
    0,
    24,
    102,
    116,
    121,
    112,
    ...new TextEncoder().encode('original-HD-demo-never-reencoded'),
  ]);
  const oldKey = `catalogue/heygen/${look.id}/preview-v1-${version}`,
    key = avatarCatalogKey(look.id, 'preview', version);
  await media.put(oldKey, 'old-low-quality-demo', { httpMetadata: { contentType: 'video/mp4' } });
  const env = {
    DB: {
      prepare() {
        return {
          bind() {
            return this;
          },
          async first() {
            return { look: JSON.stringify(look), source: JSON.stringify(source) };
          },
        };
      },
    },
    MEDIA: media,
  } as never;
  let downloads = 0;
  const before = globalThis.fetch;
  t.after(() => {
    globalThis.fetch = before;
  });
  globalThis.fetch = async (url) => {
    assert.equal(String(url), source.video);
    downloads++;
    return new Response(original, { headers: { 'Content-Length': String(original.length) } });
  };
  const url = `https://bienvu.online/api/avatars/${look.id}/media?kind=preview&v=${version}&quality=original`;
  let response = await avatarMediaRequest(new Request(url), env, look.id);
  assert.equal(response.status, 200);
  assert.deepEqual(new Uint8Array(await response.arrayBuffer()), original);
  assert.equal(downloads, 1);
  assert.deepEqual(new Uint8Array(await (await media.get(key))!.arrayBuffer()), original);
  assert.equal(await (await media.get(oldKey))!.text(), 'old-low-quality-demo');
  response = await avatarMediaRequest(new Request(url, { headers: { Range: 'bytes=8-18' } }), env, look.id);
  assert.equal(response.status, 206);
  assert.deepEqual(new Uint8Array(await response.arrayBuffer()), original.slice(8, 19));
  assert.equal(downloads, 1, 'La source est téléchargée une seule fois, puis lue par plages depuis R2');
});
