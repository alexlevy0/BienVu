import {requireOwner} from '../../../../../lib/owner';
import {respond} from '../../../../../lib/http';
import {generationVideo} from '../../../../../lib/generations';
export const dynamic='force-dynamic';
export async function GET(request:Request,context:{params:Promise<{id:string}>}){return respond(async()=>{
  const {env,agency}=await requireOwner(request);return generationVideo(request,env,agency.id,(await context.params).id);
});}
export const HEAD=GET;
