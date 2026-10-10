import {AvatarAdmission,GenerationRequest,AvatarAudio,PreparedNarration,VideoAsset,AvatarVideoAsset,AVATAR_AUDIO_BYTES,AVATAR_VIDEO_BYTES,avatarMoments,type VideoManifest} from '@bienvu/contracts';
import {assembleNarrationWavs} from '@bienvu/voice';
import {avatarHash,heygenClient,downloadHeygenMedia,AvatarFailure,type HeygenEnvironment} from '@bienvu/avatars';
import {findGeneration,findNarration,jobAvatarTasks,findAvatarTask,avatarSettings,type Database,type AvatarTask} from '@bienvu/db';
import {safeAiEvent} from '@bienvu/observability';
import type {NarrationBucket} from './narration';

export type AvatarEnv=HeygenEnvironment&{DB:Database;MEDIA:NarrationBucket};
type Clip=NonNullable<VideoManifest['avatar']>['clips'][number];
export async function avatarCacheKey(audioSha:string,lookId:string,engine:string,transparent:boolean){
  return avatarHash(new TextEncoder().encode(JSON.stringify({version:1,audioSha,lookId,engine,transparent,resolution:'720p',aspectRatio:'9:16'})));
}
async function record(env:AvatarEnv,task:AvatarTask,error?:string){
  const run=await findGeneration(env.DB,task.agencyId,task.jobId),trace=`bv-job-${task.jobId}-a${run?.attempt??1}`;
  await safeAiEvent(env.DB,`avatar-stage:${task.id}:${task.state}`,'ai_stage_completed',trace,{distinct_id:'bv-agency-'+task.agencyId,bv_app:'bienvu',bv_job_id:task.jobId,
    bv_stage:'avatar',$ai_parent_id:trace,$ai_span_id:task.id,$ai_span_name:'Avatar '+task.moment,$ai_model:task.engine,$ai_provider:'heygen',
    bv_reused:task.reused===1,bv_cost_estimated_usd:task.reservedMicros/1e6,bv_cost_actual_usd:null,
    $ai_is_error:Boolean(error),...(error?{$ai_error:error}:{}),$ai_output_state:task.state});
}
const errorCode=(error:unknown)=>error instanceof AvatarFailure?error.code:/AVATAR_[A-Z_]+/.exec(String(error))?.[0]??'AVATAR_UNAVAILABLE';
async function failTask(env:AvatarEnv,task:AvatarTask,code:string,uncertain=false,beforeCall=false){
  await env.DB.prepare(`UPDATE avatar_tasks SET state=?,error_code=?,reserved_micros=IIF(?,0,reserved_micros),updated_at=? WHERE id=? AND state!='ready'`)
    .bind(uncertain?'uncertain':'failed',code,beforeCall?1:0,new Date().toISOString(),task.id).run();await record(env,{...task,state:uncertain?'uncertain':'failed'},code);
}
async function readStoredAudio(env:AvatarEnv,agency:string,job:string,audio:{objectKey:string;sizeBytes:number;sha256:string}){
  const prefix=`agencies/${agency}/jobs/${job}/audio/`;
  if(!audio.objectKey.startsWith(prefix)||audio.sizeBytes>7*1024*1024)throw new AvatarFailure('AVATAR_AUDIO_INVALID');
  const stored=await env.MEDIA.get(audio.objectKey);if(!stored||stored.size!==audio.sizeBytes)throw new AvatarFailure('AVATAR_AUDIO_INVALID');
  const bytes=new Uint8Array(await stored.arrayBuffer());if(await avatarHash(bytes)!==audio.sha256)throw new AvatarFailure('AVATAR_AUDIO_INVALID');return bytes;
}
async function readAudio(env:AvatarEnv,task:AvatarTask){
  const audio=AvatarAudio.parse(JSON.parse(task.audio));if(audio.sizeBytes>AVATAR_AUDIO_BYTES)throw new AvatarFailure('AVATAR_AUDIO_INVALID');
  return readStoredAudio(env,task.agencyId,task.jobId,audio);
}
async function fullAudio(env:AvatarEnv,agency:string,job:string,narration:PreparedNarration,starts:number[]){
  const chunks=await Promise.all(narration.audio.map(async(audio,i)=>({bytes:await readStoredAudio(env,agency,job,audio),startFrame:starts[i]})));
  const assembled=assembleNarrationWavs(chunks,narration.durationFrames.reduce((n,f)=>n+f,0)),sha256=await avatarHash(assembled.bytes),objectKey=`agencies/${agency}/jobs/${job}/audio/avatar-full-${sha256}.wav`;
  await env.MEDIA.put(objectKey,assembled.bytes,{httpMetadata:{contentType:'audio/wav'},customMetadata:{sha256}});
  return AvatarAudio.parse({id:'avatar-full-audio',cacheKey:sha256,objectKey,sha256,sizeBytes:assembled.bytes.length,
    durationMs:assembled.durationMs,sampleRate:assembled.sampleRate,channels:assembled.channels,rmsDbfs:assembled.rmsDbfs,
    sources:narration.audio.map((audio,i)=>({audioAssetId:audio.id,audioSha256:audio.sha256,durationMs:audio.durationMs,startFrame:starts[i]}))});
}
function fullSource(audio:typeof AvatarAudio._output){
  return audio.sources?{asset:VideoAsset.parse({id:audio.id,objectKey:audio.objectKey,sha256:audio.sha256,sizeBytes:audio.sizeBytes,mime:'audio/wav',durationMs:audio.durationMs}),sources:audio.sources}:undefined;
}
async function cachedClip(env:AvatarEnv,agency:string,key:string){
  const row=await env.DB.prepare(`SELECT clip_json AS clip FROM avatar_library WHERE agency_id=? AND cache_key=? AND (expires_at>? OR EXISTS(SELECT 1 FROM generation_runs g WHERE g.job_id=avatar_library.origin_job_id AND g.storage_permanent=1 AND g.retention='available'))`)
    .bind(agency,key,new Date().toISOString()).first<{clip:string}>();if(!row)return null;
  const clip=JSON.parse(row.clip) as Clip,asset=AvatarVideoAsset.parse(clip.asset);
  if(!asset.objectKey.startsWith(`agencies/${agency}/`))return null;
  const object=await env.MEDIA.get(asset.objectKey);if(!object||object.size!==asset.sizeBytes)return null;
  const bytes=new Uint8Array(await object.arrayBuffer());if(await avatarHash(bytes)!==asset.sha256)return null;
  return {clip,bytes};
}
async function submit(env:AvatarEnv,task:AvatarTask){
  // Persist the intent before touching the billable endpoint. A restart never
  // creates a replacement task for an uncertain result.
  const claimed=await env.DB.prepare("UPDATE avatar_tasks SET state='submitting',updated_at=? WHERE id=? AND state='claimed' RETURNING id")
    .bind(new Date().toISOString(),task.id).first();if(!claimed)return;
  let called=false;
  try{
    const current=await findGeneration(env.DB,task.agencyId,task.jobId);if(!current||current.deadline<=new Date().toISOString()||['failed','ready'].includes(current.status))throw new AvatarFailure('AVATAR_JOB_INACTIVE');
    const {settings}=await avatarSettings(env.DB);if(!settings.enabled||env.HEYGEN_ENABLED!=='true'||!env.HEYGEN_API_KEY)throw new AvatarFailure('AVATAR_UNAVAILABLE');
    const client=heygenClient(env.HEYGEN_API_KEY),wallet=await client.wallet();
    if(wallet.currency!=='USD'||wallet.balance===null||wallet.balance<task.reservedMicros/1e6)throw new AvatarFailure('AVATAR_BALANCE_LOW');
    const config=AvatarAdmission.parse(JSON.parse(current.avatarConfig!)),input=GenerationRequest.parse(JSON.parse(current.input));
    const audioId=await client.upload(await readAudio(env,task),task.id);
    await env.DB.prepare('UPDATE avatar_tasks SET audio_asset_id=?,updated_at=? WHERE id=?').bind(audioId,new Date().toISOString(),task.id).run();
    called=true;const providerId=await client.create({id:task.id,lookId:config.look.id,engine:task.engine,audioId,transparent:input.customization!.avatar!.appearance==='cutout'});
    await env.DB.prepare("UPDATE avatar_tasks SET provider_id=?,state='submitted',error_code=NULL,poll_after=?,updated_at=? WHERE id=? AND state IN ('submitting','uncertain')")
      .bind(providerId,new Date(Date.now()+10000).toISOString(),new Date().toISOString(),task.id).run();
    await record(env,{...task,state:'submitted'});
  }catch(error){await failTask(env,task,errorCode(error),called&&(!(error instanceof AvatarFailure)||error.uncertain),!called||error instanceof AvatarFailure&&!error.uncertain);}
}
export async function submitJobAvatars(env:AvatarEnv,agency:string,job:string){
  const run=await findGeneration(env.DB,agency,job);if(!run?.avatarCredits)return {requested:false};
  const input=GenerationRequest.parse(JSON.parse(run.input)),settings=input.customization?.avatar,config=AvatarAdmission.parse(JSON.parse(run.avatarConfig!));
  const source=await findNarration(env.DB,agency,job);if(source?.state!=='prepared'||!source.result)throw new AvatarFailure('AVATAR_AUDIO_INVALID');
  const narration=PreparedNarration.parse(JSON.parse(source.result));let at=0;const starts=narration.durationFrames.map(n=>{const from=at;at+=n;return from;});
  for(const moment of avatarMoments(settings)){
    const previous=await findAvatarTask(env.DB,agency,job,moment);
    if(previous){if(previous.state==='claimed')await submit(env,previous);continue;}
    const index=moment==='intro'?0:narration.audio.length-1,audio=moment==='full'?await fullAudio(env,agency,job,narration,starts):narration.audio[index];if(!audio)throw new AvatarFailure('AVATAR_AUDIO_INVALID');
    const startFrame=moment==='full'?0:starts[index],sourceAudio=fullSource(audio);
    const transparent=settings!.appearance==='cutout',cacheKey=await avatarCacheKey(audio.sha256,config.look.id,settings!.engine,transparent),id=crypto.randomUUID(),now=new Date().toISOString();
    const tooLong=audio.durationMs>(moment==='full'?40000:settings!.maxSeconds*1000);
    const cached=tooLong?null:await cachedClip(env,agency,cacheKey);
    const rate=settings!.engine==='avatar_iii'?config.settings.priceIII:config.look.type==='photo_avatar'?config.settings.priceIVPhoto:config.settings.priceIVStudio;
    // Rounded up, with one frame/output allowance; a reservation is an estimate,
    // never a provider invoice. Rejected and reused clips reserve no dollars.
    const micros=cached||tooLong?0:Math.ceil(Math.ceil((audio.durationMs+350)/1000)*rate/60*1e6);
    let clip:Clip|null=null;
    if(cached){const asset={...cached.clip.asset,id:'avatar-'+id,objectKey:`agencies/${agency}/jobs/${job}/avatars/${id}/${cached.clip.asset.sha256}.${transparent?'webm':'mp4'}`};
      await env.MEDIA.put(asset.objectKey,cached.bytes,{httpMetadata:{contentType:asset.mime},customMetadata:{sha256:asset.sha256}});
      clip={...cached.clip,id,moment,startFrame,durationFrames:Math.ceil(audio.durationMs*30/1000),audioAssetId:audio.id,audioSha256:audio.sha256,asset,...(sourceAudio?{sourceAudio}:{})};}
    try{await env.DB.prepare(`INSERT INTO avatar_tasks(id,agency_id,job_id,moment,cache_key,audio_json,start_frame,state,engine,mode,reused,reserved_micros,result_json,error_code,created_at,updated_at)
      VALUES(?,?,?,?,?,?,?,?,?,'real',?,?,?,?,?,?)`).bind(id,agency,job,moment,cacheKey,JSON.stringify(audio),startFrame,cached?'ready':tooLong?'failed':'claimed',settings!.engine,
        cached?1:0,micros,clip?JSON.stringify(clip):null,tooLong?'AVATAR_AUDIO_TOO_LONG':null,now,now).run();}
    catch(error){if(await findAvatarTask(env.DB,agency,job,moment))continue;
      const code=errorCode(error);if(!['AVATAR_BUSY','AVATAR_BUDGET_LIMIT','AVATAR_UNAVAILABLE'].includes(code))throw error;
      await env.DB.prepare(`INSERT INTO avatar_tasks(id,agency_id,job_id,moment,cache_key,audio_json,start_frame,state,engine,mode,reused,reserved_micros,error_code,created_at,updated_at)
        VALUES(?,?,?,?,?,?,?,'failed',?,'real',0,0,?,?,?)`).bind(id,agency,job,moment,cacheKey,JSON.stringify(audio),startFrame,settings!.engine,code,now,now).run();}
    const task=(await findAvatarTask(env.DB,agency,job,moment))!;
    if(task.state==='claimed')await submit(env,task);else await record(env,task,task.errorCode??undefined);
  }return {requested:true};
}
async function complete(env:AvatarEnv,task:AvatarTask){
  const client=heygenClient(env.HEYGEN_API_KEY!),video=await client.video(task.providerId!);
  if(video.id!==task.providerId)throw new AvatarFailure('AVATAR_RESPONSE_INVALID');
  if(video.status==='failed'){await failTask(env,task,'AVATAR_PROVIDER_FAILED');return;}
  if(video.status!=='completed'){await env.DB.prepare('UPDATE avatar_tasks SET poll_after=?,updated_at=? WHERE id=?').bind(new Date(Date.now()+30000).toISOString(),new Date().toISOString(),task.id).run();return;}
  const run=await findGeneration(env.DB,task.agencyId,task.jobId);if(!run||run.retention!=='available')return;
  const config=AvatarAdmission.parse(JSON.parse(run.avatarConfig!)),settings=GenerationRequest.parse(JSON.parse(run.input)).customization!.avatar!;
  const audio=AvatarAudio.parse(JSON.parse(task.audio));
  if(!video.url||video.duration===null||Math.abs(video.duration*1000-audio.durationMs)>350)throw new AvatarFailure('AVATAR_DURATION_INVALID');
  const bytes=await downloadHeygenMedia(video.url,AVATAR_VIDEO_BYTES),transparent=settings.appearance==='cutout';
  const mp4=new TextDecoder().decode(bytes.slice(4,8))==='ftyp',webm=bytes[0]===0x1a&&bytes[1]===0x45&&bytes[2]===0xdf&&bytes[3]===0xa3;
  if(transparent?!webm:!mp4)throw new AvatarFailure('AVATAR_MEDIA_INVALID');
  const sha=await avatarHash(bytes),asset=AvatarVideoAsset.parse({id:'avatar-'+task.id,objectKey:`agencies/${task.agencyId}/jobs/${task.jobId}/avatars/${task.id}/${sha}.${transparent?'webm':'mp4'}`,
    sha256:sha,sizeBytes:bytes.length,mime:transparent?'video/webm':'video/mp4',width:720,height:1280,durationMs:Math.round(video.duration*1000)});
  await env.MEDIA.put(asset.objectKey,bytes,{httpMetadata:{contentType:asset.mime},customMetadata:{sha256:sha}});
  const sourceAudio=fullSource(audio),clip:Clip={id:task.id,moment:task.moment,startFrame:task.startFrame,durationFrames:Math.ceil(audio.durationMs*30/1000),audioAssetId:audio.id,audioSha256:audio.sha256,lookId:config.look.id,engine:task.engine,transparent,asset,...(sourceAudio?{sourceAudio}:{})};
  await env.DB.prepare("UPDATE avatar_tasks SET state='ready',result_json=?,error_code=NULL,updated_at=? WHERE id=? AND state IN ('submitted','uncertain')")
    .bind(JSON.stringify(clip),new Date().toISOString(),task.id).run();
  await env.DB.prepare(`INSERT INTO avatar_library(agency_id,cache_key,origin_job_id,clip_json,created_at,expires_at) VALUES(?,?,?,?,?,?)
    ON CONFLICT(agency_id,cache_key) DO UPDATE SET origin_job_id=excluded.origin_job_id,clip_json=excluded.clip_json,created_at=excluded.created_at,expires_at=excluded.expires_at`)
    .bind(task.agencyId,task.cacheKey,task.jobId,JSON.stringify(clip),new Date().toISOString(),new Date(Date.now()+90*86400000).toISOString()).run();await record(env,{...task,state:'ready'});
}
export async function pollJobAvatars(env:AvatarEnv,agency:string,job:string){
  const tasks=await jobAvatarTasks(env.DB,agency,job);
  for(const task of tasks){if((task.state==='submitted'||task.state==='uncertain')&&task.providerId){
    try{await complete(env,task);}catch(error){if(['AVATAR_UNAVAILABLE','AVATAR_RATE_LIMIT','AVATAR_MEDIA_UNAVAILABLE'].includes(errorCode(error)))continue;await failTask(env,task,errorCode(error));}
  }else if(task.state==='submitting')await failTask(env,task,'AVATAR_UNCERTAIN',true);}
  const next=await jobAvatarTasks(env.DB,agency,job);return {done:next.every(t=>t.state==='ready'||t.state==='failed'||t.state==='uncertain'&&!t.providerId),ready:next.filter(t=>t.state==='ready').length};
}
export async function timeoutJobAvatars(env:AvatarEnv,agency:string,job:string){
  for(const task of await jobAvatarTasks(env.DB,agency,job))if(!['ready','failed'].includes(task.state))await failTask(env,task,'AVATAR_TIMEOUT',Boolean(task.providerId)||task.state!=='claimed',task.state==='claimed');
}
export async function reconcileAvatarTasks(env:AvatarEnv){
  if(!env.HEYGEN_API_KEY)return {checked:0};
  const row=await env.DB.prepare(`SELECT json_group_array(json(record)) AS data FROM (SELECT json_object('agency',agency_id,'job',job_id) AS record
    FROM avatar_tasks WHERE state IN ('submitted','uncertain') AND provider_id IS NOT NULL AND updated_at<? GROUP BY agency_id,job_id ORDER BY min(updated_at) LIMIT 2)`)
    .bind(new Date(Date.now()-30000).toISOString()).first<{data:string}>();
  const refs=JSON.parse(row?.data??'[]') as {agency:string;job:string}[];
  for(const ref of refs)await pollJobAvatars(env,ref.agency,ref.job);
  // Files retained by a permanent video remain reusable. Removing an expired
  // cache reference never deletes the file used by an original video.
  await env.DB.prepare(`DELETE FROM avatar_library WHERE expires_at<=? AND NOT EXISTS(SELECT 1 FROM generation_runs g
    WHERE g.job_id=avatar_library.origin_job_id AND g.storage_permanent=1 AND g.retention='available')`).bind(new Date().toISOString()).run();
  return {checked:refs.length};
}
