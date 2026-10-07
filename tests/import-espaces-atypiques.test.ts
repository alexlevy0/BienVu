import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {ImportFailure} from '../packages/contracts/src/index';
import {extractListingHtml} from '../packages/importers/src/listing';

const url = 'https://www.espaces-atypiques.com/ventes/21200-beaune-propriete-viticole-a-quelques-minutes-de-beaune-947eb/';
const fixture = () => readFile(new URL('../fixtures/imports/espaces-atypiques-renumbered.html', import.meta.url), 'utf8');
const conflict = (error: unknown) => error instanceof ImportFailure && error.code === 'CONFLICTING_FACTS';

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
