import {z} from 'zod';
import {requireOwner} from '../../../../lib/owner';
import {assertSameOrigin,boundedJson,respond,RequestFailure} from '../../../../lib/http';
import {archiveProperty,propertyDetail,preparePropertyDraft} from '../../../../lib/properties';
export const dynamic='force-dynamic';
type Context={params:Promise<{id:string}>};
export async function GET(request:Request,context:Context){return respond(async()=>{const {env,agency}=await requireOwner(request);
  return Response.json(await propertyDetail(env,agency.id,(await context.params).id,new URL(request.url).searchParams.get('cursor'),agency.name));});}
export async function PATCH(request:Request,context:Context){return respond(async()=>{const {env,agency}=await requireOwner(request);assertSameOrigin(request,env);
  const body=z.object({archived:z.boolean()}).strict().safeParse(await boundedJson(request,1024));if(!body.success)throw new RequestFailure('VALIDATION_ERROR');
  return Response.json(await archiveProperty(env,agency.id,(await context.params).id,body.data.archived));});}
export async function POST(request:Request,context:Context){return respond(async()=>{const {env,agency}=await requireOwner(request);assertSameOrigin(request,env);
  const body=z.object({action:z.literal('edit')}).strict().safeParse(await boundedJson(request,1024));if(!body.success)throw new RequestFailure('VALIDATION_ERROR');
  return Response.json(await preparePropertyDraft(env,agency.id,(await context.params).id,request.headers.get('Idempotency-Key')??'',request.signal));});}
