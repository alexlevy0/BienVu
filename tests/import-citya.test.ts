import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import sharp from 'sharp';
import {GeneratableListing, ImportFailure, sourceForHost} from '../packages/contracts/src/index';
import {extractListingHtml} from '../packages/importers/src/listing';
import {selectAdapter} from '../packages/importers/src/registry';
import {sourcePolicy, scopedUrl} from '../packages/importers/src/network';
import {importListing} from '../packages/importers/src/import-listing';
import {normalizePhoto} from '../scripts/import-transport';

const url = 'https://www.citya.com/annonces/vente/appartement/toulouse-31555/TAPP176-12345';
const fixture = () => readFile(new URL('../fixtures/imports/citya.html', import.meta.url),'utf8');
const code = (expected:string) => (error:unknown) => error instanceof ImportFailure && error.code === expected;

test('Citya : offre imbriquée et galerie lazy du seul bien courant',async()=>{
  const listing=extractListingHtml(await fixture(),url);
  assert.equal(listing.sourceListingId,'TAPP176-12345');assert.equal(listing.adapterVersion,'citya-dom/1.0');
  assert.equal(listing.transaction,'sale');assert.equal(listing.facts.locality.value,'Toulouse');
  assert.equal(listing.facts.area.value,45);assert.equal(listing.facts.rooms?.value,2);
  assert.deepEqual(listing.facts.price.value,{amountCents:24000000,currency:'EUR',period:'total',charges:'not_applicable'});
  assert.equal(listing.photoUrls.length,3);assert.ok(listing.photoUrls.every(value=>value.startsWith('https://www.citya.com/media/images/agences/biens/176/vente/')));
  assert.equal(listing.description?.text,'Appartement de recette. Avec un balcon.');
});
test('Citya : le financement, les charges et la taxe ne remplacent pas le prix de vente',async()=>{
  const html=await fixture();
  assert.equal(extractListingHtml(html.replace('1 252 €/mois','9 999 €/mois'),url).facts.price.value?.amountCents,24000000);
  for(const changed of [html.replace('240 000 €','250 000 €'),html.replace('"price":240000','"price":250000')])
    for(const allowPartial of [true,false])assert.throws(()=>extractListingHtml(changed,url,{allowPartial}),code('CONFLICTING_FACTS'));
  assert.throws(()=>extractListingHtml(html.replace('240 000 €','Nous contacter'),url,{allowPartial:true}),code('INCOMPLETE_LISTING'));
});
test('Citya : identité, vente, devise et caractéristiques doivent concorder même en brouillon',async()=>{
  const html=await fixture();
  const changes=[html.replace('"url":"'+url+'"','"url":"'+url.replace('12345','12346')+'"'),
    html.replace('"itemOffered":{"@type":"Apartment"','"itemOffered":{"@id":"'+url.replace('12345','12346')+'#home","@type":"Apartment"'),
    html.replace('"priceCurrency":"EUR"','"businessFunction":"LeaseOut","priceCurrency":"EUR"'),
    html.replace('"EUR"','"USD"'),html.replace('"addressLocality":"Toulouse"','"addressLocality":"Lyon"'),
    html.replace('"postalCode":"31000"','"postalCode":"69000"'),html.replace('"value":45','"value":46'),
    html.replace('"numberOfRooms":2','"numberOfRooms":3')];
  for(const changed of changes)for(const allowPartial of [true,false])
    assert.throws(()=>extractListingHtml(changed,url,{allowPartial}),code('CONFLICTING_FACTS'));
  assert.throws(()=>extractListingHtml(html.replace('InStock','SoldOut'),url),code('SOURCE_UNAVAILABLE'));
  assert.throws(()=>extractListingHtml(html.replace('"Apartment"','"House"'),url),code('INCOMPLETE_LISTING'));
});
test('Citya : pas de choix arbitraire entre plusieurs fiches, titres ou galeries',async()=>{
  const html=await fixture();
  for(const changed of [html.replace('</head>','<script type="application/ld+json">{"@type":"RealEstateListing"}</script></head>'),
    html.replace('<section><h1>','<h1>Autre bien</h1><section><h1>'),
    html.replace('</body>','<div class="swiper-caroussel"><div class="swiper-slide"><img src="/media/images/agences/biens/176/vente/11111111-1111-4111-8111-111111111111.webp"></div></div></body>'),
    html.replace('"image":"https://www.citya.com//media/images/agences/biens/176/vente/11111111','"image":"https://www.citya.com//media/images/agences/biens/176/vente/44444444')])
    assert.throws(()=>extractListingHtml(changed,url,{allowPartial:true}),code('CONFLICTING_FACTS'));
});
test('Citya : seules les photos de la galerie identifiée et de l’agence sont acceptées',async()=>{
  const html=await fixture();
  for(const changed of [html.replace('data-src="/media/images/agences/biens/176','data-src="/media/images/agences/biens/999'),
    html.replace('data-src="/media/','data-src="https://unrelated.example/media/'),
    html.replace('222222222222.webp','222222222222.svg')])
    assert.throws(()=>extractListingHtml(changed,url,{allowPartial:true}),code('CONFLICTING_FACTS'));
  assert.throws(()=>extractListingHtml(html.replace('data-src="/media/','data-src="https://127.0.0.1/media/'),url),code('UNSAFE_URL'));
  const short=html.replace(/<div class="swiper-slide"><img data-src="[^>]+33333333[^>]+><\/div>/,'');
  assert.throws(()=>extractListingHtml(short,url),code('INSUFFICIENT_PHOTOS'));
  assert.equal(extractListingHtml(short,url,{allowPartial:true}).photoUrls.length,2);
});
test('Citya : route appartement de vente et hôtes exacts, aucun domaine média ajouté',()=>{
  assert.equal(selectAdapter(url).id,'citya');assert.equal(sourceForHost('citya.com')?.id,'citya');
  for(const changed of [url.replace('/vente/','/location/'),url.replace('/appartement/','/maison/'),'https://www.citya.com/annonces/vente'])
    assert.throws(()=>selectAdapter(changed),code('NOT_A_LISTING'));
  assert.equal(sourceForHost('other.citya.com'),undefined);
  assert.throws(()=>scopedUrl('https://cdn.citya.com/image.jpg',sourcePolicy(url).imageHosts),code('UNSAFE_URL'));
});
test('Citya : import des trois WebP de recette normalisés en JPEG privés',async()=>{
  const html=await fixture(),stored:string[]=[];
  const result=await importListing(url,{agencyId:'citya-fixture',importId:'citya-fixture'},{
    transport:{load:async value=>{
      if(value===url)return{url:value,bytes:new TextEncoder().encode(html),mime:'text/html',sourceBytes:Buffer.byteLength(html)};
      const n=Number(new URL(value).pathname.split('/').at(-1)?.[0]??1);
      const bytes=new Uint8Array(await sharp({create:{width:960,height:640,channels:3,background:{r:40+n*35,g:80,b:140}}}).webp().toBuffer());
      return{url:value,sourceBytes:bytes.length,...await normalizePhoto(bytes,'image/webp')};
    }},store:async photo=>{stored.push(photo.objectKey);}
  });
  assert.doesNotThrow(()=>GeneratableListing.parse(result.listing));assert.equal(result.listing.photos.length,3);
  assert.equal(stored.length,3);assert.equal(result.diagnostics.browserUsed,false);
});
