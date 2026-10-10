import assert from 'node:assert/strict';
import {mkdir, writeFile} from 'node:fs/promises';

const base = process.env.BIENVU_FOUNDATIONS_URL ?? 'http://localhost:8787';
const origin = new URL(base);
if (!['localhost', '127.0.0.1', '[::1]'].includes(origin.hostname)) throw new Error('Sonde sprint 01 limitée au serveur local.');
const report = {at: new Date().toISOString(), mode: 'local-workerd', externalCalls: 0, checks: []};
// The studio controls identify these pages without coupling the probe to marketing copy.
const pages = new Map([
  ['/', [/id="home-listing-url"/, /class="home-composer(?:\s[^"]*)?"/]],
  ['/studio', /id="home-listing-url"/],
  ['/sources', /IMPORTER VOTRE ANNONCE/],
  ['/generer', /id="home-listing-url"/],
  ['/agence', /Votre identité, sur chaque vidéo\./],
  ['/historique', /id="property-library-title"/],
  ['/biens', /id="property-library-title"/],
  ['/abonnement', [/id="offers-calculator-heading"/, /id="offers-solo"/, /id="offers-agence"/, /id="offers-equipe"/, /class="offers-network"/, /id="recharges"/]],
  ['/connexion', [/id="login-studio-title"/, /class="login-box(?:\s[^"]*)?"/]],
]);
for (const [path, expectedContent] of pages) {
  const response = await fetch(new URL(path, base));
  const html = await response.text();
  assert.equal(response.status, 200, path);
  assert.match(html, /<html lang="fr"/);
  assert.equal(response.headers.get('x-content-type-options'), 'nosniff');
  assert.equal(response.headers.get('referrer-policy'), 'no-referrer');
  for (const content of Array.isArray(expectedContent) ? expectedContent : [expectedContent]) {
    assert.ok(content.test(html), `Contenu attendu absent sur ${path}: ${content}`);
  }
  report.checks.push({path, status: response.status, french: true, securityHeaders: true});
}
for(const path of ['/studio','/generer']){const redirect=await fetch(new URL(path,base),{redirect:'manual'});assert.equal(redirect.status,308);assert.equal(new URL(redirect.headers.get('location'),base).pathname,'/');}
assert.equal((await fetch(new URL('/laboratoire',base))).status,404);
const ids = new Set();
for (const body of [{url: 'https://example.com/listing'}, {url: 'https://127.0.0.1', agencyId: 'forged', watermarked: false}]) {
  const response = await fetch(new URL('/api/generations', base), {method: 'POST', headers: {'Content-Type': 'application/json', 'X-Request-ID': 'forged'}, body: JSON.stringify(body)});
  const payload = await response.json();
  assert.equal(response.status, 401); assert.equal(payload.error.code, 'UNAUTHORIZED');
  assert.match(payload.error.requestId, /^[a-f0-9-]{36}$/); assert.equal(response.headers.get('x-request-id'), payload.error.requestId);
  assert.equal(response.headers.get('cache-control'), 'private, no-store'); ids.add(payload.error.requestId);
}
assert.equal(ids.size, 2);
report.checks.push({path: '/api/generations', status: 401, requestIdsGenerated: true, paidWorkRefused: true});
const history = await fetch(new URL('/api/generations', base)); assert.equal(history.status, 401);
for(const path of ['/api/properties','/api/properties/listing%3Amissing']){
  const response=await fetch(new URL(path,base));assert.equal(response.status,401);
  assert.equal(response.headers.get('cache-control'),'private, no-store');
  report.checks.push({path,status:401,private:true});
}
const probe = await fetch(new URL('/api/probe', base)); assert.equal(probe.status, 401);
report.checks.push({unauthenticatedHistory: 401, unauthenticatedProbe: 401});
await mkdir('evidence/local/sprint-01', {recursive: true});
await writeFile('evidence/local/sprint-01/web-workerd.json', JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));
