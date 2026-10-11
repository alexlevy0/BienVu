import {requireOwner} from '../../../../../lib/owner';
import {respond} from '../../../../../lib/http';
import {ownGeneration} from '../../../../../lib/generations';
import {generationStream} from '../../../../../lib/progressive-video';
export const dynamic='force-dynamic';
export async function GET(request:Request,{params}:{params:Promise<{id:string}>}){return respond(async()=>{
  const {env,agency}=await requireOwner(request);return generationStream(request,env,await ownGeneration(env,agency.id,(await params).id));
});}
