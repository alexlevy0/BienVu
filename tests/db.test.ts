import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile, readdir} from 'node:fs/promises';
import {Miniflare, convertV4MiniflareOptions} from 'miniflare';
import {findAgencyJob, generationsEnabled, recordCost} from '../packages/db/src/index';

test('D1 local réel : migrations, isolation, contraintes et rollback du batch', async t => {
  const mf = new Miniflare(convertV4MiniflareOptions({modules: true, script: 'export default {fetch(){return new Response("test")}}',
    compatibilityDate: '2026-09-27', d1Databases: ['DB']}));
  t.after(() => mf.dispose());
  const db = await mf.getD1Database('DB');
  const migrationPath = new URL('../packages/db/migrations/', import.meta.url);
  for (const file of (await readdir(migrationPath)).filter(file => file.endsWith('.sql')).sort()) {
    await db.exec((await readFile(new URL(file, migrationPath), 'utf8')).replace(/^--.*$/gm, '').replace(/\n/g, ' '));
  }
  const at = '2026-09-27T12:00:00.000Z';
  for (const id of ['a', 'b', 'c', 'a_b']) {
    await db.prepare('INSERT INTO agencies(id,owner_user_id,name,created_at,updated_at) VALUES(?,?,?,?,?)').bind(id, `user-${id}`, `Agence synthétique ${id}`, at, at).run();
    await db.prepare("INSERT INTO allocations(id,agency_id,kind,period_key,quota_limit,valid_from,valid_until) VALUES(?,?,'trial','lifetime',1,?,?)").bind(`allocation-${id}`, id, at, '2027-09-27T12:00:00.000Z').run();
  }
  function batch(agency: string, id: string, allocation = `allocation-${agency}`, key = `idempotency-key-${id}`) {
    return [
      db.prepare(`INSERT INTO jobs(id,agency_id,source_url,idempotency_key,status,stage,reservation_id,created_at,updated_at)
        VALUES(?,?,?,?,'queued','importing',?,?,?)`).bind(id, agency, 'https://agence.example.com/fixture', key, `reservation-${id}`, at, at),
      db.prepare("INSERT INTO reservations(id,agency_id,job_id,allocation_id,status,created_at,updated_at) VALUES(?,?,?,?,'reserved',?,?)")
        .bind(`reservation-${id}`, agency, id, allocation, at, at),
    ];
  }
  await t.test('liens inter-agences rejetés sans écriture partielle', async () => {
    await assert.rejects(db.batch(batch('a', 'foreign-job', 'allocation-b')), /FOREIGN KEY/);
    assert.equal(await db.prepare("SELECT id FROM jobs WHERE id='foreign-job'").first(), null);
    assert.equal(await db.prepare("SELECT id FROM reservations WHERE job_id='foreign-job'").first(), null);
  });
  await db.batch(batch('a', 'job-a'));
  await t.test('préfixe média exact, même avec underscore dans l’agence', async () => {
    await assert.rejects(db.prepare(`INSERT INTO media_assets(id,agency_id,kind,object_key,content_hash,mime,size_bytes,created_at)
      VALUES('asset-foreign','a_b','brand','agencies/axb/brand/logo.png',?,'image/png',100,?)`).bind('a'.repeat(64), at).run(), /MEDIA_AGENCY_MISMATCH/);
  });
  await t.test('lecture toujours limitée à l’agence du contexte serveur', async () => {
    assert.equal((await findAgencyJob(db, 'a', 'job-a'))?.id, 'job-a');
    assert.equal(await findAgencyJob(db, 'b', 'job-a'), null);
  });
  await t.test('idempotence et unicité du traitement actif survivent à deux requêtes', async () => {
    await assert.rejects(db.batch(batch('a', 'job-duplicate', 'allocation-a', 'idempotency-key-job-a')), /UNIQUE/);
    const outcomes = await Promise.allSettled([db.batch(batch('b', 'job-b1')), db.batch(batch('b', 'job-b2'))]);
    assert.equal(outcomes.filter(outcome => outcome.status === 'fulfilled').length, 1);
    assert.equal((await db.prepare("SELECT COUNT(*) AS n FROM reservations WHERE agency_id='b'").first<{n: number}>())?.n, 1);
  });
  await t.test('rollback complet si une réservation dépasse la capacité', async () => {
    await assert.rejects(db.batch([
      ...batch('c', 'job-overflow'),
      db.prepare("UPDATE allocations SET reserved=2 WHERE id='allocation-c'"),
    ]), /CHECK/);
    assert.equal(await db.prepare("SELECT id FROM jobs WHERE id='job-overflow'").first(), null);
    assert.equal((await db.prepare("SELECT reserved FROM allocations WHERE id='allocation-c'").first<{reserved: number}>())?.reserved, 0);
  });
  await t.test('coûts dédupliqués sans écrasement, arrêt par défaut', async () => {
    const cost = {id: 'cost-fixture', agencyId: 'a', jobId: 'job-a', requestId: '00000000-0000-4000-8000-000000000001',
      provider: 'cloudflare' as const, stage: 'rendering' as const, kind: 'estimate' as const, quantity: 1,
      unit: 'second' as const, currency: 'EUR' as const, unitPriceMicros: 100, amountMicros: 100, priceDate: '2026-09-27', createdAt: at};
    await recordCost(db, cost); await recordCost(db, cost);
    await assert.rejects(recordCost(db, {...cost, amountMicros: 200}), /COST_EVENT_CONFLICT/);
    assert.equal((await db.prepare('SELECT COUNT(*) AS n FROM cost_events').first<{n: number}>())?.n, 1);
    assert.equal(await generationsEnabled(db, 'true'), false);
    await db.prepare("UPDATE generation_control SET enabled=1 WHERE id='generations'").run();
    assert.equal(await generationsEnabled(db, undefined), false);
    assert.equal(await generationsEnabled(db, 'false'), false);
    assert.equal(await generationsEnabled(db, 'true'), true);
    await db.prepare('DELETE FROM generation_control').run();
    assert.equal(await generationsEnabled(db, 'true'), false);
  });
});
