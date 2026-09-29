import {z} from 'zod';

export * from './product';
export * from './errors';
export * from './agency';
export * from './manual-listing';
export * from './import-sources';
export * from './voice';
export * from './narration';
export * from './video';
export * from './generation';

export const ProbeRender = z.object({
  id: z.string().regex(/^[a-z0-9][a-z0-9-]{0,63}$/),
  fixture: z.enum(['short', 'target']),
}).strict();
export type ProbeRender = z.infer<typeof ProbeRender>;

export const errorCodes = ['INVALID_URL', 'UNSAFE_URL', 'SOURCE_BLOCKED', 'SOURCE_UNAVAILABLE',
  'NOT_A_LISTING', 'INCOMPLETE_LISTING', 'CONFLICTING_FACTS', 'INSUFFICIENT_PHOTOS', 'IMPORT_TIMEOUT'] as const;
export type ImportErrorCode = typeof errorCodes[number];
export const importFailureReasons = ['access_denied', 'login_required', 'rate_limited', 'challenge', 'not_found',
  'listing_redirect', 'not_listing', 'structure_changed'] as const;
export type ImportFailureReason = typeof importFailureReasons[number];
export function importFailureReason(value: unknown): ImportFailureReason | undefined {
  return importFailureReasons.find(reason => reason === value);
}
export class ImportFailure extends Error {
  constructor(public code: ImportErrorCode, message: string, public reason?: ImportFailureReason) {super(message);}
}

const fact = <T extends z.ZodType>(value: T) => z.object({
  value, sourcePath: z.string(), rawEvidence: z.string().max(500), status: z.literal('verified'),
});
export const Listing = z.object({
  sourceUrl: z.url(), fetchedAt: z.iso.datetime(), adapterVersion: z.string(),
  title: fact(z.string().min(3)), propertyType: fact(z.enum(['House', 'Apartment', 'Residence'])),
  locality: fact(z.string().min(2)),
  transaction: z.enum(['sale', 'rent', 'unknown']),
  priceCents: fact(z.number().int().positive()).nullable(), currency: z.literal('EUR').nullable(),
  areaM2: fact(z.number().positive()).nullable(),
  photoUrls: z.array(z.url()).max(12), warnings: z.array(z.string()),
});
export type Listing = z.infer<typeof Listing>;

export const VideoFixture = z.object({
  schemaVersion: z.literal(1), kind: z.literal('synthetic-fixture'),
  fps: z.literal(30), width: z.literal(1080), height: z.literal(1920),
  durationSeconds: z.union([z.literal(6), z.literal(30)]),
  // Sprint 00 : aucun master sans filigrane, aucune entrée HTML/URL arbitraire.
  watermarked: z.literal(true), audio: z.literal('tone.wav'),
  scenes: z.array(z.object({image: z.enum(['room-1.png','room-2.png','room-3.png']), caption: z.string().max(160)})).length(3),
});
export type VideoFixture = z.infer<typeof VideoFixture>;
export * from './auth';
