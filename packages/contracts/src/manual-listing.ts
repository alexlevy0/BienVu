import {z} from 'zod';
import {DESCRIPTION_MAX_CHARACTERS, Sha256} from './product';

export const MANUAL_PHOTO_LIMITS = {minimum: 3, maximum: 12, fileBytes: 10 * 1024 * 1024, totalBytes: 50 * 1024 * 1024} as const;
export const ManualListingInput = z.object({
  title: z.string().trim().min(3, 'Indiquez un titre de 3 caractères minimum.').max(200),
  propertyType: z.enum(['apartment', 'house', 'other'], {error: 'Choisissez le type de bien.'}),
  transaction: z.enum(['sale', 'rent']),
  locality: z.string().trim().min(2, 'Indiquez la localisation du bien.').max(200),
  description: z.string().trim().max(DESCRIPTION_MAX_CHARACTERS),
  priceCents: z.number().int().positive().max(100_000_000_000).nullable(),
  charges: z.enum(['included', 'excluded']).nullable(),
  area: z.number().positive().max(100_000).nullable(),
  rooms: z.number().int().positive().max(100).nullable(),
  photos: z.array(z.object({hash: Sha256, size: z.number().int().positive().max(MANUAL_PHOTO_LIMITS.fileBytes),
    mime: z.enum(['image/jpeg', 'image/png', 'image/webp'])}).strict()).min(MANUAL_PHOTO_LIMITS.minimum).max(MANUAL_PHOTO_LIMITS.maximum),
}).strict().superRefine((input, ctx) => {
  if (input.transaction === 'sale' && input.charges !== null || input.transaction === 'rent' && input.priceCents !== null && input.charges === null)
    ctx.addIssue({code: 'custom', path: ['charges'], message: 'Précisez si les charges sont comprises dans le loyer.'});
  if (input.photos.reduce((sum, photo) => sum + photo.size, 0) > MANUAL_PHOTO_LIMITS.totalBytes)
    ctx.addIssue({code: 'custom', path: ['photos'], message: 'Les photos dépassent 50 Mo au total.'});
  if (new Set(input.photos.map(p => p.hash)).size !== input.photos.length)
    ctx.addIssue({code: 'custom', path: ['photos'], message: 'Choisissez des photos différentes du bien.'});
});
export type ManualListingInput = z.infer<typeof ManualListingInput>;
