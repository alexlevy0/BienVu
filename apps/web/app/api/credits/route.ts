import {creditHistory} from '@bienvu/db';
import {requireOwner} from '../../../lib/owner';
import {RequestFailure,respond} from '../../../lib/http';
export const dynamic='force-dynamic';
export async function GET(request:Request){return respond(async()=>{
  const {env,agency}=await requireOwner(request);
  try{return Response.json(await creditHistory(env.DB,agency.id,new URL(request.url).searchParams.get('cursor')??undefined));}
  catch(error){if(error instanceof Error&&error.message==='INVALID_CREDIT_CURSOR')throw new RequestFailure('VALIDATION_ERROR');throw error;}
});}
