import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import sharp from 'sharp';
import {GeneratableListing, ImportFailure, sourceForHost} from '../packages/contracts/src/index';
import {extractListingHtml} from '../packages/importers/src/listing';
import {assertListingDestination, selectAdapter} from '../packages/importers/src/registry';
import {scopedUrl, sourcePolicy} from '../packages/importers/src/network';
import {importListing} from '../packages/importers/src/import-listing';

const url = 'https://nestenn.com/appartement-recette-ref-39584333';
const canonicalUrl = url.replace('nestenn.com', 'immobilier-lyon-8.nestenn.com');
const fixture = () => readFile(new URL('../fixtures/imports/nestenn.html', import.meta.url), 'utf8');
const code = (expected: string) => (error: unknown) => error instanceof ImportFailure && error.code === expected;

test('Nestenn : alias explicite, JSON-LD concaténé, surface et pièces à quatre décimales', async () => {
  const value = extractListingHtml(await fixture(), url);
  assert.equal(value.canonicalUrl, canonicalUrl);
  assert.equal(value.sourceListingId, '39584333');
  assert.equal(value.transaction, 'sale');
  assert.equal(value.facts.propertyType.value, 'apartment');
  assert.equal(value.facts.locality.value, 'LYON');
  assert.equal(value.facts.area.value, 65);
  assert.equal(value.facts.rooms?.value, 3);
  assert.deepEqual(value.facts.price.value, {amountCents:19900000,currency:'EUR',period:'total',charges:'not_applicable'});
  assert.equal(value.description?.text, 'Appartement de recette.\nAvec un balcon.');
  assert.equal(value.photoUrls.length, 3);
  assert.ok(value.photoUrls.every(value => value.includes('/39584333')));
  assert.deepEqual(value.warnings, []);
  assert.equal(extractListingHtml(await fixture(), canonicalUrl).canonicalUrl, canonicalUrl);
});

test('Nestenn : JSON-LD standard et espaces du titre sont également acceptés', async () => {
  const html = await fixture();
  const standard = html.replace('<script type="application/ld+json">', '<script type="application/ld+json">[')
    .replace('</script>', ']</script>').replace('"name":"Appartement 3', '"name":"Appartement  3');
  assert.equal(extractListingHtml(standard, url).facts.area.value, 65);
});

test('Nestenn : seuls l’agence et le CDN observés sont autorisés, sans joker', () => {
  assert.equal(selectAdapter(url).listingId, '39584333');
  assert.deepEqual(sourcePolicy(url), {pageHosts:['nestenn.com','www.nestenn.com','immobilier-lyon-8.nestenn.com'],
    imageHosts:['nestenn.com','www.nestenn.com','immobilier-lyon-8.nestenn.com','media-nestenn.immo-facile.com']});
  assert.equal(sourceForHost('agence-inconnue.nestenn.com'), undefined);
  for (const host of ['nestenn.com.attacker.example','media-nestenn.immo-facile.com.attacker.example','autre.immo-facile.com'])
    assert.throws(() => scopedUrl(`https://${host}/image.jpg`, sourcePolicy(url).imageHosts), code('UNSAFE_URL'));
  assert.throws(() => selectAdapter('https://nestenn.com/vente/appartement/lyon'), code('NOT_A_LISTING'));
  assert.throws(() => assertListingDestination(url, url.replace('39584333','39584334')), code('SOURCE_UNAVAILABLE'));
});

test('Nestenn : canonique et références d’un autre bien restent refusés, même en partiel', async () => {
  const html = await fixture();
  const changes = [
    html.replace('href="https://immobilier-lyon-8.nestenn.com/', 'href="https://agence-inconnue.nestenn.com/'),
    html.replace('ref-39584333">', 'ref-39584334">'),
    html.replace('"url":"appartement-recette-ref-39584333"', '"url":"appartement-recette-ref-39584334"'),
    html.replace('name="productsId" value="39584333"', 'name="productsId" value="39584334"'),
    html.replace('</form>', '<input name="productsId" type="hidden" value="39584334"></form>'),
  ];
  for (const changed of changes) for (const allowPartial of [false,true])
    assert.throws(() => extractListingHtml(changed,url,{allowPartial}), code('CONFLICTING_FACTS'));
});

test('Nestenn : villes, surfaces, pièces et types contradictoires restent bloquants', async () => {
  const html = await fixture();
  for (const changed of [html.replace('"addressLocality":"LYON"','"addressLocality":"PARIS"'),
    html.replace('"postalCode":"69008"','"postalCode":"69007"'),
    html.replace('"value":"65.0000"','"value":"64.0000"'),
    html.replace('"numberOfRooms":"3.0000"','"numberOfRooms":"4.0000"'),
    html.replace('"@type":"Apartment"','"@type":"House"'),
    html.replace('<p class="critere">65 m² habitables','<p class="critere">64 m² habitables')])
    for (const allowPartial of [false,true]) assert.throws(() => extractListingHtml(changed,url,{allowPartial}), code('CONFLICTING_FACTS'));
  assert.throws(() => extractListingHtml(html.replace('Appartement à vendre','Appartement à louer'),url), code('INCOMPLETE_LISTING'));
});

test('Nestenn : le prêt et les voisins ne remplacent pas le prix de vente manquant', async () => {
  const html = (await fixture()).replace('class="titre1">199 000 €', 'class="prix-indisponible">Nous contacter');
  const value = extractListingHtml(html, url);
  assert.equal(value.facts.price.status,'missing');
  assert.equal(value.photoUrls.length,3);
  const offer = (await fixture()).replace('"numberOfRooms":"3.0000"',
    '"offers":{"price":190000,"priceCurrency":"EUR","businessFunction":"Sell"},"numberOfRooms":"3.0000"');
  assert.throws(() => extractListingHtml(offer,url), code('CONFLICTING_FACTS'));
  assert.throws(() => extractListingHtml(offer.replace('"Sell"','"LeaseOut"'),url), code('CONFLICTING_FACTS'));
});

test('Nestenn : la galerie doit appartenir exactement à la référence et au CDN', async () => {
  const html = await fixture();
  const changes = [html.replace('/39584333a.jpg','/39584334a.jpg'),
    html.replace('/3/9/5/8/4/3/3/3/', '/3/9/5/8/4/3/3/4/'),
    html.replace('href="https://media-nestenn.immo-facile.com/', 'href="https://another.example/'),
    html.replace('/39584333a.jpg','/39584333a.pdf')];
  for (const changed of changes) for (const allowPartial of [false,true])
    assert.throws(() => extractListingHtml(changed,url,{allowPartial}), code('CONFLICTING_FACTS'));
  const short = html.replace(/<a href="[^\"]+39584333c\.jpg"><\/a>/, '');
  assert.throws(() => extractListingHtml(short,url), code('INSUFFICIENT_PHOTOS'));
  assert.equal(extractListingHtml(short,url,{allowPartial:true}).photoUrls.length,2);
});

test('Nestenn : plusieurs biens ou JSON non valide ne sont jamais exécutés ni sélectionnés arbitrairement', async () => {
  const html = await fixture();
  const duplicate = html.replace('{"@type":"Organization"', '{"@type":"Apartment","name":"Autre bien"},{"@type":"Organization"');
  assert.throws(() => extractListingHtml(duplicate,url), code('CONFLICTING_FACTS'));
  assert.throws(() => extractListingHtml(html.replace('"3.0000"','(()=>{throw new Error("executed")})()'),url), code('NOT_A_LISTING'));
  assert.throws(() => extractListingHtml(html.replace('id="description"','id="another"'),url), code('NOT_A_LISTING'));
});

test('Nestenn : import complet avec trois JPEG distincts sur transport de recette', async () => {
  const html = await fixture(), stored: string[] = [];
  const {listing,diagnostics} = await importListing(url,{agencyId:'nestenn-fixture',importId:'nestenn-import'},{
    transport:{load:async value => {
      if(value===url)return {url:value,bytes:new TextEncoder().encode(html),mime:'text/html',sourceBytes:Buffer.byteLength(html)};
      const index=['a.jpg','b.jpg','c.jpg'].findIndex(suffix=>value.endsWith(suffix)); assert.ok(index>=0);
      const bytes=new Uint8Array(await sharp({create:{width:960,height:640,channels:3,background:{r:40+index*60,g:90,b:120}}}).jpeg().toBuffer());
      return {url:value,bytes,mime:'image/jpeg',sourceBytes:bytes.length,width:960,height:640};
    }},store:async photo=>{stored.push(photo.objectKey);}
  });
  assert.doesNotThrow(()=>GeneratableListing.parse(listing));
  assert.equal(listing.photos.length,3); assert.equal(stored.length,3);
  assert.equal(diagnostics.browserUsed,false); assert.equal(diagnostics.resources,4);
});
