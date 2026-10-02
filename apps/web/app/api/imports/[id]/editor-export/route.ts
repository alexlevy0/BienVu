import {requireOwner} from '../../../../../lib/owner';
import {assertSameOrigin,boundedJson,respond,RequestFailure} from '../../../../../lib/http';
import {snapshotEditorExport} from '../../../../../lib/video-editor';
import {callGeneration} from '../../../../../lib/generations';
export const dynamic='force-dynamic';
export async function POST(request:Request,{params}:{params:Promise<{id:string}>}){return respond(async()=>{
  const {env,agency}=await requireOwner(request);assertSameOrigin(request,env);
  const key=request.headers.get('Idempotency-Key')??'',body=await boundedJson(request,1024) as {version?:unknown;confirmed?:unknown};
  if(!/^[a-zA-Z0-9_-]{16,128}$/.test(key)||!Number.isSafeInteger(body?.version)||body.confirmed!==true)throw new RequestFailure('VALIDATION_ERROR');
  const input=await snapshotEditorExport(env,agency.id,(await params).id,body.version as number,key,request.signal);
  return callGeneration(env,agency.id,'/generations',input,key);
});}
