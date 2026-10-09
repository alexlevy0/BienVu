import {EntityId,VideoReport,publicErrors,type PublicErrorCode} from '@bienvu/contracts';
import {findOwnedGeneration,generationEvent,generationMasterUnlocked,generationRetained,GenerationFailure,listGenerations,rememberAiContext,type GenerationRow,type Database} from '@bienvu/db';
import {RequestFailure} from './http';
export async function callGeneration(env:CloudflareEnv&{GENERATION_SERVICE?:Fetcher;GENERATION_TOKEN?:string},agencyId:string,path:string,body:unknown,key='',request?:Request){
  if(!env.GENERATION_SERVICE||!env.GENERATION_TOKEN)throw new RequestFailure('GENERATIONS_PAUSED');
  const response=await env.GENERATION_SERVICE.fetch(`https://generation.internal${path}`,{method:'POST',
    headers:{'Content-Type':'application/json','X-Agency-ID':agencyId,'Idempotency-Key':key,Authorization:`Bearer ${env.GENERATION_TOKEN}`},body:JSON.stringify(body)});
  const value=await response.json() as {error?:string;id?:string};
  if(!response.ok)throw new RequestFailure(value.error&&value.error in publicErrors?value.error as PublicErrorCode:'INTERNAL_ERROR');
  if(request&&value.id&&EntityId.safeParse(value.id).success)try{await rememberAiContext(env.DB,value.id,request);}catch{/* Analytics cannot change admission. */}
  return Response.json(value,{status:response.status});
}
export async function ownGeneration(env:{DB:Database},agencyId:string,id:string){
  if(!EntityId.safeParse(id).success)throw new RequestFailure('NOT_FOUND');
  const row=await findOwnedGeneration(env.DB,agencyId,id);if(!row)throw new RequestFailure('NOT_FOUND');return row;
}
export async function generationHistory(env:Pick<CloudflareEnv,'DB'>,agencyId:string,cursor?:string,
  filters:{query?:string;status?:'all'|'ready'|'active';sort?:'newest'|'oldest'}={}){
  if(cursor&&cursor.length>512)throw new RequestFailure('VALIDATION_ERROR');
  if((filters.query?.length??0)>80||!['all','ready','active'].includes(filters.status??'all')||
    !['newest','oldest'].includes(filters.sort??'newest'))throw new RequestFailure('VALIDATION_ERROR');
  try{return await listGenerations(env.DB,agencyId,cursor,filters);}catch(error){if(error instanceof GenerationFailure)throw new RequestFailure(error.code);throw error;}
}
export async function generationVideo(request:Request,env:Pick<CloudflareEnv,'DB'|'MEDIA'>,agencyId:string,id:string){
  const row=await ownGeneration(env,agencyId,id);
  if(row.status!=='ready'||!generationRetained(row))throw new RequestFailure('NOT_FOUND');
  if(!generationMasterUnlocked(row))throw new RequestFailure('QUOTA_EXHAUSTED');
  const response=await streamGenerationMedia(request,env,row,'master');
  if(new URL(request.url).searchParams.get('download')==='1'&&response.ok)await generationEvent(env.DB,id,'download');
  return response;
}
export async function generationPreview(request:Request,env:Pick<CloudflareEnv,'DB'|'MEDIA'>,agencyId:string,id:string){
  return streamGenerationMedia(request,env,await ownGeneration(env,agencyId,id),'preview');
}
export async function streamGenerationMedia(request:Request,env:Pick<CloudflareEnv,'MEDIA'>,row:GenerationRow,variant:'master'|'preview') {
  const id=row.jobId,key=variant==='preview'?row.previewKey:row.objectKey,raw=variant==='preview'?row.previewReport:row.report;
  if(row.status!=='ready'||!generationRetained(row)||!key||!raw)throw new RequestFailure('NOT_FOUND');
  if(variant==='master'&&!generationMasterUnlocked(row))throw new RequestFailure('NOT_FOUND');
  if(!key.startsWith(`agencies/${row.agencyId}/jobs/${id}/`))throw new RequestFailure('NOT_FOUND');
  const report=VideoReport.parse(JSON.parse(raw)),head=await env.MEDIA.head(key);
  if(variant==='preview'&&!report.watermarked)throw new RequestFailure('NOT_FOUND');
  if(!head||head.size!==report.sizeBytes||head.customMetadata?.sha256!==report.sha256)throw new RequestFailure('NOT_FOUND');
  const range=request.headers.get('range');let offset=0,length=head.size;
  if(range){const match=/^bytes=(\d*)-(\d*)$/.exec(range);let end=head.size-1;
    if(match&&(match[1]||match[2])){if(match[1]){offset=Number(match[1]);if(match[2])end=Math.min(end,Number(match[2]));}
      else offset=Math.max(0,head.size-Number(match[2]));length=end-offset+1;
    }else length=0;
    if(!Number.isSafeInteger(offset)||!Number.isSafeInteger(length)||offset<0||offset>=head.size||length<=0)
      return new Response(null,{status:416,headers:{'Content-Range':`bytes */${head.size}`,'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'}});
  }
  const headers={'Content-Type':'video/mp4','Content-Length':String(length),'Accept-Ranges':'bytes',
    'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff',
    'Content-Disposition':`${variant==='master'&&new URL(request.url).searchParams.get('download')==='1'?'attachment':'inline'}; filename="bienvu-${id}.mp4"`,
    ...(range?{'Content-Range':`bytes ${offset}-${offset+length-1}/${head.size}`}:{})};
  if(request.method==='HEAD')return new Response(null,{status:range?206:200,headers});
  const object=await env.MEDIA.get(key,range?{range:{offset,length}}:undefined);
  if(!object)throw new RequestFailure('NOT_FOUND');return new Response(object.body,{status:range?206:200,headers});
}
