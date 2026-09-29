import assert from 'node:assert/strict';
import {randomUUID, randomBytes, createHmac} from 'node:crypto';
import {spawn} from 'node:child_process';
import {readFile, writeFile, mkdir, unlink} from 'node:fs/promises';
import {resolve} from 'node:path';
import sharp from 'sharp';
import {localSql, sqlQuote as q, localFolder, importLocalSecret, deleteLocalObject} from './local-import-db';
import type {NormalizedListing} from '../packages/contracts/src/index';

type User = {id: string; token: string};
const fixturePath = resolve(localFolder, 'imports-fixture.json'), base = 'http://localhost:8787';
async function cleanup(users: User[]) {
  const ids = users.map(u => q(u.id)).join(',');
  const where = `agency_id IN (SELECT id FROM agencies WHERE owner_user_id IN (${ids}))`;
  for (const row of await localSql<{object_key: string}>(`SELECT object_key FROM import_objects WHERE ${where};`)) await deleteLocalObject(row.object_key);
  // La sonde ne rend que les tentatives de ses identités synthétiques. La purge
  // produit, elle, ne rembourse jamais le compteur d'import.
  const amount = `(SELECT count(*) FROM listing_imports WHERE ${where} AND substr(created_at,1,10)=import_usage.day)`;
  await localSql(`DELETE FROM import_usage WHERE attempts=${amount} AND ${amount}>0;
    UPDATE import_usage SET attempts=attempts-${amount} WHERE ${amount}>0 AND attempts>${amount};`);
  await localSql(`UPDATE listing_imports SET status='deleting' WHERE ${where}; DELETE FROM listing_imports WHERE ${where};
    DELETE FROM trial_claims WHERE owner_user_id IN (${ids}); DELETE FROM agencies WHERE owner_user_id IN (${ids});
    DELETE FROM auth_user WHERE id IN (${ids});`);
}
if (process.argv.includes('--cleanup')) {
  const {users} = JSON.parse(await readFile(fixturePath, 'utf8')) as {users: User[]};
  await cleanup(users); await unlink(fixturePath);
  const reportPath = resolve(localFolder, 'http-report.json');
  const saved = JSON.parse(await readFile(reportPath, 'utf8')) as Record<string, unknown>;
  await writeFile(reportPath, JSON.stringify({...saved, fixturesRetainedForUI: false, cleanedAt: new Date().toISOString()}, null, 2));
  console.log('Fixtures d’import supprimées.'); process.exit(0);
}
await mkdir(localFolder, {recursive: true});
const users = ['a', 'b'].map(() => ({id: randomUUID(), token: randomBytes(32).toString('hex')}));
const secret = await importLocalSecret('BETTER_AUTH_SECRET');
const cookie = (u: User) => `bienvu.session_token=${encodeURIComponent(`${u.token}.${createHmac('sha256', secret).update(u.token).digest('base64')}`)}`;
const bridge = spawn(process.execPath, ['--import', 'tsx', 'scripts/serve-imports.ts', '--fixtures', ...(process.argv.includes('--diagnostics') ? ['--diagnostics'] : [])], {stdio: ['ignore', 'pipe', 'pipe']});
if (process.argv.includes('--diagnostics')) bridge.stdout.on('data', data => {if (String(data).includes('bridge_response')) process.stdout.write(data);});
const ready = new Promise<void>((resolve, reject) => {bridge.stdout.on('data', d => {if (String(d).includes('prêt')) resolve();}); bridge.once('exit', () => reject(new Error('Le transport de recette ne démarre pas. Vérifier que 8791 est libre.')));});
const report = {at: new Date().toISOString(), mode: 'local-workerd-http', isolatedStorage: Boolean(process.env.BIENVU_LOCAL_STATE), sourceContent: 'synthetic-fixtures-only', networkCallsToAgencies: 0, checks: [] as string[]};
const checked = (value: string) => {report.checks.push(value); console.log(`✓ ${value}`);};
async function request(path: string, user?: User, method = 'GET', body?: unknown, extra: Record<string, string> = {}) {
  return fetch(new URL(path, base), {method, redirect: 'manual', headers: {origin: base, ...(user ? {cookie: cookie(user)} : {}),
    ...(body === undefined ? {} : {'Content-Type': 'application/json'}), ...extra}, ...(body === undefined ? {} : {body: JSON.stringify(body)})});
}
let keep = false;
try {
  await ready;
  const now = Date.now();
  await localSql(users.map(u => `INSERT INTO auth_user(id,name,email,emailVerified,createdAt,updatedAt) VALUES(${q(u.id)},'Recette import',${q(`${u.id}@example.com`)},1,${now},${now});
    INSERT INTO auth_session(id,expiresAt,token,createdAt,updatedAt,userId) VALUES(${q(randomUUID())},${now + 3600000},${q(u.token)},${now},${now},${q(u.id)});`).join('\n'));
  const [a, b] = users;
  for (const user of users) assert.equal((await request('/api/me', user)).status, 200);
  assert.equal((await request('/api/imports')).status, 401);
  assert.equal((await request('/api/imports', undefined, 'POST', {url: 'https://fixtures.bienvu.example/vente'})).status, 401);
  assert.equal((await request('/api/imports', a, 'POST', {url: 'https://fixtures.bienvu.example/vente'}, {origin: 'https://evil.example'})).status, 403);
  assert.equal((await request('/api/imports', a, 'POST', {url: 'https://127.0.0.1/private'})).status, 422);
  assert.equal((await request('/api/imports', a, 'POST', {url: 'https://fixtures.bienvu.example/vente', agencyId: 'forged'})).status, 422);
  checked('Session, CSRF, URL privée et identité d’agence imposées par le serveur');
  const key = randomUUID(), body = {url: 'https://fixtures.bienvu.example/doublons'};
  const response = await request('/api/imports', a, 'POST', body, {'Idempotency-Key': key});
  assert.equal(response.status, 200);
  const result = await response.json() as {id: string; status: string; errorCode?: string; listing: NormalizedListing};
  if (result.status !== 'ready') {
    const diagnostics = await localSql<{diagnostics: string}>(`SELECT diagnostics_json AS diagnostics FROM listing_imports WHERE id=${q(result.id)};`);
    console.log('Échec de la fixture HTTP :', result.errorCode, diagnostics[0]?.diagnostics);
  }
  assert.equal(result.status, 'ready'); assert.equal(result.listing.photos.length, 3);
  assert.equal(result.listing.description?.text, 'Séjour lumineux et cuisine ouverte.\n\nDeux chambres donnent sur une cour calme.');
  assert.equal(response.headers.get('Cache-Control'), 'private, no-store');
  const again = await request('/api/imports', a, 'POST', body, {'Idempotency-Key': key});
  assert.equal((await again.json() as {id: string}).id, result.id);
  const reread = await request(`/api/imports/${result.id}`, a); assert.equal(reread.status, 200);
  assert.deepEqual((await reread.json() as {listing: NormalizedListing}).listing.description, result.listing.description);
  const storedDescription = await localSql<{description_json: string}>(`SELECT description_json FROM listings WHERE id=${q(result.id)};`);
  assert.deepEqual(JSON.parse(storedDescription[0].description_json), result.listing.description);
  assert.equal((await request(`/api/imports/${result.id}`, b)).status, 404);
  const photoPath = `/api/imports/${result.id}/photos/${result.listing.photos[0].id}`;
  assert.equal((await request(photoPath)).status, 401); assert.equal((await request(photoPath, b)).status, 404);
  const photo = await request(photoPath, a), decoded = await sharp(new Uint8Array(await photo.arrayBuffer())).metadata();
  assert.equal(decoded.width, 960); assert.equal(decoded.height, 640); assert.equal(decoded.format, 'jpeg');
  const ownList = await (await request('/api/imports', a)).json() as {imports: unknown[]};
  assert.equal(ownList.imports.length, 1); assert.equal((await (await request('/api/imports', b)).json() as {imports: unknown[]}).imports.length, 0);
  checked('Import HTTP, galerie dédupliquée, relecture D1/R2 et refus inter-agences');
  checked('Description et paragraphes persistés dans les annonces, relus par l’API privée');
  const bad = await request('/api/imports', a, 'POST', {url: 'https://fixtures.bienvu.example/contradiction'}, {'Idempotency-Key': randomUUID()});
  const failed = await bad.json() as {status: string; errorCode: string; listing: unknown};
  assert.equal(failed.status, 'failed'); assert.equal(failed.errorCode, 'CONFLICTING_FACTS'); assert.equal(failed.listing, null);
  checked('Contradiction conservée comme échec explicite, sans faux résultat');
  if (process.argv.includes('--portals')) {
    for (const [path, code, reason] of [['/acces-refuse', 'SOURCE_BLOCKED', 'access_denied'], ['/page-recherche', 'NOT_A_LISTING', 'not_listing'],
      ['/annonce-retiree', 'SOURCE_UNAVAILABLE', 'not_found']]) {
      const response = await request('/api/imports', a, 'POST', {url: `https://fixtures.bienvu.example${path}`}, {'Idempotency-Key': randomUUID()});
      assert.equal(response.status, 200);
      const failed = await response.json() as {id: string; status: string; errorCode: string; listing: unknown};
      assert.equal(failed.status, 'failed'); assert.equal(failed.errorCode, code); assert.equal(failed.listing, null);
      assert.equal('diagnostics' in failed, false);
      const rows = await localSql<{diagnostics: string}>(`SELECT diagnostics_json AS diagnostics FROM listing_imports WHERE id=${q(failed.id)};`);
      const diagnostics = JSON.parse(rows[0].diagnostics);
      assert.equal(diagnostics.failureReason, reason); assert.equal(diagnostics.browserUsed, false); assert.equal(diagnostics.resources, 1);
    }
    checked('Portails simulés : refus, recherche et retrait persistés, motifs privés, un accès sans relance');
  }
  const counts = await localSql<{n: number}>(`SELECT count(*) n FROM jobs WHERE agency_id=${q(result.listing.agencyId)};`);
  assert.equal(counts[0].n, 0); checked('Aucun job, aucune vidéo ni droit d’essai consommé');
  if (process.argv.includes('--manual')) {
    const bytes = await Promise.all(['#214f43','#ad674b','#d5ccad'].map(async (background, index) => {
      const image = new Uint8Array(await sharp({create: {width: 960, height: 640, channels: 3, background}}).png().toBuffer());
      await writeFile(resolve(localFolder, `manual-photo-${index + 1}.png`), image); return image;
    }));
    const photos = await Promise.all(bytes.map(async value => ({size: value.length, mime: 'image/png',
      hash: Buffer.from(await crypto.subtle.digest('SHA-256', value)).toString('hex')})));
    const input = {title: 'Appartement saisi de recette', propertyType: 'apartment', transaction: 'rent', locality: 'Ville de recette',
      description: 'Saisie manuelle de recette.\n\nDeux pièces avec balcon.', priceCents: 95000, charges: 'included', area: 42.5, rooms: 2, photos};
    const manualKey = randomUUID();
    assert.equal((await request('/api/imports/manual', undefined, 'POST', input, {'Idempotency-Key': manualKey})).status, 401);
    assert.equal((await request('/api/imports/manual', a, 'POST', input, {origin: 'https://evil.example', 'Idempotency-Key': manualKey})).status, 403);
    assert.equal((await request('/api/imports/manual', a, 'POST', {...input, agencyId: 'forged'}, {'Idempotency-Key': manualKey})).status, 422);
    const start = await request('/api/imports/manual', a, 'POST', input, {'Idempotency-Key': manualKey});
    assert.equal(start.status, 201);
    const draft = await start.json() as {id: string; sourceKind: string; sourceUrl: null};
    assert.equal(draft.sourceKind, 'manual'); assert.equal(draft.sourceUrl, null);
    assert.equal((await (await request('/api/imports/manual', a, 'POST', input, {'Idempotency-Key': manualKey})).json() as {id:string}).id,draft.id);
    assert.equal((await request('/api/imports/manual', a, 'POST', {...input,title:'Autre'}, {'Idempotency-Key': manualKey})).status,409);
    assert.equal((await request(`/api/imports/${draft.id}/complete`, a, 'POST')).status,422);
    const upload = (index: number, owner: User, content = bytes[index], origin = base) => fetch(`${base}/api/imports/${draft.id}/uploads/${index}`,
      {method: 'PUT', headers: {cookie: cookie(owner), origin, 'Content-Type':'image/png'}, body:content});
    assert.equal((await upload(0,b)).status,404);
    assert.equal((await upload(0,a,bytes[0],'https://evil.example')).status,403);
    assert.equal((await upload(0,a,bytes[1])).status,422);
    for (let index=0; index<bytes.length; index++) assert.equal((await upload(index,a)).status,200);
    assert.equal((await upload(0,a)).status,200);
    assert.equal((await request(`/api/imports/${draft.id}/complete`,b,'POST')).status,404);
    for (let i=0;i<2;i++) assert.equal((await request(`/api/imports/${draft.id}/complete`,a,'POST')).status,200);
    const saved = await (await request(`/api/imports/${draft.id}`,a)).json() as {listing:NormalizedListing};
    assert.equal(saved.listing.sourceUrl,null); assert.equal(saved.listing.canonicalUrl,null); assert.equal(saved.listing.facts.title.status,'user_provided');
    assert.equal(saved.listing.description?.text,input.description); assert.equal(saved.listing.facts.price.value?.period,'month');
    assert.equal(saved.listing.facts.price.value?.charges,'included'); assert.equal(saved.listing.photos.length,3);
    const path = `/api/imports/${draft.id}/photos/${saved.listing.photos[0].id}`;
    assert.equal((await request(path,b)).status,404); assert.equal((await request(path)).status,401);
    assert.equal((await sharp(new Uint8Array(await (await request(path,a)).arrayBuffer())).metadata()).format,'jpeg');
    const manualStored = await localSql<{source_kind:string;source_url:string;description_json:string}>(`SELECT source_kind,source_url,description_json FROM listings WHERE id=${q(draft.id)};`);
    assert.equal(manualStored[0].source_kind,'manual'); assert.equal(manualStored[0].source_url,'');
    assert.equal(JSON.parse(manualStored[0].description_json).text,input.description);
    checked('Saisie manuelle : session, CSRF, validation, idempotence et isolation de chaque étape');
    checked('Uploads JPEG réencodés, reprise, publication complète et relecture de la location avec charges');
  }
  if (process.argv.includes('--keep')) {await writeFile(fixturePath, JSON.stringify({base, users, importId: result.id, cookie: cookie(a)}), {mode: 0o600}); keep = true;}
} finally {
  bridge.kill('SIGTERM');
  await new Promise<void>(resolve => {if (bridge.exitCode !== null) resolve(); else bridge.once('exit', () => resolve());});
  if (!keep) await cleanup(users);
  await writeFile(resolve(localFolder, 'http-report.json'), JSON.stringify({...report, fixturesRetainedForUI: keep}, null, 2));
}
