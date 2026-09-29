import {requireOwner} from '../../../../../lib/owner';
import {respond} from '../../../../../lib/http';
import {ownGeneration} from '../../../../../lib/generations';
import {generationSourcePhoto} from '../../../../../lib/generation-source-photo';
export const dynamic='force-dynamic';
export async function GET(request:Request,{params}:{params:Promise<{id:string}>}){return respond(async()=>{
  const {env,agency}=await requireOwner(request);
  return generationSourcePhoto(env,await ownGeneration(env,agency.id,(await params).id));
});}
