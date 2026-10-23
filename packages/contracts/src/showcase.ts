import { z } from 'zod';
import { EntityId, ListingUrl } from './product';
import type { CreationFields } from './creation-draft';

const text = (max: number) => z.string().trim().max(max);
const nullable = <T extends z.ZodType>(schema: T) => schema.nullable();
export const ShowcaseSlug = z
  .string()
  .trim()
  .toLowerCase()
  .min(3)
  .max(70)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
  .refine(
    (value) =>
      ![
        'admin',
        'api',
        'bienvu',
        'connexion',
        'contact',
        'demo',
        'editeur',
        'explorer',
        'help',
        'login',
        'preview',
        'support',
        'test',
        'www',
        'nouveau',
      ].includes(value),
    'Cette adresse est réservée.',
  );
export const ShowcaseConfig = z
  .object({
    name: text(100),
    slug: ShowcaseSlug,
    tagline: text(180),
    description: text(4000),
    city: text(100),
    sectors: z.array(text(80).min(1)).max(12),
    phone: nullable(
      z
        .string()
        .trim()
        .regex(/^\+?[0-9 ().-]{6,25}$/),
    ),
    email: nullable(z.email().max(254)),
    website: nullable(ListingUrl),
    socials: z
      .object({
        instagram: nullable(ListingUrl),
        facebook: nullable(ListingUrl),
        linkedin: nullable(ListingUrl),
        youtube: nullable(ListingUrl),
      })
      .strict(),
    address: text(300),
    showAddress: z.boolean(),
    accent: z.string().regex(/^#[a-fA-F0-9]{6}$/),
    logoAssetId: EntityId.nullable(),
    coverAssetId: EntityId.nullable(),
    keepSold: z.boolean(),
    notifications: z.boolean(),
  })
  .strict();
export type ShowcaseConfig = z.infer<typeof ShowcaseConfig>;
export const ShowcasePropertyId = z.string().regex(/^(listing|job|project):[a-zA-Z0-9_-]{1,128}$/);
export const ShowcasePropertySettings = z
  .object({
    photoIds: z.array(z.string().regex(/^[a-f0-9]{64}$/)).max(12),
    coverPhotoId: z
      .string()
      .regex(/^[a-f0-9]{64}$/)
      .nullable(),
    videoJobId: EntityId.nullable(),
    featured: z.boolean(),
    order: z.number().int().min(0).max(499),
    status: z.enum(['available', 'under_offer', 'sold', 'rented']),
    showAddress: z.boolean(),
    address: text(300),
    dpe: z.enum(['A', 'B', 'C', 'D', 'E', 'F', 'G', 'not_applicable']).nullable(),
    ges: z.enum(['A', 'B', 'C', 'D', 'E', 'F', 'G', 'not_applicable']).nullable(),
    legal: text(4000),
  })
  .strict()
  .refine((value) => new Set(value.photoIds).size === value.photoIds.length, 'Choisissez chaque photo une seule fois.')
  .refine(
    (value) => value.coverPhotoId === null || value.photoIds.includes(value.coverPhotoId),
    'La couverture doit faire partie des photos publiques.',
  );
export type ShowcasePropertySettings = z.infer<typeof ShowcasePropertySettings>;
export const defaultShowcaseProperty = (): ShowcasePropertySettings => ({
  photoIds: [],
  coverPhotoId: null,
  videoJobId: null,
  featured: false,
  order: 0,
  status: 'available',
  showAddress: false,
  address: '',
  dpe: null,
  ges: null,
  legal: '',
});
export const ShowcaseAction = z.discriminatedUnion('action', [
  z.object({ action: z.literal('save'), version: z.number().int().positive(), config: ShowcaseConfig }).strict(),
  z.object({ action: z.enum(['publish', 'offline']), version: z.number().int().positive() }).strict(),
  z
    .object({
      action: z.literal('property-save'),
      version: z.number().int().positive(),
      propertyId: ShowcasePropertyId,
      settings: ShowcasePropertySettings,
    })
    .strict(),
  z
    .object({
      action: z.enum(['property-publish', 'property-remove']),
      version: z.number().int().positive(),
      id: EntityId,
    })
    .strict(),
  z.object({ action: z.literal('lead'), id: EntityId, status: z.enum(['new', 'in_progress', 'treated']) }).strict(),
  z.object({ action: z.enum(['lead-delete', 'lead-retry']), id: EntityId }).strict(),
]);
export type ShowcaseAction = z.infer<typeof ShowcaseAction>;
export const ShowcaseContact = z
  .object({
    name: z.string().trim().min(2).max(100),
    email: z.email().max(254),
    phone: z
      .string()
      .trim()
      .max(25)
      .regex(/^[+0-9 ().-]*$/),
    message: z.string().trim().min(10).max(3000),
    propertyId: EntityId.nullable(),
    website: z.string().max(200),
    turnstileToken: z.string().max(2048),
  })
  .strict();
export type ShowcaseContact = z.infer<typeof ShowcaseContact>;
export type ShowcaseImage = { id: string; url: string; width: number; height: number };
export type ShowcasePublicProperty = {
  id: string;
  url: string;
  fields: z.infer<typeof CreationFields>;
  reference: string;
  status: ShowcasePropertySettings['status'];
  featured: boolean;
  photos: ShowcaseImage[];
  cover: ShowcaseImage | null;
  video: { url: string; aspectRatio: '9:16' | '16:9'; durationSeconds: number } | null;
  address: string | null;
  dpe: ShowcasePropertySettings['dpe'];
  ges: ShowcasePropertySettings['ges'];
  legal: string;
  videoOutdated: boolean;
  updatedAt: string;
};
export type ShowcasePublic = {
  config: Omit<ShowcaseConfig, 'logoAssetId' | 'coverAssetId' | 'notifications'>;
  logo: ShowcaseImage | null;
  cover: ShowcaseImage | null;
  properties: ShowcasePublicProperty[];
  featured: ShowcasePublicProperty[];
  total: number;
  page: number;
  pages: number;
  publishedAt: string;
  preview: boolean;
};
export type ShowcaseAssetMeta = {
  id: string;
  kind: 'photo' | 'video' | 'logo' | 'cover';
  width: number;
  height: number;
  mime: string;
  sizeBytes: number;
};
export type ShowcaseStoredProperty = {
  settings: ShowcasePropertySettings;
  photos: (ShowcaseAssetMeta & { sourceHash: string })[];
  video:
    | (ShowcaseAssetMeta & { jobId: string; factsHash: string; aspectRatio: '9:16' | '16:9'; durationSeconds: number })
    | null;
};
export type ShowcaseItem = {
  id: string;
  propertyId: string;
  draft: ShowcaseStoredProperty;
  published: ShowcaseStoredProperty | null;
  removed: boolean;
  updatedAt: string;
};
export type ShowcaseLead = {
  id: string;
  propertyId: string | null;
  propertyTitle: string | null;
  name: string;
  email: string;
  phone: string;
  message: string;
  status: 'new' | 'in_progress' | 'treated';
  notification: 'pending' | 'sending' | 'sent' | 'failed' | 'disabled';
  createdAt: string;
};
export type ShowcasePrivate = {
  version: number;
  status: 'draft' | 'published' | 'offline';
  draft: ShowcaseConfig;
  published: ShowcaseConfig | null;
  publishedAt: string | null;
  logoUrl: string | null;
  coverUrl: string | null;
  items: (ShowcaseItem & { groupId: string | null; title: string; issues: string[]; videoOutdated: boolean })[];
  properties: {
    id: string;
    title: string;
    fields: z.infer<typeof CreationFields>;
    archived: boolean;
    photos: { id: string; url: string; width: number; height: number }[];
    videos: { id: string; title: string; ready: boolean; aspectRatio: '9:16' | '16:9'; videoUrl: string | null }[];
  }[];
  total: number;
  nextCursor: string | null;
  leads: ShowcaseLead[];
  nextLeadCursor: string | null;
  stats: { days: 7 | 30; agencyViews: number; propertyViews: number; contactClicks: number; requests: number };
  canConfigure: boolean;
  canEdit: boolean;
  emailConfigured: boolean;
};

export function showcaseSlugBase(name: string) {
  return (
    name
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 55)
      .replace(/-$/, '') || 'agence'
  );
}
export function showcasePublicConfig(value: ShowcaseConfig): ShowcasePublic['config'] {
  const { logoAssetId: _logo, coverAssetId: _cover, notifications: _notifications, ...publicConfig } = value;
  return { ...publicConfig, address: value.showAddress ? value.address : '' };
}
