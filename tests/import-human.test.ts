import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import sharp from 'sharp';
import {GeneratableListing, ImportFailure, sourceForHost} from '../packages/contracts/src/index';
import {extractListingHtml} from '../packages/importers/src/listing';
import {assertListingDestination, selectAdapter} from '../packages/importers/src/registry';
import {sourcePolicy, scopedUrl} from '../packages/importers/src/network';
import {importListing} from '../packages/importers/src/import-listing';

const url = 'https://www.human-immobilier.fr/annonce-achat-appartement-tulle_259-4183';
const fixture = () => readFile(new URL('../fixtures/imports/human.html', import.meta.url), 'utf8');
const code = (expected: string) => (error: unknown) => error instanceof ImportFailure && error.code === expected;

test('HUMAN : prix honoraires inclus, surface habitable précise et pièces du bien courant', async () => {
  const listing = extractListingHtml(await fixture(), url);
  assert.equal(listing.sourceListingId, '259-4183'); assert.equal(listing.transaction, 'sale');
  assert.equal(listing.facts.propertyType.value, 'apartment'); assert.equal(listing.facts.locality.value, 'Tulle');
  assert.equal(listing.facts.rooms?.value, 3); assert.equal(listing.facts.area.value, 56.63);
  assert.deepEqual(listing.facts.price.value, {amountCents:7234500, currency:'EUR', period:'total', charges:'not_applicable'});
  assert.equal(listing.description?.text, 'Appartement de recette.\n\nAvec un balcon.');
  assert.equal(listing.photoUrls.length, 3); assert.ok(listing.photoUrls.every(value => value.includes('/259-4183_')));
  assert.deepEqual(listing.warnings, []);
});

test('HUMAN : route directe, alias exacts et seul bucket de photos observé', async () => {
  assert.equal(selectAdapter(url).id, 'human'); assert.equal(selectAdapter(url).listingId, '259-4183');
  assert.equal(sourceForHost('human-immobilier.fr')?.id, 'human');
  assert.equal(extractListingHtml(await fixture(), url.replace('www.', '')).facts.locality.value, 'Tulle');
  assert.equal(sourceForHost('agence.human-immobilier.fr'), undefined);
  for (const value of ['https://www.human-immobilier.fr/achat', 'https://www.human-immobilier.fr/tulle', url.replace('achat', 'location')])
    assert.throws(() => selectAdapter(value), code('NOT_A_LISTING'));
  assert.throws(() => assertListingDestination(url, url.replace('259-4183', '259-4184')), code('SOURCE_UNAVAILABLE'));
  for (const host of ['another.s3.fr-par.scw.cloud','humanimmobilier-images.s3.fr-par.scw.cloud.attacker.example','cdn.human-immobilier.fr'])
    assert.throws(() => scopedUrl(`https://${host}/image.jpg`, sourcePolicy(url).imageHosts), code('UNSAFE_URL'));
});

test('HUMAN : prix vendeur, financement, revenus du secteur et biens voisins sont exclus', async () => {
  const html = await fixture();
  const missing = html.replace('"price":"72345"', '"price":null').replace('class="prix">72 345 €', 'class="prix">Nous contacter')
    .replace('Prix honoraires inclus : 72 345 €', 'Prix honoraires inclus : nous contacter');
  assert.equal(extractListingHtml(missing, url).facts.price.status, 'missing');
  for (const altered of [html.replace('"price":"72345"','"price":"72346"'),
    html.replace('Prix honoraires inclus : 72 345 €','Prix honoraires inclus : 73 345 €'),
    html.replace('class="prix">72 345 €','class="prix">73 345 €')])
    for (const allowPartial of [false, true]) assert.throws(() => extractListingHtml(altered, url, {allowPartial}), code('CONFLICTING_FACTS'));
});

test('HUMAN : seules les surfaces réellement arrondies concordent, sans assimiler le séjour', async () => {
  const html = await fixture();
  assert.equal(extractListingHtml(html.replaceAll('56,6 m²','56,63 m²'), url).facts.area.value,56.63);
  assert.equal(extractListingHtml(html.replace('"value":"56,63"','"value":"56,64"'),url).facts.area.value,56.64);
  for (const altered of [html.replace('"value":"56,63"','"value":"56,70"'),
    html.replace('Surface habitable : 56,6','Surface habitable : 56,7'),
    html.replace('3 p 56,6','3 p 56,7'), html.replace('"unitCode":"MTK"','"unitCode":"FTK"').replace('3 p 56,6','3 p 56,7')])
    assert.throws(() => extractListingHtml(altered,url), code('CONFLICTING_FACTS'));
  const absent = html.replace('"floorSize":{"@type":"QuantitativeValue","value":"56,63","unitCode":"MTK"}', '"floorSize":null')
    .replace('Surface habitable : 56,6 m²','Surface habitable : nous contacter').replace('3 p 56,6 m² DPE D','DPE D');
  assert.equal(extractListingHtml(absent,url).facts.area.status,'missing');
});

test('HUMAN : identité, transaction, type, ville et pièces restent contrôlés en import partiel', async () => {
  const html = await fixture();
  const changes = [html.replace('Réf : 259-4183','Réf : 259-4184'),html.replace('Réf. 259-4183','Réf. 259-4184'),
    html.replace('259-4183#listing','259-4184#listing'),html.replace('259-4183#offer','259-4184#offer'),
    html.replace('class="ville">Tulle','class="ville">Lyon'),html.replace('"addressLocality":"Tulle"','"addressLocality":"Lyon"'),
    html.replace('"numberOfRooms":"3"','"numberOfRooms":"4"'),html.replace('Pièce(s) : 3','Pièce(s) : 4'),
    html.replace('"Apartment"','"House"'),html.replace('Appartement à vendre','Appartement à louer'),
    html.replace('detail-annonce-vente','detail-annonce-location'),html.replace('"EUR"','"USD"'),
    html.replace('"priceCurrency":"EUR"','"businessFunction":"LeaseOut","priceCurrency":"EUR"')];
  for (const changed of changes) for (const allowPartial of [false,true])
    assert.throws(() => extractListingHtml(changed,url,{allowPartial}),code('CONFLICTING_FACTS'));
  assert.throws(() => extractListingHtml(html.replace('InStock','SoldOut'),url),code('SOURCE_UNAVAILABLE'));
});

test('HUMAN : toutes les images appartiennent à la galerie, au bucket et à la référence exacte', async () => {
  const html = await fixture();
  for (const changed of [html.replace('259-4183_000002','259-4184_000002'),
    html.replace('259-4183_000002.jpg','259-4183_000002.pdf'),
    html.replace('259-4183_000001.jpg"','259-4183_999999.jpg"'),
    html.replace('src="https://humanimmobilier-images.s3.fr-par.scw.cloud/','src="https://other.example/'),
    html.replace('src="https://humanimmobilier-images.s3.fr-par.scw.cloud/','src="https://another.s3.fr-par.scw.cloud/')])
    for (const allowPartial of [false,true]) assert.throws(() => extractListingHtml(changed,url,{allowPartial}),code('CONFLICTING_FACTS'));
  const short = html.replace(/<div class="photo"><img[^>]+000003[^>]+><\/div>/,'');
  assert.throws(() => extractListingHtml(short,url),code('INSUFFICIENT_PHOTOS'));
  assert.equal(extractListingHtml(short,url,{allowPartial:true}).photoUrls.length,2);
  assert.throws(() => extractListingHtml(html.replace('src="https://humanimmobilier-images.s3.fr-par.scw.cloud/', 'src="https://127.0.0.1/'),url),code('UNSAFE_URL'));
});

test('HUMAN : aucune sélection arbitraire entre plusieurs fiches ou listes de résultats', async () => {
  const html = await fixture();
  assert.throws(() => extractListingHtml(html.replace('"@type":"Organization"','"@type":"RealEstateListing"'),url),code('CONFLICTING_FACTS'));
  assert.throws(() => extractListingHtml(html.replace('"@type":"Organization"','"@type":"ItemList"'),url),code('NOT_A_LISTING'));
  assert.throws(() => extractListingHtml(html.replace('id="detail_bien"','id="another"'),url),code('NOT_A_LISTING'));
  assert.throws(() => extractListingHtml(html.replace('"price":"72345"','"price":(()=>1)()'),url),code('NOT_A_LISTING'));
});

test('HUMAN : import complet sur transport de recette avec trois JPEG distincts', async () => {
  const html = await fixture(), stored: string[] = [];
  const {listing, diagnostics} = await importListing(url, {agencyId:'human-fixture',importId:'human-import'}, {
    transport:{load:async value => {
      if (value === url) return {url:value,bytes:new TextEncoder().encode(html),mime:'text/html',sourceBytes:Buffer.byteLength(html)};
      const index = Number(new URL(value).pathname.match(/_(\d+)\.jpg/)?.[1]); assert.ok(index>=1 && index<=3);
      const bytes = new Uint8Array(await sharp({create:{width:960,height:640,channels:3,background:{r:40+index*50,g:90,b:120}}}).jpeg().toBuffer());
      return {url:value,bytes,mime:'image/jpeg',sourceBytes:bytes.length,width:960,height:640};
    }}, store:async photo=>{stored.push(photo.objectKey);}
  });
  assert.doesNotThrow(()=>GeneratableListing.parse(listing)); assert.equal(listing.photos.length,3); assert.equal(stored.length,3);
  assert.equal(diagnostics.browserUsed,false); assert.equal(diagnostics.resources,4);
});

test('HUMAN : un refus HTTP garde SOURCE_BLOCKED, sans appel navigateur ni stockage', async () => {
  let requests=0,browser=0,stored=0;
  await assert.rejects(importListing(url,{agencyId:'human-fixture',importId:'human-refused'}, {
    transport:{load:async()=>{requests++;throw new ImportFailure('SOURCE_BLOCKED','HTTP 403','access_denied');}},
    browserHtml:async()=>{browser++;return fixture();},store:async()=>{stored++;}
  }),code('SOURCE_BLOCKED'));
  assert.equal(requests,1); assert.equal(browser,0); assert.equal(stored,0);
});
