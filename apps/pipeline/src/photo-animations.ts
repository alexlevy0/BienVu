import {GenerationRequest,PreparedNarration,PhotoAnimation,requestedAnimations,selectedAnimationIndices,type NormalizedListing} from '@bienvu/contracts';
import {findNarration,findGeneration,type Database} from '@bienvu/db';
import {scriptContext} from '@bienvu/narration';
import type {NarrationBucket} from './narration';
import {runwayProvider,runwayError,type AnimationProvider} from './runway';
import {videoBytesHash} from './video-manifest';

type AnimationRow={id:string;photoId:string;sourceSha256:string;state:string;taskId:string|null;animation:string|null;mode:'real'|'mock';updatedAt:string};
type AnimationEnv={DB:Database;MEDIA:NarrationBucket;RUNWAY_ENABLED?:string;RUNWAYML_API_SECRET?:string;RUNWAY_TEST_AGENCY_ID?:string};
const select=`SELECT id,photo_id AS photoId,source_sha256 AS sourceSha256,state,task_id AS taskId,animation_json AS animation,mode,updated_at AS updatedAt FROM photo_animations WHERE agency_id=? AND job_id=?`;
// Always start with the first photo; use a different photo halfway through the
// selected order for the second clip. The original images remain available.
export function animationIndices(count:number,clips:number){return clips===2?[0,Math.floor(count/2)]:clips===1?[0]:[];}
export async function prepareJobAnimations(env:AnimationEnv,agencyId:string,jobId:string,provider?:AnimationProvider){
  const job=await findGeneration(env.DB,agencyId,jobId);if(!job||['ready','failed'].includes(job.status)||job.retention!=='available')throw Error('RUNWAY_JOB_INACTIVE');
  const input=GenerationRequest.parse(JSON.parse(job.input)),settings=input.customization,requested=requestedAnimations(settings);
  if(!requested)return {requested,ready:0};
  if(env.RUNWAY_TEST_AGENCY_ID&&env.RUNWAY_TEST_AGENCY_ID!==agencyId)return {requested,ready:0,reason:'RUNWAY_DISABLED'};
  if(!provider&&(env.RUNWAY_ENABLED!=='true'||!env.RUNWAYML_API_SECRET))return {requested,ready:0,reason:'RUNWAY_DISABLED'};
  const narration=await findNarration(env.DB,agencyId,jobId);
  if(!narration||narration.state!=='prepared'||narration.jobAttempt!==job.attempt)throw Error('RUNWAY_NARRATION_NOT_READY');
  const snapshot=JSON.parse(narration.snapshot),context=await scriptContext(snapshot.listing,snapshot.brand,snapshot.contact,snapshot.copyVersion,snapshot.customNarration);
  PreparedNarration.parse(JSON.parse(narration.result!));
  if(context.listing.agencyId!==agencyId||context.listing.id!==job.listingId)throw Error('RUNWAY_SCOPE_INVALID');
  const adapter=provider??runwayProvider(env.RUNWAYML_API_SECRET!),photos=context.listing.photos;
  for(const [slot,index] of selectedAnimationIndices(settings?.photoOrder??photos.map(p=>p.sourceOrder),settings).entries()){
    const photo=photos[index];let row=await env.DB.prepare(select+' AND slot=?').bind(agencyId,jobId,slot).first<AnimationRow>();
    if(row&&(row.photoId!==photo.id||row.sourceSha256!==photo.contentHash||row.mode!==adapter.mode))throw Error('RUNWAY_SCOPE_INVALID');
    if(row?.state==='ready'||row?.state==='failed'||row?.state==='uncertain')continue;
    const deadline=Date.parse(job.deadline);
    if(deadline-Date.now()<180_000)continue; // Keep time for the ordinary render.
    if(!row){
      const id=crypto.randomUUID(),at=new Date().toISOString();
      try{
        const inserted=await env.DB.prepare(`INSERT INTO photo_animations(id,agency_id,job_id,photo_id,source_sha256,slot,month,mode,model,credits,reserved_cents,state,created_at,updated_at)
          VALUES(?,?,?,?,?,?,?,?,'gen4_turbo',25,?,'submitting',?,?) ON CONFLICT(job_id,slot) DO NOTHING RETURNING id`)
          .bind(id,agencyId,jobId,photo.id,photo.contentHash,slot,job.createdAt.slice(0,7),adapter.mode,adapter.mode==='real'?35:0,at,at).first();
        if(!inserted)continue; // Concurrent replay never submits a second task.
        row={id,photoId:photo.id,sourceSha256:photo.contentHash,state:'submitting',taskId:null,animation:null,mode:adapter.mode,updatedAt:at};
      }catch(error){if(error instanceof Error&&error.message.includes('RUNWAY_BUDGET_LIMIT'))continue;throw error;}
    }else if(row.state==='submitting'){
      // Another invocation may still be creating this task (150 s bound).
      // Leave its checkpoint intact until that invocation can no longer run.
      if(Date.now()-Date.parse(row.updatedAt)<180_000)continue;
      // Creation outcome unknown after a crash: fall back, never submit again.
      await env.DB.prepare("UPDATE photo_animations SET state='uncertain',error_code='RUNWAY_UNCERTAIN',updated_at=? WHERE id=? AND state='submitting'")
        .bind(new Date().toISOString(),row.id).run();continue;
    }
    try{
      const guard=async()=>{const current=await findGeneration(env.DB,agencyId,jobId);
        if(!current||['ready','failed'].includes(current.status)||current.retention!=='available'||Date.parse(current.deadline)<=Date.now())throw Error('RUNWAY_JOB_INACTIVE');};
      await guard();const signal=AbortSignal.timeout(Math.min(150_000,deadline-Date.now()-120_000));
      const bytes=row.taskId?await adapter.resume(row.taskId,signal):await adapter.generate(await sourceBytes(env,photo,agencyId,job.listingId!,jobId),photo.mime,async taskId=>{
        const saved=await env.DB.prepare("UPDATE photo_animations SET state='submitted',task_id=?,updated_at=? WHERE id=? AND state='submitting' RETURNING id")
          .bind(taskId,new Date().toISOString(),row!.id).first();if(!saved)throw Error('RUNWAY_CHECKPOINT_FAILED');
      },signal,slot===0?'dolly':'slide',input.aspectRatio);
      await guard();if(bytes.length>10*1024*1024||bytes.length<16)throw Error('RUNWAY_OUTPUT_INVALID');
      const hash=await videoBytesHash(bytes),objectKey=`agencies/${agencyId}/jobs/${jobId}/animations/${hash}.mp4`;
      const animation=PhotoAnimation.parse({photoAssetId:photo.id,sourceSha256:photo.contentHash,provider:'runway',model:'gen4_turbo',
        asset:{id:row.id,objectKey,sha256:hash,sizeBytes:bytes.length,mime:'video/mp4',width:input.aspectRatio==='16:9'?1280:720,height:input.aspectRatio==='16:9'?720:1280,durationMs:5000}});
      await env.MEDIA.put(objectKey,bytes,{httpMetadata:{contentType:'video/mp4'},customMetadata:{sha256:hash,sourceSha256:photo.contentHash}});
      await env.DB.prepare("UPDATE photo_animations SET state='ready',animation_json=?,updated_at=? WHERE id=? AND state='submitted'")
        .bind(JSON.stringify(animation),new Date().toISOString(),row.id).run();
    }catch(error){const code=runwayError(error);
      await env.DB.prepare("UPDATE photo_animations SET state=?,error_code=?,updated_at=? WHERE id=? AND state IN ('submitting','submitted')")
        .bind(code==='RUNWAY_UNCERTAIN'?'uncertain':'failed',code,new Date().toISOString(),row.id).run();
      console.log(JSON.stringify({event:'photo_animation_fallback',jobId,slot,code}));
      // Authentication/rate-limit failures should not prompt another billable call.
      if(['RUNWAY_AUTH_FAILED','RUNWAY_RATE_LIMIT','RUNWAY_UNCERTAIN','RUNWAY_TIMEOUT'].includes(code))break;
    }
  }
  const ready=await env.DB.prepare("SELECT count(*) AS n FROM photo_animations WHERE agency_id=? AND job_id=? AND state='ready'").bind(agencyId,jobId).first<{n:number}>();
  return {requested,ready:ready?.n??0};
}
async function sourceBytes(env:AnimationEnv,photo:NormalizedListing['photos'][number],agencyId:string,listingId:string,jobId:string){
  if(!photo.objectKey.startsWith(`agencies/${agencyId}/imports/${listingId}/`)&&!photo.objectKey.startsWith(`agencies/${agencyId}/jobs/${jobId}/`))throw Error('RUNWAY_SCOPE_INVALID');
  const object=await env.MEDIA.get(photo.objectKey);if(!object||object.size!==photo.sizeBytes||object.size>10*1024*1024)throw Error('RUNWAY_INPUT_INVALID');
  const bytes=new Uint8Array(await object.arrayBuffer());if(await videoBytesHash(bytes)!==photo.contentHash)throw Error('RUNWAY_INPUT_INVALID');return bytes;
}
