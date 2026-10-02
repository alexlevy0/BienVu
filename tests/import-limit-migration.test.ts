import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile, readdir} from 'node:fs/promises';
import {Miniflare, convertV4MiniflareOptions} from 'miniflare';
import {beginImport, beginManualImport, failImport, generationRights} from '../packages/db/src/index';

test('migration 0010 : compteurs conservés, imports 6 à 10 autorisés, plafonds quotidien et mensuel maintenus', async t => {
  const mf = new Miniflare(convertV4MiniflareOptions({modules: true,
    script: 'export default {fetch(){return new Response("test")}}',
    compatibilityDate: '2026-09-27', d1Databases: ['DB']}));
  t.after(() => mf.dispose());
  const {DB} = await mf.getBindings<Pick<CloudflareEnv, 'DB'>>();
  const directory = new URL('../packages/db/migrations/', import.meta.url);
  const migrate = async (file: string) => DB.exec((await readFile(new URL(file, directory), 'utf8'))
    .replace(/^--.*$/gm, '').replace(/\n/g, ' '));
  for (const file of (await readdir(directory)).filter(f => f.endsWith('.sql') && f < '0010').sort()) await migrate(file);
  const now = Date.parse('2026-09-28T12:00:00Z'), source = 'https://fixtures.bienvu.example/vente';
  await DB.prepare('INSERT INTO agencies(id,owner_user_id,name,created_at,updated_at) VALUES(?,?,?,?,?)')
    .bind('quota-agency', 'quota-owner', 'Fixture quota', new Date(now).toISOString(), new Date(now).toISOString()).run();
  // Historique synthétique : 20 essais précédents, puis les 5 essais du jour.
  await DB.exec("INSERT INTO import_usage(day,attempts) VALUES('2026-09-27',20),('2026-09-28',5)");
  const usage = () => DB.prepare('SELECT day,attempts FROM import_usage ORDER BY day').all();
  // Exercise the historical schema with its historical SQL. The current import
  // API requires migration 0019's creation_drafts table and cannot run here.
  const beginHistoricalImport=async (key:string, at:number)=>{
    const old=await DB.prepare('SELECT id FROM listing_imports WHERE agency_id=? AND idempotency_key=?')
      .bind('quota-agency',key).first<{id:string}>();
    if(old)return {row:old,fresh:false};
    const id=crypto.randomUUID(),created=new Date(at).toISOString();
    await DB.prepare(`INSERT INTO listing_imports(id,agency_id,idempotency_key,source_url,source_kind,status,created_at,lease_until,expires_at)
      VALUES(?,?,?,?,'url','importing',?,?,?)`)
      .bind(id,'quota-agency',key,source,created,new Date(at+90_000).toISOString(),new Date(at+30*86400_000).toISOString()).run();
    return {row:{id},fresh:true};
  };
  const before = (await usage()).results;
  await assert.rejects(beginHistoricalImport('before-migration-key', now), /IMPORT_LIMIT/);
  await migrate('0010_imports_daily_limit.sql');
  assert.deepEqual((await usage()).results, before);
  for (let attempt = 6; attempt <= 10; attempt++) {
    const key = `quota-migration-${attempt}`;
    const accepted = await beginHistoricalImport(key, now);
    assert.equal(accepted.fresh, true);
    await DB.prepare("UPDATE listing_imports SET status='failed',error_code='SOURCE_BLOCKED' WHERE id=?")
      .bind(accepted.row.id).run();
    const replay = await beginHistoricalImport(key, now);
    assert.equal(replay.fresh, false);
    assert.equal(replay.row.id, accepted.row.id);
  }
  assert.deepEqual((await usage()).results, [{day: '2026-09-27', attempts: 20}, {day: '2026-09-28', attempts: 10}]);
  await assert.rejects(beginHistoricalImport('eleventh-daily-attempt', now), /IMPORT_LIMIT/);
  await assert.rejects(beginHistoricalImport('thirty-first-monthly-attempt', now + 86400_000), /IMPORT_LIMIT/);
  assert.deepEqual((await usage()).results, [{day: '2026-09-27', attempts: 20}, {day: '2026-09-28', attempts: 10}]);
});

test('migration 0029 : historique conservé, 20/jour et 60/mois, droits synchronisés et renouvellement UTC', async t => {
  const mf = new Miniflare(convertV4MiniflareOptions({modules: true,
    script: 'export default {fetch(){return new Response("test")}}',
    compatibilityDate: '2026-09-27', d1Databases: ['DB']}));
  t.after(() => mf.dispose());
  const {DB} = await mf.getBindings<Pick<CloudflareEnv, 'DB'>>();
  const directory = new URL('../packages/db/migrations/', import.meta.url);
  const migrate = async (file: string) => DB.exec((await readFile(new URL(file, directory), 'utf8'))
    .replace(/^--.*$/gm, '').replace(/\n/g, ' '));
  for (const file of (await readdir(directory)).filter(f => f.endsWith('.sql') && f < '0029').sort()) await migrate(file);
  const now = Date.parse('2026-10-03T12:00:00Z'), source = 'https://fixtures.bienvu.example/vente';
  const at = new Date(now).toISOString();
  await DB.prepare('INSERT INTO agencies(id,owner_user_id,name,created_at,updated_at) VALUES(?,?,?,?,?)')
    .bind('double-quota', 'double-owner', 'Fixture quota', at, at).run();
  await DB.exec("INSERT INTO import_usage(day,attempts) VALUES('2026-09-30',30),('2026-10-01',20),('2026-10-02',19),('2026-10-03',10)");
  const usage = async () => (await DB.prepare('SELECT day,attempts FROM import_usage ORDER BY day').all()).results;
  const before = await usage();
  await assert.rejects(beginImport(DB, 'double-quota', source, 'before-doubled-limits', now), /IMPORT_LIMIT/);
  await migrate('0029_double_import_limits.sql');
  assert.deepEqual(await usage(), before);
  assert.equal((await generationRights(DB, 'double-quota', 'true', now)).importRetryAt, null);
  // Attempts 11–20 are usable immediately; failures and idempotent replays
  // neither refund nor consume additional scraping attempts.
  for (let attempt = 11; attempt <= 20; attempt++) {
    const key = `doubled-quota-${attempt}`;
    const accepted = await beginImport(DB, 'double-quota', source, key, now);
    await failImport(DB, 'double-quota', accepted.row.id, 'SOURCE_BLOCKED', {});
    const replay = await beginImport(DB, 'double-quota', source, key, now);
    assert.equal(replay.fresh, false);
    assert.equal(replay.row.id, accepted.row.id);
  }
  const atDailyLimit = await usage();
  assert.equal((await generationRights(DB, 'double-quota', 'true', now)).importRetryAt, '2026-10-04T00:00:00.000Z');
  await assert.rejects(beginImport(DB, 'double-quota', source, 'twenty-first-daily-attempt', now), /IMPORT_LIMIT/);
  assert.deepEqual(await usage(), atDailyLimit);
  const tomorrow = now + 86400_000;
  assert.equal((await generationRights(DB, 'double-quota', 'true', tomorrow)).importRetryAt, null);
  const sixtieth = await beginImport(DB, 'double-quota', source, 'sixtieth-monthly-attempt', tomorrow);
  await failImport(DB, 'double-quota', sixtieth.row.id, 'SOURCE_BLOCKED', {});
  const atMonthlyLimit = await usage();
  assert.equal((await generationRights(DB, 'double-quota', 'true', tomorrow)).importRetryAt, '2026-11-01T00:00:00.000Z');
  await assert.rejects(beginImport(DB, 'double-quota', source, 'sixty-first-monthly-attempt', tomorrow), /IMPORT_LIMIT/);
  await assert.rejects(beginImport(DB, 'double-quota', source, 'next-day-month-still-full', tomorrow + 86400_000), /IMPORT_LIMIT/);
  const manual = await beginManualImport(DB, 'double-quota', 'manual-after-monthly-quota', '{}', 'a'.repeat(64), tomorrow);
  await failImport(DB, 'double-quota', manual.row.id, 'SOURCE_BLOCKED', {});
  assert.deepEqual(await usage(), atMonthlyLimit);
  const nextMonth = Date.parse('2026-11-01T00:00:00Z');
  assert.equal((await generationRights(DB, 'double-quota', 'true', nextMonth)).importRetryAt, null);
  assert.equal((await beginImport(DB, 'double-quota', source, 'next-month-available-again', nextMonth)).fresh, true);
});
