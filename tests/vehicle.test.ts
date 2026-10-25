import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import { test } from 'node:test';
import { convertV4MiniflareOptions, Miniflare } from 'miniflare';
import sharp from 'sharp';
import { runwayPrompt } from '../apps/pipeline/src/runway';
import {
  finishCreationDraft,
  patchCreationDraft,
  startManualCreationDraft,
  uploadCreationPhoto,
} from '../apps/web/lib/creation-drafts';
import { importResult, privateImportPhoto } from '../apps/web/lib/imports';
import { narrationBrand, narrationListing } from '../fixtures/narration';
import {
  emptyVehicleValues,
  GeneratableListing,
  NormalizedListing,
  userVehicleFacts,
  vehicleValues,
  videoPresentation,
} from '../packages/contracts/src/index';
import { draftFromListing, findImport } from '../packages/db/src/index';
import { extractListingHtml, missing } from '../packages/importers/src/listing';
import { sourcePolicy } from '../packages/importers/src/network';
import { assertListingDestination } from '../packages/importers/src/registry';
import {
  compileScript,
  DEFAULT_SCRIPT_MODEL,
  scriptContext,
  scriptRequest,
  validateScript,
  wordCount,
} from '../packages/narration/src/index';
import { normalizePhoto } from '../scripts/import-transport';

function carListing() {
  const listing = narrationListing();
  return GeneratableListing.parse({
    ...listing,
    category: 'vehicle',
    vehicle: userVehicleFacts({
      ...emptyVehicleValues(),
      make: 'Peugeot',
      model: '207',
      year: 2007,
      mileageKm: 198500,
      fuel: 'Diesel',
      transmission: 'Boîte manuelle',
      powerHp: 110,
    }),
    facts: {
      ...listing.facts,
      title: {
        status: 'verified',
        value: 'Peugeot 207',
        unit: 'text',
        sourcePath: 'vehicle.name',
        rawEvidence: 'Peugeot 207',
      },
      propertyType: missing('category'),
      area: missing('m2'),
      rooms: missing('rooms'),
    },
    description: {
      text: 'Le vendeur signale un risque de colmatage du FAP.',
      sourcePath: 'vehicle.sellerDescription',
      truncated: false,
    },
  });
}
const id = '6571066c-6882-4f91-a7f8-8bad0771c9d8',
  url = `https://www.autoscout24.fr/offres/peugeot-207-${id}`;
const car = {
  '@type': 'Car',
  name: 'Peugeot 207',
  identifier: id,
  model: '207',
  productionDate: '2007-11-01',
  mileageFromOdometer: { value: 0, unitCode: 'KMT' },
  vehicleTransmission: 'Manuelle',
};
const data = {
  '@type': 'Product',
  brand: { name: 'Peugeot' },
  offers: {
    price: 1500,
    priceCurrency: 'EUR',
    url,
    itemOffered: car,
    offeredBy: { address: { addressLocality: 'Lyon' } },
  },
};
const html = (
  details: unknown = {
    id,
    images: [0, 1, 2].map((n) => `https://prod.pictures.autoscout24.net/listing-images/${id}_${n}.jpg/1280x960.webp`),
    description: 'Risque de colmatage du FAP.',
    vehicle: { fuelCategory: { formatted: 'Diesel' } },
  },
  root: unknown = data,
) =>
  `<link rel="canonical" href="${url}"><script type="application/ld+json">${JSON.stringify(root)}</script><script id="__NEXT_DATA__" type="application/json">${JSON.stringify({ props: { pageProps: { listingDetails: details } } })}</script>`;

test('Auto : extraction de la seule annonce et de sa galerie, zéro km conservé, faits absents omis', () => {
  const listing = extractListingHtml(html(), url);
  assert.equal(listing.category, 'vehicle');
  assert.equal(listing.facts.price.value?.amountCents, 150000);
  assert.equal(listing.vehicle?.mileageKm.value, 0);
  assert.equal(listing.vehicle?.powerHp.status, 'missing');
  assert.equal(listing.photoUrls.length, 3);
  assert.match(listing.description!.text, /FAP/);
  assert.equal(listing.facts.area.status, 'missing');
  assert.throws(() => extractListingHtml(html({ id: 'another-car' }), url), /autre annonce/);
  assert.throws(
    () =>
      extractListingHtml(
        html({ id, images: [`https://prod.pictures.autoscout24.net/listing-images/another-id.jpg`] }),
        url,
      ),
    /photo ne correspond/,
  );
  assert.throws(() => extractListingHtml(html(undefined, [data, data]), url), /identifié/);
  assert.throws(
    () => extractListingHtml(html(undefined, { '@type': 'ItemList', itemListElement: [data] }), url),
    /liste de véhicules/,
  );
  assert.throws(() => assertListingDestination(url, url.replace(id, '7571066c-6882-4f91-a7f8-8bad0771c9d8')));
  assert.deepEqual(sourcePolicy(url).imageHosts, [
    'www.autoscout24.fr',
    'autoscout24.fr',
    'prod.pictures.autoscout24.net',
  ]);
});
test('Auto : une illustration de catalogue Aramis ne devient pas une photo du véhicule', () => {
  const link = 'https://www.aramisauto.com/voitures/jaecoo/7/exclusive/v352925?vehicleId=1023164';
  const root = {
    '@type': 'Car',
    '@id': link,
    sku: 'v352925',
    productID: '1023164',
    name: 'Jaecoo 7',
    image: 'https://storage.googleapis.com/aramis_vehicles/production/betamodels/illustration.jpg',
    mileageFromOdometer: { value: '0', unitCode: 'KMT' },
    offers: { url: link, price: '34799', priceCurrency: 'EUR' },
  };
  const listing = extractListingHtml(`<script type="application/ld+json">${JSON.stringify(root)}</script>`, link, {
    allowPartial: true,
  });
  assert.equal(listing.vehicle?.mileageKm.value, 0);
  assert.deepEqual(listing.photoUrls, []);
  assert.equal(listing.facts.locality.status, 'missing');
  assert.throws(
    () =>
      extractListingHtml(
        `<script type="application/ld+json">${JSON.stringify(root)}</script>`,
        link.replace('1023164', '1023165'),
        { allowPartial: true },
      ),
    /autre véhicule/,
  );
});
test('Auto : contrats et anciennes empreintes, absence de m², provenance conservée', async () => {
  const listing = carListing(),
    serialized = JSON.stringify(narrationListing());
  assert.equal(JSON.stringify(NormalizedListing.parse(JSON.parse(serialized))), serialized);
  assert.ok(!GeneratableListing.safeParse({ ...listing, vehicle: undefined }).success);
  assert.ok(!GeneratableListing.safeParse({ ...listing, facts: narrationListing().facts }).success);
  const draft = draftFromListing(listing);
  assert.deepEqual(draft.vehicle, listing.vehicle);
  const p = videoPresentation(listing);
  assert.equal(p.areaM2, null);
  assert.equal(p.rooms, null);
  assert.equal(p.vehicle?.mileageKm, 198500);
  assert.match(runwayPrompt('dolly', 3, 'vehicle'), /car stays parked/);
  assert.doesNotMatch(runwayPrompt('dolly', 3, 'vehicle'), /real estate/);
});
for (const duration of [20, 30, 40] as const)
  test(`Auto : narration ${duration}s, réserves conservées, catalogue fermé et reproductible`, async () => {
    const listing = carListing();
    const context = await scriptContext(listing, narrationBrand, undefined, 'description-copy/2', undefined, duration);
    const plan = {
      scenes: context.copies.map((copy, index) => ({
        copyId: copy.id,
        photoAssetId: listing.photos[index % listing.photos.length].id,
      })),
    };
    const script = compileScript(context, plan, DEFAULT_SCRIPT_MODEL),
      text = script.scenes.map((s) => s.narrationText).join(' ');
    assert.equal(script.promptVersion, 'narration-auto/1');
    assert.match(text, /risque de colmatage du FAP/);
    assert.doesNotMatch(text, /maison|appartement|mètres carrés|pièces|état impeccable/i);
    assert.ok(wordCount(text) <= { 20: 60, 30: 90, 40: 120 }[duration]);
    assert.deepEqual(validateScript(context, script), script);
    assert.equal(
      (await scriptContext(listing, narrationBrand, undefined, 'description-copy/2', undefined, duration)).inputHash,
      context.inputHash,
    );
    const foreign = structuredClone(plan);
    foreign.scenes[1].photoAssetId = 'foreign-photo';
    assert.throws(() => compileScript(context, foreign, DEFAULT_SCRIPT_MODEL));
    const request = JSON.stringify(scriptRequest(context, DEFAULT_SCRIPT_MODEL, false));
    assert.match(request, /automobile française/);
    assert.doesNotMatch(request, /https:\/\/fixtures/);
  });
test('Auto : brouillon D1/R2, édition, photos privées, rejeu de complétion et aucun débit', async (t) => {
  const mf = new Miniflare(
    convertV4MiniflareOptions({
      modules: true,
      script: 'export default {fetch(){return new Response("test")}}',
      compatibilityDate: '2026-09-27',
      d1Databases: ['DB'],
      r2Buckets: ['MEDIA'],
    }),
  );
  t.after(() => mf.dispose());
  const { DB, MEDIA } = await mf.getBindings<Pick<CloudflareEnv, 'DB' | 'MEDIA'>>(),
    env = { DB, MEDIA };
  for (const file of (await readdir(new URL('../packages/db/migrations/', import.meta.url)))
    .filter((f) => f.endsWith('.sql'))
    .sort())
    await DB.exec(
      (await readFile(new URL(`../packages/db/migrations/${file}`, import.meta.url), 'utf8'))
        .replace(/^--.*$/gm, '')
        .replace(/\n/g, ' '),
    );
  const at = new Date().toISOString();
  for (const id of ['vehicle-owner', 'vehicle-other'])
    await DB.prepare('INSERT INTO agencies(id,owner_user_id,name,created_at,updated_at) VALUES(?,?,?,?,?)')
      .bind(id, id, 'Recette Auto', at, at)
      .run();
  let draft = await startManualCreationDraft(DB, 'vehicle-owner', 'vehicle-manual-key-01', null, 'vehicle');
  assert.equal(
    (await startManualCreationDraft(DB, 'vehicle-owner', 'vehicle-manual-key-01', null, 'vehicle')).id,
    draft.id,
  );
  await assert.rejects(startManualCreationDraft(DB, 'vehicle-owner', 'vehicle-manual-key-01'));
  draft = await patchCreationDraft(DB, 'vehicle-owner', draft.id, {
    version: draft.version,
    changes: { title: 'Peugeot 207', priceCents: 150000, description: 'Risque de colmatage du FAP.' },
    confirm: [],
    vehicle: { ...emptyVehicleValues(), mileageKm: 0, year: 2007 },
  });
  await assert.rejects(
    patchCreationDraft(DB, 'vehicle-other', draft.id, {
      version: draft.version,
      changes: { title: 'Autre' },
      confirm: [],
    }),
  );
  for (let i = 0; i < 3; i++) {
    const bytes = new Uint8Array(
      await sharp({
        create: { width: 960, height: 640, channels: 3, background: ['#386450', '#52637c', '#294e39'][i] },
      })
        .png()
        .toBuffer(),
    );
    await uploadCreationPhoto(
      env,
      'vehicle-owner',
      draft.id,
      i,
      `vehicle-upload-photo-${i}`,
      bytes,
      'image/png',
      normalizePhoto,
      new AbortController().signal,
    );
  }
  const row = await finishCreationDraft(env, 'vehicle-owner', draft.id, draft.version),
    listing = importResult(row).listing!;
  assert.equal(listing.category, 'vehicle');
  assert.equal(listing.vehicle?.mileageKm.value, 0);
  assert.equal(listing.facts.propertyType.status, 'missing');
  assert.equal(listing.photos.length, 3);
  assert.equal(listing.sourceKind, 'manual');
  assert.ok(Object.values(listing.vehicle!).every((f) => ['missing', 'user_provided'].includes(f.status)));
  assert.equal((await finishCreationDraft(env, 'vehicle-owner', draft.id, draft.version)).id, row.id);
  await assert.rejects(privateImportPhoto(env, 'vehicle-other', draft.id, listing.photos[0].id));
  assert.equal(await findImport(DB, 'vehicle-other', draft.id), null);
  for (const table of ['jobs', 'reservations', 'allocations', 'cost_events'])
    assert.equal((await DB.prepare(`SELECT count(*) n FROM ${table}`).first<{ n: number }>())?.n, 0);
  assert.equal(vehicleValues(listing.vehicle!).mileageKm, 0);
});
