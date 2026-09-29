import {requireOwner} from '../../../../../lib/owner';
import {assertSameOrigin,respond} from '../../../../../lib/http';
import {callGeneration,ownGeneration} from '../../../../../lib/generations';
export async function POST(request:Request,context:{params:Promise<{id:string}>}){return respond(async()=>{
  const {env,agency}=await requireOwner(request);assertSameOrigin(request,env);
  const row=await ownGeneration(env,agency.id,(await context.params).id);
  return callGeneration(env,row.agencyId,`/generations/${row.jobId}/retry`,{});
});}
