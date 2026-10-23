import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Miniflare, convertV4MiniflareOptions } from 'miniflare';
import { migrateNarrationProbe } from '../scripts/narration-fixtures';
import { referrerDomain, collectSeo, seoSummary, purgeSeo } from '../apps/web/lib/seo-analytics';

const origin = 'https://bienvu.online';
test('Domaines référents : hôte normalisé sans chemin, paramètres, port, IP ou identifiants', () => {
  assert.equal(
    referrerDomain('https://user:password@WWW.PARTENAIRE.FR:8443/dossier?email=private@example.com#secret', origin),
    'partenaire.fr',
  );
  assert.equal(referrerDomain('https://Partenaire.fr./secret', origin), 'partenaire.fr');
  assert.equal(referrerDomain('https://école.fr/secret', origin), 'xn--cole-9oa.fr');
  for (const referrer of [
    null,
    '',
    'not-a-url',
    'javascript:alert(1)',
    'ftp://other.example',
    'https://127.0.0.1/secret',
    'https://192.168.1.1/private',
    'https://[::1]/secret',
    'https://localhost/secret',
    'https://crm.local/secret',
    'https://private.internal/secret',
    origin + '/secret',
    'https://www.google.fr/search?q=secret',
    'https://l.facebook.com/private',
  ])
    assert.equal(referrerDomain(referrer, origin), null, referrer ?? 'null');
});

test('Référents D1 : agrégation concurrente, anciens totaux séparés, cardinalité bornée et purge', async (t) => {
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
  await migrateNarrationProbe(db);
  const tasks: Promise<unknown>[] = [],
    env = { DB: db, BETTER_AUTH_URL: origin, TRAFFIC_ENABLED: 'true' },
    ctx = {
      waitUntil(task: Promise<unknown>) {
        tasks.push(task);
      },
    },
    day = new Date().toISOString().slice(0, 10);
  const collect = (referrer: string, overrides: Record<string, string> = {}) =>
    collectSeo(
      new Request(origin + '/', { headers: { 'User-Agent': 'Mozilla/5.0', Referer: referrer, ...overrides } }),
      new Response('public', { headers: { 'Content-Type': 'text/html' } }),
      env,
      ctx,
    );
  await db.prepare("INSERT INTO seo_views_daily VALUES(?,'/','other',7)").bind(day).run();
  for (let i = 0; i < 12; i++) collect('https://www.partenaire.fr/private?email=secret');
  collect('https://annuaire.example/secret');
  collect('https://127.0.0.1/secret');
  collect('https://excluded.example/secret', { 'User-Agent': 'Googlebot' });
  collect('https://prefetch.example/secret', { 'next-router-prefetch': '1' });
  await Promise.all(tasks);
  const summary = await seoSummary(db, true);
  assert.equal(summary.channels[0].views, 21);
  assert.deepEqual(summary.referrers.rows, [
    { host: 'partenaire.fr', views: 12 },
    { host: 'annuaire.example', views: 1 },
  ]);
  assert.equal(summary.referrers.unidentifiedViews, 8);
  assert.equal(summary.referrers.knownViews, 13);
  assert.equal(summary.referrers.hiddenViews, 0);
  assert.equal(summary.referrers.firstDay, day);
  assert.doesNotMatch(
    JSON.stringify(summary),
    /secret|email=|127\.0\.0\.1|\/private|excluded\.example|prefetch\.example/,
  );
  for (let i = 0; i < 98; i++)
    await db.prepare('INSERT INTO seo_referrers_daily VALUES(?,?,1)').bind(day, `site-${i}.example`).run();
  collect('https://over-limit.example/secret');
  collect('https://www.partenaire.fr/other');
  await Promise.all(tasks);
  assert.equal(
    (await db.prepare('SELECT count(*) AS n FROM seo_referrers_daily WHERE day=?').bind(day).first<{ n: number }>())?.n,
    100,
  );
  assert.equal(
    (
      await db
        .prepare("SELECT views FROM seo_referrers_daily WHERE day=? AND host='partenaire.fr'")
        .bind(day)
        .first<{ views: number }>()
    )?.views,
    13,
  );
  assert.equal(await db.prepare("SELECT host FROM seo_referrers_daily WHERE host='over-limit.example'").first(), null);
  const columns = (await db.prepare('PRAGMA table_info(seo_referrers_daily)').all<{ name: string }>()).results.map(
    (row: { name: string }) => row.name,
  );
  assert.deepEqual(columns, ['day', 'host', 'views']);
  await db.prepare("INSERT INTO seo_referrers_daily VALUES('2020-01-01','old.example',10)").run();
  await purgeSeo(db);
  assert.equal(await db.prepare("SELECT host FROM seo_referrers_daily WHERE day='2020-01-01'").first(), null);
});
