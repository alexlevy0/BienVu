import {test} from 'node:test';
import assert from 'node:assert/strict';
import sharp from 'sharp';
import {ImportFailure} from '../packages/contracts/src/index';
import {IMPORT_LIMITS, publicUrl, publicAddresses, scopedUrl, type ImportTransport} from '../packages/importers/src/network';
import {importListing} from '../packages/importers/src/import-listing';
import {nodeImportTransport, normalizePhoto, type NetworkPorts} from '../scripts/import-transport';
import {fixtureImportTransport} from '../scripts/import-fixtures';

const url = 'https://fixtures.bienvu.example/vente';
test('SSRF : URL locales, IP normalisées, ports, credentials et hôtes trompeurs', () => {
  for (const value of ['http://example.com', 'https://127.1', 'https://2130706433', 'https://0x7f000001', 'https://[::ffff:127.0.0.1]',
    'https://example.com:444', 'https://user:pass@example.com', 'https://localhost', 'https://host.local', 'https://example.com./', 'https://host.internal'])
    assert.throws(() => publicUrl(value), ImportFailure);
  assert.throws(() => scopedUrl('https://fixtures.bienvu.example.evil.com/', ['fixtures.bienvu.example']), ImportFailure);
  for (const address of ['10.0.0.1', '169.254.169.254', '100.64.0.1', '::1', 'fc00::1', '2001:db8::1'])
    assert.throws(() => publicAddresses([{address: '1.1.1.1', family: 4}, {address, family: address.includes(':') ? 6 : 4}]), ImportFailure);
});
test('DNS et redirections : zéro requête vers la cible privée, adresse publique réellement transmise au transport', async () => {
  let requests = 0, resolves = 0;
  const ports: NetworkPorts = {resolve: async () => {resolves++; return [{address: resolves === 1 ? '1.1.1.1' : '127.0.0.1', family: 4}];},
    request: async (_url, address) => {requests++; assert.equal(address.address, '1.1.1.1'); return {status: 302, headers: {location: '/changed-dns'}, bytes: new Uint8Array()};}};
  await assert.rejects(nodeImportTransport(ports).load(url, 'page', ['fixtures.bienvu.example'], new AbortController().signal), e => e instanceof ImportFailure && e.code === 'UNSAFE_URL');
  assert.equal(requests, 1); assert.equal(resolves, 2);
  for (const location of ['https://127.0.0.1/a', 'http://fixtures.bienvu.example/a', 'https://unknown.example/a']) {
    requests = 0;
    await assert.rejects(nodeImportTransport({resolve: async () => [{address: '1.1.1.1', family: 4}], request: async () => {
      requests++; return {status: 302, headers: {location}, bytes: new Uint8Array()};}}).load(url, 'page', ['fixtures.bienvu.example'], new AbortController().signal));
    assert.equal(requests, 1);
  }
});
test('vraies images synthétiques : décodage, orientation, métadonnées et bombes', async () => {
  const input = sharp({create: {width: 960, height: 640, channels: 3, background: '#214f43'}});
  for (const format of ['jpeg', 'png', 'webp'] as const) {
    const bytes = await input.clone().toFormat(format).withMetadata().toBuffer();
    const result = await normalizePhoto(bytes, `image/${format}`), meta = await sharp(result.bytes).metadata();
    assert.equal(meta.format, 'jpeg'); assert.equal(meta.exif, undefined); assert.equal(result.width, 960);
  }
  await assert.rejects(normalizePhoto(Buffer.from('<svg onload="bad()"/>'), 'image/png'));
  await assert.rejects(normalizePhoto(await input.clone().jpeg().toBuffer(), 'image/png'));
  await assert.rejects(normalizePhoto((await input.clone().jpeg().toBuffer()).subarray(0, 200), 'image/jpeg'));
  await assert.rejects(normalizePhoto(await sharp({create: {width: 32, height: 32, channels: 3, background: 'red'}}).png().toBuffer(), 'image/png'));
  await assert.rejects(normalizePhoto(await sharp({create: {width: 5000, height: 5000, channels: 3, background: 'red'}}).png().toBuffer(), 'image/png'));
});
test('galerie : doublons par contenu, ordre et rejet préalable de toutes les URL privées', async () => {
  const photos: string[] = [];
  const result = await importListing(url.replace('/vente', '/doublons'), {agencyId: 'agency-fixture', importId: 'import-fixture'},
    {transport: fixtureImportTransport(), store: async p => {photos.push(p.objectKey);}});
  assert.equal(result.listing.photos.length, 3); assert.equal(result.diagnostics.duplicatePhotos, 1); assert.equal(photos.length, 3);
  assert.deepEqual(result.listing.photos.map(p => p.sourceOrder), [0, 1, 2]);
  const base = fixtureImportTransport(); let imageCalls = 0;
  const unsafe: ImportTransport = {load: async (...args) => {const resource = await base.load(...args);
    if (args[1] === 'page') resource.bytes = new TextEncoder().encode(new TextDecoder().decode(resource.bytes).replace('/photos/c.jpg', 'https://127.0.0.1/private'));
    else imageCalls++; return resource;}};
  await assert.rejects(importListing(url, {agencyId: 'a', importId: 'b'}, {transport: unsafe, store: async () => {}}), e => e instanceof ImportFailure && e.code === 'UNSAFE_URL');
  assert.equal(imageCalls, 0);
});
test('une galerie de huit photos est importée entièrement avec les limites produit habituelles',async()=>{
  const base=fixtureImportTransport(),stored:string[]=[];
  const transport:ImportTransport={async load(value,kind,hosts,signal,maxBytes){
    if(kind==='page') {
      const resource=await base.load(value,kind,hosts,signal,maxBytes);
      const html=new TextDecoder().decode(resource.bytes).replace('"/photos/c.jpg"',
        Array.from({length:6},(_,n)=>`"/photos/extra-${n}.jpg"`).join(','));
      resource.bytes=new TextEncoder().encode(html);resource.sourceBytes=resource.bytes.length;return resource;
    }
    const match=/extra-(\d)\.jpg$/.exec(value);
    if(!match)return base.load(value,kind,hosts,signal,maxBytes);
    const bytes=await sharp({create:{width:960,height:640,channels:3,background:{r:20+Number(match[1])*35,g:70,b:120}}}).jpeg().toBuffer();
    return {url:value,sourceBytes:bytes.length,...await normalizePhoto(bytes,'image/jpeg')};
  }};
  const {listing}=await importListing(url,{agencyId:'agency-fixture',importId:'eight-photo-fixture'},
    {transport,store:async p=>{stored.push(p.id);}});
  assert.equal(listing.photos.length,8);assert.deepEqual(listing.photos.map(p=>p.id),stored);
  assert.deepEqual(listing.photos.map(p=>p.sourceOrder),[0,1,2,3,4,5,6,7]);
});
test('deadline globale : arrêt même si un transport injecté ne répond plus', async () => {
  const abort = new AbortController(); const timer = setTimeout(() => abort.abort(), 20);
  try {await assert.rejects(importListing(url, {agencyId: 'a', importId: 'b'}, {transport: {load: () => new Promise(() => {})}, store: async () => {}}, {signal: abort.signal}),
    e => e instanceof ImportFailure && e.code === 'IMPORT_TIMEOUT');} finally {clearTimeout(timer);}
});
test('plafond total : les flux échoués sont comptés, le dernier téléchargement reçoit seulement le budget restant', async () => {
  const base = fixtureImportTransport(); let reserved = 0, pageBytes = 0, imageCalls = 0;
  const transport: ImportTransport = {async load(value, kind, hosts, signal, maxBytes) {
    if (kind === 'page') {
      const resource = await base.load(value, kind, hosts, signal);
      const html = new TextDecoder().decode(resource.bytes).replace('"/photos/c.jpg"', Array.from({length: 12}, (_, n) => `"/photos/photo-${n}.jpg"`).join(','));
      resource.bytes = new TextEncoder().encode(html); resource.sourceBytes = resource.bytes.length;
      pageBytes = resource.sourceBytes; return resource;
    }
    imageCalls++; assert.ok(maxBytes && maxBytes <= IMPORT_LIMITS.imageBytes); reserved += maxBytes;
    throw new ImportFailure('SOURCE_UNAVAILABLE', 'Flux fixture interrompu.');
  }};
  await assert.rejects(importListing(url, {agencyId: 'a', importId: 'b'}, {transport, store: async () => {}}),
    e => e instanceof ImportFailure && e.code === 'INSUFFICIENT_PHOTOS');
  assert.equal(imageCalls, 5); assert.equal(reserved + pageBytes, IMPORT_LIMITS.totalBytes);
});
