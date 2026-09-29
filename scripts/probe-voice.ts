import {readFile, stat} from 'node:fs/promises';
import {existsSync} from 'node:fs';
import {resolve} from 'node:path';
import {GoogleVoiceConfig, VoiceFailure} from '../packages/contracts/src/voice';
import {googleServiceAccountAccess, googleTts, voiceCacheKey, voiceRequest} from '../packages/voice/src/index';
import {frenchVoiceSample, toneFixture} from '../fixtures/voice';
import {runVoiceProbe} from './voice-probe-store';

async function main() {
  const mode = process.argv[2] ?? '--check';
  if (!['--check', '--voices', '--real', '--mock'].includes(mode) || process.argv.length > 3) throw new VoiceFailure('VOICE_CONFIG_INVALID');
  if (existsSync('.env.voice')) process.loadEnvFile('.env.voice');
  const mock = mode === '--mock';
  const configResult = GoogleVoiceConfig.safeParse({projectId: mock ? 'bienvu-fixture' : process.env.GOOGLE_CLOUD_PROJECT,
    voice: process.env.GOOGLE_TTS_VOICE || undefined});
  if (!configResult.success) throw new VoiceFailure('VOICE_CONFIG_INVALID');
  const config = configResult.data;
  let access: () => Promise<string>;
  if (mock) access = async () => 'fixture-token-never-sent-to-google';
  else {
    const file = resolve(process.env.GOOGLE_APPLICATION_CREDENTIALS || '.secrets/google-tts.json');
    if (!existsSync(file) || (await stat(file)).size > 16_384) throw new VoiceFailure('VOICE_CONFIG_INVALID');
    access = await googleServiceAccountAccess(JSON.parse(await readFile(file, 'utf8')), config.projectId);
  }
  if (mode === '--check') {
    console.log(JSON.stringify({configuration: 'valid', projectId: config.projectId, voice: config.voice, networkRequests: 0, apiAccess: 'not_tested'})); return;
  }
  const client = googleTts(config, access, mock ? {fetch: async () => Response.json({audioContent: Buffer.from(toneFixture()).toString('base64')})} : {});
  if (mode === '--voices') {
    const voices = await client.voices();
    console.log(JSON.stringify({projectId: config.projectId, voices, configuredVoiceAvailable: voices.includes(config.voice), synthesisCalls: 0}));
    if (!voices.includes(config.voice)) throw new VoiceFailure('VOICE_NOT_FOUND');
    return;
  }
  const request = voiceRequest(config, frenchVoiceSample);
  const baseline = process.env.VOICE_PROBE_OTHER_PROVISIONS_CENTS;
  const result = await runVoiceProbe({directory: resolve(`evidence/local/sprint-05/google-tts/${mock ? 'mock' : 'real'}`),
    key: await voiceCacheKey(config, request.text), characters: request.characters,
    baselineCents: mock ? 0 : baseline && /^\d+$/.test(baseline) ? Number(baseline) : -1,
    budgetMonth: mock ? new Date().toISOString().slice(0, 7) : process.env.VOICE_PROBE_BUDGET_MONTH ?? '',
    produce: async () => {
      if (!mock && !(await client.voices()).includes(config.voice)) throw new VoiceFailure('VOICE_NOT_FOUND');
      const {bytes, ...report} = await client.synthesize(request.text);
      return {bytes, report: {...report, syntheticListing: true, providerMock: mock, text: request.text}};
    },
  });
  console.log(JSON.stringify({mode, cached: result.cached, audioFile: result.audioFile, reportFile: result.reportFile,
    report: result.report}));
}

main().catch(error => {
  const code = error instanceof VoiceFailure ? error.code : 'VOICE_CONFIG_OR_PROBE_FAILED';
  const help = code === 'VOICE_BILLING_DISABLED'
    ? 'Google refuse la requête : facturation inactive sur GOOGLE_CLOUD_PROJECT. Vérifier que ce projet est lié à un compte de facturation actif. Voir docs/VOIX-GOOGLE.md.'
    : code === 'VOICE_API_DISABLED'
      ? 'Activer Cloud Text-to-Speech API sur le projet GOOGLE_CLOUD_PROJECT. Voir docs/VOIX-GOOGLE.md.'
      : 'Voir docs/VOIX-GOOGLE.md ; ne pas coller de clé ni de jeton dans une conversation.';
  console.error(JSON.stringify({error: code, help}));
  process.exitCode = 1;
});
