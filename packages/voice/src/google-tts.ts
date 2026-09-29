import {GoogleVoiceConfig, VoiceFailure, VoiceText} from '@bienvu/contracts';
import {googleJson, sha256, type VoiceFetch} from './http';

const endpoint = 'https://texttospeech.googleapis.com/v1';
export const GOOGLE_TTS_PRICE = {date: '2026-09-28', currency: 'USD', microsPerCharacterAfterFreeTier: 30,
  monthlyFreeCharacters: 1_000_000} as const;
export const MAX_VOICE_AUDIO_BYTES = 7 * 1024 * 1024;

export function voiceRequest(configInput: unknown, textInput: unknown) {
  const config = GoogleVoiceConfig.safeParse(configInput), text = VoiceText.safeParse(textInput);
  if (!config.success) throw new VoiceFailure('VOICE_CONFIG_INVALID');
  if (!text.success) throw new VoiceFailure('VOICE_TEXT_INVALID');
  return {config: config.data, text: text.data, characters: [...text.data].length,
    utf8Bytes: new TextEncoder().encode(text.data).byteLength};
}

export async function voiceCacheKey(configInput: unknown, textInput: unknown): Promise<string> {
  const {config, text} = voiceRequest(configInput, textInput);
  return sha256(new TextEncoder().encode(JSON.stringify({config, text})));
}

export function googleTts(configInput: unknown, accessToken: () => Promise<string>, options: {fetch?: VoiceFetch} = {}) {
  const parsed = GoogleVoiceConfig.safeParse(configInput);
  if (!parsed.success) throw new VoiceFailure('VOICE_CONFIG_INVALID');
  const config = parsed.data;
  async function headers() {
    let token: string;
    try {token = await accessToken();} catch (error) {
      if (error instanceof VoiceFailure) throw error;
      throw new VoiceFailure('VOICE_AUTH_FAILED');
    }
    if (!/^[\x21-\x7E]{20,8192}$/.test(token)) throw new VoiceFailure('VOICE_AUTH_FAILED');
    return {'authorization': `Bearer ${token}`, 'x-goog-user-project': config.projectId, 'content-type': 'application/json'};
  }
  return {
    async voices(): Promise<string[]> {
      const response = await googleJson(`${endpoint}/voices?languageCode=fr-FR`, {method: 'GET', headers: await headers()},
        {fetch: options.fetch ?? fetch, maxBytes: 256_000, timeoutMs: 15_000});
      const body = response.body as {voices?: unknown[]} | null;
      if (!body || !Array.isArray(body.voices) || body.voices.length > 500) throw new VoiceFailure('VOICE_RESPONSE_INVALID');
      return body.voices.flatMap(value => {
        if (!value || typeof value !== 'object') return [];
        const item = value as Record<string, unknown>;
        return typeof item.name === 'string' && /^fr-FR-Chirp3-HD-[A-Za-z]+$/.test(item.name)
          && Array.isArray(item.languageCodes) && item.languageCodes.includes('fr-FR') ? [item.name] : [];
      }).sort();
    },
    async synthesize(textInput: unknown) {
      const request = voiceRequest(config, textInput);
      const requestId = crypto.randomUUID(), started = Date.now();
      const response = await googleJson(`${endpoint}/text:synthesize`, {method: 'POST', headers: await headers(), body: JSON.stringify({
        input: {text: request.text}, voice: {languageCode: config.language, name: config.voice}, audioConfig: {audioEncoding: config.encoding},
      })}, {fetch: options.fetch ?? fetch, maxBytes: Math.ceil(MAX_VOICE_AUDIO_BYTES * 4 / 3) + 4096, timeoutMs: 45_000});
      const body = response.body as {audioContent?: unknown} | null;
      if (!body || typeof body.audioContent !== 'string' || body.audioContent.length % 4 !== 0
        || /[^A-Za-z0-9+/=]/.test(body.audioContent) || /=/.test(body.audioContent.slice(0, -2)))
        throw new VoiceFailure('VOICE_RESPONSE_INVALID');
      let bytes: Uint8Array;
      try {bytes = Uint8Array.from(atob(body.audioContent), char => char.charCodeAt(0));}
      catch {throw new VoiceFailure('VOICE_RESPONSE_INVALID');}
      if (bytes.byteLength < 44 || bytes.byteLength > MAX_VOICE_AUDIO_BYTES
        || new TextDecoder().decode(bytes.subarray(0, 4)) !== 'RIFF' || new TextDecoder().decode(bytes.subarray(8, 12)) !== 'WAVE')
        throw new VoiceFailure('VOICE_RESPONSE_INVALID');
      return {bytes, sha256: await sha256(bytes), cacheKey: await voiceCacheKey(config, request.text),
        mime: 'audio/wav' as const, config, requestId, providerRequestId: response.providerRequestId,
        requestDurationMs: Date.now() - started,
        usage: {inputCharacters: request.characters, inputUtf8Bytes: request.utf8Bytes, source: 'counted_request' as const, providerUsage: null},
        cost: {currency: 'USD' as const, priceDate: GOOGLE_TTS_PRICE.date,
          estimatedMicrosBeforeFreeTier: request.characters * GOOGLE_TTS_PRICE.microsPerCharacterAfterFreeTier,
          actualBilledMicros: null, freeTierRemainingCharacters: null},
      };
    },
  };
}
