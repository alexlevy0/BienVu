import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile, readdir} from 'node:fs/promises';
import {Miniflare, convertV4MiniflareOptions} from 'miniflare';
import {ImportFailure} from '../packages/contracts/src/index';
import {extractListingHtml} from '../packages/importers/src/listing';
import {importListing} from '../packages/importers/src/import-listing';
import type {ImportTransport} from '../packages/importers/src/network';
import {fixtureImportTransport} from '../scripts/import-fixtures';
import {createPrivateImport, importResult} from '../apps/web/lib/imports';
import {findImport} from '../packages/db/src/imports';

const source = 'https://immobilier.lefigaro.fr/annonces/annonce-123456.html';
const fixture = () => readFile(new URL('../fixtures/imports/portals/figaro-partial.html', import.meta.url), 'utf8');
const failure = (code: string) => (e: unknown) => e instanceof ImportFailure && e.code === code;
const page = (html: string): ImportTransport => ({async load(url) {const bytes = new TextEncoder().encode(html); return {url, bytes, sourceBytes: bytes.length, mime: 'text/html'};}});

test('Figaro partiel : prix, description et dimensions sans galerie, ni taxe/crédit/bien voisin', async () => {
  const html = await fixture(), value = extractListingHtml(html, source, {allowPartial: true});
  assert.equal(value.adapterVersion, 'figaro-dom/4.1'); assert.equal(value.sourceListingId, '123456');
  assert.equal(value.transaction, 'sale'); assert.equal(value.facts.propertyType.value, 'house');
  assert.equal(value.facts.locality.value, 'Ville de recette');
  assert.equal(value.facts.price.value?.amountCents, 28_000_000);
  assert.equal(value.facts.area.value, 268); assert.equal(value.facts.rooms?.value, 12);
  assert.equal(value.description?.text, 'Une maison de recette avec un jardin.\n\nDeuxième paragraphe à conserver.');
  assert.deepEqual(value.photoUrls, []);
  assert.throws(() => extractListingHtml(html, source), failure('INSUFFICIENT_PHOTOS'));
  const withoutPrice = html.replace(', 280 000 € :', ' :').replace('<p>280 000 € (1 044 € /m²)</p>', '');
  assert.equal(extractListingHtml(withoutPrice, source, {allowPartial: true}).facts.price.status, 'missing');
});
test('Figaro : identité et contradictions refusées, description abrégée signalée', async () => {
  const html = await fixture();
  for (const changed of [html.replace('content="'+source+'"', 'content="'+source.replace('123456', '999999')+'"'),
    html.replace('<p>280 000 € (1 044 € /m²)</p>', '<p>380 000 € (1 044 € /m²)</p>'),
    html.replace('<title>Vente maison', '<title>Vente appartement'),
    html.replace('(69005),','(75005),'),
    html.replace('</main>', '<h1>Vente maison 12 pièces 268 m² à Autre ville (69)</h1></main>')])
    assert.throws(() => extractListingHtml(changed, source, {allowPartial: true}), failure('CONFLICTING_FACTS'));
  const truncated = extractListingHtml(html.replace('Deuxième paragraphe à conserver.', 'Suite abrégée…'), source, {allowPartial: true});
  assert.equal(truncated.description?.truncated, true); assert.ok(truncated.warnings.some(w => w.includes('abrégée')));
});
test('Figaro : JSON-LD sans businessFunction complété par le titre, Product lié et médias de la seule fiche', async () => {
  const html = await fixture(), photos = ['a', 'b', 'c'].map(n => `https://lh3.googleusercontent.com/fixture-${n}.jpg`);
  const home = {'@type':'House',url:source,name:'Maison de recette',address:{addressLocality:'Ville de recette'},
    offers:{price:280000,priceCurrency:'EUR'},image:photos,numberOfRooms:12,floorSize:{value:268,unitCode:'MTK'}};
  const withJson = (data: unknown) => html.replace('</head>', `<script type="application/ld+json">${JSON.stringify(data)}</script></head>`);
  const parsed = extractListingHtml(withJson(home), source);
  assert.deepEqual(parsed.photoUrls, photos); assert.equal(parsed.facts.price.value?.amountCents, 28_000_000);
  const fullDescription='Une maison de recette avec un jardin.\n\nDeuxième paragraphe à conserver. Suite complète.';
  const expanded=extractListingHtml(withJson({...home,description:fullDescription}).replace('Deuxième paragraphe à conserver.</p>',
    'Deuxième paragraphe à conserver.…</p>'),source);
  assert.equal(expanded.description?.text,fullDescription);assert.equal(expanded.description?.truncated,false);
  assert.throws(() => extractListingHtml(withJson({...home,offers:{...home.offers,businessFunction:'LeaseOut'}}),source,{allowPartial:true}), failure('CONFLICTING_FACTS'));
  const product = {'@type':'Product',url:source,name:'Vente maison 12 pièces 268 m² à Ville de recette (69)',
    offers:{price:280000,priceCurrency:'EUR'},description:'Description structurée de la maison.',image:photos};
  const bound = extractListingHtml(withJson(product), source);
  assert.deepEqual(bound.photoUrls,photos);assert.equal(bound.description?.text,product.description);
  assert.throws(() => extractListingHtml(withJson({...product,url:source.replace('123456','999999')}),source,{allowPartial:true}),failure('CONFLICTING_FACTS'));
  const unbound = extractListingHtml(withJson({...product,url:undefined}),source,{allowPartial:true});assert.deepEqual(unbound.photoUrls,[]);
  assert.throws(()=>extractListingHtml(withJson({...product,offers:{...product.offers,businessFunction:'LeaseOut'}}),source,{allowPartial:true}),failure('CONFLICTING_FACTS'));
});
test('Figaro location : aucun montant locatif certain sans période mensuelle et charges', async () => {
  const html=(await fixture()).replaceAll('Vente maison','Location maison').replaceAll('280 000','950')
    .replace('950 € (1 044 € /m²)','950 € par mois charges comprises');
  const rent=extractListingHtml(html,source,{allowPartial:true});
  assert.deepEqual(rent.facts.price.value,{amountCents:95000,currency:'EUR',period:'month',charges:'included'});
  for(const value of [html.replace('par mois','par semaine'),html.replace(' charges comprises','')])
    assert.equal(extractListingHtml(value,source,{allowPartial:true}).facts.price.status,'missing');
});
test('une photo en timeout ne fait pas perdre les faits ; annulation, SSRF et stockage restent fatals', async () => {
  const url='https://fixtures.bienvu.example/vente',base=fixtureImportTransport();
  for(const code of ['IMPORT_TIMEOUT','SOURCE_BLOCKED','INSUFFICIENT_PHOTOS'] as const){
    const transport:ImportTransport={load:async(...args)=>args[1]==='page'?base.load(...args):Promise.reject(new ImportFailure(code,'fixture'))};
    const result=await importListing(url,{agencyId:'a',importId:'b'},{transport,store:async()=>{}},{allowPartial:true});
    assert.equal(result.listing.facts.price.value?.amountCents,28000000);assert.equal(result.listing.photos.length,0);
    assert.equal(result.diagnostics.rejected.length,3);assert.ok(result.listing.warnings.some(w=>w.includes('trois photos')));
  }
  const stored:string[]=[],twoPhotos:ImportTransport={load:async(...args)=>args[0].endsWith('/c.jpg')
    ?Promise.reject(new ImportFailure('IMPORT_TIMEOUT','dernière photo')):base.load(...args)};
  const recovered=await importListing(url,{agencyId:'a',importId:'b'},{transport:twoPhotos,store:async photo=>{stored.push(photo.id);}},{allowPartial:true});
  assert.equal(recovered.listing.photos.length,2);assert.deepEqual(recovered.listing.photos.map(p=>p.id),stored);
  assert.equal(recovered.listing.facts.price.value?.amountCents,28000000);
  const unsafe:ImportTransport={load:async(...args)=>args[1]==='page'?base.load(...args):Promise.reject(new ImportFailure('UNSAFE_URL','DNS privé'))};
  await assert.rejects(importListing(url,{agencyId:'a',importId:'b'},{transport:unsafe,store:async()=>{}},{allowPartial:true}),failure('UNSAFE_URL'));
  await assert.rejects(importListing(url,{agencyId:'a',importId:'b'},{transport:base,store:async()=>{throw new Error('STORAGE_FAILED');}},{allowPartial:true}),failure('INCOMPLETE_LISTING'));
  const controller=new AbortController();
  const cancelled:ImportTransport={async load(...args){if(args[1]==='page')return base.load(...args);controller.abort();return new Promise(()=>{});}};
  await assert.rejects(importListing(url,{agencyId:'a',importId:'b'},{transport:cancelled,store:async()=>{}},{allowPartial:true,signal:controller.signal}),failure('IMPORT_TIMEOUT'));
});
test('le budget photo expire avant la deadline globale, même si le transport ne répond plus', async t => {
  let now=Date.now();t.mock.method(Date,'now',()=>now);
  const base=fixtureImportTransport(),transport:ImportTransport={async load(...args){if(args[1]!=='page')return new Promise(()=>{});
    const resource=await base.load(...args);now+=59_000;return resource;}};
  const keepAlive=setTimeout(()=>{},2000);t.after(()=>clearTimeout(keepAlive));
  const result=await importListing('https://fixtures.bienvu.example/vente',{agencyId:'a',importId:'b'},
    {transport,store:async()=>{}},{allowPartial:true});
  assert.equal(result.listing.photos.length,0);assert.equal(result.listing.facts.locality.value,'Ville de recette');
  assert.equal(result.diagnostics.rejected[0].reason,'IMPORT_TIMEOUT');assert.ok(result.listing.warnings.some(w=>w.includes('interrompu')));
});
test('CDN public inconnu : zéro requête externe et faits conservés ; URL privée jamais tolérée', async () => {
  const source='https://fixtures.bienvu.example/vente',base=fixtureImportTransport();let images=0;
  const transport=(target:string):ImportTransport=>({async load(...args){if(args[1]!=='page'){images++;throw Error('NO_MEDIA_REQUEST');}
    const value=await base.load(...args);value.bytes=new TextEncoder().encode(new TextDecoder().decode(value.bytes)
      .replace(/\/photos\/([abc])\.jpg/g,`${target}?photo=$1`));value.sourceBytes=value.bytes.length;return value;}});
  const result=await importListing(source,{agencyId:'a',importId:'b'},{transport:transport('https://cdn-not-allowed.example/photo.jpg'),store:async()=>{}},{allowPartial:true});
  assert.equal(images,0);assert.equal(result.listing.facts.price.value?.amountCents,28000000);
  assert.equal(result.diagnostics.rejected[0].reason,'MEDIA_HOST_UNSUPPORTED');
  await assert.rejects(importListing(source,{agencyId:'a',importId:'b'},{transport:transport('https://127.0.0.1/private'),store:async()=>{}},{allowPartial:true}),failure('UNSAFE_URL'));
  await assert.rejects(importListing(source,{agencyId:'a',importId:'b'},{transport:transport('https://cdn-not-allowed.example/photo.jpg'),store:async()=>{}}),failure('UNSAFE_URL'));
  assert.equal(images,0);
});
test('D1 : fiche Figaro sans photos conservée, reprise sans réseau, prix et description préremplis', async t => {
  const mf=new Miniflare(convertV4MiniflareOptions({modules:true,script:'export default {fetch(){return new Response("test")}}',
    compatibilityDate:'2026-09-27',d1Databases:['DB'],r2Buckets:['MEDIA']}));t.after(()=>mf.dispose());
  const {DB,MEDIA}=await mf.getBindings<Pick<CloudflareEnv,'DB'|'MEDIA'>>();
  for(const file of (await readdir(new URL('../packages/db/migrations/',import.meta.url))).filter(f=>f.endsWith('.sql')).sort())
    await DB.exec((await readFile(new URL(`../packages/db/migrations/${file}`,import.meta.url),'utf8')).replace(/^--.*$/gm,'').replace(/\n/g,' '));
  const at=new Date().toISOString();await DB.prepare('INSERT INTO agencies(id,owner_user_id,name,created_at,updated_at) VALUES(?,?,?,?,?)').bind('partial-a','owner','Recette',at,at).run();
  const row=await createPrivateImport({DB,MEDIA},'partial-a',source,'figaro-partial-fixture',page(await fixture()));
  const value=importResult(row);assert.equal(value.status,'needs_input');assert.equal(value.draft?.data.fields.priceCents,28_000_000);
  assert.equal(value.draft?.data.fields.description,'Une maison de recette avec un jardin.\n\nDeuxième paragraphe à conserver.');
  assert.equal(value.draft?.data.provenance.priceCents?.source,'import');assert.equal(value.draft?.photos.length,0);
  assert.equal((await createPrivateImport({DB,MEDIA},'partial-a',source,'figaro-partial-fixture',{load:async()=>{throw Error('NO_REIMPORT');}})).id,row.id);
  assert.equal(await findImport(DB,'other-agency',row.id),null);
  assert.equal(await DB.prepare('SELECT id FROM jobs').first(),null);
});

test('une seule image lente ne monopolise plus le délai de toute la galerie',async t=>{
 const originalTimeout=AbortSignal.timeout.bind(AbortSignal);let imageTimeouts=0;const base=fixtureImportTransport();
 t.mock.method(AbortSignal,'timeout',(ms:number)=>ms===8000&&++imageTimeouts===1?AbortSignal.abort(new DOMException('Image trop lente','TimeoutError')):originalTimeout(ms));
 const result=await importListing('https://fixtures.bienvu.example/vente',{agencyId:'a',importId:'b'},{transport:base,store:async()=>{}},{allowPartial:true});
 assert.equal(result.listing.photos.length,2);assert.equal(result.listing.facts.price.value?.amountCents,28000000);assert.equal(result.diagnostics.rejected[0].reason,'IMPORT_TIMEOUT');
});
