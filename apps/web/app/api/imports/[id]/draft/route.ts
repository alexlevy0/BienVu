import {findCreationDraft} from '@bienvu/db';
import {requireOwner} from '../../../../../lib/owner';
import {assertSameOrigin,boundedJson,RequestFailure,respond} from '../../../../../lib/http';
import {patchCreationDraft} from '../../../../../lib/creation-drafts';
export const dynamic='force-dynamic';
type Context={params:Promise<{id:string}>};
export async function GET(request:Request,context:Context){return respond(async()=>{
  const {env,agency}=await requireOwner(request),draft=await findCreationDraft(env.DB,agency.id,(await context.params).id);
  if(!draft)throw new RequestFailure('NOT_FOUND');return Response.json(draft);
});}
export async function PATCH(request:Request,context:Context){return respond(async()=>{
  const {env,agency}=await requireOwner(request);assertSameOrigin(request,env);
  return Response.json(await patchCreationDraft(env.DB,agency.id,(await context.params).id,await boundedJson(request,32_000)));
});}
