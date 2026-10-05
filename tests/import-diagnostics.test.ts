import {test} from 'node:test';
import assert from 'node:assert/strict';
import {ImportFailure, importResourceDiagnostic, importResourceHeader, parseImportResourceHeader} from '../packages/contracts/src/index';
import {scopedUrl, importListing} from '../packages/importers/src/index';
import {fixtureImportTransport} from '../scripts/import-fixtures';

test('diagnostic privé : domaine, chemin et étape, sans credentials ni paramètres de requête', () => {
  const resource = importResourceDiagnostic('https://user:SECRET@images.example/photo.jpg?token=SECRET#SECRET', 'photo', 'host_not_allowed', 'image');
  assert.deepEqual(resource, {stage: 'photo', reason: 'host_not_allowed', resourceType: 'image', host: 'images.example', path: '/photo.jpg'});
  assert.deepEqual(parseImportResourceHeader(importResourceHeader(resource)), resource);
  assert.doesNotMatch(JSON.stringify(resource), /SECRET|token|user/);
  for (const value of [null, '%invalid', 'x'.repeat(2001), encodeURIComponent(JSON.stringify({...resource, authorization: 'SECRET'})),
    encodeURIComponent(JSON.stringify({...resource, path: '/photo?token=SECRET'}))]) assert.equal(parseImportResourceHeader(value), undefined);
});
test('URL hors périmètre : le refus conserve la ressource précise et sa catégorie', () => {
  assert.throws(() => scopedUrl('https://outside.example/photo.jpg?token=SECRET', ['fixtures.bienvu.example'], {stage: 'photo', resourceType: 'image'}),
    (error: unknown) => error instanceof ImportFailure && error.code === 'UNSAFE_URL' && error.resource?.host === 'outside.example'
      && error.resource.path === '/photo.jpg' && error.resource.stage === 'photo' && error.resource.reason === 'host_not_allowed');
});
test('refus navigateur : diagnostic transmis intact avec l’échec, sans être remplacé par la page initiale', async () => {
  const resource = importResourceDiagnostic('https://outside.example/photo.jpg', 'browser', 'host_not_allowed', 'image');
  await assert.rejects(importListing('https://fixtures.bienvu.example/vente', {agencyId: 'diagnostic-test', importId: 'diagnostic-fixture'}, {
    transport: {load: async value => ({url: value, bytes: new TextEncoder().encode('<div id="app"></div>'), mime: 'text/html', sourceBytes: 20})},
    store: async () => {}, browserHtml: async () => {throw new ImportFailure('UNSAFE_URL','Refus',undefined,resource);},
  }), (error: unknown) => error instanceof ImportFailure && 'diagnostics' in error
    && JSON.stringify(error.diagnostics).includes('outside.example') && JSON.stringify(error.diagnostics).includes('"stage":"browser"'));
});
test('galerie privée : refus avant tout chargement d’image, diagnostic photo conservé', async () => {
  const base = fixtureImportTransport(); let images = 0;
  await assert.rejects(importListing('https://fixtures.bienvu.example/vente', {agencyId: 'diagnostic-test', importId: 'private-fixture'}, {
    transport: {async load(...args) {
      if (args[1] === 'image') images++;
      const resource = await base.load(...args);
      if (args[1] === 'page') resource.bytes = new TextEncoder().encode(new TextDecoder().decode(resource.bytes).replace('/photos/a.jpg', 'https://127.0.0.1/private.jpg?SECRET=secret'));
      return resource;
    }}, store: async () => {},
  }), (error: unknown) => error instanceof ImportFailure && error.code === 'UNSAFE_URL' && 'diagnostics' in error
    && JSON.stringify(error.diagnostics).includes('127.0.0.1') && !JSON.stringify(error.diagnostics).includes('SECRET'));
  assert.equal(images, 0);
});
