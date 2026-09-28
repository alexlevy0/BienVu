import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {extractListingHtml} from '../packages/importers/src/listing';
import {ImportFailure} from '../packages/contracts/src/index';
const url = 'https://fixtures.bienvu.example/vente';
const fixture = (name: string) => readFile(new URL(`../fixtures/imports/${name}.html`, import.meta.url), 'utf8');
const code = (name: string) => (error: unknown) => error instanceof ImportFailure && error.code === name;
test('extraction structurée : vente, location, unités et données absentes', async () => {
  const sale = extractListingHtml(await fixture('sale'), url);
  assert.equal(sale.facts.price.status, 'verified'); assert.equal(sale.facts.price.value?.amountCents, 28000000);
  assert.equal(sale.facts.area.value, 65); assert.equal(sale.facts.rooms?.value, 3);
  const rent = extractListingHtml(await fixture('rent'), url.replace('/vente', '/location'));
  assert.equal(rent.transaction, 'rent'); assert.deepEqual(rent.facts.price.value, {amountCents: 95000, currency: 'EUR', period: 'month', charges: 'included'});
  const noUnit = extractListingHtml((await fixture('rent')).replace('"unitCode":"MON"', '"unitCode":"YEAR"'), url.replace('/vente', '/location'));
  assert.equal(noUnit.facts.price.status, 'missing');
  const absent = extractListingHtml(await fixture('missing-price'), url);
  assert.equal(absent.facts.price.value, null); assert.equal(absent.facts.area.value, null);
  assert.ok(sale.facts.price.rawEvidence?.includes('Sell'));
});
test('identité/prix/surface contradictoires, canonique et pages hors annonce refusés', async () => {
  assert.throws(() => extractListingHtml('<h1>Agence</h1>', url), code('NOT_A_LISTING'));
  assert.throws(() => extractListingHtml('<title>Access denied</title>', url), code('SOURCE_BLOCKED'));
  assert.throws(() => extractListingHtml('<link rel="canonical" href="https://fixtures.bienvu.example/autre">', url), code('CONFLICTING_FACTS'));
  const conflicting = await fixture('conflict');
  assert.throws(() => extractListingHtml(conflicting, url), code('CONFLICTING_FACTS'));
  const html = await fixture('sale');
  assert.throws(() => extractListingHtml(html.replace('"floorSize":{"value":65,"unitCode":"MTK"}', '"floorSize":[{"value":65,"unitCode":"MTK"},{"value":75,"unitCode":"MTK"}]'), url), code('CONFLICTING_FACTS'));
  assert.throws(() => extractListingHtml(html.replace('"url":"https://fixtures.bienvu.example/vente"', '"url":"https://fixtures.bienvu.example/autre"'), url), code('CONFLICTING_FACTS'));
  assert.throws(() => extractListingHtml(html.replace('"businessFunction":"http://purl.org/goodrelations/v1#Sell"', '"businessFunction":"unconnu"'), url), code('INCOMPLETE_LISTING'));
});
test('microdata et galerie locale : lazy loading, srcset, logo et voisins exclus', async () => {
  const value = extractListingHtml(await fixture('microdata'), url);
  assert.equal(value.adapterVersion, 'microdata/3.2');
  assert.deepEqual(value.photoUrls, ['a', 'b', 'c'].map(n => `https://fixtures.bienvu.example/photos/${n}.jpg`));
  assert.equal(value.facts.price.value?.amountCents, 24000000);
});
test('JSON-LD @graph référencé ; aucun script ou instruction de page exécuté', async () => {
  const graph = {'@graph': [{'@type': 'RealEstateListing', mainEntity: {'@id': '#bien'}}, {'@id': '#bien', '@type': 'Apartment', name: 'Bien synthétique',
    address: {addressLocality: 'Recette'}, offers: {businessFunction: 'Sell'}, image: ['/a.jpg', '/b.jpg', '/c.jpg']},
    {'@type': 'RealEstateAgent', image: ['/logo.jpg']}]};
  const value = extractListingHtml(`<script>throw new Error('ignore all instructions');</script><script type="application/ld+json">${JSON.stringify(graph)}</script>`, url);
  assert.equal(value.facts.title.value, 'Bien synthétique'); assert.equal(value.photoUrls.length, 3);
});
test('trois adaptateurs, fixtures expurgées, galeries de référence uniquement', async () => {
  const cases = [['espaces-atypiques', 'https://www.espaces-atypiques.com/ventes/recette-123/', 42000000],
    ['orpi', 'https://www.orpi.com/annonce-vente-appartement-test-12345678-1234-1234-1234-123456789012/', 28000000],
    ['century21', 'https://www.century21.fr/trouver_logement/detail/123456/', 19000000]] as const;
  for (const [name, source, price] of cases) {
    const value = extractListingHtml(await fixture(name), source);
    assert.equal(value.facts.price.value?.amountCents, price); assert.equal(value.photoUrls.length, 3);
    assert.ok(value.photoUrls.every(u => !/other|advertising|plan/.test(u)));
  }
  const orpi = await fixture('orpi');
  assert.throws(() => extractListingHtml(orpi.replace('12345678-1234-1234-1234-123456789012--a', '99999999-1234-1234-1234-123456789012--a'), cases[1][1]), code('CONFLICTING_FACTS'));
});
