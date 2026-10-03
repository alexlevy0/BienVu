import {requireOwner} from '../../../../lib/owner';
import {assertSameOrigin,boundedJson,respond} from '../../../../lib/http';
import {copyDemoMedia} from '../../../../lib/editor-demo-media';
export const dynamic='force-dynamic';
export async function POST(request:Request){return respond(async()=>{
  const {env,agency}=await requireOwner(request);assertSameOrigin(request,env);
  return Response.json(await copyDemoMedia(env,agency.id,await boundedJson(request,4096),request.signal));
});}
