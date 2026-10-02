import {requireOwner} from '../../../../../lib/owner';
import {assertSameOrigin,respond,RequestFailure} from '../../../../../lib/http';
import {editExistingVideo} from '../../../../../lib/video-editor';
export const dynamic='force-dynamic';
export async function POST(request:Request,{params}:{params:Promise<{id:string}>}){return respond(async()=>{
  const {env,agency}=await requireOwner(request);assertSameOrigin(request,env);
  const key=request.headers.get('Idempotency-Key')??'';
  if(!/^[a-zA-Z0-9_-]{16,128}$/.test(key))throw new RequestFailure('VALIDATION_ERROR');
  return Response.json(await editExistingVideo(env,agency.id,(await params).id,key,request.signal),{status:201});
});}
