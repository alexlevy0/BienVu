// Recette opérateur explicite : quatre pages publiques, une tentative par cas,
// identités synthétiques isolées, compteurs et réservations jamais remboursés.
import assert from 'node:assert/strict';
import {randomUUID, randomBytes, createHash} from 'node:crypto';
import {readFile, writeFile, mkdir, unlink} from 'node:fs/promises';
import {createRequire} from 'node:module';
import {pathToFileURL} from 'node:url';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import sharp from 'sharp';
import {remoteSql} from './cloudflare-operator.mjs';

const base = 'https://bienvu.online', folder = 'evidence/remote/sprint-04';
const fixturePath = `${folder}/accounts-fixture.json`;
const samples = {
  figaro: 'https://immobilier.lefigaro.fr/annonces/annonce-109267703.html',
  seloger: 'https://www.seloger.com/annonce/achat/auvergne-rhone-alpes/rhone-69/lyon-69000/26M7SYHC5MVH',
  leboncoin: 'https://www.leboncoin.fr/ad/ventes_immobilieres/3222183771',
  bienici: 'https://www.bienici.com/annonce/vente/nice/appartement/2pieces/apimo-86775374',
};
const [step, name, ...extra] = process.argv.slice(2);
assert.ok(['init', 'import', 'cleanup'].includes(step) && !extra.length, 'Usage : init | import <portail> | cleanup');
assert.ok(step === 'import' ? Object.hasOwn(samples, name) : !name);
await mkdir(folder, {recursive: true});
const q = value => `'${String(value).replaceAll("'", "''")}'`;
const save = (file, value, flag = 'w') => writeFile(`${folder}/${file}.json`, JSON.stringify(value, null, 2), {flag, mode: 0o600});
const config = JSON.parse(await readFile('apps/web/wrangler.staging.jsonc', 'utf8'));
assert.equal(config.name, 'bienvu-web-probe-staging');
assert.equal(config.vars.BETTER_AUTH_URL, base);
assert.equal(config.vars.GENERATIONS_ENABLED, 'false');
assert.equal(config.d1_databases[0].database_id, '0219384e-d439-4421-840e-32c551afdb0d');
const request = (path, user, method = 'GET', body, headers = {}) => fetch(`${base}${path}`, {
  method, redirect: 'manual', signal: AbortSignal.timeout(85_000),
  headers: {origin: base, ...(user ? {cookie: user.cookie} : {}),
    ...(body === undefined ? {} : {'Content-Type': 'application/json'}), ...headers},
  ...(body === undefined ? {} : {body: JSON.stringify(body)}),
});
const usage = () => remoteSql('SELECT day,attempts FROM import_usage ORDER BY day');
const budget = () => remoteSql(`SELECT month,baseline_cents,ceiling_cents,paused,
  (SELECT coalesce(sum(reserved_cents),0) FROM hosted_import_costs c WHERE c.month=b.month) reserved_cents
  FROM hosted_import_budget b ORDER BY month`);

if (step === 'init') {
  const now = Date.now();
  const users = ['A', 'B'].map(label => ({id: randomUUID(), label, password: randomBytes(32).toString('base64url'), cookie: ''}));
  for (const user of users) user.email = `${user.id}@example.invalid`;
  // Journaliser les IDs avant la première écriture pour permettre un nettoyage exact.
  await writeFile(fixturePath, JSON.stringify({base, users}), {flag: 'wx', mode: 0o600});
  const require = createRequire(new URL('../apps/web/package.json', import.meta.url));
  const {hashPassword} = await import(pathToFileURL(require.resolve('better-auth/crypto')).href);
  for (const user of users) {
    const hash = await hashPassword(user.password);
    await remoteSql(`INSERT INTO auth_user(id,name,email,emailVerified,createdAt,updatedAt) VALUES(
      ${q(user.id)},${q(`Recette portails ${user.label}`)},${q(user.email)},1,${now},${now});
      INSERT INTO auth_account(id,accountId,providerId,userId,password,createdAt,updatedAt) VALUES(
      ${q(randomUUID())},${q(user.id)},'credential',${q(user.id)},${q(hash)},${now},${now});`);
    const res = await request('/api/auth/sign-in/email', null, 'POST', {email: user.email, password: user.password});
    assert.equal(res.status, 200, 'Connexion synthétique');
    user.cookie = (res.headers.get('set-cookie') ?? '').split(';')[0];
    assert.ok(user.cookie.includes('session_token='));
    const me = await request('/api/me', user); assert.equal(me.status, 200);
    const data = await me.json(); user.agencyId = data.agency.id;
    assert.equal(data.rights.generationEnabled, false);
  }
  assert.notEqual(users[0].agencyId, users[1].agencyId);
  await writeFile(fixturePath, JSON.stringify({base, users}), {mode: 0o600});
  await save('before', {at: new Date().toISOString(), usage: await usage(), budget: await budget()});
  console.log('Deux comptes synthétiques préparés, génération désactivée, aucun e-mail envoyé.');
} else {
  const state = JSON.parse(await readFile(fixturePath, 'utf8'));
  assert.equal(state.base, base);
  const [a, b] = state.users;
  if (step === 'cleanup') {
    const ids = state.users.map(u => {assert.match(u.id, /^[0-9a-f-]{36}$/); return q(u.id);}).join(',');
    const scope = `agency_id IN (SELECT id FROM agencies WHERE owner_user_id IN (${ids}))`;
    const active = await remoteSql(`SELECT id FROM listing_imports WHERE ${scope} AND status='importing'`);
    assert.equal(active.length, 0, 'Attendre la fin des imports avant nettoyage');
    const beforeUsage = await usage(), beforeBudget = await budget();
    for (const {object_key} of await remoteSql(`SELECT object_key FROM import_objects WHERE ${scope}`)) {
      assert.ok(state.users.some(u => object_key.startsWith(`agencies/${u.agencyId}/imports/`)));
      await promisify(execFile)('pnpm', ['exec', 'wrangler', 'r2', 'object', 'delete',
        `${config.r2_buckets[0].bucket_name}/${object_key}`, '--remote', '--config', 'apps/web/wrangler.staging.jsonc']);
    }
    await remoteSql(`UPDATE listing_imports SET status='deleting' WHERE ${scope};
      DELETE FROM listing_imports WHERE ${scope};
      DELETE FROM trial_claims WHERE owner_user_id IN (${ids});
      DELETE FROM agency_write_limits WHERE owner_user_id IN (${ids});
      DELETE FROM allocations WHERE ${scope};
      DELETE FROM agencies WHERE owner_user_id IN (${ids});
      DELETE FROM auth_user WHERE id IN (${ids});`);
    assert.deepEqual(await usage(), beforeUsage);
    assert.deepEqual(await budget(), beforeBudget);
    assert.equal((await remoteSql(`SELECT id FROM auth_user WHERE id IN (${ids})`)).length, 0);
    await save('cleanup', {at: new Date().toISOString(), fixtureAccountsRemoved: 2,
      usage: beforeUsage, budget: beforeBudget, countersAndReservationsPreserved: true});
    await unlink(fixturePath);
    console.log('Données de recette supprimées ; compteurs et réservations conservés.');
  } else {
    const at = new Date().toISOString(), beforeUsage = await usage();
    const current = (await budget()).find(x => x.month === at.slice(0, 7));
    assert.ok(current && current.paused === 0 && current.baseline_cents + current.reserved_cents + 50 <= current.ceiling_cents, 'Budget indisponible');
    const report = {at, source: 'real-public-portal', runtime: 'cloudflare-worker-container-browser-run',
      url: samples[name], name, idempotencyKey: randomUUID(), beforeUsage, attempted: true};
    await save(`import-${name}`, report, 'wx'); // Même un échec interdit une relance involontaire.
    const started = Date.now();
    const response = await request('/api/imports', a, 'POST', {url: samples[name]}, {'Idempotency-Key': report.idempotencyKey});
    const value = await response.json();
    Object.assign(report, {httpStatus: response.status, durationMs: Date.now() - started, result: value});
    await save(`import-${name}`, report);
    assert.equal(response.status, 200);
    assert.ok(['failed', 'ready'].includes(value.status));
    assert.equal((await request(`/api/imports/${value.id}`, b)).status, 404);
    assert.equal((await request(`/api/imports/${value.id}`, null)).status, 401);
    const reread = await (await request(`/api/imports/${value.id}`, a)).json();
    assert.deepEqual(reread, value);
    if (value.status === 'ready') {
      assert.ok(value.listing.photos.length >= 3);
      for (const photo of value.listing.photos) {
        const path = `/api/imports/${value.id}/photos/${photo.id}`;
        assert.equal((await request(path, b)).status, 404);
        const res = await request(path, a); assert.equal(res.status, 200);
        const bytes = Buffer.from(await res.arrayBuffer());
        assert.equal(createHash('sha256').update(bytes).digest('hex'), photo.contentHash);
        const meta = await sharp(bytes).metadata(); assert.equal(meta.format, 'jpeg'); assert.equal(meta.exif, undefined);
        assert.ok(meta.width >= 640 && meta.width <= 2048);
        if (photo.sourceOrder < 3) await writeFile(`${folder}/${name}-${photo.sourceOrder}.jpg`, bytes);
      }
    } else {assert.ok(value.errorCode); assert.equal(value.listing, null);}
    const afterUsage = await usage();
    const replay = await request('/api/imports', a, 'POST', {url: samples[name]}, {'Idempotency-Key': report.idempotencyKey});
    assert.equal((await replay.json()).id, value.id);
    assert.deepEqual(await usage(), afterUsage);
    const [stored] = await remoteSql(`SELECT diagnostics_json FROM listing_imports WHERE id=${q(value.id)}`);
    Object.assign(report, {diagnostics: JSON.parse(stored.diagnostics_json), afterUsage, budget: await budget(),
      checks: ['session-and-other-agency-denied', 'private-result-readback', 'idempotent-replay-no-extra-quota', ...(value.status === 'ready' ? ['private-jpeg-sha256-readback'] : [])]});
    await save(`import-${name}`, report);
    console.log({name, status: value.status, errorCode: value.errorCode, durationMs: report.durationMs, diagnostics: report.diagnostics});
  }
}
