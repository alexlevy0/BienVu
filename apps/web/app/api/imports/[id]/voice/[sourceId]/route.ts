import {requireOwner} from '../../../../../../lib/owner';
import {respond} from '../../../../../../lib/http';
import {editorVoicePreview} from '../../../../../../lib/editor-voice';
export const dynamic='force-dynamic';
export async function GET(request:Request,{params}:{params:Promise<{id:string;sourceId:string}>}){return respond(async()=>{
  const {env,agency}=await requireOwner(request),{id,sourceId}=await params;
  return Response.json(await editorVoicePreview(env,agency.id,id,sourceId));
});}
