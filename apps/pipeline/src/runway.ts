import RunwayML,{TaskFailedError,TaskTimedOutError,toFile} from '@runwayml/sdk';
import {VideoAspectRatio} from '@bienvu/contracts';

export const RUNWAY_MODEL='gen4_turbo',RUNWAY_SECONDS=5,RUNWAY_CREDITS=25;
export const RUNWAY_MAX_BYTES=10*1024*1024;
export const RUNWAY_PROMPTS={
  dolly:'The camera slowly dollies forward with gentle natural parallax, staying close to the original viewpoint. A single continuous, steady real estate shot. The original architecture, furniture, materials and lighting remain consistent. Photorealistic.',
  slide:'The camera slowly slides to the right with gentle natural parallax, staying close to the original viewpoint. A single continuous, steady real estate shot. The original architecture, furniture, materials and lighting remain consistent. Photorealistic.'
} as const;
export const RUNWAY_PROMPT=RUNWAY_PROMPTS.dolly;
export type RunwayMotion=keyof typeof RUNWAY_PROMPTS;
const taskId=(value:unknown)=>{if(typeof value!=='string'||!/^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/i.test(value))throw Error('RUNWAY_TASK_INVALID');return value;};
export type AnimationProvider={mode:'real'|'mock';generate:(image:Uint8Array,mime:string,checkpoint:(taskId:string)=>Promise<void>,signal:AbortSignal,motion?:RunwayMotion,aspectRatio?:VideoAspectRatio)=>Promise<Uint8Array>;
  resume:(taskId:string,signal:AbortSignal)=>Promise<Uint8Array>};
export function runwayError(error:unknown){
  if(error instanceof TaskFailedError)return 'RUNWAY_TASK_FAILED';
  if(error instanceof TaskTimedOutError)return 'RUNWAY_TIMEOUT';
  if(error instanceof RunwayML.AuthenticationError||error instanceof RunwayML.PermissionDeniedError)return 'RUNWAY_AUTH_FAILED';
  if(error instanceof RunwayML.RateLimitError)return 'RUNWAY_RATE_LIMIT';
  if(error instanceof Error&&/^RUNWAY_[A-Z_]{3,60}$/.test(error.message))return error.message;
  return 'RUNWAY_UNCERTAIN'; // Never log provider payloads, image bytes, JWT URLs or secrets.
}
export function allowedRunwayOutput(value:string){
  const url=new URL(value);
  if(url.protocol!=='https:'||url.username||url.password||url.port
    ||!(url.hostname.endsWith('.cloudfront.net')||url.hostname.endsWith('.runwayml.com')||url.hostname.endsWith('.runway.com')))
    throw Error('RUNWAY_OUTPUT_ORIGIN');
  return url;
}
export async function downloadRunwayOutput(value:string,signal:AbortSignal,fetcher:typeof fetch=fetch){
  // Workers only supports follow/manual. Refuse redirects before reading any
  // body; never follow a provider URL to an unvalidated host.
  const url=allowedRunwayOutput(value),response=await fetcher(url,{redirect:'manual',signal:AbortSignal.any([signal,AbortSignal.timeout(30_000)])});
  if(response.status>=300&&response.status<400)throw Error('RUNWAY_OUTPUT_REDIRECT');
  if(!response.ok||!response.body)throw Error('RUNWAY_OUTPUT_MISSING');
  const reader=response.body.getReader(),chunks:Uint8Array[]=[],limit=RUNWAY_MAX_BYTES;let length=0;
  try{
    if(Number(response.headers.get('content-length'))>limit)throw Error('RUNWAY_OUTPUT_TOO_LARGE');
    for(;;){const next=await reader.read();if(next.done)break;length+=next.value.length;
      if(length>limit)throw Error('RUNWAY_OUTPUT_TOO_LARGE');chunks.push(next.value);}
  }finally{await reader.cancel().catch(()=>{});reader.releaseLock();}
  const bytes=new Uint8Array(length);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length;}
  if(length<16||new TextDecoder().decode(bytes.subarray(4,8))!=='ftyp')throw Error('RUNWAY_OUTPUT_INVALID');
  return bytes;
}
// The official SDK owns task polling. Creation retries are disabled because a
// timeout can conceal an already billed task. Persist the task before any poll.
export function runwayProvider(secret:string,fetcher:typeof fetch=fetch):AnimationProvider{
  if(!secret)throw Error('RUNWAY_AUTH_FAILED');
  const client=(signal:AbortSignal,checkpoint?:(id:string)=>Promise<void>)=>new RunwayML({apiKey:secret,maxRetries:0,timeout:30_000,
    fetch:async(input,init)=>{
      // Include the overall deadline in helper-owned task retrievals too.
      const response=await fetcher(input,{...init,signal:init?.signal?AbortSignal.any([signal,init.signal]):signal});
      const url=new URL(typeof input==='string'?input:input instanceof URL?input.href:input.url);
      if(checkpoint&&init?.method==='POST'&&url.pathname==='/v1/image_to_video'&&response.ok){
        const body=await response.clone().json() as {id:unknown};await checkpoint(taskId(body.id));
      }
      return response;
    }});
  const output=async(result:{id:string;output:string[]},signal:AbortSignal)=>{
    taskId(result.id);if(result.output.length!==1)throw Error('RUNWAY_OUTPUT_INVALID');
    return downloadRunwayOutput(result.output[0],signal,fetcher);
  };
  return {mode:'real',generate:async(image,mime,checkpoint,signal,motion='dolly',aspectRatio='9:16')=>{
    VideoAspectRatio.parse(aspectRatio);
    if(image.length<512||image.length>10*1024*1024||!['image/jpeg','image/png','image/webp'].includes(mime))throw Error('RUNWAY_INPUT_INVALID');
    const sdk=client(signal,checkpoint),extension=mime==='image/jpeg'?'jpg':mime==='image/png'?'png':'webp';
    const {uri}=await sdk.uploads.createEphemeral({file:await toFile(image,`property.${extension}`,{type:mime})},{signal});
    const task=sdk.imageToVideo.create({model:RUNWAY_MODEL,promptImage:uri,promptText:RUNWAY_PROMPTS[motion],
      ratio:aspectRatio==='16:9'?'1280:720':'720:1280',duration:RUNWAY_SECONDS},{signal});
    // SDK 4.20.1 waits ~6 s before awaiting creation. Observe rejection now
    // to avoid an unhandled 4xx/5xx during that wait; the helper still throws
    // the original error and owns polling. Never await or resubmit creation.
    void task.catch(()=>{});
    return output(await task.waitForTaskOutput({timeout:120_000,abortSignal:signal}),signal);
  },resume:async(id,signal)=>output(await client(signal).tasks.retrieve(taskId(id),{signal})
    .waitForTaskOutput({timeout:120_000,abortSignal:signal}),signal)};
}
