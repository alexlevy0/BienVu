import {AgencyBrand, EntityId, Timestamp, GeneratableListing, GenerationRequest, GenerationView, publicErrors, type PublicErrorCode,type NormalizedListing} from '@bienvu/contracts';
import type {Database} from './index';
import {findImport} from './imports';

export class GenerationFailure extends Error {constructor(public code:PublicErrorCode){super(code);}}
export type GenerationRow={jobId:string;agencyId:string;inputHash:string;input:string;brand:string;deadline:string;expiresAt:string;
  status:GenerationView['status'];stage:GenerationView['stage'];attempt:number;errorCode:string|null;createdAt:string;updatedAt:string;
  workflowId:string;listingId:string|null;objectKey:string|null;report:string|null;launchStatus:string;title:string};
const columns=`g.job_id AS jobId,g.agency_id AS agencyId,g.input_hash AS inputHash,g.input_json AS input,g.brand_json AS brand,
  g.deadline,g.expires_at AS expiresAt,j.status,j.stage,j.attempt,j.error_code AS errorCode,j.created_at AS createdAt,j.updated_at AS updatedAt,
  j.workflow_id AS workflowId,j.listing_id AS listingId,a.object_key AS objectKey,a.report_json AS report,l.status AS launchStatus,
  coalesce(json_extract(i.result_json,'$.facts.title.value'),'Votre annonce') AS title`;
const joins=`FROM generation_runs g JOIN jobs j ON j.id=g.job_id JOIN job_launch_intents l ON l.job_id=j.id
  LEFT JOIN generation_artifacts a ON a.job_id=j.id LEFT JOIN listing_imports i ON i.id=j.listing_id AND i.agency_id=j.agency_id`;
export async function findGeneration(db:Database,agencyId:string,jobId:string){
  EntityId.parse(agencyId);EntityId.parse(jobId);
  return db.prepare(`SELECT ${columns} ${joins} WHERE g.agency_id=? AND g.job_id=?`).bind(agencyId,jobId).first<GenerationRow>();
}
export function generationView(row:GenerationRow,now=Date.now()):GenerationView {
  const available=row.status==='ready'&&Boolean(row.objectKey)&&row.expiresAt>new Date(now).toISOString();
  return GenerationView.parse({id:row.jobId,status:row.status,stage:row.stage,attempt:row.attempt,
    errorCode:row.errorCode&&row.errorCode in publicErrors?row.errorCode:row.errorCode?'GENERATION_FAILED':null,
    createdAt:row.createdAt,updatedAt:row.updatedAt,expiresAt:row.expiresAt,title:row.title,
    videoUrl:available?`/api/generations/${row.jobId}/video`:null,downloadUrl:available?`/api/generations/${row.jobId}/video?download=1`:null,
    syntheticVoice:true,retryAllowed:row.status==='queued'&&row.launchStatus==='pending'});
}
export async function generationRights(db:Database,agencyId:string,flag:string|undefined,now=Date.now()) {
  const at=new Date(now).toISOString();
  const row=await db.prepare(`SELECT max(0,a.quota_limit-a.reserved-a.consumed) AS remaining,
    (g.enabled=1 AND c.enabled=1 AND b.paused=0 AND a.valid_from<=? AND a.valid_until>?) AS enabled
    FROM generation_access g JOIN allocations a ON a.id=g.allocation_id AND a.agency_id=g.agency_id
    JOIN generation_control c ON c.id='generations' JOIN hosted_import_budget b ON b.month=? WHERE g.agency_id=?`)
    .bind(at,at,at.slice(0,7),agencyId).first<{remaining:number;enabled:number}>();
  const usage=await db.prepare("SELECT coalesce(sum(attempts),0) AS month,coalesce(sum(IIF(day=?,attempts,0)),0) AS day FROM import_usage WHERE substr(day,1,7)=?")
    .bind(at.slice(0,10),at.slice(0,7)).first<{month:number;day:number}>();
  const nextDay=new Date(at.slice(0,10)+'T00:00:00Z').getTime()+86400_000;
  const nextMonth=Date.UTC(new Date(now).getUTCFullYear(),new Date(now).getUTCMonth()+1,1);
  const importRetryAt=usage&&usage.month>=30?new Date(nextMonth).toISOString():usage&&usage.day>=10?new Date(nextDay).toISOString():null;
  return {generationEnabled:flag==='true'&&row?.enabled===1,developmentRemaining:row?.remaining??0,importRetryAt};
}
export async function admitGeneration(db:Database,agencyId:string,key:string,input:unknown,flag:string|undefined,now=Date.now(),verifyPhotos?:(listing:NormalizedListing)=>Promise<void>) {
  const parsed=GenerationRequest.safeParse(input);
  if(!parsed.success||!/^[a-zA-Z0-9_-]{16,128}$/.test(key))throw new GenerationFailure('VALIDATION_ERROR');
  const body=JSON.stringify(parsed.data),hash=[...new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(body)))].map(x=>x.toString(16).padStart(2,'0')).join('');
  const previous=await db.prepare('SELECT job_id AS id,input_hash AS hash FROM generation_runs WHERE agency_id=? AND idempotency_key=?')
    .bind(agencyId,key).first<{id:string;hash:string}>();
  if(previous){if(previous.hash!==hash)throw new GenerationFailure('CONFLICT');return (await findGeneration(db,agencyId,previous.id))!;}
  if(flag!=='true')throw new GenerationFailure('GENERATIONS_PAUSED');
  if('url' in parsed.data&&(await generationRights(db,agencyId,flag,now)).importRetryAt)throw new GenerationFailure('IMPORT_LIMIT');
  let saved:NormalizedListing|undefined;
  if('listingId' in parsed.data){const row=await findImport(db,agencyId,parsed.data.listingId);
    if(!row||row.status!=='ready'||row.expiresAt<=new Date(now+600_000).toISOString()||!row.result)throw new GenerationFailure('NOT_FOUND');
    saved=GeneratableListing.parse(JSON.parse(row.result));if(saved.agencyId!==agencyId||saved.id!==parsed.data.listingId)throw new GenerationFailure('NOT_FOUND');}
  const brandRow=await db.prepare(`SELECT id,owner_user_id AS ownerUserId,name,logo_asset_id AS logoAssetId,primary_color AS primaryColor,
    secondary_color AS secondaryColor,phone,email,website,created_at AS createdAt FROM agencies WHERE id=?`).bind(agencyId).first();
  const brand=AgencyBrand.safeParse(brandRow);if(!brand.success)throw new GenerationFailure('VALIDATION_ERROR');
  const grant=await db.prepare('SELECT allocation_id AS id FROM generation_access WHERE agency_id=?').bind(agencyId).first<{id:string}>();
  if(!grant)throw new GenerationFailure('QUOTA_EXHAUSTED');
  if(saved&&verifyPhotos)await verifyPhotos(saved);
  const id=crypto.randomUUID(),at=new Date(now).toISOString();
  try {await db.prepare(`INSERT INTO generation_runs(job_id,agency_id,allocation_id,reservation_id,idempotency_key,input_hash,input_json,brand_json,
    created_at,deadline,expires_at,month) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)`)
    .bind(id,agencyId,grant.id,crypto.randomUUID(),key,hash,body,JSON.stringify(brand.data),at,new Date(now+900_000).toISOString(),
      new Date(now+7*86400_000).toISOString(),at.slice(0,7)).run();
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
export async function listGenerations(db:Database,agencyId:string,before?:string){
  let time='9999',id='~';
  if(before){try{const parts=JSON.parse(atob(before));if(!Array.isArray(parts)||parts.length!==2||typeof parts[0]!=='string'||!/^\d{4}-/.test(parts[0]))throw 0;
    time=Timestamp.parse(parts[0]);id=EntityId.parse(parts[1]);}catch{throw new GenerationFailure('VALIDATION_ERROR');}}
  const result=await db.prepare(`SELECT json_group_array(json(record)) AS data FROM
    (SELECT json_object('id',g.job_id) AS record ${joins} WHERE g.agency_id=? AND (j.created_at<? OR (j.created_at=? AND j.id<?))
    ORDER BY j.created_at DESC,j.id DESC LIMIT 21)`).bind(agencyId,time,time,id).first<{data:string}>();
  const refs=JSON.parse(result?.data??'[]') as {id:string}[], rows=[];
  for(const ref of refs.slice(0,20))rows.push((await findGeneration(db,agencyId,ref.id))!);
  const last=rows.at(-1);return {jobs:rows.map(row=>generationView(row)),nextCursor:refs.length>20&&last?btoa(JSON.stringify([last.createdAt,last.jobId])):null};
}
export async function setGenerationStage(db:Database,row:GenerationRow,stage:GenerationView['stage']){
  await db.prepare(`UPDATE jobs SET status=?,stage=?,updated_at=? WHERE id=? AND agency_id=? AND status NOT IN ('ready','failed')`)
    .bind(stage,stage,new Date().toISOString(),row.jobId,row.agencyId).run();
}
export async function failGeneration(db:Database,row:GenerationRow,code:string){
  await db.prepare(`UPDATE jobs SET status='failed',error_code=?,lease_until=NULL,updated_at=? WHERE id=? AND agency_id=? AND status NOT IN ('ready','failed')`)
    .bind(code,new Date().toISOString(),row.jobId,row.agencyId).run();
}
