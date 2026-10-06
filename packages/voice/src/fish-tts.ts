import {FishVoiceConfig,VoiceFailure,VoiceText,fishFrenchVoices} from '@bienvu/contracts';
import {providerRequestId,sha256,type VoiceFetch} from './http';
import {voiceCacheKey,MAX_VOICE_AUDIO_BYTES} from './google-tts';
import {measureVoiceWav} from './audio';

export const FISH_TTS_PRICE={date:'2026-10-02',currency:'USD',model:'s2.1-pro-free',microsPerUtf8Byte:0} as const;

// Streaming WAV headers may use unknown lengths. Repair only that encoding,
// then enforce the same PCM16/duration/silence checks as the Google tracks.
export function fishWav(input:Uint8Array,maximumDurationMs:35000|300000=35000){
  const bytes=new Uint8Array(input),view=new DataView(bytes.buffer);
  const tag=(at:number)=>String.fromCharCode(...bytes.subarray(at,at+4));
  if(bytes.length<44||tag(0)!=='RIFF'||tag(8)!=='WAVE')throw new VoiceFailure('VOICE_AUDIO_INVALID');
  const unknown=(n:number)=>n===0||n===0xffffffff||n===0xffffff24||n===0xffffff00;
  if(unknown(view.getUint32(4,true))){
    let at=12,chunks=0;
    while(at+8<=bytes.length&&++chunks<=64){
      const length=view.getUint32(at+4,true);
      if(tag(at)==='data'&&unknown(length)){view.setUint32(at+4,bytes.length-at-8,true);break;}
      if(at+8+length+length%2>bytes.length)throw new VoiceFailure('VOICE_AUDIO_INVALID');
      at+=8+length+length%2;
    }
    view.setUint32(4,bytes.length-8,true);
  }
  measureVoiceWav(bytes,maximumDurationMs);return bytes;
}

export function fishTts(configInput:unknown,apiKey:string,options:{fetch?:VoiceFetch;timeoutMs?:number;maximumDurationMs?:35000|300000}={}){
  const parsed=FishVoiceConfig.safeParse(configInput);
  if(!parsed.success)throw new VoiceFailure('VOICE_CONFIG_INVALID');
  if(!/^[\x21-\x7e]{20,8192}$/.test(apiKey))throw new VoiceFailure('VOICE_AUTH_FAILED');
  const config=parsed.data,reference=fishFrenchVoices.find(v=>v.id===config.voice)!;
  return {async synthesize(textInput:unknown){
    const text=VoiceText.safeParse(textInput);
    if(!text.success||/[<>]/.test(text.data))throw new VoiceFailure('VOICE_TEXT_INVALID');
    const requestId=crypto.randomUUID(),started=Date.now(),controller=new AbortController();
    const timer=setTimeout(()=>controller.abort(),options.timeoutMs??60_000);
    try{
      const performFetch=options.fetch??fetch;
      const response=await performFetch('https://api.fish.audio/v1/tts',{method:'POST',redirect:'manual',signal:controller.signal,
        headers:{Authorization:`Bearer ${apiKey}`,'Content-Type':'application/json',model:config.model},
        body:JSON.stringify({text:text.data,reference_id:reference.referenceId,format:'wav',sample_rate:config.sampleRate,
          latency:'normal',prosody:{speed:1,volume:0,normalize_loudness:true},temperature:0.7,top_p:0.7})});
      if(!response.ok){
        await response.body?.cancel();
        throw new VoiceFailure(response.status===401||response.status===403?'VOICE_AUTH_FAILED':response.status===402?'VOICE_BILLING_DISABLED':
          response.status===404?'VOICE_NOT_FOUND':response.status===429?'VOICE_RATE_LIMITED':response.status>=500?'VOICE_UNAVAILABLE':'VOICE_REQUEST_REJECTED');
      }
      const length=response.headers.get('content-length');
      if(length&&(!/^\d+$/.test(length)||Number(length)>MAX_VOICE_AUDIO_BYTES)){await response.body?.cancel();throw new VoiceFailure('VOICE_RESPONSE_INVALID');}
      const reader=response.body?.getReader();if(!reader)throw new VoiceFailure('VOICE_RESPONSE_INVALID');
      const chunks:Uint8Array[]=[];let size=0;
      try{while(true){const part=await reader.read();if(part.done)break;size+=part.value.length;
        if(size>MAX_VOICE_AUDIO_BYTES)throw new VoiceFailure('VOICE_RESPONSE_INVALID');chunks.push(part.value);}}
      finally{await reader.cancel().catch(()=>undefined);reader.releaseLock();}
      const received=new Uint8Array(size);let offset=0;for(const chunk of chunks){received.set(chunk,offset);offset+=chunk.length;}
      const bytes=fishWav(received,options.maximumDurationMs),utf8Bytes=new TextEncoder().encode(text.data).length;
      return {bytes,sha256:await sha256(bytes),cacheKey:await voiceCacheKey(config,text.data),mime:'audio/wav' as const,config,requestId,
        providerRequestId:providerRequestId(response),requestDurationMs:Date.now()-started,
        usage:{inputCharacters:[...text.data].length,inputUtf8Bytes:utf8Bytes,source:'counted_request' as const,providerUsage:null},
        cost:{currency:'USD' as const,priceDate:FISH_TTS_PRICE.date,estimatedMicrosBeforeFreeTier:0,actualBilledMicros:null,freeTierRemainingCharacters:null}};
    }catch(error){if(controller.signal.aborted)throw new VoiceFailure('VOICE_TIMEOUT');if(error instanceof VoiceFailure)throw error;throw new VoiceFailure('VOICE_UNAVAILABLE');}
    finally{clearTimeout(timer);}
  }};
}
