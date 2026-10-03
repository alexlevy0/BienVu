import {findCreationDraft,findOwnedGeneration,generationView} from '@bienvu/db';
import {requireOwner} from '../../../../../lib/owner';
import {respond,RequestFailure} from '../../../../../lib/http';
export const dynamic='force-dynamic';
export async function GET(request:Request,{params}:{params:Promise<{id:string}>}){return respond(async()=>{
 const {env,agency}=await requireOwner(request),id=(await params).id,draft=await findCreationDraft(env.DB,agency.id,id);
 if(!draft)throw new RequestFailure('NOT_FOUND');
 const link=await env.DB.prepare('SELECT job_id AS id FROM editor_exports WHERE agency_id=? AND import_id=? AND version=?').bind(agency.id,id,draft.version).first<{id:string}>();
 const job=link?await findOwnedGeneration(env.DB,agency.id,link.id):null;
 return Response.json({version:draft.version,job:job?generationView(job):null});
});}
