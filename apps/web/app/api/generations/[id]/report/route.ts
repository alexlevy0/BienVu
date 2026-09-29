import {requireOwner} from '../../../../../lib/owner';
import {assertSameOrigin,boundedJson,respond} from '../../../../../lib/http';
import {ownGeneration} from '../../../../../lib/generations';
import {saveProblemReport} from '../../../../../lib/problem-reports';
export const dynamic='force-dynamic';
export async function POST(request:Request,{params}:{params:Promise<{id:string}>}){return respond(async()=>{
  const {env,agency}=await requireOwner(request);assertSameOrigin(request,env);
  const row=await ownGeneration(env,agency.id,(await params).id);
  return Response.json(await saveProblemReport(env.DB,row,`agency:${agency.id}`,request.headers.get('Idempotency-Key')??'',await boundedJson(request,1500)),{status:201});
});}
