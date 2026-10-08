// Explicit operator acceptance: actual public listings through the deployed importer.
// Closed sample, one attempt per URL, sequential requests, no generation or email.
// Never reset import counters, change limits, or release incurred provisions.
import assert from 'node:assert/strict';
import {URL_IMPORT_QUOTAS} from '../packages/contracts/src/import-quotas.ts';
import {randomUUID, randomBytes, createHash} from 'node:crypto';
import {mkdir, readFile, writeFile, access, unlink} from 'node:fs/promises';
import {createRequire} from 'node:module';
import {pathToFileURL} from 'node:url';
import sharp from 'sharp';
import {remoteSql} from './cloudflare-operator.mjs';

const base = 'https://bienvu.online';
const samples = JSON.parse(await readFile(new URL('./source-coverage-samples.json', import.meta.url), 'utf8'));
const day = new Date().toISOString().slice(0, 10), month = day.slice(0, 7);
const folder = `evidence/remote/source-coverage-${day.replaceAll('-', '')}`;
const fixturePath = `${folder}/identity.json`;
const [step, name, ...extra] = process.argv.slice(2);
assert.ok(['init', 'all', 'import', 'cleanup'].includes(step) && !extra.length);
assert.ok(step === 'import' ? samples.some(s => s.id === name) : !name);
await mkdir(folder, {recursive: true});
const q = value => `'${String(value).replaceAll("'", "''")}'`;
const save = (file, value, flag = 'w') => writeFile(`${folder}/${file}.json`, JSON.stringify(value, null, 2), {flag, mode: 0o600});
const exists = async path => {try {await access(path); return true;} catch (error) {if (error.code === 'ENOENT') return false; throw error;}};
const config = JSON.parse(await readFile('apps/web/wrangler.staging.jsonc', 'utf8'));
assert.equal(config.name, 'bienvu-web-probe-staging');
assert.equal(config.vars.BETTER_AUTH_URL, base);
assert.equal(config.d1_databases[0].database_id, '0219384e-d439-4421-840e-32c551afdb0d');
let user = await exists(fixturePath) ? JSON.parse(await readFile(fixturePath, 'utf8')) : null;
const request = (path, method = 'GET', body, authenticated = true, headers = {}) => fetch(base + path, {
  method, redirect: 'manual', signal: AbortSignal.timeout(85_000),
  headers: {origin: base, ...(authenticated && user ? {cookie: user.cookie ?? ''} : {}),
    ...(body === undefined ? {} : {'Content-Type': 'application/json'}), ...headers},
  ...(body === undefined ? {} : {body: JSON.stringify(body)}),
});
const allowance = async () => {
  const [usage] = await remoteSql(`SELECT coalesce(sum(attempts),0) AS monthly,
    coalesce(sum(IIF(day=${q(day)},attempts,0)),0) AS daily FROM import_usage WHERE substr(day,1,7)=${q(month)}`);
  const [budget] = await remoteSql(`SELECT baseline_cents,ceiling_cents,paused,
    (SELECT coalesce(sum(reserved_cents),0) FROM hosted_import_costs c WHERE c.month=b.month) AS reserved_cents
    FROM hosted_import_budget b WHERE month=${q(month)}`);
  assert.ok(budget);
  return {usage, budget};
};

if (step === 'init') {
  assert.equal(user, null, 'Existing fixture: reuse it, never create duplicate identities.');
  const before = await allowance();
  // Leave at least four imports for normal customer activity today.
  assert.ok(before.usage.daily + samples.length <= 16 && before.usage.monthly + samples.length <= URL_IMPORT_QUOTAS.monthly, 'IMPORT_ALLOWANCE_REQUIRED');
  assert.ok(before.budget.paused === 0 && before.budget.baseline_cents + before.budget.reserved_cents + 50 * samples.length <= before.budget.ceiling_cents, 'IMPORT_BUDGET_REQUIRED');
  user = {id: randomUUID(), password: randomBytes(32).toString('base64url')};
  user.email = `source-coverage-${user.id}@example.invalid`;
  await writeFile(fixturePath, JSON.stringify(user), {flag: 'wx', mode: 0o600});
  const require = createRequire(new URL('../apps/web/package.json', import.meta.url));
  const {hashPassword} = await import(pathToFileURL(require.resolve('better-auth/crypto')).href);
  const hash = await hashPassword(user.password), now = Date.now();
  await remoteSql(`INSERT INTO auth_user(id,name,email,emailVerified,createdAt,updatedAt) VALUES(
    ${q(user.id)},'Vérification des sources (compte technique)',${q(user.email)},1,${now},${now});
    INSERT INTO auth_account(id,accountId,providerId,userId,password,createdAt,updatedAt) VALUES(
    ${q(randomUUID())},${q(user.id)},'credential',${q(user.id)},${q(hash)},${now},${now});`);
  const res = await request('/api/auth/sign-in/email', 'POST', {email: user.email, password: user.password}, false);
  assert.equal(res.status, 200, 'Fixture sign-in');
  user.cookie = (res.headers.get('set-cookie') ?? '').split(';')[0];
  assert.ok(user.cookie.includes('session_token='));
  const me = await request('/api/me'); assert.equal(me.status, 200);
  user.agencyId = (await me.json()).agency.id;
  await remoteSql(`UPDATE agencies SET name='Vérification des sources (compte technique)' WHERE id=${q(user.agencyId)} AND owner_user_id=${q(user.id)}`);
  await writeFile(fixturePath, JSON.stringify(user), {mode: 0o600});
  await save('before', {at: new Date().toISOString(), ...before});
  console.log(`Compte technique isolé prêt ; ${samples.length} annonces, aucune génération.`);
} else {
  assert.ok(user?.agencyId, 'Run init first.');
  if (step === 'cleanup') {
    const before = await allowance();
    const active = await remoteSql(`SELECT id FROM listing_imports WHERE agency_id=${q(user.agencyId)} AND status='importing'`);
    assert.equal(active.length, 0, 'Do not interrupt active imports.');
    for (const row of await remoteSql(`SELECT id FROM listing_imports WHERE agency_id=${q(user.agencyId)}`)) {
      const deleted = await request(`/api/imports/${row.id}`, 'DELETE');
      assert.ok([200, 404].includes(deleted.status), 'Temporary import cleanup (or concurrent scheduled purge)');
      assert.equal((await remoteSql(`SELECT id FROM listing_imports WHERE agency_id=${q(user.agencyId)} AND id=${q(row.id)}`)).length, 0);
    }
    const [counts] = await remoteSql(`SELECT (SELECT count(*) FROM import_objects WHERE agency_id=${q(user.agencyId)}) AS objects,
      (SELECT count(*) FROM generation_runs WHERE agency_id=${q(user.agencyId)}) AS generations`);
    assert.deepEqual(counts, {objects: 0, generations: 0});
    // Owner/member invariants intentionally keep the technical owner record.
    // Remove all credentials and sessions; never disable the owner protection.
    await remoteSql(`DELETE FROM auth_session WHERE userId=${q(user.id)}; DELETE FROM auth_account WHERE userId=${q(user.id)}`);
    assert.deepEqual(await allowance(), before);
    await save('cleanup', {at: new Date().toISOString(), importedMediaRemoved: true, credentialsRevoked: true,
      technicalOwnerRecordRetained: true, videoGenerations: 0, countersAndProvisionsPreserved: true, ...before});
    await unlink(fixturePath);
    console.log('Médias temporaires supprimés et connexion technique révoquée.');
  } else {
    for (const sample of step === 'all' ? samples : samples.filter(s => s.id === name)) {
      const file = `import-${sample.id}`;
      if (await exists(`${folder}/${file}.json`)) {console.log(`${sample.name}: tentative déjà journalisée, ignorée.`); continue;}
      const before = await allowance();
      assert.ok(before.usage.daily < 16 && before.usage.monthly < URL_IMPORT_QUOTAS.monthly, 'IMPORT_ALLOWANCE_REQUIRED');
      assert.ok(before.budget.paused === 0 && before.budget.baseline_cents + before.budget.reserved_cents + 50 <= before.budget.ceiling_cents, 'IMPORT_BUDGET_REQUIRED');
      const report = {...sample, at: new Date().toISOString(), environment: 'cloudflare', idempotencyKey: randomUUID(), before};
      await save(file, report, 'wx');
      const start = Date.now();
      const response = await request('/api/imports', 'POST', {url: sample.url}, true, {'Idempotency-Key': report.idempotencyKey});
      const value = await response.json();
      Object.assign(report, {httpStatus: response.status, durationMs: Date.now() - start, result: value});
      await save(file, report);
      assert.equal(response.status, 200, 'Completed HTTP import response');
      assert.ok(['ready', 'needs_input', 'failed'].includes(value.status));
      const readback = await request(`/api/imports/${value.id}`); assert.equal(readback.status, 200);
      assert.deepEqual(await readback.json(), value);
      assert.equal((await request(`/api/imports/${value.id}`, 'GET', undefined, false)).status, 401);
      const photos = value.listing?.photos ?? value.draft?.photos ?? [];
      for (const photo of photos) {
        const media = await request(`/api/imports/${value.id}/photos/${photo.id}`); assert.equal(media.status, 200);
        const bytes = Buffer.from(await media.arrayBuffer());
        assert.equal(createHash('sha256').update(bytes).digest('hex'), photo.contentHash);
        const meta = await sharp(bytes).metadata(); assert.equal(meta.format, 'jpeg'); assert.equal(meta.exif, undefined);
        assert.ok(meta.width >= 640 && meta.width <= 2048);
      }
      const [stored] = await remoteSql(`SELECT diagnostics_json FROM listing_imports WHERE id=${q(value.id)} AND agency_id=${q(user.agencyId)}`);
      Object.assign(report, {photoCount: photos.length, diagnostics: stored.diagnostics_json ? JSON.parse(stored.diagnostics_json) : null,
        checks: ['authenticated-private-readback', 'anonymous-read-denied', ...(photos.length ? ['private-jpeg-sha256-readback'] : [])]});
      await save(file, report);
      // The importer deliberately waits five minutes after its write lease before
      // purging objects. A 409 here defers cleanup; it is not an import failure.
      const deleted = await request(`/api/imports/${value.id}`, 'DELETE');
      assert.ok([200, 409].includes(deleted.status), 'Temporary listing and media cleanup');
      report.cleaned = deleted.status === 200; await save(file, report);
      console.log(`${sample.name}: ${value.status}, ${photos.length} photos, ${value.errorCode ?? 'sans erreur'}, ${report.durationMs} ms.`);
    }
  }
}
