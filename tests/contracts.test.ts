import {test} from 'node:test';
import assert from 'node:assert/strict';
import {GenerationInput, GeneratableListing, ListingUrl, NormalizedListing, RenderManifest, Job, parseContract} from '../packages/contracts/src/index';
import {conflictingFixture, manifestFixture, missingFixture, rentalFixture, saleFixture} from '../fixtures/contracts';

test('contrats : vente, location et valeurs facultatives absentes sont distinctes', () => {
  for (const fixture of [saleFixture(), rentalFixture(), missingFixture()]) assert.equal(GeneratableListing.safeParse(fixture).success, true);
  assert.equal(missingFixture().facts.price.value, null);
  const rent = rentalFixture(); rent.transaction = 'sale';
  assert.throws(() => parseContract(GeneratableListing, rent), /unité du prix/);
  const area = saleFixture(); const wrongUnit = structuredClone(area) as unknown as {facts: {area: {unit: string}}};
  wrongUnit.facts.area.unit = 'ft2';
  assert.throws(() => parseContract(GeneratableListing, wrongUnit), /incomplètes ou incohérentes/);
});

test('contradictions traçables mais non générables, photos et provenance contrôlées', () => {
  assert.equal(NormalizedListing.safeParse(conflictingFixture()).success, true);
  assert.throws(() => parseContract(GeneratableListing, conflictingFixture()), /contradictoires/);
  const foreign = saleFixture(); foreign.photos[0].agencyId = 'other-agency';
  assert.equal(NormalizedListing.safeParse(foreign).success, false);
  const duplicate = saleFixture(); duplicate.photos[1].contentHash = duplicate.photos[0].contentHash;
  assert.equal(GeneratableListing.safeParse(duplicate).success, false);
  const few = saleFixture(); few.photos.pop(); assert.equal(GeneratableListing.safeParse(few).success, false);
  const canonical = saleFixture(); canonical.canonicalUrl = 'https://other.example.com/other';
  assert.equal(NormalizedListing.safeParse(canonical).success, false);
});

test('URL produit : destinations dangereuses et droits transmis par le client refusés', () => {
  for (const url of ['not a url', 'http://agency.example.com', 'https://localhost', 'https://local.test',
    'https://127.1', 'https://2130706433', 'https://0x7f000001', 'https://[::1]', 'https://[::ffff:127.0.0.1]',
    'https://169.254.169.254', 'https://user:password@agency.example.com', 'https://agency.example.com:444', 'file:///etc/passwd']) {
    assert.equal(ListingUrl.safeParse(url).success, false, url);
  }
  assert.equal(ListingUrl.safeParse('https://agency.example.com/listing').success, true);
  assert.equal(GenerationInput.safeParse({url: 'https://agency.example.com/listing', agencyId: 'other', watermarked: false}).success, false);
  const malformed = saleFixture(); malformed.sourceUrl = 'broken';
  assert.doesNotThrow(() => assert.equal(NormalizedListing.safeParse(malformed).success, false));
});

test('manifeste : filigrane, isolation des fichiers, références et audio complet obligatoires', () => {
  assert.equal(RenderManifest.safeParse(manifestFixture()).success, true);
  const cases: unknown[] = [];
  const rights = manifestFixture(); cases.push({...rights, rights: {...rights.rights, watermarked: false}});
  const scope = manifestFixture(); scope.audio[0].objectKey = scope.audio[0].objectKey.replace('job-fixture', 'other-job'); cases.push(scope);
  const traversal = manifestFixture(); traversal.photos[0].objectKey += '/../secret.png'; cases.push(traversal);
  const missing = manifestFixture(); missing.scenes[0].photoAssetId = 'unknown'; cases.push(missing);
  const clipped = manifestFixture(); clipped.audio[0].durationMs = 11000; cases.push(clipped);
  const foreignBrand = manifestFixture(); foreignBrand.brand.id = 'other-agency'; cases.push(foreignBrand);
  const dimensions = {...manifestFixture(), width: 1920}; cases.push(dimensions);
  for (const value of cases) assert.equal(RenderManifest.safeParse(value).success, false);
});

test('état terminal de job : pas de bail actif ni succès avec erreur', () => {
  const job = {id: 'job-test', agencyId: 'agency-test', idempotencyKey: 'idempotency-test-01', status: 'ready', stage: 'rendering', attempt: 1,
    leaseUntil: null, workflowId: null, reservationId: 'reserve-test', errorCode: null, createdAt: '2026-09-27T12:00:00.000Z', updatedAt: '2026-09-27T12:00:01.000Z'};
  assert.equal(Job.safeParse(job).success, true);
  assert.equal(Job.safeParse({...job, leaseUntil: job.updatedAt}).success, false);
  assert.equal(Job.safeParse({...job, errorCode: 'SOURCE_BLOCKED'}).success, false);
  assert.equal(Job.safeParse({...job, status: 'failed'}).success, false);
});
