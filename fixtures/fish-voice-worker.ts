import {FishVoiceConfig,VoiceFailure} from '../packages/contracts/src/voice';
import {fishTts,measureVoiceWav} from '../packages/voice/src/index';

// Ephemeral operator-only Cloudflare probe. Fixed demo text, one free call;
// no customer data, D1/R2, billing change, or generation endpoint.
export default {async fetch(request:Request,env:{FISH_API_KEY?:string;PROBE_TOKEN?:string}){
  if(!env.PROBE_TOKEN||env.PROBE_TOKEN.length<32||request.headers.get('Authorization')!==`Bearer ${env.PROBE_TOKEN}`)
    return new Response(null,{status:401});
  if(request.method!=='POST'||new URL(request.url).pathname!=='/voice')
    return new Response(null,{status:404});
  const reader=request.body?.getReader();
  if(reader){try{if(!(await reader.read()).done)return new Response(null,{status:400});}
    finally{await reader.cancel().catch(()=>undefined);reader.releaseLock();}}
  try{
    const config=FishVoiceConfig.parse({voice:'fish-manon'});
    const reply=await fishTts(config,env.FISH_API_KEY??'').synthesize('Bonjour. Avec BienVu, donnez vie aux photos de votre bien.');
    return Response.json({runtime:'cloudflare-worker',providerMock:false,config:reply.config,
      sha256:reply.sha256,sizeBytes:reply.bytes.length,usage:reply.usage,cost:reply.cost,
      measurement:measureVoiceWav(reply.bytes),providerRequestId:reply.providerRequestId});
  }catch(error){return Response.json({error:error instanceof VoiceFailure?error.code:'PROBE_FAILED'},{status:502});}
}};
