import {z} from 'zod';
import {Timestamp} from './product';

export const MAX_RENDER_SERVERS=5;
export const GenerationQueueResource=z.enum(['preparation','avatar','runway','render']);
export type GenerationQueueResource=z.infer<typeof GenerationQueueResource>;
export const GenerationQueueSettings=z.object({
  preparationConcurrency:z.number().int().min(1).max(20),
  perAgencyConcurrency:z.number().int().min(1).max(5),
  renderConcurrency:z.number().int().min(1).max(MAX_RENDER_SERVERS),
  runwayConcurrency:z.number().int().min(1).max(20),
  maxPending:z.number().int().min(1).max(200),
  maxPerAgency:z.number().int().min(1).max(10),
  maxWaitMinutes:z.number().int().min(1).max(20),
}).strict().refine(s=>s.perAgencyConcurrency<=s.preparationConcurrency&&s.perAgencyConcurrency<=s.maxPerAgency&&s.maxPerAgency<=s.maxPending,
  'Les limites par agence doivent rester dans les limites globales.');
export type GenerationQueueSettings=z.infer<typeof GenerationQueueSettings>;
export const DEFAULT_GENERATION_QUEUE:GenerationQueueSettings={preparationConcurrency:5,perAgencyConcurrency:2,renderConcurrency:3,
  runwayConcurrency:5,maxPending:40,maxPerAgency:5,maxWaitMinutes:20};
export const GenerationQueueView=z.object({resource:GenerationQueueResource,position:z.number().int().positive(),since:Timestamp}).strict();
export const AdminGenerationQueue=z.object({settings:GenerationQueueSettings,revision:z.number().int().positive(),updatedAt:Timestamp.nullable(),
  usage:z.array(z.object({resource:GenerationQueueResource,active:z.number().int().nonnegative(),waiting:z.number().int().nonnegative(),concurrency:z.number().int().nonnegative()})),
  runway:z.object({concurrency:z.number().int().positive(),dailyLimit:z.number().int().positive(),checkedAt:Timestamp.nullable(),error:z.string().nullable()}),
});
export type AdminGenerationQueue=z.infer<typeof AdminGenerationQueue>;
export const UpdateGenerationQueue=z.object({settings:GenerationQueueSettings,revision:z.number().int().positive()}).strict();
export function generationRendererName(slot:number|null|undefined){
  if(slot===null||slot===undefined)return 'generation-single-slot-v1';
  if(!Number.isInteger(slot)||slot<0||slot>=MAX_RENDER_SERVERS)throw Error('VIDEO_SLOT_INVALID');
  return `generation-render-slot-${slot}-v1`;
}
