import assert from 'node:assert/strict';
import {randomUUID, randomBytes, createHmac} from 'node:crypto';
import {mkdir, readFile, writeFile, unlink} from 'node:fs/promises';
import {resolve} from 'node:path';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import sharp from 'sharp';
import {localSecret} from './probe-common.mjs';

const run = promisify(execFile), root = process.cwd(), web = resolve(root, 'apps/web');
const base = 'http://localhost:8787', folder = resolve(root, 'evidence/local/sprint-02');
const fixturePath = resolve(folder, 'accounts-fixture.json');
await mkdir(folder, {recursive: true});
const sqlQuote = value => `'${String(value).replaceAll("'", "''")}'`;
async function sql(statement) {
  const path = resolve(folder, `${randomUUID()}.sql`);
  await writeFile(path, statement, {mode: 0o600});
  try {
    const {stdout} = await run('pnpm', ['exec', 'wrangler', 'd1', 'execute', 'DB', '--local', '--file', path, '--json'], {cwd: web, maxBuffer: 2 * 1024 * 1024});
    const results = JSON.parse(stdout);
    return results.at(-1)?.results ?? [];
  } catch {throw new Error('Échec D1 local ; détails masqués car le fichier peut contenir des sessions synthétiques.');}
  finally {await unlink(path);}
}
async function cleanup(users) {
  const ids = users.map(u => {assert.match(u.id, /^[0-9a-f-]{36}$/); return sqlQuote(u.id);}).join(',');
  const assets = await sql(`SELECT object_key FROM media_assets WHERE agency_id IN (SELECT id FROM agencies WHERE owner_user_id IN (${ids}));`);
  for (const {object_key: key} of assets) await run('pnpm', ['exec', 'wrangler', 'r2', 'object', 'delete', `bienvu-probes-local/${key}`, '--local'], {cwd: web});
  await sql(`UPDATE agencies SET logo_asset_id=NULL WHERE owner_user_id IN (${ids});
    DELETE FROM media_assets WHERE agency_id IN (SELECT id FROM agencies WHERE owner_user_id IN (${ids}));
    DELETE FROM agency_write_limits WHERE owner_user_id IN (${ids});
    DELETE FROM trial_claims WHERE owner_user_id IN (${ids});
    DELETE FROM agencies WHERE owner_user_id IN (${ids});
    DELETE FROM auth_user WHERE id IN (${ids});`);
}
if (process.argv.includes('--cleanup')) {
  const {users} = JSON.parse(await readFile(fixturePath, 'utf8'));
  await cleanup(users); await unlink(fixturePath); console.log('Comptes et logos synthétiques locaux supprimés.'); process.exit(0);
}
const secret = await localSecret('apps/web/.dev.vars', 'BETTER_AUTH_SECRET');
const users = ['A', 'B'].map(label => ({id: randomUUID(), label, token: randomBytes(32).toString('hex')}));
const cookie = user => `bienvu.session_token=${encodeURIComponent(`${user.token}.${createHmac('sha256', secret).update(user.token).digest('base64')}`)}`;
async function seedSession(user) {
  const now = Date.now();
  await sql(`INSERT INTO auth_session(id,expiresAt,token,createdAt,updatedAt,userId) VALUES(${sqlQuote(randomUUID())},${now + 3600000},${sqlQuote(user.token)},${now},${now},${sqlQuote(user.id)});`);
}
const report = {at: new Date().toISOString(), mode: 'local-workerd-d1-r2', identities: 'synthetic-direct-d1-fixtures', googleOAuth: 'not-tested', externalCalls: 0, checks: []};
function checked(name) {report.checks.push(name); console.log(`✓ ${name}`);}
async function request(path, user, method = 'GET', body, headers = {}) {
  return fetch(new URL(path, base), {method, redirect: 'manual', headers: {origin: base, ...(user ? {cookie: cookie(user)} : {}), ...headers},
    ...(body !== undefined ? {body: typeof body === 'string' || body instanceof Uint8Array ? body : JSON.stringify(body)} : {})});
}
async function json(path, user) {const response = await request(path, user); assert.equal(response.status, 200, path); return response.json();}
let keep = false;
try {
  const now = Date.now();
  await sql(users.map(u => `INSERT INTO auth_user(id,name,email,emailVerified,createdAt,updatedAt) VALUES(${sqlQuote(u.id)},${sqlQuote(`Agence synthétique ${u.label}`)},${sqlQuote(`${u.id}@example.com`)},1,${now},${now});`).join('\n'));
  for (const user of users) await seedSession(user);
  const [a,b] = users;
  assert.equal((await request('/api/me')).status, 401);
  assert.equal((await request('/api/agency', null, 'PUT', {}, {'Content-Type': 'application/json'})).status, 401);
  assert.equal((await request('/api/agency/logo', null, 'POST', '<svg/>', {'Content-Type': 'image/svg+xml'})).status, 401);
  checked('Routes compte, marque et upload refusées sans session');
  const repeats = await Promise.all(Array.from({length: 5}, () => json('/api/me', a)));
  assert.equal(new Set(repeats.map(r => r.agency.id)).size, 1);
  const firstA = repeats[0], firstB = await json('/api/me', b);
  assert.notEqual(firstA.agency.id, firstB.agency.id); assert.equal(firstA.rights.generationEnabled, false);
  const session = await json('/api/auth/get-session', a);
  assert.deepEqual(Object.keys(session.session), ['expiresAt']); assert.equal(session.user.id, a.id);
  assert.ok(!JSON.stringify(session).includes(a.token));
  checked('Session signée persistante, agence unique en concurrence, réponse sans jetons');
  const brand = {name: 'Agence des Tilleuls · test', primaryColor: '#214F43', secondaryColor: '#F3EFE6', email: 'contact@example.com', phone: '01 23 45 67 89', website: 'https://agence.example.com'};
  assert.equal((await request('/api/agency', a, 'PUT', {...brand, agencyId: firstB.agency.id}, {'Content-Type': 'application/json'})).status, 422);
  assert.equal((await request('/api/agency', a, 'PUT', brand, {'Content-Type': 'application/json', origin: 'https://evil.example.com'})).status, 403);
  assert.equal((await request('/api/agency', a, 'PUT', {...brand, name: '', email: null, phone: null, website: null}, {'Content-Type': 'application/json'})).status, 422);
  assert.equal((await request('/api/agency', a, 'PUT', brand, {'Content-Type': 'application/json'})).status, 200);
  assert.equal((await json('/api/me', a)).agency.name, brand.name);
  assert.deepEqual((await json('/api/me', b)).agency, firstB.agency);
  checked('Marque relue après sauvegarde, validation française, CSRF et identifiant d’agence forgé refusés');
  const raster = sharp({create: {width: 80, height: 40, channels: 4, background: '#214F43'}});
  const png = await raster.clone().png().toBuffer(), jpeg = await raster.clone().jpeg().toBuffer();
  const upload1 = await request('/api/agency/logo', a, 'POST', png, {'Content-Type': 'image/png'});
  assert.equal(upload1.status, 201, await upload1.clone().text());
  const logo1 = (await upload1.json()).agency.logoAssetId;
  const image = await request(`/api/agency/logo/${logo1}`, a);
  assert.equal(image.status, 200); assert.equal(image.headers.get('Content-Type'), 'image/png');
  assert.equal(image.headers.get('Cache-Control'), 'private, no-store');
  const original = Buffer.from(await image.arrayBuffer()); assert.equal((await sharp(original).metadata()).width, 80);
  assert.equal((await request(`/api/agency/logo/${logo1}`, b)).status, 404);
  assert.equal((await request(`/api/agency/logo/${logo1}`)).status, 401);
  checked('PNG décodé/réencodé dans workerd et livré depuis R2 privé ; accès B/visiteur refusés');
  const snapshot = JSON.stringify((await json('/api/me', a)).agency);
  const upload2 = await request('/api/agency/logo', a, 'POST', jpeg, {'Content-Type': 'image/jpeg'});
  assert.equal(upload2.status, 201);
  const logo2 = (await upload2.json()).agency.logoAssetId; assert.notEqual(logo2, logo1);
  assert.equal(JSON.parse(snapshot).logoAssetId, logo1);
  assert.deepEqual(Buffer.from(await (await request(`/api/agency/logo/${logo1}`, a)).arrayBuffer()), original);
  checked('JPEG normalisé ; remplacement versionné, ancienne copie de marque et ancien fichier conservés');
  for (const body of [Buffer.from('<svg onload="alert(1)"></svg>'), png.subarray(0, 40)])
    assert.equal((await request('/api/agency/logo', a, 'POST', body, {'Content-Type': 'image/png'})).status, 422);
  assert.equal((await request('/api/agency/logo', a, 'POST', new Uint8Array(2 * 1024 * 1024 + 1), {'Content-Type': 'image/png'})).status, 413);
  assert.equal((await json('/api/me', a)).agency.logoAssetId, logo2);
  checked('SVG déguisé, fichier tronqué et dépassement de poids refusés sans remplacer le logo');
  assert.equal((await request('/api/auth/sign-in/social', null, 'POST', {provider: 'google', callbackURL: 'https://evil.example.com'}, {'Content-Type': 'application/json'})).status, 422);
  assert.equal((await request('/api/auth/sign-in/email', null, 'POST', {}, {'Content-Type': 'application/json'})).status, 422);
  assert.equal((await request('/api/auth/get-access-token', a, 'POST', {}, {'Content-Type': 'application/json'})).status, 404);
  const invalidOAuth = await request('/api/auth/callback/google?state=forged&code=fixture');
  assert.equal(invalidOAuth.status, 302); assert.equal(new URL(invalidOAuth.headers.get('location')).pathname, '/connexion');
  assert.equal((await request('/api/generations', a, 'POST', {url: 'https://example.com'}, {'Content-Type': 'application/json'})).status, 503);
  checked('Retours arbitraires, endpoints hors périmètre et génération publique refusés');
  assert.equal((await request('/api/auth/sign-out', a, 'POST', {}, {'Content-Type': 'application/json', origin: 'https://evil.example.com'})).status, 403);
  const signOut = await request('/api/auth/sign-out', a, 'POST', {}, {'Content-Type': 'application/json'});
  assert.equal(signOut.status, 200); assert.match(signOut.headers.get('Set-Cookie') ?? '', /Max-Age=0/);
  assert.equal((await request('/api/me', a)).status, 401);
  checked('Déconnexion réelle, cookie expiré dans la réponse et session révoquée en D1');
  const agencies = (await sql(`SELECT id FROM agencies WHERE owner_user_id IN (${users.map(u=>sqlQuote(u.id)).join(',')})`)).map(a=>sqlQuote(a.id)).join(',');
  for (const table of ['allocations','jobs','cost_events']) assert.equal((await sql(`SELECT count(*) n FROM ${table} WHERE agency_id IN (${agencies});`))[0].n, 0);
  checked('Aucune allocation, génération ni consommation créée par la marque');
  if (process.argv.includes('--keep-fixtures')) {
    a.token = randomBytes(32).toString('hex'); await seedSession(a);
    await writeFile(fixturePath, JSON.stringify({users, cookie: cookie(a), base}, null, 2), {mode: 0o600});
    keep = true; checked('Fixtures locales conservées temporairement pour inspection UI, secret hors Git');
  }
  report.passed = true;
} finally {
  if (!keep) {await cleanup(users); report.cleaned = true;}
  await writeFile(resolve(folder, 'accounts-workerd.json'), JSON.stringify(report, null, 2));
}
console.log('Sonde comptes terminée ; Google OAuth réel reste à vérifier.');
