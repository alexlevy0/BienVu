import { test } from 'node:test';
import assert from 'node:assert/strict';
import { optionalJson, RequestFailure } from '../apps/web/lib/http';

// En production, Next/OpenNext transmet un flux vide aux POST envoyés sans corps.
const post = (body: BodyInit | null, headers: Record<string, string> = {}) =>
  new Request('https://bienvu.online/api/imports/draft', {
    method: 'POST',
    headers,
    body,
    duplex: 'half',
  } as RequestInit);
const empty = () =>
  new ReadableStream<Uint8Array>({
    start(controller) {
      controller.close();
    },
  });

test('un POST sans Content-Type vaut un objet vide, même avec le flux vide ajouté par Next', async () => {
  const request = post(empty());
  assert.notEqual(request.body, null);
  assert.deepEqual(await optionalJson(request, 1000), {});
  assert.deepEqual(await optionalJson(post(null), 1000), {});
});

test('un corps JSON annoncé reste lu et borné', async () => {
  assert.deepEqual(
    await optionalJson(post(JSON.stringify({ category: 'vehicle' }), { 'Content-Type': 'application/json' }), 1000),
    { category: 'vehicle' },
  );
  await assert.rejects(
    optionalJson(post(JSON.stringify({ text: 'x'.repeat(2000) }), { 'Content-Type': 'application/json' }), 1000),
    (error) => error instanceof RequestFailure && error.code === 'FILE_TOO_LARGE',
  );
});

test('un autre Content-Type ou un JSON invalide reste refusé', async () => {
  for (const request of [
    post('{"category":"vehicle"}', { 'Content-Type': 'text/plain' }),
    post('{', { 'Content-Type': 'application/json' }),
  ])
    await assert.rejects(
      optionalJson(request, 1000),
      (error) => error instanceof RequestFailure && error.code === 'VALIDATION_ERROR',
    );
});
