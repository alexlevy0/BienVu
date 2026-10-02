import {requireOwner} from '../../../../../lib/owner';
import {assertSameOrigin,respond} from '../../../../../lib/http';
import {recoverDraftVoice} from '../../../../../lib/video-editor';
export const dynamic='force-dynamic';
export async function POST(request:Request,{params}:{params:Promise<{id:string}>}){return respond(async()=>{
  const {env,agency}=await requireOwner(request);assertSameOrigin(request,env);
  return Response.json(await recoverDraftVoice(env,agency.id,(await params).id,request.signal));
});}
