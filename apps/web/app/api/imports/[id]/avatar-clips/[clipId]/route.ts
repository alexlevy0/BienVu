import {requireOwner} from '../../../../../../lib/owner';
import {respond} from '../../../../../../lib/http';
import {editorAvatarMedia} from '../../../../../../lib/editor-avatars';
export const dynamic='force-dynamic';
export async function GET(request:Request,{params}:{params:Promise<{id:string;clipId:string}>}){return respond(async()=>{
  const {env,agency}=await requireOwner(request),{id,clipId}=await params;return editorAvatarMedia(request,env,agency.id,id,clipId);
});}
