import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Miniflare, convertV4MiniflareOptions } from 'miniflare';
import { adminPerformance } from '../packages/db/src/admin-performance';
import { AdminPerformanceQuery } from '../packages/contracts/src/admin';

test('Performance : fenêtres UTC, moyenne pondérée, jours sans mesure et événement ready immuable', async (t) => {
  const mf = new Miniflare(
    convertV4MiniflareOptions({
      modules: true,
      script: 'export default {fetch(){return new Response("fixture")}}',
      compatibilityDate: '2026-09-27',
      d1Databases: ['DB'],
    }),
  );
  t.after(() => mf.dispose());
  const db = await mf.getD1Database('DB');
  await db.exec(
    'CREATE TABLE jobs(id TEXT PRIMARY KEY,status TEXT,created_at TEXT,updated_at TEXT); CREATE TABLE generation_events(job_id TEXT,event TEXT,created_at TEXT,PRIMARY KEY(job_id,event)); CREATE INDEX jobs_admin_created ON jobs(created_at DESC,id DESC);',
  );
  const now = Date.parse('2026-10-11T12:00:00Z');
  const seed = async (id: string, created: string, seconds: number | null, status = 'ready') => {
    await db.prepare('INSERT INTO jobs VALUES(?,?,?,?)').bind(id, status, created, new Date(now).toISOString()).run();
    if (seconds !== null)
      await db
        .prepare("INSERT INTO generation_events VALUES(?,'ready',?)")
        .bind(id, new Date(Date.parse(created) + seconds * 1000).toISOString())
        .run();
  };
  await seed('a', '2026-10-09T10:00:00Z', 60);
  await seed('b', '2026-10-09T11:00:00Z', 180);
  await seed('c', '2026-10-10T10:00:00Z', 600);
  await seed('missing', '2026-10-11T08:00:00Z', null);
  await seed('negative', '2026-10-11T09:00:00Z', -5);
  await seed('zero', '2026-10-11T10:00:00Z', 0);
  await seed('failed', '2026-10-11T10:00:00Z', 10, 'failed');
  await seed('active', '2026-10-11T10:00:00Z', 20, 'rendering');
  await seed('older', '2026-10-01T10:00:00Z', 90);
  await seed('future', '2026-10-12T10:00:00Z', 30);
  await seed('outside', '2020-01-01T00:00:00Z', 500);
  const seven = await adminPerformance(db, 7, now);
  assert.equal(seven.from, '2026-10-05');
  assert.equal(seven.until, '2026-10-11');
  assert.equal(seven.daily.length, 7);
  assert.equal(seven.ready, 6);
  assert.equal(seven.measuredReady, 4);
  assert.equal(seven.averageSeconds, 210, 'Mean of video durations, not mean of daily means');
  assert.deepEqual(seven.daily[0], {
    day: '2026-10-05',
    ready: 0,
    measuredReady: 0,
    averageSeconds: null,
    minSeconds: null,
    maxSeconds: null,
  });
  assert.deepEqual(seven.daily[4], {
    day: '2026-10-09',
    ready: 2,
    measuredReady: 2,
    averageSeconds: 120,
    minSeconds: 60,
    maxSeconds: 180,
  });
  assert.deepEqual(seven.daily[6], {
    day: '2026-10-11',
    ready: 3,
    measuredReady: 1,
    averageSeconds: 0,
    minSeconds: 0,
    maxSeconds: 0,
  });
  await db.prepare('UPDATE jobs SET updated_at=?').bind('2030-01-01T00:00:00Z').run();
  assert.deepEqual(await adminPerformance(db, 7, now), seven);
  const thirty = await adminPerformance(db, 30, now);
  assert.equal(thirty.measuredReady, 5);
  assert.equal(thirty.averageSeconds, 186);
  const ninety = await adminPerformance(db, 90, now);
  assert.equal(ninety.daily.length, 90);
  assert.equal(ninety.ready, 7);
  const empty = await adminPerformance(db, 7, Date.parse('2019-01-01T00:00:00Z'));
  assert.equal(empty.measuredReady, 0);
  assert.equal(empty.averageSeconds, null);
  for (const value of ['365', '-1', '0', '30.5'])
    assert.equal(AdminPerformanceQuery.safeParse({ section: 'performance', days: value }).success, false);
  assert.equal(
    AdminPerformanceQuery.safeParse({ section: 'performance', days: '30', agency: 'private' }).success,
    false,
  );
});
