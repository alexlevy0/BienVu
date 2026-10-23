import { test } from 'node:test';
import assert from 'node:assert/strict';
import { betaHomepageRedirect } from '../apps/web/lib/beta-homepage';
import { authReturnPath } from '../apps/web/lib/auth-navigation';
import {
  defaultVideoCustomization,
  defaultAvatarCustomization,
  cartesiaParisianVoices,
  generationCreditCost,
} from '../packages/contracts/src/index';
import { parseBetaVoice, withBetaVoice } from '../apps/web/lib/beta-preferences';
import {
  applyHomeRenderPreset,
  homeRenderExampleCredits,
  parseHomeRenderPreset,
} from '../apps/web/lib/home-render-presets';

test('beta homepage uses the existing origin while production requests are untouched', () => {
  for (const url of ['https://bienvu.online/', 'https://bienvu.online/beta', 'https://beta.bienvu.online.evil.test/'])
    assert.equal(betaHomepageRedirect(new Request(url)), null);
  const response = betaHomepageRedirect(new Request('https://beta.bienvu.online/?utm_source=review'))!;
  assert.equal(response.status, 302);
  assert.equal(response.headers.get('Location'), 'https://bienvu.online/beta?utm_source=review');
  assert.equal(response.headers.get('X-Robots-Tag'), 'noindex, nofollow');
});
test('an auditioned voice keeps the selected rendering options and their price', () => {
  const voice = cartesiaParisianVoices[1].id;
  const original = applyHomeRenderPreset(
    'avatar-ai',
    defaultVideoCustomization(),
    [0, 1, 2, 3],
    defaultAvatarCustomization('example'),
  );
  const selected = withBetaVoice(original, voice);
  assert.equal(selected.voice, voice);
  assert.deepEqual(selected.avatar, original.avatar);
  assert.deepEqual(selected.runwayPhotos, [0, 1, 2, 3]);
  assert.equal(generationCreditCost(selected, 20), homeRenderExampleCredits('avatar-ai'));
  assert.equal(withBetaVoice(original, 'https://invalid.example/voice'), original);
  assert.equal(parseBetaVoice('fish-manon'), null);
  assert.equal(parseBetaVoice(voice), voice);
});
test('prepared demo choices map to the real creation price without enabling paid options on standard', () => {
  for (const [preset, cost] of [
    ['standard', 1],
    ['avatar', 3],
    ['avatar-ai', 7],
  ] as const) {
    const restored = parseHomeRenderPreset(preset)!;
    const settings = applyHomeRenderPreset(
      restored,
      defaultVideoCustomization(),
      [0, 1, 2, 3],
      defaultAvatarCustomization('example'),
    );
    assert.equal(generationCreditCost(settings, 20), cost);
    if (preset === 'standard') {
      assert.equal(settings.avatar, undefined);
      assert.deepEqual(settings.runwayPhotos, []);
    }
  }
  assert.equal(parseHomeRenderPreset('arbitrary'), null);
});
test('beta cannot become an open redirect or a proxy for mutations', () => {
  const response = betaHomepageRedirect(new Request('https://beta.bienvu.online//evil.test/'))!;
  assert.equal(new URL(response.headers.get('Location')!).origin, 'https://bienvu.online');
  assert.equal(betaHomepageRedirect(new Request('https://beta.bienvu.online/', { method: 'POST' }))?.status, 405);
  assert.equal(
    betaHomepageRedirect(new Request('https://beta.bienvu.online/abonnement'))?.headers.get('Location'),
    'https://bienvu.online/abonnement',
  );
  assert.equal(authReturnPath('/beta'), '/beta');
  assert.equal(authReturnPath('//beta.bienvu.online/'), null);
});
