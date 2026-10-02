import {AgencyBrand, EntityId, Timestamp, GeneratableListing, GenerationRequest, GenerationView, VideoReport, VideoAsset, publicErrors,customizedListing,generationCreditCost,requestedAnimations,CREDIT_PRICING_VERSION,selectedAnimationIndices, type PublicErrorCode,type NormalizedListing} from '@bienvu/contracts';
import type {Database} from './index';
import {creditGrant,creditBalance} from './credits';
import {findImport} from './imports';
import {findEditorVoiceSource} from './editor-voice';

export class GenerationFailure extends Error {constructor(public code:PublicErrorCode){super(code);}}
export type GenerationRow={ownerAgencyId:string|null;anonymousSessionId:string|null;retention:'available'|'expiring'|'expired';creditStatus:'unfunded'|'reserved'|'consumed'|'released';previewKey:string|null;previewReport:string|null;jobId:string;agencyId:string;inputHash:string;input:string;brand:string;deadline:string;expiresAt:string;
  status:GenerationView['status'];stage:GenerationView['stage'];progressPercent:number;attempt:number;errorCode:string|null;narrationErrorCode?:string|null;createdAt:string;updatedAt:string;sourceKind:'url'|'manual'|null;
  workflowId:string;listingId:string|null;objectKey:string|null;report:string|null;launchStatus:string;title:string;locality:string|null;
  creditVersion?:number;creditsReserved?:number;creditsUsed?:number;animationsRequested?:number};
const columns=`g.owner_agency_id AS ownerAgencyId,g.anonymous_session_id AS anonymousSessionId,g.retention,r.status AS creditStatus,p.object_key AS previewKey,p.report_json AS previewReport,g.job_id AS jobId,g.agency_id AS agencyId,g.input_hash AS inputHash,g.input_json AS input,g.brand_json AS brand,
  g.deadline,g.expires_at AS expiresAt,j.status,j.stage,j.progress_percent AS progressPercent,j.attempt,j.error_code AS errorCode,n.error_code AS narrationErrorCode,j.created_at AS createdAt,j.updated_at AS updatedAt,
  j.workflow_id AS workflowId,j.listing_id AS listingId,a.object_key AS objectKey,a.report_json AS report,l.status AS launchStatus,
  coalesce(json_extract(i.result_json,'$.facts.title.value'),'Votre annonce') AS title,
  json_extract(i.result_json,'$.facts.locality.value') AS locality,
  CASE WHEN json_type(g.input_json,'$.url') IS NOT NULL THEN 'url' ELSE i.source_kind END AS sourceKind,
  g.credit_version AS creditVersion,r.credit_amount AS creditsReserved,r.credit_used AS creditsUsed,g.animations_requested AS animationsRequested`;
const joins=`FROM generation_runs g JOIN jobs j ON j.id=g.job_id JOIN job_launch_intents l ON l.job_id=j.id
  JOIN reservations r ON r.job_id=j.id LEFT JOIN narration_runs n ON n.job_id=j.id AND n.agency_id=j.agency_id
  LEFT JOIN generation_previews p ON p.job_id=j.id LEFT JOIN generation_artifacts a ON a.job_id=j.id LEFT JOIN listing_imports i ON i.id=j.listing_id AND i.agency_id=j.agency_id`;
export async function findGeneration(db:Database,agencyId:string,jobId:string){
  EntityId.parse(agencyId);EntityId.parse(jobId);
  return db.prepare(`SELECT ${columns} ${joins} WHERE g.agency_id=? AND g.job_id=?`).bind(agencyId,jobId).first<GenerationRow>();
}
export async function findOwnedGeneration(db:Database,agencyId:string,jobId:string){
  EntityId.parse(agencyId);EntityId.parse(jobId);
  return db.prepare(`SELECT ${columns} ${joins} WHERE g.owner_agency_id=? AND g.job_id=?`).bind(agencyId,jobId).first<GenerationRow>();
}
export function generationMasterUnlocked(row:GenerationRow){
  return Boolean(row.ownerAgencyId)&&(row.creditStatus==='consumed'||row.creditVersion===1&&Boolean(row.anonymousSessionId));
}
export function generationView(row:GenerationRow,now=Date.now(),audience:'owner'|'anonymous'='owner'):GenerationView {
  const available=row.retention==='available'&&row.status==='ready'&&Boolean(row.objectKey)&&row.expiresAt>new Date(now).toISOString();
  const gift=row.creditVersion===1&&Boolean(row.anonymousSessionId);
  const unlocked=audience==='owner'&&generationMasterUnlocked(row);
  const preview=available&&Boolean(row.previewKey);
  const errorCode=row.status==='failed'&&row.errorCode==='GENERATION_FAILED'&&row.narrationErrorCode==='SCRIPT_INVALID'
    ?row.narrationErrorCode:row.errorCode;
  return GenerationView.parse({ownership:row.ownerAgencyId?'owned':'anonymous',masterAccess:unlocked?'unlocked':row.creditStatus==='reserved'?'reserved':'locked',retention:row.retention,id:row.jobId,status:row.status,stage:row.stage,progressPercent:row.progressPercent,attempt:row.attempt,sourceKind:row.sourceKind,
    creditsReserved:row.creditsReserved??1,creditsUsed:gift?(row.status==='ready'?1:0):row.creditsUsed??0,
    creditsRefunded:['ready','failed'].includes(row.status)?Math.max(0,(row.creditsReserved??1)-(gift&&row.status==='ready'?1:row.creditsUsed??0)):0,
    animationsRequested:row.animationsRequested??0,animationsUsed:row.status==='ready'&&row.creditVersion===1?Math.max(0,(row.creditsUsed??0)-1):0,
    errorCode:errorCode&&errorCode in publicErrors?errorCode:errorCode?'GENERATION_FAILED':null,
    createdAt:row.createdAt,updatedAt:row.updatedAt,expiresAt:row.expiresAt,title:row.title,locality:row.locality,
    videoUrl:available&&unlocked?`/api/generations/${row.jobId}/video`:preview?audience==='anonymous'?`/api/trial/${row.jobId}/preview`:`/api/generations/${row.jobId}/preview`:null,downloadUrl:available&&unlocked?`/api/generations/${row.jobId}/video?download=1`:null,
    durationSeconds:row.report?VideoReport.parse(JSON.parse(row.report)).durationSeconds:null,
    aspectRatio:GenerationRequest.parse(JSON.parse(row.input)).aspectRatio??'9:16',
    syntheticVoice:GenerationRequest.parse(JSON.parse(row.input)).voiceEnabled!==false,retryAllowed:row.status==='queued'&&row.launchStatus==='pending'});
}
export async function generationRights(db:Database,agencyId:string,flag:string|undefined,now=Date.now()) {
  const at=new Date(now).toISOString();
  const grant=await creditGrant(db,agencyId,now);
  const gate=await db.prepare(`SELECT c.enabled FROM generation_control c JOIN hosted_import_budget b ON b.month=? WHERE c.id='generations' AND b.paused=0`).bind(at.slice(0,7)).first<{enabled:number}>();
  const usage=await db.prepare("SELECT coalesce(sum(attempts),0) AS month,coalesce(sum(IIF(day=?,attempts,0)),0) AS day FROM import_usage WHERE substr(day,1,7)=?")
    .bind(at.slice(0,10),at.slice(0,7)).first<{month:number;day:number}>();
  const nextDay=new Date(at.slice(0,10)+'T00:00:00Z').getTime()+86400_000;
  const nextMonth=Date.UTC(new Date(now).getUTCFullYear(),new Date(now).getUTCMonth()+1,1);
  const importRetryAt=usage&&usage.month>=60?new Date(nextMonth).toISOString():usage&&usage.day>=20?new Date(nextDay).toISOString():null;
  const balance=await creditBalance(db,agencyId,now);
  return {generationEnabled:flag==='true'&&grant?.enabled===1&&gate?.enabled===1,developmentRemaining:balance.available,creditReserved:balance.reserved,creditConsumed:balance.consumed,creditTotal:balance.total,renewalAt:grant?.renewalAt??null,creditKind:grant?.kind??null,importRetryAt};
}
export async function admitGeneration(db:Database,agencyId:string,key:string,input:unknown,flag:string|undefined,now=Date.now(),verifyPhotos?:(listing:NormalizedListing)=>Promise<void>) {
  const parsed=GenerationRequest.safeParse(input);
  if(!parsed.success||!/^[a-zA-Z0-9_-]{16,128}$/.test(key))throw new GenerationFailure('VALIDATION_ERROR');
  const body=JSON.stringify(parsed.data),hash=[...new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(body)))].map(x=>x.toString(16).padStart(2,'0')).join('');
  const previous=await db.prepare('SELECT job_id AS id,input_hash AS hash FROM generation_runs WHERE agency_id=? AND idempotency_key=?')
    .bind(agencyId,key).first<{id:string;hash:string}>();
  if(previous){if(previous.hash!==hash)throw new GenerationFailure('CONFLICT');return (await findGeneration(db,agencyId,previous.id))!;}
  if(flag!=='true')throw new GenerationFailure('GENERATIONS_PAUSED');
  const control=await db.prepare("SELECT enabled FROM generation_control WHERE id='generations'").first<{enabled:number}>();
  if(control?.enabled!==1)throw new GenerationFailure('GENERATIONS_PAUSED');
  if('url' in parsed.data&&(await generationRights(db,agencyId,flag,now)).importRetryAt)throw new GenerationFailure('IMPORT_LIMIT');
  let saved:NormalizedListing|undefined;
  if('listingId' in parsed.data){const row=await findImport(db,agencyId,parsed.data.listingId);
    if(!row||row.status!=='ready'||row.expiresAt<=new Date(now+600_000).toISOString()||!row.result)throw new GenerationFailure('NOT_FOUND');
    saved=GeneratableListing.parse(JSON.parse(row.result));if(saved.agencyId!==agencyId||saved.id!==parsed.data.listingId)throw new GenerationFailure('NOT_FOUND');
    try{saved=customizedListing(saved,parsed.data.customization);}catch{throw new GenerationFailure('VALIDATION_ERROR');}
    const voiceSourceId=parsed.data.customization?.voiceSourceId;
    if(voiceSourceId&&!await findEditorVoiceSource(db,agencyId,parsed.data.listingId,voiceSourceId))throw new GenerationFailure('VALIDATION_ERROR');
    const music=parsed.data.customization?.editor?.music;
    if(music){const stored=await db.prepare('SELECT asset_json AS asset FROM editor_music_assets WHERE id=? AND agency_id=? AND import_id=?')
      .bind(music.assetId,agencyId,parsed.data.listingId).first<{asset:string}>();
      const asset=stored?VideoAsset.safeParse(JSON.parse(stored.asset)):null;
      if(!asset?.success||asset.data.mime!=='audio/wav'||asset.data.durationMs!==music.durationMs||
        !asset.data.objectKey.startsWith(`agencies/${agencyId}/imports/${parsed.data.listingId}/music/`))throw new GenerationFailure('VALIDATION_ERROR');}}
  const brandRow=await db.prepare(`SELECT id,owner_user_id AS ownerUserId,name,logo_asset_id AS logoAssetId,primary_color AS primaryColor,
    secondary_color AS secondaryColor,phone,email,website,created_at AS createdAt FROM agencies WHERE id=?`).bind(agencyId).first();
  const brand=AgencyBrand.safeParse(brandRow);if(!brand.success)throw new GenerationFailure('VALIDATION_ERROR');
  const grant=await creditGrant(db,agencyId,now);
  const credits=generationCreditCost(parsed.data.customization),animations=requestedAnimations(parsed.data.customization);
  if(!grant||grant.remaining<credits)throw new GenerationFailure('QUOTA_EXHAUSTED');
  if(saved)try{selectedAnimationIndices((parsed.data.customization?.photoOrder??saved.photos.map(p=>p.sourceOrder)),parsed.data.customization);}catch{throw new GenerationFailure('VALIDATION_ERROR');}
  if(saved&&verifyPhotos)await verifyPhotos(saved);
  const id=crypto.randomUUID(),at=new Date(now).toISOString();
  try {await db.prepare(`INSERT INTO generation_runs(job_id,agency_id,allocation_id,reservation_id,idempotency_key,input_hash,input_json,brand_json,
    created_at,deadline,expires_at,month,credit_version,credits_total,animations_requested) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`)
    .bind(id,agencyId,grant.id,crypto.randomUUID(),key,hash,body,JSON.stringify(brand.data),at,new Date(now+900_000).toISOString(),
      new Date(now+7*86400_000).toISOString(),at.slice(0,7),CREDIT_PRICING_VERSION,credits,animations).run();
  }catch(error){
    // Une course sur la même clé doit converger, même si le trigger voit le slot occupé.
    const winner=await db.prepare('SELECT job_id AS id,input_hash AS hash FROM generation_runs WHERE agency_id=? AND idempotency_key=?')
      .bind(agencyId,key).first<{id:string;hash:string}>();
    if(winner){if(winner.hash!==hash)throw new GenerationFailure('CONFLICT');return (await findGeneration(db,agencyId,winner.id))!;}
    const message=error instanceof Error?error.message:'';
    const code=(['GENERATIONS_PAUSED','QUOTA_EXHAUSTED','GENERATION_BUSY','GENERATION_BUDGET_LIMIT'] as const).find(c=>message.includes(c));
    if(code)throw new GenerationFailure(code);throw error;
  }
  return (await findGeneration(db,agencyId,id))!;
}
// JSON aggregate keeps the portable DB port small; keyset pagination is tenant scoped.
export async function listGenerations(db:Database,agencyId:string,before?:string,
  filters:{query?:string;status?:'all'|'ready'|'active';sort?:'newest'|'oldest'}={}){
  const ascending=filters.sort==='oldest';
  let time=ascending?'0000':'9999',id=ascending?'':'~';
  if(before){try{const parts=JSON.parse(atob(before));if(!Array.isArray(parts)||parts.length!==2||typeof parts[0]!=='string'||!/^\d{4}-/.test(parts[0]))throw 0;
    time=Timestamp.parse(parts[0]);id=EntityId.parse(parts[1]);}catch{throw new GenerationFailure('VALIDATION_ERROR');}}
  const comparison=ascending?'>':'<',order=ascending?'ASC':'DESC';
  const query=filters.query?.trim()??'',status=filters.status??'all';
  const where=status==='ready'?" AND j.status='ready'":status==='active'?" AND j.status IN ('queued','importing','scripting','voicing','rendering','retry_wait')":'';
  const search=query?" AND instr(lower(coalesce(json_extract(i.result_json,'$.facts.title.value'),'Votre annonce')),lower(?))>0":'';
  const result=await db.prepare(`SELECT json_group_array(json(record)) AS data FROM
    (SELECT json_object('id',g.job_id) AS record ${joins} WHERE g.owner_agency_id=?
    AND (j.created_at${comparison}? OR (j.created_at=? AND j.id${comparison}?))${where}${search}
    ORDER BY j.created_at ${order},j.id ${order} LIMIT 21)`).bind(agencyId,time,time,id,...(query?[query]:[])).first<{data:string}>();
  const refs=JSON.parse(result?.data??'[]') as {id:string}[], rows=[];
  for(const ref of refs.slice(0,20))rows.push((await findOwnedGeneration(db,agencyId,ref.id))!);
  const last=rows.at(-1);return {jobs:rows.map(row=>generationView(row)),nextCursor:refs.length>20&&last?btoa(JSON.stringify([last.createdAt,last.jobId])):null};
}
export async function setGenerationStage(db:Database,row:GenerationRow,stage:GenerationView['stage']){
  await db.prepare(`UPDATE jobs SET status=?,stage=?,updated_at=? WHERE id=? AND agency_id=? AND status NOT IN ('ready','failed')`)
    .bind(stage,stage,new Date().toISOString(),row.jobId,row.agencyId).run();
}
export async function setGenerationProgress(db:Database,row:GenerationRow,percent:number){
  if(!Number.isInteger(percent)||percent<0||percent>99)return;
  await db.prepare(`UPDATE jobs SET progress_percent=?,updated_at=? WHERE id=? AND agency_id=? AND status='rendering' AND progress_percent<?`)
    .bind(percent,new Date().toISOString(),row.jobId,row.agencyId,percent).run();
}
export async function failGeneration(db:Database,row:GenerationRow,code:string){
  await db.prepare(`UPDATE jobs SET status='failed',error_code=?,lease_until=NULL,updated_at=? WHERE id=? AND agency_id=? AND status NOT IN ('ready','failed')`)
    .bind(code,new Date().toISOString(),row.jobId,row.agencyId).run();
}
