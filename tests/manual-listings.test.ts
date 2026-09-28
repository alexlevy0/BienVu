import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile, readdir} from 'node:fs/promises';
import sharp from 'sharp';
import {Miniflare, convertV4MiniflareOptions} from 'miniflare';
import {GeneratableListing, ManualListingInput, MANUAL_PHOTO_LIMITS} from '../packages/contracts/src/index';
import {contentHash, createManualListing, finishManualListing, uploadManualPhoto, manualDraft, parseManualInput} from '../apps/web/lib/manual-listings';
import {importResult, privateImportPhoto, purgeImport} from '../apps/web/lib/imports';
import {localPhotoNormalizer} from '../apps/web/lib/import-transport';
import {RequestFailure} from '../apps/web/lib/http';
import {findImport, importObjectKeys} from '../packages/db/src/imports';
import {normalizePhoto} from '../scripts/import-transport';

const signal = () => AbortSignal.timeout(20_000);
const errorCode = (code: string) => (error: unknown) => error instanceof RequestFailure && error.code === code;
const seed = {title: 'Maison de recette', propertyType: 'house' as const, transaction: 'sale' as const, locality: 'Ville de recette',
  description: 'Séjour et cuisine.\n\nJardin au calme. <script>texte seulement</script>', priceCents: 28500000, charges: null, area: 82.5, rooms: 4};
test('saisie manuelle : champs, unités, fichiers, plafonds et absence de source web fictive', () => {
  const photos = [1,2,3].map(n => ({hash: String(n).repeat(64), size: 100, mime: 'image/jpeg'}));
  assert.equal(ManualListingInput.safeParse({...seed, photos}).success, true);
  for (const changes of [{title: ''}, {locality: ''}, {agencyId: 'another'}, {priceCents: 0}, {rooms: 2.5}, {description: 'x'.repeat(20001)},
    {photos: photos.slice(0,2)}, {photos: [...photos, photos[0]]}, {transaction: 'rent'}, {charges: 'included'}, {photos: [{...photos[0], mime: 'image/svg+xml'},...photos.slice(1)]}])
    assert.equal(ManualListingInput.safeParse({...seed, photos, ...changes}).success, false, JSON.stringify(Object.keys(changes)));
  assert.equal(ManualListingInput.safeParse({...seed, transaction: 'rent', charges: 'excluded', photos}).success, true);
  assert.equal(ManualListingInput.safeParse({...seed, transaction: 'rent', priceCents: null, photos}).success, true);
  assert.throws(() => parseManualInput({...seed, photos: photos.map(p => ({...p, size: MANUAL_PHOTO_LIMITS.fileBytes + 1}))}), errorCode('VALIDATION_ERROR'));
  for (const request of [new Request('https://bienvu.example/api/imports/manual'), new Request('http://localhost:8787/api/imports/manual')])
    assert.throws(() => localPhotoNormalizer(request, {PROBE_MODE: 'staging', IMPORT_MODE: 'disabled', LOCAL_IMPORT_TOKEN: 's'.repeat(32)}), errorCode('IMPORTS_UNAVAILABLE'));
});

test('saisie et uploads : D1/R2 réels locaux, images synthétiques réellement décodées', async t => {
  const mf = new Miniflare(convertV4MiniflareOptions({modules: true, script: 'export default {fetch(){return new Response("test")}}',
    compatibilityDate: '2026-09-27', d1Databases: ['DB'], r2Buckets: ['MEDIA']}));
  t.after(() => mf.dispose());
  const env = await mf.getBindings<Pick<CloudflareEnv, 'DB' | 'MEDIA'>>(), {DB, MEDIA} = env;
  for (const file of (await readdir('packages/db/migrations')).filter(f => f.endsWith('.sql')).sort())
    await DB.exec((await readFile(`packages/db/migrations/${file}`, 'utf8')).replace(/^--.*$/gm, '').replace(/\n/g, ' '));
  const now = Date.now(), at = new Date(now).toISOString();
  for (const id of ['manual-a','manual-b']) await DB.prepare('INSERT INTO agencies(id,owner_user_id,name,created_at,updated_at) VALUES(?,?,?,?,?)').bind(id,id,'Recette',at,at).run();
  const files = await Promise.all(['#204f43','#ad674b','#d6ceb1'].map(async background => new Uint8Array(await sharp({create:{width:960,height:640,channels:3,background}}).png().toBuffer())));
  const photos = await Promise.all(files.map(async bytes => ({hash: await contentHash(bytes), size: bytes.length, mime: 'image/png' as const})));
  const input = {...seed, photos}, key = 'manual-fixture-key-001';
  const draft = await createManualListing(env, 'manual-a', key, input);
  await t.test('idempotence concurrente et source déclarée, aucune propriété d’agence cliente', async () => {
    const replies = await Promise.all(Array.from({length:4}, () => createManualListing(env, 'manual-a', key, input)));
    assert.ok(replies.every(row => row.id === draft.id)); assert.equal(draft.sourceKind,'manual'); assert.equal(draft.sourceUrl,null);
    assert.equal((await DB.prepare('SELECT sum(attempts) n FROM import_usage').first<{n:number}>())?.n,1);
    await assert.rejects(createManualListing(env,'manual-a',key,{...input,title:'Autre bien'}),errorCode('CONFLICT'));
    await assert.rejects(createManualListing(env,'manual-a','invalid-fixture-key',{...input,agencyId:'manual-b'}),errorCode('VALIDATION_ERROR'));
    await assert.rejects(manualDraft(DB,'manual-b',draft.id),errorCode('NOT_FOUND'));
  });
  await t.test('fichier altéré et publication incomplète refusés, sans objet ni fiche visible', async () => {
    await assert.rejects(uploadManualPhoto(env,'manual-a',draft.id,0,files[1],'image/png',normalizePhoto,signal()),errorCode('VALIDATION_ERROR'));
    await assert.rejects(uploadManualPhoto(env,'manual-b',draft.id,0,files[0],'image/png',normalizePhoto,signal()),errorCode('NOT_FOUND'));
    await assert.rejects(finishManualListing(env,'manual-a',draft.id),errorCode('INSUFFICIENT_PHOTOS'));
    assert.deepEqual(await importObjectKeys(DB,'manual-a',draft.id),[]);
    assert.equal(await DB.prepare('SELECT id FROM listings WHERE id=?').bind(draft.id).first(),null);
  });
  await t.test('put interrompu : journal récupérable, reprise du même slot sans doublon', async () => {
    const broken = {...env, MEDIA: {head: MEDIA.head.bind(MEDIA), put: async () => {throw new Error('FIXTURE_INTERRUPTED');}}};
    await assert.rejects(uploadManualPhoto(broken,'manual-a',draft.id,0,files[0],'image/png',normalizePhoto,signal()),/FIXTURE_INTERRUPTED/);
    assert.equal((await importObjectKeys(DB,'manual-a',draft.id)).length,1);
    await assert.rejects(finishManualListing(env,'manual-a',draft.id),errorCode('INSUFFICIENT_PHOTOS'));
    const photo = await uploadManualPhoto(env,'manual-a',draft.id,0,files[0],'image/png',normalizePhoto,signal());
    const same = await uploadManualPhoto(env,'manual-a',draft.id,0,files[0],'image/png',async()=>{throw new Error('NO_REDECODE');},signal());
    assert.deepEqual(same,photo);
    for (const index of [1,2]) await uploadManualPhoto(env,'manual-a',draft.id,index,files[index],'image/png',normalizePhoto,signal());
  });
  await t.test('finalisation concurrente, relecture privée, valeurs déclarées et aucun crédit consommé', async () => {
    const [ready, repeated] = await Promise.all([finishManualListing(env,'manual-a',draft.id),finishManualListing(env,'manual-a',draft.id)]);
    assert.equal(ready.id,repeated.id); assert.equal(ready.status,'ready');
    const listing = importResult(await findImport(DB,'manual-a',draft.id)).listing!;
    assert.equal(listing.facts.title.status,'user_provided'); assert.equal(listing.facts.price.value?.amountCents,28500000);
    assert.equal(listing.description?.text,seed.description); assert.equal(listing.canonicalUrl,null);
    assert.ok(listing.photos.every(p=>p.sourceUrl===null));
    assert.equal(GeneratableListing.safeParse({...listing,sourceKind:'url'}).success,false);
    assert.equal(GeneratableListing.safeParse({...listing,facts:{...listing.facts,title:{...listing.facts.title,status:'verified'}}}).success,false);
    const photo = await privateImportPhoto(env,'manual-a',draft.id,listing.photos[0].id);
    assert.equal((await sharp(new Uint8Array(await photo.arrayBuffer())).metadata()).format,'jpeg');
    await assert.rejects(privateImportPhoto(env,'manual-b',draft.id,listing.photos[0].id),errorCode('NOT_FOUND'));
    for (const table of ['jobs','reservations','allocations','cost_events']) assert.equal((await DB.prepare(`SELECT count(*) n FROM ${table}`).first<{n:number}>())?.n,0);
  });
  await t.test('doublons visuels normalisés et faux fichier JPEG refusés', async () => {
    const duplicate = new Uint8Array(await sharp(files[0]).withMetadata({density:72}).png().toBuffer());
    const bad = new TextEncoder().encode('<svg onload="alert(1)"></svg>');
    const values = [files[0],duplicate,bad];
    const data = {...seed,photos:await Promise.all(values.map(async(bytes,index)=>({hash:await contentHash(bytes),size:bytes.length,mime:index===2?'image/jpeg':'image/png'})))};
    const row = await createManualListing(env,'manual-a','manual-duplicate-key-001',data);
    await uploadManualPhoto(env,'manual-a',row.id,0,files[0],'image/png',normalizePhoto,signal());
    await assert.rejects(uploadManualPhoto(env,'manual-a',row.id,1,duplicate,'image/png',normalizePhoto,signal()),errorCode('DUPLICATE_PHOTO'));
    await assert.rejects(uploadManualPhoto(env,'manual-a',row.id,2,bad,'image/jpeg',normalizePhoto,signal()));
    await assert.rejects(finishManualListing(env,'manual-a',row.id),errorCode('INSUFFICIENT_PHOTOS'));
    assert.equal(await purgeImport(env,'manual-a',row.id,now+1_300_000),true);
    assert.equal(await findImport(DB,'manual-a',row.id),null);
  });
  await t.test('expiration et purge : écriture tardive impossible, compteur conservé', async () => {
    const abandoned = await createManualListing(env,'manual-a','manual-abandoned-key-001',input);
    await DB.prepare('UPDATE listing_imports SET lease_until=? WHERE id=?').bind(new Date(now-1_000_000).toISOString(),abandoned.id).run();
    await assert.rejects(uploadManualPhoto(env,'manual-a',abandoned.id,0,files[0],'image/png',normalizePhoto,signal()),errorCode('CONFLICT'));
    assert.equal(await purgeImport(env,'manual-a',abandoned.id),true);
    assert.equal((await DB.prepare('SELECT sum(attempts) n FROM import_usage').first<{n:number}>())?.n,3);
  });
});
