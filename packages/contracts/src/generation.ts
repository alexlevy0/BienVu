import {z} from 'zod';
import {EntityId, Job, Timestamp, GenerationInput,VideoAspectRatio} from './product';
export const GenerationRequest = GenerationInput;
export type GenerationRequest = z.infer<typeof GenerationRequest>;
export const GenerationView = z.object({id:EntityId,status:Job.shape.status,stage:Job.shape.stage,attempt:Job.shape.attempt,errorCode:Job.shape.errorCode,createdAt:Timestamp,updatedAt:Timestamp,
  progressPercent:z.number().int().min(0).max(100).default(0),
  creditsReserved:z.number().int().nonnegative().default(1),creditsUsed:z.number().int().nonnegative().default(0),
  creditsRefunded:z.number().int().nonnegative().default(0),animationsRequested:z.number().int().min(0).max(12).default(0),
  animationsUsed:z.number().int().min(0).max(12).default(0),
  sourceKind:z.enum(['url','manual']).nullable().default(null),
  ownership:z.enum(['anonymous','owned']).default('owned'),masterAccess:z.enum(['locked','reserved','unlocked']).default('unlocked'),retention:z.enum(['available','expiring','expired']).default('available'),expiresAt:Timestamp.nullable(),title:z.string(),locality:z.string().nullable().default(null),videoUrl:z.string().nullable(),downloadUrl:z.string().nullable(),
  durationSeconds:z.number().positive().max(40.2).nullable().optional(),
  aspectRatio:VideoAspectRatio.optional(),
  syntheticVoice:z.boolean(),retryAllowed:z.boolean(),
});
export type GenerationView = z.infer<typeof GenerationView>;
