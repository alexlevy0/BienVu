import RunwayML from '@runwayml/sdk';
import {generationRendererName,type GenerationQueueResource} from '@bienvu/contracts';
import {findGeneration,claimGenerationResource,generationQueueWaitLimit,type GenerationRow} from '@bienvu/db';
import type {WorkflowStep} from 'cloudflare:workers';
import type {GenerationEnv} from './generation-worker';

export const generationController=(env:GenerationEnv,row?:Pick<GenerationRow,'renderSlot'>)=>env.RENDERER.getByName(generationRendererName(row?.renderSlot));

// No renderer is created or kept alive while Workflows sleeps in this queue.
// The fixed upper bound also keeps a complete workflow under the step limit.
export async function waitForGenerationResource(env:GenerationEnv,step:WorkflowStep,agencyId:string,jobId:string,resource:GenerationQueueResource){
  const limit=await step.do(`queue-${resource}-policy`,{retries:{limit:1,delay:'2 seconds'},timeout:'30 seconds'},()=>generationQueueWaitLimit(env.DB));
  for(let poll=0;poll<limit*2;poll++){
    const result=await step.do(`queue-${resource}-claim-${poll}`,{retries:{limit:1,delay:'2 seconds'},timeout:'30 seconds'},async()=>{
      const row=await findGeneration(env.DB,agencyId,jobId);
      if(!row||row.retention!=='available'||['ready','failed'].includes(row.status))throw Error('GENERATION_TERMINAL');
      if(row.deadline<=new Date().toISOString())throw Error('GENERATION_TIMEOUT');
      const gate=await env.DB.prepare("SELECT enabled FROM generation_control WHERE id='generations'").first<{enabled:number}>();
      if(env.GENERATIONS_ENABLED!=='true'||gate?.enabled!==1)throw Error('GENERATIONS_PAUSED');
      if(!row.queued)return {state:'legacy' as const,slot:null};
      const claim=await claimGenerationResource(env.DB,agencyId,jobId,resource);
      if(!claim)throw Error('GENERATION_QUEUE_UNAVAILABLE');
      return claim;
    });
    if(result.state!=='waiting')return result;
    await step.sleep(`queue-${resource}-wait-${poll}`,'30 seconds');
  }
  throw Error('GENERATION_QUEUE_TIMEOUT');
}

// Account metadata is free to read. A stale/unavailable snapshot falls back to
// one concurrent Runway task; raising the operator ceiling cannot exceed it.
export async function syncRunwayLimits(env:Pick<GenerationEnv,'DB'|'RUNWAYML_API_SECRET'|'RUNWAY_ENABLED'>,force=false){
  if(env.RUNWAY_ENABLED!=='true'||!env.RUNWAYML_API_SECRET)return {checked:false};
  const previous=await env.DB.prepare("SELECT checked_at AS checkedAt FROM generation_provider_limits WHERE provider='runway'").first<{checkedAt:string|null}>();
  if(!force&&previous?.checkedAt&&Date.now()-Date.parse(previous.checkedAt)<30*60_000)return {checked:false};
  try{
    const details=await new RunwayML({apiKey:env.RUNWAYML_API_SECRET,maxRetries:0,timeout:15_000}).organization.retrieve();
    const model=details.tier.models.gen4_turbo;
    if(!model||typeof model.maxConcurrentGenerations!=='number'||!Number.isInteger(model.maxConcurrentGenerations)||model.maxConcurrentGenerations<1||model.maxConcurrentGenerations>100
      ||typeof model.maxDailyGenerations!=='number'||!Number.isInteger(model.maxDailyGenerations)||model.maxDailyGenerations<1)throw Error('RUNWAY_LIMITS_INVALID');
    await env.DB.prepare("UPDATE generation_provider_limits SET concurrency=?,daily_limit=?,checked_at=?,last_error=NULL WHERE provider='runway'")
      .bind(model.maxConcurrentGenerations,model.maxDailyGenerations,new Date().toISOString()).run();
    return {checked:true};
  }catch{
    await env.DB.prepare("UPDATE generation_provider_limits SET last_error='RUNWAY_LIMITS_UNAVAILABLE' WHERE provider='runway'").run();
    return {checked:false};
  }
}
