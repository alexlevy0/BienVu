import {AgencyBrand,EntityId,Timestamp,GenerationRequest,sourceForHost,sourceListingId,publicErrors,type PublicErrorCode} from '@bienvu/contracts';
import type {Database} from './index';
import {creditGrant} from './credits';
import {findGeneration,findOwnedGeneration,GenerationFailure,type GenerationRow} from './generation';
export const opaqueHash=async(value:string)=>[...new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value)))].map(n=>n.toString(16).padStart(2,'0')).join('');
export type TrialPolicy={enabled:number;free_enabled:number;free_monthly:number;session_days:number;successes:number;session_daily:number;ip_daily:number;global_daily:number;global_monthly:number;render_concurrency:number;retention_hours:number;active_minutes:number;preview_provision_cents:number;budget_ceiling_cents:number};
export const trialPolicy=async(db:Database)=>(await db.prepare('SELECT * FROM trial_policy WHERE id=1').first<TrialPolicy>())!;
export type AnonymousSession={id:string;scopeId:string;expiresAt:string;successes:number};
export async function anonymousSession(db:Database,proof:string|undefined,now=Date.now()) {
  if(!proof||!/^[-_a-zA-Z0-9]{43}$/.test(proof))return null;
  return db.prepare(`SELECT id,scope_id AS scopeId,expires_at AS expiresAt,successes FROM anonymous_sessions WHERE proof_hash=? AND expires_at>?`)
    .bind(await opaqueHash(proof),new Date(now).toISOString()).first<AnonymousSession>();
}
export async function createAnonymousSession(db:Database,now=Date.now()) {
  const bytes=crypto.getRandomValues(new Uint8Array(32)),proof=btoa(String.fromCharCode(...bytes)).replaceAll('+','-').replaceAll('/','_').replaceAll('=','');
  const policy=await trialPolicy(db),id=crypto.randomUUID(),scopeId=crypto.randomUUID(),at=new Date(now).toISOString(),expiresAt=new Date(now+policy.session_days*86400_000).toISOString();
  await db.prepare('INSERT INTO anonymous_sessions(id,proof_hash,scope_id,created_at,expires_at) VALUES(?,?,?,?,?)').bind(id,await opaqueHash(proof),scopeId,at,expiresAt).run();
  return {session:{id,scopeId,expiresAt,successes:0},proof};
}
export async function trialForSession(db:Database,session:AnonymousSession,id?:string) {
  const ref=await db.prepare(`SELECT job_id AS id FROM generation_runs WHERE anonymous_session_id=? ${id?'AND job_id=?':''} ORDER BY created_at DESC,job_id DESC LIMIT 1`)
    .bind(session.id,...(id?[id]:[])).first<{id:string}>();
  return ref?findGeneration(db,session.scopeId,ref.id):null;
}
export async function listAnonymousGenerations(db:Database,session:AnonymousSession) {
  return (await listAnonymousGenerationPage(db,session)).rows;
}
export async function listAnonymousGenerationPage(db:Database,session:AnonymousSession,cursor?:string){
  let time='9999',id='~';
  if(cursor){try{if(cursor.length>512)throw 0;const parts=JSON.parse(atob(cursor));
    if(!Array.isArray(parts)||parts.length!==2)throw 0;time=Timestamp.parse(parts[0]);id=EntityId.parse(parts[1]);
  }catch{throw new GenerationFailure('VALIDATION_ERROR');}}
  const refs=await db.prepare(`SELECT json_group_array(json_object('id',job_id,'at',created_at)) AS ids FROM
    (SELECT job_id,created_at FROM generation_runs WHERE anonymous_session_id=? AND agency_id=? AND owner_agency_id IS NULL
      AND (created_at<? OR (created_at=? AND job_id<?)) ORDER BY created_at DESC,job_id DESC LIMIT 31)`)
    .bind(session.id,session.scopeId,time,time,id).first<{ids:string}>();
  const data=JSON.parse(refs?.ids??'[]') as {id:string;at:string}[],page=data.slice(0,30),last=page.at(-1);
  const rows=await Promise.all(page.map(ref=>findGeneration(db,session.scopeId,ref.id)));
  // Recheck ownership in case a claim completed between the list and the reads.
  return {rows:rows.filter((row):row is GenerationRow=>Boolean(row&&row.anonymousSessionId===session.id&&!row.ownerAgencyId)),
    nextCursor:data.length>30&&last?btoa(JSON.stringify([last.at,last.id])):null};
}
export function trialInput(input:unknown) {
  const parsed=GenerationRequest.safeParse(input);
  if(!parsed.success||!('url' in parsed.data))throw new GenerationFailure('INVALID_URL');
  const url=new URL(parsed.data.url),source=sourceForHost(url.hostname);
  // The anonymous pilot never falls back to a generic arbitrary-host importer.
  if(!source||!['espaces-atypiques','orpi','century21'].includes(source.id))throw new GenerationFailure('TRIAL_SOURCE_UNSUPPORTED');
  if(!sourceListingId(source,url.pathname))throw new GenerationFailure('NOT_A_LISTING');
  return parsed.data;
}
export async function priorTrial(db:Database,session:AnonymousSession,key:string,input:unknown) {
  if(!/^[a-zA-Z0-9_-]{16,128}$/.test(key))throw new GenerationFailure('VALIDATION_ERROR');
  const body=JSON.stringify(trialInput(input)),hash=await opaqueHash(body);
  const old=await db.prepare('SELECT job_id AS id,input_hash AS hash FROM generation_runs WHERE anonymous_session_id=? AND idempotency_key=?').bind(session.id,key).first<{id:string;hash:string}>();
  if(old&&old.hash!==hash)throw new GenerationFailure('CONFLICT');
  return {body,hash,row:old?await findGeneration(db,session.scopeId,old.id):null};
}
export async function admitAnonymous(db:Database,session:AnonymousSession,key:string,input:unknown,proof:{ipHmac:string;turnstileHash:string},flag:string|undefined,now=Date.now()):Promise<GenerationRow> {
  const old=await priorTrial(db,session,key,input);if(old.row)return old.row;
  if(flag!=='true')throw new GenerationFailure('ANONYMOUS_UNAVAILABLE');
  const policy=await trialPolicy(db),id=crypto.randomUUID(),at=new Date(now).toISOString(),deadline=new Date(now+policy.active_minutes*60_000).toISOString();
  const brand=AgencyBrand.parse({id:session.scopeId,ownerUserId:session.id,name:'BienVu',neutral:true,logoAssetId:null,
    primaryColor:'#E1E8D9',secondaryColor:'#171714',phone:null,email:null,website:null,createdAt:at});
  try {await db.prepare(`INSERT INTO generation_runs(job_id,agency_id,allocation_id,reservation_id,idempotency_key,input_hash,input_json,brand_json,created_at,deadline,expires_at,month,
    anonymous_session_id,ip_hmac,turnstile_hash,preview_provision_cents) VALUES(?,?,'unfunded',?,?,?,?,?,?,?,?,?,?,?,?,?)`)
    .bind(id,session.scopeId,crypto.randomUUID(),key,old.hash,old.body,JSON.stringify(brand),at,deadline,deadline,at.slice(0,7),session.id,proof.ipHmac,proof.turnstileHash,policy.preview_provision_cents).run();
  }catch(error){const winner=await priorTrial(db,session,key,input);if(winner.row)return winner.row;
    const message=error instanceof Error?error.message:'';
    const code=Object.keys(publicErrors).find(code=>message.includes(code)) as PublicErrorCode|undefined;
    if(code)throw new GenerationFailure(code);if(message.includes('turnstile_hash'))throw new GenerationFailure('BOT_VERIFICATION_FAILED');throw error;}
  return (await findGeneration(db,session.scopeId,id))!;
}
export async function claimTrial(db:Database,session:AnonymousSession,agencyId:string,jobId:string,now=Date.now()) {
  const row=await trialForSession(db,session,jobId),at=new Date(now).toISOString();
  if(!row)throw new GenerationFailure('NOT_FOUND');
  if(row.ownerAgencyId&&row.ownerAgencyId!==agencyId)throw new GenerationFailure('FORBIDDEN');
  if(row.retention!=='available'||row.expiresAt<=at)throw new GenerationFailure('TRIAL_EXPIRED');
  const grant=await creditGrant(db,agencyId,now);
  // Claimed trials survive at least seven days beyond the current credit period,
  // so an exhausted free account can unlock at renewal without a new render.
  // One statement with triggers: ownership, credit, expiry extension and event.
  // A lost response replays this statement and sees the same reservation.
  await db.prepare(`UPDATE generation_runs SET owner_agency_id=?,claimed_at=?,funding_candidate=?,expires_at=?
    WHERE job_id=? AND anonymous_session_id=? AND (owner_agency_id IS NULL OR owner_agency_id=?) AND retention='available' AND expires_at>?`)
    .bind(agencyId,at,grant&&(grant.kind==='free'||grant.enabled===1)?grant.id:null,row.ownerAgencyId?row.expiresAt:new Date(Math.max(now,grant?Date.parse(grant.renewalAt):now)+7*86400_000).toISOString(),jobId,session.id,agencyId,at).run();
  const owned=await findOwnedGeneration(db,agencyId,jobId);
  if(!owned)throw new GenerationFailure('TRIAL_EXPIRED');return owned;
}
export async function fundOwnedTrial(db:Database,agencyId:string,jobId:string,now=Date.now()) {
  const row=await findOwnedGeneration(db,agencyId,jobId);if(!row)throw new GenerationFailure('NOT_FOUND');
  if(row.retention!=='available'||row.expiresAt<=new Date(now).toISOString())throw new GenerationFailure('TRIAL_EXPIRED');
  if(row.anonymousSessionId&&row.creditStatus==='unfunded') {
    const grant=await creditGrant(db,agencyId,now);
    await db.prepare(`UPDATE generation_runs SET funding_candidate=?,claimed_at=? WHERE job_id=? AND owner_agency_id=? AND retention='available'`)
      .bind(grant&&(grant.kind==='free'||grant.enabled===1)?grant.id:null,new Date(now).toISOString(),jobId,agencyId).run();
  }
  return (await findOwnedGeneration(db,agencyId,jobId))!;
}
export async function generationEvent(db:Database,job:string,event:'login'|'download') {
  await db.prepare('INSERT OR IGNORE INTO generation_events(job_id,event,created_at) VALUES(?,?,?)').bind(job,event,new Date().toISOString()).run();
}
