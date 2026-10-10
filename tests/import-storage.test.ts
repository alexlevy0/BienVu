import {test} from 'node:test';
import {URL_IMPORT_QUOTAS} from '../packages/contracts/src/import-quotas';
import assert from 'node:assert/strict';
import {readFile, readdir} from 'node:fs/promises';
import {Miniflare, convertV4MiniflareOptions} from 'miniflare';
import {createPrivateImport, importResult, privateImportPhoto, purgeImport} from '../apps/web/lib/imports';
import {localImportTransport} from '../apps/web/lib/import-transport';
import {RequestFailure} from '../apps/web/lib/http';
import {beginImport, failImport, findImport, importObjectKeys, journalImportPhoto, markImportDeleting, completeImport} from '../packages/db/src/imports';
import {fixtureImportTransport} from '../scripts/import-fixtures';

test('imports : D1 et R2 réels en local, aucune génération ni consommation de crédit', async t => {
  const mf = new Miniflare(convertV4MiniflareOptions({modules: true, script: 'export default {fetch(){return new Response("test")}}',
    compatibilityDate: '2026-09-27', d1Databases: ['DB'], r2Buckets: ['MEDIA']}));
  t.after(() => mf.dispose());
  const {DB, MEDIA} = await mf.getBindings<Pick<CloudflareEnv, 'DB' | 'MEDIA'>>();
  for (const file of (await readdir(new URL('../packages/db/migrations/', import.meta.url))).filter(f => f.endsWith('.sql')).sort())
    await DB.exec((await readFile(new URL(`../packages/db/migrations/${file}`, import.meta.url), 'utf8')).replace(/^--.*$/gm, '').replace(/\n/g, ' '));
  const now = Date.now(), at = new Date(now).toISOString(), env = {DB, MEDIA};
  for (const id of 'abcdefghijklmnopqrstuvw')
    await DB.prepare('INSERT INTO agencies(id,owner_user_id,name,created_at,updated_at) VALUES(?,?,?,?,?)').bind(id, `owner-${id}`, `Fixture ${id}`, at, at).run();
  const source = 'https://fixtures.bienvu.example/vente', key = 'fixture-idempotent-001';
  const ready = await createPrivateImport(env, 'a', source, key, fixtureImportTransport());
  const listing = importResult(ready).listing!;
  await t.test('résultat persisté, photos décodées privées, aucune fuite vers l’agence voisine', async () => {
    assert.equal(ready.status, 'ready'); assert.equal(listing.photos.length, 3);
    assert.ok(listing.description?.text.includes('Deux chambres'));
    const persisted = await DB.prepare('SELECT description_json FROM listings WHERE id=?').bind(ready.id).first<{description_json: string}>();
    assert.deepEqual(JSON.parse(persisted!.description_json), listing.description);
    assert.deepEqual(importResult(await findImport(DB, 'a', ready.id)).listing?.description, listing.description);
    assert.equal((await DB.prepare('SELECT count(*) n FROM listings').first<{n: number}>())?.n, 1);
    assert.equal(await findImport(DB, 'b', ready.id), null);
    assert.throws(() => importResult(null), e => e instanceof RequestFailure && e.code === 'NOT_FOUND');
    await assert.rejects(privateImportPhoto(env, 'b', ready.id, listing.photos[0].id), e => e instanceof RequestFailure && e.code === 'NOT_FOUND');
    const photo = await privateImportPhoto(env, 'a', ready.id, listing.photos[0].id);
    assert.equal(photo.headers.get('Content-Type'), 'image/jpeg'); assert.equal((await photo.arrayBuffer()).byteLength, listing.photos[0].sizeBytes);
    for (const table of ['jobs', 'reservations', 'allocations', 'cost_events']) assert.equal((await DB.prepare(`SELECT count(*) n FROM ${table}`).first<{n: number}>())?.n, 0);
  });
  await t.test('rejeu sans réseau et double clic concurrent, URL différente refusée', async () => {
    const reused = await createPrivateImport(env, 'a', source, key, {load: async () => {throw new Error('NETWORK_MUST_NOT_RUN');}});
    assert.equal(reused.id, ready.id); assert.equal(reused.status, 'ready');
    await assert.rejects(createPrivateImport(env, 'a', source + '?autre=1', key, fixtureImportTransport()), e => e instanceof RequestFailure && e.code === 'CONFLICT');
    const rows = await Promise.all(Array.from({length: 4}, () => beginImport(DB, 'b', source, 'fixture-concurrent-001')));
    assert.equal(rows.filter(v => v.fresh).length, 1); assert.equal(new Set(rows.map(v => v.row.id)).size, 1);
    await assert.rejects(beginImport(DB, 'b', source, 'fixture-concurrent-002'));
    await failImport(DB, 'b', rows[0].row.id, 'IMPORT_TIMEOUT', {});
  });
  await t.test('échec au deuxième put : aucun listing publié, objets nettoyés, journal conservé', async () => {
    let puts = 0;
    const broken = {get: MEDIA.get.bind(MEDIA), delete: MEDIA.delete.bind(MEDIA), put: async (...args: Parameters<typeof MEDIA.put>) => {
      if (++puts === 2) throw new Error('FIXTURE_PUT_FAILED'); return MEDIA.put(...args);
    }};
    const failed = await createPrivateImport({DB, MEDIA: broken}, 'c', source, 'fixture-storage-error', fixtureImportTransport());
    assert.equal(failed.status, 'failed'); assert.equal(await DB.prepare('SELECT id FROM listings WHERE id=?').bind(failed.id).first(), null);
    const keys = await importObjectKeys(DB, 'c', failed.id); assert.equal(keys.length, 2);
    for (const objectKey of keys) assert.equal(await MEDIA.get(objectKey), null);
    assert.equal(await purgeImport(env, 'c', failed.id, now), false);
    assert.equal(await purgeImport(env, 'c', failed.id, now + 600_000), true);
    assert.equal(await findImport(DB, 'c', failed.id), null);
  });
  await t.test('admission refusée : le budget est conservé dans le diagnostic, sans accuser la source ni appeler le réseau', async () => {
    let requests=0;
    await assert.rejects(createPrivateImport(env,'e',source,'fixture-budget-refused',
      {load:async()=>{requests++;throw Error('NETWORK_MUST_NOT_RUN');}},undefined,
      {beforeStart:async()=>{throw new RequestFailure('IMPORT_BUDGET_LIMIT');}}),
      error=>error instanceof RequestFailure&&error.code==='IMPORT_BUDGET_LIMIT');
    assert.equal(requests,0);
    const failed=await DB.prepare('SELECT status,error_code,diagnostics_json FROM listing_imports WHERE agency_id=?').bind('e')
      .first<{status:string;error_code:string;diagnostics_json:string}>();
    assert.equal(failed!.status,'failed');assert.equal(failed!.error_code,'IMPORT_BUDGET_LIMIT');
    assert.equal(JSON.parse(failed!.diagnostics_json).stage,'admission');
  });
  await t.test('abandon et purge rejouable, écriture tardive interdite', async () => {
    const abandoned = (await beginImport(DB, 'd', source, 'fixture-abandoned-001')).row;
    assert.equal(await markImportDeleting(DB, 'd', abandoned.id, now + 600_000), true);
    await assert.rejects(journalImportPhoto(DB, 'd', abandoned.id, {...listing.photos[0], agencyId: 'd', listingId: abandoned.id,
      objectKey: `agencies/d/imports/${abandoned.id}/a.jpg`}, now));
    await assert.rejects(completeImport(DB, {...listing, agencyId: 'd', id: abandoned.id, photos: listing.photos.map(p => ({...p, agencyId: 'd', listingId: abandoned.id, objectKey: `agencies/d/imports/${abandoned.id}/${p.contentHash}.jpg`}))}, {}, now));
    assert.equal(await purgeImport(env, 'd', abandoned.id, now + 600_000), true);
    assert.equal(await purgeImport(env, 'd', abandoned.id, now + 600_000), false);
  });
  await t.test('un job actif protège son listing et ses objets contre la purge', async () => {
    await DB.prepare("INSERT INTO allocations(id,agency_id,kind,period_key,quota_limit,valid_from,valid_until) VALUES('alloc-a','a','trial','lifetime',1,?,?)").bind(at, new Date(now + 86400_000).toISOString()).run();
    await DB.batch([
      DB.prepare("INSERT INTO jobs(id,agency_id,listing_id,source_url,idempotency_key,status,stage,reservation_id,created_at,updated_at) VALUES('job-a','a',?,?,'job-idempotent-001','queued','importing','res-a',?,?)").bind(ready.id, source, at, at),
      DB.prepare("INSERT INTO reservations(id,agency_id,job_id,allocation_id,status,created_at,updated_at) VALUES('res-a','a','job-a','alloc-a','reserved',?,?)").bind(at, at),
    ]);
    assert.equal(await purgeImport(env, 'a', ready.id, now + 31 * 86400_000, true), false);
    assert.ok(await MEDIA.get(listing.photos[0].objectKey));
  });
  await t.test('plafond persistant sous concurrence, purge sans restitution du budget d’essai', async () => {
    // Midi UTC évite de franchir un jour de quota avec +700 s près de minuit.
    const tomorrow = Date.parse(`${new Date(now + 2 * 86400_000).toISOString().slice(0, 10)}T12:00:00.000Z`);
    // Each agency has its own in-flight lock; use distinct agencies to test the shared quota.
    const agencies=Array.from({length:URL_IMPORT_QUOTAS.daily+1},(_,i)=>`quota-fixture-${i}`);
    for(const id of agencies)await DB.prepare('INSERT INTO agencies(id,owner_user_id,name,created_at,updated_at) VALUES(?,?,?,?,?)').bind(id,`owner-${id}`,id,at,at).run();
    const attempts = await Promise.allSettled(agencies.map(id=>beginImport(DB,id,source,`quota-key-fixture-${id}`,tomorrow)));
    assert.equal(attempts.filter(x => x.status === 'fulfilled').length, URL_IMPORT_QUOTAS.daily, attempts.map(x => x.status === 'fulfilled' ? 'accepted' : String(x.reason)).join(', '));
    for (const outcome of attempts) if (outcome.status === 'fulfilled') {
      const row = outcome.value.row; await failImport(DB, row.agencyId, row.id, 'NOT_A_LISTING', {});
      await purgeImport(env, row.agencyId, row.id, tomorrow + 600_000);
    }
    await assert.rejects(beginImport(DB, 'h', source, 'quota-key-after-cleanup', tomorrow + 700_000), /IMPORT_LIMIT/);
    assert.equal((await DB.prepare('SELECT attempts FROM import_usage WHERE day=?').bind(new Date(tomorrow).toISOString().slice(0, 10)).first<{attempts: number}>())?.attempts, URL_IMPORT_QUOTAS.daily);
  });
});
test('transport local impossible en staging, sur URL publique ou sans secret', () => {
  const env = {PROBE_MODE: 'local', IMPORT_MODE: 'local', LOCAL_IMPORT_TOKEN: 's'.repeat(32)};
  for (const [request, config] of [[new Request('https://public.example/api/imports'), env],
    [new Request('http://localhost:8787/api/imports'), {...env, PROBE_MODE: 'remote'}],
    [new Request('http://localhost:8787/api/imports'), {...env, IMPORT_MODE: 'disabled'}],
    [new Request('http://localhost:8787/api/imports'), {...env, LOCAL_IMPORT_TOKEN: ''}]] as const)
    assert.throws(() => localImportTransport(request, config), e => e instanceof RequestFailure && e.code === 'IMPORTS_UNAVAILABLE');
});
