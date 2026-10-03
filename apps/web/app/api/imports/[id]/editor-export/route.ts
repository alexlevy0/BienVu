import {findOwnedGeneration,generationView} from '@bienvu/db';
import {contentHash} from '../../../../../lib/manual-listings';
import {requireOwner} from '../../../../../lib/owner';
import {assertSameOrigin,boundedJson,respond,RequestFailure} from '../../../../../lib/http';
import {snapshotEditorExport} from '../../../../../lib/video-editor';
import {callGeneration} from '../../../../../lib/generations';
export const dynamic='force-dynamic';
export async function POST(request:Request,{params}:{params:Promise<{id:string}>}){return respond(async()=>{
  const {env,agency}=await requireOwner(request);assertSameOrigin(request,env);
  const body=await boundedJson(request,1024) as {version?:unknown;confirmed?:unknown};
  if(!Number.isSafeInteger(body?.version)||body.confirmed!==true)throw new RequestFailure('VALIDATION_ERROR');
  const id=(await params).id,version=body.version as number;
  const link=await env.DB.prepare('SELECT job_id AS id FROM editor_exports WHERE agency_id=? AND import_id=? AND version=?').bind(agency.id,id,version).first<{id:string}>();
  const previous=link?await findOwnedGeneration(env.DB,agency.id,link.id):null;
  if(previous&&previous.status!=='failed'&&previous.retention==='available'&&previous.expiresAt>new Date().toISOString())return Response.json(generationView(previous));
  const key=await contentHash(new TextEncoder().encode(`${agency.id}:${id}:${version}:${previous?.jobId??'initial'}`));
  const input=await snapshotEditorExport(env,agency.id,id,version,key,request.signal);
  const response=await callGeneration(env,agency.id,'/generations',input,key),value=await response.json() as {id:string};
  await env.DB.prepare('INSERT INTO editor_exports VALUES(?,?,?,?,?) ON CONFLICT(agency_id,import_id,version) DO UPDATE SET job_id=excluded.job_id,created_at=excluded.created_at')
    .bind(agency.id,id,version,value.id,new Date().toISOString()).run();
  return Response.json(value,{status:response.status});
});}
