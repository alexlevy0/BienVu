import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {ImportFailure} from '../packages/contracts/src/index';
import {extractListingHtml} from '../packages/importers/src/listing';
import {assertListingDestination, selectAdapter} from '../packages/importers/src/registry';
import {importListing} from '../packages/importers/src/import-listing';
import {GeneratableListing} from '../packages/contracts/src/product';
import sharp from 'sharp';

const url = 'https://www.espaces-atypiques.com/ventes/21200-beaune-propriete-viticole-a-quelques-minutes-de-beaune-947eb/';
const fixture = () => readFile(new URL('../fixtures/imports/espaces-atypiques-renumbered.html', import.meta.url), 'utf8');
const conflict = (error: unknown) => error instanceof ImportFailure && error.code === 'CONFLICTING_FACTS';
const rentalUrl = 'https://www.espaces-atypiques.com/locations/69004-lyon-loft-avec-vue-sur-la-saone-dans-une-ancienne-biscuiterie-15088/';
const rentalFixture = () => readFile(new URL('../fixtures/imports/espaces-atypiques-location.html', import.meta.url), 'utf8');

test('Espaces Atypiques : nouvelle référence affichée, URL et photos historiques conservées', async () => {
  const value = extractListingHtml(await fixture(), url);
  assert.equal(value.canonicalUrl, url);
  assert.equal(value.sourceListingId, '1071EB');
  assert.equal(value.facts.title.value, 'Propriété de recette à Beaune');
  assert.equal(value.facts.locality.value, 'BEAUNE');
  assert.equal(value.facts.propertyType.value, 'house');
  assert.equal(value.facts.rooms?.value, 10);
  assert.deepEqual(value.facts.price.value, {amountCents: 129000000, currency: 'EUR', period: 'total', charges: 'not_applicable'});
  assert.equal(value.description?.text, 'Maison de recette avec jardin.\n\nDeux logements réunis dans une propriété de recette.');
  assert.deepEqual(value.photoUrls, ['947EB/a.jpg', '947EB/b.jpg', '1071EB/c.jpg', '947eb/d.jpg']
    .map(path => `https://www.espaces-atypiques.com/wp-content/uploads/agency/${path}`));
});

test('Espaces Atypiques : référence alphanumérique insensible à la casse', async () => {
  const html = (await fixture()).replaceAll('1071EB', '947EB');
  assert.equal(extractListingHtml(html, url).sourceListingId, '947EB');
  const noVisibleReference = html.replaceAll('class="reference font2"', 'class="font2"')
    .replaceAll('class="reference font2 info-resume"', 'class="font2 info-resume"');
  assert.doesNotThrow(() => extractListingHtml(noVisibleReference, url));
});

test('Espaces Atypiques : références absentes ou contradictoires restent bloquantes', async () => {
  const html = await fixture();
  const changes = [
    html.replaceAll('RÉF. 1071EB', 'RÉF. 999EB'),
    html.replace('RÉF. 1071EB', 'RÉF. 999EB'),
    html.replaceAll('class="reference font2"', 'class="font2"')
      .replaceAll('class="reference font2 info-resume"', 'class="font2 info-resume"'),
    html.replace('"reference":"1071EB"', '"reference":"999EB"'),
    html.replace('"reference":"1071EB"', '"reference":"1071/EB"'),
  ];
  for (const changed of changes) for (const allowPartial of [false, true])
    assert.throws(() => extractListingHtml(changed, url, {allowPartial}), conflict);
});

test('Espaces Atypiques : canonique, prix et galeries de voisins restent contrôlés', async () => {
  const html = await fixture();
  assert.throws(() => extractListingHtml(html.replace('propriete-viticole-a-quelques-minutes-de-beaune-947eb/', 'autre-bien-999eb/'), url), conflict);
  assert.throws(() => extractListingHtml(html.replace('1 290 000 €', '1 490 000 €'), url), conflict);
  const foreignGallery = html.replaceAll('/agency/947EB/', '/agency/999EB/')
    .replaceAll('/agency/947eb/', '/agency/999EB/').replaceAll('/agency/1071EB/', '/agency/999EB/');
  assert.throws(() => extractListingHtml(foreignGallery, url),
    (error: unknown) => error instanceof ImportFailure && error.code === 'INSUFFICIENT_PHOTOS');
  assert.deepEqual(extractListingHtml(foreignGallery, url, {allowPartial: true}).photoUrls, []);
});

test('Espaces Atypiques location : route, loyer CC et trois pièces, frais facultatifs et voisins exclus', async () => {
  assert.equal(selectAdapter(rentalUrl).listingId, '15088');
  const value = extractListingHtml(await rentalFixture(), rentalUrl);
  assert.equal(value.transaction, 'rent');
  assert.equal(value.sourceListingId, '15088');
  assert.equal(value.facts.propertyType.value, 'apartment');
  assert.equal(value.facts.rooms?.value, 3);
  assert.deepEqual(value.facts.price.value, {amountCents: 190000, currency: 'EUR', period: 'month', charges: 'included'});
  assert.equal(value.photoUrls.length, 3);
  assert.ok(value.description?.text.includes('Forfait facultatif'));
  const excluded = extractListingHtml((await rentalFixture()).replace('Loyer CC', 'Loyer HC'), rentalUrl);
  assert.equal(excluded.facts.price.value?.charges, 'excluded');
  const cents = extractListingHtml((await rentalFixture()).replace('"loyer":"1900"', '"loyer":"1900.50"')
    .replaceAll('1 900 €', '1 900,50 €'), rentalUrl);
  assert.equal(cents.facts.price.value?.amountCents, 190050);
});

test('Espaces Atypiques location : charges inconnues ou période non mensuelle omettent le loyer', async () => {
  for (const label of ['Loyer', 'Loyer hebdomadaire CC', 'Loyer annuel HC']) {
    const value = extractListingHtml((await rentalFixture()).replace('Loyer CC', label), rentalUrl);
    assert.equal(value.facts.price.status, 'missing');
    assert.ok(value.warnings.some(warning => warning.startsWith('Loyer omis')));
  }
});

test('Espaces Atypiques location : prix, charges, références et transaction contradictoires restent refusés', async () => {
  const html = await rentalFixture();
  const changes = [html.replace('"status":"enlocation"', '"status":"envente"'),
    html.replace('location type-location', 'vente type-vente'),
    html.replace('"loyer":"1900"', '"loyer":"2000"'), html.replace('RÉF. 15088', 'RÉF. 15089'),
    html.replace('<div id="annonce-description">', '<div class="info-cle"><div class="info-label">Loyer HC</div><div class="info-value">1 900 €</div></div><div id="annonce-description">')];
  for (const changed of changes) for (const allowPartial of [false, true])
    assert.throws(() => extractListingHtml(changed, rentalUrl, {allowPartial}), conflict);
  assert.throws(() => assertListingDestination(rentalUrl, rentalUrl.replace('/locations/', '/ventes/')),
    (error: unknown) => error instanceof ImportFailure && error.code === 'SOURCE_UNAVAILABLE');
  assert.throws(() => assertListingDestination(rentalUrl, rentalUrl.replace('15088/', '15089/')),
    (error: unknown) => error instanceof ImportFailure && error.code === 'SOURCE_UNAVAILABLE');
});

test('Espaces Atypiques location : JSON-LD de vente ne peut pas remplacer la transaction confirmée', async () => {
  const html = await rentalFixture();
  const json = {'@type': 'RealEstateListing', mainEntity: {'@type': 'Apartment', url: rentalUrl,
    name: 'Loft de recette au bord de la rivière', address: {addressLocality: 'LYON'},
    offers: {businessFunction: 'http://purl.org/goodrelations/v1#Sell', priceCurrency: 'EUR', price: 1900}}};
  assert.throws(() => extractListingHtml(html.replace('</head>',
    `<script type="application/ld+json">${JSON.stringify(json)}</script></head>`), rentalUrl), conflict);
});

test('Espaces Atypiques location : annonce et trois images distinctes importées sur transport de recette', async () => {
  const html = await rentalFixture(), stored: string[] = [];
  const result = await importListing(rentalUrl, {agencyId: 'rental-fixture', importId: 'rental-import'}, {
    transport: {load: async value => {
      if (value === rentalUrl) return {url: value, bytes: new TextEncoder().encode(html), mime: 'text/html', sourceBytes: Buffer.byteLength(html)};
      const index = ['fixture-a', 'fixture-b', 'fixture-c'].findIndex(name => value.includes(name));
      assert.ok(index >= 0);
      const bytes = new Uint8Array(await sharp({create: {width: 960, height: 640, channels: 3,
        background: {r: 30 + index * 60, g: 90, b: 100}}}).jpeg().toBuffer());
      return {url: value, bytes, mime: 'image/jpeg', sourceBytes: bytes.length, width: 960, height: 640};
    }}, store: async photo => {stored.push(photo.objectKey);},
  });
  assert.equal(result.listing.transaction, 'rent');
  assert.equal(result.listing.photos.length, 3);
  assert.equal(stored.length, 3);
  assert.doesNotThrow(() => GeneratableListing.parse(result.listing));
});
