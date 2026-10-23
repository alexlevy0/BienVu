import { z } from 'zod';
import { DESCRIPTION_MAX_CHARACTERS, PhotoAsset } from './product';
import { VideoCustomization } from './customization';
import { IMPORT_PHOTO_MAXIMUM } from './photo-limits';

export const creationFieldNames = [
  'title',
  'propertyType',
  'transaction',
  'locality',
  'description',
  'priceCents',
  'charges',
  'area',
  'rooms',
] as const;
export type CreationFieldName = (typeof creationFieldNames)[number];
export const CreationFields = z
  .object({
    title: z.string().trim().min(3).max(200).nullable(),
    propertyType: z.enum(['apartment', 'house', 'other']).nullable(),
    transaction: z.enum(['sale', 'rent']).nullable(),
    locality: z.string().trim().min(2).max(200).nullable(),
    description: z.string().max(DESCRIPTION_MAX_CHARACTERS).nullable(),
    priceCents: z.number().int().positive().max(100_000_000_000).nullable(),
    charges: z.enum(['included', 'excluded']).nullable(),
    area: z.number().positive().max(100_000).nullable(),
    rooms: z.number().int().positive().max(100).nullable(),
  })
  .strict();
export type CreationFields = z.infer<typeof CreationFields>;
// Keep incomplete form input separate from validated facts (e.g. a one-letter
// title or a decimal amount still being typed).
export const ManualDraftInput = z
  .object({
    title: z.string().max(200),
    propertyType: z.string().max(30),
    transaction: z.string().max(30),
    locality: z.string().max(200),
    description: z.string().max(DESCRIPTION_MAX_CHARACTERS),
    priceCents: z.string().max(200),
    charges: z.string().max(30),
    area: z.string().max(200),
    rooms: z.string().max(200),
  })
  .strict();
export type ManualDraftInput = z.infer<typeof ManualDraftInput>;
export function hasManualDraftContent(
  fields: Partial<Record<CreationFieldName, unknown>> | null | undefined,
  photoCount = 0,
): boolean {
  return (
    photoCount > 0 ||
    Boolean(
      fields &&
        creationFieldNames.some((name) => {
          const value = fields[name];
          if (value === null || value === undefined) return false;
          const text = String(value).trim();
          return (
            text !== '' &&
            !(name === 'propertyType' && text === 'apartment') &&
            !(name === 'transaction' && text === 'sale')
          );
        }),
    )
  );
}
export const CreationProvenance = z
  .object({ source: z.enum(['import', 'ai', 'user']), evidence: z.string().max(500).nullable(), confirm: z.boolean() })
  .strict();
export const CreationDraftData = z
  .object({
    fields: CreationFields,
    provenance: z.partialRecord(z.enum(creationFieldNames), CreationProvenance),
    originalText: z.string().max(DESCRIPTION_MAX_CHARACTERS).nullable(),
    canonicalUrl: z.string().url().nullable(),
    warnings: z.array(z.string().max(300)).max(12),
    videoCustomization: VideoCustomization.optional(),
    manualInput: ManualDraftInput.optional(),
  })
  .strict();
export type CreationDraftData = z.infer<typeof CreationDraftData>;
export function hasCreationDraftContent(data: CreationDraftData, photoCount = 0): boolean {
  return (
    hasManualDraftContent(data.manualInput ?? data.fields, photoCount) ||
    Boolean(data.originalText?.trim() || data.canonicalUrl || data.videoCustomization?.editor)
  );
}
export const CreationDraftView = z
  .object({
    id: z.string(),
    version: z.number().int().positive(),
    status: z.literal('needs_input'),
    sourceKind: z.enum(['url', 'manual']),
    sourceUrl: z.string().nullable(),
    expiresAt: z.iso.datetime(),
    data: CreationDraftData,
    photos: z.array(PhotoAsset).max(IMPORT_PHOTO_MAXIMUM),
  })
  .strict();
export type CreationDraftView = z.infer<typeof CreationDraftView>;
export const emptyCreationFields = (): CreationFields => ({
  title: null,
  propertyType: null,
  transaction: null,
  locality: null,
  description: null,
  priceCents: null,
  charges: null,
  area: null,
  rooms: null,
});
