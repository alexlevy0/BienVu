import {GenerationRequest} from '@bienvu/contracts';
import {requireOwner} from '../../../lib/owner';
import {assertSameOrigin,boundedJson,RequestFailure,respond} from '../../../lib/http';
import {callGeneration,generationHistory} from '../../../lib/generations';
export const dynamic='force-dynamic';
export async function POST(request:Request){return respond(async()=>{
  const {env,agency}=await requireOwner(request);assertSameOrigin(request,env);
  const input=GenerationRequest.safeParse(await boundedJson(request));
  if(!input.success)throw new RequestFailure('VALIDATION_ERROR');
  return callGeneration(env,agency.id,'/generations',input.data,request.headers.get('Idempotency-Key')??'');
});}
export async function GET(request:Request){return respond(async()=>{
  const {env,agency}=await requireOwner(request);
  return Response.json(await generationHistory(env,agency.id,new URL(request.url).searchParams.get('cursor')??undefined));
});}
