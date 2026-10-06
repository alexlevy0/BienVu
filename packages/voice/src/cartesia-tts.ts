import {CartesiaVoiceConfig,VoiceFailure,VoiceText,cartesiaParisianVoices,CARTESIA_API_VERSION} from '@bienvu/contracts';
import {providerRequestId,sha256,type VoiceFetch} from './http';
import {MAX_VOICE_AUDIO_BYTES,voiceCacheKey} from './google-tts';
import {fishWav} from './fish-tts';

// Free is bounded in the shared DB before dispatch. Provider billing is never
// inferred from a locally counted character; actual billed amounts stay unknown.
export function cartesiaTts(input:unknown,apiKey:string,options:{fetch?:VoiceFetch;timeoutMs?:number;maximumDurationMs?:35000|300000}={}){
  const parsed=CartesiaVoiceConfig.safeParse(input);
  if(!parsed.success)throw new VoiceFailure('VOICE_CONFIG_INVALID');
  if(!/^[\x21-\x7e]{20,8192}$/.test(apiKey))throw new VoiceFailure('VOICE_AUTH_FAILED');
  const config=parsed.data,voice=cartesiaParisianVoices.find(v=>v.id===config.voice)!;
  return {async synthesize(inputText:unknown){
    const text=VoiceText.safeParse(inputText);
    if(!text.success||/[<>]/.test(text.data))throw new VoiceFailure('VOICE_TEXT_INVALID');
    const requestId=crypto.randomUUID(),started=Date.now(),controller=new AbortController(),
      timer=setTimeout(()=>controller.abort(),options.timeoutMs??60_000);
    try{
      const performFetch=options.fetch??fetch;
      const response=await performFetch('https://api.cartesia.ai/tts/bytes',{method:'POST',redirect:'manual',signal:controller.signal,
        headers:{'X-API-Key':apiKey,'Cartesia-Version':CARTESIA_API_VERSION,'Content-Type':'application/json'},
        body:JSON.stringify({model_id:config.model,transcript:text.data,voice:voice.providerVoiceId,
          language:config.language,accent:config.accent,normalization:'auto',
          output_format:{container:'wav',encoding:'pcm_s16le',sample_rate:config.sampleRate},generation_config:{speed:1,volume:1}})});
      if(!response.ok){await response.body?.cancel();
        throw new VoiceFailure(response.status===401||response.status===403?'VOICE_AUTH_FAILED':response.status===429?'VOICE_RATE_LIMITED':
          response.status===402?'VOICE_FREE_LIMIT':response.status>=500?'VOICE_UNAVAILABLE':'VOICE_REQUEST_REJECTED');}
      const length=response.headers.get('content-length');
      if(length&&(!/^\d+$/.test(length)||Number(length)>MAX_VOICE_AUDIO_BYTES)){
        await response.body?.cancel();throw new VoiceFailure('VOICE_RESPONSE_INVALID');}
      const reader=response.body?.getReader();if(!reader)throw new VoiceFailure('VOICE_RESPONSE_INVALID');
      const chunks:Uint8Array[]=[];let size=0;
      try{while(true){const part=await reader.read();if(part.done)break;size+=part.value.byteLength;
        if(size>MAX_VOICE_AUDIO_BYTES)throw new VoiceFailure('VOICE_RESPONSE_INVALID');chunks.push(part.value);}}
      finally{await reader.cancel().catch(()=>undefined);reader.releaseLock();}
      const raw=new Uint8Array(size);let offset=0;for(const chunk of chunks){raw.set(chunk,offset);offset+=chunk.length;}
      const bytes=fishWav(raw,options.maximumDurationMs);
      return {bytes,sha256:await sha256(bytes),cacheKey:await voiceCacheKey(config,text.data),mime:'audio/wav' as const,config,
        requestId,providerRequestId:providerRequestId(response),requestDurationMs:Date.now()-started,
        usage:{inputCharacters:[...text.data].length,inputUtf8Bytes:new TextEncoder().encode(text.data).byteLength,source:'counted_request' as const,providerUsage:null},
        cost:{currency:'USD' as const,priceDate:'2026-10-06',estimatedMicrosBeforeFreeTier:0,actualBilledMicros:null,freeTierRemainingCharacters:null}};
    }catch(error){if(controller.signal.aborted)throw new VoiceFailure('VOICE_TIMEOUT');
      if(error instanceof VoiceFailure)throw error;throw new VoiceFailure('VOICE_UNAVAILABLE');
    }finally{clearTimeout(timer);}
  }};
}
