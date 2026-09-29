import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp, readFile, rm, writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {GoogleVoiceConfig, VoiceFailure} from '../packages/contracts/src/voice';
import {googleServiceAccountAccess, googleTts, voiceCacheKey, voiceRequest} from '../packages/voice/src/index';
import {googleJson} from '../packages/voice/src/http';
import {measureVoiceWav, voiceSceneTiming} from '../apps/renderer/src/voice-audio';
import {runVoiceProbe} from '../scripts/voice-probe-store';
import {frenchVoiceSample, toneFixture} from '../fixtures/voice';

const config = GoogleVoiceConfig.parse({projectId: 'bienvu-fixture'});
const access = async () => 'token-fixture-never-sent-to-google';
const rejected = (code: string) => (error: unknown) => error instanceof VoiceFailure && error.code === code;

test('voix Google : requête française bornée, coûts avant gratuité et facture inconnue', async () => {
  const wav = toneFixture(1501); let calls = 0;
  const client = googleTts(config, access, {fetch: async (url, init) => {
    calls++; assert.equal(url, 'https://texttospeech.googleapis.com/v1/text:synthesize');
    assert.equal(init.redirect, 'manual'); assert.ok(init.signal);
    assert.deepEqual(JSON.parse(String(init.body)), {input: {text: 'À Lyon : 42,06 m².'},
      voice: {languageCode: 'fr-FR', name: config.voice}, audioConfig: {audioEncoding: 'LINEAR16'}});
    return Response.json({audioContent: Buffer.from(wav).toString('base64')}, {headers: {'x-request-id': 'fixture-google-1'}});
  }});
  const result = await client.synthesize(' À Lyon : 42,06 m². ');
  assert.equal(calls, 1); assert.deepEqual(result.bytes, wav); assert.equal(result.providerRequestId, 'fixture-google-1');
  assert.equal(result.usage.inputCharacters, [...'À Lyon : 42,06 m².'].length);
  assert.ok(result.usage.inputUtf8Bytes > result.usage.inputCharacters);
  assert.equal(result.usage.providerUsage, null); assert.equal(result.cost.actualBilledMicros, null);
  assert.equal(result.cost.freeTierRemainingCharacters, null);
  assert.equal(result.cost.estimatedMicrosBeforeFreeTier, result.usage.inputCharacters * 30);
  assert.equal(measureVoiceWav(result.bytes).durationMs, 1501);
});

test('voix Google : seule la famille française Chirp 3 HD est sélectionnée depuis la liste réelle du fournisseur', async () => {
  const client = googleTts(config, access, {fetch: async (url, init) => {
    assert.equal(url, 'https://texttospeech.googleapis.com/v1/voices?languageCode=fr-FR'); assert.equal(init.method, 'GET');
    return Response.json({voices: [{name: config.voice, languageCodes: ['fr-FR']},
      {name: 'en-US-Chirp3-HD-Aoede', languageCodes: ['en-US']}, {name: 'fr-FR-Neural2-A', languageCodes: ['fr-FR']} ]});
  }});
  assert.deepEqual(await client.voices(), [config.voice]);
  assert.throws(() => googleTts({...config, voice: 'en-US-Chirp3-HD-Aoede'}, access), rejected('VOICE_CONFIG_INVALID'));
});

test('voix Google : entrées trop longues et configuration invalide refusées sans appel', async () => {
  let calls = 0;
  const client = googleTts(config, access, {fetch: async () => {calls++; throw new Error('unreachable');}});
  for (const text of ['', 'a'.repeat(1001), 'invalide\u0000']) await assert.rejects(client.synthesize(text), rejected('VOICE_TEXT_INVALID'));
  assert.equal(calls, 0); assert.throws(() => voiceRequest({...config, projectId: 'http://host'}, 'Bonjour'), rejected('VOICE_CONFIG_INVALID'));
  const key = await voiceCacheKey(config, frenchVoiceSample);
  assert.equal(key, await voiceCacheKey(config, frenchVoiceSample));
  assert.notEqual(key, await voiceCacheKey({...config, voice: 'fr-FR-Chirp3-HD-Kore'}, frenchVoiceSample));
  assert.notEqual(key, await voiceCacheKey(config, frenchVoiceSample + ' Suite.'));
});

test('voix Google : erreurs fournisseur expurgées, aucune relance automatique', async () => {
  for (const [status, code] of [[401, 'VOICE_AUTH_FAILED'], [403, 'VOICE_AUTH_FAILED'], [429, 'VOICE_RATE_LIMITED'],
    [302, 'VOICE_REQUEST_REJECTED'], [400, 'VOICE_REQUEST_REJECTED'], [503, 'VOICE_UNAVAILABLE']] as const) {
    let calls = 0;
    const client = googleTts(config, access, {fetch: async () => {calls++; return new Response('secret-et-texte-prive', {status});}});
    await assert.rejects(client.synthesize('Bonjour'), error => {
      assert.ok(rejected(code)(error)); assert.ok(!String(error).includes('secret')); return true;
    });
    assert.equal(calls, 1);
  }
  const client = googleTts(config, access, {fetch: async () => {throw new Error('secret-in-network-error');}});
  await assert.rejects(client.synthesize('Bonjour'), rejected('VOICE_UNAVAILABLE'));
  const failedAccess = googleTts(config, async () => {throw new Error('secret-in-auth-error');});
  await assert.rejects(failedAccess.synthesize('Bonjour'), rejected('VOICE_AUTH_FAILED'));
});

test('voix Google : base64, faux WAV, réponses volumineuses et JSON invalide refusés', async () => {
  for (const body of [{}, {audioContent: '**'}, {audioContent: 'a===abc='}, {audioContent: Buffer.from('not a wav').toString('base64')}]) {
    const client = googleTts(config, access, {fetch: async () => Response.json(body)});
    await assert.rejects(client.synthesize('Bonjour'), rejected('VOICE_RESPONSE_INVALID'));
  }
  await assert.rejects(googleJson('https://fixture.invalid', {}, {fetch: async () => new Response('x'.repeat(50)),
    maxBytes: 20, timeoutMs: 1000}), rejected('VOICE_RESPONSE_INVALID'));
  await assert.rejects(googleJson('https://fixture.invalid', {}, {fetch: async () => new Response('{}', {headers: {'content-length': '99'}}),
    maxBytes: 20, timeoutMs: 1000}), rejected('VOICE_RESPONSE_INVALID'));
  await assert.rejects(googleJson('https://fixture.invalid', {}, {fetch: async () => new Response('not json'),
    maxBytes: 20, timeoutMs: 1000}), rejected('VOICE_RESPONSE_INVALID'));
});

test('voix Google : facturation et API désactivées distinguées sans exposer le corps de refus', async () => {
  const body = (reason: string, domain = 'googleapis.com') => ({error: {status: 'PERMISSION_DENIED',
    message: 'secret-texte-et-adresse-privee', details: [{'@type': 'type.googleapis.com/google.rpc.ErrorInfo',
      domain, reason, metadata: {consumer: 'secret-project'}}]}});
  for (const [reason, code] of [['BILLING_DISABLED', 'VOICE_BILLING_DISABLED'], ['SERVICE_DISABLED', 'VOICE_API_DISABLED'],
    ['UNKNOWN_REASON', 'VOICE_AUTH_FAILED']] as const) {
    const client = googleTts(config, access, {fetch: async () => Response.json(body(reason), {status: 403})});
    await assert.rejects(client.voices(), error => {
      assert.ok(rejected(code)(error)); assert.ok(!JSON.stringify(error).includes('secret'));
      assert.equal((error as Error).message, code); return true;
    });
  }
  for (const result of [body('BILLING_DISABLED', 'other.example'), {error: {message: 'BILLING_DISABLED'}}]) {
    const client = googleTts(config, access, {fetch: async () => Response.json(result, {status: 403})});
    await assert.rejects(client.voices(), rejected('VOICE_AUTH_FAILED'));
  }
  const oversized = googleTts(config, access, {fetch: async () => new Response('x'.repeat(20_000), {status: 403})});
  await assert.rejects(oversized.voices(), rejected('VOICE_AUTH_FAILED'));
  const limited = googleTts(config, access, {fetch: async () => Response.json(body('BILLING_DISABLED'), {status: 429})});
  await assert.rejects(limited.voices(), rejected('VOICE_RATE_LIMITED'));
});

test('voix Google : délai maximal couvre une réponse dont le corps ne se termine pas', async () => {
  await assert.rejects(googleJson('https://fixture.invalid', {}, {maxBytes: 20, timeoutMs: 25, fetch: async (_url, init) =>
    new Response(new ReadableStream({start(controller) {
      controller.enqueue(new TextEncoder().encode('{'));
      init.signal?.addEventListener('abort', () => controller.error(new DOMException('Aborted', 'AbortError')), {once: true});
    }}))}), rejected('VOICE_TIMEOUT'));
});

test('auth Google : signature RSA réelle, portée limitée au protocole attendu, cache et renouvellement', async () => {
  const key = await crypto.subtle.generateKey({name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048,
    publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256'}, true, ['sign', 'verify']);
  const exported = Buffer.from(await crypto.subtle.exportKey('pkcs8', key.privateKey)).toString('base64');
  const account = {type: 'service_account', project_id: config.projectId, client_email: 'bienvu-tts@bienvu-fixture.iam.gserviceaccount.com',
    private_key_id: 'a'.repeat(40), token_uri: 'https://oauth2.googleapis.com/token',
    private_key: `-----BEGIN PRIVATE KEY-----\n${exported}\n-----END PRIVATE KEY-----`};
  let calls = 0, now = Date.parse('2026-09-28T12:00:00Z');
  const getToken = await googleServiceAccountAccess(account, config.projectId, {now: () => now, fetch: async (url, init) => {
    calls++; assert.equal(url, account.token_uri); assert.equal(init.redirect, 'manual');
    const form = new URLSearchParams(String(init.body));
    assert.equal(form.get('grant_type'), 'urn:ietf:params:oauth:grant-type:jwt-bearer');
    const [header, claims, signature] = form.get('assertion')!.split('.');
    const decoded = JSON.parse(Buffer.from(claims, 'base64url').toString());
    assert.equal(decoded.aud, account.token_uri); assert.equal(decoded.iss, account.client_email);
    assert.equal(decoded.scope, 'https://www.googleapis.com/auth/cloud-platform'); assert.equal(decoded.sub, undefined);
    assert.equal(decoded.exp - decoded.iat, 3600);
    assert.equal(await crypto.subtle.verify('RSASSA-PKCS1-v1_5', key.publicKey, Buffer.from(signature, 'base64url'),
      new TextEncoder().encode(`${header}.${claims}`)), true);
    return Response.json({access_token: 'fixture-access-token-kept-private', token_type: 'Bearer', expires_in: 3600});
  }});
  const tokens = await Promise.all([getToken(), getToken()]); assert.equal(tokens[0], tokens[1]); assert.equal(calls, 1);
  now += 1800_000; await getToken(); assert.equal(calls, 1);
  now += 1800_000; await getToken(); assert.equal(calls, 2);
  await assert.rejects(googleServiceAccountAccess({...account, token_uri: 'https://evil.example/token'}, config.projectId), rejected('VOICE_CONFIG_INVALID'));
  await assert.rejects(googleServiceAccountAccess(account, 'another-project'), rejected('VOICE_CONFIG_INVALID'));
  await assert.rejects(googleServiceAccountAccess({...account, private_key: 'invalid'}, config.projectId), rejected('VOICE_CONFIG_INVALID'));
});

test('mesure Node : vrais échantillons PCM, WAV tronqué, silence et longue durée', () => {
  const wav = toneFixture(1533), measured = measureVoiceWav(wav);
  assert.equal(measured.durationMs, 1533); assert.equal(measured.durationFrames, 46);
  assert.equal(measured.sampleFrames, 36792); assert.ok(measured.rmsDbfs > -30 && measured.rmsDbfs < -10);
  assert.throws(() => measureVoiceWav(wav.subarray(0, -2)), rejected('VOICE_AUDIO_INVALID'));
  assert.throws(() => measureVoiceWav(toneFixture(1000, true)), rejected('VOICE_AUDIO_SILENT'));
  assert.throws(() => measureVoiceWav(toneFixture(35001)), rejected('VOICE_DURATION_EXCEEDED'));
  const badRate = toneFixture(); new DataView(badRate.buffer).setUint32(28, 1234, true);
  assert.throws(() => measureVoiceWav(badRate), rejected('VOICE_AUDIO_INVALID'));
});

test('timing : 4 à 6 scènes, arrondi supérieur et silences ; aucune parole tronquée', () => {
  const durations = [4301, 5900, 7400, 4200]; const frames = voiceSceneTiming(durations);
  assert.ok(frames.reduce((sum, value) => sum + value) >= 600);
  assert.ok(frames.slice(0, -1).every((frame, index) => frame - Math.ceil(durations[index] * 30 / 1000) <= 9));
  assert.equal(frames.at(-1)! - Math.ceil(durations.at(-1)! * 30 / 1000), 36);
  const shortDurations = [2640,3840,2880,1640,3280];
  const shortFrames = voiceSceneTiming(shortDurations);
  assert.equal(shortFrames.reduce((sum, value) => sum + value), 600);
  assert.ok(shortFrames.every((frame, index) => frame >= Math.ceil(shortDurations[index] * 30 / 1000)));
  assert.ok(shortFrames.slice(0, -1).every((frame, index) => frame - Math.ceil(shortDurations[index] * 30 / 1000) === 9));
  assert.ok(shortFrames.at(-1)! - Math.ceil(shortDurations.at(-1)! * 30 / 1000) > 36);
  assert.ok(frames.every((value, index) => value >= Math.ceil(durations[index] * 30 / 1000) + 6));
  assert.throws(() => voiceSceneTiming([10000, 10000, 10000, 10000]), rejected('VOICE_DURATION_EXCEEDED'));
  assert.throws(() => voiceSceneTiming([1000, 1000, 1000]), rejected('VOICE_AUDIO_INVALID'));
});

test('sonde : stockage privé, reprise sans appel et fichier altéré refusé', async t => {
  const directory = await mkdtemp(path.join(tmpdir(), 'bienvu-voice-')); t.after(() => rm(directory, {recursive: true, force: true}));
  let calls = 0;
  const options = {directory, key: 'a'.repeat(64), characters: 100, baselineCents: 2200, budgetMonth: '2026-09',
    now: Date.parse('2026-09-28T12:00:00Z'), produce: async () => {calls++; return {bytes: toneFixture(), report: {providerMock: true}};}};
  const first = await runVoiceProbe(options), second = await runVoiceProbe(options);
  assert.equal(first.cached, false); assert.equal(second.cached, true); assert.equal(calls, 1);
  await writeFile(first.audioFile, toneFixture(1100));
  await assert.rejects(runVoiceProbe(options), rejected('VOICE_PROBE_REVIEW_REQUIRED')); assert.equal(calls, 1);
});

test('sonde : erreur conservée sans retry, concurrence et budget fermé', async t => {
  const directory = await mkdtemp(path.join(tmpdir(), 'bienvu-voice-')); t.after(() => rm(directory, {recursive: true, force: true}));
  let calls = 0;
  const options = {directory, key: 'a'.repeat(64), characters: 100, baselineCents: 2200, budgetMonth: '2026-09',
    now: Date.parse('2026-09-28T12:00:00Z'), produce: async () => {calls++; throw new VoiceFailure('VOICE_TIMEOUT');}};
  await assert.rejects(runVoiceProbe({...options, budgetMonth: '2026-08'}), rejected('VOICE_PROBE_REVIEW_REQUIRED'));
  await assert.rejects(runVoiceProbe({...options, baselineCents: 2499}), rejected('VOICE_PROBE_LIMIT')); assert.equal(calls, 0);
  await assert.rejects(runVoiceProbe(options), rejected('VOICE_TIMEOUT'));
  await assert.rejects(runVoiceProbe(options), rejected('VOICE_PROBE_REVIEW_REQUIRED')); assert.equal(calls, 1);
  const current = {...options, key: 'b'.repeat(64), produce: async () => {
    calls++; await new Promise(resolve => setTimeout(resolve, 50)); return {bytes: toneFixture(), report: {providerMock: true}};
  }};
  const concurrent = await Promise.allSettled([runVoiceProbe(current), runVoiceProbe(current)]);
  assert.equal(concurrent.filter(result => result.status === 'fulfilled').length, 1); assert.equal(calls, 2);
  await runVoiceProbe({...current, key: 'c'.repeat(64)});
  await assert.rejects(runVoiceProbe({...current, key: 'd'.repeat(64)}), rejected('VOICE_PROBE_LIMIT'));
  assert.equal(calls, 3);
  const ledger = JSON.parse(await readFile(path.join(directory, 'ledger.json'), 'utf8'));
  assert.deepEqual(ledger.map((item: {state: string}) => item.state), ['failed', 'done', 'done']);
});
