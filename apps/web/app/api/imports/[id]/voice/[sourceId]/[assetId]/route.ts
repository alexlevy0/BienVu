import {requireOwner} from '../../../../../../../lib/owner';
import {respond} from '../../../../../../../lib/http';
import {privateEditorVoice} from '../../../../../../../lib/editor-voice';
export const dynamic='force-dynamic';
export async function GET(request:Request,{params}:{params:Promise<{id:string;sourceId:string;assetId:string}>}){return respond(async()=>{
  const {env,agency}=await requireOwner(request),{id,sourceId,assetId}=await params;
  return privateEditorVoice(env,agency.id,id,sourceId,assetId,request);
});}
