import {ConfirmGenerationMap,GenerationMapCandidates,type GenerationMapCandidate} from '@bienvu/contracts';
import {GenerationFailure,type GenerationRow} from './generation';
import type {Database} from './index';

type ConfirmationRow={options:string;state:'pending'|'selected'|'skipped'|'expired';selectedId:string|null;expiresAt:string};
export async function findGenerationMapConfirmation(db:Database,agencyId:string,jobId:string){
  const row=await db.prepare('SELECT options_json AS options,state,selected_id AS selectedId,expires_at AS expiresAt FROM generation_map_confirmations WHERE agency_id=? AND job_id=?')
    .bind(agencyId,jobId).first<ConfirmationRow>();
  return row?{...row,options:GenerationMapCandidates.parse(JSON.parse(row.options))}:null;
}
export async function createGenerationMapConfirmation(db:Database,row:GenerationRow,options:GenerationMapCandidate[],now=Date.now()){
  const at=new Date(now).toISOString(),expiresAt=new Date(Math.min(now+300_000,Date.parse(row.deadline)-180_000)).toISOString();
  if(expiresAt<=at)return null; // Keep time for the remaining production steps.
  const offered=GenerationMapCandidates.parse(options);
  await db.prepare(`INSERT INTO generation_map_confirmations(job_id,agency_id,options_json,created_at,expires_at,updated_at)
    VALUES(?,?,?,?,?,?) ON CONFLICT(job_id) DO NOTHING`).bind(row.jobId,row.agencyId,JSON.stringify(offered),at,expiresAt,at).run();
  return findGenerationMapConfirmation(db,row.agencyId,row.jobId);
}
export async function confirmGenerationMap(db:Database,agencyId:string,jobId:string,input:unknown,now=Date.now()){
  const parsed=ConfirmGenerationMap.safeParse(input);if(!parsed.success)throw new GenerationFailure('VALIDATION_ERROR');
  const {candidateId}=parsed.data,decision=candidateId===null?'skipped':'selected';
  const offered=await findGenerationMapConfirmation(db,agencyId,jobId);if(!offered)throw new GenerationFailure('NOT_FOUND');
  if(candidateId!==null&&!offered.options.some(c=>c.id===candidateId))throw new GenerationFailure('VALIDATION_ERROR');
  if(offered.state===decision&&offered.selectedId===candidateId)return offered; // Idempotent double click / lost response.
  const at=new Date(now).toISOString();
  await db.prepare(`UPDATE generation_map_confirmations SET state=?,selected_id=?,updated_at=?
    WHERE agency_id=? AND job_id=? AND state='pending' AND expires_at>?
    AND EXISTS(SELECT 1 FROM generation_runs g JOIN jobs j ON j.id=g.job_id
      WHERE g.job_id=? AND g.agency_id=? AND g.retention='available' AND g.deadline>? AND j.status='importing' AND j.stage='importing')
    AND NOT EXISTS(SELECT 1 FROM generation_map_resolutions WHERE job_id=?)
    AND NOT EXISTS(SELECT 1 FROM narration_runs WHERE job_id=?)
    AND NOT EXISTS(SELECT 1 FROM video_manifests WHERE job_id=?)`)
    .bind(decision,candidateId,at,agencyId,jobId,at,jobId,agencyId,at,jobId,jobId,jobId).run();
  const result=await findGenerationMapConfirmation(db,agencyId,jobId);
  if(result?.state!==decision||result.selectedId!==candidateId)throw new GenerationFailure('CONFLICT');
  return result;
}
export async function expireGenerationMapConfirmation(db:Database,agencyId:string,jobId:string,now=Date.now()){
  const at=new Date(now).toISOString();
  await db.prepare("UPDATE generation_map_confirmations SET state='expired',updated_at=? WHERE agency_id=? AND job_id=? AND state='pending' AND expires_at<=?")
    .bind(at,agencyId,jobId,at).run();
  return findGenerationMapConfirmation(db,agencyId,jobId);
}
