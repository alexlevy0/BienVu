import {z} from 'zod';
import {EntityId,AgencyTemplate,captureAgencyTemplate,VideoReport,VideoAsset} from '@bienvu/contracts';
import {findCreationDraft,findOwnedGeneration,generationMasterUnlocked} from '@bienvu/db';
import {RequestFailure} from './http';
import {contentHash} from './manual-listings';
import {streamGenerationMedia} from './generations';
type Env=Pick<CloudflareEnv,'DB'|'MEDIA'>;
const name=z.string().trim().min(1).max(120);
export const WorkspaceAction=z.discriminatedUnion('action',[
 z.object({action:z.literal('project'),name}),z.object({action:z.literal('archive'),id:EntityId,archived:z.boolean()}),
 z.object({action:z.literal('attach'),projectId:EntityId.nullable(),kind:z.enum(['draft','job']),id:EntityId}),
 z.object({action:z.literal('template'),name:name.max(80),draftId:EntityId,version:z.number().int().positive(),isDefault:z.boolean()}),
 z.object({action:z.literal('delete-template'),id:EntityId}),z.object({action:z.literal('review'),jobId:EntityId}),z.object({action:z.literal('revoke-review'),id:EntityId}),
]);
async function items<T>(env:Env,sql:string,agency:string){const row=await env.DB.prepare(sql).bind(agency).first<{items:string}>();return JSON.parse(row?.items??'[]') as T[];}
export async function workspaceSummary(env:Env,agency:string){
 const projects=await items(env,"SELECT json_group_array(json_object('id',id,'name',name,'archived',archived,'createdAt',created_at)) AS items FROM (SELECT * FROM property_projects WHERE agency_id=? ORDER BY created_at DESC LIMIT 500)",agency);
 const links=await items(env,"SELECT json_group_array(json_object('projectId',project_id,'kind',kind,'id',entity_id)) AS items FROM project_items WHERE agency_id=?",agency);
 const templates=await items<{id:string;name:string;isDefault:number;template:AgencyTemplate}>(env,"SELECT json_group_array(json_object('id',id,'name',name,'isDefault',is_default,'template',json(template_json))) AS items FROM agency_templates WHERE agency_id=?",agency);
 const reviews=await items(env,"SELECT json_group_array(json_object('id',id,'jobId',job_id,'status',status,'expiresAt',expires_at,'approvedAt',approved_at,'manifestHash',manifest_hash)) AS items FROM (SELECT * FROM client_reviews WHERE agency_id=? ORDER BY created_at DESC LIMIT 500)",agency);
 const comments=await items(env,"SELECT json_group_array(json_object('reviewId',c.review_id,'name',c.name,'text',c.text,'time',c.time_seconds,'at',c.created_at)) AS items FROM client_review_comments c JOIN client_reviews r ON r.id=c.review_id WHERE r.agency_id=?",agency);
 return {projects,links,templates:templates.map(t=>({...t,template:AgencyTemplate.parse(t.template)})),reviews,comments};
}
export async function workspaceAction(env:Env,agency:string,input:unknown){
 const parsed=WorkspaceAction.safeParse(input);if(!parsed.success)throw new RequestFailure('VALIDATION_ERROR');
 const action=parsed.data,at=new Date().toISOString(),id=crypto.randomUUID();
 if(action.action==='project'){
  const n=await env.DB.prepare('SELECT count(*) n FROM property_projects WHERE agency_id=?').bind(agency).first<{n:number}>();if((n?.n??0)>=500)throw new RequestFailure('RATE_LIMITED');
  await env.DB.prepare('INSERT INTO property_projects(id,agency_id,name,created_at) VALUES(?,?,?,?)').bind(id,agency,action.name,at).run();return {id};
 }
 if(action.action==='archive'){await env.DB.prepare('UPDATE property_projects SET archived=? WHERE agency_id=? AND id=?').bind(action.archived?1:0,agency,action.id).run();return {ok:true};}
 if(action.action==='attach'){
  if(action.kind==='draft'?!await findCreationDraft(env.DB,agency,action.id):!await findOwnedGeneration(env.DB,agency,action.id))throw new RequestFailure('NOT_FOUND');
  if(action.projectId){if(!await env.DB.prepare('SELECT 1 FROM property_projects WHERE agency_id=? AND id=? AND archived=0').bind(agency,action.projectId).first())throw new RequestFailure('NOT_FOUND');
   await env.DB.prepare('INSERT INTO project_items VALUES(?,?,?,?,?) ON CONFLICT(agency_id,kind,entity_id) DO UPDATE SET project_id=excluded.project_id').bind(agency,action.projectId,action.kind,action.id,at).run();
  }else await env.DB.prepare('DELETE FROM project_items WHERE agency_id=? AND kind=? AND entity_id=?').bind(agency,action.kind,action.id).run();return {ok:true};
 }
 if(action.action==='template'){
  const draft=await findCreationDraft(env.DB,agency,action.draftId);if(!draft)throw new RequestFailure('NOT_FOUND');if(draft.version!==action.version)throw new RequestFailure('CONFLICT');
  const settings=draft.data.videoCustomization;if(!settings?.editor)throw new RequestFailure('VALIDATION_ERROR');
  const n=await env.DB.prepare('SELECT count(*) n FROM agency_templates WHERE agency_id=?').bind(agency).first<{n:number}>();if((n?.n??0)>=50)throw new RequestFailure('RATE_LIMITED');
  await env.DB.batch([...(action.isDefault?[env.DB.prepare('UPDATE agency_templates SET is_default=0 WHERE agency_id=?').bind(agency)]:[]),env.DB.prepare('INSERT INTO agency_templates VALUES(?,?,?,?,?,?)').bind(id,agency,action.name,JSON.stringify(captureAgencyTemplate({...settings,editor:settings.editor})),action.isDefault?1:0,at)]);return {id};
 }
 if(action.action==='delete-template'){await env.DB.prepare('DELETE FROM agency_templates WHERE agency_id=? AND id=?').bind(agency,action.id).run();return {ok:true};}
 if(action.action==='revoke-review'){await env.DB.prepare("UPDATE client_reviews SET status='revoked' WHERE agency_id=? AND id=?").bind(agency,action.id).run();return {ok:true};}
 const job=await findOwnedGeneration(env.DB,agency,action.jobId);
 if(!job||job.status!=='ready'||job.retention!=='available'||!generationMasterUnlocked(job)||job.expiresAt<=at)throw new RequestFailure('NOT_FOUND');
 const manifest=await env.DB.prepare('SELECT manifest_hash AS hash FROM video_manifests WHERE agency_id=? AND job_id=?').bind(job.agencyId,job.jobId).first<{hash:string}>();if(!manifest)throw new RequestFailure('NOT_FOUND');
 const n=await env.DB.prepare("SELECT count(*) n FROM client_reviews WHERE agency_id=? AND created_at>=? AND status!='revoked'").bind(agency,new Date(Date.now()-86400_000).toISOString()).first<{n:number}>();if((n?.n??0)>=50)throw new RequestFailure('RATE_LIMITED');
 const token=Array.from(crypto.getRandomValues(new Uint8Array(32)),b=>b.toString(16).padStart(2,'0')).join(''),expiresAt=new Date(Math.min(Date.parse(job.expiresAt),Date.now()+7*86400_000)).toISOString();
 await env.DB.prepare("INSERT INTO client_reviews(id,agency_id,job_id,manifest_hash,token_hash,status,expires_at,created_at) VALUES(?,?,?,?,?,'pending',?,?)").bind(id,agency,job.jobId,manifest.hash,await contentHash(new TextEncoder().encode(token)),expiresAt,at).run();
 return {id,url:`/validation/${token}`,expiresAt};
}
export async function findReview(env:Env,token:string){
 if(!/^[a-f0-9]{64}$/.test(token))throw new RequestFailure('NOT_FOUND');
 const review=await env.DB.prepare("SELECT id,agency_id AS agencyId,job_id AS jobId,manifest_hash AS hash,status,expires_at AS expiresAt FROM client_reviews WHERE token_hash=? AND status!='revoked' AND expires_at>?").bind(await contentHash(new TextEncoder().encode(token)),new Date().toISOString()).first<{id:string;agencyId:string;jobId:string;hash:string;status:string;expiresAt:string}>();
 if(!review)throw new RequestFailure('NOT_FOUND');const job=await findOwnedGeneration(env.DB,review.agencyId,review.jobId);
 const manifest=job?await env.DB.prepare("SELECT manifest_hash AS hash FROM video_manifests WHERE agency_id=? AND job_id=?").bind(job.agencyId,job.jobId).first<{hash:string}>():null;
 if(!job||!manifest||manifest.hash!==review.hash||job.retention!=='available'||job.status!=='ready'||job.expiresAt<=new Date().toISOString()||!job.report||!job.objectKey)throw new RequestFailure('NOT_FOUND');
 return {review,job};
}
export async function reviewView(env:Env,token:string){const {review,job}=await findReview(env,token);
 const comments=await items(env,"SELECT json_group_array(json_object('name',name,'text',text,'time',time_seconds,'at',created_at)) AS items FROM client_review_comments WHERE review_id=?",review.id);
 return {title:job.title,hash:review.hash,status:review.status,expiresAt:review.expiresAt,comments,videoUrl:`/api/validation/${token}/video`};
}
export async function reviewResponse(env:Env,token:string,input:unknown){
 const body=z.object({action:z.enum(['comment','approve']),name:z.string().trim().min(1).max(80),text:z.string().trim().max(1500),time:z.number().min(0).max(40).nullable(),hash:z.string().regex(/^[a-f0-9]{64}$/)}).strict().safeParse(input);
 if(!body.success||body.data.action==='comment'&&!body.data.text)throw new RequestFailure('VALIDATION_ERROR');
 const {review}=await findReview(env,token);if(review.hash!==body.data.hash||review.status==='approved')throw new RequestFailure('CONFLICT');
 const b=body.data,at=new Date().toISOString();
 try{await env.DB.batch([env.DB.prepare("INSERT INTO client_review_comments SELECT ?,?,?,?,?,? WHERE EXISTS(SELECT 1 FROM client_reviews WHERE id=? AND status IN ('pending','commented') AND expires_at>?)").bind(crypto.randomUUID(),review.id,b.name,b.action==='approve'?(b.text||'Version validée.'):b.text,b.time,at,review.id,at),env.DB.prepare("UPDATE client_reviews SET status=?,approved_at=? WHERE id=? AND status IN ('pending','commented') AND expires_at>?").bind(b.action==='approve'?'approved':'commented',b.action==='approve'?at:null,review.id,at)]);}catch(error){if(error instanceof Error&&error.message.includes('REVIEW_LIMIT'))throw new RequestFailure('RATE_LIMITED');throw error;}
 return reviewView(env,token);
}
export async function reviewVideo(env:Env,request:Request,token:string){const {job}=await findReview(env,token);
 return streamGenerationMedia(request,env,job,'master');
}
