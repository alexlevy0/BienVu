import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile, readdir} from 'node:fs/promises';
import {randomBytes, createHmac} from 'node:crypto';
import {Miniflare, convertV4MiniflareOptions} from 'miniflare';
import {createAuth, authOrigin} from '../apps/web/lib/auth';
import {handleAuthRequest} from '../apps/web/lib/auth-handler';
import {AgencyUpdate} from '../packages/contracts/src/agency';
import {ensureAgency, agencyForUser, updateAgency, allowAgencyWrite} from '../packages/db/src/agency';
import {assertSameOrigin, boundedBytes, RequestFailure} from '../apps/web/lib/http';

test('comptes : Better Auth avec D1 local, identités synthétiques sans Google', async t => {
  const mf = new Miniflare(convertV4MiniflareOptions({modules: true, script: 'export default {fetch(){return new Response("test")}}',
    compatibilityDate: '2026-09-27', d1Databases: ['DB']}));
  t.after(() => mf.dispose());
  const db = await mf.getD1Database('DB');
  const migrations = new URL('../packages/db/migrations/', import.meta.url);
  for (const file of (await readdir(migrations)).filter(v => v.endsWith('.sql')).sort())
    await db.exec((await readFile(new URL(file, migrations), 'utf8')).replace(/^--.*$/gm, '').replace(/\n/g, ' '));
  const env = {DB: db, PROBE_MODE: 'local', BETTER_AUTH_URL: 'http://localhost:8787',
    BETTER_AUTH_SECRET: randomBytes(32).toString('hex'), GOOGLE_CLIENT_ID: '', GOOGLE_CLIENT_SECRET: ''};
  const auth = createAuth(env), context = await auth.$context;
  const user = {id: crypto.randomUUID(), name: 'Fixture A', email: 'fixture-a@example.com'};
  const other = {id: crypto.randomUUID(), name: 'Fixture B', email: 'fixture-b@example.com'};
  for (const item of [user, other]) await db.prepare('INSERT INTO auth_user(id,name,email,emailVerified,createdAt,updatedAt) VALUES(?,?,?,1,?,?)').bind(item.id,item.name,item.email,Date.now(),Date.now()).run();
  const makeCookie = (token: string, name = context.authCookies.sessionToken.name) => `${name}=${encodeURIComponent(`${token}.${createHmac('sha256', env.BETTER_AUTH_SECRET).update(token).digest('base64')}`)}`;
  const session = await context.internalAdapter.createSession(user.id);
  assert.ok(session);
  const cookie = makeCookie(session.token);

  await t.test('cookie signé, session persistée et relue après nouvelle instance, expiration et falsification', async () => {
    assert.equal(context.authCookies.sessionToken.attributes.httpOnly, true);
    assert.equal(context.authCookies.sessionToken.attributes.sameSite, 'lax');
    const https = createAuth({...env, PROBE_MODE: 'staging', BETTER_AUTH_URL: 'https://bienvu.example.com'});
    assert.equal((await https.$context).authCookies.sessionToken.attributes.secure, true);
    assert.equal((await createAuth(env).api.getSession({headers: new Headers({cookie})}))?.user.id, user.id);
    assert.equal(await auth.api.getSession({headers: new Headers({cookie: `${cookie}falsifie`})}), null);
    const expired = await context.internalAdapter.createSession(user.id, false, {expiresAt: new Date(Date.now() - 1000)}, true);
    assert.ok(expired);
    assert.equal(await auth.api.getSession({headers: new Headers({cookie: makeCookie(expired.token)})}), null);
  });
  await t.test('deux retours concurrents : une agence, une identité essai et zéro crédit accordé', async () => {
    await Promise.all(Array.from({length: 3}, () => context.internalAdapter.createSession(other.id)));
    const profiles = await Promise.all(Array.from({length: 8}, () => ensureAgency(db, user)));
    assert.equal(new Set(profiles.map(p => p.id)).size, 1);
    assert.equal((await db.prepare('SELECT count(*) n FROM agencies WHERE owner_user_id=?').bind(user.id).first<{n: number}>())?.n, 1);
    assert.equal((await db.prepare('SELECT count(*) n FROM trial_claims WHERE owner_user_id=?').bind(user.id).first<{n: number}>())?.n, 1);
    assert.equal((await db.prepare('SELECT count(*) n FROM agencies WHERE owner_user_id=?').bind(other.id).first<{n: number}>())?.n, 1);
    for (const table of ['allocations', 'jobs', 'cost_events']) assert.equal((await db.prepare(`SELECT count(*) n FROM ${table}`).first<{n: number}>())?.n, 0);
  });
  await t.test('marque persistante et propriétaire déduit côté serveur', async () => {
    const before = await ensureAgency(db, other);
    const input = {name: 'Agence A enregistrée', primaryColor: '#234567', secondaryColor: '#ffffff', phone: null,
      email: 'contact-a@example.com', website: null, city: 'Lyon'};
    assert.equal(AgencyUpdate.safeParse({...input, agencyId: before.id}).success, false);
    await updateAgency(db, user.id, input);
    assert.equal((await agencyForUser(db, user.id))?.name, input.name);
    assert.equal((await agencyForUser(db, user.id))?.city, input.city);
    assert.deepEqual(await agencyForUser(db, other.id), before);
    assert.equal(AgencyUpdate.safeParse({...input, city: 'x'.repeat(101)}).success, false);
    assert.equal(AgencyUpdate.safeParse({...input, email: null}).success, false);
    assert.equal(AgencyUpdate.safeParse({...input, phone: '......', email: null}).success, false);
    assert.equal(AgencyUpdate.safeParse({...input, primaryColor: 'red; background:url(x)'}).success, false);
  });
  await t.test('limite d’upload atomique sous concurrence', async () => {
    const outcomes = await Promise.all(Array.from({length: 10}, () => allowAgencyWrite(db, user.id, 'logo', 60_000)));
    assert.equal(outcomes.filter(Boolean).length, 6);
    assert.equal(await allowAgencyWrite(db, user.id, 'logo', 120_000), true);
  });
  await t.test('logo étranger refusé en base, ancienne version immuable et plafond de stockage', async () => {
    const a = await ensureAgency(db, user), b = await ensureAgency(db, other);
    const add = (id: string, agencyId: string, size: number) => db.prepare(`INSERT INTO media_assets(id,agency_id,kind,object_key,content_hash,mime,size_bytes,width,height,created_at)
      VALUES(?,?,'brand',?,?,'image/png',?,80,40,?)`).bind(id, agencyId, `agencies/${agencyId}/brand/${id}.png`, 'a'.repeat(64), size, new Date().toISOString()).run();
    await add('logo-a', a.id, 100); await add('logo-b', b.id, 100);
    await assert.rejects(db.prepare('UPDATE agencies SET logo_asset_id=? WHERE id=?').bind('logo-b', a.id).run(), /BRAND_LOGO_MISMATCH/);
    await db.prepare('UPDATE agencies SET logo_asset_id=? WHERE id=?').bind('logo-a', a.id).run();
    const snapshot = JSON.stringify(await agencyForUser(db, user.id));
    await assert.rejects(db.prepare("UPDATE media_assets SET object_key=object_key || '2' WHERE id='logo-a'").run(), /BRAND_ASSET_IMMUTABLE/);
    await assert.rejects(db.prepare("DELETE FROM media_assets WHERE id='logo-a'").run(), /BRAND_ASSET_IN_USE/);
    await add('logo-a-new', a.id, 100);
    await db.prepare('UPDATE agencies SET logo_asset_id=? WHERE id=?').bind('logo-a-new', a.id).run();
    assert.equal(JSON.parse(snapshot).logoAssetId, 'logo-a');
    assert.ok(await db.prepare("SELECT id FROM media_assets WHERE id='logo-a'").first());
    await assert.rejects(add('logo-overflow', a.id, 33554432), /LOGO_STORAGE_FULL/);
  });
  await t.test('identité Google non vérifiée rejetée ; jetons fournisseur effacés', async () => {
    const gate = auth.options.user.validateUserInfo;
    // Le gate du fournisseur est indépendant de l’insertion interne des fixtures.
    assert.ok(await gate({user: {emailVerified: false}, source: {action: 'sign-in', method: 'oauth', oauth: {providerId: 'google'}}}));
    await assert.rejects(ensureAgency(db, {id: 'unverified', email: 'unverified@example.com'}), /VERIFIED_OWNER_REQUIRED/);
    const account = await context.internalAdapter.createAccount({userId: user.id, providerId: 'google', accountId: 'fixture-google-a',
      accessToken: 'fixture-access', refreshToken: 'fixture-refresh', idToken: 'fixture-id'});
    assert.equal(account.accessToken, null); assert.equal(account.refreshToken, null); assert.equal(account.idToken, null);
  });
  await t.test('OAuth : état, PKCE, origine/callback étrangers refusés sans contacter Google', async () => {
    const configured = createAuth({...env, GOOGLE_CLIENT_ID: 'fixture-id', GOOGLE_CLIENT_SECRET: 'fixture-secret'});
    const request = (origin: string, callbackURL: string) => new Request(`${env.BETTER_AUTH_URL}/api/auth/sign-in/social`, {
      method: 'POST', headers: {'content-type': 'application/json', origin, cookie}, body: JSON.stringify({provider: 'google', callbackURL, disableRedirect: true}),
    });
    assert.equal((await configured.handler(request('https://evil.example.com', '/agence'))).status, 403);
    assert.equal((await configured.handler(request(env.BETTER_AUTH_URL, 'https://evil.example.com'))).status, 403);
    const start = await configured.handler(request(env.BETTER_AUTH_URL, '/agence'));
    assert.equal(start.status, 200);
    const body = await start.json() as {url: string};
    const url = new URL(body.url);
    assert.equal(url.origin, 'https://accounts.google.com'); assert.ok(url.searchParams.get('state'));
    assert.ok(url.searchParams.get('code_challenge')); assert.equal(url.searchParams.get('redirect_uri'), `${env.BETTER_AUTH_URL}/api/auth/callback/google`);
    assert.match(start.headers.get('set-cookie') ?? '', /HttpOnly/i);
    const invalid = await configured.handler(new Request(`${env.BETTER_AUTH_URL}/api/auth/callback/google?state=forged&code=fixture`));
    assert.equal(invalid.status, 302); assert.match(invalid.headers.get('location') ?? '', /error/);
  });
  await t.test('reprise de l’annonce après Google : seul le drapeau fixe est accepté', async () => {
    const configured = {...env, GOOGLE_CLIENT_ID: 'fixture-id', GOOGLE_CLIENT_SECRET: 'fixture-secret'};
    const start = (body: unknown) => handleAuthRequest(new Request(`${env.BETTER_AUTH_URL}/api/auth/sign-in/social`, {
      method: 'POST', headers: {'content-type': 'application/json', origin: env.BETTER_AUTH_URL}, body: JSON.stringify(body),
    }), configured);
    const continued = await start({provider: 'google', continueListing: true});
    assert.equal(continued.status, 200);
    assert.equal(new URL((await continued.json() as {url: string}).url).origin, 'https://accounts.google.com');
    const trial = await start({provider:'google',continueTrial:true});
    assert.equal(trial.status,200);
    const states=await db.prepare('SELECT value FROM auth_verification').all<{value:string}>();
    assert.ok(states.results.some((row:{value:string})=>row.value.includes('/essai/recuperer')));
    for (const body of [{provider:'google',continueTrial:true,continueListing:true},{provider:'google',continueTrial:'https://evil.example.com'}, {provider: 'google', callbackURL: 'https://evil.example.com'},
      {provider: 'google', continueListing: '/'}, {provider: 'google', continueListing: true, callbackURL: 'https://evil.example.com'}])
      assert.equal((await start(body)).status, 422);
  });
  await t.test('déconnexion invalide immédiatement le cookie en base', async () => {
    const response = await auth.handler(new Request(`${env.BETTER_AUTH_URL}/api/auth/sign-out`, {method: 'POST',
      headers: {cookie, origin: env.BETTER_AUTH_URL, 'content-type': 'application/json'}, body: '{}'}));
    assert.equal(response.status, 200);
    assert.equal(await createAuth(env).api.getSession({headers: new Headers({cookie})}), null);
  });
  await t.test('CSRF et HTTP non local refusés ; corps borné même sans Content-Length', async () => {
    assert.throws(() => authOrigin({...env, PROBE_MODE: 'staging'}), /INVALID_AUTH_ORIGIN/);
    assert.throws(() => assertSameOrigin(new Request(env.BETTER_AUTH_URL), env), /FORBIDDEN/);
    assert.throws(() => assertSameOrigin(new Request(env.BETTER_AUTH_URL, {headers: {origin: 'https://evil.example.com'}}), env), /FORBIDDEN/);
    const request = new Request(env.BETTER_AUTH_URL, {method: 'POST', body: new Uint8Array(1025)});
    await assert.rejects(boundedBytes(request, 1024), e => e instanceof RequestFailure && e.code === 'FILE_TOO_LARGE');
  });
});
