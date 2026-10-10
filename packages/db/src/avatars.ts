import {AvatarSettings,AvatarLook,AvatarAdmission,AvatarCatalog,AvatarGallery,AvatarGalleryQuery,DEFAULT_AVATAR_SETTINGS,avatarCreditCost,type AvatarCustomization} from '@bienvu/contracts';
import type {Database} from './index';

export async function avatarSettings(db:Database){
  const row=await db.prepare('SELECT settings_json AS settings,revision FROM avatar_settings WHERE id=1').first<{settings:string;revision:number}>();
  return {settings:AvatarSettings.parse(row?JSON.parse(row.settings):DEFAULT_AVATAR_SETTINGS),revision:row?.revision??1};
}
export async function avatarLooks(db:Database,enabledOnly=false){
  const row=await db.prepare(`SELECT json_group_array(json(look_json)) AS data FROM (SELECT look_json FROM avatar_looks ${enabledOnly?'WHERE enabled=1':''} ORDER BY id LIMIT 5000)`).first<{data:string}>();
  return (JSON.parse(row?.data??'[]') as unknown[]).map(value=>AvatarLook.parse(value));
}
// A public gallery request reads only one page; provider URLs and private looks
// never enter its response. Stable ordering keeps pagination deterministic.
export async function avatarGallery(db:Database,input:AvatarGalleryQuery){
  const {query,gender,offset}=AvatarGalleryQuery.parse(input),{settings}=await avatarSettings(db);
  const where=`enabled=1 AND json_extract(look_json,'$.ownership')='public'
    AND EXISTS(SELECT 1 FROM json_each(look_json,'$.engines') WHERE value='avatar_iii' OR (?=1 AND value='avatar_iv'))
    AND (?='all' OR json_extract(look_json,'$.gender')=?) AND json_extract(look_json,'$.name') LIKE ? ESCAPE '\\'`;
  const params=[settings.allowPremium?1:0,gender,gender,'%'+query.replace(/[\\%_]/g,'\\$&')+'%'];
  const [count,row]=await Promise.all([
    db.prepare(`SELECT count(*) AS total FROM avatar_looks WHERE ${where}`).bind(...params).first<{total:number}>(),
    db.prepare(`SELECT json_group_array(json(look_json)) AS data FROM (SELECT look_json FROM avatar_looks WHERE ${where}
      ORDER BY (id=?) DESC,json_extract(look_json,'$.name') COLLATE NOCASE,id LIMIT 32 OFFSET ?)`).bind(...params,settings.defaultLookId,offset).first<{data:string}>()
  ]);
  const looks=JSON.parse(row?.data??'[]');
  return AvatarGallery.parse({looks,total:count?.total??0,offset,hasMore:offset+looks.length<(count?.total??0)});
}
export async function avatarCatalog(db:Database){const {settings}=await avatarSettings(db);
  const looks=(await avatarLooks(db,true)).filter(look=>look.ownership==='public'&&(look.engines.includes('avatar_iii')||settings.allowPremium&&look.engines.includes('avatar_iv')))
    .sort((a,b)=>Number(b.id===settings.defaultLookId)-Number(a.id===settings.defaultLookId)||a.name.localeCompare(b.name,'fr'));
  return AvatarCatalog.parse({enabled:settings.enabled,allowPremium:settings.allowPremium,maxSeconds:settings.maxSeconds,
    defaultLookId:looks.some(look=>look.id===settings.defaultLookId)?settings.defaultLookId:null,looks});
}
export async function findAvatarLook(db:Database,id:string){
  const row=await db.prepare('SELECT look_json AS look,source_json AS source FROM avatar_looks WHERE id=?').bind(id).first<{look:string;source:string}>();
  return row?{look:AvatarLook.parse(JSON.parse(row.look)),source:JSON.parse(row.source) as {image:string|null;video:string|null}}:null;
}
export async function saveAvatarLook(db:Database,actor:string,look:AvatarLook,source:{image:string|null;video:string|null}){
  const selected=AvatarLook.parse(look),at=new Date().toISOString();
  await db.prepare(`INSERT INTO avatar_looks(id,look_json,source_json,enabled,updated_at) VALUES(?,?,?,?,?)
    ON CONFLICT(id) DO UPDATE SET look_json=excluded.look_json,source_json=excluded.source_json,enabled=excluded.enabled,revision=revision+1,updated_at=excluded.updated_at`)
    .bind(selected.id,JSON.stringify(selected),JSON.stringify(source),selected.enabled?1:0,at).run();
  await db.prepare('INSERT INTO avatar_audit VALUES(?,?,?,?,?,?)').bind(crypto.randomUUID(),actor,'look_updated',selected.id,JSON.stringify({enabled:selected.enabled,gender:selected.gender,transparentVerified:selected.transparentVerified}),at).run();
}
export async function setAvatarSettings(db:Database,actor:string,input:unknown,revision:number){
  const settings=AvatarSettings.parse(input),at=new Date().toISOString();
  if(settings.defaultLookId){const look=await findAvatarLook(db,settings.defaultLookId);if(!look?.look.enabled)throw Error('AVATAR_UNAVAILABLE');}
  await db.prepare('INSERT INTO avatar_setting_events(id,actor_id,settings_json,expected_revision,created_at) VALUES(?,?,?,?,?)')
    .bind(crypto.randomUUID(),actor,JSON.stringify(settings),revision,at).run();return avatarSettings(db);
}
// This frozen server snapshot is separate from the browser's idempotency hash.
export async function admitAvatar(db:Database,avatar:AvatarCustomization|undefined,voice:string,voiceEnabled:boolean){
  if(!avatarCreditCost(avatar))return null;
  const {settings}=await avatarSettings(db),stored=await findAvatarLook(db,avatar!.lookId);
  if(!settings.enabled||!stored?.look.enabled||stored.look.ownership!=='public'||!stored.look.engines.includes(avatar!.engine)
    ||avatar!.engine==='avatar_iv'&&!settings.allowPremium||avatar!.moments!=='full'&&avatar!.maxSeconds>settings.maxSeconds
    ||avatar!.appearance==='cutout'&&!stored.look.transparentVerified||!voiceEnabled)throw Error('AVATAR_UNAVAILABLE');
  return JSON.stringify(AvatarAdmission.parse({settings,look:stored.look,voice}));
}
export type AvatarTask={id:string;agencyId:string;jobId:string;moment:'intro'|'outro'|'full';cacheKey:string;audio:string;startFrame:number;
  state:'claimed'|'submitting'|'submitted'|'ready'|'failed'|'uncertain';providerId:string|null;audioAssetId:string|null;engine:'avatar_iii'|'avatar_iv';
  mode:'real'|'mock';reused:number;reservedMicros:number;result:string|null;errorCode:string|null;createdAt:string};
const taskColumns=`id,agency_id AS agencyId,job_id AS jobId,moment,cache_key AS cacheKey,audio_json AS audio,start_frame AS startFrame,
  state,provider_id AS providerId,audio_asset_id AS audioAssetId,engine,mode,reused,reserved_micros AS reservedMicros,result_json AS result,error_code AS errorCode,created_at AS createdAt`;
export async function jobAvatarTasks(db:Database,agencyId:string,jobId:string){
  const row=await db.prepare(`SELECT json_group_array(json(record)) AS data FROM (SELECT json_object(
    'id',id,'agencyId',agency_id,'jobId',job_id,'moment',moment,'cacheKey',cache_key,'audio',audio_json,'startFrame',start_frame,
    'state',state,'providerId',provider_id,'audioAssetId',audio_asset_id,'engine',engine,'mode',mode,'reused',reused,'reservedMicros',reserved_micros,
    'result',result_json,'errorCode',error_code,'createdAt',created_at) AS record FROM avatar_tasks WHERE agency_id=? AND job_id=? ORDER BY start_frame)`)
    .bind(agencyId,jobId).first<{data:string}>();return JSON.parse(row?.data??'[]') as AvatarTask[];
}
export async function findAvatarTask(db:Database,agency:string,job:string,moment:string){
  return db.prepare(`SELECT ${taskColumns} FROM avatar_tasks WHERE agency_id=? AND job_id=? AND moment=?`).bind(agency,job,moment).first<AvatarTask>();
}
export async function avatarUsage(db:Database,month=new Date().toISOString().slice(0,7)){
  const row=await db.prepare(`SELECT coalesce(sum(reserved_micros),0)/1000000.0 AS reservedUsd,
    coalesce(sum(state='ready'),0) AS ready,coalesce(sum(reused=1),0) AS reused,
    coalesce(sum(state IN ('claimed','submitting','submitted')),0) AS active,coalesce(sum(state='uncertain'),0) AS uncertain
    FROM avatar_tasks WHERE mode='real' AND substr(created_at,1,7)=?`).bind(month).first<Record<string,number>>();
  return {month,reservedUsd:row?.reservedUsd??0,ready:row?.ready??0,reused:row?.reused??0,active:row?.active??0,uncertain:row?.uncertain??0};
}
export async function recentAvatarTasks(db:Database){
  const row=await db.prepare(`SELECT json_group_array(json(record)) AS data FROM (SELECT json_object('id',id,'jobId',job_id,'moment',moment,
    'engine',engine,'state',state,'reused',reused,'estimatedUsd',reserved_micros/1000000.0,'error',error_code,'createdAt',created_at) AS record
    FROM avatar_tasks ORDER BY created_at DESC LIMIT 100)`).first<{data:string}>();
  return (JSON.parse(row?.data??'[]') as {reused:number}[]).map(task=>({...task,reused:task.reused===1}));
}
