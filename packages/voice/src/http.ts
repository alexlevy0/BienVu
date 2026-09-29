import {VoiceFailure, type VoiceFailureCode} from '@bienvu/contracts';

export type VoiceFetch = (url: string, init: RequestInit) => Promise<Response>;
export const providerRequestId = (response: Response) => {
  const value = response.headers.get('x-request-id') ?? response.headers.get('x-goog-request-id');
  return value && /^[a-zA-Z0-9_.:/-]{1,128}$/.test(value) ? value : null;
};

async function boundedJson(response: Response, maxBytes: number): Promise<unknown> {
  const length = response.headers.get('content-length');
  if (length && (!/^\d+$/.test(length) || Number(length) > maxBytes)) {
    await response.body?.cancel(); throw new VoiceFailure('VOICE_RESPONSE_INVALID');
  }
  const reader = response.body?.getReader();
  if (!reader) throw new VoiceFailure('VOICE_RESPONSE_INVALID');
  const chunks: Uint8Array[] = []; let size = 0;
  try {
    while (true) {
      const part = await reader.read();
      if (part.done) break;
      size += part.value.byteLength;
      if (size > maxBytes) throw new VoiceFailure('VOICE_RESPONSE_INVALID');
      chunks.push(part.value);
    }
  } finally {await reader.cancel().catch(() => undefined); reader.releaseLock();}
  const bytes = new Uint8Array(size); let offset = 0;
  for (const chunk of chunks) {bytes.set(chunk, offset); offset += chunk.length;}
  try {return JSON.parse(new TextDecoder('utf-8', {fatal: true}).decode(bytes));}
  catch {throw new VoiceFailure('VOICE_RESPONSE_INVALID');}
}

// Liste blanche issue de google.rpc.ErrorInfo. Ni message libre ni métadonnée
// Google dans les erreurs : les corps peuvent contenir des identifiants privés.
function configurationFailure(value: unknown): VoiceFailureCode | undefined {
  if (!value || typeof value !== 'object') return;
  const error = (value as {error?: unknown}).error;
  if (!error || typeof error !== 'object') return;
  const details = (error as {details?: unknown}).details;
  if (!Array.isArray(details)) return;
  for (const detail of details) {
    if (!detail || typeof detail !== 'object') continue;
    const info = detail as Record<string, unknown>;
    if (info['@type'] !== 'type.googleapis.com/google.rpc.ErrorInfo' || info.domain !== 'googleapis.com') continue;
    if (info.reason === 'BILLING_DISABLED') return 'VOICE_BILLING_DISABLED';
    if (info.reason === 'SERVICE_DISABLED') return 'VOICE_API_DISABLED';
  }
}

// La limite couvre aussi les réponses chunked et le délai couvre la lecture du corps.
export async function googleJson(url: string, init: RequestInit, options: {
  fetch: VoiceFetch; maxBytes: number; timeoutMs: number; auth?: boolean;
}): Promise<{body: unknown; providerRequestId: string | null}> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), options.timeoutMs);
  try {
    // Compatible workerd : un 3xx est traité ci-dessous comme un échec,
    // sans suivre la redirection ni divulguer l'authentification.
    // Le fetch natif Workers doit être appelé sans `this` provenant d'options.
    const performFetch = options.fetch;
    const response = await performFetch(url, {...init, redirect: 'manual', signal: controller.signal});
    if (!response.ok) {
      if (!options.auth && response.status === 403) {
        let code: VoiceFailureCode | undefined;
        try {code = configurationFailure(await boundedJson(response, 16_384));} catch { /* Garde le refus HTTP si le diagnostic est illisible. */ }
        if (code) throw new VoiceFailure(code);
      } else await response.body?.cancel();
      if (options.auth || response.status === 401 || response.status === 403) throw new VoiceFailure('VOICE_AUTH_FAILED');
      if (response.status === 429) throw new VoiceFailure('VOICE_RATE_LIMITED');
      throw new VoiceFailure(response.status >= 500 ? 'VOICE_UNAVAILABLE' : 'VOICE_REQUEST_REJECTED');
    }
    return {body: await boundedJson(response, options.maxBytes), providerRequestId: providerRequestId(response)};
  } catch (error) {
    if (controller.signal.aborted) throw new VoiceFailure('VOICE_TIMEOUT');
    if (error instanceof VoiceFailure) throw error;
    // Le message Google, les requêtes et les clés ne remontent jamais dans les logs.
    throw new VoiceFailure(options.auth ? 'VOICE_AUTH_FAILED' : 'VOICE_UNAVAILABLE');
  } finally {clearTimeout(timer);}
}

export async function sha256(bytes: Uint8Array): Promise<string> {
  const hash = await crypto.subtle.digest('SHA-256', new Uint8Array(bytes));
  return [...new Uint8Array(hash)].map(value => value.toString(16).padStart(2, '0')).join('');
}
