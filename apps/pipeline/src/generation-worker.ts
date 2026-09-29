import {WorkflowEntrypoint,type WorkflowEvent,type WorkflowStep} from 'cloudflare:workers';
import {EntityId,GenerationRequest,VideoReport,publicErrors,videoObjectKey,videoPreviewKey} from '@bienvu/contracts';
import {admitGeneration,findGeneration,generationView,GenerationFailure,failGeneration,setGenerationStage,setGenerationProgress,type GenerationRow} from '@bienvu/db';
import {authorized,json} from './auth';
import {VideoRenderer} from './video-worker';
import {getJobVideo,prepareJobVideo} from './video-manifest';
import {prepareJobNarration} from './narration';
import {realProviders} from './narration-worker';
import {cleanupAnonymousTrials} from './trial-cleanup';
import {extractDescription,EXTRACTION_TEXT_MAX} from '@bienvu/narration';
import {loadGenerationListing} from './generation-import';
export {VideoRenderer};
export type GenerationEnv=VideoEnv&Pick<NarrationEnv,'GOOGLE_SERVICE_ACCOUNT_JSON'|'GOOGLE_CLOUD_PROJECT'|'GOOGLE_TTS_VOICE'|'OPENAI_API_KEY'|'SCRIPT_MODEL'>&{
  GENERATIONS_ENABLED:string;GENERATION_TOKEN:string;IMPORT_TOKEN:string;IMPORT_SERVICE:Fetcher;GENERATION_WORKFLOW:Workflow<{agencyId:string;jobId:string}>;
};
const diagnosticCode=(error:unknown)=>{
  if(error&&typeof error==='object'&&'code' in error&&typeof error.code==='string'&&/^[A-Z_]{3,80}$/.test(error.code))return error.code;
  return error instanceof Error?/^(?:[A-Za-z]+: )?([A-Z_]{3,80})$/.exec(error.message)?.[1]??'UNCLASSIFIED':'UNCLASSIFIED';
};
const safeCode=(error:unknown)=>{const code=diagnosticCode(error);return code in publicErrors?code:'GENERATION_FAILED';};
const controller=(env:GenerationEnv)=>env.RENDERER.getByName('generation-single-slot-v1');
async function active(env:GenerationEnv,agencyId:string,jobId:string){
  const row=await findGeneration(env.DB,agencyId,jobId);
  if(!row||row.retention!=='available'||['ready','failed'].includes(row.status))throw new Error('GENERATION_TERMINAL');
  if(row.deadline<=new Date().toISOString())throw new Error('GENERATION_TIMEOUT');
  const gate=await env.DB.prepare("SELECT enabled FROM generation_control WHERE id='generations'").first<{enabled:number}>();
  if(env.GENERATIONS_ENABLED!=='true'||gate?.enabled!==1)throw new GenerationFailure('GENERATIONS_PAUSED');
  return row;
}
export async function launchGeneration(env:GenerationEnv,row:GenerationRow){
  if(['ready','failed'].includes(row.status)||row.launchStatus!=='pending')return;
  // createBatch est idempotent côté plateforme : même identifiant après une perte de réponse.
  await env.GENERATION_WORKFLOW.createBatch([{id:row.workflowId,params:{agencyId:row.agencyId,jobId:row.jobId}}]);
  await env.DB.prepare("UPDATE job_launch_intents SET status='started',attempts=attempts+1,updated_at=? WHERE job_id=? AND status='pending'")
    .bind(new Date().toISOString(),row.jobId).run();
}
async function settleVideo(env:GenerationEnv,row:GenerationRow,result:unknown){
  if(row.retention!=='available')return false;
  const data=result as {status?:string;report?:unknown;objectKey?:string};if(data?.status!=='ready')return false;
  const frozen=await getJobVideo(env.DB,row.agencyId,row.jobId);if(!frozen)throw new Error('VIDEO_NOT_PREPARED');
  const report=VideoReport.parse(data.report),key=videoObjectKey(frozen.manifest,frozen.hash);
  if(data.objectKey!==key||report.id!==frozen.hash||report.manifestHash!==frozen.hash||report.watermarked!==frozen.manifest.rights.watermarked)throw new Error('VIDEO_REPORT_INVALID');
  const head=await env.MEDIA.head(key);if(!head||head.size!==report.sizeBytes||head.customMetadata?.sha256!==report.sha256||head.customMetadata?.manifestHash!==frozen.hash)throw new Error('VIDEO_ARTIFACT_INVALID');
  const previewKey=videoPreviewKey(frozen.manifest,frozen.hash);
  if(row.anonymousSessionId){
    if(!report.preview?.watermarked||report.watermarked)throw new Error('VIDEO_PREVIEW_INVALID');
    const preview=await env.MEDIA.head(previewKey);
    if(!preview||preview.size!==report.preview.sizeBytes||preview.customMetadata?.sha256!==report.preview.sha256||preview.customMetadata?.manifestHash!==frozen.hash)throw new Error('VIDEO_PREVIEW_INVALID');
  }
  const at=new Date().toISOString();
  // L'artefact et la consommation de crédit sont publiés dans une transaction D1.
  await env.DB.batch([
    ...(row.anonymousSessionId?[env.DB.prepare(`INSERT INTO generation_previews(job_id,object_key,report_json,created_at) VALUES(?,?,?,?) ON CONFLICT(job_id) DO NOTHING`).bind(row.jobId,previewKey,JSON.stringify(report.preview),at)]:[]),
    env.DB.prepare(`INSERT INTO generation_artifacts(job_id,object_key,report_json,created_at)
      SELECT ?,?,?,? WHERE EXISTS(SELECT 1 FROM jobs WHERE id=? AND status NOT IN ('failed')) ON CONFLICT(job_id) DO NOTHING`)
      .bind(row.jobId,key,JSON.stringify(report),at,row.jobId),
    env.DB.prepare("UPDATE jobs SET status='ready',stage='rendering',progress_percent=100,lease_until=NULL,error_code=NULL,updated_at=? WHERE id=? AND agency_id=? AND status NOT IN ('ready','failed')")
      .bind(at,row.jobId,row.agencyId),
  ]);return true;
}
export async function reconcileGeneration(env:GenerationEnv,row:GenerationRow,code='GENERATION_TIMEOUT'){
  if(['ready','failed'].includes(row.status))return;
  const frozen=await getJobVideo(env.DB,row.agencyId,row.jobId);
  if(frozen){
    const status=await controller(env).fetch(`https://video/status/${frozen.hash}`);
    if(status.ok&&await settleVideo(env,row,await status.json()))return;
    // Arrêt confirmé avant libération du quota ; une panne conserve la réservation.
    const cancelled=await controller(env).fetch(`https://video/cancel/${frozen.hash}`,{method:'POST'});
    if(!cancelled.ok)throw new Error('GENERATION_CANCEL_UNCERTAIN');
    if(await settleVideo(env,row,await cancelled.json()))return;
  }
  await failGeneration(env.DB,row,code);
}
export class GenerationWorkflow extends WorkflowEntrypoint<GenerationEnv,{agencyId:string;jobId:string}>{
  protected diagnostic(_error:unknown){}
  protected providers(){return realProviders(this.env);}
  async run(event:WorkflowEvent<{agencyId:string;jobId:string}>,step:WorkflowStep){
    const {agencyId,jobId}=event.payload;
    const once={retries:{limit:0,delay:'1 second' as const},timeout:'10 minutes' as const};
    try {
      await step.do('import-or-load',once,async()=>{const row=await active(this.env,agencyId,jobId);await setGenerationStage(this.env.DB,row,'importing');
        return loadGenerationListing(this.env,row);});
      await step.do('script-and-voice-checkpoints',once,async()=>{
        const row=await active(this.env,agencyId,jobId);await setGenerationStage(this.env.DB,row,'scripting');
        const providers=await this.providers(),guard=()=>active(this.env,agencyId,jobId);
        const source=providers.script,voice=providers.voice;
        providers.script={...source,plan:async(...args)=>{await guard();return source.plan(...args);}};
        providers.voice={...voice,synthesize:async text=>{await guard();return voice.synthesize(text);}};
        await prepareJobNarration(this.env,agencyId,jobId,providers,{brand:JSON.parse(row.brand),onVoicing:()=>setGenerationStage(this.env.DB,row,'voicing')});
        return {prepared:true};
      });
      const render=await step.do('prepare-and-submit-render',once,async()=>{
        const row=await active(this.env,agencyId,jobId),frozen=await prepareJobVideo(this.env,agencyId,jobId);
        await setGenerationStage(this.env.DB,row,'rendering');
        await active(this.env,agencyId,jobId);
        const response=await controller(this.env).fetch('https://video/render',{method:'POST',body:JSON.stringify(frozen.manifest)});
        if(!response.ok)throw new Error('VIDEO_SUBMIT_FAILED');await response.body?.cancel();return {hash:frozen.hash};
      });
      for(let poll=0;poll<120;poll++){
        await step.sleep(`render-wait-${poll}`,'5 seconds');
        const result=await step.do(`render-status-${poll}`,{retries:{limit:1,delay:'2 seconds'},timeout:'2 minutes'},async()=>{
          const row=await findGeneration(this.env.DB,agencyId,jobId);if(!row)throw new Error('GENERATION_NOT_FOUND');
          if(['ready','failed'].includes(row.status))return {done:true};
          if(row.deadline<=new Date().toISOString())throw new Error('GENERATION_TIMEOUT');
          const response=await controller(this.env).fetch(`https://video/status/${render.hash}`);if(!response.ok)throw new Error('VIDEO_STATE_UNAVAILABLE');
          const data=await response.json() as {status:string;progressPercent?:number};if(data.status==='failed')throw new Error('VIDEO_RENDER_FAILED');
          if(data.status==='rendering'||data.status==='publishing')await setGenerationProgress(this.env.DB,row,data.progressPercent??0);
          return {done:await settleVideo(this.env,row,data)};
        });
        if(result.done)return {jobId,completed:true};
      }
      throw new Error('GENERATION_TIMEOUT');
    }catch(error){
      this.diagnostic(error);
      await step.do('reconcile-failure',{retries:{limit:1,delay:'5 seconds'},timeout:'3 minutes'},async()=>{
        const row=await findGeneration(this.env.DB,agencyId,jobId);if(row)await reconcileGeneration(this.env,row,safeCode(error));
        console.log(JSON.stringify({event:'generation_failed',jobId,stage:row?.stage,code:safeCode(error),diagnostic:diagnosticCode(error)}));return {jobId,failed:true};
      });return {jobId,failed:true};
    }
  }
}
export async function reconcileBatch(env:GenerationEnv){
  const rows=await env.DB.prepare(`SELECT g.agency_id AS agencyId,g.job_id AS jobId FROM generation_runs g JOIN jobs j ON j.id=g.job_id
    JOIN job_launch_intents l ON l.job_id=j.id WHERE j.status NOT IN ('ready','failed') AND (g.deadline<=? OR l.status='pending' OR j.updated_at<=?) ORDER BY g.created_at LIMIT 10`)
    .bind(new Date().toISOString(),new Date(Date.now()-60_000).toISOString()).all<{agencyId:string;jobId:string}>();
  for(const ref of rows.results){const row=await findGeneration(env.DB,ref.agencyId,ref.jobId);if(!row)continue;
    try{if(row.deadline<=new Date().toISOString())await reconcileGeneration(env,row);else if(row.launchStatus==='pending')await launchGeneration(env,row);
      else {const frozen=await getJobVideo(env.DB,row.agencyId,row.jobId);if(frozen){const response=await controller(env).fetch(`https://video/status/${frozen.hash}`);if(response.ok)await settleVideo(env,row,await response.json());}}}
    catch{console.log(JSON.stringify({event:'generation_reconcile_pending',jobId:row.jobId,stage:row.stage}));}}
}
export default {
  async fetch(request:Request,env:GenerationEnv){
    if(!authorized(request,env.GENERATION_TOKEN))return json({error:'UNAUTHORIZED'},401);
    const agencyId=request.headers.get('X-Agency-ID'),path=new URL(request.url).pathname;
    if(!EntityId.safeParse(agencyId).success)return json({error:'UNAUTHORIZED'},401);
    try{
      if(path==='/operator/state'&&request.method==='GET')return controller(env).fetch('https://video/state');
      if(path==='/operator/pause'&&request.method==='POST'){
        await env.DB.prepare("UPDATE generation_control SET enabled=0,updated_at=? WHERE id='generations'").bind(new Date().toISOString()).run();return json({paused:true});
      }
      if(path==='/operator/reconcile'&&request.method==='POST'){await reconcileBatch(env);return json({reconciled:true});}
      if(path==='/extract'&&request.method==='POST'){
        const limit=EXTRACTION_TEXT_MAX*4+200,reader=request.body?.getReader();
        if(!reader||Number(request.headers.get('content-length'))>limit)return json({error:'VALIDATION_ERROR'},422);
        const chunks:Uint8Array[]=[],size={value:0};try{for(;;){const part=await reader.read();if(part.done)break;
          size.value+=part.value.byteLength;if(size.value>limit)return json({error:'VALIDATION_ERROR'},422);chunks.push(part.value);}}
        finally{await reader.cancel().catch(()=>{});reader.releaseLock();}
        const bytes=new Uint8Array(size.value);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length;}
        const body=new TextDecoder('utf-8',{fatal:true}).decode(bytes);
        const input=JSON.parse(body) as {text?:unknown};
        if(!input||typeof input.text!=='string'||input.text.length<15||input.text.length>EXTRACTION_TEXT_MAX)
          return json({error:'VALIDATION_ERROR'},422);
        try{return json(await extractDescription(input.text,env.OPENAI_API_KEY,env.SCRIPT_MODEL));}
        catch{return json({error:'SOURCE_UNAVAILABLE'},502);}
      }
      if(path==='/generations'&&request.method==='POST'){
        const body=await request.text();if(body.length>4096)return json({error:'VALIDATION_ERROR'},422);
        const input=GenerationRequest.safeParse(JSON.parse(body));if(!input.success)return json({error:'VALIDATION_ERROR'},422);
        const row=await admitGeneration(env.DB,agencyId!,request.headers.get('Idempotency-Key')??'',input.data,env.GENERATIONS_ENABLED,Date.now(),async listing=>{
          for(const photo of listing.photos){const head=await env.MEDIA.head(photo.objectKey);if(!head||head.size!==photo.sizeBytes||head.customMetadata?.sha256&&head.customMetadata.sha256!==photo.contentHash)throw new GenerationFailure('INVALID_PHOTO');}
        });
        try{await launchGeneration(env,row);}catch{/* Intention durable : reprise cron, aucune deuxième admission. */}
        return json(generationView((await findGeneration(env.DB,agencyId!,row.jobId))!),202);
      }
      const retry=/^\/generations\/([a-zA-Z0-9_-]+)\/retry$/.exec(path);
      if(retry&&request.method==='POST'){
        const row=await findGeneration(env.DB,agencyId!,retry[1]);if(!row)return json({error:'NOT_FOUND'},404);
        if(row.status!=='queued'||row.launchStatus!=='pending')return json({error:'CONFLICT'},409);
        await active(env,agencyId!,row.jobId);await launchGeneration(env,row);return json(generationView(row),202);
      }
      return json({error:'NOT_FOUND'},404);
    }catch(error){const code=error instanceof GenerationFailure?error.code:'INTERNAL_ERROR';return json({error:code},publicErrors[code][0]);}
  },
  scheduled(_event:ScheduledController,env:GenerationEnv,ctx:ExecutionContext){ctx.waitUntil(reconcileBatch(env).then(()=>cleanupAnonymousTrials(env)));},
};
