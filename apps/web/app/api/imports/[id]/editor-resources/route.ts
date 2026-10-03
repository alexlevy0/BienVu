import {requireOwner} from '../../../../../lib/owner';
import {respond} from '../../../../../lib/http';
import {editorResources} from '../../../../../lib/video-editor';
export const dynamic='force-dynamic';
export async function GET(request:Request,{params}:{params:Promise<{id:string}>}){return respond(async()=>{
 const {env,agency}=await requireOwner(request);
 return Response.json(await editorResources(env.DB,agency.id,(await params).id));
});}
