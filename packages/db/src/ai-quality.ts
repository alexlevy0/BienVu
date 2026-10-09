import {AiQualitySettings,DEFAULT_AI_QUALITY_SETTINGS,AI_QUALITY_VERSION,QualityVerdict,qualityCoverage,type QualityCheck,type AiQualityRun} from '@bienvu/contracts';
import type {Database} from './index';

export async function aiRows<T>(db:Database,sql:string,columns:string[],values:(string|number|null)[]=[]):Promise<T[]>{
  // Both SQL and projected columns are application constants, never user SQL.
  const row=await db.prepare(`SELECT json_group_array(json_object(${columns.map(c=>`'${c}',${c}`).join(',')})) AS data FROM (${sql})`).bind(...values).first<{data:string}>();
  return JSON.parse(row?.data??'[]') as T[];
}
export async function aiQualitySettings(db:Database){
  const row=await db.prepare('SELECT settings_json AS settings,revision,activated_at AS activatedAt FROM ai_quality_settings WHERE id=1').first<{settings:string;revision:number;activatedAt:string}>();
  return {settings:row?AiQualitySettings.parse(JSON.parse(row.settings)):DEFAULT_AI_QUALITY_SETTINGS,revision:row?.revision??0,activatedAt:row?.activatedAt??new Date().toISOString()};
}
export async function updateAiQualitySettings(db:Database,actor:string,settings:AiQualitySettings,revision:number){
  const parsed=AiQualitySettings.parse(settings),at=new Date().toISOString();
  const updated=await db.prepare('UPDATE ai_quality_settings SET settings_json=?,revision=revision+1,updated_by=?,updated_at=? WHERE id=1 AND revision=? RETURNING id').bind(JSON.stringify(parsed),actor,at,revision).first();
  if(!updated)throw Error('AI_QUALITY_CONFLICT');
  await aiQualityAudit(db,actor,'settings',null,parsed);return aiQualitySettings(db);
}
export async function aiQualityAudit(db:Database,actor:string,action:string,target:string|null,payload:unknown){
  await db.prepare('INSERT INTO ai_quality_audit VALUES(?,?,?,?,?,?)').bind(crypto.randomUUID(),actor,action,target,JSON.stringify(payload),new Date().toISOString()).run();
}
export async function enqueueAiEvent(db:Database,key:string,event:string,traceId:string,properties:Record<string,unknown>,at=new Date().toISOString()){
  if(!['$ai_generation','$ai_span','$ai_trace','$ai_metric','$ai_feedback','ai_quality_check','ai_quality_run','ai_quality_review','ai_stage_completed','ai_publication_completed','ai_import_completed'].includes(event))throw Error('AI_EVENT_INVALID');
  const payload=JSON.stringify(properties);if(new TextEncoder().encode(payload).length>120000)throw Error('AI_EVENT_TOO_LARGE');
  await db.prepare(`INSERT INTO ai_telemetry_outbox(id,event_key,trace_id,event,payload_json,event_at,next_at,created_at) VALUES(?,?,?,?,?,?,?,?) ON CONFLICT(event_key) DO NOTHING`)
    .bind(crypto.randomUUID(),key,traceId,event,payload,at,new Date().toISOString(),new Date().toISOString()).run();
}
export type TelemetryEnvelope={id:string;event:string;traceId:string;payload:string;eventAt:string;attempts:number};
export async function claimAiEvent(db:Database,now=Date.now()):Promise<(TelemetryEnvelope&{lease:string})|null>{
  const at=new Date(now).toISOString(),lease=crypto.randomUUID();
  const row=await db.prepare(`UPDATE ai_telemetry_outbox SET state='sending',lease_id=?,lease_until=?,attempts=attempts+1
    WHERE id=(SELECT id FROM ai_telemetry_outbox WHERE (state='pending' AND next_at<=? OR state='sending' AND lease_until<=?) ORDER BY next_at,id LIMIT 1)
    RETURNING id,event,trace_id AS traceId,payload_json AS payload,event_at AS eventAt,attempts`)
    .bind(lease,new Date(now+30000).toISOString(),at,at).first<TelemetryEnvelope>();
  return row?{...row,lease}:null;
}
export async function finishAiEvent(db:Database,row:TelemetryEnvelope&{lease:string},ok:boolean,code:string|null,now=Date.now()){
  await db.prepare(`UPDATE ai_telemetry_outbox SET state=?,sent_at=?,error_code=?,next_at=?,lease_id=NULL,lease_until=NULL WHERE id=? AND lease_id=? AND state='sending'`)
    .bind(ok?'sent':row.attempts>=12?'dead':'pending',ok?new Date(now).toISOString():null,code,new Date(now+Math.min(6*3600000,30000*2**Math.min(10,row.attempts))).toISOString(),row.id,row.lease).run();
}
export type StoredQualityPayload={title:string;facts:Record<string,unknown>;sourceText:string;finalNarration:string;spokenText:string[];checks:QualityCheck[];
  model:string|null;promptVersion:string|null;voice:string|null;durationSeconds:number|null;voiceEnabled:boolean;animations:number;animationsReused:number;mapEnabled:boolean;
  costs:{estimatedUsd:number|null;actualUsd:number|null;unknownProviders:string[];reusedSavingUsd:number};timing:{totalMs:number;renderMs:number|null;voiceMs:number;scriptMs:number};
  version:string;automatic:boolean;historical:boolean;mediaAvailable:boolean;[key:string]:unknown};
export async function insertAiQualityRun(db:Database,input:{id:string;jobId:string;agencyId:string;attempt:number;traceId:string;payload:StoredQualityPayload;checks:QualityCheck[];audience:string;sourceHost:string|null;status:string;reviewSampled:boolean;createdAt:string;completedAt:string}){
  const checks=qualityCoverage(input.checks);
  return db.prepare(`INSERT INTO ai_quality_runs(id,job_id,agency_id,attempt,trace_id,payload_json,checks_json,flagged,audience,source_host,job_status,review_sampled,created_at,completed_at,updated_at)
    VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(job_id,attempt) DO NOTHING RETURNING id`)
    .bind(input.id,input.jobId,input.agencyId,input.attempt,input.traceId,JSON.stringify(input.payload),JSON.stringify(input.checks),checks.failed>0?1:0,input.audience,input.sourceHost,input.status,input.reviewSampled?1:0,input.createdAt,input.completedAt,new Date().toISOString()).first<{id:string}>();
}
export type QualityRow={id:string;jobId:string;agencyId:string;attempt:number;traceId:string;payload:string;checks:string;flagged:number;audience:string;sourceHost:string|null;status:string;reviewSampled:number;review:AiQualityRun['review'];reviewNote:string|null;createdAt:string;completedAt:string};
const columns=['id','jobId','agencyId','attempt','traceId','payload','checks','flagged','audience','sourceHost','status','reviewSampled','review','reviewNote','createdAt','completedAt'];
const select=`SELECT id,job_id AS jobId,agency_id AS agencyId,attempt,trace_id AS traceId,payload_json AS payload,checks_json AS checks,flagged,audience,source_host AS sourceHost,job_status AS status,review_sampled AS reviewSampled,review,review_note AS reviewNote,created_at AS createdAt,completed_at AS completedAt FROM ai_quality_runs`;
export async function qualityRun(db:Database,id:string){return db.prepare(select+' WHERE id=?').bind(id).first<QualityRow>();}
export async function listQualityRuns(db:Database,filter:{days?:number;audience?:string;flagged?:boolean;source?:string;cursor?:string}={}){
  const cutoff=new Date(Date.now()-(filter.days??30)*86400000).toISOString();
  return aiRows<QualityRow>(db,select+` WHERE completed_at>=? AND (?='' OR audience=?) AND (?=0 OR (flagged=1 OR review_sampled=1) AND review IS NULL)
    AND (?='' OR coalesce(source_host,'manual')=?) AND (?='' OR completed_at<? OR completed_at=? AND id<?) ORDER BY completed_at DESC,id DESC LIMIT 51`,columns,
    [cutoff,filter.audience??'',filter.audience??'',filter.flagged?1:0,filter.source??'',filter.source??'',filter.cursor??'',filter.cursor?.split('|')[0]??'',filter.cursor?.split('|')[0]??'',filter.cursor?.split('|')[1]??'']);
}
export function qualityRunView(row:QualityRow):AiQualityRun {
  const p=JSON.parse(row.payload) as StoredQualityPayload;
  return {id:row.id,jobId:row.jobId,agencyId:row.agencyId,attempt:row.attempt,traceId:row.traceId,title:p.title,createdAt:row.createdAt,completedAt:row.completedAt,status:row.status,
    audience:row.audience,sourceHost:row.sourceHost,durationSeconds:p.durationSeconds,voice:p.voice,model:p.model,promptVersion:p.promptVersion,checks:JSON.parse(row.checks),reviewSampled:Boolean(row.reviewSampled),review:row.review,flagged:row.flagged===1,costEstimatedUsd:p.costs.estimatedUsd,costActualUsd:p.costs.actualUsd};
}
export async function reviewQualityRun(db:Database,id:string,actor:string,verdict:AiQualityRun['review'],note:string){
  QualityVerdict.parse(verdict);if(note.length>1500)throw Error('AI_QUALITY_INVALID');
  const at=new Date().toISOString(),updated=await db.prepare('UPDATE ai_quality_runs SET review=?,review_note=?,review_by=?,review_at=?,updated_at=? WHERE id=? RETURNING id')
    .bind(verdict,note,actor,at,at,id).first();if(!updated)throw Error('AI_QUALITY_NOT_FOUND');
  await aiQualityAudit(db,actor,'review',id,{verdict,note});return qualityRun(db,id);
}
export async function addQualityDatasetCase(db:Database,id:string,actor:string,label:string){
  const run=await qualityRun(db,id);if(!run||!run.review)throw Error('AI_QUALITY_REVIEW_REQUIRED');
  const p=JSON.parse(run.payload) as StoredQualityPayload;
  // Frozen data + a reviewed expectation; subsequent edits cannot rewrite a reference case.
  await db.prepare(`INSERT INTO ai_quality_dataset VALUES(?,?,?,?,?,?,?,?) ON CONFLICT(run_id) DO NOTHING`)
    .bind(crypto.randomUUID(),id,label.slice(0,200)||p.title,AI_QUALITY_VERSION,JSON.stringify({facts:p.facts,sourceText:p.sourceText,finalNarration:p.finalNarration}),JSON.stringify({verdict:run.review,note:run.reviewNote,checks:JSON.parse(run.checks)}),actor,new Date().toISOString()).run();
  await aiQualityAudit(db,actor,'dataset',id,{label});
}
export async function rememberAiContext(db:Database,operationId:string,request:Request){
  if(request.headers.get('X-Analytics-Consent')!=='2')return;
  const session=request.headers.get('X-PostHog-Session-ID'),distinct=request.headers.get('X-PostHog-Distinct-ID');
  if(!session||!distinct||!/^[a-zA-Z0-9_-]{16,128}$/.test(session)||!/^[a-zA-Z0-9_-]{1,128}$/.test(distinct))return;
  await db.prepare('INSERT INTO ai_quality_contexts VALUES(?,?,?,2,?) ON CONFLICT(operation_id) DO NOTHING').bind(operationId,session,distinct,new Date().toISOString()).run();
}
export async function qualityLedgerCost(db:Database,jobId:string){
  return (await qualityLedgerCosts(db,[jobId]))[jobId]??{reconciledEur:null,actualEur:null,missing:[]};
}
export async function qualityLedgerCosts(db:Database,jobIds:string[]){
  if(!jobIds.length)return {};
  const ids=jobIds.slice(0,50);
  const rows=await aiRows<{jobId:string;amount:number;missing:string|null;entries:number}>(db,
    `SELECT f.job_id AS jobId,f.cost_micros AS amount,f.missing_providers AS missing,
      (SELECT count(*) FROM finance_supplier_costs WHERE job_id=f.job_id) AS entries FROM finance_video_summary f WHERE f.job_id IN (${ids.map(()=>'?').join(',')})`,
    ['jobId','amount','missing','entries'],ids);
  return Object.fromEntries(rows.map(row=>[row.jobId,{reconciledEur:row.entries>0?row.amount/1e6:null,actualEur:row.entries>0&&!row.missing?row.amount/1e6:null,missing:row.missing?.split(',')??[]}])) as Record<string,{reconciledEur:number|null;actualEur:number|null;missing:string[]}>;
}
export async function purgeAiQuality(db:Database,now=Date.now()){
  const {settings}=await aiQualitySettings(db),cutoff=new Date(now-settings.retentionDays*86400000).toISOString();
  await db.prepare("DELETE FROM ai_telemetry_outbox WHERE created_at<? AND state IN('sent','dead')").bind(cutoff).run();
  await db.prepare('DELETE FROM ai_quality_contexts WHERE created_at<?').bind(cutoff).run();
  await db.prepare('DELETE FROM ai_quality_runs WHERE completed_at<?').bind(cutoff).run();
}
