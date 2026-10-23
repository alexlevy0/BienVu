import { test } from 'node:test';
import assert from 'node:assert/strict';
import { retryIdempotentD1 } from '../apps/web/lib/d1-retry';
import { runSocialBatch } from '../apps/web/lib/social-publisher';
import type { SocialEnv } from '../apps/web/lib/social';

test('D1 : reprise transitoire bornée, erreur finale conservée, erreurs SQL jamais rejouées', async () => {
  for (const message of ['D1_ERROR: Network connection lost.', 'D1_ERROR: internal error; reference = fixture-123']) {
    let attempts = 0;
    const error = new Error(message);
    await assert.rejects(
      retryIdempotentD1(async () => {
        attempts++;
        throw error;
      }),
      (e) => e === error,
    );
    assert.equal(attempts, 3);
  }
  for (const message of [
    'D1_ERROR: UNIQUE constraint failed: jobs.id',
    'D1_ERROR: no such table: jobs',
    'Network connection lost.',
  ]) {
    let attempts = 0;
    const error = new Error(message);
    await assert.rejects(
      retryIdempotentD1(async () => {
        attempts++;
        throw error;
      }),
      (e) => e === error,
    );
    assert.equal(attempts, 1);
  }
});

test('publication sociale : lecture D1 reprise avant toute acquisition ou requête Meta', async () => {
  let reads = 0,
    providers = 0;
  const env = {
    SOCIAL_ENABLED: 'true',
    META_APP_ID: '123456789',
    META_APP_SECRET: 'fixture-secret',
    SOCIAL_TOKEN_ENCRYPTION_KEY: 'a'.repeat(43),
    DB: {
      prepare(sql: string) {
        assert.match(sql, /^SELECT t.id FROM social_targets/);
        return {
          bind() {
            return {
              async all() {
                if (++reads === 1) throw new Error('D1_ERROR: internal error; reference = fixture-123');
                return { results: [] };
              },
            };
          },
        };
      },
    },
  } as unknown as SocialEnv;
  await runSocialBatch(env, async () => {
    providers++;
    throw new Error('UNEXPECTED_PROVIDER_CALL');
  });
  assert.equal(reads, 2);
  assert.equal(providers, 0);
});
