import {z} from 'zod';

export const SiteFeatures=z.object({explorer:z.boolean()}).strict();
export type SiteFeatures=z.infer<typeof SiteFeatures>;
export const DEFAULT_SITE_FEATURES:SiteFeatures={explorer:false};
export const PublicSiteFeatures=z.object({revision:z.number().int().positive(),features:SiteFeatures}).strict();
export type PublicSiteFeatures=z.infer<typeof PublicSiteFeatures>;
export const AdminSiteFeatures=PublicSiteFeatures.extend({updatedAt:z.iso.datetime()}).strict();
export type AdminSiteFeatures=z.infer<typeof AdminSiteFeatures>;
export const UpdateSiteFeatures=PublicSiteFeatures;
