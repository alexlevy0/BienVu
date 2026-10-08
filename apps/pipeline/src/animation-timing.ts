import {VideoManifest,videoPhotoTimeline,selectedAnimationIndices,editorClipStarts,runwayDurationForFrames,
  type NormalizedListing,type VideoCustomization} from '@bienvu/contracts';
import type {Database} from '@bienvu/db';

type PhotoTimeline=NonNullable<VideoManifest['photoTimeline']>;
export async function findAnimationTiming(db:Database,agencyId:string,jobId:string):Promise<PhotoTimeline|null>{
  const row=await db.prepare('SELECT photo_timeline_json AS timeline FROM generation_animation_timing WHERE agency_id=? AND job_id=?')
    .bind(agencyId,jobId).first<{timeline:string}>();
  return row?VideoManifest.shape.photoTimeline.unwrap().parse(JSON.parse(row.timeline)):null;
}

// Freeze visual timing before any paid submission. A failed animation falls
// back to its photo in the same slot, without changing the other paid shots.
export async function prepareAnimationTiming(db:Database,agencyId:string,jobId:string,photos:NormalizedListing['photos'],
  totalFrames:number,settings?:VideoCustomization){
  const existing=await findAnimationTiming(db,agencyId,jobId);if(existing)return existing;
  // Already-submitted legacy jobs retain their five-second policy on replay.
  const legacy=await db.prepare('SELECT 1 FROM photo_animations WHERE agency_id=? AND job_id=? LIMIT 1').bind(agencyId,jobId).first();
  if(legacy)return findAnimationTiming(db,agencyId,jobId);
  const selected=selectedAnimationIndices(settings?.photoOrder??photos.map(p=>p.sourceOrder),settings).map(i=>photos[i].id);
  const timeline=videoPhotoTimeline(photos,totalFrames,selected,(settings?.map?.durationSeconds??0)*30);
  await db.prepare(`INSERT INTO generation_animation_timing(job_id,agency_id,version,photo_timeline_json,created_at)
    SELECT ?,?,1,?,? WHERE NOT EXISTS(SELECT 1 FROM photo_animations WHERE job_id=?) ON CONFLICT(job_id) DO NOTHING`)
    .bind(jobId,agencyId,JSON.stringify(timeline),new Date().toISOString(),jobId).run();
  return findAnimationTiming(db,agencyId,jobId);
}

export function plannedAnimationSeconds(timeline:PhotoTimeline,photoId:string,sourceSlot:number,settings?:VideoCustomization){
  // A split editor photo starts its source again for each occurrence: use the
  // longest visible occurrence, rather than adding their durations together.
  const frames=settings?.editor?Math.max(...editorClipStarts(settings.editor,settings.map)
    .filter(c=>c.photoSlot===sourceSlot).map(c=>c.durationFrames)):
    timeline.find(p=>p.photoAssetId===photoId)?.durationFrames;
  if(frames===undefined||!Number.isFinite(frames))throw Error('RUNWAY_SCOPE_INVALID');
  return runwayDurationForFrames(frames);
}
