import {z} from 'zod';
import {EntityId, Job, Timestamp, GenerationInput} from './product';
export const GenerationRequest = GenerationInput;
export type GenerationRequest = z.infer<typeof GenerationRequest>;
export const GenerationView = z.object({id:EntityId,status:Job.shape.status,stage:Job.shape.stage,attempt:Job.shape.attempt,errorCode:Job.shape.errorCode,createdAt:Timestamp,updatedAt:Timestamp,
  sourceKind:z.enum(['url','manual']).nullable().default(null),
  ownership:z.enum(['anonymous','owned']).default('owned'),masterAccess:z.enum(['locked','reserved','unlocked']).default('unlocked'),retention:z.enum(['available','expiring','expired']).default('available'),expiresAt:Timestamp,title:z.string(),locality:z.string().nullable().default(null),videoUrl:z.string().nullable(),downloadUrl:z.string().nullable(),
  durationSeconds:z.number().positive().max(35.2).nullable().optional(),
  syntheticVoice:z.literal(true),retryAllowed:z.boolean(),
});
export type GenerationView = z.infer<typeof GenerationView>;
