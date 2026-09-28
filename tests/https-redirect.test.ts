import {test} from 'node:test';
import assert from 'node:assert/strict';
import {httpsRedirect} from '../apps/web/lib/https-redirect';

const env = {PROBE_MODE: 'remote', BETTER_AUTH_URL: 'https://bienvu.online'};

test('HTTP distant redirige vers l’origine configurée, en conservant chemin et paramètres', () => {
  const response = httpsRedirect(new Request('http://bienvu.online/connexion?verified=1'), env);
  assert.equal(response?.status, 308);
  assert.equal(response.headers.get('location'), 'https://bienvu.online/connexion?verified=1');
  const forged = httpsRedirect(new Request('http://untrusted.example//evil.example/path', {
    headers: {'x-forwarded-host': 'evil.example', 'x-forwarded-proto': 'https'},
  }), env);
  assert.equal(new URL(forged!.headers.get('location')!).origin, env.BETTER_AUTH_URL);
});

test('HTTPS ne boucle pas et le développement local reste en HTTP', () => {
  assert.equal(httpsRedirect(new Request('https://bienvu.online/connexion', {
    headers: {'x-forwarded-proto': 'http'},
  }), env), null);
  assert.equal(httpsRedirect(new Request('http://localhost:8787/connexion'), {
    PROBE_MODE: 'local', BETTER_AUTH_URL: 'http://localhost:8787',
  }), null);
});

test('une origine distante invalide ne redirige pas vers une URL non sûre', () => {
  for (const origin of ['', 'http://bienvu.online', 'https://bienvu.online/path', 'https://user:password@bienvu.online']) {
    const response = httpsRedirect(new Request('http://bienvu.online/connexion'), {...env, BETTER_AUTH_URL: origin});
    assert.equal(response?.status, 503);
    assert.equal(response.headers.get('location'), null);
  }
});
