import {test} from 'node:test';
import assert from 'node:assert/strict';
import sharp from 'sharp';
import {ImportFailure, ImportInput} from '../packages/contracts/src/index';
import {extractListingHtml, importListing, selectAdapter, sourcePolicy, assertListingDestination} from '../packages/importers/src/index';

const cesarUrl = 'https://www.cesaretbrutus.com/bien/vente-maison-7-pieces-27165-m%c2%b2-a-limonest-mcl-10287-cesaretbrutus69/';
const iadUrl = 'https://www.iadfrance.fr/annonce/appartement-vente-3-pieces-lyon-55m2/r2125326';
const remaxUrl = 'https://remax.fr/fr/mandats/vente-maison-ch3-charente-maritime---17-etaules/749351027-200';
const ld = (data: unknown) => `<script type="application/ld+json">${JSON.stringify(data)}</script>`;
const json = (id: string, data: unknown) => `<script type="application/json" id="${id}">${JSON.stringify(data)}</script>`;
const cesarPhotos = Array.from({length: 14}, (_, i) => `https://www.cesaretbrutus.com/wp-content/uploads/2026/10/property_${i}_original.jpg`);
const field = (name: string, value: string) => `<li class="es-property-field--${name}"><span class="es-property-field__value">${value}</span></li>`;
const cesarHtml = `<head>${ld({'@type': 'House', url: cesarUrl, address: '69760 Limonest', image: cesarPhotos})}</head><body><div class="js-es-single">
<div class="es-single__header"><h1 class="property-title">VENTE d’une Maison 7 pièces (271,65 m²) à LIMONEST</h1><p class="reference-annonce">Référence : MCL-10287-CESARETBRUTUS69</p><span class="es-price">1,290,000€</span></div>
${field('es_type', 'MAISON')}${field('rubrique', 'Vente')}${field('es_status', 'SUR LE MARCHE')}${field('city', 'Limonest')}${field('area', '271.65 m²')}${field('surface-terrain', '2000 m²')}${field('pieces', '7')}${field('bedrooms', '6')}${field('post_content', '<p>Un séjour lumineux.</p><p>Une grande terrasse.</p>')}
</div><aside><span class="es-price">311,500€</span><img src="https://untrusted.example/other-listing.jpg"></aside></body>`;

const iadPhotos = Array.from({length: 8}, (_, i) => `https://images.playiad.com/property/broadcast/2026/10/05/photo-${i}.png`);
function iadFixture(change: Record<string, unknown> = {}, brokenIndex = false, duplicate = false) {
  const data: unknown[] = [], ref = (value: unknown) => {data.push(value); return data.length - 1;};
  const values: Record<string, unknown> = {propertyListingRef: 2125326, transactionType: 'sale', propertyType: 'apartment', mainSurface: 55, roomsCount: 3,
    location: {place: ref('Lyon')}, prices: {formattedMain: ref('278 000 €')}, media: {photos: ref(iadPhotos.map(ref))}, description: 'Un appartement lumineux.\n\nDeux chambres et un parking.', ...change};
  const record = Object.fromEntries(Object.entries(values).map(([key, value]) => [key, ref(value)]));
  if (brokenIndex) record.mainSurface = 99999;
  ref(record); if (duplicate) ref({...record});
  ref({propertyListingRef: ref(9999999), photos: ref(['https://untrusted.example/recommendation.jpg'])});
  return `<head>${ld({'@graph': [{'@type': 'Apartment', '@id': iadUrl + '#/schema/apartment/1', address: {addressLocality: 'Lyon'}, floorSize: {value: 55, unitCode: 'MTK'}, numberOfRooms: 3},
    {'@type': 'Offer', '@id': iadUrl + '#/schema/offer/1', url: new URL(iadUrl).pathname, itemOffered: {'@id': new URL(iadUrl).pathname + '#property'}, price: '278 000 €', priceCurrency: 'EUR'}]})}${json('__NUXT_DATA__', data)}</head>
  <body><h1>Appartement à vendre 3 pièces 55 m² Lyon 4</h1><p>Réf : 2125326</p>${iadPhotos.slice(0, 3).map(v => `<img data-dd-action-name="property_media_image" src="${v.replace('images.playiad.com', 'images.iadfrance.fr')}?width=390">`).join('')}<aside>565 000 €<img src="https://untrusted.example/other-listing.jpg"></aside></body>`;
}
const remaxPhotos = Array.from({length: 15}, (_, i) => `listings/74935/1266381/photo-${i}.jpg`);
function remaxFixture(change: Record<string, unknown> = {}) {
  const record = {id: 1266381, listingTitle: '749351027-200', descriptionTags: new URL(remaxUrl).pathname.split('/')[3], listingPrice: 340000, livingArea: 112, totalArea: 112,
    totalRooms: 4, numberOfBedrooms: 3, regionName3: 'Étaules', isActive: true, isPublished: true, isOnline: true, isSold: false, listingPictures: remaxPhotos, ...change};
  return `<head>${ld({'@type': 'Product', name: '749351027-200', offers: {'@type': 'Offer', price: 340000, priceCurrency: 'EUR', itemOffered: {'@type': 'House', name: '749351027-200',
    image: 'https://i.maxwork.fr/ds-l/' + remaxPhotos[0], floorSize: {value: 112, unitCode: 'MTK'}, numberOfBedrooms: 3}}})}${json('__NEXT_DATA__', {props: {pageProps: {listingEncoded: Buffer.from(JSON.stringify(record)).toString('base64')}}})}</head>
  <body><h1 hidden>Unrendered template</h1><p>Maison 3 chambre(s) à vendre - Étaules</p><div><h2>340 000 €</h2><span>Vente</span><div>id. 749351027-200</div></div><p>112 m² · 3 Chambres</p>
  <div id="description"><div class="custom-description"><p>Un séjour ouvert sur le jardin.</p><p>Trois chambres et un bureau.</p></div></div><aside><h2>999 000 €</h2><img src="https://untrusted.example/other-listing.jpg"></aside><script src="https://static.proptexx.com/widget/loader.js"></script></body>`;
}
const fails = (code: string) => (error: unknown) => error instanceof ImportFailure && error.code === code;

test('César & Brutus : prix groupé, surface habitable, pièces et galerie du seul bien courant', () => {
  const listing = extractListingHtml(cesarHtml, cesarUrl);
  assert.equal(listing.sourceListingId, 'mcl-10287-cesaretbrutus69'); assert.equal(listing.facts.price.value?.amountCents, 129000000);
  assert.equal(listing.facts.area.value, 271.65); assert.equal(listing.facts.rooms?.value, 7); assert.equal(listing.facts.locality.value, 'Limonest');
  assert.deepEqual(listing.photoUrls, cesarPhotos); assert.equal(listing.description?.text, 'Un séjour lumineux.\n\nUne grande terrasse.');
  for (const altered of [cesarHtml.replace('Référence : MCL-10287', 'Référence : MCL-99999'), cesarHtml.replace('271.65 m²', '2000 m²'),
    cesarHtml.replace('>Vente<', '>Location<'), cesarHtml.replace('1,290,000€', '1,290,000€</span><span class="es-price">900,000€')])
    assert.throws(() => extractListingHtml(altered, cesarUrl), fails('CONFLICTING_FACTS'));
  assert.throws(() => extractListingHtml(cesarHtml.replace('SUR LE MARCHE', 'VENDU'), cesarUrl), fails('SOURCE_UNAVAILABLE'));
});
test('iad : références Nuxt bornées, galerie complète, description et accord des chiffres JSON-LD/titre', () => {
  const listing = extractListingHtml(iadFixture(), iadUrl);
  assert.equal(listing.facts.price.value?.amountCents, 27800000); assert.equal(listing.facts.area.value, 55); assert.equal(listing.facts.rooms?.value, 3);
  assert.deepEqual(listing.photoUrls, iadPhotos); assert.equal(listing.description?.text, 'Un appartement lumineux.\n\nDeux chambres et un parking.');
  for (const html of [iadFixture({propertyListingRef: 9999999}), iadFixture({roomsCount: 2}), iadFixture({transactionType: 'rent'}),
    iadFixture({}, true), iadFixture({}, false, true), iadFixture().replace('"price":"278 000 €"', '"price":"565 000 €"'),
    iadFixture().replace('src="https://images.iadfrance.fr/property/broadcast/2026/10/05/photo-0', 'src="https://images.iadfrance.fr/property/broadcast/2026/10/05/foreign')])
    assert.throws(() => extractListingHtml(html, iadUrl), fails('CONFLICTING_FACTS'));
});
test('RE/MAX : 4 pièces distinctes de 3 chambres, données UTF-8 et galerie sans widget tiers', () => {
  const listing = extractListingHtml(remaxFixture(), remaxUrl);
  assert.equal(listing.facts.rooms?.value, 4); assert.equal(listing.facts.area.value, 112); assert.equal(listing.facts.price.value?.amountCents, 34000000);
  assert.equal(listing.facts.locality.value, 'Étaules'); assert.deepEqual(listing.photoUrls, remaxPhotos.map(v => 'https://i.maxwork.fr/l-view/' + v));
  assert.match(listing.description!.text, /Trois chambres et un bureau/);
  const unknownRooms = extractListingHtml(remaxFixture({totalRooms: null}), remaxUrl);
  assert.equal(unknownRooms.facts.rooms?.status, 'missing');
  for (const change of [{listingTitle: '749351027-999'}, {listingPrice: 900000}, {livingArea: 120}, {listingPictures: [...remaxPhotos, 'listings/74935/9999/foreign.jpg']}])
    assert.throws(() => extractListingHtml(remaxFixture(change), remaxUrl), fails('CONFLICTING_FACTS'));
  assert.throws(() => extractListingHtml(remaxFixture({isSold: true}), remaxUrl), fails('SOURCE_UNAVAILABLE'));
  assert.throws(() => extractListingHtml(remaxFixture({listingPictures: ['https://127.0.0.1/private.jpg']}), remaxUrl), fails('UNSAFE_URL'));
  assert.throws(() => extractListingHtml(remaxFixture().replace(/"listingEncoded":"[^"]+"/, '"listingEncoded":"???"'), remaxUrl), fails('NOT_A_LISTING'));
});
test('agences : chemins précis, redirections et CDN limités à la source, aucun widget autorisé', () => {
  for (const [url, id] of [[cesarUrl, 'cesar-brutus'], [iadUrl, 'iad'], [remaxUrl, 'remax']]) {
    assert.equal(selectAdapter(url).id, id); assert.ok(ImportInput.safeParse({url}).success);
    assert.throws(() => selectAdapter(new URL('/', url).href), fails('NOT_A_LISTING'));
    assert.throws(() => assertListingDestination(url, url.replace(/10287|2125326|749351027-200/, '99999')), fails('SOURCE_UNAVAILABLE'));
    assert.ok(!sourcePolicy(url).imageHosts.includes('static.proptexx.com'));
  }
  assert.deepEqual(sourcePolicy(iadUrl).imageHosts, ['www.iadfrance.fr', 'iadfrance.fr', 'images.playiad.com', 'images.iadfrance.fr']);
  assert.deepEqual(sourcePolicy(remaxUrl).imageHosts, ['remax.fr', 'www.remax.fr', 'i.maxwork.fr']);
  assert.deepEqual(sourcePolicy('https://other.example/annonce').imageHosts, ['other.example']);
  for (const [html, url] of [[cesarHtml.replace(cesarPhotos[0], 'https://127.0.0.1/private.jpg'), cesarUrl],
    [iadFixture().replace(iadPhotos[0], 'https://127.0.0.1/private.jpg'), iadUrl]])
    assert.throws(() => extractListingHtml(html, url), fails('UNSAFE_URL'));
});
test('agences : import de JPEG distincts, ordre et plafond de 12 photos, sans navigateur', async () => {
  for (const [html, url, count] of [[cesarHtml, cesarUrl, 12], [iadFixture(), iadUrl, 8], [remaxFixture(), remaxUrl, 12]] as const) {
    const calls: string[] = [], stored: string[] = []; let browsers = 0;
    const result = await importListing(url, {agencyId: 'agency-fixture', importId: 'listing-fixture'}, {
      transport: {async load(value, kind, hosts) {
        assert.ok(hosts.includes(new URL(value).hostname)); calls.push(value);
        if (kind === 'page') return {url: value, bytes: new TextEncoder().encode(html), mime: 'text/html', sourceBytes: html.length};
        const bytes = new Uint8Array(await sharp({create: {width: 960, height: 640, channels: 3, background: {r: calls.length * 13, g: 60, b: 90}}}).jpeg().toBuffer());
        return {url: value, bytes, mime: 'image/jpeg', sourceBytes: bytes.length, width: 960, height: 640};
      }}, store: async (photo, bytes) => {assert.equal((await sharp(bytes).metadata()).format, 'jpeg'); stored.push(photo.sourceUrl!);},
      browserHtml: async () => {browsers++; throw new Error('Browser must not be used');},
    });
    assert.equal(browsers, 0); assert.equal(result.diagnostics.browserUsed, false); assert.equal(result.listing.photos.length, count);
    assert.equal(new Set(result.listing.photos.map(p => p.contentHash)).size, count); assert.equal(calls.length, count + 1);
    assert.deepEqual(stored, extractListingHtml(html, url).photoUrls.slice(0, count));
    assert.deepEqual(result.listing.photos.map(p => p.sourceOrder), Array.from({length: count}, (_, i) => i));
  }
});
