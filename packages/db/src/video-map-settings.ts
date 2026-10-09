import {AdminVideoMapSettings,DEFAULT_VIDEO_MAP,VideoMapDefaults,VideoMap,ConfirmedVideoMap,type GenerationRequest} from '@bienvu/contracts';
import type {Database} from './index';

export async function videoMapSettings(db:Database){
  const row=await db.prepare('SELECT settings_json AS settings,revision,updated_at AS updatedAt FROM video_map_settings WHERE id=1')
    .first<{settings:string;revision:number;updatedAt:string}>();
  return AdminVideoMapSettings.parse({settings:row?JSON.parse(row.settings):DEFAULT_VIDEO_MAP,revision:row?.revision??1,updatedAt:row?.updatedAt??null});
}
export async function setVideoMapSettings(db:Database,actorId:string,settings:unknown,revision:number,now=Date.now()){
  const selected=VideoMapDefaults.parse(settings);
  await db.prepare('INSERT INTO video_map_setting_events(id,actor_id,settings_json,expected_revision,created_at) VALUES(?,?,?,?,?)')
    .bind(crypto.randomUUID(),actorId,JSON.stringify(selected),revision,new Date(now).toISOString()).run();
  return videoMapSettings(db);
}
// Freeze the policy at admission, separately from the caller's idempotency hash.
// Existing editor timelines and explicitly chosen map locations keep their settings.
export async function generationMapDefault(db:Database,input:GenerationRequest):Promise<string|null>{
  const customization=input.customization;
  if(customization?.mapDisabled||customization?.editor||customization?.map?.location)return null;
  if(customization?.mapAutomatic&&customization.map)return JSON.stringify(VideoMap.parse(customization.map));
  if(customization?.map)return null;
  const {settings}=await videoMapSettings(db);if(!settings.enabled)return null;
  const {enabled:_enabled,...map}=settings;return JSON.stringify({...map,location:null});
}
export async function findDefaultGenerationMap(db:Database,agencyId:string,jobId:string){
  const row=await db.prepare('SELECT map_json AS map FROM generation_map_resolutions WHERE agency_id=? AND job_id=?')
    .bind(agencyId,jobId).first<{map:string|null}>();
  return row?.map?ConfirmedVideoMap.parse(JSON.parse(row.map)):null;
}
