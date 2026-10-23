import { test } from 'node:test';
import assert from 'node:assert/strict';
import sharp from 'sharp';
import { ImportFailure, ImportInput, GeneratableListing } from '../packages/contracts/src/index';
import {
  extractListingHtml,
  importListing,
  selectAdapter,
  sourcePolicy,
  assertListingDestination,
} from '../packages/importers/src/index';

const id = '12345678',
  url = 'https://www.laforet.com/agence-immobiliere/recette/acheter/ville-de-recette/maison-7-pieces-' + id;
const path = (letter: string, reference = id) =>
  '/office9/laforet_100000/catalog/images/pr_p/' + reference.split('').join('/') + '/' + reference + letter + '.jpg';
const image = (letter: string, reference = id) =>
  'https://laforetbusiness.laforet-intranet.com' + path(letter, reference);
const cropped = (letter: string) => '/glide' + path(letter) + '?w=700&h=600&fit=crop&fm=webp&s=fixture';
const letters = 'abcdefghijklmn'.split('');
const gallery =
  '<section data-controller="gallery"><div>' +
  letters.map((letter) => '<img src="' + cropped(letter) + '">').join('') +
  '<img src="/assets/images/services/logo-laforet-fixture.jpg"></div><div>' +
  letters.map((letter) => '<img src="' + image(letter) + '">').join('') +
  '</div></section>';
const metaTitle = 'Achat maison VILLE DE RECETTE - 7 pièce(s) - 220 m² - 975 000 €';
const html =
  '<html><head><title>' +
  metaTitle +
  '</title><meta property="og:url" content="' +
  new URL(url).pathname +
  '">' +
  '<meta property="og:title" content="' +
  metaTitle +
  '">' +
  letters.map((letter, i) => '<meta property="og:image_' + i + '" content="' + image(letter) + '">').join('') +
  '<script type="application/ld+json">[{"@type":"BreadcrumbList","itemListElement":[{"name":"Acheter","item":"/acheter"},{"name":"Ville de recette"},{"name":"' +
  metaTitle +
  '"}]}]</script></head><body>' +
  '<header><div><h1>Maison T7 VILLE DE RECETTE à vendre</h1><a href="#section-location">VILLE DE RECETTE (33000)</a></div>' +
  gallery +
  '</header>' +
  '<main id="content"><div><section><p class="text-primary text-2xl font-bold">975 000 €</p><p>A partir de 5 000 € / mois</p><p>220 m² • 7 pièces • 5 chambres</p>' +
  '<button data-url="' +
  url +
  '">Partager</button></section><section id="section-features"><h2>Caractéristiques</h2><span>7 pièces</span><span>Surface : 220 m²</span>' +
  '<span>Surf. terrain : 3700 m²</span><span>5 chbres</span></section><section id="section-description"><h2>Description</h2><div class="prose">' +
  '<p>Un séjour lumineux avec jardin.<br>Une cuisine ouverte.</p><p>Cinq chambres à l’étage.</p><script>throw new Error("never execute");</script></div></section>' +
  '<section id="section-calculator"><p class="text-primary font-bold">500 €</p></section><section id="section-nearest"><h3>Autre maison 1 100 000 €</h3>' +
  '<p>Surface : 450 m² • 12 pièces • 10 chambres</p><img src="https://untrusted.example/other.jpg"></section></div></main></body></html>';
const fails = (code: string) => (error: unknown) => error instanceof ImportFailure && error.code === code;

test('Laforêt : DOM SSR, prix du bien, surface habitable et pièces distinctes du terrain et des chambres', () => {
  const result = extractListingHtml(html, url);
  assert.equal(selectAdapter(url).id, 'laforet');
  assert.ok(ImportInput.safeParse({ url }).success);
  assert.equal(result.sourceListingId, id);
  assert.equal(result.adapterVersion, 'laforet-dom/1.1');
  assert.equal(result.transaction, 'sale');
  assert.equal(result.facts.propertyType.value, 'house');
  assert.equal(result.facts.price.value?.amountCents, 97500000);
  assert.equal(result.facts.area.value, 220);
  assert.equal(result.facts.rooms?.value, 7);
  assert.equal(result.facts.locality.value, 'VILLE DE RECETTE');
  assert.deepEqual(
    result.photoUrls,
    letters.map((letter) => image(letter)),
  );
  assert.equal(
    result.description?.text,
    'Un séjour lumineux avec jardin.\nUne cuisine ouverte.\n\nCinq chambres à l’étage.',
  );
  assert.ok(!result.description?.text.includes('never execute'));
});

test('Laforêt : les copies et miniatures sont dédupliquées, les originaux sont préférés dans l’ordre de la galerie', () => {
  const duplicated = html.replace(gallery, gallery.replace('<div>', '<div><img src="' + cropped('a') + '">'));
  assert.deepEqual(
    extractListingHtml(duplicated, url).photoUrls,
    letters.map((letter) => image(letter)),
  );
  const withoutOriginals = html
    .replace(letters.map((letter) => '<img src="' + image(letter) + '">').join(''), '')
    .replace(/<meta property="og:image_\d+"[^>]*>/g, '');
  assert.deepEqual(
    extractListingHtml(withoutOriginals, url).photoUrls,
    letters.map((letter) => 'https://www.laforet.com' + cropped(letter)),
  );
});

test('Laforêt : les dossiers d’agence nommés conservent les contrôles de référence et la déduplication', () => {
  const named = html.replaceAll('/laforet_100000/', '/laforet_seynod/');
  assert.deepEqual(
    extractListingHtml(named, url).photoUrls,
    letters.map((letter) => image(letter).replace('/laforet_100000/', '/laforet_seynod/')),
  );
  const first = image('a').replace('/laforet_100000/', '/laforet_seynod/');
  const foreign = image('a', '87654321').replace('/laforet_100000/', '/laforet_seynod/');
  for (const allowPartial of [false, true])
    assert.throws(
      () => extractListingHtml(named.replace(first, foreign), url, { allowPartial }),
      fails('CONFLICTING_FACTS'),
    );
});

test('Laforêt : les résumés arrondis restent cohérents avec la surface habitable précise', () => {
  for (const [precise, displayed, expected] of [
    ['291.27', '291', 291.27],
    ['291,27', '291', 291.27],
    ['220.75', '221', 220.75],
    ['220.27', '220.3', 220.27],
    ['220.50', '221', 220.5],
  ] as const) {
    const rounded = html
      .replaceAll('220 m²', displayed + ' m²')
      .replace('Surface : ' + displayed + ' m²', 'Surface : ' + precise + ' m²');
    for (const allowPartial of [false, true]) {
      const result = extractListingHtml(rounded, url, { allowPartial });
      assert.equal(result.facts.area.value, expected);
      assert.equal(result.facts.price.value?.amountCents, 97500000);
      assert.equal(result.facts.rooms?.value, 7);
    }
  }
});

test('Laforêt : les arrondis ne masquent ni un entier incorrect ni des décimales contradictoires', () => {
  for (const altered of [
    html.replace('Surface : 220 m²', 'Surface : 221.27 m²'),
    html.replace('Surface : 220 m²', 'Surface : 220.75 m²'),
    html.replaceAll('220 m²', '220.27 m²').replace('Surface : 220.27 m²', 'Surface : 220.28 m²'),
    html
      .replace('Surface : 220 m²', 'Surface : 220.27 m²')
      .replace('7 pièce(s) - 220 m² - 975 000 €">', '7 pièce(s) - 220.28 m² - 975 000 €">'),
    html.replace('<span>Surface : 220 m²</span>', '<span>Surface : 220.27 m²</span><span>Surface : 220.28 m²</span>'),
    html.replace(
      '</head>',
      '<meta property="og:title" content="Achat maison VILLE DE RECETTE - 7 pièce(s) - 220.27 m² - 975 000 €"><meta property="og:title" content="Achat maison VILLE DE RECETTE - 7 pièce(s) - 220.28 m² - 975 000 €"></head>',
    ),
  ])
    for (const allowPartial of [false, true])
      assert.throws(() => extractListingHtml(altered, url, { allowPartial }), fails('CONFLICTING_FACTS'));
});

test('Laforêt : contradictions de prix, surface, pièces, type et localisation bloquées même en mode partiel', () => {
  for (const altered of [
    html.replace('Surface : 220', 'Surface : 221'),
    html.replace('<span>7 pièces', '<span>5 pièces'),
    html.replace('Maison T7', 'Maison T8'),
    html.replace('Maison T7', 'Appartement T7'),
    html.replace('RECETTE (33000)', 'VOISINE (33000)'),
    html.replace('font-bold">975 000', 'font-bold">900 000'),
    html.replace('7 pièce(s) - 220 m² - 975 000 €">', '7 pièce(s) - 220 m² - 900 000 €">'),
  ]) {
    for (const allowPartial of [false, true])
      assert.throws(() => extractListingHtml(altered, url, { allowPartial }), fails('CONFLICTING_FACTS'));
  }
});

test('Laforêt : identité, canonique et redirections ne changent jamais de bien ou de transaction', () => {
  for (const altered of [
    html.replace(
      'property="og:url" content="' + new URL(url).pathname,
      'property="og:url" content="' + new URL(url.replace(id, '87654321')).pathname,
    ),
    html.replace('data-url="' + url, 'data-url="' + url.replace(id, '87654321')),
    html.replace('</head>', '<link rel="canonical" href="' + url.replace(id, '87654321') + '"></head>'),
  ])
    assert.throws(() => extractListingHtml(altered, url), fails('CONFLICTING_FACTS'));
  assert.doesNotThrow(() => assertListingDestination(url, url.replace('www.laforet.com', 'laforet.com')));
  assert.throws(() => assertListingDestination(url, url.replace('/acheter/', '/louer/')), fails('SOURCE_UNAVAILABLE'));
  assert.throws(() => assertListingDestination(url, url.replace(id, '87654321')), fails('SOURCE_UNAVAILABLE'));
  for (const path of [
    '/agence-immobiliere/recette',
    '/acheter/maison',
    '/agence-immobiliere/recette/acheter/ville-de-recette/maison-7-pieces',
    '/agence-immobiliere/recette/acheter/ville-de-recette/parking-7-pieces-' + id,
  ])
    assert.throws(() => selectAdapter('https://www.laforet.com' + path), fails('NOT_A_LISTING'));
});

test('Laforêt : domaine photo limité à cette source et références étrangères refusées avant tout téléchargement', async () => {
  assert.deepEqual(sourcePolicy(url).imageHosts, [
    'www.laforet.com',
    'laforet.com',
    'laforetbusiness.laforet-intranet.com',
  ]);
  assert.ok(!sourcePolicy('https://other.example/annonce').imageHosts.includes('laforetbusiness.laforet-intranet.com'));
  for (const [replacement, code] of [
    [image('a', '87654321'), 'CONFLICTING_FACTS'],
    [image('a').replace('/1/2/3/4/5/6/7/8/', '/8/7/6/5/4/3/2/1/'), 'CONFLICTING_FACTS'],
    ['https://laforetbusiness.laforet-intranet.com.attacker.example/photo.jpg', 'UNSAFE_URL'],
    ['https://127.0.0.1/photo.jpg', 'UNSAFE_URL'],
  ] as const) {
    const altered = html.replace(image('a'), replacement);
    let requests = 0;
    await assert.rejects(
      importListing(
        url,
        { agencyId: 'laforet-fixture', importId: 'laforet-listing' },
        {
          transport: {
            async load(value) {
              requests++;
              return {
                url: value,
                bytes: new TextEncoder().encode(altered),
                mime: 'text/html',
                sourceBytes: altered.length,
              };
            },
          },
          store: async () => {
            throw new Error('No media storage expected');
          },
        },
      ),
      fails(code),
    );
    assert.equal(requests, 1);
  }
});

test('Laforêt : galerie absente reste un brouillon sans reprendre les images des recommandations ou des métadonnées', () => {
  const altered = html.replace(gallery, '');
  assert.throws(() => extractListingHtml(altered, url), fails('INSUFFICIENT_PHOTOS'));
  const partial = extractListingHtml(altered, url, { allowPartial: true });
  assert.equal(partial.photoUrls.length, 0);
  assert.equal(partial.facts.price.value?.amountCents, 97500000);
  assert.throws(() => extractListingHtml(html.replace(gallery, gallery + gallery), url), fails('CONFLICTING_FACTS'));
  assert.throws(
    () => extractListingHtml(html.replace('<main id="content">', '<main id="elsewhere">'), url),
    fails('NOT_A_LISTING'),
  );
});

test('Laforêt : appartements et loyers mensuels seulement quand les charges sont explicites', () => {
  const rentUrl = url.replace('/acheter/', '/louer/').replace('maison-7', 'appartement-7');
  const rent = html
    .replaceAll('maison-7', 'appartement-7')
    .replaceAll('/acheter/', '/louer/')
    .replaceAll('Achat maison', 'Location appartement')
    .replace('Maison T7', 'Appartement T7')
    .replace('à vendre', 'à louer')
    .replace('font-bold">975 000 €', 'font-bold">975 000 € / mois CC');
  const result = extractListingHtml(rent, rentUrl);
  assert.equal(result.transaction, 'rent');
  assert.equal(result.facts.propertyType.value, 'apartment');
  assert.equal(result.facts.price.value?.period, 'month');
  assert.equal(result.facts.price.value?.charges, 'included');
  for (const label of ['975 000 € / mois', '975 000 € CC', '975 000 €'])
    assert.equal(extractListingHtml(rent.replace('975 000 € / mois CC', label), rentUrl).facts.price.status, 'missing');
});

test('Laforêt : galerie complète des JPEG, aucune exécution de script ou seconde lecture navigateur', async () => {
  const calls: string[] = [],
    stored: string[] = [];
  let browsers = 0;
  const result = await importListing(
    url,
    { agencyId: 'laforet-fixture', importId: 'laforet-listing' },
    {
      transport: {
        async load(value, kind, hosts) {
          assert.ok(hosts.includes(new URL(value).hostname));
          calls.push(value);
          if (kind === 'page')
            return { url: value, bytes: new TextEncoder().encode(html), mime: 'text/html', sourceBytes: html.length };
          const bytes = new Uint8Array(
            await sharp({
              create: { width: 960, height: 640, channels: 3, background: { r: calls.length * 13, g: 60, b: 90 } },
            })
              .jpeg()
              .toBuffer(),
          );
          return { url: value, bytes, mime: 'image/jpeg', sourceBytes: bytes.length, width: 960, height: 640 };
        },
      },
      store: async (photo, bytes) => {
        assert.equal((await sharp(bytes).metadata()).format, 'jpeg');
        stored.push(photo.sourceUrl!);
      },
      browserHtml: async () => {
        browsers++;
        throw new Error('Browser must not be used');
      },
    },
  );
  assert.ok(GeneratableListing.safeParse(result.listing).success);
  assert.equal(browsers, 0);
  assert.equal(result.diagnostics.browserUsed, false);
  assert.equal(result.listing.photos.length, letters.length);
  assert.equal(calls.length, letters.length + 1);
  assert.deepEqual(
    stored,
    letters.map((letter) => image(letter)),
  );
  assert.equal(new Set(result.listing.photos.map((photo) => photo.contentHash)).size, letters.length);
});
