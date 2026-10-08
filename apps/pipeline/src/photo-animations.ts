import {GenerationRequest,PreparedNarration,PhotoAnimation,requestedAnimations,selectedAnimationIndices,type NormalizedListing} from '@bienvu/contracts';
import {findNarration,findGeneration,type Database} from '@bienvu/db';
import {scriptContext} from '@bienvu/narration';
import type {NarrationBucket} from './narration';
import {runwayProvider,runwayError,runwayClipCost,type AnimationProvider} from './runway';
import {videoBytesHash} from './video-manifest';
import {prepareAnimationTiming,plannedAnimationSeconds} from './animation-timing';

type AnimationRow={id:string;photoId:string;sourceSha256:string;state:string;taskId:string|null;animation:string|null;mode:'real'|'mock';updatedAt:string;durationSeconds:number};
type AnimationEnv={DB:D1Database;MEDIA:NarrationBucket;RUNWAY_ENABLED?:string;RUNWAYML_API_SECRET?:string;RUNWAY_TEST_AGENCY_ID?:string};
const select=`SELECT id,photo_id AS photoId,source_sha256 AS sourceSha256,state,task_id AS taskId,animation_json AS animation,mode,updated_at AS updatedAt,duration_seconds AS durationSeconds FROM photo_animations WHERE agency_id=? AND job_id=?`;
// Always start with the first photo; use a different photo halfway through the
// selected order for the second clip. The original images remain available.
export function animationIndices(count:number,clips:number){return clips===2?[0,Math.floor(count/2)]:clips===1?[0]:[];}
export async function prepareJobAnimations(env:AnimationEnv,agencyId:string,jobId:string,provider?:AnimationProvider){
  const job=await findGeneration(env.DB,agencyId,jobId);if(!job||['ready','failed'].includes(job.status)||job.retention!=='available')throw Error('RUNWAY_JOB_INACTIVE');
  const input=GenerationRequest.parse(JSON.parse(job.input)),settings=input.customization,requested=requestedAnimations(settings);
  const reuseRow=await env.DB.prepare('SELECT animation_reuses_json AS data FROM generation_runs WHERE agency_id=? AND job_id=?').bind(agencyId,jobId).first<{data:string}>();
  const reused=JSON.parse(reuseRow?.data??'[]') as {photoId:string}[];
  if(!requested)return {requested,ready:0};
  if(env.RUNWAY_TEST_AGENCY_ID&&env.RUNWAY_TEST_AGENCY_ID!==agencyId)return {requested,ready:0,reason:'RUNWAY_DISABLED'};
  if(!provider&&(env.RUNWAY_ENABLED!=='true'||!env.RUNWAYML_API_SECRET))return {requested,ready:0,reason:'RUNWAY_DISABLED'};
  const narration=await findNarration(env.DB,agencyId,jobId);
  if(!narration||narration.state!=='prepared'||narration.jobAttempt!==job.attempt)throw Error('RUNWAY_NARRATION_NOT_READY');
  const snapshot=JSON.parse(narration.snapshot),context=await scriptContext(snapshot.listing,snapshot.brand,snapshot.contact,snapshot.copyVersion,snapshot.customNarration);
  const prepared=PreparedNarration.parse(JSON.parse(narration.result!));
  if(context.listing.agencyId!==agencyId||context.listing.id!==job.listingId)throw Error('RUNWAY_SCOPE_INVALID');
  const adapter=provider??runwayProvider(env.RUNWAYML_API_SECRET!),photos=context.listing.photos;
  const timing=await prepareAnimationTiming(env.DB,agencyId,jobId,photos,prepared.durationFrames.reduce((sum,f)=>sum+f,0),settings);
  for(const [slot,index] of selectedAnimationIndices(settings?.photoOrder??photos.map(p=>p.sourceOrder),settings).entries()){
    const photo=photos[index];if(reused.some(r=>r.photoId===photo.id))continue;
    let row=await env.DB.prepare(select+' AND slot=?').bind(agencyId,jobId,slot).first<AnimationRow>();
    if(row&&(row.photoId!==photo.id||row.sourceSha256!==photo.contentHash||row.mode!==adapter.mode))throw Error('RUNWAY_SCOPE_INVALID');
    if(row?.state==='ready'||row?.state==='failed'||row?.state==='uncertain')continue;
    const deadline=Date.parse(job.deadline);
    if(deadline-Date.now()<180_000)continue; // Keep time for the ordinary render.
    if(!row){
      const id=crypto.randomUUID(),at=new Date().toISOString();
      const durationSeconds=timing?plannedAnimationSeconds(timing,photo.id,settings?.photoOrder?.[index]??photos[index].sourceOrder,settings):5,
        cost=runwayClipCost(durationSeconds);
      try{
        const inserted=await env.DB.prepare(`INSERT INTO photo_animations(id,agency_id,job_id,photo_id,source_sha256,slot,month,mode,model,credits,reserved_cents,state,created_at,updated_at,duration_seconds)
          VALUES(?,?,?,?,?,?,?,?,'gen4_turbo',?,?,'submitting',?,?,?) ON CONFLICT(job_id,slot) DO NOTHING RETURNING id`)
          .bind(id,agencyId,jobId,photo.id,photo.contentHash,slot,job.createdAt.slice(0,7),adapter.mode,cost.credits,adapter.mode==='real'?cost.reservedCents:0,at,at,durationSeconds).first();
        if(!inserted)continue; // Concurrent replay never submits a second task.
        row={id,photoId:photo.id,sourceSha256:photo.contentHash,state:'submitting',taskId:null,animation:null,mode:adapter.mode,updatedAt:at,durationSeconds};
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
      },signal,slot===0?'dolly':'slide',input.aspectRatio,row.durationSeconds);
      await guard();if(bytes.length>10*1024*1024||bytes.length<16)throw Error('RUNWAY_OUTPUT_INVALID');
      const hash=await videoBytesHash(bytes),objectKey=`agencies/${agencyId}/jobs/${jobId}/animations/${hash}.mp4`;
      const animation=PhotoAnimation.parse({photoAssetId:photo.id,sourceSha256:photo.contentHash,provider:'runway',model:'gen4_turbo',
        asset:{id:row.id,objectKey,sha256:hash,sizeBytes:bytes.length,mime:'video/mp4',width:input.aspectRatio==='16:9'?1280:720,height:input.aspectRatio==='16:9'?720:1280,durationMs:row.durationSeconds*1000}});
      await env.MEDIA.put(objectKey,bytes,{httpMetadata:{contentType:'video/mp4'},customMetadata:{sha256:hash,sourceSha256:photo.contentHash}});
      const libraryKey=`agencies/${agencyId}/imports/animation-library/${hash}.mp4`,asset={...animation.asset,objectKey:libraryKey},at=new Date().toISOString();
      await env.MEDIA.put(libraryKey,bytes,{httpMetadata:{contentType:'video/mp4'},customMetadata:{sha256:hash,sourceSha256:photo.contentHash}});
      await env.DB.batch([env.DB.prepare("UPDATE photo_animations SET state='ready',animation_json=?,updated_at=? WHERE id=? AND state='submitted' AND EXISTS(SELECT 1 FROM jobs WHERE id=? AND status NOT IN ('ready','failed'))")
        .bind(JSON.stringify(animation),at,row.id,jobId),env.DB.prepare(`INSERT INTO animation_library(id,agency_id,source_sha256,aspect_ratio,model,mode,origin_job_id,asset_json,created_at,expires_at)
        SELECT ?,?,?,?,'gen4_turbo',?,?,?,?,? WHERE EXISTS(SELECT 1 FROM photo_animations WHERE id=? AND state='ready') ON CONFLICT(agency_id,source_sha256,aspect_ratio,model,mode) DO UPDATE SET asset_json=excluded.asset_json,origin_job_id=excluded.origin_job_id,expires_at=excluded.expires_at WHERE animation_library.state='available'`)
        .bind(row.id,agencyId,photo.contentHash,input.aspectRatio??'9:16',adapter.mode,jobId,JSON.stringify(asset),at,new Date(Date.now()+90*86400_000).toISOString(),row.id)]);
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
