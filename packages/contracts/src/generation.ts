import {z} from 'zod';
import {EntityId, Job, Timestamp, GenerationInput} from './product';
export const GenerationRequest = GenerationInput;
export type GenerationRequest = z.infer<typeof GenerationRequest>;
export const GenerationView = z.object({id:EntityId,status:Job.shape.status,stage:Job.shape.stage,attempt:Job.shape.attempt,errorCode:Job.shape.errorCode,createdAt:Timestamp,updatedAt:Timestamp,
  expiresAt:Timestamp,title:z.string(),videoUrl:z.string().nullable(),downloadUrl:z.string().nullable(),
  syntheticVoice:z.literal(true),retryAllowed:z.boolean(),
});
export type GenerationView = z.infer<typeof GenerationView>;
