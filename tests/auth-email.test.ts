import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile, readdir} from 'node:fs/promises';
import {randomBytes} from 'node:crypto';
import {Miniflare, convertV4MiniflareOptions} from 'miniflare';
import {createAuth, emailVerificationBypassed, type AuthEnvironment} from '../apps/web/lib/auth';
import {handleAuthRequest} from '../apps/web/lib/auth-handler';
import {emailConfigured, reserveAuthEmail} from '../apps/web/lib/auth-email';

test('e-mail/mot de passe : routes réelles et D1, envoi capturé en mémoire', async t => {
  const mf = new Miniflare(convertV4MiniflareOptions({modules: true, script: 'export default {fetch(){return new Response("test")}}',
    compatibilityDate: '2026-09-27', d1Databases: ['DB']}));
  t.after(() => mf.dispose());
  const db = await mf.getD1Database('DB');
  const migrations = new URL('../packages/db/migrations/', import.meta.url);
  for (const file of (await readdir(migrations)).filter(v => v.endsWith('.sql')).sort())
    await db.exec((await readFile(new URL(file, migrations), 'utf8')).replace(/^--.*$/gm, '').replace(/\n/g, ' '));
  const messages: {to: string; text: string}[] = [];
  const env: AuthEnvironment = {DB: db, PROBE_MODE: 'local', BETTER_AUTH_URL: 'http://localhost:8787',
    BETTER_AUTH_SECRET: randomBytes(32).toString('hex'), GOOGLE_CLIENT_ID: '', GOOGLE_CLIENT_SECRET: '',
    AUTH_EMAIL_MODE: 'local', AUTH_EMAIL_FROM: 'connexion@bienvu.example',
    AUTH_EMAIL: {send: async message => {assert.ok('text' in message); messages.push({to: String(message.to), text: message.text!}); return {messageId: crypto.randomUUID()};}}};
  const email = 'alice@example.com', password = randomBytes(18).toString('hex'), nextPassword = randomBytes(18).toString('hex');
  let cookie = '', userId = '', agencyId = '', ip = 1;
  const post = (path: string, body: unknown, headers: Record<string, string> = {}, customEnv = env) => handleAuthRequest(new Request(`${env.BETTER_AUTH_URL}/api/auth/${path}`, {
    method: 'POST', headers: {'content-type': 'application/json', origin: env.BETTER_AUTH_URL, 'cf-connecting-ip': `192.0.2.${ip++}`, ...headers}, body: JSON.stringify(body)}), customEnv);
  const get = (url: string, currentCookie = '') => handleAuthRequest(new Request(url, {headers: {cookie: currentCookie}}), env);
  const mailURL = () => {const link = messages.at(-1)?.text.match(/http:\/\/localhost:8787\/\S+/)?.[0]; assert.ok(link); return new URL(link);};

  await t.test('inscription sans session/agence ; hash distinct du mot de passe ; réponse minimale', async () => {
    const response = await post('sign-up/email', {email: ' Alice@Example.COM ', password});
    assert.equal(response.status, 200); assert.deepEqual(await response.json(), {ok: true}); assert.equal(response.headers.get('set-cookie'), null);
    const user = await db.prepare('SELECT id,email,emailVerified FROM auth_user WHERE email=?').bind(email).first<{id: string; email: string; emailVerified: number}>();
    assert.ok(user); userId = user.id; assert.equal(user.emailVerified, 0);
    const account = await db.prepare('SELECT password FROM auth_account WHERE userId=?').bind(userId).first<{password: string}>();
    assert.ok(account?.password); assert.notEqual(account.password, password);
    assert.equal(await (await createAuth(env).$context).password.verify({hash: account.password, password}), true);
    for (const table of ['auth_session', 'agencies', 'trial_claims']) assert.equal((await db.prepare(`SELECT count(*) n FROM ${table}`).first<{n: number}>())?.n, 0);
    assert.equal(messages.length, 1); assert.equal(messages[0].to, email);
  });
  await t.test('refus avant confirmation ; tentative avec e-mail existant indistinguable ; champs supplémentaires refusés', async () => {
    const unverified = await post('sign-in/email', {email, password});
    assert.equal(unverified.status, 403); assert.equal((await unverified.json() as {error: {code: string}}).error.code, 'EMAIL_NOT_VERIFIED');
    const duplicate = await post('sign-up/email', {email, password: nextPassword});
    assert.equal(duplicate.status, 200); assert.deepEqual(await duplicate.json(), {ok: true});
    assert.equal(messages.length, 1);
    assert.equal((await post('sign-up/email', {email, password, emailVerified: true})).status, 422);
    assert.equal((await post('sign-up/email', {email, password: 'court'})).status, 422);
    assert.equal((await post('sign-in/email', {email, password}, {origin: 'https://foreign.example'})).status, 403);
    assert.equal((await post('sign-in/email', {email, password, callbackURL: 'https://foreign.example'})).status, 422);
    assert.equal((await post('sign-up/email', {email: 'other@example.com', password}, {}, {...env, AUTH_EMAIL_MODE: 'disabled'})).status, 503);
  });
  await t.test('confirmation avec retour fixé ; répétition sans session ; connexion crée une seule agence', async () => {
    const link = mailURL(); link.searchParams.set('callbackURL', 'https://foreign.example');
    const response = await get(link.href); assert.equal(response.status, 302);
    assert.equal(new URL(response.headers.get('location')!, env.BETTER_AUTH_URL).pathname, '/connexion');
    assert.equal(response.headers.get('set-cookie'), null);
    const repeated = await get(link.href); assert.equal(repeated.headers.get('set-cookie'), null);
    const login = await post('sign-in/email', {email, password}); assert.equal(login.status, 200);
    assert.deepEqual(await login.json(), {ok: true});
    cookie = login.headers.get('set-cookie')!.split(';')[0]; assert.ok(cookie);
    assert.match(login.headers.get('set-cookie')!, /HttpOnly/); assert.match(login.headers.get('set-cookie')!, /SameSite=Lax/i);
    const session = await createAuth(env).api.getSession({headers: new Headers({cookie})}); assert.equal(session?.user.id, userId);
    agencyId = (await db.prepare('SELECT id FROM agencies WHERE owner_user_id=?').bind(userId).first<{id: string}>())!.id;
    const serialized = await (await get(`${env.BETTER_AUTH_URL}/api/auth/get-session`, cookie)).json() as {session: object};
    assert.deepEqual(Object.keys(serialized.session), ['expiresAt']);
  });
  await t.test('identifiants incorrects uniformes ; renvoi de confirmation inconnu/vérifié uniforme', async () => {
    for (const credentials of [{email, password: nextPassword}, {email: 'absent@example.com', password}]) {
      const response = await post('sign-in/email', credentials); assert.equal(response.status, 400);
      assert.equal((await response.json() as {error: {code: string}}).error.code, 'AUTH_CREDENTIALS');
    }
    for (const address of [email, 'absent@example.com']) {
      const response = await post('send-verification-email', {email: address}); assert.equal(response.status, 200); assert.deepEqual(await response.json(), {ok: true});
    }
    const expired = await get(`${env.BETTER_AUTH_URL}/api/auth/verify-email?token=invalid`);
    assert.equal(expired.headers.get('location'), `${env.BETTER_AUTH_URL}/connexion?error=verification`);
  });
  await t.test('réinitialisation : message générique, jeton unique, ancien mot de passe/session invalidés', async () => {
    for (const address of ['absent@example.com', email]) {
      const response = await post('request-password-reset', {email: address}); assert.equal(response.status, 200); assert.deepEqual(await response.json(), {ok: true});
    }
    const link = mailURL(); assert.equal(link.pathname, '/connexion'); assert.equal(link.searchParams.has('token'), false);
    const token = new URLSearchParams(link.hash.slice(1)).get('token'); assert.ok(token);
    const response = await post('reset-password', {token, newPassword: nextPassword}); assert.equal(response.status, 200);
    assert.equal(await createAuth(env).api.getSession({headers: new Headers({cookie})}), null);
    assert.equal((await post('reset-password', {token, newPassword: password})).status, 400);
    assert.equal((await post('sign-in/email', {email, password})).status, 400);
    assert.equal((await post('sign-in/email', {email, password: nextPassword})).status, 200);
    assert.equal((await db.prepare('SELECT id FROM agencies WHERE owner_user_id=?').bind(userId).first<{id: string}>())?.id, agencyId);
    assert.equal((await db.prepare('SELECT count(*) n FROM trial_claims WHERE owner_user_id=?').bind(userId).first<{n: number}>())?.n, 1);
  });
  await t.test('expiration du reset et renvoi de confirmation après perte du premier message', async () => {
    await post('request-password-reset', {email});
    const token = new URLSearchParams(mailURL().hash.slice(1)).get('token');
    await db.prepare('UPDATE auth_verification SET expiresAt=0 WHERE identifier=?').bind(`reset-password:${token}`).run();
    assert.equal((await post('reset-password', {token, newPassword: password})).status, 400);
    await post('sign-up/email', {email: 'resend@example.com', password});
    const count = messages.length;
    assert.equal((await post('send-verification-email', {email: 'resend@example.com'})).status, 200);
    assert.equal(messages.length, count + 1);
    assert.equal((await get(mailURL().href)).status, 302);
    assert.equal((await post('sign-in/email', {email: 'resend@example.com', password})).status, 200);
  });
  await t.test('compte Google existant : ajout du mot de passe par e-mail, même propriétaire', async () => {
    const id = crypto.randomUUID(); const googleEmail = 'google-fixture@example.com';
    await db.prepare('INSERT INTO auth_user(id,name,email,emailVerified,createdAt,updatedAt) VALUES(?,?,?,1,?,?)').bind(id, 'Fixture Google', googleEmail, Date.now(), Date.now()).run();
    const context = await createAuth(env).$context;
    await context.internalAdapter.createAccount({userId: id, providerId: 'google', accountId: 'google-fixture'});
    await context.internalAdapter.createSession(id);
    const original = await db.prepare('SELECT id FROM agencies WHERE owner_user_id=?').bind(id).first<{id: string}>();
    await post('request-password-reset', {email: googleEmail});
    const token = new URLSearchParams(mailURL().hash.slice(1)).get('token');
    assert.equal((await post('reset-password', {token, newPassword: password})).status, 200);
    assert.equal((await post('sign-in/email', {email: googleEmail, password})).status, 200);
    assert.equal((await db.prepare('SELECT id FROM agencies WHERE owner_user_id=?').bind(id).first<{id: string}>())?.id, original?.id);
    assert.equal((await db.prepare('SELECT count(*) n FROM auth_account WHERE userId=?').bind(id).first<{n: number}>())?.n, 2);
    assert.deepEqual(createAuth(env).options.account.accountLinking, {enabled: true, requireLocalEmailVerified: true, trustedProviders: [], allowDifferentEmails: false});
  });
  await t.test('bypass local : inscription vérifiée, cookie signé et agence sans fournisseur e-mail', async () => {
    const local = {...env, AUTH_EMAIL_VERIFICATION_BYPASS: 'true', AUTH_EMAIL: undefined, AUTH_EMAIL_MODE: 'disabled'};
    const address = 'local-bypass@example.com', count = messages.length;
    const response = await post('sign-up/email', {email: address, password}, {}, local);
    assert.equal(response.status, 200); assert.deepEqual(await response.json(), {ok: true, authenticated: true});
    const sessionCookie = response.headers.get('set-cookie')!.split(';')[0];
    assert.match(response.headers.get('set-cookie')!, /HttpOnly/);
    const session = await createAuth(local).api.getSession({headers: new Headers({cookie: sessionCookie})});
    assert.equal(session?.user.email, address); assert.equal(session?.user.emailVerified, true);
    assert.equal((await db.prepare('SELECT emailVerified FROM auth_user WHERE email=?').bind(address).first<{emailVerified: number}>())?.emailVerified, 1);
    const agency = await db.prepare('SELECT id FROM agencies WHERE owner_user_id=?').bind(session!.user.id).first<{id: string}>();
    assert.ok(agency);
    assert.equal((await db.prepare('SELECT count(*) n FROM trial_claims WHERE owner_user_id=?').bind(session!.user.id).first<{n: number}>())?.n, 1);
    assert.equal(messages.length, count);
    // Le drapeau ne permet pas de reprendre un compte existant en le réinscrivant.
    const duplicate = await post('sign-up/email', {email: address, password: nextPassword}, {}, local);
    assert.equal(duplicate.status, 400); assert.equal(duplicate.headers.get('set-cookie'), null);
    assert.equal((await post('sign-in/email', {email: address, password: nextPassword}, {}, local)).status, 400);
    assert.equal((await post('sign-in/email', {email: address, password}, {}, local)).status, 200);
    assert.equal((await db.prepare('SELECT count(*) n FROM agencies WHERE owner_user_id=?').bind(session!.user.id).first<{n: number}>())?.n, 1);
    // Désactiver le drapeau ne dé-vérifie pas les comptes de test déjà inscrits.
    assert.equal((await createAuth(env).api.getSession({headers: new Headers({cookie: sessionCookie})}))?.user.emailVerified, true);
  });
  await t.test('compte local en attente : bypass seulement après vérification du bon mot de passe', async () => {
    const address = 'pending-bypass@example.com';
    assert.equal((await post('sign-up/email', {email: address, password})).status, 200);
    const pending = await db.prepare('SELECT id FROM auth_user WHERE email=?').bind(address).first<{id: string}>(); assert.ok(pending);
    const local = {...env, AUTH_EMAIL_VERIFICATION_BYPASS: 'true'};
    assert.equal((await post('sign-in/email', {email: address, password: nextPassword}, {}, local)).status, 400);
    assert.equal((await db.prepare('SELECT emailVerified FROM auth_user WHERE id=?').bind(pending.id).first<{emailVerified: number}>())?.emailVerified, 0);
    await assert.rejects((await createAuth(local).$context).internalAdapter.createSession(pending.id), /VERIFIED_OWNER_REQUIRED/);
    const response = await post('sign-in/email', {email: address, password}, {}, local); assert.equal(response.status, 200);
    const sessionCookie = response.headers.get('set-cookie')!.split(';')[0];
    assert.equal((await createAuth(local).api.getSession({headers: new Headers({cookie: sessionCookie})}))?.user.emailVerified, true);
    assert.equal((await db.prepare('SELECT count(*) n FROM agencies WHERE owner_user_id=?').bind(pending.id).first<{n: number}>())?.n, 1);
  });
  await t.test('bypass fermé par défaut, valeurs strictes, refus sur origine publique et contrôle Google maintenu', async () => {
    for (const flag of [undefined, 'false', 'TRUE', '1', '']) assert.equal(emailVerificationBypassed({...env, AUTH_EMAIL_VERIFICATION_BYPASS: flag}), false);
    for (const overrides of [
      {PROBE_MODE: 'remote', BETTER_AUTH_URL: 'https://staging.example.com'},
      {PROBE_MODE: 'local', BETTER_AUTH_URL: 'https://public.example.com'},
      {PROBE_MODE: 'local', BETTER_AUTH_URL: 'http://0.0.0.0:8787'},
      {PROBE_MODE: 'remote', BETTER_AUTH_URL: 'http://localhost:8787'},
    ]) assert.throws(() => createAuth({...env, ...overrides, AUTH_EMAIL_VERIFICATION_BYPASS: 'true'}), /EMAIL_VERIFICATION_BYPASS_LOCAL_ONLY|INVALID_AUTH_ORIGIN/);
    const local = {...env, AUTH_EMAIL_VERIFICATION_BYPASS: 'true'};
    assert.ok(await createAuth(local).options.user.validateUserInfo({user: {emailVerified: false}, source: {action: 'create-user', method: 'oauth', oauth: {providerId: 'google'}}}));
    const accidentallyDeployed = await handleAuthRequest(new Request('https://public.example.com/api/auth/sign-up/email', {
      method: 'POST', headers: {origin: env.BETTER_AUTH_URL, 'content-type': 'application/json'}, body: JSON.stringify({email: 'remote-bypass@example.com', password}),
    }), local);
    assert.equal(accidentallyDeployed.status, 403);
    assert.equal((await post('sign-up/email', {email: 'forged-bypass@example.com', password, AUTH_EMAIL_VERIFICATION_BYPASS: true})).status, 422);
    assert.equal((await post('sign-up/email', {email: 'csrf-bypass@example.com', password}, {origin: 'https://foreign.example'}, local)).status, 403);
  });
  await t.test('limites HTTP et budget d’envoi atomique ; mode local impossible sur une origine publique', async () => {
    const headers = {'cf-connecting-ip': '198.51.100.1'};
    for (let i = 0; i < 3; i++) assert.equal((await post('request-password-reset', {email: 'absent@example.com'}, headers)).status, 200);
    assert.equal((await post('request-password-reset', {email: 'absent@example.com'}, headers)).status, 429);
    const reservations = await Promise.all(Array.from({length: 10}, () => reserveAuthEmail(env, 'limit@example.com')));
    assert.equal(reservations.filter(Boolean).length, 3);
    await db.prepare("UPDATE auth_mail_limits SET count=50 WHERE key LIKE 'daily:%'").run();
    assert.equal(await reserveAuthEmail(env, 'new-limit@example.com'), false);
    assert.equal(emailConfigured({...env, PROBE_MODE: 'remote', BETTER_AUTH_URL: 'https://bienvu.example.com'}), false);
    assert.equal(emailConfigured({...env, AUTH_EMAIL_MODE: 'cloudflare'}), false);
    const context = await createAuth(env).$context;
    await assert.rejects(context.internalAdapter.createSession('nonexistent'), /VERIFIED_OWNER_REQUIRED/);
  });
});
