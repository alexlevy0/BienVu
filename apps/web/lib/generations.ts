import {EntityId,VideoReport,publicErrors,type PublicErrorCode} from '@bienvu/contracts';
import {findGeneration,GenerationFailure,listGenerations} from '@bienvu/db';
import {RequestFailure} from './http';
export async function callGeneration(env:CloudflareEnv&{GENERATION_SERVICE?:Fetcher;GENERATION_TOKEN?:string},agencyId:string,path:string,body:unknown,key=''){
  if(!env.GENERATION_SERVICE||!env.GENERATION_TOKEN)throw new RequestFailure('GENERATIONS_PAUSED');
  const response=await env.GENERATION_SERVICE.fetch(`https://generation.internal${path}`,{method:'POST',
    headers:{'Content-Type':'application/json','X-Agency-ID':agencyId,'Idempotency-Key':key,Authorization:`Bearer ${env.GENERATION_TOKEN}`},body:JSON.stringify(body)});
  const value=await response.json() as {error?:string};
  if(!response.ok)throw new RequestFailure(value.error&&value.error in publicErrors?value.error as PublicErrorCode:'INTERNAL_ERROR');
  return Response.json(value,{status:response.status});
}
export async function ownGeneration(env:Pick<CloudflareEnv,'DB'>,agencyId:string,id:string){
  if(!EntityId.safeParse(id).success)throw new RequestFailure('NOT_FOUND');
  const row=await findGeneration(env.DB,agencyId,id);if(!row)throw new RequestFailure('NOT_FOUND');return row;
}
export async function generationHistory(env:Pick<CloudflareEnv,'DB'>,agencyId:string,cursor?:string){
  if(cursor&&cursor.length>512)throw new RequestFailure('VALIDATION_ERROR');
  try{return await listGenerations(env.DB,agencyId,cursor);}catch(error){if(error instanceof GenerationFailure)throw new RequestFailure(error.code);throw error;}
}
export async function generationVideo(request:Request,env:Pick<CloudflareEnv,'DB'|'MEDIA'>,agencyId:string,id:string){
  const row=await ownGeneration(env,agencyId,id);
  if(row.status!=='ready'||!row.objectKey||!row.report||row.expiresAt<=new Date().toISOString())throw new RequestFailure('NOT_FOUND');
  const reservation=await env.DB.prepare("SELECT id FROM reservations WHERE job_id=? AND agency_id=? AND status='consumed'").bind(id,agencyId).first();
  if(!reservation||!row.objectKey.startsWith(`agencies/${agencyId}/jobs/${id}/`))throw new RequestFailure('NOT_FOUND');
  const report=VideoReport.parse(JSON.parse(row.report)),head=await env.MEDIA.head(row.objectKey);
  if(!head||head.size!==report.sizeBytes||head.customMetadata?.sha256!==report.sha256)throw new RequestFailure('NOT_FOUND');
  const range=request.headers.get('range');let offset=0,length=head.size;
  if(range){const match=/^bytes=(\d*)-(\d*)$/.exec(range);let end=head.size-1;
    if(match&&(match[1]||match[2])){if(match[1]){offset=Number(match[1]);if(match[2])end=Math.min(end,Number(match[2]));}
      else offset=Math.max(0,head.size-Number(match[2]));length=end-offset+1;
    }else length=0;
    if(!Number.isSafeInteger(offset)||!Number.isSafeInteger(length)||offset<0||offset>=head.size||length<=0)
      return new Response(null,{status:416,headers:{'Content-Range':`bytes */${head.size}`}});
  }
  const headers={'Content-Type':'video/mp4','Content-Length':String(length),'Accept-Ranges':'bytes',
    'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff',
    'Content-Disposition':`${new URL(request.url).searchParams.get('download')==='1'?'attachment':'inline'}; filename="bienvu-${id}.mp4"`,
    ...(range?{'Content-Range':`bytes ${offset}-${offset+length-1}/${head.size}`}:{})};
  if(request.method==='HEAD')return new Response(null,{status:range?206:200,headers});
  const object=await env.MEDIA.get(row.objectKey,range?{range:{offset,length}}:undefined);
  if(!object)throw new RequestFailure('NOT_FOUND');return new Response(object.body,{status:range?206:200,headers});
}
