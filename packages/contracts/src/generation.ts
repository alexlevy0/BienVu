import {z} from 'zod';
import {EntityId, Job, Timestamp, GenerationInput,VideoAspectRatio} from './product';
import {MAX_AVATAR_CREDITS} from './avatars';
import {MapLocation} from './maps';
import {GenerationQueueView} from './generation-queue';
export const GenerationRequest = GenerationInput;
export type GenerationRequest = z.infer<typeof GenerationRequest>;
export const GenerationPreparation = z.object({
  map:z.enum(['pending','working','ready','skipped']).optional(),
  avatar:z.enum(['pending','working','ready','skipped']).optional(),
  animations:z.enum(['pending','working','ready','skipped']).optional(),
});
export type GenerationPreparation = z.infer<typeof GenerationPreparation>;
export const GenerationMapOmissionReason=z.enum(['location_missing','ambiguous_location','map_unavailable','confirmation_skipped','confirmation_timeout']);
export type GenerationMapOmissionReason=z.infer<typeof GenerationMapOmissionReason>;
const mapOption={id:z.string().regex(/^city-[0-4]$/),label:z.string().min(2).max(240).refine(v=>!/[<>\u0000-\u001f\u007f]/.test(v))};
export const GenerationMapCandidate=z.object({...mapOption,location:MapLocation.refine(v=>v.sourceType==='municipality'&&v.precision==='approximate')}).strict();
export type GenerationMapCandidate=z.infer<typeof GenerationMapCandidate>;
export const GenerationMapCandidates=z.array(GenerationMapCandidate).min(1).max(5).refine(v=>new Set(v.map(c=>c.id)).size===v.length);
export const GenerationMapConfirmation=z.object({expiresAt:Timestamp,options:z.array(z.object(mapOption).strict()).min(1).max(5)}).strict();
export const ConfirmGenerationMap=z.object({candidateId:mapOption.id.nullable()}).strict();
export const GenerationView = z.object({avatar:z.object({requested:z.number().int().min(1).max(1),ready:z.number().int().min(0).max(2),failed:z.number().int().min(0).max(2),active:z.number().int().min(0).max(2),creditsUsed:z.number().int().min(0).max(MAX_AVATAR_CREDITS)}).optional(),id:EntityId,status:Job.shape.status,stage:Job.shape.stage,attempt:Job.shape.attempt,errorCode:Job.shape.errorCode,createdAt:Timestamp,updatedAt:Timestamp,
  preparation:GenerationPreparation.optional(),narrationReady:z.boolean().optional(),
  mapOmissionReason:GenerationMapOmissionReason.optional(),
  mapConfirmation:GenerationMapConfirmation.optional(),
  queue:GenerationQueueView.optional(),
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
