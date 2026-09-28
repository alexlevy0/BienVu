import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile, readdir} from 'node:fs/promises';
import {Miniflare, convertV4MiniflareOptions} from 'miniflare';
import {beginImport, failImport, reserveHostedImport, claimHostedResource, settleHostedResource, claimHostedBrowser, releaseHostedBrowser} from '../packages/db/src/index';
import {purgeHostedImports} from '../apps/pipeline/src/import-cleanup';

test('budget imports hébergés : réservation atomique, rejouable, bornes réseau et compteurs conservés après purge', async t => {
  const mf = new Miniflare(convertV4MiniflareOptions({modules: true, script: 'export default {fetch(){return new Response("fixture")}}',
    compatibilityDate: '2026-09-28', d1Databases: ['DB'], r2Buckets: ['MEDIA']}));
  t.after(() => mf.dispose());
  const {DB, MEDIA} = await mf.getBindings<Pick<CloudflareEnv, 'DB' | 'MEDIA'>>();
  for (const file of (await readdir('packages/db/migrations')).filter(f => f.endsWith('.sql')).sort())
    await DB.exec((await readFile(`packages/db/migrations/${file}`, 'utf8')).replace(/^--.*$/gm, '').replace(/\n/g, ' '));
  const now = Date.now(), at = new Date(now).toISOString(), month = at.slice(0, 7);
  const rows = [];
  for (const id of ['a', 'b', 'c']) {
    await DB.prepare('INSERT INTO agencies(id,owner_user_id,name,created_at,updated_at) VALUES(?,?,?,?,?)').bind(id, id, id, at, at).run();
    rows.push((await beginImport(DB, id, 'https://fixtures.bienvu.example/vente', `fixture-hosted-${id}-01`)).row);
  }
  await assert.rejects(reserveHostedImport(DB, 'a', rows[0].id));
  await DB.prepare('INSERT INTO hosted_import_budget(month,baseline_cents,ceiling_cents,paused) VALUES(?,1650,1750,0)').bind(month).run();
  const attempts = await Promise.allSettled(rows.map(row => reserveHostedImport(DB, row.agencyId, row.id)));
  assert.equal(attempts.filter(a => a.status === 'fulfilled').length, 2);
  const accepted = rows.filter((_row, index) => attempts[index].status === 'fulfilled'), first = accepted[0], second = accepted[1];
  await reserveHostedImport(DB, first.agencyId, first.id);
  assert.equal((await DB.prepare('SELECT sum(reserved_cents) n FROM hosted_import_costs').first<{n:number}>())?.n, 100);
  await assert.rejects(claimHostedResource(DB, 'foreign', first.id, 100));
  await Promise.all(Array.from({length: 5}, () => claimHostedResource(DB, first.agencyId, first.id, 10 * 1024 * 1024)));
  await assert.rejects(claimHostedResource(DB, first.agencyId, first.id, 1));
  await assert.rejects(settleHostedResource(DB, first.id, 100, 101));
  await settleHostedResource(DB, first.id, 100, 50);
  await claimHostedResource(DB, first.agencyId, first.id, 50);
  await claimHostedBrowser(DB, first.agencyId, first.id);
  await assert.rejects(claimHostedBrowser(DB, second.agencyId, second.id));
  await releaseHostedBrowser(DB, 'foreign');
  assert.equal((await DB.prepare('SELECT lease_id FROM hosted_browser_slot').first<{lease_id:string}>())?.lease_id, first.id);
  await releaseHostedBrowser(DB, first.id);
  await assert.rejects(claimHostedBrowser(DB, first.agencyId, first.id));
  await DB.prepare('UPDATE hosted_import_budget SET paused=1').run();
  await assert.rejects(claimHostedResource(DB, second.agencyId, second.id, 1));
  for (const row of rows) await failImport(DB, row.agencyId, row.id, 'SOURCE_UNAVAILABLE', {});
  const purge = await purgeHostedImports({DB, MEDIA}, now + 700_000);
  assert.equal(purge.removed, 3);
  assert.equal((await DB.prepare('SELECT sum(reserved_cents) n FROM hosted_import_costs').first<{n:number}>())?.n, 100);
  assert.equal((await DB.prepare('SELECT sum(attempts) n FROM import_usage').first<{n:number}>())?.n, 3);
  assert.equal((await purgeHostedImports({DB, MEDIA}, now + 700_000)).removed, 0);
});
