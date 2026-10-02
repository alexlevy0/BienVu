import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {ImportFailure, ImportInput, ImportUrl, NormalizedListing, importFailureReason, importSources, sourceCoverage, type ImportFailureReason} from '../packages/contracts/src/index';
import {selectAdapter, assertListingDestination} from '../packages/importers/src/registry';
import {extractListingHtml} from '../packages/importers/src/listing';
import {importListing} from '../packages/importers/src/import-listing';
import {sourcePolicy, type ImportTransport} from '../packages/importers/src/network';
import {htmlDocument} from '../packages/importers/src/html';
import {nodeImportTransport} from '../scripts/import-transport';
import {fixtureImportTransport} from '../scripts/import-fixtures';
import {saleFixture} from '../fixtures/contracts';
import {importPorts} from '../apps/web/lib/import-transport';
import type {Database} from '../packages/db/src/index';

const generic = 'https://fixtures.bienvu.example/vente';
const bienici = 'https://www.bienici.com/annonce/vente/recette/appartement/3pieces/fixture-123';
const seloger = 'https://www.seloger.com/annonce/achat/region/departement/ville/ABC123';
const fixture = (name: string) => readFile(new URL(`../fixtures/imports/${name}.html`, import.meta.url), 'utf8');
const fails = (code: string, reason?: ImportFailureReason) => (error: unknown) => error instanceof ImportFailure
  && error.code === code && (!reason || error.reason === reason);
function pageTransport(html: string, finalUrl?: string): ImportTransport {
  return {load: async url => {const bytes = new TextEncoder().encode(html);
    return {url: finalUrl ?? url, mime: 'text/html', bytes, sourceBytes: bytes.length};}};
}

test('registre : routes actuelles, variantes explicites et aucun choix par sous-chaîne', () => {
  const cases = [
    ['figaro', 'https://immobilier.lefigaro.fr/annonces/annonce-123456.html'],
    ['seloger', seloger], ['seloger', 'https://seloger.com/annonces/locations/appartement/ville/quartier/123456.htm'],
    ['leboncoin', 'https://www.leboncoin.fr/ad/ventes_immobilieres/123456'],
    ['leboncoin', 'https://leboncoin.fr/locations/123456.htm'], ['bienici', bienici],
    ['bienici', 'https://bienici.com/annonce/location/ville/maison/fixture-123'],
    ['espaces-atypiques', 'https://espaces-atypiques.com/ventes/recette-123/'],
    ['century21', 'https://century21.fr/trouver_logement/detail/123456/'],
    ['orpi', 'https://orpi.com/annonce-vente-appartement-test-12345678-1234-1234-1234-123456789012/'],
  ];
  for (const [id, url] of cases) assert.equal(selectAdapter(url).id, id, url);
  for (const url of ['https://seloger.com.evil.example/annonce/achat/a/b/c/ABC123', 'https://evil-seloger.com/annonce/achat/a/b/c/ABC123', generic]) {
    assert.equal(selectAdapter(url).id, 'generic');
    assert.deepEqual(sourcePolicy(url).imageHosts, [new URL(url).hostname]);
  }
  for (const url of [seloger.replace('https:', 'http:'), seloger.replace('www.', 'user:pass@www.'), seloger.replace('.com/', '.com:444/')])
    assert.throws(() => selectAdapter(url), ImportFailure);
  assert.ok(sourcePolicy(bienici).imageHosts.includes('file.bienici.com'));
  assert.ok(!sourcePolicy(seloger).imageHosts.includes('file.bienici.com'));
});

test('lien SeLoger copié : fragment de suivi connu retiré, validations conservées', () => {
  const tracked = `${seloger}?serp_view=list#ln=classified_search_results&m=classified_detail`;
  assert.equal(ImportInput.parse({url: `  ${tracked}  `}).url, `${seloger}?serp_view=list`);
  for (const value of [`${generic}#ln=foo`, `${seloger}#autre`, tracked.replace('https:', 'http:'),
    tracked.replace('www.', 'user:pass@www.'), tracked.replace('.com/', '.com:444/'),
    'https://www.seloger.com/recherche#ln=foo']) assert.equal(ImportUrl.safeParse(value).success, false, value);
});

test('Orpi : fiche avec ou sans slash final, même référence et contrôles des photos conservés', async () => {
  const url = 'https://www.orpi.com/annonce-vente-appartement-test-12345678-1234-1234-1234-123456789012/';
  const withoutSlash = url.slice(0, -1), html = await fixture('orpi');
  assert.deepEqual(selectAdapter(withoutSlash), selectAdapter(url));
  assert.doesNotThrow(() => assertListingDestination(withoutSlash, url));
  assert.doesNotThrow(() => assertListingDestination(url, withoutSlash));
  assert.deepEqual(extractListingHtml(html, withoutSlash), extractListingHtml(html, url));
  const changed = url.replace('12345678-', '87654321-');
  assert.throws(() => assertListingDestination(withoutSlash, changed), fails('SOURCE_UNAVAILABLE', 'listing_redirect'));
  assert.throws(() => extractListingHtml(html.replace(url, changed), changed), fails('CONFLICTING_FACTS'));
  for (const invalid of [url + 'autre', withoutSlash + '/autre', 'https://www.orpi.com/annonces-immobilieres/',
    'https://www.orpi.com/annonce-vente-appartement-test-not-a-uuid/'])
    assert.throws(() => selectAdapter(invalid), fails('NOT_A_LISTING'));
});

test('Orpi : surface absente du titre, faits et galerie conservés en vente et location', async () => {
  for (const [name,transaction,area] of [['orpi','vente','65,5'],['orpi-rent','location','37,23']] as const) {
    const url=`https://www.orpi.com/annonce-${transaction}-appartement-test-12345678-1234-1234-1234-123456789012/`;
    const html=await fixture(name),original=extractListingHtml(html,url);
    const changed=html.replace(`${area} m2 `,'');
    assert.notEqual(changed,html);
    const result=extractListingHtml(changed,url);
    assert.equal(result.facts.area.status,'missing');assert.equal(result.facts.area.value,null);
    for(const key of ['propertyType','locality','rooms','price'] as const)assert.deepEqual(result.facts[key],original.facts[key]);
    assert.deepEqual(result.photoUrls,original.photoUrls);assert.deepEqual(result.description,original.description);
    assert.equal(result.transaction,original.transaction);assert.ok(result.warnings.some(w=>w.startsWith('Surface non indiquée')));
    for(const invalid of [`${area} m2`, '-65 m2 Ville de recette','inconnue m2 Ville de recette'])
      assert.throws(()=>extractListingHtml(html.replace(`${area} m2 Ville de recette`,invalid),url),fails('INCOMPLETE_LISTING'));
    assert.throws(()=>extractListingHtml(changed.replace('12345678-1234-1234-1234-123456789012--a','99999999-1234-1234-1234-123456789012--a'),url),fails('CONFLICTING_FACTS'));
  }
});

test('Orpi location : loyer mensuel et charges de l’en-tête, jamais dépôt, honoraires ou bien voisin', async () => {
  const url = 'https://www.orpi.com/annonce-location-appartement-test-12345678-1234-1234-1234-123456789012/';
  const html = await fixture('orpi-rent'), result = extractListingHtml(html, url);
  assert.equal(result.transaction, 'rent');
  assert.deepEqual(result.facts.price.value, {amountCents: 117800, currency: 'EUR', period: 'month', charges: 'included'});
  assert.equal(result.facts.area.value, 37.23); assert.equal(result.facts.rooms?.value, 2);
  assert.equal(result.photoUrls.length, 3);
  assert.deepEqual(extractListingHtml(html, url.slice(0, -1)), result);
  const excluded = extractListingHtml(html.replace('<p>Charges comprises</p>', '<p>Hors charges</p>'), url);
  assert.equal(excluded.facts.price.value?.charges, 'excluded');
  for (const changed of [html.replace('<p>Charges comprises</p>', ''), html.replace('par mois', 'par semaine'),
    html.replace('1 178 €', 'À consulter')]) {
    const value = extractListingHtml(changed, url);
    assert.equal(value.facts.price.status, 'missing'); assert.ok(value.warnings.length);
  }
  assert.throws(() => extractListingHtml(html.replace('<p>Charges comprises</p>', '<p>Charges comprises</p><p>Hors charges</p>'), url), fails('CONFLICTING_FACTS'));
  assert.throws(() => extractListingHtml(html.replace('à louer', 'à vendre'), url), fails('INCOMPLETE_LISTING'));
  assert.throws(() => assertListingDestination(url, url.replace('annonce-location-', 'annonce-vente-')), fails('SOURCE_UNAVAILABLE'));
});

test('recherche connue refusée avant réseau ; redirection de fiche vers recherche/autre bien refusée', async () => {
  let calls = 0, browser = 0;
  const ports = {transport: {load: async () => {calls++; throw new Error('NON_APPELE');}}, store: async () => {}, browserHtml: async () => {browser++; return '';}};
  await assert.rejects(importListing('https://www.seloger.com/recherche/achat', {agencyId: 'a', importId: 'b'}, ports), fails('NOT_A_LISTING', 'not_listing'));
  assert.equal(calls, 0); assert.equal(browser, 0);
  for (const target of ['https://www.seloger.com/recherche/achat', seloger.replace('ABC123', 'XYZ456')]) {
    await assert.rejects(importListing(seloger, {agencyId: 'a', importId: 'b'}, {...ports, transport: pageTransport('<h1>Voisins</h1>', target)}), fails('SOURCE_UNAVAILABLE', 'listing_redirect'));
  }
  assert.equal(browser, 0);
  assert.doesNotThrow(() => assertListingDestination(seloger, seloger.replace('www.seloger', 'seloger')));
  assert.throws(() => assertListingDestination(seloger, seloger.replace('www.seloger.com', 'www.seloger.com.evil.example')), fails('SOURCE_UNAVAILABLE'));
});

test('canonique : seul un alias explicitement enregistré peut changer de domaine', async () => {
  const url = 'https://century21.fr/trouver_logement/detail/123456/';
  const parsed = extractListingHtml(await fixture('century21'), url);
  assert.ok(parsed.canonicalUrl);
  const value = {...saleFixture(), sourceUrl: url, sourceHost: 'century21.fr', canonicalUrl: parsed.canonicalUrl};
  assert.equal(NormalizedListing.safeParse(value).success, true);
  assert.equal(NormalizedListing.safeParse({...value, canonicalUrl: parsed.canonicalUrl.replace('century21.fr', 'century21.fr.evil.example')}).success, false);
  const genericHtml = await fixture('sale');
  for (const url of ['https://fixtures.bienvu.example:444/vente', 'https://user:pass@fixtures.bienvu.example/vente'])
    assert.throws(() => extractListingHtml(genericHtml.replace('"url":"https://fixtures.bienvu.example/vente"', `"url":"${url}"`), generic), fails('CONFLICTING_FACTS'));
});

test('codes HTTP explicites : une requête, aucune relance ni navigateur, motif conservé', async () => {
  for (const [status, code, reason] of [[401, 'SOURCE_BLOCKED', 'login_required'], [403, 'SOURCE_BLOCKED', 'access_denied'],
    [429, 'SOURCE_BLOCKED', 'rate_limited'], [404, 'SOURCE_UNAVAILABLE', 'not_found'], [410, 'SOURCE_UNAVAILABLE', 'not_found']] as const) {
    let calls = 0, browser = 0;
    const transport = nodeImportTransport({resolve: async () => [{address: '1.1.1.1', family: 4}], request: async () => {
      calls++; return {status, headers: {'content-type': 'text/html'}, bytes: new Uint8Array()};}});
    await assert.rejects(importListing(seloger, {agencyId: 'a', importId: 'b'}, {transport, store: async () => {}, browserHtml: async () => {browser++; return '';}}), error => {
      assert.ok(error instanceof ImportFailure); assert.equal(error.code, code); assert.equal(error.reason, reason);
      assert.equal(Reflect.get(error, 'diagnostics').failureReason, reason); return true;
    });
    assert.equal(calls, 1); assert.equal(browser, 0);
  }
});

test('pages challenge, login, limitation et retrait : jamais converties en annonce recommandée', async () => {
  const cases: Array<[string, string, ImportFailureReason]> = [
    [await fixture('portals/challenge'), 'SOURCE_BLOCKED', 'challenge'],
    ['<title>Connexion — Portail</title><h1>Connectez-vous</h1>', 'SOURCE_BLOCKED', 'login_required'],
    ['<h1>Connectez-vous pour consulter cette annonce</h1>', 'SOURCE_BLOCKED', 'login_required'],
    ['<title>Too many requests</title>', 'SOURCE_BLOCKED', 'rate_limited'],
    [await fixture('portals/removed'), 'SOURCE_UNAVAILABLE', 'not_found'],
    [await fixture('portals/search'), 'NOT_A_LISTING', 'not_listing'],
  ];
  for (const [html, code, reason] of cases) {
    let browser = 0;
    await assert.rejects(importListing(generic, {agencyId: 'a', importId: 'b'}, {transport: pageTransport(html), store: async () => {}, browserHtml: async () => {browser++; return '';}}), fails(code, reason));
    assert.equal(browser, 0);
  }
  assert.doesNotThrow(() => htmlDocument('<title>Appartement à vendre</title><nav>Connexion</nav><p>Contact protégé par CAPTCHA</p><iframe src="https://www.google.com/recaptcha/api2/anchor"></iframe>'));
});

test('HTML sans données : un seul fallback navigateur ; un challenge arrête cet essai', async () => {
  let browser = 0, loads = 0;
  const challenge = await fixture('portals/challenge');
  await assert.rejects(importListing(bienici, {agencyId: 'a', importId: 'b'}, {
    transport: {load: async (...args) => {loads++; return pageTransport('<div id="app"></div>').load(...args);}},
    store: async () => {}, browserHtml: async () => {browser++; return challenge;},
  }), fails('SOURCE_BLOCKED', 'challenge'));
  assert.equal(loads, 1); assert.equal(browser, 1);
});

test('Bien’ici DOM observé : faits recoupés, description, galerie liée au bien, aucune résolution inventée', async () => {
  const result = extractListingHtml(await fixture('portals/bienici-sale'), bienici);
  assert.equal(result.adapterVersion, 'bienici-dom/4.0'); assert.equal(result.facts.locality.value, 'Recette');
  assert.equal(result.facts.area.value, 65); assert.equal(result.facts.rooms?.value, 3);
  assert.equal(result.facts.price.value?.amountCents, 28000000);
  assert.equal(result.description?.text, 'Description synthétique du bien de recette.\n\nTrois pièces, une cuisine et un balcon.');
  assert.deepEqual(result.photoUrls, ['https://file.bienici.com/photo/fixture-123_a.jpg',
    ...['b', 'c'].map(n => `https://file.bienici.com/photo/fixture-123_${n}.jpg?width=600&height=370&fit=cover`)]);
});

test('Bien’ici : contradiction de centime, identité ou galerie étrangère refusée ; doublons non comptés', async () => {
  const html = await fixture('portals/bienici-sale');
  for (const altered of [html.replace('"price":280000', '"price":280000.01'), html.replace('"value":65', '"value":75'),
    html.replace('"numberOfRooms":3', '"numberOfRooms":4'), html.replace('"addressLocality":"Recette"', '"addressLocality":"Autre"'),
    html.replace('fixture-123_b.jpg', 'other-999_b.jpg'), html.replace('"name":"Achat', '"name":"Autre'),
    html.replace('"image":"https://file.bienici.com/photo/fixture-123_a.jpg"', '"image":"https://file.bienici.com/photo/other-999_a.jpg"')])
    assert.throws(() => extractListingHtml(altered, bienici), fails('CONFLICTING_FACTS'));
  assert.throws(() => extractListingHtml(html.replaceAll('fixture-123_c.jpg', 'fixture-123_b.jpg'), bienici), fails('INSUFFICIENT_PHOTOS'));
});

test('Bien’ici location : période et charges explicites, prix omis si non vérifiables', async () => {
  const url = bienici.replace('/vente/', '/location/');
  const rent = (await fixture('portals/bienici-sale')).replaceAll('/vente/', '/location/').replaceAll('Achat', 'Location')
    .replaceAll('280 000', '950').replace('"price":280000', '"price":950')
    .replace('<div class="slideshow">', '<span class="ad-price__per-month">par mois charges comprises</span><div class="slideshow">');
  assert.deepEqual(extractListingHtml(rent, url).facts.price.value, {amountCents: 95000, currency: 'EUR', period: 'month', charges: 'included'});
  assert.equal(extractListingHtml(rent.replace('par mois charges comprises', 'par mois'), url).facts.price.status, 'missing');
  assert.equal(extractListingHtml(rent.replace('par mois charges comprises', 'par mois hors charges'), url).facts.price.value?.charges, 'excluded');
});

test('Bien’ici import complet simulé : images normalisées requises, vignettes 600 px toujours refusées', async () => {
  const html = await fixture('portals/bienici-sale'), stored: string[] = [];
  const base = fixtureImportTransport();
  function transport(small: boolean): ImportTransport {return {load: async (url, kind, _hosts, signal) => {
    if (kind === 'page') return pageTransport(html).load(url, kind, _hosts, signal);
    const name = new URL(url).pathname.match(/_([abc])\.jpg$/)?.[1];
    const image = await base.load(`https://fixtures.bienvu.example/photos/${name}.jpg`, kind, ['fixtures.bienvu.example'], signal);
    return {...image, url, width: small ? 600 : image.width};
  }};}
  const result = await importListing(bienici, {agencyId: 'a', importId: 'b'}, {transport: transport(false), store: async photo => {stored.push(photo.objectKey);}});
  assert.equal(result.listing.photos.length, 3); assert.equal(stored.length, 3); assert.equal(result.listing.sourceKind, 'url');
  await assert.rejects(importListing(bienici, {agencyId: 'a', importId: 'c'}, {transport: transport(true), store: async () => {throw new Error('VIGNETTE_STOCKEE');}}), fails('INSUFFICIENT_PHOTOS'));
});

test('motif du service privé : liste fermée, conservé sans exposer le corps du fournisseur', async () => {
  for (const reason of ['rate_limited', 'challenge', 'not_found', 'données sensibles non autorisées']) {
    const env = {DB: {} as Database, PROBE_MODE: 'remote', IMPORT_MODE: 'cloudflare', BETTER_AUTH_URL: 'https://bienvu.online', IMPORT_TOKEN: 'x'.repeat(32),
      IMPORT_SERVICE: {fetch: async () => new Response('CORPS_PRIVE', {status: 502, headers: {'X-Import-Error': 'SOURCE_BLOCKED', 'X-Import-Reason': reason}})} as unknown as Fetcher};
    const ports = importPorts(new Request('https://bienvu.online/api/imports'), env, 'agency');
    await assert.rejects(ports.transport.load(seloger, 'page', ['www.seloger.com'], AbortSignal.timeout(1000)), e => {
      // Le package web est chargé en CJS par tsx, les tests en ESM : vérifier
      // le contrat de l'erreur au passage de cette frontière de modules.
      assert.ok(e instanceof Error); assert.equal(Reflect.get(e, 'code'), 'SOURCE_BLOCKED');
      assert.equal(Reflect.get(e, 'reason'), importFailureReason(reason)); assert.ok(!e.message.includes('CORPS_PRIVE')); return true;
    });
  }
  assert.equal(importFailureReason('arbitrary'), undefined);
});

test('couverture datée : quatre portails présents, les fixtures ne leur attribuent aucun succès réel', () => {
  for (const id of ['figaro', 'seloger', 'leboncoin', 'bienici'] as const) {
    assert.ok(importSources.some(s => s.id === id)); const coverage = sourceCoverage[id];
    assert.ok(coverage.listingAttempts > 0); assert.match(coverage.checkedAt, /^\d{4}-\d{2}-\d{2}$/);
    assert.equal(coverage.successfulImports, 0); assert.equal(coverage.status, 'temporarily_unavailable');
  }
});
