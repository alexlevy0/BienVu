import {getCloudflareContext} from '@opennextjs/cloudflare';
import {qualityRun} from '@bienvu/db';
import {EntityId,NarrationAudio} from '@bienvu/contracts';
import {requireAdmin} from '../../../../../../lib/admin-access';
import {respond,RequestFailure} from '../../../../../../lib/http';
export const dynamic='force-dynamic';
export async function GET(request:Request,{params}:{params:Promise<{id:string}>}){return respond(async()=>{
  const {env}=await getCloudflareContext({async:true});await requireAdmin(request,env);
  const {id}=await params,clip=Number(new URL(request.url).searchParams.get('clip'));
  if(!EntityId.safeParse(id).success||!Number.isInteger(clip)||clip<0||clip>5)throw new RequestFailure('NOT_FOUND');
  const row=await qualityRun(env.DB,id);if(!row)throw new RequestFailure('NOT_FOUND');
  const payload=JSON.parse(row.payload) as {audio?:unknown[]},parsed=NarrationAudio.safeParse(payload.audio?.[clip]);
  if(!parsed.success||!parsed.data.objectKey.startsWith(`agencies/${row.agencyId}/jobs/${row.jobId}/audio/`))throw new RequestFailure('NOT_FOUND');
  const asset=parsed.data,head=await env.MEDIA.head(asset.objectKey);if(!head||head.size!==asset.sizeBytes||head.customMetadata?.sha256!==asset.sha256)throw new RequestFailure('NOT_FOUND');
  let offset=0,length=head.size;const range=request.headers.get('Range');
  if(range){const match=/^bytes=(\d*)-(\d*)$/.exec(range);if(!match||!(match[1]||match[2]))return new Response(null,{status:416,headers:{'Content-Range':`bytes */${head.size}`}});
    offset=match[1]?Number(match[1]):Math.max(0,head.size-Number(match[2]));const end=match[1]&&match[2]?Math.min(head.size-1,Number(match[2])):head.size-1;length=end-offset+1;
    if(!Number.isSafeInteger(offset)||!Number.isSafeInteger(length)||offset<0||offset>=head.size||length<1)return new Response(null,{status:416,headers:{'Content-Range':`bytes */${head.size}`}});
  }
  const headers={'Content-Type':'audio/wav','Content-Length':String(length),'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff','Accept-Ranges':'bytes',...(range?{'Content-Range':`bytes ${offset}-${offset+length-1}/${head.size}`}:{})};
  if(request.method==='HEAD')return new Response(null,{status:range?206:200,headers});
  const file=await env.MEDIA.get(asset.objectKey,range?{range:{offset,length}}:undefined);if(!file)throw new RequestFailure('NOT_FOUND');
  return new Response(file.body,{status:range?206:200,headers});
});}
export const HEAD=GET;
