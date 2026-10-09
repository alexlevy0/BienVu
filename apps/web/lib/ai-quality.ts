import {AI_QUALITY_VERSION,AiQualitySettings,QualityVerdict,EntityId,qualityCoverage,type QualityCheck,type QualityFacts} from '@bienvu/contracts';
import {aiRows,aiQualitySettings,updateAiQualitySettings,qualityRun,listQualityRuns,qualityRunView,qualityLedgerCost,qualityLedgerCosts,reviewQualityRun,addQualityDatasetCase,enqueueAiEvent,type StoredQualityPayload,type QualityRow,type Database} from '@bienvu/db';
import {collectAiQuality,collectAiPublications,flushAiEvents,redactAiPayload} from '@bienvu/observability';
import type {AuthEnvironment} from './auth';
import {requireAdmin} from './admin-access';
import {respond,RequestFailure,assertSameOrigin,boundedJson} from './http';

type QualityEnv=AuthEnvironment&{SUPER_ADMIN_EMAIL?:string;POSTHOG_ENABLED?:string;POSTHOG_PROJECT_TOKEN?:string;POSTHOG_HOST?:string};
export async function runAiQualityBatch(env:QualityEnv){
  try{const {settings}=await aiQualitySettings(env.DB);if(!settings.enabled)return;
    await collectAiQuality(env.DB);await collectAiPublications(env.DB);await collectAiImports(env.DB);await flushAiEvents(env);
  }catch{console.warn(JSON.stringify({event:'ai_quality_batch_deferred'}));}
}
export async function collectAiImports(db:Database){
  const rows=await aiRows<{id:string;agencyId:string;sourceKind:string;status:string;error:string|null;createdAt:string;result:string|null}>(db,
    `SELECT id,agency_id AS agencyId,source_kind AS sourceKind,status,error_code AS error,created_at AS createdAt,result_json AS result FROM listing_imports i
     WHERE status IN('ready','failed') AND created_at>=? AND NOT EXISTS(SELECT 1 FROM ai_telemetry_outbox WHERE event_key='import:'||i.id) ORDER BY created_at DESC LIMIT 10`,
    ['id','agencyId','sourceKind','status','error','createdAt','result'],[new Date(Date.now()-30*86400000).toISOString()]);
  for(const r of rows){const data=r.result?JSON.parse(r.result):null;await enqueueAiEvent(db,'import:'+r.id,'ai_import_completed','bv-import-'+r.id,{distinct_id:'bv-agency-'+r.agencyId,bv_app:'bienvu',bv_listing_id:r.id,bv_stage:'import',bv_source:data?.sourceHost??r.sourceKind,bv_status:r.status,bv_error:r.error,bv_photo_count:data?.photos?.length??0,bv_adapter_version:data?.adapterVersion??null},r.createdAt);}
}
export async function qualitySummary(db:Database,days:number,audience:string,source:string){
  const cutoff=new Date(Date.now()-days*86400000).toISOString(),values=[cutoff,audience,audience,source,source];
  const scope="FROM ai_quality_runs WHERE completed_at>=? AND (?='' OR audience=?) AND (?='' OR coalesce(source_host,'manual')=?)";
  const counts=await db.prepare(`SELECT count(*) AS total,sum(job_status='ready') AS ready,sum(job_status='failed') AS failed,sum((flagged=1 OR review_sampled=1) AND review IS NULL) AS awaitingReview,
    sum(review_sampled=1) AS sampled,sum(review='accepted') AS accepted,
    sum(review='problem') AS problems,sum(review='false_positive') AS falsePositives,sum(review='intentional') AS intentional ${scope}`).bind(...values).first();
  const checks=await aiRows<{key:string;label:string;pass:number;fail:number;na:number;error:number}>(db,`SELECT json_extract(c.value,'$.key') AS key,json_extract(c.value,'$.label') AS label,
    sum(json_extract(c.value,'$.status')='pass') AS pass,sum(json_extract(c.value,'$.status')='fail') AS fail,sum(json_extract(c.value,'$.status')='na') AS na,
    sum(json_extract(c.value,'$.status')='error') AS error FROM (${scope.replace('FROM','SELECT checks_json FROM')}) q,json_each(q.checks_json) c GROUP BY key`,['key','label','pass','fail','na','error'],values);
  const outbox=await db.prepare("SELECT sum(state IN('pending','sending')) AS pending,sum(state='sent') AS sent,sum(state='dead') AS dead FROM ai_telemetry_outbox").first();
  const sources=await aiRows<{source:string;n:number}>(db,"SELECT coalesce(source_host,'manual') AS source,count(*) AS n FROM ai_quality_runs GROUP BY source ORDER BY n DESC LIMIT 100",['source','n']);
  return {counts,checks,outbox,sources,dataset:await db.prepare('SELECT count(*) AS count FROM ai_quality_dataset').first()};
}
export async function adminAiQualityRequest(request:Request,env:QualityEnv){
  return respond(async()=>{
    const actor=await requireAdmin(request,env),url=new URL(request.url),id=url.searchParams.get('id');
    const headers={'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'};
    if(request.method==='GET'){
      if(url.searchParams.get('export')==='dataset'){
        const data=await aiRows(env.DB,'SELECT id,label,version,payload_json AS payload,expected_json AS expected,created_at AS createdAt FROM ai_quality_dataset ORDER BY created_at',['id','label','version','payload','expected','createdAt']);
        return Response.json({version:AI_QUALITY_VERSION,cases:data},{headers:{...headers,'Content-Disposition':'attachment; filename="bienvu-quality-dataset.json"'}});
      }
      if(id){if(!EntityId.safeParse(id).success)throw new RequestFailure('NOT_FOUND');const row=await qualityRun(env.DB,id);if(!row)throw new RequestFailure('NOT_FOUND');
        return Response.json({run:qualityRunView(row),payload:JSON.parse(row.payload),ledger:await qualityLedgerCost(env.DB,row.jobId),reviewNote:row.reviewNote,traceUrl:qualityTraceUrl(row.traceId)},{headers});}
      const days=Number(url.searchParams.get('days')??30),audience=url.searchParams.get('audience')??'',source=url.searchParams.get('source')??'',cursor=url.searchParams.get('cursor')??'';
      if(![7,30,90].includes(days)||!['','account','anonymous','internal'].includes(audience)||source.length>253||cursor.length>128)throw new RequestFailure('VALIDATION_ERROR');
      const rows=await listQualityRuns(env.DB,{days,audience,source,flagged:url.searchParams.get('flagged')==='1',cursor});
      const page=rows.slice(0,50),ledger=await qualityLedgerCosts(env.DB,page.map(row=>row.jobId));
      const views=page.map(row=>({...qualityRunView(row),costReconciledEur:ledger[row.jobId]?.reconciledEur??null,costActualEur:ledger[row.jobId]?.actualEur??null}));
      return Response.json({...await aiQualitySettings(env.DB),...await qualitySummary(env.DB,days,audience,source),runs:views,nextCursor:rows.length>50?rows[49].completedAt+'|'+rows[49].id:null,
        dashboardUrl:AI_QUALITY_DASHBOARD_URL},{headers});
    }
    assertSameOrigin(request,env);
    if(request.method==='PATCH'){
      const input=await boundedJson(request,2000) as {settings:unknown;revision:unknown};if(!input||typeof input!=='object')throw new RequestFailure('VALIDATION_ERROR');
      const settings=AiQualitySettings.safeParse(input.settings);
      if(!settings.success||!Number.isSafeInteger(input.revision))throw new RequestFailure('VALIDATION_ERROR');
      try{return Response.json(await updateAiQualitySettings(env.DB,actor.id,settings.data,input.revision as number),{headers});}
      catch(error){if(String(error).includes('CONFLICT'))throw new RequestFailure('CONFLICT');throw error;}
    }
    if(request.method!=='POST')throw new RequestFailure('NOT_FOUND');
    const body=await boundedJson(request,3000) as {action:string;id?:string;verdict?:unknown;note?:unknown;label?:unknown};if(!body||typeof body!=='object')throw new RequestFailure('VALIDATION_ERROR');
    if(body.action==='retry_telemetry'){await env.DB.prepare("UPDATE ai_telemetry_outbox SET state='pending',attempts=0,next_at=?,error_code=NULL WHERE state='dead'").bind(new Date().toISOString()).run();await flushAiEvents(env);return Response.json({ok:true},{headers});}
    if(body.action==='scan'){await collectAiQuality(env.DB,20);await collectAiImports(env.DB);await flushAiEvents(env);return Response.json({ok:true},{headers});}
    if(!EntityId.safeParse(body.id).success)throw new RequestFailure('VALIDATION_ERROR');const row=await qualityRun(env.DB,body.id!);if(!row)throw new RequestFailure('NOT_FOUND');
    if(body.action==='review'){
      const verdict=QualityVerdict.safeParse(body.verdict);if(!verdict.success||typeof body.note!=='string'||body.note.length>1500)throw new RequestFailure('VALIDATION_ERROR');
      await reviewQualityRun(env.DB,row.id,actor.id,verdict.data,body.note);
      await enqueueAiEvent(env.DB,'review:'+crypto.randomUUID(),'ai_quality_review',row.traceId,{distinct_id:'bv-reviewer-'+actor.id,bv_app:'bienvu',bv_job_id:row.jobId,bv_run_id:row.id,bv_audience:row.audience,bv_verdict:verdict.data,bv_source:row.sourceHost??'manual',bv_scorer_version:AI_QUALITY_VERSION});
    }else if(body.action==='dataset'){
      if(typeof body.label!=='string'||body.label.length>200)throw new RequestFailure('VALIDATION_ERROR');if(!row.review)throw new RequestFailure('CONFLICT');await addQualityDatasetCase(env.DB,row.id,actor.id,body.label);
    }else throw new RequestFailure('VALIDATION_ERROR');
    return Response.json({ok:true},{headers});
  });
}
export const AI_QUALITY_DASHBOARD_URL='https://eu.posthog.com/project/299212/dashboard/1010344';
export function qualityTraceUrl(id:string){return 'https://eu.posthog.com/project/299212/ai-observability/traces/'+encodeURIComponent(id);}
