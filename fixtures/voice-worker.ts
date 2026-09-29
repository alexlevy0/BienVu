import {GoogleVoiceConfig} from '../packages/contracts/src/voice';
import {googleServiceAccountAccess, googleTts} from '../packages/voice/src/index';
import {toneFixture} from './voice';

// Recette workerd locale uniquement, sans bindings, sans identifiants réels.
export default {async fetch() {
  const pair = await crypto.subtle.generateKey({name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048,
    publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256'}, true, ['sign', 'verify']);
  const binary = new Uint8Array(await crypto.subtle.exportKey('pkcs8', pair.privateKey));
  const config = GoogleVoiceConfig.parse({projectId: 'bienvu-fixture'});
  let authCalls = 0, synthesisCalls = 0;
  const fixtureFetch = async (url: string) => {
    if (url === 'https://oauth2.googleapis.com/token') {
      authCalls++; return Response.json({access_token: 'fixture-token-not-sent-outside-workerd', token_type: 'Bearer', expires_in: 3600});
    }
    if (url === 'https://texttospeech.googleapis.com/v1/text:synthesize') {
      synthesisCalls++; const wav = toneFixture();
      let text = ''; for (const byte of wav) text += String.fromCharCode(byte);
      return Response.json({audioContent: btoa(text)});
    }
    throw new Error('UNEXPECTED_NETWORK_REQUEST');
  };
  const access = await googleServiceAccountAccess({type: 'service_account', project_id: config.projectId,
    client_email: 'bienvu-tts@bienvu-fixture.iam.gserviceaccount.com', private_key_id: 'a'.repeat(40),
    token_uri: 'https://oauth2.googleapis.com/token',
    private_key: `-----BEGIN PRIVATE KEY-----\n${btoa(String.fromCharCode(...binary))}\n-----END PRIVATE KEY-----`},
  config.projectId, {fetch: fixtureFetch});
  const result = await googleTts(config, access, {fetch: fixtureFetch}).synthesize('Fixture workerd, aucune voix réelle.');
  await access();
  return Response.json({providerMock: true, authCalls, synthesisCalls, sizeBytes: result.bytes.length,
    sha256: result.sha256, actualBilledMicros: result.cost.actualBilledMicros});
}};
