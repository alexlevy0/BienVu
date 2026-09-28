import assert from 'node:assert/strict';
import {mkdir, writeFile} from 'node:fs/promises';

const base = process.env.BIENVU_FOUNDATIONS_URL ?? 'http://localhost:8787';
const origin = new URL(base);
if (!['localhost', '127.0.0.1', '[::1]'].includes(origin.hostname)) throw new Error('Sonde sprint 01 limitée au serveur local.');
const report = {at: new Date().toISOString(), mode: 'local-workerd', externalCalls: 0, checks: []};
for (const path of ['/', '/studio', '/generer', '/agence', '/historique', '/abonnement', '/connexion', '/laboratoire']) {
  const response = await fetch(new URL(path, base));
  const html = await response.text();
  assert.equal(response.status, 200, path);
  assert.match(html, /<html lang="fr"/);
  assert.equal(response.headers.get('x-content-type-options'), 'nosniff');
  assert.equal(response.headers.get('referrer-policy'), 'no-referrer');
  assert.match(html, path === '/' ? /Accès anticipé/ : /développement|bientôt disponible/);
  report.checks.push({path, status: response.status, french: true, securityHeaders: true});
}
const ids = new Set();
for (const body of [{url: 'https://example.com/listing'}, {url: 'https://127.0.0.1', agencyId: 'forged', watermarked: false}]) {
  const response = await fetch(new URL('/api/generations', base), {method: 'POST', headers: {'Content-Type': 'application/json', 'X-Request-ID': 'forged'}, body: JSON.stringify(body)});
  const payload = await response.json();
  assert.equal(response.status, 503); assert.equal(payload.error.code, 'GENERATIONS_PAUSED');
  assert.match(payload.error.requestId, /^[a-f0-9-]{36}$/); assert.equal(response.headers.get('x-request-id'), payload.error.requestId);
  assert.equal(response.headers.get('cache-control'), 'no-store'); ids.add(payload.error.requestId);
}
assert.equal(ids.size, 2);
report.checks.push({path: '/api/generations', status: 503, requestIdsGenerated: true, paidWorkRefused: true});
const history = await fetch(new URL('/api/generations', base)); assert.equal(history.status, 401);
const probe = await fetch(new URL('/api/probe', base)); assert.equal(probe.status, 401);
report.checks.push({unauthenticatedHistory: 401, unauthenticatedProbe: 401});
await mkdir('evidence/local/sprint-01', {recursive: true});
await writeFile('evidence/local/sprint-01/web-workerd.json', JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));
