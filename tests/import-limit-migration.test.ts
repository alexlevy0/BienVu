import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile, readdir} from 'node:fs/promises';
import {Miniflare, convertV4MiniflareOptions} from 'miniflare';
import {beginImport, failImport} from '../packages/db/src/imports';

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
  const before = (await usage()).results;
  await assert.rejects(beginImport(DB, 'quota-agency', source, 'before-migration-key', now), /IMPORT_LIMIT/);
  await migrate('0010_imports_daily_limit.sql');
  assert.deepEqual((await usage()).results, before);
  for (let attempt = 6; attempt <= 10; attempt++) {
    const key = `quota-migration-${attempt}`;
    const accepted = await beginImport(DB, 'quota-agency', source, key, now);
    assert.equal(accepted.fresh, true);
    await failImport(DB, 'quota-agency', accepted.row.id, 'SOURCE_BLOCKED', {});
    const replay = await beginImport(DB, 'quota-agency', source, key, now);
    assert.equal(replay.fresh, false);
    assert.equal(replay.row.id, accepted.row.id);
  }
  assert.deepEqual((await usage()).results, [{day: '2026-09-27', attempts: 20}, {day: '2026-09-28', attempts: 10}]);
  await assert.rejects(beginImport(DB, 'quota-agency', source, 'eleventh-daily-attempt', now), /IMPORT_LIMIT/);
  await assert.rejects(beginImport(DB, 'quota-agency', source, 'thirty-first-monthly-attempt', now + 86400_000), /IMPORT_LIMIT/);
  assert.deepEqual((await usage()).results, [{day: '2026-09-27', attempts: 20}, {day: '2026-09-28', attempts: 10}]);
});
