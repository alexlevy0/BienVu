import {EntityId} from '@bienvu/contracts';
import {requireOwner} from '../../../../../../lib/owner';
import {respond,assertSameOrigin,boundedJson,RequestFailure} from '../../../../../../lib/http';
import {attachLibraryMusic} from '../../../../../../lib/music-library';
export const dynamic='force-dynamic';
export async function POST(request:Request,{params}:{params:Promise<{id:string}>}){return respond(async()=>{
  const {env,agency}=await requireOwner(request);assertSameOrigin(request,env);
  const body=await boundedJson(request,1024) as {musicId?:unknown};
  if(!EntityId.safeParse(body?.musicId).success)throw new RequestFailure('VALIDATION_ERROR');
  return Response.json(await attachLibraryMusic(env,agency.id,(await params).id,body.musicId as string),{status:201});
});}
