import {requireOwner} from '../../../../lib/owner';
import {assertSameOrigin,RequestFailure,respond} from '../../../../lib/http';
import {assertImportMode,reserveCloudflareImport} from '../../../../lib/import-transport';
import {startManualCreationDraft} from '../../../../lib/creation-drafts';
export const dynamic='force-dynamic';
export async function POST(request:Request){return respond(async()=>{
  const {env,agency}=await requireOwner(request);assertSameOrigin(request,env);
  const mode=assertImportMode(request,env),key=request.headers.get('Idempotency-Key')??'';
  if(!/^[a-zA-Z0-9_-]{16,128}$/.test(key))throw new RequestFailure('VALIDATION_ERROR');
  const draft=await startManualCreationDraft(env.DB,agency.id,key);
  if(mode==='cloudflare')await reserveCloudflareImport(env,agency.id,draft.id);
  return Response.json(draft,{status:201});
});}
