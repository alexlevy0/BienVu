import {test} from 'node:test';
import assert from 'node:assert/strict';
import sharp from 'sharp';
import {GeneratableListing, ImportFailure, ImportInput} from '../packages/contracts/src/index';
import {assertListingDestination, extractListingHtml, importListing, selectAdapter, sourcePolicy} from '../packages/importers/src/index';

const id = '1234567890123456789', url = `https://www.airbnb.fr/rooms/${id}`;
const image = (n: number, listing = id) => `https://a0.muscache.com/im/pictures/hosting/Hosting-${listing}/original/photo-${n}.jpeg`;
const reference = (listing = id) => btoa(`DemandStayListing:${listing}`);
const rental = () => ({'@type': 'VacationRental', identifier: reference(), name: 'Un appartement au calme',
  address: {addressLocality: 'Paris'}, description: 'Un séjour lumineux.\n\nUne chambre au calme.',
  containsPlace: {'@type': 'Accommodation', occupancy: {value: 2}}, image: Array.from({length: 8}, (_, n) => image(n))});
const state = (count = 9) => {const payload = {data: {node: {id: reference(), propertyType: 'APARTMENT'},
  presentation: {stayProductDetailPage: {sections: {metadata: {loggingContext: {eventDataLogging: {listingId: id}},
    sharingConfig: {shareUrl: url + '?s=76', propertyType: 'Logement entier : appartement'}}, sections: [
      {sectionId: 'PHOTO_TOUR_SCROLLABLE_MODAL', section: {mediaItems: Array.from({length: count}, (_, n) => ({__typename: 'Image', baseUrl: image(n)}))}},
      {sectionId: 'SIMILAR_LISTINGS_CAROUSEL', section: {mediaItems: [{__typename: 'Image', baseUrl: image(90, '999')}]}}]}}}}};
  return {niobeClientData: [['fixture', payload] as [string, typeof payload]]};};
const html = (data = rental(), hydration: unknown = state()) => `<html><head><link rel="canonical" href="${url}">
  <meta property="og:url" content="${url}"><meta property="og:title" content="Appartement · Paris · 1 chambre · 1 lit">
  <script type="application/ld+json">${JSON.stringify(data)}</script>
  <script type="application/ld+json">${JSON.stringify({'@type': 'Product', name: data.name, image: [image(80, '888')]})}</script>
  ${hydration ? `<script id="data-deferred-state-0" type="application/json">${JSON.stringify(hydration)}</script>` : ''}</head>
  <body><h1>${data.name}</h1><img src="https://a0.muscache.com/im/pictures/user/host.jpeg">
  <script>throw new Error('must not execute');</script></body></html>`;
const fails = (code: string) => (error: unknown) => error instanceof ImportFailure && error.code === code;

test('Airbnb : location, identité exacte, description complète et galerie du logement uniquement', () => {
  const result = extractListingHtml(html(), url);
  assert.equal(selectAdapter(url).id, 'airbnb'); assert.ok(ImportInput.safeParse({url}).success);
  assert.equal(result.sourceListingId, id); assert.equal(result.adapterVersion, 'airbnb-public/1.0');
  assert.equal(result.transaction, 'rent'); assert.equal(result.facts.propertyType.value, 'apartment');
  assert.equal(result.facts.locality.value, 'Paris'); assert.equal(result.facts.title.value, rental().name);
  assert.equal(result.description?.text, rental().description);
  assert.deepEqual(result.photoUrls, Array.from({length: 9}, (_, n) => image(n) + '?im_w=1440'));
  assert.equal(result.facts.rooms?.status, 'missing'); // A bedroom/occupancy is not a room count.
});

test('Airbnb : prix par nuit, séjour, charges et devise ne deviennent jamais un loyer mensuel', () => {
  const input = {...rental(), offers: {price: 90, priceCurrency: 'EUR', priceSpecification: {unitText: 'night'}},
    containsPlace: {...rental().containsPlace, numberOfBedrooms: 1, occupancy: {value: 6}}};
  const result = extractListingHtml(html(input), url + '?check_in=2026-11-01&check_out=2026-11-03');
  assert.equal(result.facts.price.status, 'missing'); assert.equal(result.facts.area.status, 'missing');
  assert.equal(result.facts.rooms?.status, 'missing'); assert.ok(result.warnings.some(w => w.includes('courte durée')));
});

test('Airbnb : repli JSON-LD sans hydratation, types de biens et surfaces explicitement publiés', () => {
  assert.equal(extractListingHtml(html(rental(), null), url).photoUrls.length, 8);
  const house = {...rental(), containsPlace: {'@type': 'House', occupancy: {value: 4}, floorSize: {value: 123.45, unitCode: 'MTK'}}};
  const result = extractListingHtml(html(house, null).replace('Appartement · Paris', 'Maison · Paris'), url);
  assert.equal(result.facts.propertyType.value, 'house'); assert.equal(result.facts.area.value, 123.45);
  assert.throws(() => extractListingHtml(html(house), url), fails('CONFLICTING_FACTS'));
});

test('Airbnb : variantes FR/COM, suivi et slash final, jamais recherche ni autre logement', () => {
  for (const host of ['www.airbnb.fr', 'airbnb.fr', 'www.airbnb.com', 'airbnb.com']) {
    const target = `https://${host}/rooms/${id}/?s=76`;
    assert.doesNotThrow(() => assertListingDestination(url, target));
    assert.equal(extractListingHtml(html(), target).sourceListingId, id);
  }
  for (const path of ['/s/Paris/homes', '/rooms', '/rooms/not-an-id', `/rooms/${id}/photos`])
    assert.throws(() => selectAdapter('https://www.airbnb.fr' + path), fails('NOT_A_LISTING'));
  assert.throws(() => assertListingDestination(url, url.replace(id, '999')), fails('SOURCE_UNAVAILABLE'));
  assert.throws(() => assertListingDestination(url, 'https://www.airbnb.fr.attacker.example/rooms/' + id), fails('SOURCE_UNAVAILABLE'));
});

test('Airbnb : données d’un autre logement, titres ou galeries ambiguës refusés même en mode partiel', () => {
  const badState = state(); badState.niobeClientData[0][1].data.presentation.stayProductDetailPage.sections.metadata.loggingContext.eventDataLogging.listingId = '999';
  const badNode = state(); badNode.niobeClientData[0][1].data.node.id = reference('999');
  const badLink = state(); badLink.niobeClientData[0][1].data.presentation.stayProductDetailPage.sections.metadata.sharingConfig.shareUrl = url.replace(id, '999');
  for (const input of [html({...rental(), identifier: reference('999')}), html(rental(), badState), html(rental(), badNode), html(rental(), badLink),
    html().replace('<h1>Un appartement au calme', '<h1>Un autre logement'),
    html().replace('rel="canonical" href="' + url, 'rel="canonical" href="' + url.replace(id, '999')),
    html().replace('property="og:url" content="' + url, 'property="og:url" content="' + url.replace(id, '999')),
    html().replace('</head>', '<script type="application/ld+json">' + JSON.stringify(rental()) + '</script></head>')])
    for (const allowPartial of [false, true]) assert.throws(() => extractListingHtml(input, url, {allowPartial}), fails('CONFLICTING_FACTS'));
});

test('Airbnb : CDN exact et référence des photos contrôlés avant toute récupération média', async () => {
  assert.deepEqual(sourcePolicy(url).imageHosts, ['www.airbnb.fr', 'airbnb.fr', 'www.airbnb.com', 'airbnb.com', 'a0.muscache.com']);
  assert.ok(!sourcePolicy('https://agency.example/property').imageHosts.includes('a0.muscache.com'));
  for (const [value, code] of [[image(0, '999'), 'CONFLICTING_FACTS'], ['https://127.0.0.1/photo.jpg', 'UNSAFE_URL'],
    [image(0).replace('a0.muscache.com', 'a0.muscache.com.attacker.example'), 'UNSAFE_URL'],
    ['https://a0.muscache.com/im/pictures/user/avatar.jpg', 'UNSAFE_URL']] as const) {
    const altered = html().replaceAll(image(0), value); let calls = 0;
    await assert.rejects(importListing(url, {agencyId: 'airbnb-fixture', importId: 'airbnb-listing'}, {
      transport: {async load(value) {calls++; return {url: value, bytes: new TextEncoder().encode(altered), mime: 'text/html', sourceBytes: altered.length};}},
      store: async () => {throw Error('No media storage expected');},
    }), fails(code)); assert.equal(calls, 1);
  }
});

test('Airbnb : absence de données, protection ou galerie insuffisante ne fabriquent pas une annonce', () => {
  assert.throws(() => extractListingHtml('<html><title>Access Denied</title></html>', url), fails('SOURCE_BLOCKED'));
  assert.throws(() => extractListingHtml(html().replaceAll('VacationRental', 'Product'), url), fails('NOT_A_LISTING'));
  assert.throws(() => extractListingHtml(html({...rental(), image: []}, null), url), fails('INSUFFICIENT_PHOTOS'));
  assert.equal(extractListingHtml(html({...rental(), image: []}, null), url, {allowPartial: true}).photoUrls.length, 0);
});

test('Airbnb : import complet, sans script ni navigateur, normalise et conserve toute la galerie', async () => {
  const calls: string[] = [], stored: string[] = [];
  const result = await importListing(url, {agencyId: 'airbnb-fixture', importId: 'airbnb-listing'}, {
    transport: {async load(value, kind, hosts) {
      assert.ok(hosts.includes(new URL(value).hostname)); calls.push(value);
      if (kind === 'page') {const data = html(); return {url: value, bytes: new TextEncoder().encode(data), mime: 'text/html', sourceBytes: data.length};}
      const bytes = new Uint8Array(await sharp({create: {width: 1440, height: 1920, channels: 3, background: {r: calls.length * 15, g: 70, b: 90}}}).jpeg().toBuffer());
      return {url: value, bytes, mime: 'image/jpeg', sourceBytes: bytes.length, width: 1440, height: 1920};
    }}, store: async p => {stored.push(p.sourceUrl!);}, browserHtml: async () => {throw Error('No browser expected');},
  });
  assert.ok(GeneratableListing.safeParse(result.listing).success);
  assert.equal(result.listing.photos.length, 9); assert.equal(calls.length, 10); assert.equal(result.diagnostics.browserUsed, false);
  assert.deepEqual(stored, result.listing.photos.map(p => p.sourceUrl));
});
