import {AgencyBrand, EntityId, GeneratableListing, NarrationFailure, Sha256} from '@bienvu/contracts';
import type {Database} from './index';

export type NarrationRun = {jobId: string; agencyId: string; inputHash: string; configHash: string; snapshot: string;
  mode: 'real' | 'mock'; state: 'working' | 'prepared' | 'failed'; script: string | null; result: string | null; errorCode: string | null;
  lockId: string | null; lockUntil: string | null; jobAttempt: number; expiresAt: string};
const runColumns = `job_id AS jobId,agency_id AS agencyId,input_hash AS inputHash,config_hash AS configHash,snapshot_json AS snapshot,
  provider_mode AS mode,state,script_json AS script,result_json AS result,error_code AS errorCode,lock_id AS lockId,lock_until AS lockUntil,job_attempt AS jobAttempt,expires_at AS expiresAt`;
export type NarrationLease = {agencyId: string; jobId: string; token: string; attempt: number};
export type NarrationCall = {id: string; requestHash: string; state: 'pending' | 'done' | 'failed'; result: string | null; objectKey: string | null};

export async function narrationJobInput(db: Database, agencyId: string, jobId: string) {
  EntityId.parse(agencyId); EntityId.parse(jobId);
  const row = await db.prepare(`SELECT i.result_json AS listing,j.attempt FROM jobs j JOIN listing_imports i
    ON i.agency_id=j.agency_id AND i.id=j.listing_id WHERE j.agency_id=? AND j.id=? AND i.status='ready'
    AND j.status IN ('scripting','voicing','retry_wait') AND j.stage IN ('scripting','voicing')`)
    .bind(agencyId, jobId).first<{listing: string; attempt: number}>();
  if (!row) throw new NarrationFailure('NARRATION_NOT_FOUND');
  const brand = await db.prepare(`SELECT id,owner_user_id AS ownerUserId,name,logo_asset_id AS logoAssetId,primary_color AS primaryColor,
    secondary_color AS secondaryColor,phone,email,website,created_at AS createdAt FROM agencies WHERE id=?`).bind(agencyId).first();
  try {return {listing: GeneratableListing.parse(JSON.parse(row.listing)), brand: AgencyBrand.parse(await db.prepare('SELECT brand_json FROM generation_runs WHERE job_id=? AND anonymous_session_id IS NOT NULL').bind(jobId).first<{brand_json:string}>().then(row=>row?JSON.parse(row.brand_json):brand)), attempt: row.attempt};}
  catch {throw new NarrationFailure('SCRIPT_INPUT_INVALID');}
}
export async function findNarration(db: Database, agencyId: string, jobId: string): Promise<NarrationRun | null> {
  EntityId.parse(agencyId); EntityId.parse(jobId);
  return db.prepare(`SELECT ${runColumns} FROM narration_runs WHERE agency_id=? AND job_id=?`).bind(agencyId, jobId).first<NarrationRun>();
}
export async function startNarration(db: Database, input: {agencyId: string; jobId: string; inputHash: string; configHash: string;
  snapshot: string; mode: 'real' | 'mock'; attempt: number}, now = Date.now()): Promise<{row: NarrationRun; lease: NarrationLease}> {
  EntityId.parse(input.agencyId); EntityId.parse(input.jobId); Sha256.parse(input.inputHash); Sha256.parse(input.configHash);
  if (input.snapshot.length > 128_000 || !['mock','real'].includes(input.mode)) throw new NarrationFailure('SCRIPT_INPUT_INVALID');
  const at = new Date(now).toISOString(), until = new Date(now + 600_000).toISOString();
  await db.prepare(`INSERT INTO narration_runs(job_id,agency_id,input_hash,config_hash,snapshot_json,provider_mode,job_attempt,created_at,expires_at)
    SELECT ?,?,?,?,?,?,?,?,? WHERE EXISTS(SELECT 1 FROM jobs WHERE agency_id=? AND id=? AND attempt=? AND status IN ('scripting','voicing','retry_wait') AND stage IN ('scripting','voicing'))
    ON CONFLICT(job_id) DO NOTHING`).bind(input.jobId, input.agencyId, input.inputHash, input.configHash, input.snapshot,
    input.mode, input.attempt, at, new Date(now + 30 * 86400_000).toISOString(), input.agencyId, input.jobId, input.attempt).run();
  const existing = await findNarration(db, input.agencyId, input.jobId);
  if (!existing) throw new NarrationFailure('NARRATION_NOT_FOUND');
  if (existing.inputHash !== input.inputHash || existing.configHash !== input.configHash || existing.mode !== input.mode || existing.expiresAt <= at)
    throw new NarrationFailure('NARRATION_CONFLICT');
  if (existing.state === 'failed') throw new NarrationFailure('NARRATION_REVIEW_REQUIRED');
  const token = crypto.randomUUID();
  const updated = await db.prepare(`UPDATE narration_runs SET lock_id=?,lock_until=?,job_attempt=? WHERE agency_id=? AND job_id=?
    AND state!='failed' AND (lock_id IS NULL OR lock_until<=?)
    AND EXISTS(SELECT 1 FROM jobs WHERE agency_id=? AND id=? AND attempt=? AND status IN ('scripting','voicing','retry_wait') AND stage IN ('scripting','voicing'))
    RETURNING ${runColumns}`).bind(token, until, input.attempt, input.agencyId, input.jobId, at, input.agencyId, input.jobId, input.attempt).first<NarrationRun>();
  if (!updated) throw new NarrationFailure('NARRATION_BUSY');
  return {row: updated, lease: {agencyId: input.agencyId, jobId: input.jobId, token, attempt: input.attempt}};
}
const leaseCondition = `agency_id=? AND job_id=? AND lock_id=? AND lock_until>? AND job_attempt=? AND state!='failed'
  AND EXISTS(SELECT 1 FROM jobs WHERE agency_id=? AND id=? AND attempt=? AND status IN ('scripting','voicing','retry_wait') AND stage IN ('scripting','voicing'))`;
const leaseValues = (lease: NarrationLease, now: number) => [lease.agencyId, lease.jobId, lease.token, new Date(now).toISOString(), lease.attempt, lease.agencyId, lease.jobId, lease.attempt];
export async function assertNarrationLease(db: Database, lease: NarrationLease, now = Date.now()) {
  if (!await db.prepare(`SELECT job_id FROM narration_runs WHERE ${leaseCondition}`).bind(...leaseValues(lease, now)).first()) throw new NarrationFailure('NARRATION_CONFLICT');
}
export async function claimNarrationCall(db: Database, lease: NarrationLease, input: {
  stepKey: string; requestHash: string; provider: 'openai' | 'google'; mode: 'real' | 'mock'; objectKey?: (id: string) => string;
}, now = Date.now()): Promise<{row: NarrationCall; fresh: boolean}> {
  Sha256.parse(input.requestHash);
  if (!/^(script\/[12]|voice\/[a-f0-9]{64})$/.test(input.stepKey)) throw new NarrationFailure('SCRIPT_INPUT_INVALID');
  await assertNarrationLease(db, lease, now);
  const previous = () => db.prepare(`SELECT id,request_hash AS requestHash,state,result_json AS result,object_key AS objectKey
    FROM narration_calls WHERE agency_id=? AND job_id=? AND step_key=?`).bind(lease.agencyId, lease.jobId, input.stepKey).first<NarrationCall>();
  const old = await previous();
  if (old) {
    if (old.requestHash !== input.requestHash) throw new NarrationFailure('NARRATION_CONFLICT');
    if (old.state !== 'done') throw new NarrationFailure('NARRATION_REVIEW_REQUIRED');
    return {row: old, fresh: false};
  }
  const id = crypto.randomUUID(), at = new Date(now).toISOString();
  const objectKey = input.objectKey?.(id) ?? null;
  if (objectKey && (!objectKey.startsWith(`agencies/${lease.agencyId}/jobs/${lease.jobId}/audio/`) || objectKey.includes('..'))) throw new NarrationFailure('SCRIPT_INPUT_INVALID');
  try {
    const row = await db.prepare(`INSERT INTO narration_calls(id,agency_id,job_id,step_key,request_hash,provider,provider_mode,month,reservation_cents,state,object_key,created_at)
      SELECT ?,?,?,?,?,?,?,?,?,'pending',?,? WHERE EXISTS(SELECT 1 FROM narration_runs WHERE ${leaseCondition})
      RETURNING id,request_hash AS requestHash,state,result_json AS result,object_key AS objectKey`)
      .bind(id, lease.agencyId, lease.jobId, input.stepKey, input.requestHash, input.provider, input.mode, at.slice(0, 7), input.mode === 'real' ? 5 : 0,
        objectKey, at, ...leaseValues(lease, now)).first<NarrationCall>();
    if (!row) throw new NarrationFailure('NARRATION_CONFLICT');
    return {row, fresh: true};
  } catch (error) {
    if (error instanceof NarrationFailure) throw error;
    throw new NarrationFailure(String(error).includes('NARRATION_BUDGET_LIMIT') ? 'NARRATION_BUDGET_LIMIT' : 'NARRATION_CONFLICT');
  }
}
export async function finishNarrationCall(db: Database, lease: NarrationLease, id: string, result: unknown, now = Date.now()) {
  const json = JSON.stringify(result);
  if (json.length > 128_000) throw new NarrationFailure('NARRATION_STORAGE_INVALID');
  const row = await db.prepare(`UPDATE narration_calls SET state='done',result_json=? WHERE agency_id=? AND job_id=? AND id=? AND state='pending'
    AND EXISTS(SELECT 1 FROM narration_runs WHERE ${leaseCondition}) RETURNING id`)
    .bind(json, lease.agencyId, lease.jobId, id, ...leaseValues(lease, now)).first();
  if (!row) throw new NarrationFailure('NARRATION_CONFLICT');
}
export async function failNarrationCall(db: Database, lease: NarrationLease, id: string, code: string) {
  const safeCode = /^[A-Z_]{3,64}$/.test(code) ? code : 'NARRATION_STORAGE_INVALID';
  await db.prepare(`UPDATE narration_calls SET state='failed',error_code=? WHERE agency_id=? AND job_id=? AND id=? AND state='pending'`)
    .bind(safeCode, lease.agencyId, lease.jobId, id).run();
}
export async function finishNarration(db: Database, lease: NarrationLease, result: unknown, now = Date.now()) {
  const json = JSON.stringify(result);
  if (json.length > 128_000) throw new NarrationFailure('NARRATION_STORAGE_INVALID');
  const row = await db.prepare(`UPDATE narration_runs SET state='prepared',result_json=?,error_code=NULL WHERE ${leaseCondition} RETURNING job_id`)
    .bind(json, ...leaseValues(lease, now)).first();
  if (!row) throw new NarrationFailure('NARRATION_CONFLICT');
}
export async function checkpointNarrationScript(db: Database, lease: NarrationLease, script: unknown, now = Date.now()) {
  const json = JSON.stringify(script);
  if (json.length > 32_000) throw new NarrationFailure('NARRATION_STORAGE_INVALID');
  const row = await db.prepare(`UPDATE narration_runs SET script_json=? WHERE ${leaseCondition}
    AND (script_json IS NULL OR json_extract(script_json,'$.version')<=json_extract(?,'$.version')) RETURNING job_id`)
    .bind(json, ...leaseValues(lease, now), json).first();
  if (!row) throw new NarrationFailure('NARRATION_CONFLICT');
}
export async function releaseNarration(db: Database, lease: NarrationLease, errorCode?: string) {
  const safeCode = errorCode && /^[A-Z_]{3,64}$/.test(errorCode) ? errorCode : null;
  await db.prepare(`UPDATE narration_runs SET lock_id=NULL,lock_until=NULL,state=CASE WHEN ? IS NULL THEN state ELSE 'failed' END,error_code=?
    WHERE agency_id=? AND job_id=? AND lock_id=?`).bind(safeCode, safeCode, lease.agencyId, lease.jobId, lease.token).run();
}
