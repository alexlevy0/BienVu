import assert from 'node:assert/strict';
import {randomBytes, randomUUID} from 'node:crypto';
import {mkdir, readFile, writeFile, unlink} from 'node:fs/promises';
import {resolve} from 'node:path';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';

// Aucun compte préinséré : inscription, hachage, confirmation et reset passent par HTTP/workerd.
// Seul l’envoi postal est simulé par le binding local de Wrangler.
const run = promisify(execFile), base = 'http://localhost:8787', folder = resolve('evidence/local/sprint-02');
const logPath = process.env.BIENVU_PREVIEW_LOG;
const bypass = process.argv.includes('--bypass');
if (!logPath) throw new Error('BIENVU_PREVIEW_LOG doit désigner la sortie du serveur pnpm preview --local.');
const config = JSON.parse(await readFile('apps/web/wrangler.jsonc', 'utf8'));
assert.equal(config.vars.AUTH_EMAIL_MODE, 'local');
assert.equal(config.send_email[0].remote, false);
await mkdir(folder, {recursive: true});
const email = `email-probe-${randomUUID()}@example.com`, password = randomBytes(20).toString('hex'), nextPassword = randomBytes(20).toString('hex');
const quote = value => `'${String(value).replaceAll("'", "''")}'`;
async function sql(statement) {
  const path = resolve(folder, `${randomUUID()}.sql`);
  await writeFile(path, statement, {mode: 0o600});
  try {
    const {stdout} = await run('pnpm', ['exec', 'wrangler', 'd1', 'execute', 'DB', '--local', '--file', path, '--json'], {cwd: resolve('apps/web'), maxBuffer: 2 * 1024 * 1024});
    return JSON.parse(stdout).at(-1)?.results ?? [];
  } catch {throw new Error('Échec de la vérification D1 locale ; détails sensibles masqués.');}
  finally {await unlink(path);}
}
let ip = 20, cookie = '';
const report = {at: new Date().toISOString(), mode: 'local-workerd-d1-email-binding', identities: 'synthetic-http-signup',
  passwordHashing: 'real-better-auth-scrypt', emailVerificationBypassed: bypass,
  mailDelivery: bypass ? 'not-requested' : 'wrangler-local-simulation-only', externalCalls: 0, checks: []};
function checked(name) {report.checks.push(name); console.log(`✓ ${name}`);}
async function post(path, body, currentCookie = '', extra = {}) {
  return fetch(`${base}/api/auth/${path}`, {method: 'POST', redirect: 'manual', headers: {origin: base, 'content-type': 'application/json', 'cf-connecting-ip': `192.0.2.${ip++}`, cookie: currentCookie, ...extra}, body: JSON.stringify(body)});
}
async function captureMail(action) {
  const offset = (await readFile(logPath, 'utf8')).length;
  assert.equal((await action()).status, 200);
  for (let attempt = 0; attempt < 40; attempt++) {
    const log = (await readFile(logPath, 'utf8')).slice(offset).replace(/\x1b\[[0-9;]*m/g, '');
    const file = [...log.matchAll(/Text:\s+([^\r\n]+\.txt)/g)].at(-1)?.[1]?.trim();
    if (file) {
      assert.ok(file.includes('email-text/'), 'Fichier généré par le simulateur attendu.');
      const text = await readFile(file, 'utf8');
      const url = text.match(/http:\/\/localhost:8787\/\S+/)?.[0];
      assert.ok(url, 'Lien local attendu dans le message simulé.');
      return new URL(url);
    }
    await new Promise(resolve => setTimeout(resolve, 250));
  }
  throw new Error('Message simulé introuvable : vérifier BIENVU_PREVIEW_LOG sans publier le contenu du mail.');
}
async function probeBypass() {
  const offset = (await readFile(logPath, 'utf8')).length;
  const signup = await post('sign-up/email', {email, password});
  assert.equal(signup.status, 200); assert.deepEqual(await signup.json(), {ok: true, authenticated: true});
  cookie = signup.headers.get('set-cookie')?.split(';')[0] ?? ''; assert.ok(cookie);
  assert.match(signup.headers.get('set-cookie'), /HttpOnly/);
  const meResponse = await fetch(`${base}/api/me`, {headers: {cookie}}); assert.equal(meResponse.status, 200);
  const me = await meResponse.json(); assert.equal(me.user.email, email); assert.equal(me.rights.generationEnabled, false);
  const [record] = await sql(`SELECT u.emailVerified,a.password,(SELECT count(*) FROM agencies WHERE owner_user_id=u.id) agencies,(SELECT count(*) FROM trial_claims WHERE owner_user_id=u.id) claims FROM auth_user u JOIN auth_account a ON a.userId=u.id WHERE u.email=${quote(email)};`);
  assert.equal(record.emailVerified, 1); assert.ok(record.password && record.password !== password);
  assert.equal(record.agencies, 1); assert.equal(record.claims, 1);
  assert.ok(!(await readFile(logPath, 'utf8')).slice(offset).includes(`To: ${email}`));
  checked('Inscription : adresse vérifiée en D1, session immédiate, agence unique, aucun mail');
  const reload = await (await fetch(`${base}/api/me`, {headers: {cookie}})).json(); assert.equal(reload.agency.id, me.agency.id);
  assert.equal((await post('sign-in/email', {email, password: nextPassword})).status, 400);
  assert.equal((await post('sign-up/email', {email, password: nextPassword})).status, 400);
  const [counts] = await sql(`SELECT count(*) n FROM allocations WHERE agency_id=${quote(me.agency.id)};`); assert.equal(counts.n, 0);
  assert.equal((await post('sign-out', {}, cookie)).status, 200);
  assert.equal((await fetch(`${base}/api/me`, {headers: {cookie}})).status, 401);
  checked('Session persistante, mauvais mot de passe et réinscription refusés, zéro allocation, déconnexion');
}
try {
  if (bypass) await probeBypass();
  else {
  const status = await (await fetch(`${base}/api/auth/status`)).json(); assert.equal(status.email, true); assert.equal(status.emailDelivery, true);
  const verify = await captureMail(() => post('sign-up/email', {email, password}));
  assert.equal((await post('sign-in/email', {email, password})).status, 403);
  assert.equal((await fetch(`${base}/api/me`)).status, 401);
  const [before] = await sql(`SELECT u.emailVerified,(SELECT count(*) FROM agencies WHERE owner_user_id=u.id) agencies,a.password FROM auth_user u JOIN auth_account a ON a.userId=u.id WHERE u.email=${quote(email)};`);
  assert.equal(before.emailVerified, 0); assert.equal(before.agencies, 0); assert.ok(before.password && before.password !== password);
  checked('Inscription HTTP, hash persisté, mail simulé ; aucune session/agence avant confirmation');
  const confirmation = await fetch(verify, {redirect: 'manual'}); assert.equal(confirmation.status, 302);
  const signin = await post('sign-in/email', {email, password}); assert.equal(signin.status, 200); assert.deepEqual(await signin.json(), {ok: true});
  cookie = signin.headers.get('set-cookie')?.split(';')[0] ?? ''; assert.ok(cookie); assert.match(signin.headers.get('set-cookie'), /HttpOnly/);
  const me = await (await fetch(`${base}/api/me`, {headers: {cookie}})).json(); assert.equal(me.user.email, email); assert.equal(me.rights.generationEnabled, false);
  const reload = await (await fetch(`${base}/api/me`, {headers: {cookie}})).json(); assert.equal(reload.agency.id, me.agency.id);
  checked('Confirmation puis connexion et rechargement : une seule agence, aucun crédit public');
  const unknown = await post('request-password-reset', {email: `absent-${randomUUID()}@example.com`}); assert.deepEqual(await unknown.json(), {ok: true});
  const resetLink = await captureMail(() => post('request-password-reset', {email}));
  assert.equal(resetLink.pathname, '/connexion'); assert.equal(resetLink.searchParams.has('token'), false);
  const token = new URLSearchParams(resetLink.hash.slice(1)).get('token'); assert.ok(token);
  assert.equal((await post('reset-password', {token, newPassword: nextPassword})).status, 200);
  assert.equal((await fetch(`${base}/api/me`, {headers: {cookie}})).status, 401);
  assert.equal((await post('reset-password', {token, newPassword: password})).status, 400);
  assert.equal((await post('sign-in/email', {email, password})).status, 400);
  const again = await post('sign-in/email', {email, password: nextPassword}); assert.equal(again.status, 200);
  cookie = again.headers.get('set-cookie')?.split(';')[0] ?? '';
  const after = await (await fetch(`${base}/api/me`, {headers: {cookie}})).json(); assert.equal(after.agency.id, me.agency.id);
  checked('Réinitialisation : secret dans le fragment, usage unique, anciennes sessions/mot de passe invalidés');
  assert.equal((await post('sign-in/email', {email, password: nextPassword}, '', {origin: 'https://foreign.example'})).status, 403);
  assert.equal((await post('sign-out', {}, cookie)).status, 200);
  assert.equal((await fetch(`${base}/api/me`, {headers: {cookie}})).status, 401);
  const [count] = await sql(`SELECT (SELECT count(*) FROM trial_claims WHERE owner_user_id=u.id) claims,(SELECT count(*) FROM allocations WHERE agency_id=${quote(me.agency.id)}) allocations FROM auth_user u WHERE email=${quote(email)};`);
  assert.equal(count.claims, 1); assert.equal(count.allocations, 0);
  checked('CSRF refusé, déconnexion et essai unique conservés, zéro allocation');
  }
} finally {
  await sql(`DELETE FROM auth_verification WHERE value IN (SELECT id FROM auth_user WHERE email=${quote(email)});
    DELETE FROM trial_claims WHERE owner_user_id IN (SELECT id FROM auth_user WHERE email=${quote(email)});
    DELETE FROM agencies WHERE owner_user_id IN (SELECT id FROM auth_user WHERE email=${quote(email)});
    DELETE FROM auth_user WHERE email=${quote(email)};`);
  console.log('Identité synthétique, sessions et agence supprimées.');
}
await writeFile(resolve(folder, bypass ? 'bypass-workerd.json' : 'email-workerd.json'), JSON.stringify(report, null, 2));
