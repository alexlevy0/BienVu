import { test } from 'node:test';
import assert from 'node:assert/strict';
import sharp from 'sharp';
import { Miniflare, convertV4MiniflareOptions } from 'miniflare';
import {
  CreationDraftView,
  GenerationRequest,
  defaultVideoCustomization,
  customizedListing,
  createEditorDocument,
  GoogleVoiceConfig,
  selectedAnimationIndices,
} from '../packages/contracts/src/index';
import { createPrivateImport, importResult } from '../apps/web/lib/imports';
import {
  customizeImportedListing,
  patchCreationDraft,
  finishCreationDraft,
  uploadCreationPhoto,
  startManualCreationDraft,
} from '../apps/web/lib/creation-drafts';
import { urlImportPhotoSlots } from '../apps/web/components/url-import-estimate';
import { snapshotEditorExport } from '../apps/web/lib/video-editor';
import { migrateNarrationProbe, seedNarrationFixture } from '../scripts/narration-fixtures';
import { admitGeneration, findImport, findNarration } from '../packages/db/src/index';
import { loadGenerationListing } from '../apps/pipeline/src/generation-import';
import { prepareJobNarration } from '../apps/pipeline/src/narration';
import { prepareJobAnimations } from '../apps/pipeline/src/photo-animations';
import { prepareJobVideo } from '../apps/pipeline/src/video-manifest';
import { googleTts } from '../packages/voice/src/index';
import { toneFixture } from '../fixtures/voice';
import { DEFAULT_SCRIPT_MODEL } from '../packages/narration/src/index';
import { fixtureImportTransport } from '../scripts/import-fixtures';
import type { ImportTransport } from '../packages/importers/src/network';

const source = 'https://fixtures.bienvu.example/vente';
test('Galerie de 30 photos : import ordonné par paires, choix des douze dernières, export et facturation bornés', async (t) => {
  const mf = new Miniflare(
    convertV4MiniflareOptions({
      modules: true,
      script: 'export default {fetch(){return new Response("fixture")}}',
      compatibilityDate: '2026-09-27',
      d1Databases: ['DB'],
      r2Buckets: ['MEDIA'],
    }),
  );
  t.after(() => mf.dispose());
  const env = await mf.getBindings<{ DB: D1Database; MEDIA: R2Bucket }>();
  await migrateNarrationProbe(env.DB);
  const seed = await seedNarrationFixture(env.DB, 'gallery-thirty', true);
  await env.DB.prepare("UPDATE jobs SET status='failed',error_code='FIXTURE',lease_until=NULL WHERE id=?")
    .bind(seed.jobId)
    .run();
  await env.DB.exec("UPDATE generation_control SET enabled=1; UPDATE allocations SET kind='paid',quota_limit=40");
  await env.DB.prepare('INSERT INTO generation_access VALUES(?,?,1)')
    .bind(seed.agencyId, 'allocation-gallery-thirty')
    .run();
  await env.DB.prepare('INSERT INTO hosted_import_budget VALUES(?,0,9500,0)')
    .bind(new Date().toISOString().slice(0, 7))
    .run();
  const base = fixtureImportTransport(),
    images = await Promise.all(
      Array.from({ length: 30 }, (_, i) =>
        sharp({ create: { width: 960, height: 640, channels: 3, background: { r: 15 + i * 7, g: 80, b: 120 } } })
          .jpeg()
          .toBuffer(),
      ),
    );
  let active = 0,
    peak = 0,
    photoRequests = 0;
  const transport: ImportTransport = {
    load: async (value, kind, hosts, signal, maxBytes) => {
      if (kind === 'page') {
        const result = await base.load(value, kind, hosts, signal, maxBytes),
          html = new TextDecoder()
            .decode(result.bytes)
            .replace(
              '"/photos/a.jpg","/photos/b.jpg","/photos/c.jpg"',
              Array.from({ length: 30 }, (_, i) => `"/photos/gallery-${i}.jpg"`).join(','),
            );
        const bytes = new TextEncoder().encode(html);
        return { ...result, bytes, sourceBytes: bytes.length };
      }
      const index = Number(/gallery-(\d+)\.jpg$/.exec(value)![1]);
      photoRequests++;
      active++;
      peak = Math.max(peak, active);
      await new Promise((resolve) => setTimeout(resolve, index % 2 === 0 ? 8 : 1));
      active--;
      return {
        url: value,
        bytes: new Uint8Array(images[index]),
        sourceBytes: images[index].length,
        mime: 'image/jpeg',
        width: 960,
        height: 640,
      };
    },
  };
  const imported = await createPrivateImport(env, seed.agencyId, source, 'thirty-photo-source-001', transport),
    listing = importResult(imported).listing!;
  assert.equal(imported.status, 'ready');
  assert.equal(listing.photos.length, 30);
  assert.equal(photoRequests, 30);
  assert.equal(peak, 2);
  assert.equal(active, 0);
  assert.deepEqual(
    listing.photos.map((p) => p.sourceUrl),
    Array.from({ length: 30 }, (_, i) => new URL(`/photos/gallery-${i}.jpg`, source).href),
  );
  assert.deepEqual(
    urlImportPhotoSlots({ id: listing.id, status: 'ready', listing, draft: null }),
    Array.from({ length: 12 }, (_, i) => i),
  );
  assert.deepEqual(
    customizedListing(listing).photos.map((p) => p.id),
    listing.photos.slice(0, 12).map((p) => p.id),
  );
  const draft = await customizeImportedListing(
    env,
    seed.agencyId,
    listing.id,
    'thirty-photo-custom-001',
    AbortSignal.timeout(30_000),
  );
  assert.equal(CreationDraftView.parse(draft).photos.length, 30);
  assert.equal(
    (
      await customizeImportedListing(
        env,
        seed.agencyId,
        listing.id,
        'thirty-photo-custom-001',
        AbortSignal.timeout(30_000),
      )
    ).photos.length,
    30,
  );
  await assert.rejects(
    customizeImportedListing(env, 'other-agency', listing.id, 'thirty-photo-custom-001', AbortSignal.timeout(1000)),
    /NOT_FOUND/,
  );
  const order = Array.from({ length: 12 }, (_, i) => 29 - i),
    settings = {
      ...defaultVideoCustomization(),
      photoOrder: order,
      runwayPhotos: order,
      mapDisabled: true,
      narration: [
        'Découvrez cet appartement à Lyon.',
        'Une nouvelle adresse à découvrir en images.',
        'Prenons le temps de parcourir les lieux.',
        'Contactez votre agence pour organiser une visite.',
      ],
    };
  assert.equal(
    GenerationRequest.safeParse({
      listingId: draft.id,
      customization: { ...settings, photoOrder: Array.from({ length: 13 }, (_, i) => i) },
    }).success,
    false,
  );
  assert.equal(
    GenerationRequest.safeParse({ listingId: draft.id, customization: { ...settings, photoOrder: [40, 1, 2] } })
      .success,
    false,
  );
  assert.equal(
    GenerationRequest.safeParse({ listingId: draft.id, customization: { ...settings, photoOrder: [29, 29, 28] } })
      .success,
    false,
  );
  const patched = await patchCreationDraft(env.DB, seed.agencyId, draft.id, {
    version: draft.version,
    changes: {},
    confirm: [],
    videoCustomization: settings,
  });
  const editor = createEditorDocument(
    order.map((sourceOrder) => ({ sourceOrder })),
    patched.data.fields,
    { durationSeconds: 20, voiceEnabled: false },
  );
  const edited = await patchCreationDraft(env.DB, seed.agencyId, draft.id, {
    version: patched.version,
    changes: {},
    confirm: [],
    videoCustomization: { ...settings, editor },
  });
  const exported = await snapshotEditorExport(
    env,
    seed.agencyId,
    draft.id,
    edited.version,
    'thirty-photo-export-001',
    AbortSignal.timeout(30_000),
  );
  assert.ok('listingId' in exported);
  if (!('listingId' in exported)) throw Error('NO_EXPORT');
  const exportListing = JSON.parse((await findImport(env.DB, seed.agencyId, exported.listingId))!.result!);
  assert.equal(exportListing.photos.length, 12);
  assert.deepEqual(new Set(exportListing.photos.map((p: { sourceOrder: number }) => p.sourceOrder)), new Set(order));
  // Restore non-editor settings and keep all thirty originals when completing.
  const restored = await patchCreationDraft(env.DB, seed.agencyId, draft.id, {
    version: edited.version,
    changes: {},
    confirm: [],
    videoCustomization: settings,
  });
  const completed = await finishCreationDraft(env, seed.agencyId, draft.id, restored.version);
  assert.equal(JSON.parse(completed.result!).photos.length, 30);
  const job = await admitGeneration(
    env.DB,
    seed.agencyId,
    'thirty-photo-generation-001',
    { listingId: draft.id, durationSeconds: 20, customization: settings },
    'true',
  );
  assert.equal(job.creditsReserved, 13);
  assert.equal(job.animationsRequested, 12);
  await loadGenerationListing(
    {
      ...env,
      IMPORT_TOKEN: 'fixture',
      IMPORT_SERVICE: {
        fetch: async () => {
          throw Error('NO_SOURCE_REIMPORT');
        },
        connect: () => {
          throw Error('NO_CONNECTION');
        },
      },
    },
    job,
  );
  await env.DB.prepare("UPDATE jobs SET status='scripting',stage='scripting' WHERE id=?").bind(job.jobId).run();
  const config = GoogleVoiceConfig.parse({ projectId: 'gallery-fixture', voice: 'fr-FR-Chirp3-HD-Aoede' }),
    voice = googleTts(config, async () => 'fixture-token-never-networked', {
      fetch: async () => Response.json({ audioContent: Buffer.from(toneFixture(4500)).toString('base64') }),
    });
  await prepareJobNarration(env, seed.agencyId, job.jobId, {
    mode: 'mock',
    script: {
      model: DEFAULT_SCRIPT_MODEL,
      plan: async () => {
        throw Error('NO_PAID_TEXT');
      },
    },
    voice: { config, synthesize: voice.synthesize },
  });
  const snapshot = JSON.parse((await findNarration(env.DB, seed.agencyId, job.jobId))!.snapshot);
  assert.deepEqual(
    snapshot.listing.photos.map((p: { id: string }) => p.id),
    order.map((slot) => draft.photos.find((p) => p.sourceOrder === slot)!.id),
  );
  let animationCalls = 0;
  const clip = new Uint8Array(512);
  clip.set(new TextEncoder().encode('ftyp'), 4);
  await prepareJobAnimations(env, seed.agencyId, job.jobId, {
    mode: 'mock',
    generate: async (_bytes, _mime, checkpoint) => {
      animationCalls++;
      await checkpoint('11111111-1111-4111-8111-111111111111');
      return clip;
    },
    resume: async () => clip,
  });
  assert.equal(animationCalls, 12);
  const frozen = await prepareJobVideo(env, seed.agencyId, job.jobId);
  assert.equal(frozen.manifest.photos.length, 12);
  assert.equal(frozen.manifest.photoAnimations!.length, 12);
  assert.deepEqual(
    frozen.manifest.photos.map((p) => p.id),
    snapshot.listing.photos.map((p: { id: string }) => p.id),
  );
  const manual = await startManualCreationDraft(env.DB, seed.agencyId, 'thirty-photo-manual-001');
  await assert.rejects(
    uploadCreationPhoto(
      env,
      seed.agencyId,
      manual.id,
      29,
      'manual-upload-id-0001',
      new Uint8Array(images[0]),
      'image/jpeg',
      async () => {
        throw Error('NO_NORMALIZATION');
      },
      AbortSignal.timeout(1000),
    ),
    /INVALID_PHOTO/,
  );
  const insertManualPhoto = (slot: number) => {
    const original = draft.photos[slot],
      photo = {
        ...original,
        id: `manual-guard-${slot}`,
        listingId: manual.id,
        sourceOrder: slot,
        objectKey: `agencies/${seed.agencyId}/imports/${manual.id}/guard-${slot}.jpg`,
      };
    return env.DB.prepare('INSERT INTO import_objects(id,agency_id,import_id,object_key,photo_json) VALUES(?,?,?,?,?)')
      .bind(photo.id, seed.agencyId, manual.id, photo.objectKey, JSON.stringify(photo))
      .run();
  };
  for (let slot = 0; slot < 12; slot++) await insertManualPhoto(slot);
  await assert.rejects(insertManualPhoto(12), /IMPORT_PHOTO_LIMIT/);
  assert.equal(
    selectedAnimationIndices(
      Array.from({ length: 12 }, (_, i) => i),
      { ...settings, photoOrder: undefined, runwayPhotos: undefined, runwayClips: 2 },
    ).at(-1),
    6,
  );
});
