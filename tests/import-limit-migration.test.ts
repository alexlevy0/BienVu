import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile, readdir} from 'node:fs/promises';
import {Miniflare, convertV4MiniflareOptions} from 'miniflare';
import {beginImport, beginManualImport, failImport, generationRights} from '../packages/db/src/index';
import {URL_IMPORT_QUOTAS} from '../packages/contracts/src/import-quotas';

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

test('migration historique 0029 : compteurs conservés, 20/jour et 60/mois, renouvellement UTC', async t => {
  const mf = new Miniflare(convertV4MiniflareOptions({modules: true,
    script: 'export default {fetch(){return new Response("test")}}',
    compatibilityDate: '2026-09-27', d1Databases: ['DB']}));
  t.after(() => mf.dispose());
  const {DB} = await mf.getBindings<Pick<CloudflareEnv, 'DB'>>();
  const directory = new URL('../packages/db/migrations/', import.meta.url);
  const migrate = async (file: string) => DB.exec((await readFile(new URL(file, directory), 'utf8'))
    .replace(/^--.*$/gm, '').replace(/\n/g, ' '));
  for (const file of (await readdir(directory)).filter(f => f.endsWith('.sql') && f < '0029').sort()) await migrate(file);
  // Current import access requires this independent column; retain historical quota triggers.
  await migrate('0064_automatic_import_estimates.sql');
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
  // The current rights API also reads the billing ledger. Upgrade the remaining
  // schema before calling it, while proving both upgrades preserve old usage.
  for (const file of (await readdir(directory)).filter(f => f.endsWith('.sql') && f > '0029_double_import_limits.sql' && f < '0053').sort()) await migrate(file);
  for(const file of ['0058_heygen_avatars.sql','0061_full_length_avatars.sql','0063_offers_and_credit_rollover.sql'])await migrate(file);
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
  // Check the historical trigger directly; current rights use the newer allowance.
  assert.equal((await DB.prepare('SELECT attempts FROM import_usage WHERE day=?').bind(at.slice(0,10)).first<{attempts:number}>())?.attempts,20);
  await assert.rejects(beginImport(DB, 'double-quota', source, 'twenty-first-daily-attempt', now), /IMPORT_LIMIT/);
  assert.deepEqual(await usage(), atDailyLimit);
  const tomorrow = now + 86400_000;
  assert.equal((await generationRights(DB, 'double-quota', 'true', tomorrow)).importRetryAt, null);
  const sixtieth = await beginImport(DB, 'double-quota', source, 'sixtieth-monthly-attempt', tomorrow);
  await failImport(DB, 'double-quota', sixtieth.row.id, 'SOURCE_BLOCKED', {});
  const atMonthlyLimit = await usage();
  await assert.rejects(beginImport(DB, 'double-quota', source, 'sixty-first-monthly-attempt', tomorrow), /IMPORT_LIMIT/);
  await assert.rejects(beginImport(DB, 'double-quota', source, 'next-day-month-still-full', tomorrow + 86400_000), /IMPORT_LIMIT/);
  const manual = await beginManualImport(DB, 'double-quota', 'manual-after-monthly-quota', '{}', 'a'.repeat(64), tomorrow);
  await failImport(DB, 'double-quota', manual.row.id, 'SOURCE_BLOCKED', {});
  assert.deepEqual(await usage(), atMonthlyLimit);
  const nextMonth = Date.parse('2026-11-01T00:00:00Z');
  assert.equal((await generationRights(DB, 'double-quota', 'true', nextMonth)).importRetryAt, null);
  assert.equal((await beginImport(DB, 'double-quota', source, 'next-month-available-again', nextMonth)).fresh, true);
});

test('migration 0053 : 55 essais conservés, ancien plafond de 60 débloqué, 20/jour maintenus', async t => {
  const mf = new Miniflare(convertV4MiniflareOptions({modules: true,
    script: 'export default {fetch(){return new Response("test")}}',
    compatibilityDate: '2026-09-27', d1Databases: ['DB']}));
  t.after(() => mf.dispose());
  const {DB} = await mf.getBindings<Pick<CloudflareEnv, 'DB'>>();
  const directory = new URL('../packages/db/migrations/', import.meta.url);
  const migrate = async (file: string) => DB.exec((await readFile(new URL(file, directory), 'utf8'))
    .replace(/^--.*$/gm, '').replace(/\n/g, ' '));
  for (const file of (await readdir(directory)).filter(f => f.endsWith('.sql') && f < '0053').sort()) await migrate(file);
  for(const file of ['0058_heygen_avatars.sql','0061_full_length_avatars.sql','0063_offers_and_credit_rollover.sql'])await migrate(file);
  await migrate('0064_automatic_import_estimates.sql');
  const now = Date.parse('2026-10-08T12:00:00Z'), source = 'https://fixtures.bienvu.example/vente';
  const at = new Date(now).toISOString();
  await DB.prepare('INSERT INTO agencies(id,owner_user_id,name,created_at,updated_at) VALUES(?,?,?,?,?)')
    .bind('monthly-quota', 'monthly-owner', 'Fixture quota', at, at).run();
  await DB.exec("INSERT INTO import_usage(day,attempts) VALUES('2026-09-30',20),('2026-10-01',20),('2026-10-02',20),('2026-10-03',10),('2026-10-08',5)");
  const usage = async () => (await DB.prepare('SELECT day,attempts FROM import_usage ORDER BY day').all()).results;
  // Reach the old limit using failed imports; the migration must not refund any.
  for (let i = 0; i < 5; i++) {
    const row = (await beginImport(DB, 'monthly-quota', source, `before-monthly-raise-${i}`, now)).row;
    await failImport(DB, 'monthly-quota', row.id, 'SOURCE_BLOCKED', {});
  }
  await assert.rejects(beginImport(DB, 'monthly-quota', source, 'before-monthly-raise-blocked', now), /IMPORT_LIMIT/);
  const before = await usage();
  await migrate('0053_monthly_import_allowance.sql');
  assert.deepEqual(await usage(), before);
  assert.equal((await generationRights(DB, 'monthly-quota', 'true', now)).importRetryAt, null);
  const accepted = await beginImport(DB, 'monthly-quota', source, 'monthly-sixty-first-import', now);
  await failImport(DB, 'monthly-quota', accepted.row.id, 'SOURCE_BLOCKED', {});
  const replay = await beginImport(DB, 'monthly-quota', source, 'monthly-sixty-first-import', now);
  assert.equal(replay.fresh, false);
  assert.equal(replay.row.id, accepted.row.id);
  for (let attempt = 12; attempt <= 20; attempt++) {
    const row = (await beginImport(DB, 'monthly-quota', source, `raised-monthly-daily-${attempt}`, now)).row;
    await failImport(DB, 'monthly-quota', row.id, 'SOURCE_BLOCKED', {});
  }
  const fullDay = await usage();
  assert.equal((await DB.prepare('SELECT attempts FROM import_usage WHERE day=?').bind(at.slice(0,10)).first<{attempts:number}>())?.attempts,20);
  await assert.rejects(beginImport(DB, 'monthly-quota', source, 'raised-monthly-daily-overflow', now), /IMPORT_LIMIT/);
  assert.deepEqual(await usage(), fullDay);
  assert.equal((await generationRights(DB, 'monthly-quota', 'true', now + 86400_000)).importRetryAt, null);
});

test('quota mensuel 300 : dernière place atomique entre agences, rejeu et formulaire hors compteur, renouvellement UTC', async t => {
  const mf = new Miniflare(convertV4MiniflareOptions({modules: true,
    script: 'export default {fetch(){return new Response("test")}}',
    compatibilityDate: '2026-09-27', d1Databases: ['DB']}));
  t.after(() => mf.dispose());
  const {DB} = await mf.getBindings<Pick<CloudflareEnv, 'DB'>>();
  const directory = new URL('../packages/db/migrations/', import.meta.url);
  for (const file of (await readdir(directory)).filter(f => f.endsWith('.sql')).sort())
    await DB.exec((await readFile(new URL(file, directory), 'utf8')).replace(/^--.*$/gm, '').replace(/\n/g, ' '));
  const now = Date.parse('2026-10-16T12:00:00Z'), source = 'https://fixtures.bienvu.example/vente';
  for (const agency of ['first-agency', 'second-agency']) {
    const at = new Date(now).toISOString();
    await DB.prepare('INSERT INTO agencies(id,owner_user_id,name,created_at,updated_at) VALUES(?,?,?,?,?)')
      .bind(agency, agency, agency, at, at).run();
  }
  // Fill the month to one remaining slot without exceeding any daily limit.
  let remaining=URL_IMPORT_QUOTAS.monthly-1;
  for (let day=1;remaining>0;day++) {
    const count=Math.min(remaining,URL_IMPORT_QUOTAS.daily);
    await DB.prepare('INSERT INTO import_usage(day,attempts) VALUES(?,?)')
      .bind(`2026-10-${String(day).padStart(2, '0')}`,count).run();
    remaining-=count;
  }
  const usage = () => DB.prepare("SELECT coalesce(sum(attempts),0) AS n FROM import_usage WHERE substr(day,1,7)='2026-10'").first<{n:number}>();
  assert.equal((await usage())?.n, URL_IMPORT_QUOTAS.monthly - 1);
  assert.equal((await generationRights(DB, 'first-agency', 'true', now)).importRetryAt, null);
  const attempts = await Promise.allSettled(['first-agency', 'second-agency'].map(agency =>
    beginImport(DB, agency, source, `last-monthly-slot-${agency}`, now)));
  assert.equal(attempts.filter(result => result.status === 'fulfilled').length, 1);
  const refused = attempts.find(result => result.status === 'rejected');
  assert.ok(refused?.status === 'rejected');
  assert.match(String(refused.reason), /IMPORT_LIMIT/);
  const winner = attempts.find(result => result.status === 'fulfilled');
  assert.ok(winner?.status === 'fulfilled');
  await failImport(DB, winner.value.row.agencyId, winner.value.row.id, 'SOURCE_BLOCKED', {});
  const replay = await beginImport(DB, winner.value.row.agencyId, source, `last-monthly-slot-${winner.value.row.agencyId}`, now);
  assert.equal(replay.fresh, false);
  assert.equal((await usage())?.n, URL_IMPORT_QUOTAS.monthly);
  assert.equal((await generationRights(DB, 'first-agency', 'true', now)).importRetryAt, '2026-11-01T00:00:00.000Z');
  await assert.rejects(beginImport(DB, 'first-agency', source, 'monthly-three-hundred-first', now + 86400_000), /IMPORT_LIMIT/);
  await beginManualImport(DB, 'first-agency', 'manual-monthly-quota-independent', '{}', 'a'.repeat(64), now);
  assert.equal((await usage())?.n, URL_IMPORT_QUOTAS.monthly);
  const nextMonth = Date.parse('2026-11-01T00:00:00Z');
  assert.equal((await generationRights(DB, 'first-agency', 'true', nextMonth)).importRetryAt, null);
  assert.equal((await beginImport(DB, 'first-agency', source, 'new-month-allowance', nextMonth)).fresh, true);
});
