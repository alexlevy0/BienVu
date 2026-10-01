import {requireOwner} from '../../../../../lib/owner';
import {assertSameOrigin,RequestFailure,respond} from '../../../../../lib/http';
import {customizeImportedListing} from '../../../../../lib/creation-drafts';
export const dynamic='force-dynamic';
export async function POST(request:Request,{params}:{params:Promise<{id:string}>}){return respond(async()=>{
  const {env,agency}=await requireOwner(request);assertSameOrigin(request,env);
  const key=request.headers.get('Idempotency-Key')??'';
  if(!/^[a-zA-Z0-9_-]{16,128}$/.test(key))throw new RequestFailure('VALIDATION_ERROR');
  return Response.json(await customizeImportedListing(env,agency.id,(await params).id,key,request.signal),{status:201});
});}
