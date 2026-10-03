import {requireOwner} from '../../../../../../lib/owner';
import {MUSIC_LIMITS} from '@bienvu/contracts';
import {assertSameOrigin,boundedBytes,respond,RequestFailure} from '../../../../../../lib/http';
import {putEditorMusic,privateEditorMusic} from '../../../../../../lib/video-editor';
export const dynamic='force-dynamic';
type Context={params:Promise<{id:string;assetId:string}>};
export async function PUT(request:Request,{params}:Context){return respond(async()=>{
  const {env,agency}=await requireOwner(request);assertSameOrigin(request,env);
  if(request.headers.get('Content-Type')?.split(';')[0]!=='audio/wav')throw new RequestFailure('VALIDATION_ERROR');
  const {id,assetId}=await params;
  return Response.json(await putEditorMusic(env,agency.id,id,assetId,await boundedBytes(request,MUSIC_LIMITS.bytes)),{status:201});
});}
export async function GET(request:Request,{params}:Context){return respond(async()=>{
  const {env,agency}=await requireOwner(request),{id,assetId}=await params;
  return privateEditorMusic(env,agency.id,id,assetId,request);
});}
