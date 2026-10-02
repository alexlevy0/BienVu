import {z} from 'zod';
import {EntityId, ObjectKey, Sha256, VideoDuration} from './product';

export const ScriptFactRef = z.enum(['propertyType', 'locality', 'price', 'area', 'rooms', 'transaction', 'photos', 'agency.name', 'agency.contact','narration','description']);
export type ScriptFactRef = z.infer<typeof ScriptFactRef>;
export const SceneKind = z.enum(['intro', 'area', 'rooms', 'price', 'location', 'gallery', 'contact']);
export type SceneKind = z.infer<typeof SceneKind>;
export const ScriptCopyVersion = z.enum(['factual-copy/1', 'factual-copy/2', 'description-copy/1', 'description-copy/2']);
export type ScriptCopyVersion = z.infer<typeof ScriptCopyVersion>;
export const ScriptPlan = z.object({scenes: z.array(z.object({
  copyId: z.string().regex(/^(intro|area|rooms|price|location|gallery|contact)\/(direct|warm|short|user|description-\d{1,2})$/),
  photoAssetId: EntityId,
}).strict()).min(4).max(6)}).strict();
export type ScriptPlan = z.infer<typeof ScriptPlan>;
export const ScriptScene = z.object({id: EntityId, kind: SceneKind, copyId: z.string().max(64), photoAssetId: EntityId,
  narrationText: z.string().min(1).max(500), captionText: z.string().min(1).max(180),
  factRefs: z.array(ScriptFactRef).min(1).max(8),
}).strict();
export const ListingScript = z.object({
  id: EntityId, agencyId: EntityId, listingId: EntityId, version: z.union([z.literal(1), z.literal(2)]),
  language: z.literal('fr-FR'), sourceKind: z.enum(['url', 'manual']), inputHash: Sha256,
  model: z.string().min(1).max(100), promptVersion: z.enum(['narration-fr/1','narration-fr/2','narration-fr/3']), copyVersion: ScriptCopyVersion,
  disclosure: z.string().min(1).max(150), scenes: z.array(ScriptScene).min(4).max(6),
  provenance: z.array(z.object({ref: ScriptFactRef, status: z.enum(['verified', 'user_provided']),
    sourcePath: z.string().min(1).max(160)}).strict()).min(1).max(10),
}).strict();
export type ListingScript = z.infer<typeof ListingScript>;
export const NarrationAudio = z.object({id: EntityId, cacheKey: Sha256, objectKey: ObjectKey, sha256: Sha256,
  sizeBytes: z.number().int().positive().max(7 * 1024 * 1024), durationMs: z.number().int().positive().max(35000),
  sampleRate: z.number().int().positive(), channels: z.number().int().min(1).max(2), rmsDbfs: z.number().finite(),
}).strict();
export const PreparedNarration = z.object({script: ListingScript, voiceEnabled:z.boolean().optional(),durationSeconds:VideoDuration.optional(),audio: z.array(NarrationAudio).max(6),
  durationFrames: z.array(z.number().int().positive().max(1200)).min(4).max(6),
}).strict().superRefine((value, ctx) => {
  if (value.script.scenes.length !== value.durationFrames.length
    || (value.voiceEnabled===false?value.audio.length!==0:value.script.scenes.length!==value.audio.length)
    || value.durationFrames.reduce((a, b) => a + b, 0) < 600 || value.durationFrames.reduce((a, b) => a + b, 0) > 1200
    || value.durationSeconds!==undefined&&value.durationFrames.reduce((a,b)=>a+b,0)!==value.durationSeconds*30
    || value.audio.some((audio, index) => value.durationFrames[index] < Math.ceil(audio.durationMs * 30 / 1000)))
    ctx.addIssue({code: 'custom', message: 'Timing de narration incohérent.'});
});
export type PreparedNarration = z.infer<typeof PreparedNarration>;

export const narrationFailureCodes = ['SCRIPT_INPUT_INVALID', 'SCRIPT_CONFIG_INVALID', 'SCRIPT_INVALID', 'SCRIPT_REFUSED',
  'SCRIPT_AUTH_FAILED', 'SCRIPT_RATE_LIMITED', 'SCRIPT_UNAVAILABLE', 'SCRIPT_TIMEOUT', 'SCRIPT_RESPONSE_INVALID',
  'NARRATION_NOT_FOUND', 'NARRATION_CONFLICT', 'NARRATION_BUSY', 'NARRATION_REVIEW_REQUIRED',
  'NARRATION_BUDGET_LIMIT', 'NARRATION_STORAGE_INVALID', 'NARRATION_DURATION_EXCEEDED'] as const;
export type NarrationFailureCode = typeof narrationFailureCodes[number];
export class NarrationFailure extends Error {
  constructor(readonly code: NarrationFailureCode) {super(code); this.name = 'NarrationFailure';}
}
