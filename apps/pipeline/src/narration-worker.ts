import {GoogleVoiceConfig,FishVoiceConfig, NarrationFailure, PreparedNarration, VoiceFailure} from '@bienvu/contracts';
import {findNarration} from '@bienvu/db';
import {openaiScripts} from '@bienvu/narration';
import {googleServiceAccountAccess, googleTts,fishTts} from '@bienvu/voice';
import {prepareJobNarration, readNarrationAudio, type NarrationProviders} from './narration';

// Bindings générés depuis Wrangler ; valeurs sensibles via `secret bulk`.
type Env = NarrationEnv;
type ProviderFactory = (env: Env) => Promise<NarrationProviders>;
const json = (body: unknown, status = 200) => Response.json(body, {status, headers: {'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff'}});

async function emptyBody(request: Request) {
  const reader = request.body?.getReader();
  if (!reader) return true;
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const first = await Promise.race([reader.read(), new Promise<null>(resolve => {timer = setTimeout(() => resolve(null), 2000);})]);
    return first?.done === true;
  } finally {clearTimeout(timer); await reader.cancel().catch(() => undefined); reader.releaseLock();}
}

async function authorized(request: Request, expected?: string) {
  if (!expected || expected.length < 32 || expected.length > 256) return false;
  const header = request.headers.get('authorization') ?? '';
  if (!header.startsWith('Bearer ') || header.length > 512) return false;
  const encoder = new TextEncoder();
  const [givenHash, expectedHash] = await Promise.all([
    crypto.subtle.digest('SHA-256', encoder.encode(header.slice(7))),
    crypto.subtle.digest('SHA-256', encoder.encode(expected)),
  ]);
  // Comparaison cryptographique native, portable sans extension non standard
  // ni comparaison de chaînes dépendant de leur contenu.
  const key = await crypto.subtle.importKey('raw', expectedHash, {name: 'HMAC', hash: 'SHA-256'}, false, ['sign', 'verify']);
  const signature = await crypto.subtle.sign('HMAC', key, givenHash);
  return crypto.subtle.verify('HMAC', key, signature, expectedHash);
}

export type FishVoiceEnv={FISH_API_KEY?:string;FISH_TTS_ENABLED?:string};
export async function realProviders(env: Pick<Env,'GOOGLE_SERVICE_ACCOUNT_JSON'|'GOOGLE_CLOUD_PROJECT'|'GOOGLE_TTS_VOICE'|'OPENAI_API_KEY'|'SCRIPT_MODEL'>&FishVoiceEnv,voiceName?:string,voiceEnabled=true): Promise<NarrationProviders> {
  const fish=voiceName?.startsWith('fish-')===true;
  const config=fish?FishVoiceConfig.parse({voice:voiceName}):GoogleVoiceConfig.parse({projectId:env.GOOGLE_CLOUD_PROJECT,voice:voiceName??env.GOOGLE_TTS_VOICE});
  if(!voiceEnabled)return {mode:'real',script:openaiScripts(env.OPENAI_API_KEY??'',env.SCRIPT_MODEL),voice:{
    config,
    synthesize:async()=>{throw new VoiceFailure('VOICE_CONFIG_INVALID');}}};
  if(config.provider==='fish'){
    if(env.FISH_TTS_ENABLED!=='true')throw new VoiceFailure('VOICE_UNAVAILABLE');
    const voice=fishTts(config,env.FISH_API_KEY??'');
    return {mode:'real',script:openaiScripts(env.OPENAI_API_KEY??'',env.SCRIPT_MODEL),voice:{config,synthesize:voice.synthesize}};
  }
  const secret = env.GOOGLE_SERVICE_ACCOUNT_JSON;
  if (!secret || secret.length > 16_384) throw new NarrationFailure('SCRIPT_CONFIG_INVALID');
  let account: unknown;
  try {account = JSON.parse(secret);} catch {throw new NarrationFailure('SCRIPT_CONFIG_INVALID');}
  const access = await googleServiceAccountAccess(account, config.projectId);
  const voice = googleTts(config, access);
  return {mode: 'real', script: openaiScripts(env.OPENAI_API_KEY ?? '', env.SCRIPT_MODEL), voice: {config, synthesize: voice.synthesize}};
}

// Surface opérateur bornée à un couple agence/job configuré côté serveur.
// Aucune entrée de texte, de modèle, de voix, de fixture ou d'URL côté client.
export async function handleNarrationRequest(request: Request, env: Env, factory: ProviderFactory): Promise<Response> {
  const requestId = crypto.randomUUID(), started = Date.now();
  let status = 500, errorCode: string | undefined;
  const calls = {script: 0, voice: 0};
  const reply = (body: unknown, code = 200) => {status = code; return json(body, code);};
  try {
    if (!await authorized(request, env.NARRATION_TOKEN)) return reply({error: 'UNAUTHORIZED'}, 401);
    const path = new URL(request.url).pathname;
    if (request.method === 'GET' && path === '/status') return reply({runtime: 'cloudflare-worker', enabled: env.NARRATION_ENABLED === 'true'});
    const route = /^\/agencies\/([a-zA-Z0-9_-]+)\/jobs\/([a-zA-Z0-9_-]+)(?:\/(prepare|audio\/([a-zA-Z0-9_-]+)))?$/.exec(path);
    if (!route || !env.NARRATION_AGENCY_ID || !env.NARRATION_JOB_ID || route[1] !== env.NARRATION_AGENCY_ID || route[2] !== env.NARRATION_JOB_ID)
      return reply({error: 'NOT_FOUND'}, 404);
    const scope = {agencyId: route[1], jobId: route[2]};
    if (request.method === 'POST' && route[3] === 'prepare') {
      if (env.NARRATION_ENABLED !== 'true') return reply({error: 'NARRATION_DISABLED'}, 503);
      if (!await emptyBody(request)) return reply({error: 'INVALID_INPUT'}, 400);
      const source = await factory(env);
      const providers: NarrationProviders = {...source, script: {...source.script, plan: async (context, correction) => {
        calls.script++; return source.script.plan(context, correction);
      }}, voice: {...source.voice, synthesize: async text => {calls.voice++; return source.voice.synthesize(text);}}};
      // La requête reste ouverte jusqu'au résultat. Pas de travail détaché
      // dans waitUntil (limité à 30 s après déconnexion/réponse).
      const result = await prepareJobNarration(env, scope.agencyId, scope.jobId, providers);
      return reply({runtime: 'cloudflare-worker', providerMock: providers.mode === 'mock', callsThisRun: calls, result});
    }
    if (request.method !== 'GET') return reply({error: 'NOT_FOUND'}, 404);
    const run = await findNarration(env.DB, scope.agencyId, scope.jobId);
    if (!run || run.expiresAt <= new Date().toISOString()) return reply({error: 'NOT_FOUND'}, 404);
    const result = run.result ? PreparedNarration.parse(JSON.parse(run.result)) : null;
    if (!route[3]) return reply({state: run.state, errorCode: run.errorCode, expiresAt: run.expiresAt, result});
    if (!route[4] || run.state !== 'prepared' || !result) return reply({error: 'NOT_FOUND'}, 404);
    const asset = result.audio.find(item => item.id === route[4]);
    if (!asset) return reply({error: 'NOT_FOUND'}, 404);
    const bytes = await readNarrationAudio(env.MEDIA, scope, asset);
    status = 200;
    return new Response(bytes, {headers: {'Content-Type': 'audio/wav', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff',
      'Content-Length': String(bytes.byteLength), 'Content-Disposition': `attachment; filename="${asset.id}.wav"`}});
  } catch (error) {
    errorCode = error instanceof NarrationFailure || error instanceof VoiceFailure ? error.code : 'NARRATION_UNAVAILABLE';
    const code = errorCode === 'NARRATION_NOT_FOUND' ? 404 : ['NARRATION_BUSY', 'NARRATION_CONFLICT', 'NARRATION_REVIEW_REQUIRED'].includes(errorCode) ? 409
      : errorCode === 'NARRATION_BUDGET_LIMIT' ? 429 : 502;
    return reply({error: errorCode, requestId}, code);
  } finally {
    console.log(JSON.stringify({event: 'narration_request', requestId, status, durationMs: Date.now() - started, calls, ...(errorCode ? {errorCode} : {})}));
  }
}

export default {fetch: (request: Request, env: Env) => handleNarrationRequest(request, env, realProviders)};
