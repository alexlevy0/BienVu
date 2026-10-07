import {test} from 'node:test';
import assert from 'node:assert/strict';
import sharp from 'sharp';
import {ImportFailure, ImportInput} from '../packages/contracts/src/index';
import {extractListingHtml, importListing, selectAdapter, sourcePolicy, assertListingDestination} from '../packages/importers/src/index';
import {scopedUrl} from '../packages/importers/src/network';
import {nodeImportTransport} from '../scripts/import-transport';

const url = 'https://www.safti.fr/annonces/achat/maison/villefranche-sur-saone-69400/1724083';
const photos = Array.from({length: 9}, (_, i) => `https://cdn.safti.fr/bien-photo/71/24/1724083/${String(i).padStart(40, 'a')}/rg_nobn.jpg`);
function fixture(change: Record<string, unknown> = {}, productChange: Record<string, unknown> = {}, embedded = true) {
  const record = {propertyReference: 1724083, propertyType: 'maison', adType: 'vente', price: 149000, propertySurface: 57,
    areaSurface: 800, roomNumber: 2, bedroomNumber: 1, city: 'VILLEFRANCHE-SUR-SAONE', sold: false, photos: photos.map(urlPhotoLarge => ({urlPhotoLarge})), ...change};
  const product = {'@type': 'Product', sku: '1724083', url, image: photos[0], description: 'Description structurée du bien.',
    offers: {'@type': 'Offer', url, price: 149000, priceCurrency: 'EUR', availability: 'InStock'}, ...productChange};
  // Texte multiligne, accentué et sans séparateur avant le modèle suivant :
  // sa longueur Flight est en octets, pas en caractères JavaScript.
  const narrative = 'Démonstration\n"annonce":{"propertyReference":9999999}';
  const stream = `:HL["https://cdn.safti.fr/font.woff2","font"]\n3:T${Buffer.byteLength(narrative).toString(16)},${narrative}5:${JSON.stringify(['$', '$L38', null,
    {annonce: record, annonces: [{propertyReference: 9999999, price: 990000, photos: [{urlPhotoLarge: 'https://untrusted.example/other.jpg'}]}]}])}\n`;
  const frames = embedded ? [stream.slice(0, 73), stream.slice(73)].map(chunk => `<script>self.__next_f.push(${JSON.stringify([1, chunk])})</script>`).join('') : '';
  const field = (name: string, value: string) => `<span data-testid="${name}">${value}</span>`;
  return `<head><link rel="canonical" href="${url}"><script type="application/ld+json">${JSON.stringify(product)}</script></head><body><main>
  <h1 data-testid="heading-annonce">Maison à vendre à VILLEFRANCHE-SUR-SAONE de 57m²</h1><p data-testid="text-reference">Réf 1724083</p>
  ${field('value-type-bien', 'Maison')}${field('value-surface-habitable', '57m²')}${field('value-surface-terrain', '800m²')}
  ${field('value-piece', '2')}${field('value-chambre', '1')}${field('text-prix', '149 000 €')}
  <a data-testid="link-localisation">Villefranche-Sur-Saone - 69400</a>
  <section data-testid="section-mosaic-photo">${photos.slice(0, 5).map(src => `<img data-testid="img-photo-vitrine" src="${src}">`).join('')}</section>
  <div data-testid="corps-description"><p class="tw:hidden tw:print:flex">Une copie dédiée à l’impression.</p><div class="tw:print:hidden"><p>Une maison de 57 m², dont 40 m² Carrez.</p><p>Un garage de 35 m² et une mezzanine.</p></div></div></main>
  <aside><h2>Autre bien : 990 000 €</h2><img src="https://cdn.safti.fr/bien-photo/71/24/9999999/foreign/rg.jpg"></aside>${frames}</body>`;
}
const fails = (code: string) => (error: unknown) => error instanceof ImportFailure && error.code === code;

test('SAFTI : neuf photos du bien courant, pièces distinctes des chambres et surface habitable distincte du terrain/Carrez', () => {
  const listing = extractListingHtml(fixture(), url);
  assert.equal(listing.sourceListingId, '1724083'); assert.equal(listing.transaction, 'sale');
  assert.equal(listing.facts.price.value?.amountCents, 14900000); assert.equal(listing.facts.area.value, 57);
  assert.equal(listing.facts.rooms?.value, 2); assert.equal(listing.facts.locality.value, 'Villefranche-Sur-Saone');
  assert.deepEqual(listing.photoUrls, photos);
  assert.equal(listing.description?.text, 'Une maison de 57 m², dont 40 m² Carrez.\n\nUn garage de 35 m² et une mezzanine.');
});
test('SAFTI : galerie DOM conservée si les données Next sont absentes, sans utiliser les recommandations', () => {
  const listing = extractListingHtml(fixture({}, {}, false), url);
  assert.deepEqual(listing.photoUrls, photos.slice(0, 5));
});
test('SAFTI : identité, disponibilité et accord des données affichées/structurées restent vérifiés', () => {
  for (const change of [{propertyReference: 9999999}, {adType: 'location'}, {propertyType: 'appartement'}, {price: 990000},
    {propertySurface: 40}, {roomNumber: 1}, {city: 'Lyon'}, {photos: photos.map(v => ({urlPhotoLarge: v.replace('/1724083/', '/9999999/')}))}])
    assert.throws(() => extractListingHtml(fixture(change), url), fails('CONFLICTING_FACTS'));
  for (const change of [{sku: '9999999'}, {url: url.replace('1724083', '9999999')},
    {offers: {url, price: 990000, priceCurrency: 'EUR'}}])
    assert.throws(() => extractListingHtml(fixture({}, change), url), fails('CONFLICTING_FACTS'));
  assert.throws(() => extractListingHtml(fixture({sold: true}), url), fails('SOURCE_UNAVAILABLE'));
  assert.throws(() => extractListingHtml(fixture({retraitDiffusion: true}), url), fails('SOURCE_UNAVAILABLE'));
  assert.throws(() => extractListingHtml(fixture().replace('href="' + url + '"', 'href="' + url.replace('1724083', '9999999') + '"'), url), fails('CONFLICTING_FACTS'));
});
test('SAFTI : CDN limité aux photos SAFTI, routes directes et redirections vers le même bien', () => {
  assert.ok(ImportInput.safeParse({url}).success); assert.equal(selectAdapter(url).id, 'safti');
  const policy = sourcePolicy(url);
  assert.ok(policy.imageHosts.includes('cdn.safti.fr')); assert.ok(!policy.pageHosts.includes('cdn.safti.fr'));
  assert.ok(!sourcePolicy('https://www.orpi.com/').imageHosts.includes('cdn.safti.fr'));
  assert.ok(!sourcePolicy('https://safti.fr.evil.example/annonce').imageHosts.includes('cdn.safti.fr'));
  assert.throws(() => selectAdapter('https://www.safti.fr/acheter'), fails('NOT_A_LISTING'));
  assertListingDestination(url, url.replace('www.safti.fr', 'safti.fr'));
  assert.throws(() => assertListingDestination(url, url.replace('1724083', '9999999')), fails('SOURCE_UNAVAILABLE'));
  for (const value of ['https://cdn.safti.fr.evil.example/photo.jpg', 'https://untrusted.example/photo.jpg', 'http://cdn.safti.fr/photo.jpg'])
    assert.throws(() => scopedUrl(value, policy.imageHosts), fails('UNSAFE_URL'));
});
test('SAFTI : refus des URL privées avant téléchargement et des CDN dont le DNS pointe vers une adresse privée', async () => {
  let photoCalls = 0;
  await assert.rejects(importListing(url, {agencyId: 'fixture-agency', importId: 'unsafe-safti'}, {
    transport: {async load(value, kind) {
      if (kind !== 'page') {photoCalls++; throw new Error('No photo may be fetched');}
      const html = fixture({photos: [{urlPhotoLarge: 'https://127.0.0.1/private.jpg'}]});
      return {url: value, bytes: new TextEncoder().encode(html), mime: 'text/html', sourceBytes: Buffer.byteLength(html)};
    }}, store: async () => {throw new Error('No photo may be stored');},
  }), fails('UNSAFE_URL'));
  assert.equal(photoCalls, 0);
  let networkCalls = 0;
  await assert.rejects(nodeImportTransport({resolve: async () => [{address: '127.0.0.1', family: 4}], request: async () => {
    networkCalls++; throw new Error('Private addresses may not be contacted');
  }}).load(photos[0], 'image', sourcePolicy(url).imageHosts, new AbortController().signal), fails('UNSAFE_URL'));
  assert.equal(networkCalls, 0);
});
test('SAFTI : import complet de neuf photos sans lancer de navigateur ni récupérer de scripts', async () => {
  const stored: string[] = [], calls: string[] = [];
  const {listing, diagnostics} = await importListing(url, {agencyId: 'fixture-agency', importId: 'safti-fixture'}, {
    transport: {async load(value, kind, hosts) {
      assert.ok(hosts.includes(new URL(value).hostname)); calls.push(value);
      if (kind === 'page') {
        const html = fixture(); return {url: value, bytes: new TextEncoder().encode(html), mime: 'text/html', sourceBytes: Buffer.byteLength(html)};
      }
      const bytes = new Uint8Array(await sharp({create: {width: 960, height: 640, channels: 3, background: {r: calls.length * 15, g: 70, b: 100}}}).jpeg().toBuffer());
      return {url: value, bytes, mime: 'image/jpeg', sourceBytes: bytes.length, width: 960, height: 640};
    }}, store: async photo => {stored.push(photo.sourceUrl!);}, browserHtml: async () => {throw new Error('Browser must not run');},
  });
  assert.equal(listing.photos.length, 9); assert.deepEqual(stored, photos); assert.deepEqual(calls, [url, ...photos]);
  assert.equal(diagnostics.browserUsed, false); assert.deepEqual(listing.photos.map(p => p.sourceOrder), Array.from({length: 9}, (_, i) => i));
});
