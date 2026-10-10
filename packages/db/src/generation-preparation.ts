import {EntityId,GenerationPreparation} from '@bienvu/contracts';
import type {Database,GenerationRow} from './index';

// Keep completed checkpoints on replay. Scope and attempt come from the job.
export async function setGenerationPreparation(db:Database,row:GenerationRow,
  step:keyof GenerationPreparation,state:'working'|'ready'|'skipped'){
  EntityId.parse(row.agencyId);EntityId.parse(row.jobId);
  GenerationPreparation.strict().parse({[step]:state});
  const at=new Date().toISOString();
  await db.prepare(`INSERT INTO generation_preparation_steps(job_id,agency_id,step,state,started_at,updated_at)
    SELECT j.id,j.agency_id,?,?,?,? FROM jobs j
    JOIN generation_runs g ON g.job_id=j.id AND g.agency_id=j.agency_id
    WHERE j.id=? AND j.agency_id=? AND j.attempt=? AND j.status NOT IN ('ready','failed')
    AND CASE ? WHEN 'map' THEN g.default_map_json IS NOT NULL OR json_type(g.input_json,'$.customization.map.location')='object'
      WHEN 'avatar' THEN g.avatar_credits>0 WHEN 'animations' THEN g.animations_requested>0 END
    ON CONFLICT(job_id,step) DO UPDATE SET state=excluded.state,updated_at=excluded.updated_at
    WHERE generation_preparation_steps.agency_id=excluded.agency_id AND generation_preparation_steps.state='working'`)
    .bind(step,state,at,at,row.jobId,row.agencyId,row.attempt,step).run();
}
