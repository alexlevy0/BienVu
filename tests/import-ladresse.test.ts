import {test} from 'node:test';
import assert from 'node:assert/strict';
import {ImportFailure} from '../packages/contracts/src/index';
import {extractListingHtml, importListing, selectAdapter, sourcePolicy, assertListingDestination} from '../packages/importers/src/index';

const url = 'https://www.ladresse.com/annonce/achat/maison/recette-33000/14649049';
const image = (letter: string, id = '14649049') => `https://admin.exceladresse.com/office21/recette/catalog/images/pr_p/${id.split('').join('/')}/${id}${letter}.jpg?version=123`;
const gallery = `<div id="annonce-photos"><a href="${image('a')}"><img src="${image('a')}"></a><div class="galerie-photos-miniatures">${'abcdefghijk'.split('').map(letter => `<img src="${image(letter)}">`).join('')}</div></div>`;
const html = `<html><head><script type="application/ld+json">{"@type":"BreadcrumbList","itemListElement":[]}</script></head><body>
<div class="annonce-entete"><span class="annonce-reference">Réf. de l'annonce : 14649049 / 2662</span>
<h1>Vente maison 4 pièces, 88.00m², Recette</h1><p>399 000 € honoraires inclus · 387 000 € hors honoraires · taxe : 1 445 €</p><div class="annonce-prix">399 000 €</div></div>
${gallery}<div id="annonce-description"><h2>Maison avec jardin</h2><p>Un séjour ouvert sur le jardin.<br>Une cuisine équipée.</p><p>Trois chambres à l’étage.</p></div>
<div id="annonce-caracteristiques">Terrain 123 m² · 3 chambres</div><aside><div class="annonce-prix">450 000 €</div><img src="${image('a','99999999')}"><img src="https://untrusted.example/avatar.jpg"></aside></body></html>`;
const fails = (code: string) => (error: unknown) => error instanceof ImportFailure && error.code === code;

test('l’Adresse : référence, prix honoraires inclus, surface habitable et 11 photos de la seule galerie', () => {
  const result = extractListingHtml(html, url);
  assert.equal(selectAdapter(url).id, 'ladresse'); assert.equal(result.sourceListingId, '14649049');
  assert.equal(result.facts.price.value?.amountCents, 39900000); assert.equal(result.facts.area.value, 88);
  assert.equal(result.facts.rooms?.value, 4); assert.equal(result.facts.propertyType.value, 'house');
  assert.equal(result.transaction, 'sale'); assert.equal(result.facts.locality.value, 'Recette');
  assert.deepEqual(result.photoUrls, 'abcdefghijk'.split('').map(letter => image(letter)));
  assert.match(result.description!.text, /séjour ouvert/); assert.match(result.description!.text, /Trois chambres/);
  assert.deepEqual(sourcePolicy(url).imageHosts, ['www.ladresse.com','ladresse.com','admin.exceladresse.com']);
  assert.ok(!sourcePolicy('https://other.example/annonce').imageHosts.includes('admin.exceladresse.com'));
});
test('l’Adresse : référence, type, canonique et photos étrangers refusés avant téléchargement', () => {
  for (const altered of [html.replace('14649049 / 2662', '99999999 / 2662'),
    html.replace('Vente maison', 'Vente appartement'), html.replace(image('b'), image('b','99999999')),
    html.replace(image('b'), image('b').replace('admin.exceladresse.com', 'untrusted.example')),
    html.replace('</head>', '<link rel="canonical" href="https://www.ladresse.com/annonce/achat/maison/autre/99999999"></head>')])
    assert.throws(() => extractListingHtml(altered, url), fails('CONFLICTING_FACTS'));
  assert.throws(() => extractListingHtml(html.replace(image('b'), 'https://127.0.0.1/private'), url), fails('UNSAFE_URL'));
  assert.throws(() => assertListingDestination(url, url.replace('14649049','99999999')), fails('SOURCE_UNAVAILABLE'));
  for (const path of ['/annonce/achat/maison/recette-33000/', '/annonce/location/maison/recette-33000/14649049', '/achat/maison/recette'])
    assert.throws(() => selectAdapter('https://www.ladresse.com'+path), fails('NOT_A_LISTING'));
});
test('l’Adresse : galerie manquante conserve un brouillon, sans compter les photos des annonces voisines', () => {
  const partial = html.replace(gallery, '');
  assert.throws(() => extractListingHtml(partial, url), fails('INSUFFICIENT_PHOTOS'));
  const result = extractListingHtml(partial, url, {allowPartial: true});
  assert.equal(result.facts.price.value?.amountCents, 39900000); assert.equal(result.photoUrls.length, 0);
});
test('l’Adresse : import complet sans navigateur ni scripts externes, photos conservées dans leur ordre', async () => {
  const calls: string[] = [], saved: string[] = []; let browsers = 0;
  const {listing, diagnostics} = await importListing(url, {agencyId: 'ladresse-test', importId: 'ladresse-fixture'}, {
    transport: {async load(value, kind, hosts) {
      assert.ok(hosts.includes(new URL(value).hostname)); calls.push(value);
      const index = 'abcdefghijk'.indexOf(new URL(value).pathname.at(-5)!);
      return kind === 'page' ? {url: value, bytes: new TextEncoder().encode(html), mime: 'text/html', sourceBytes: html.length}
        : {url: value, bytes: new Uint8Array([255,216,index,255,217]), mime: 'image/jpeg', sourceBytes: 5, width: 960, height: 640};
    }}, store: async photo => {assert.ok(photo.sourceUrl);saved.push(photo.sourceUrl);}, browserHtml: async () => {browsers++; return '';},
  });
  assert.equal(browsers, 0); assert.equal(diagnostics.browserUsed, false); assert.equal(calls.length, 12);
  assert.equal(listing.photos.length, 11); assert.deepEqual(saved, 'abcdefghijk'.split('').map(letter => image(letter)));
  assert.deepEqual(listing.photos.map(p => p.sourceOrder), Array.from({length: 11}, (_, index) => index));
});
