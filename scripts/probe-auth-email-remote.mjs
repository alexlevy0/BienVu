// Recette opérateur réelle, distincte de probe-auth-email.mjs (messages simulés).
// Deux envois au maximum : confirmation, puis reset. Aucun renvoi automatique.
import assert from 'node:assert/strict';
import {readFile, writeFile, mkdir, chmod} from 'node:fs/promises';
import {randomBytes} from 'node:crypto';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';

const step = process.argv[2];
if (!['start', 'status', 'confirmed', 'reset-done'].includes(step))
  throw new Error('Étape requise : start, status, confirmed ou reset-done. Lire docs/AUTHENTIFICATION.md.');
const configPath = 'apps/web/wrangler.staging.jsonc';
const config = JSON.parse(await readFile(configPath, 'utf8'));
const origin = config.vars.BETTER_AUTH_URL;
assert.equal(config.name, 'bienvu-web-probe-staging');
assert.equal(origin, 'https://bienvu-web-probe-staging.alexlevy0.workers.dev');
assert.equal(config.vars.PROBE_MODE, 'remote');
assert.equal(config.vars.AUTH_EMAIL_MODE, 'cloudflare');
assert.equal(config.vars.AUTH_EMAIL_VERIFICATION_BYPASS, 'false');
assert.equal(config.vars.GENERATIONS_ENABLED, 'false');
assert.equal(config.vars.IMPORT_MODE, 'disabled');
const destinations = config.send_email?.[0]?.allowed_destination_addresses;
assert.equal(destinations?.length, 1, 'La recette exige un binding limité au destinataire autorisé.');
const dir = 'evidence/remote/auth-email';
await mkdir(dir, {recursive: true, mode: 0o700});
const statePath = `${dir}/credentials.json`, reportPath = `${dir}/auth-flow.json`;
const savePrivate = async (path, value) => {
  await writeFile(path, JSON.stringify(value, null, 2), {mode: 0o600});
  await chmod(path, 0o600);
};
const quote = value => `'${String(value).replaceAll("'", "''")}'`;
async function query(sql) {
  assert.match(sql, /^SELECT /, 'Cette sonde ne modifie pas directement D1.');
  try {
    const {stdout} = await promisify(execFile)('pnpm', ['exec', 'wrangler', 'd1', 'execute', 'DB',
      '--remote', '--config', configPath, '--command', sql, '--json'], {maxBuffer: 1024 * 1024});
    const results = JSON.parse(stdout);
    assert.equal(results[0]?.success, true, 'Requête D1 refusée');
    return results[0].results;
  } catch {
    throw new Error('Lecture D1 impossible. Aucun résultat brut ni secret affiché.');
  }
}
async function request(path, body, cookie = '', requestOrigin = origin) {
  const start = performance.now();
  const response = await fetch(`${origin}${path}`, {
    method: body ? 'POST' : 'GET', redirect: 'manual', signal: AbortSignal.timeout(30_000),
    headers: {origin: requestOrigin, ...(body ? {'content-type': 'application/json'} : {}), ...(cookie ? {cookie} : {})},
    ...(body ? {body: JSON.stringify(body)} : {}),
  });
  return {status: response.status, data: await response.json().catch(() => null),
    cookie: response.headers.get('set-cookie'), wallMs: Math.round(performance.now() - start)};
}
let state = await readFile(statePath, 'utf8').then(JSON.parse).catch(error => {
  if (error.code !== 'ENOENT') throw error;
  return null;
});
if (step === 'start') {
  assert.ok(state === null, 'Une recette existe déjà : utiliser status, sans renvoyer de message.');
  const email = process.env.BIENVU_AUTH_EMAIL_TO?.trim().toLowerCase();
  assert.ok(email && destinations[0] === email, 'Confirmer explicitement BIENVU_AUTH_EMAIL_TO, identique au binding.');
  assert.equal((await query(`SELECT count(*) AS n FROM auth_user WHERE email=${quote(email)};`))[0].n, 0,
    'Compte déjà présent : ne pas remplacer ses identifiants avec cette sonde.');
  const status = await request('/api/auth/status');
  assert.equal(status.status, 200); assert.equal(status.data?.emailDelivery, true);
  state = {email, password: randomBytes(24).toString('base64url'), stage: 'signup-requested',
    report: {at: new Date().toISOString(), origin, environment: 'cloudflare-remote', fixture: false,
      bypass: false, requestedEmails: 1, reception: 'human-confirmation-required', checks: {}}};
  // État enregistré AVANT l'appel : un timeout ne doit pas provoquer un second envoi.
  await savePrivate(statePath, state);
  const signup = await request('/api/auth/sign-up/email', {email, password: state.password});
  assert.equal(signup.status, 200); assert.ok(JSON.stringify(signup.data) === '{"ok":true}', 'Réponse inscription inattendue');
  assert.ok(signup.cookie === null, 'L’inscription ne doit pas connecter le compte.');
  const [user] = await query(`SELECT u.id,u.emailVerified,length(a.password) AS hashLength,
    instr(a.password,':') AS saltSeparator FROM auth_user u JOIN auth_account a ON a.userId=u.id
    WHERE u.email=${quote(email)} AND a.providerId='credential';`);
  assert.ok(user); state.userId = user.id;
  assert.ok(user.hashLength > 64 && user.saltSeparator > 0);
  state.report.checks.signup = {status: 200, wallMs: signup.wallMs, noSessionCookie: true, saltedHashStored: true};
  if (!user.emailVerified) {
    const login = await request('/api/auth/sign-in/email', {email, password: state.password});
    assert.equal(login.status, 403); assert.equal(login.data?.error?.code, 'EMAIL_NOT_VERIFIED');
    state.report.checks.beforeVerification = {status: 403, wallMs: login.wallMs};
  }
  state.stage = 'awaiting-confirmation';
} else {
  assert.ok(state, 'Aucune recette en cours.');
  assert.equal(state.email, destinations[0], 'Le destinataire configuré a changé.');
  const [user] = await query(`SELECT emailVerified,
    (SELECT count(*) FROM agencies WHERE owner_user_id=auth_user.id) AS agencies,
    (SELECT count(*) FROM auth_session WHERE userId=auth_user.id) AS sessions
    FROM auth_user WHERE id=${quote(state.userId)};`);
  assert.ok(user);
  state.report.current = {emailVerified: Boolean(user.emailVerified), agencies: user.agencies, sessions: user.sessions};
  if (step === 'confirmed') {
    assert.equal(state.stage, 'awaiting-confirmation', 'Étape déjà exécutée ou recette incomplète. Aucun nouvel envoi.');
    assert.equal(user.emailVerified, 1, 'Le lien doit être ouvert depuis le véritable message reçu.');
    const login = await request('/api/auth/sign-in/email', {email: state.email, password: state.password});
    assert.equal(login.status, 200); assert.ok(JSON.stringify(login.data) === '{"ok":true}', 'Réponse connexion inattendue');
    assert.ok(login.cookie && /Secure/i.test(login.cookie) && /HttpOnly/i.test(login.cookie) && /SameSite=Lax/i.test(login.cookie),
      'Cookie sécurisé attendu ; valeur exclue des erreurs.');
    state.cookie = login.cookie.split(';')[0];
    const me = await request('/api/me', undefined, state.cookie); assert.equal(me.status, 200);
    const [agency] = await query(`SELECT id FROM agencies WHERE owner_user_id=${quote(state.userId)};`);
    assert.ok(agency); state.agencyId = agency.id;
    state.report.checks.confirmedLogin = {status: 200, wallMs: login.wallMs, secureHttpOnlySameSiteCookie: true,
      agencyAccessible: true, sessionsBeforeLogin: user.sessions};
    state.stage = 'reset-requested'; state.report.requestedEmails = 2;
    await savePrivate(statePath, state);
    const reset = await request('/api/auth/request-password-reset', {email: state.email});
    assert.equal(reset.status, 200); assert.ok(JSON.stringify(reset.data) === '{"ok":true}', 'Réponse reset inattendue');
    state.report.checks.resetRequest = {status: 200, wallMs: reset.wallMs};
    state.stage = 'awaiting-reset';
  } else if (step === 'reset-done') {
    assert.equal(state.stage, 'awaiting-reset');
    // Alex choisit le nouveau mot de passe dans le formulaire reçu, sans le communiquer.
    const oldSession = await request('/api/me', undefined, state.cookie);
    assert.equal(oldSession.status, 401, 'Le changement de mot de passe reste à effectuer.');
    const oldPassword = await request('/api/auth/sign-in/email', {email: state.email, password: state.password});
    assert.equal(oldPassword.status, 400); assert.equal(oldPassword.data?.error?.code, 'AUTH_CREDENTIALS');
    const [agency] = await query(`SELECT id FROM agencies WHERE owner_user_id=${quote(state.userId)};`);
    assert.equal(agency?.id, state.agencyId);
    state.report.checks.reset = {oldSessionStatus: 401, oldPasswordStatus: 400, agencyPreserved: true};
    state.stage = 'complete'; delete state.password; delete state.cookie;
    state.report.reception = 'verification-link-used-and-reset-applied';
    state.report.remaining = ['Réception inbox/spam et reconnexion avec le mot de passe choisi : retour humain.',
      'Expiration et replay du reset : vérifiés localement uniquement.', 'OAuth Google : non configuré.'];
  }
}
state.report.stage = state.stage; state.report.updatedAt = new Date().toISOString();
await savePrivate(statePath, state); await writeFile(reportPath, JSON.stringify(state.report, null, 2));
console.log(JSON.stringify(state.report, null, 2));
