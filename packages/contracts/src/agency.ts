import {z} from 'zod';
import {AgencyBrand, EntityId, ListingUrl, Timestamp} from './product';

const color = z.string().regex(/^#[0-9a-fA-F]{6}$/, 'Utilisez une couleur au format #214F43.').transform(v => v.toUpperCase());
const optional = <T extends z.ZodType>(schema: T) => z.preprocess(v => typeof v === 'string' ? v.trim() || null : v, schema.nullable());
export const AgencyUpdate = z.object({
  name: z.string().trim().min(1, 'Renseignez le nom de votre agence.').max(100, 'Le nom est limité à 100 caractères.'),
  primaryColor: color, secondaryColor: color,
  phone: optional(z.string().trim().regex(/^\+?[0-9 ().-]{6,25}$/, 'Vérifiez le numéro de téléphone.')
    .refine(v => v.replace(/\D/g, '').length >= 6, 'Vérifiez le numéro de téléphone.')),
  email: optional(z.email('Vérifiez l’adresse e-mail.').max(254)),
  website: optional(ListingUrl),
}).strict().refine(v => Boolean(v.phone || v.email || v.website), {
  path: ['email'], message: 'Ajoutez au moins un contact : e-mail, téléphone ou site internet.',
});
export type AgencyUpdate = z.infer<typeof AgencyUpdate>;
export const AgencyProfile = AgencyBrand.safeExtend({updatedAt: Timestamp, brandVersion: z.number().int().nonnegative()});
export type AgencyProfile = z.infer<typeof AgencyProfile>;
export const Me = z.object({
  user: z.object({id: EntityId, name: z.string(), email: z.email()}).strict(),
  agency: AgencyProfile,
  rights: z.object({generationEnabled: z.boolean(), developmentRemaining: z.number().int().nonnegative().default(0), importRetryAt: Timestamp.nullable().default(null), trial: z.enum(['eligible', 'used']), watermarked: z.literal(true)}).strict(),
}).strict();
export type Me = z.infer<typeof Me>;
export const LOGO_MAX_BYTES = 2 * 1024 * 1024;
export const LOGO_MAX_SIDE = 1024;
