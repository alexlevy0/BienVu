import {AI_QUALITY_VERSION,NormalizedListing,PreparedNarration,VideoManifest,VideoReport,narrationQualityChecks,qualityFacts,qualityCoverage,qualitySample,type QualityCheck} from '@bienvu/contracts';
import {aiRows,aiQualitySettings,enqueueAiEvent,claimAiEvent,finishAiEvent,insertAiQualityRun,type Database,type StoredQualityPayload} from '@bienvu/db';

// Text context is useful to evaluators, credentials and private storage references are not.
export function redactAiText(text:string):string {
  return text.replace(/https?:\/\/[^\s<>"']+/gi,'[lien]').replace(/(?:sk-|phx_|phc_)[A-Za-z0-9_-]{12,}/g,'[clé masquée]')
    .replace(/Bearer\s+[^\s"']+/gi,'[autorisation masquée]').replace(/agencies\/[A-Za-z0-9_./-]+/g,'[fichier privé]')
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi,'[e-mail]')
    .replace(/(?<!\d)(?:\+33\s?|0)[1-9](?:[ .-]?\d{2}){4}(?!\d)/g,'[téléphone]');
}
export function redactAiPayload(value:unknown,depth=0):unknown {
  if(depth>12)return '[profondeur limitée]';
  if(typeof value==='string')return redactAiText(value.slice(0,24000));
  if(Array.isArray(value))return value.slice(0,100).map(v=>redactAiPayload(v,depth+1));
  if(value&&typeof value==='object')return Object.fromEntries(Object.entries(value).filter(([k])=>
    !/^(?:authorization|headers|apiKey|api_key|token|secret|password|objectKey|sourceUrl|canonicalUrl|website|email|phone|brand|ip|ipHmac)$/i.test(k)).map(([k,v])=>[k,redactAiPayload(v,depth+1)]));
  return value;
}
export async function safeAiEvent(db:Database,key:string,event:string,trace:string,properties:Record<string,unknown>,at?:string){
  try{await enqueueAiEvent(db,key,event,trace,redactAiPayload(properties) as Record<string,unknown>,at);}
  catch{console.warn(JSON.stringify({event:'ai_telemetry_deferred',stage:'outbox'}));}
}
export type AiCaptureEnv={DB:Database;POSTHOG_ENABLED?:string;POSTHOG_PROJECT_TOKEN?:string;POSTHOG_HOST?:string};
export async function flushAiEvents(env:AiCaptureEnv,fetcher:typeof fetch=fetch,limit=40){
  if(env.POSTHOG_ENABLED!=='true'||!/^phc_[a-zA-Z0-9_-]{20,150}$/.test(env.POSTHOG_PROJECT_TOKEN??'')||env.POSTHOG_HOST!=='https://eu.i.posthog.com')return {sent:0,failed:0};
  let sent=0,failed=0;const started=Date.now();
  for(let i=0;i<Math.min(100,limit)&&Date.now()-started<15000;i++){
    const row=await claimAiEvent(env.DB);if(!row)break;let ok=false,code:string|null=null;
    try{
      const response=await fetcher('https://eu.i.posthog.com/i/v0/e/',{method:'POST',redirect:'manual',signal:AbortSignal.timeout(4000),
        headers:{'Content-Type':'application/json'},body:JSON.stringify({api_key:env.POSTHOG_PROJECT_TOKEN,event:row.event,uuid:row.id,timestamp:row.eventAt,
          properties:{...JSON.parse(row.payload),$insert_id:row.id,$ai_trace_id:row.traceId,$ai_session_id:null,$process_person_profile:false,$ip:null}})});
      ok=response.ok;code=ok?null:'POSTHOG_HTTP_'+response.status;await response.body?.cancel();
    }catch{code='POSTHOG_UNAVAILABLE';}
    await finishAiEvent(env.DB,row,ok,code);if(ok)sent++;else{failed++;break;}
  }
  return {sent,failed};
}
const json=(raw:string|null):any=>{try{return raw?JSON.parse(raw):null;}catch{return null;}};
const elapsed=(start:string,end:string)=>Math.max(0,Date.parse(end)-Date.parse(start))||0;
type JobRecord={id:string;agencyId:string;attempt:number;status:string;errorCode:string|null;createdAt:string;completedAt:string;input:string|null;snapshot:string|null;
  narration:string|null;script:string|null;providerMode:string|null;manifest:string|null;report:string|null;audience:string;animationsReused:number;selectedVoice:string|null};
type CallRecord={id:string;stepKey:string;provider:string;mode:string;state:string;result:string|null;createdAt:string;errorCode:string|null};
const jobFields=['id','agencyId','attempt','status','errorCode','createdAt','completedAt','input','snapshot','narration','script','providerMode','manifest','report','audience','animationsReused','selectedVoice'];
const jobSelect=`SELECT j.id,j.agency_id AS agencyId,j.attempt,j.status,j.error_code AS errorCode,j.created_at AS createdAt,j.updated_at AS completedAt,g.input_json AS input,
  n.snapshot_json AS snapshot,n.result_json AS narration,n.script_json AS script,n.provider_mode AS providerMode,v.manifest_json AS manifest,a.report_json AS report,
  CASE WHEN g.anonymous_session_id IS NOT NULL AND g.owner_agency_id IS NULL THEN 'anonymous' WHEN u.id IS NOT NULL THEN 'account' ELSE 'internal' END AS audience,
  coalesce(g.animations_reused,0) AS animationsReused,g.selected_voice AS selectedVoice
  FROM jobs j JOIN generation_runs g ON g.job_id=j.id LEFT JOIN narration_runs n ON n.job_id=j.id
  LEFT JOIN video_manifests v ON v.job_id=j.id LEFT JOIN generation_artifacts a ON a.job_id=j.id
  LEFT JOIN agencies ag ON ag.id=coalesce(g.owner_agency_id,j.agency_id) LEFT JOIN auth_user u ON u.id=ag.owner_user_id`;
export async function collectAiQuality(db:Database,limit=8){
  const {settings,activatedAt}=await aiQualitySettings(db);if(!settings.enabled)return {collected:0};
  const jobs=await aiRows<JobRecord>(db,jobSelect+` LEFT JOIN ai_quality_runs q ON q.job_id=j.id AND q.attempt=j.attempt
    WHERE j.status IN('ready','failed') AND j.created_at>=? AND (q.id IS NULL OR q.telemetry_complete=0) ORDER BY j.updated_at DESC LIMIT ?`,jobFields,
    [new Date(Date.now()-settings.retentionDays*86400000).toISOString(),Math.min(20,limit)]);
  let collected=0;
  for(const job of jobs){try{await collectJob(db,job,settings,activatedAt);collected++;}catch{console.warn(JSON.stringify({event:'ai_quality_collect_deferred',jobId:job.id}));}}
  return {collected};
}
async function collectJob(db:Database,job:JobRecord,settings:Awaited<ReturnType<typeof aiQualitySettings>>['settings'],activatedAt:string){
  const snapshot=json(job.snapshot),input=json(job.input),n=PreparedNarration.safeParse(json(job.narration)),narration=n.success?n.data:null;
  const l=NormalizedListing.safeParse(snapshot?.listing),listing=l.success?l.data:null;
  const m=VideoManifest.safeParse(json(job.manifest)),manifest=m.success?m.data:null,r=VideoReport.safeParse(json(job.report)),report=r.success?r.data:null;
  const calls=await aiRows<CallRecord>(db,`SELECT id,step_key AS stepKey,provider,provider_mode AS mode,state,result_json AS result,created_at AS createdAt,error_code AS errorCode
    FROM narration_calls WHERE job_id=? ORDER BY created_at,id`,['id','stepKey','provider','mode','state','result','createdAt','errorCode'],[job.id]);
  const clips=await aiRows<{id:string;state:string;model:string;credits:number;durationSeconds:number;mode:string;createdAt:string;updatedAt:string}>(db,
    `SELECT id,state,model,credits,duration_seconds AS durationSeconds,mode,created_at AS createdAt,updated_at AS updatedAt FROM photo_animations WHERE job_id=? ORDER BY slot`,
    ['id','state','model','credits','durationSeconds','mode','createdAt','updatedAt'],[job.id]);
  const trace=`bv-job-${job.id}-a${job.attempt}`,existing=await db.prepare('SELECT id FROM ai_quality_runs WHERE job_id=? AND attempt=?').bind(job.id,job.attempt).first<{id:string}>(),id=existing?.id??crypto.randomUUID();
  const reuse=await db.prepare(`SELECT sum(json_extract(a.asset_json,'$.durationMs')/1000.0*.05) AS amount FROM generation_runs g,json_each(g.animation_reuses_json) x JOIN animation_library a ON a.id=json_extract(x.value,'$.libraryId') AND a.agency_id=g.agency_id WHERE g.job_id=?`).bind(job.id).first<{amount:number|null}>();
  let estimated=0,known=0,scriptMs=0,voiceMs=0;const unknown=new Set<string>(['cloudflare_render','cloudflare_storage']);
  for(const call of calls){const result=json(call.result),metrics=result?.metrics??null,price=metrics?.cost?.estimatedMicrosBeforeCacheDiscount??metrics?.cost?.estimatedMicrosBeforeFreeTier??null;
    if(call.provider==='openai')scriptMs+=metrics?.requestDurationMs??0;else voiceMs+=metrics?.requestDurationMs??0;
    if(call.mode==='real'&&typeof price==='number'&&Number.isFinite(price)&&price>=0&&!(['cartesia','fish'].includes(call.provider)&&price===0)){estimated+=price/1e6;known++;}else if(call.mode==='real')unknown.add(call.provider);
  }
  const avatarCalls=await aiRows<{id:string;moment:string;engine:string;state:string;mode:string;reused:number;reserved:number;createdAt:string;updatedAt:string}>(db,
    `SELECT id,moment,engine,state,mode,reused,reserved_micros AS reserved,created_at AS createdAt,updated_at AS updatedAt FROM avatar_tasks WHERE job_id=?`,
    ['id','moment','engine','state','mode','reused','reserved','createdAt','updatedAt'],[job.id]);
  for(const c of avatarCalls)if(c.mode==='real'&&!c.reused){estimated+=c.reserved/1e6;known++;if(c.state==='uncertain')unknown.add('heygen');}
  for(const c of clips)if(c.mode==='real'){if(c.state==='ready'){estimated+=c.credits*.01;known++;}else unknown.add('runway');}
  const checks:QualityCheck[]=listing?narrationQualityChecks(listing,narration):[{key:'facts',label:'Informations confirmées',status:'na',reason:'Aucun snapshot de narration ; import interrompu ou génération historique.'}];
  checks.push({key:'render',label:'Fichier vidéo vérifié',status:job.status==='failed'?'error':report?'pass':'fail',reason:job.status==='failed'?(job.errorCode??'Génération interrompue.'):report?'Dimensions, durée, codecs et intégrité vérifiés par le moteur de rendu.':'Rapport de rendu absent.'});
  if(narration?.audio.length){const measurements=calls.map(c=>json(c.result)?.measurement).filter(Boolean);
    checks.push({key:'clipping',label:'Saturation audio',status:measurements.length?(measurements.some(m=>typeof m.clippedRatio==='number'&&m.clippedRatio>.001)?'fail':measurements.every(m=>typeof m.clippedRatio==='number')?'pass':'na'):'na',reason:'Mesure PCM disponible pour les nouvelles synthèses ; les anciennes pistes ne sont pas régénérées.'});}
  if(avatarCalls.length)checks.push({key:'avatar',label:'Présentateur synchronisé',status:avatarCalls.every(c=>c.state==='ready')?'pass':'error',reason:avatarCalls.every(c=>c.state==='ready')?'Clips liés au WAV exact et durées vérifiées.':'Un passage n’a pas pu être créé ou nécessite une vérification du fournisseur.'});
  const automatic=Boolean(narration&&!snapshot?.customNarration),historical=job.createdAt<activatedAt;
  const selected=qualitySample(trace,settings.reviewSamplePercent);
  const payload:StoredQualityPayload={title:String(listing?.facts.title.value??manifest?.presentation?.title??'Vidéo '+job.id),facts:listing?qualityFacts(listing):{},
    sourceText:listing?.description?.text??'',finalNarration:narration?.script.scenes.map(s=>s.narrationText).join('\n\n')??'',
    spokenText:calls.filter(c=>c.stepKey.startsWith('voice/')).map(c=>json(c.result)?.spokenText).filter((t):t is string=>typeof t==='string'),checks,
    model:narration?.script.model??null,promptVersion:narration?.script.promptVersion??null,voice:input?.customization?.voice??job.selectedVoice,
    durationSeconds:input?.durationSeconds??report?.durationSeconds??null,voiceEnabled:input?.voiceEnabled!==false,
    animations:clips.length,animationsReused:job.animationsReused,mapEnabled:Boolean(manifest?.map),avatars:avatarCalls.length,avatarsReused:avatarCalls.filter(c=>c.reused).length,
    costs:{estimatedUsd:known?Number(estimated.toFixed(6)):null,actualUsd:null,unknownProviders:[...unknown],reusedSavingUsd:reuse?.amount??0},
    timing:{totalMs:elapsed(job.createdAt,job.completedAt),renderMs:report?Math.round(report.renderAndVerifySeconds*1000):null,voiceMs,scriptMs},
    version:AI_QUALITY_VERSION,automatic,historical,mediaAvailable:Boolean(report),audio:narration?.audio??[],sourceFacts:listing?.facts??{},
    datasetVersion:null,voiceSourceReused:Boolean(input?.customization?.voiceSourceId)};
  await insertAiQualityRun(db,{id,jobId:job.id,agencyId:job.agencyId,attempt:job.attempt,traceId:trace,payload,checks,audience:job.audience,sourceHost:listing?.sourceHost??null,status:job.status,
    reviewSampled:selected,createdAt:job.createdAt,completedAt:job.completedAt});
  const context=await db.prepare('SELECT session_id AS sessionId,distinct_id AS distinctId FROM ai_quality_contexts WHERE operation_id=?').bind(job.id).first<{sessionId:string;distinctId:string}>();
  const common={distinct_id:context?.distinctId??'bv-agency-'+job.agencyId,...(context?{$session_id:context.sessionId}:{}),bv_app:'bienvu',bv_version:AI_QUALITY_VERSION,bv_job_id:job.id,
    bv_listing_id:narration?.script.listingId??input?.listingId??null,bv_run_id:id,bv_audience:job.audience,bv_source:listing?.sourceHost??'manual',bv_status:job.status,
    bv_duration_seconds:payload.durationSeconds,bv_voice:payload.voice,bv_voice_enabled:payload.voiceEnabled,bv_animations:clips.length,bv_animations_reused:job.animationsReused,
    bv_map_enabled:payload.mapEnabled,bv_historical:historical,bv_prompt_version:payload.promptVersion,bv_custom_text:!automatic,bv_test:job.providerMode==='mock'};
  const capture=async(key:string,event:string,props:Record<string,unknown>,at?:string)=>enqueueAiEvent(db,trace+':'+key,event,trace,redactAiPayload({...common,...props}) as Record<string,unknown>,at??job.completedAt);
  await capture('trace','$ai_trace',{$ai_span_id:trace,$ai_span_name:'Création vidéo BienVu',$ai_trace_name:'Création vidéo BienVu',$ai_latency:payload.timing.totalMs/1000,$ai_is_error:job.status==='failed',$ai_error:job.errorCode,$ai_input_state:payload.facts,$ai_output_state:{status:job.status}},job.createdAt);
  for(const call of calls){const result=json(call.result),metrics=result?.metrics;
    // One provider request stays one event even if its result is reused by a job retry.
    const captureCall=async(props:Record<string,unknown>)=>enqueueAiEvent(db,'narration-call:'+call.id,call.provider==='openai'?'$ai_generation':'$ai_span',trace,
      redactAiPayload({...common,...props}) as Record<string,unknown>,call.createdAt);
    await captureCall({$ai_span_id:call.id,$ai_parent_id:trace,$ai_span_name:call.provider==='openai'?'Sélection narration':'Voix off '+call.provider,
      $ai_provider:call.provider,$ai_model:metrics?.model??result?.voice?.model??(call.provider==='openai'?payload.model:null),
      $ai_input:result?.telemetry?.input??(call.provider==='openai'?[{role:'user',content:{facts:payload.facts,description:payload.sourceText,provenance:'snapshot'}}]:{text:result?.spokenText??null,voice:result?.voice??null}),
      $ai_output_choices:call.provider==='openai'?result?.telemetry?.output??[{role:'assistant',content:JSON.stringify(result?.plan??null)}]:undefined,
      $ai_output:call.provider!=='openai'?{durationMs:result?.asset?.durationMs,measurement:result?.measurement}:undefined,
      $ai_input_tokens:metrics?.usage?.inputTokens,$ai_output_tokens:metrics?.usage?.outputTokens,$ai_cache_read_input_tokens:metrics?.usage?.cachedInputTokens,
      $ai_latency:typeof metrics?.requestDurationMs==='number'?metrics.requestDurationMs/1000:undefined,$ai_is_error:call.state!=='done',$ai_error:call.errorCode,
      bv_stage:call.provider==='openai'?'script':'voice',bv_primary_generation:call.stepKey==='script/1',bv_call_id:call.id,bv_checks:checks,bv_final_narration:payload.finalNarration,bv_confirmed_facts:payload.facts,
      bv_input_reconstructed:call.provider==='openai'&&!result?.telemetry,bv_cost_estimated_usd:metrics?.cost?.estimatedMicrosBeforeCacheDiscount!=null?metrics.cost.estimatedMicrosBeforeCacheDiscount/1e6:null,
      bv_cost_actual_usd:null,bv_cost_currency:'USD'});
  }
  await capture('compiled','$ai_span',{$ai_span_id:trace+'-compiled',$ai_parent_id:trace,$ai_span_name:'Narration compilée finale',$ai_input_state:{facts:payload.facts,source:payload.sourceText},$ai_output_state:{narration:payload.finalNarration},bv_stage:'compiled_narration',bv_checks:checks});
  for(const clip of clips)await capture(clip.id,'$ai_span',{$ai_span_id:clip.id,$ai_parent_id:trace,$ai_span_name:'Animation photo IA',$ai_provider:'runway',$ai_model:clip.model,$ai_latency:elapsed(clip.createdAt,clip.updatedAt)/1000,
    $ai_input:{durationSeconds:clip.durationSeconds},$ai_output:{state:clip.state},$ai_is_error:clip.state!=='ready',bv_stage:'animation',bv_api_credits:clip.credits,bv_cost_estimated_usd:clip.mode==='real'&&clip.state==='ready'?clip.credits*.01:null,bv_cost_actual_usd:null},clip.createdAt);
  for(const clip of avatarCalls)await capture('avatar-'+clip.id,'$ai_span',{$ai_span_id:clip.id,$ai_parent_id:trace,$ai_span_name:'Avatar '+clip.moment,
    $ai_provider:'heygen',$ai_model:clip.engine,$ai_latency:elapsed(clip.createdAt,clip.updatedAt)/1000,
    $ai_input:{moment:clip.moment},$ai_output:{state:clip.state,reused:Boolean(clip.reused)},$ai_is_error:clip.state!=='ready',bv_stage:'avatar',
    bv_cost_estimated_usd:clip.reserved/1e6,bv_cost_actual_usd:null});
  if(manifest?.map)await capture('map','$ai_span',{$ai_span_id:trace+'-map',$ai_parent_id:trace,$ai_span_name:'Carte animée',$ai_input:{view:manifest.map.settings.view,zoomStart:manifest.map.settings.zoomStart,zoomEnd:manifest.map.settings.zoomEnd,durationSeconds:manifest.map.settings.durationSeconds},$ai_output:{available:true},bv_stage:'map'});
  if(report)await capture('render','$ai_span',{$ai_span_id:trace+'-render',$ai_parent_id:trace,$ai_span_name:'Rendu et vérification',$ai_latency:report.renderAndVerifySeconds,
    $ai_input:{width:report.width,height:report.height,seconds:report.durationSeconds},$ai_output:{codec:report.codec,fastStart:report.fastStart,meanVolumeDb:report.meanVolumeDb},bv_stage:'render'},report.startedAt);
  await capture('summary','ai_quality_run',{bv_flagged:qualityCoverage(checks).failed>0,bv_review_sampled:selected,bv_checks_passed:qualityCoverage(checks).passed,bv_checks_failed:qualityCoverage(checks).failed,
    bv_checks_na:qualityCoverage(checks).na,bv_checks_errors:qualityCoverage(checks).errors,bv_total_ms:payload.timing.totalMs,bv_script_ms:scriptMs,bv_voice_ms:voiceMs,bv_render_ms:payload.timing.renderMs,
    bv_cost_estimated_usd:payload.costs.estimatedUsd,bv_cost_actual_usd:null,bv_cost_incomplete:true,bv_cost_unknown_providers:payload.costs.unknownProviders,bv_reuse_saving_usd:payload.costs.reusedSavingUsd});
  for(const check of checks)await capture('check-'+check.key,'ai_quality_check',{bv_check:check.key,bv_check_status:check.status,bv_check_value:check.value,bv_reason:check.reason,bv_scorer_version:AI_QUALITY_VERSION,bv_check_type:'deterministic'});
  for(const [stage,value] of Object.entries({total:payload.timing.totalMs,script:scriptMs,voice:voiceMs,render:payload.timing.renderMs}))if(value!==null)await capture('stage-'+stage,'ai_stage_completed',{bv_stage:stage,bv_elapsed_ms:value});
  await db.prepare('UPDATE ai_quality_runs SET telemetry_complete=1 WHERE id=?').bind(id).run();
}
export async function collectAiPublications(db:Database,limit=10){
  const rows=await aiRows<{id:string;postId:string;jobId:string;agencyId:string;platform:string;status:string;error:string|null;createdAt:string;updatedAt:string}>(db,
    `SELECT t.id,t.post_id AS postId,p.job_id AS jobId,p.agency_id AS agencyId,t.platform,t.status,t.error_code AS error,p.created_at AS createdAt,t.updated_at AS updatedAt
      FROM social_targets t JOIN social_posts p ON p.id=t.post_id WHERE t.status IN('published','failed','uncertain','cancelled')
      AND NOT EXISTS(SELECT 1 FROM ai_telemetry_outbox o WHERE o.event_key='social:'||t.id||':'||t.status) ORDER BY t.updated_at DESC LIMIT ?`,
    ['id','postId','jobId','agencyId','platform','status','error','createdAt','updatedAt'],[limit]);
  for(const r of rows){const trace='bv-social-'+r.id;
    await enqueueAiEvent(db,`social:${r.id}:${r.status}`,'ai_publication_completed',trace,{distinct_id:'bv-agency-'+r.agencyId,bv_app:'bienvu',bv_job_id:r.jobId,bv_post_id:r.postId,bv_platform:r.platform,bv_status:r.status,bv_error:r.error,bv_elapsed_ms:elapsed(r.createdAt,r.updatedAt)},r.updatedAt);
  }
}
