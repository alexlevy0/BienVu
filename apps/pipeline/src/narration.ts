import {AgencyBrand,VoiceConfig, NarrationAudio, NarrationFailure, PreparedNarration, VoiceFailure,GenerationRequest,customizedListing,customizedBrand,editorCanReuseVoice, type ListingScript} from '@bienvu/contracts';
import {assertNarrationLease, checkpointNarrationScript, claimNarrationCall, failNarrationCall, findNarration, finishNarration,
  finishNarrationCall, narrationJobInput, releaseNarration, startNarration,findEditorVoiceSource, type Database, type NarrationLease} from '@bienvu/db';
import {generateScript, hashJson, scriptContext,scriptPromptVersion,customScript, shortenScript, fitNarrationDuration,fitCachedNarration, validateScript, type ScriptContext, type ScriptProvider, type ScriptReply} from '@bienvu/narration';
import {googleTts,fishTts,cartesiaTts, measureVoiceWav, voiceCacheKey, voiceSceneTiming,compactVoiceSceneTiming,localitySpeechText,LOCALITY_SPEECH_VERSION} from '@bienvu/voice';

type VoiceReply = Awaited<ReturnType<ReturnType<typeof googleTts>['synthesize']>>|Awaited<ReturnType<ReturnType<typeof fishTts>['synthesize']>>|Awaited<ReturnType<ReturnType<typeof cartesiaTts>['synthesize']>>;
export type NarrationProviders = {mode: 'real' | 'mock'; script: ScriptProvider;
  voice: {config: VoiceConfig; synthesize(text: string,callId?:string): Promise<VoiceReply>}};
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
  providers: NarrationProviders, options: {contact?: 'phone' | 'email' | 'website' | 'none'; now?: () => number; brand?: unknown; onVoicing?: () => Promise<void>} = {}): Promise<PreparedNarration> {
  const now = options.now ?? Date.now;
  const job = await narrationJobInput(env.DB, agencyId, jobId);
  const existing = await findNarration(env.DB, agencyId, jobId);
  const snapshot = existing ? parseJson(existing.snapshot) as {listing: unknown; brand: unknown; contact: ScriptContext['contact']; copyVersion?: ScriptContext['copyVersion'];customNarration?:string[];localitySpeechVersion?:string} : null;
  const input=job.generationInput?GenerationRequest.parse(JSON.parse(job.generationInput)):undefined;
  const customization=input?.customization,voiceEnabled=input?.voiceEnabled!==false,durationSeconds=input?.durationSeconds;
  const source=customization?.voiceSourceId?await findEditorVoiceSource(env.DB,agencyId,job.listing.id,customization.voiceSourceId):null;
  if(customization?.voiceSourceId&&!source)throw new NarrationFailure('NARRATION_STORAGE_INVALID');
  const requestedReuse=voiceEnabled&&Boolean(customization&&editorCanReuseVoice(customization,source?.preview??null));
  // Les snapshots antérieurs au catalogue oral n'avaient pas de copyVersion.
  // Ils gardent leur texte et leurs clés de cache, y compris après un crash.
  const context = await scriptContext(snapshot?.listing ?? customizedListing(job.listing,customization), snapshot?.brand ?? customizedBrand(AgencyBrand.parse(options.brand??job.brand),customization), snapshot?.contact ?? options.contact,
    snapshot ? snapshot.copyVersion ?? 'factual-copy/1' : durationSeconds!==undefined?'description-copy/2':undefined,snapshot?snapshot.customNarration:customization?.narration,durationSeconds);
  if (context.listing.agencyId !== agencyId || context.listing.id !== job.listing.id) throw new NarrationFailure('NARRATION_CONFLICT');
  if (existing && options.contact && options.contact !== context.contact) throw new NarrationFailure('NARRATION_CONFLICT');
  const config = VoiceConfig.parse(providers.voice.config);
  // Existing runs retain their pronunciation policy and WAV keys. New Cartesia
  // runs hash the exact normalized text sent to TTS, including on crash/retry.
  const localitySpeechVersion = config.provider==='cartesia'&&voiceEnabled&&(!snapshot||snapshot.localitySpeechVersion===LOCALITY_SPEECH_VERSION)
    ? LOCALITY_SPEECH_VERSION : undefined;
  const spokenText = (text:string) => localitySpeechVersion ? localitySpeechText(text,context.listing.facts.locality.value) : text;
  let reuse=requestedReuse;
  // Reuse corrected audio, but regenerate an older track whose city was spelled
  // out. Compare its actual cache key instead of guessing from the caption case.
  if(reuse&&localitySpeechVersion&&source)for(const [index,clip] of source.preview.clips.entries()){
    const text=spokenText(clip.text);
    if(text!==clip.text&&source.audio[index]?.cacheKey!==await voiceCacheKey(config,text)){reuse=false;break;}
  }
  const configHash = await hashJson({voice: config, scriptModel: providers.script.model, promptVersion: scriptPromptVersion(context), mode: providers.mode,...(!voiceEnabled?{voiceEnabled:false}:{}),...(durationSeconds!==undefined?{durationSeconds}:{}),...(reuse?{reusedVoiceHash:await hashJson(source)}:{}),...(localitySpeechVersion?{localitySpeechVersion}:{})});
  const {row, lease} = await startNarration(env.DB, {agencyId, jobId, inputHash: context.inputHash, configHash,
    snapshot: JSON.stringify({listing: {...context.listing, description: context.copyVersion.startsWith('description-copy/')?context.listing.description:null}, brand: context.brand, contact: context.contact, copyVersion: context.copyVersion,
      ...(context.customNarration?{customNarration:context.customNarration}:{}),...(localitySpeechVersion?{localitySpeechVersion}:{})}),
    mode: providers.mode, attempt: job.attempt}, now());
  let failure: string | undefined;
  const timingFor=(audio:PreparedNarration['audio'])=>context.copyVersion==='description-copy/2'
    ?compactVoiceSceneTiming(audio.map(a=>a.durationMs),durationSeconds??20):voiceSceneTiming(audio.map(a=>a.durationMs),durationSeconds);
  try {
    if (row.state === 'prepared') {
      const result = PreparedNarration.parse(parseJson(row.result));
      validateScript(context, result.script);
      if((result.voiceEnabled!==false)!==voiceEnabled)throw new NarrationFailure('NARRATION_CONFLICT');
      if(result.durationSeconds!==durationSeconds)throw new NarrationFailure('NARRATION_CONFLICT');
      for (let index = 0; index < result.audio.length; index++) {
        if (!reuse&&result.audio[index].cacheKey !== await voiceCacheKey(config, spokenText(result.script.scenes[index].narrationText))) throw new NarrationFailure('NARRATION_STORAGE_INVALID');
        await readNarrationAudio(env.MEDIA, lease, result.audio[index]);
      }
      await assertNarrationLease(env.DB, lease, now());
      // Le rythme peut évoluer sans changer le texte ni régénérer les pistes.
      // Recalcul uniquement après vérification des WAV sauvegardés.
      const timing = reuse?source!.durationFrames:voiceEnabled?timingFor(result.audio):result.durationFrames;
      if (timing.some((frames, index) => frames !== result.durationFrames[index])) {
        result.durationFrames = timing;
        await finishNarration(env.DB, lease, result, now());
      }
      return result;
    }
    let script: ListingScript;
    if (row.script) script = validateScript(context, parseJson(row.script));
    else if(context.customNarration){script=customScript(context);await checkpointNarrationScript(env.DB,lease,script,now());}
    else {
      const safeProvider: ScriptProvider = {model: providers.script.model, plan: async (input, correction) => {
        const requestHash = await hashJson({inputHash: input.inputHash, model: providers.script.model, promptVersion: scriptPromptVersion(input), correction});
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
    if(!voiceEnabled){
      // Silent tours retain visual timing, without TTS requests or audio assets.
      const weights=script.scenes.map(s=>Math.max(6,s.narrationText.trim().split(/\s+/).length)),total=weights.reduce((a,b)=>a+b,0);
      const frames=durationSeconds!==undefined?durationSeconds*30:Math.max(600,Math.min(1050,total*13)),remaining=frames-weights.length*60;let at=0;
      const durationFrames=weights.map(weight=>{const from=at;at+=weight;return 60+Math.floor(at*remaining/total)-Math.floor(from*remaining/total);});
      const result=PreparedNarration.parse({script,voiceEnabled:false,audio:[],durationFrames,...(durationSeconds!==undefined?{durationSeconds}:{})});
      await finishNarration(env.DB,lease,result,now());return result;
    }
    await options.onVoicing?.();
    if(reuse){
      if(script.scenes.length!==source!.audio.length||script.scenes.some((s,i)=>s.narrationText!==source!.preview.clips[i].text))throw new NarrationFailure('NARRATION_CONFLICT');
      const audio:PreparedNarration['audio']=[];
      for(const asset of source!.audio){
        const object=await env.MEDIA.get(asset.objectKey);if(!object||object.size!==asset.sizeBytes)throw new NarrationFailure('NARRATION_STORAGE_INVALID');
        const bytes=new Uint8Array(await object.arrayBuffer()),measurement=measureVoiceWav(bytes);
        if(await bytesHash(bytes)!==asset.sha256||measurement.durationMs!==asset.durationMs||measurement.sampleRate!==asset.sampleRate||measurement.channels!==asset.channels)throw new NarrationFailure('NARRATION_STORAGE_INVALID');
        const copied={...asset,objectKey:`agencies/${agencyId}/jobs/${jobId}/audio/reused-${asset.id}-${asset.sha256}.wav`};
        await assertNarrationLease(env.DB,lease,now());
        await env.MEDIA.put(copied.objectKey,bytes,{httpMetadata:{contentType:'audio/wav'},customMetadata:{sha256:asset.sha256,reusedVoice:source!.preview.id}});
        await readNarrationAudio(env.MEDIA,lease,copied);audio.push(copied);
      }
      const result=PreparedNarration.parse({script,audio,durationFrames:source!.durationFrames,...(durationSeconds!==undefined?{durationSeconds}:{})});
      await finishNarration(env.DB,lease,result,now());return result;
    }
    let audio: PreparedNarration['audio'], durationFrames: number[];
    if(context.copyVersion==='description-copy/2'){
      audio=await voiceScenes(env,lease,script,providers,now,spokenText);
      const measured=script.scenes.map((s,index)=>({text:s.narrationText,durationMs:audio[index].durationMs,asset:audio[index]}));
      const fitted=fitNarrationDuration(context,script,audio.map(a=>a.durationMs));
      if(fitted){
        script=fitted;
        // Persist the one measured adaptation before further TTS. Unchanged
        // opening/contact tracks reuse their journal and private WAV cache.
        await checkpointNarrationScript(env.DB,lease,script,now());
        audio=await voiceScenes(env,lease,script,providers,now,spokenText);
      }
      measured.push(...script.scenes.map((s,index)=>({text:s.narrationText,durationMs:audio[index].durationMs,asset:audio[index]})));
      const cached=fitCachedNarration(context,script,measured);
      if(cached){
        script=cached;audio=script.scenes.map(s=>measured.find(t=>t.text===s.narrationText)!.asset);
        await checkpointNarrationScript(env.DB,lease,script,now());
      }
      durationFrames=timingFor(audio);
    }else{
    try {
      audio = await voiceScenes(env, lease, script, providers, now,spokenText);
      durationFrames = timingFor(audio);
    } catch (error) {
      if (!(error instanceof VoiceFailure) || error.code !== 'VOICE_DURATION_EXCEEDED' || script.version !== 1 || context.customNarration) throw error;
      script = shortenScript(context, script);
      // La version 2 est persistée avant le premier nouvel appel. Un crash ne
      // remet pas à zéro l'unique raccourcissement autorisé.
      await checkpointNarrationScript(env.DB, lease, script, now());
      audio = await voiceScenes(env, lease, script, providers, now,spokenText);
      durationFrames = timingFor(audio);
    }
    }
    const result = PreparedNarration.parse({script, audio, durationFrames,...(durationSeconds!==undefined?{durationSeconds}:{})});
    await finishNarration(env.DB, lease, result, now());
    return result;
  } catch (error) {
    failure = codeOf(error);
    if (error instanceof NarrationFailure || error instanceof VoiceFailure) throw error;
    throw new NarrationFailure('NARRATION_STORAGE_INVALID');
  } finally {await releaseNarration(env.DB, lease, failure);}
}

async function voiceScenes(env: {DB: Database; MEDIA: NarrationBucket}, lease: NarrationLease, script: ListingScript,
  providers: NarrationProviders, now: () => number,spokenText:(text:string)=>string): Promise<PreparedNarration['audio']> {
  const result: PreparedNarration['audio'] = [];
  for (const scene of script.scenes) {
    const text=spokenText(scene.narrationText),cacheKey = await voiceCacheKey(providers.voice.config,text);
    const call = await claimNarrationCall(env.DB, lease, {stepKey: `voice/${cacheKey}`, requestHash: cacheKey, provider: providers.voice.config.provider, mode: providers.mode,
      objectKey: id => `agencies/${lease.agencyId}/jobs/${lease.jobId}/audio/${cacheKey}-${id}.wav`}, now());
    if (!call.fresh) {
      const cached = parseJson(call.row.result) as {asset: unknown};
      const asset = NarrationAudio.parse(cached.asset);
      if (asset.cacheKey !== cacheKey || asset.objectKey !== call.row.objectKey) throw new NarrationFailure('NARRATION_STORAGE_INVALID');
      await readNarrationAudio(env.MEDIA, lease, asset); result.push(asset); continue;
    }
    try {
      const {bytes, ...metrics} = await providers.voice.synthesize(text,call.row.id);
      const measured = measureVoiceWav(bytes), sha256 = await bytesHash(bytes);
      if (metrics.cacheKey !== cacheKey || metrics.sha256 !== sha256) throw new NarrationFailure('NARRATION_STORAGE_INVALID');
      const asset = NarrationAudio.parse({id: `audio-${call.row.id}`, cacheKey, objectKey: call.row.objectKey, sha256, sizeBytes: bytes.byteLength,
        durationMs: measured.durationMs, sampleRate: measured.sampleRate, channels: measured.channels, rmsDbfs: measured.rmsDbfs});
      await assertNarrationLease(env.DB, lease, now());
      await env.MEDIA.put(asset.objectKey, bytes, {httpMetadata: {contentType: 'audio/wav'}, customMetadata: {sha256, cacheKey}});
      await readNarrationAudio(env.MEDIA, lease, asset);
      await finishNarrationCall(env.DB, lease, call.row.id, {asset, metrics, measurement: measured,spokenText:text,voice:providers.voice.config, providerMock: providers.mode === 'mock'}, now());
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
