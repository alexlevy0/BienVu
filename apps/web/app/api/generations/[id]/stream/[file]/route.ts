import {requireOwner} from '../../../../../../lib/owner';
import {respond} from '../../../../../../lib/http';
import {ownGeneration} from '../../../../../../lib/generations';
import {generationStream} from '../../../../../../lib/progressive-video';
export const dynamic='force-dynamic';
export async function GET(request:Request,{params}:{params:Promise<{id:string;file:string}>}){return respond(async()=>{
  const {env,agency}=await requireOwner(request),{id,file}=await params;return generationStream(request,env,await ownGeneration(env,agency.id,id),file);
});}
export const HEAD=GET;
