import {z} from 'zod';
import {EntityId,AdminQuery} from '@bienvu/contracts';
import {adminPage,adminVideoDetail,adminGenerationQueue} from '@bienvu/db';
import {requireStaff,isSuperAdmin} from './admin-access';
import type {AuthEnvironment} from './auth';
import {assertSameOrigin,boundedJson,respond,RequestFailure} from './http';

const day=z.iso.date();
export const OperationsQuery=z.object({section:z.enum(['dashboard','performance','incidents','retention','profit','providers','changes','video','agency','notes']).default('dashboard'),
 days:z.enum(['7','30','90']).default('30'),audience:z.enum(['account','anonymous','internal','all']).default('account'),
 duration:z.enum(['all','20','30','40']).default('all'),avatar:z.enum(['all','yes','no']).default('all'),animations:z.enum(['all','yes','no']).default('all'),
 mode:z.enum(['live','test']).default('live'),id:EntityId.optional(),from:day.optional(),to:day.optional()}).strict().refine(v=>!v.from||!v.to||v.from<=v.to);
export type OperationsFilter=z.infer<typeof OperationsQuery>;
export const OperationAction=z.discriminatedUnion('action',[
 z.object({action:z.literal('note'),id:EntityId,body:z.string().trim().min(3).max(2000)}).strict(),
 z.object({action:z.literal('incident'),target:z.string().min(1).max(200),state:z.enum(['open','reviewing','resolved']),expected:EntityId.nullable(),body:z.string().trim().min(5).max(2000)}).strict(),
 z.object({action:z.literal('change'),title:z.string().trim().min(3).max(120),body:z.string().trim().min(5).max(2000)}).strict(),
]);
type Entry={id:string;kind:string;target:string;body:string;state:string|null;at:string;actor:string};
type Sample={id:string;agencyId:string|null;agency:string|null;status:string;stage:string;error:string|null;at:string;updatedAt:string;seconds:number|null;waitSeconds:number|null;render:string;duration:number|null};
type Incident={key:string;code:string;stage:string;count:number;agencies:number;firstAt:string;lastAt:string;recent:number;previous:number;review:Entry|null;reopened:boolean;jobs:{id:string;at:string;agency:string|null;reports:number}[]};
const owner="coalesce(g.owner_agency_id,j.agency_id)";
const audience=`CASE WHEN g.anonymous_session_id IS NOT NULL AND g.owner_agency_id IS NULL THEN 'anonymous' WHEN u.id IS NOT NULL THEN 'account' ELSE 'internal' END`;
const render="CASE WHEN coalesce(g.animations_requested,0)>0 THEN IIF(coalesce(g.avatar_credits+g.avatar_extra_credits,0)>0,'avatar_ai','ai') WHEN coalesce(g.avatar_credits+g.avatar_extra_credits,0)>0 THEN 'avatar' ELSE 'standard' END";
const joins=`FROM jobs j LEFT JOIN generation_runs g ON g.job_id=j.id LEFT JOIN agencies a ON a.id=${owner} LEFT JOIN auth_user u ON u.id=a.owner_user_id`;
const rows=async<T>(db:D1Database,sql:string,binds:(string|number|null)[]=[]) => (await db.prepare(sql).bind(...binds).all<T>()).results;
const entrySelect="SELECT o.id,o.kind,o.target,o.body,o.state,o.created_at AS at,coalesce(u.name,'Administrateur') AS actor FROM admin_operation_entries o LEFT JOIN auth_user u ON u.id=o.actor_id";
export function percentiles(values:number[]){
 const sorted=values.filter(v=>Number.isFinite(v)&&v>=0).sort((a,b)=>a-b),n=sorted.length;
 return {measured:n,average:n?sorted.reduce((a,b)=>a+b,0)/n:null,median:n?(sorted[Math.floor((n-1)/2)]+sorted[Math.floor(n/2)])/2:null,p95:n?sorted[Math.ceil(n*.95)-1]:null};
}
function filter(f:OperationsFilter,now:number){
 const at=new Date(now).toISOString(),from=f.from??new Date(Date.UTC(new Date(now).getUTCFullYear(),new Date(now).getUTCMonth(),new Date(now).getUTCDate())-(Number(f.days)-1)*86400_000).toISOString().slice(0,10),to=f.to??at.slice(0,10);
 // Limit expensive time-series queries, including manually supplied dates.
 if(Date.parse(to)-Date.parse(from)>366*86400_000||to>at.slice(0,10))throw new RequestFailure('VALIDATION_ERROR');
 const where=`j.created_at>=? AND j.created_at<=? AND (?='all' OR ${audience}=?) AND (?='all' OR json_extract(g.input_json,'$.durationSeconds')=CAST(? AS INTEGER)) AND (?='all' OR IIF(coalesce(g.avatar_credits+g.avatar_extra_credits,0)>0,'yes','no')=?) AND (?='all' OR IIF(coalesce(g.animations_requested,0)>0,'yes','no')=?)`;
 return {at,from,to,where,binds:[from+'T00:00:00.000Z',to===at.slice(0,10)?at:to+'T23:59:59.999Z',f.audience,f.audience,f.duration,f.duration,f.avatar,f.avatar,f.animations,f.animations]};
}
export async function operationsRead(db:D1Database,f:OperationsFilter,now=Date.now()){
 const scope=filter(f,now),{at,from,to,where,binds}=scope;
 if(f.section==='notes'){
  if(!f.id)throw new RequestFailure('VALIDATION_ERROR');if(!await db.prepare('SELECT 1 FROM agencies WHERE id=?').bind(f.id).first())throw new RequestFailure('NOT_FOUND');
  return {at,notes:await rows<Entry>(db,entrySelect+" WHERE o.kind='note' AND o.target=? ORDER BY o.created_at DESC,o.id DESC LIMIT 100",[f.id])};
 }
 if(f.section==='video'){
  if(!f.id)throw new RequestFailure('VALIDATION_ERROR');const detail=await adminVideoDetail(db,f.id);if(!detail)throw new RequestFailure('NOT_FOUND');
  const [preparation,queue,push,currentPush,avatars,stages,source,script]=await Promise.all([
   rows<{step:string;state:string;startedAt:string;at:string;error:string|null}>(db,'SELECT step,state,started_at AS startedAt,updated_at AS at,error_code AS error FROM generation_preparation_steps WHERE job_id=? ORDER BY started_at',[f.id]),
   rows<{resource:string;state:string;at:string;startedAt:string|null;updatedAt:string}>(db,'SELECT resource,state,created_at AS at,started_at AS startedAt,updated_at AS updatedAt FROM generation_queue WHERE job_id=? ORDER BY sequence',[f.id]),
   rows<{event:string;attempt:number;at:string}>(db,'SELECT event,attempt,created_at AS at FROM browser_push_events WHERE job_id=? ORDER BY id LIMIT 200',[f.id]),
   rows<{status:string;attempts:number;at:string;sentAt:string|null}>(db,'SELECT status,attempts,created_at AS at,sent_at AS sentAt FROM browser_push_deliveries WHERE job_id=?',[f.id]),
   rows<{state:string;error:string|null;at:string;moment:string}>(db,'SELECT state,error_code AS error,created_at AS at,moment FROM avatar_tasks WHERE job_id=? ORDER BY created_at',[f.id]),
   rows<{stage:string;status:string;error:string|null;at:string}>(db,'SELECT stage,status,error_code AS error,created_at AS at FROM generation_stage_events WHERE job_id=? ORDER BY id LIMIT 200',[f.id]),
   db.prepare('SELECT i.status,i.error_code AS error,i.created_at AS at FROM jobs j JOIN listing_imports i ON i.id=j.listing_id AND i.agency_id=j.agency_id WHERE j.id=?').bind(f.id).first<{status:string;error:string|null;at:string}>(),
   rows<{id:string;text:string;caption:string}>(db,"SELECT json_extract(s.value,'$.id') AS id,json_extract(s.value,'$.narrationText') AS text,json_extract(s.value,'$.captionText') AS caption FROM narration_runs n,json_each(n.script_json,'$.scenes') s WHERE n.job_id=? ORDER BY CAST(s.key AS INTEGER) LIMIT 12",[f.id]),
  ]);return {at,detail,preparation,queue,push,currentPush,avatars,stages,source,script};
 }
 if(f.section==='agency'){
  if(!f.id)throw new RequestFailure('VALIDATION_ERROR');
  const agency=(await adminPage(db,AdminQuery.parse({section:'agencies',q:f.id}))).rows.find(r=>r.id===f.id);if(!agency)throw new RequestFailure('NOT_FOUND');
  const [videos,quotas,reports,notes,messages]=await Promise.all([
   adminPage(db,AdminQuery.parse({section:'videos',agency:f.id})),adminPage(db,AdminQuery.parse({section:'quotas',agency:f.id})),adminPage(db,AdminQuery.parse({section:'reports',agency:f.id})),
   rows<Entry>(db,entrySelect+" WHERE o.kind='note' AND o.target=? ORDER BY o.created_at DESC,o.id DESC LIMIT 100",[f.id]),
   rows<{id:string;subject:string;at:string}>(db,'SELECT id,subject,last_at AS at FROM mailbox_threads WHERE peer_email=? COLLATE NOCASE ORDER BY last_at DESC LIMIT 30',[String(agency.email??'')]),
  ]);return {at,agency,videos,quotas,reports,notes,messages};
 }
 if(f.section==='changes')return {at,changes:await changes(db,from,to)};
 if(f.section==='providers')return {at,queue:await adminGenerationQueue(db),activity:await providerActivity(db,from,to)};
 if(f.section==='retention')return {at,from,to,...await retention(db,from,to,now)};
 if(f.section==='profit'){
  const groups=await rows<{render:string;videos:number;credits:number;revenueMicros:number;costMicros:number;feeMicros:number;incomplete:number;marginMicros:number|null}>(db,`SELECT ${render} AS render,count(*) AS videos,sum(v.credits_used) AS credits,sum(v.revenue_micros) AS revenueMicros,sum(v.cost_micros) AS costMicros,sum(v.fee_micros) AS feeMicros,sum(v.fees_missing>0 OR v.missing_providers IS NOT NULL) AS incomplete,CASE WHEN sum(v.fees_missing>0 OR v.missing_providers IS NOT NULL)=0 THEN sum(v.revenue_micros-v.cost_micros-v.fee_micros) END AS marginMicros FROM finance_video_summary v JOIN jobs j ON j.id=v.job_id LEFT JOIN generation_runs g ON g.job_id=j.id LEFT JOIN agencies a ON a.id=${owner} LEFT JOIN auth_user u ON u.id=a.owner_user_id WHERE ${where} AND v.mode=? GROUP BY 1`,[...binds,f.mode]);
  return {at,from,to,mode:f.mode,groups};
 }
 if(f.section==='incidents')return {at,from,to,incidents:await incidents(db,scope,now)};
 if(f.section==='dashboard'){
  const [problems,stalled,reports]=await Promise.all([
   incidents(db,scope,now),
   rows<{id:string;agency:string|null;stage:string;at:string;updatedAt:string}>(db,`SELECT j.id,a.name AS agency,j.stage,j.created_at AS at,j.updated_at AS updatedAt ${joins} WHERE j.status NOT IN ('ready','failed') AND j.updated_at<? ORDER BY j.created_at LIMIT 30`,[new Date(now-15*60000).toISOString()]),
   rows<{id:string;jobId:string;category:string;agency:string|null;at:string}>(db,`SELECT r.id,r.job_id AS jobId,r.category,a.name AS agency,r.created_at AS at FROM generation_reports r JOIN jobs j ON j.id=r.job_id LEFT JOIN generation_runs g ON g.job_id=j.id LEFT JOIN agencies a ON a.id=${owner} WHERE r.status!='closed' ORDER BY r.created_at LIMIT 30`),
  ]);return {at,from,to,incidents:problems.filter(i=>i.review?.state!=='resolved'),stalled,reports};
 }
 const [sample,total,markers]=await Promise.all([
  rows<Sample>(db,`SELECT j.id,${owner} AS agencyId,a.name AS agency,j.status,j.stage,j.error_code AS error,j.created_at AS at,j.updated_at AS updatedAt,
   CASE WHEN j.status='ready' AND julianday(e.created_at)>=julianday(j.created_at) THEN round((julianday(e.created_at)-julianday(j.created_at))*86400,3) END AS seconds,
   (SELECT round(sum((julianday(q.started_at)-julianday(q.created_at))*86400),3) FROM generation_queue q WHERE q.job_id=j.id AND q.started_at IS NOT NULL AND q.started_at>=q.created_at) AS waitSeconds,
   ${render} AS render,json_extract(g.input_json,'$.durationSeconds') AS duration ${joins} LEFT JOIN generation_events e ON e.job_id=j.id AND e.event='ready' WHERE ${where} ORDER BY j.created_at DESC,j.id DESC LIMIT 20000`,binds),
  db.prepare(`SELECT count(*) AS total ${joins} WHERE ${where}`).bind(...binds).first<{total:number}>(),changes(db,from,to),
 ]);
 const complete=sample.filter((s):s is Sample&{seconds:number}=>s.seconds!==null),daily:Record<string,{day:string;ready:number;failed:number;total:number;median:number|null;p95:number|null;measured:number}>={};
 for(let time=Date.parse(from);time<=Date.parse(to);time+=86400_000){const d=new Date(time).toISOString().slice(0,10);const items=sample.filter(s=>s.at.slice(0,10)===d);daily[d]={day:d,ready:items.filter(s=>s.status==='ready').length,failed:items.filter(s=>s.status==='failed').length,total:items.length,...percentiles(items.flatMap(s=>s.seconds===null?[]:[s.seconds]))};}
 // Resource queues can overlap. Sum of waits is a workload metric, never subtracted from wall-clock generation time.
 return {at,from,to,total:total?.total??0,truncated:(total?.total??0)>sample.length,stats:percentiles(complete.map(s=>s.seconds)),wait:percentiles(complete.flatMap(s=>s.waitSeconds===null?[]:[s.waitSeconds])),daily:Object.values(daily),changes:markers};
}
async function changes(db:D1Database,from:string,to:string){
 return rows<{id:string;at:string;kind:string;title:string;body:string;actor:string|null}>(db,`SELECT * FROM (
 SELECT o.id,o.created_at AS at,o.kind,o.target AS title,o.body,u.name AS actor FROM admin_operation_entries o LEFT JOIN auth_user u ON u.id=o.actor_id WHERE o.kind='change'
 UNION ALL SELECT id,created_at,'configuration',action||' · '||target_id,reason,NULL FROM admin_audit
 UNION ALL SELECT id,created_at,'configuration','Capacité de génération',settings_json,NULL FROM generation_queue_setting_events
 UNION ALL SELECT id,created_at,'configuration','Avatars IA',settings_json,NULL FROM avatar_setting_events
 UNION ALL SELECT id,created_at,'configuration','Fonctionnalités',features_json,NULL FROM site_feature_events
 ) WHERE substr(at,1,10) BETWEEN ? AND ? ORDER BY at DESC,id DESC LIMIT 100`,[from,to]);
}
async function incidents(db:D1Database,scope:ReturnType<typeof filter>,now:number):Promise<Incident[]>{
 const {where,binds}=scope;
 // One occurrence per video/code/stage; a failed preparation is visible even when the final video succeeded.
 const sql=`WITH raw AS (
 SELECT j.id AS jobId,j.error_code AS code,j.stage AS stage,j.updated_at AS at,${owner} AS agencyId,a.name AS agency ${joins} WHERE ${where} AND j.status='failed'
 UNION ALL SELECT j.id,p.error_code,p.step,p.updated_at,${owner},a.name ${joins} JOIN generation_preparation_steps p ON p.job_id=j.id WHERE ${where} AND p.error_code IS NOT NULL
 UNION ALL SELECT j.id,p.error_code,'animations',p.updated_at,${owner},a.name ${joins} JOIN photo_animations p ON p.job_id=j.id WHERE ${where} AND p.error_code IS NOT NULL
 ), failures AS (SELECT jobId,code,stage,max(at) AS at,agencyId,agency FROM raw GROUP BY jobId,code,stage)`;
 const groups=await rows<Omit<Incident,'key'|'review'|'jobs'|'reopened'>>(db,sql+` SELECT code,stage,count(*) AS count,count(DISTINCT agencyId) AS agencies,min(at) AS firstAt,max(at) AS lastAt,sum(at>=?) AS recent,sum(at<? AND at>=?) AS previous FROM failures GROUP BY code,stage ORDER BY count DESC,lastAt DESC LIMIT 50`,[...binds,...binds,...binds,new Date(now-7*86400_000).toISOString(),new Date(now-7*86400_000).toISOString(),new Date(now-14*86400_000).toISOString()]);
 const latest=await rows<Entry>(db,entrySelect+" WHERE o.kind='incident' AND o.id=(SELECT i.id FROM admin_operation_entries i WHERE i.kind='incident' AND i.target=o.target ORDER BY i.sequence DESC LIMIT 1)");
 const failures=await rows<{code:string;stage:string;id:string;at:string;agency:string|null;reports:number}>(db,sql+` SELECT code,stage,jobId AS id,at,agency,(SELECT count(*) FROM generation_reports r WHERE r.job_id=failures.jobId) AS reports FROM failures ORDER BY at DESC LIMIT 500`,[...binds,...binds,...binds]);
 return groups.map(g=>{const key=g.stage+':'+g.code,review=latest.find(r=>r.target===key)??null,reopened=review?.state==='resolved'&&g.lastAt>review.at;return {...g,key,reopened,review:reopened&&review?{...review,state:'open'}:review,jobs:failures.filter(r=>r.stage===g.stage&&r.code===g.code).slice(0,20)};});
}
async function retention(db:D1Database,from:string,to:string,now:number){
 const cohort=`WITH successful AS (SELECT coalesce(g.owner_agency_id,g.agency_id) AS agencyId,e.created_at AS at FROM generation_runs g JOIN jobs j ON j.id=g.job_id AND j.status='ready' JOIN generation_events e ON e.job_id=j.id AND e.event='ready' JOIN agencies a ON a.id=coalesce(g.owner_agency_id,g.agency_id) JOIN auth_user u ON u.id=a.owner_user_id WHERE e.created_at<=? AND julianday(e.created_at)>=julianday(j.created_at)), ranked AS (SELECT agencyId,at,row_number() OVER(PARTITION BY agencyId ORDER BY at) AS n FROM successful), firsts AS (SELECT agencyId,min(at) AS firstAt,max(CASE WHEN n=2 THEN at END) AS secondAt FROM ranked GROUP BY agencyId)`;
 const summary=await db.prepare(cohort+` SELECT count(*) AS activated,sum(secondAt IS NOT NULL) AS secondVideo,sum(firstAt<=?) AS eligible7,sum(firstAt<=? AND secondAt<=strftime('%Y-%m-%dT%H:%M:%fZ',firstAt,'+7 days')) AS returned7,sum(firstAt<=?) AS eligible30,sum(firstAt<=? AND secondAt<=strftime('%Y-%m-%dT%H:%M:%fZ',firstAt,'+30 days')) AS returned30 FROM firsts WHERE substr(firstAt,1,10) BETWEEN ? AND ?`).bind(new Date(now).toISOString(),...[7,7,30,30].map(d=>new Date(now-d*86400_000).toISOString()),from,to).first<{activated:number;secondVideo:number;eligible7:number;returned7:number;eligible30:number;returned30:number}>();
 const activity=await rows<{id:string;agency:string;videos:number;activeDays:number;weeks:number;lastAt:string}>(db,`SELECT a.id,a.name AS agency,count(*) AS videos,count(DISTINCT substr(e.created_at,1,10)) AS activeDays,count(DISTINCT strftime('%Y-%W',e.created_at)) AS weeks,max(e.created_at) AS lastAt FROM generation_runs g JOIN jobs j ON j.id=g.job_id AND j.status='ready' JOIN generation_events e ON e.job_id=j.id AND e.event='ready' JOIN agencies a ON a.id=coalesce(g.owner_agency_id,g.agency_id) JOIN auth_user u ON u.id=a.owner_user_id WHERE substr(e.created_at,1,10) BETWEEN ? AND ? AND e.created_at<=? GROUP BY a.id ORDER BY weeks DESC,videos DESC,a.id LIMIT 100`,[from,to,new Date(now).toISOString()]);
 return {summary,activity};
}
async function providerActivity(db:D1Database,from:string,to:string){
 return rows<{provider:string;calls:number;failed:number;pending:number;lastAt:string|null}>(db,`SELECT provider,count(*) AS calls,sum(state IN ('failed','uncertain')) AS failed,sum(state IN ('pending','working','submitting','submitted','reserved')) AS pending,max(at) AS lastAt FROM (
 SELECT provider,state,created_at AS at FROM narration_calls WHERE provider_mode='real'
 UNION ALL SELECT 'runway',state,created_at FROM photo_animations WHERE mode='real'
 UNION ALL SELECT 'heygen',state,created_at FROM avatar_tasks WHERE mode='real'
 ) WHERE substr(at,1,10) BETWEEN ? AND ? GROUP BY provider`,[from,to]);
}
export async function operationWrite(db:D1Database,actor:string,input:z.infer<typeof OperationAction>,now=Date.now()){
 const id=crypto.randomUUID(),at=new Date(now).toISOString();
 if(input.action==='note'&&!await db.prepare('SELECT 1 FROM agencies WHERE id=?').bind(input.id).first())throw new RequestFailure('NOT_FOUND');
 const target=input.action==='note'?input.id:input.action==='incident'?input.target:input.title;
 const latest=input.action==='incident'?input.expected:null;
 const result=await db.prepare(`INSERT INTO admin_operation_entries(id,actor_id,kind,target,body,state,created_at) SELECT ?,?,?,?,?,?,? WHERE ?!='incident' OR (SELECT id FROM admin_operation_entries WHERE kind='incident' AND target=? ORDER BY sequence DESC LIMIT 1) IS ? RETURNING id`)
  .bind(id,actor,input.action,target,input.body,input.action==='incident'?input.state:null,at,input.action,target,latest).first();
 if(!result)throw new RequestFailure('CONFLICT');return {id};
}
export function adminOperationsRequest(request:Request,env:AuthEnvironment&{SUPER_ADMIN_EMAIL?:string}){return respond(async()=>{
 const actor=await requireStaff(request,env),superAdmin=isSuperAdmin(env,actor);
 if(request.method==='GET'){const parsed=OperationsQuery.safeParse(Object.fromEntries(new URL(request.url).searchParams));if(!parsed.success)throw new RequestFailure('VALIDATION_ERROR');if(!superAdmin&&parsed.data.section!=='notes')throw new RequestFailure('FORBIDDEN');return Response.json(await operationsRead(env.DB,parsed.data));}
 if(request.method!=='POST')throw new RequestFailure('FORBIDDEN');assertSameOrigin(request,env);
 const parsed=OperationAction.safeParse(await boundedJson(request,8192));if(!parsed.success)throw new RequestFailure('VALIDATION_ERROR');
 if(!superAdmin&&parsed.data.action!=='note')throw new RequestFailure('FORBIDDEN');
 try{return Response.json(await operationWrite(env.DB,actor.id,parsed.data));}catch(e){if(String(e).includes('ADMIN_OPERATIONS_RATE_LIMIT'))throw new RequestFailure('RATE_LIMITED');throw e;}
});}
export type OperationsData=Awaited<ReturnType<typeof operationsRead>>;
