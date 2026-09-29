import {GoogleVoiceConfig, NarrationAudio, NarrationFailure, PreparedNarration, VoiceFailure, type ListingScript} from '@bienvu/contracts';
import {assertNarrationLease, checkpointNarrationScript, claimNarrationCall, failNarrationCall, findNarration, finishNarration,
  finishNarrationCall, narrationJobInput, releaseNarration, startNarration, type Database, type NarrationLease} from '@bienvu/db';
import {generateScript, hashJson, scriptContext, shortenScript, validateScript, type ScriptContext, type ScriptProvider, type ScriptReply} from '@bienvu/narration';
import {googleTts, measureVoiceWav, voiceCacheKey, voiceSceneTiming} from '@bienvu/voice';

type GoogleReply = Awaited<ReturnType<ReturnType<typeof googleTts>['synthesize']>>;
export type NarrationProviders = {mode: 'real' | 'mock'; script: ScriptProvider;
  voice: {config: GoogleVoiceConfig; synthesize(text: string): Promise<GoogleReply>}};
export interface NarrationBucket {
  put(key: string, bytes: Uint8Array, options: {httpMetadata: {contentType: string}; customMetadata: Record<string, string>}): Promise<unknown>;
  get(key: string): Promise<{size: number; arrayBuffer(): Promise<ArrayBuffer>} | null>;
}
const parseJson = (value: string | null): unknown => {
  try {if (!value || value.length > 128_000) throw new Error(); return JSON.parse(value);}
  catch {throw new NarrationFailure('NARRATION_STORAGE_INVALID');}
};
const bytesHash = async (bytes: Uint8Array) => [...new Uint8Array(await crypto.subtle.digest('SHA-256', new Uint8Array(bytes)))].map(v => v.toString(16).padStart(2, '0')).join('');
const codeOf = (error: unknown) => error instanceof NarrationFailure || error instanceof VoiceFailure ? error.code : 'NARRATION_STORAGE_INVALID';

// Étape privée appelée avec agencyId issu du contexte serveur. Aucun endpoint
// public, lancement de Workflow, débit de quota client ou rendu dans ce module.
export async function prepareJobNarration(env: {DB: Database; MEDIA: NarrationBucket}, agencyId: string, jobId: string,
  providers: NarrationProviders, options: {contact?: 'phone' | 'email' | 'website'; now?: () => number; brand?: unknown; onVoicing?: () => Promise<void>} = {}): Promise<PreparedNarration> {
  const now = options.now ?? Date.now;
  const job = await narrationJobInput(env.DB, agencyId, jobId);
  const existing = await findNarration(env.DB, agencyId, jobId);
  const snapshot = existing ? parseJson(existing.snapshot) as {listing: unknown; brand: unknown; contact: ScriptContext['contact']; copyVersion?: ScriptContext['copyVersion']} : null;
  // Les snapshots antérieurs au catalogue oral n'avaient pas de copyVersion.
  // Ils gardent leur texte et leurs clés de cache, y compris après un crash.
  const context = await scriptContext(snapshot?.listing ?? job.listing, snapshot?.brand ?? options.brand ?? job.brand, snapshot?.contact ?? options.contact,
    snapshot ? snapshot.copyVersion ?? 'factual-copy/1' : undefined);
  if (context.listing.agencyId !== agencyId || context.listing.id !== job.listing.id) throw new NarrationFailure('NARRATION_CONFLICT');
  if (existing && options.contact && options.contact !== context.contact) throw new NarrationFailure('NARRATION_CONFLICT');
  const config = GoogleVoiceConfig.parse(providers.voice.config);
  const configHash = await hashJson({voice: config, scriptModel: providers.script.model, promptVersion: 'narration-fr/1', mode: providers.mode});
  const {row, lease} = await startNarration(env.DB, {agencyId, jobId, inputHash: context.inputHash, configHash,
    snapshot: JSON.stringify({listing: {...context.listing, description: null}, brand: context.brand, contact: context.contact, copyVersion: context.copyVersion}),
    mode: providers.mode, attempt: job.attempt}, now());
  let failure: string | undefined;
  try {
    if (row.state === 'prepared') {
      const result = PreparedNarration.parse(parseJson(row.result));
      validateScript(context, result.script);
      for (let index = 0; index < result.audio.length; index++) {
        if (result.audio[index].cacheKey !== await voiceCacheKey(config, result.script.scenes[index].narrationText)) throw new NarrationFailure('NARRATION_STORAGE_INVALID');
        await readNarrationAudio(env.MEDIA, lease, result.audio[index]);
      }
      await assertNarrationLease(env.DB, lease, now());
      // Le rythme peut évoluer sans changer le texte ni régénérer les pistes.
      // Recalcul uniquement après vérification des WAV sauvegardés.
      const timing = voiceSceneTiming(result.audio.map(asset => asset.durationMs));
      if (timing.some((frames, index) => frames !== result.durationFrames[index])) {
        result.durationFrames = timing;
        await finishNarration(env.DB, lease, result, now());
      }
      return result;
    }
    let script: ListingScript;
    if (row.script) script = validateScript(context, parseJson(row.script));
    else {
      const safeProvider: ScriptProvider = {model: providers.script.model, plan: async (input, correction) => {
        const requestHash = await hashJson({inputHash: input.inputHash, model: providers.script.model, promptVersion: 'narration-fr/1', correction});
        const call = await claimNarrationCall(env.DB, lease, {stepKey: `script/${correction ? 2 : 1}`, requestHash, provider: 'openai', mode: providers.mode}, now());
        if (!call.fresh) return parseJson(call.row.result) as ScriptReply;
        try {
          const reply = await providers.script.plan(input, correction);
          await finishNarrationCall(env.DB, lease, call.row.id, reply, now()); return reply;
        } catch (error) {await failNarrationCall(env.DB, lease, call.row.id, codeOf(error)); throw error;}
      }};
      script = (await generateScript(context, safeProvider)).script;
      await checkpointNarrationScript(env.DB, lease, script, now());
    }
    await options.onVoicing?.();
    let audio: PreparedNarration['audio'], durationFrames: number[];
    try {
      audio = await voiceScenes(env, lease, script, providers, now);
      durationFrames = voiceSceneTiming(audio.map(asset => asset.durationMs));
    } catch (error) {
      if (!(error instanceof VoiceFailure) || error.code !== 'VOICE_DURATION_EXCEEDED' || script.version !== 1) throw error;
      script = shortenScript(context, script);
      // La version 2 est persistée avant le premier nouvel appel. Un crash ne
      // remet pas à zéro l'unique raccourcissement autorisé.
      await checkpointNarrationScript(env.DB, lease, script, now());
      audio = await voiceScenes(env, lease, script, providers, now);
      durationFrames = voiceSceneTiming(audio.map(asset => asset.durationMs));
    }
    const result = PreparedNarration.parse({script, audio, durationFrames});
    await finishNarration(env.DB, lease, result, now());
    return result;
  } catch (error) {
    failure = codeOf(error);
    if (error instanceof NarrationFailure || error instanceof VoiceFailure) throw error;
    throw new NarrationFailure('NARRATION_STORAGE_INVALID');
  } finally {await releaseNarration(env.DB, lease, failure);}
}

async function voiceScenes(env: {DB: Database; MEDIA: NarrationBucket}, lease: NarrationLease, script: ListingScript,
  providers: NarrationProviders, now: () => number): Promise<PreparedNarration['audio']> {
  const result: PreparedNarration['audio'] = [];
  for (const scene of script.scenes) {
    const cacheKey = await voiceCacheKey(providers.voice.config, scene.narrationText);
    const call = await claimNarrationCall(env.DB, lease, {stepKey: `voice/${cacheKey}`, requestHash: cacheKey, provider: 'google', mode: providers.mode,
      objectKey: id => `agencies/${lease.agencyId}/jobs/${lease.jobId}/audio/${cacheKey}-${id}.wav`}, now());
    if (!call.fresh) {
      const cached = parseJson(call.row.result) as {asset: unknown};
      const asset = NarrationAudio.parse(cached.asset);
      if (asset.cacheKey !== cacheKey || asset.objectKey !== call.row.objectKey) throw new NarrationFailure('NARRATION_STORAGE_INVALID');
      await readNarrationAudio(env.MEDIA, lease, asset); result.push(asset); continue;
    }
    try {
      const {bytes, ...metrics} = await providers.voice.synthesize(scene.narrationText);
      const measured = measureVoiceWav(bytes), sha256 = await bytesHash(bytes);
      if (metrics.cacheKey !== cacheKey || metrics.sha256 !== sha256) throw new NarrationFailure('NARRATION_STORAGE_INVALID');
      const asset = NarrationAudio.parse({id: `audio-${call.row.id}`, cacheKey, objectKey: call.row.objectKey, sha256, sizeBytes: bytes.byteLength,
        durationMs: measured.durationMs, sampleRate: measured.sampleRate, channels: measured.channels, rmsDbfs: measured.rmsDbfs});
      await assertNarrationLease(env.DB, lease, now());
      await env.MEDIA.put(asset.objectKey, bytes, {httpMetadata: {contentType: 'audio/wav'}, customMetadata: {sha256, cacheKey}});
      await readNarrationAudio(env.MEDIA, lease, asset);
      await finishNarrationCall(env.DB, lease, call.row.id, {asset, metrics, measurement: measured, providerMock: providers.mode === 'mock'}, now());
      result.push(asset);
    } catch (error) {await failNarrationCall(env.DB, lease, call.row.id, codeOf(error)); throw error;}
  }
  return result;
}
export async function readNarrationAudio(bucket: NarrationBucket, scope: {agencyId: string; jobId: string}, input: unknown) {
  const asset = NarrationAudio.parse(input);
  if (!asset.objectKey.startsWith(`agencies/${scope.agencyId}/jobs/${scope.jobId}/audio/`)) throw new NarrationFailure('NARRATION_STORAGE_INVALID');
  const object = await bucket.get(asset.objectKey);
  if (!object || object.size !== asset.sizeBytes || object.size > 7 * 1024 * 1024) throw new NarrationFailure('NARRATION_STORAGE_INVALID');
  const bytes = new Uint8Array(await object.arrayBuffer());
  if (bytes.length !== asset.sizeBytes || await bytesHash(bytes) !== asset.sha256) throw new NarrationFailure('NARRATION_STORAGE_INVALID');
  const measurement = measureVoiceWav(bytes);
  if (measurement.durationMs !== asset.durationMs || measurement.sampleRate !== asset.sampleRate || measurement.channels !== asset.channels)
    throw new NarrationFailure('NARRATION_STORAGE_INVALID');
  return bytes;
}
