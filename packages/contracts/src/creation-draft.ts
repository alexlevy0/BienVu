import {z} from 'zod';
import {DESCRIPTION_MAX_CHARACTERS, PhotoAsset} from './product';
import {VideoCustomization} from './customization';

export const creationFieldNames = ['title','propertyType','transaction','locality','description','priceCents','charges','area','rooms'] as const;
export type CreationFieldName = typeof creationFieldNames[number];
export const CreationFields = z.object({
  title:z.string().trim().min(3).max(200).nullable(),
  propertyType:z.enum(['apartment','house','other']).nullable(),
  transaction:z.enum(['sale','rent']).nullable(),
  locality:z.string().trim().min(2).max(200).nullable(),
  description:z.string().max(DESCRIPTION_MAX_CHARACTERS).nullable(),
  priceCents:z.number().int().positive().max(100_000_000_000).nullable(),
  charges:z.enum(['included','excluded']).nullable(),
  area:z.number().positive().max(100_000).nullable(),
  rooms:z.number().int().positive().max(100).nullable(),
}).strict();
export type CreationFields=z.infer<typeof CreationFields>;
export const CreationProvenance=z.object({source:z.enum(['import','ai','user']),evidence:z.string().max(500).nullable(),confirm:z.boolean()}).strict();
export const CreationDraftData=z.object({fields:CreationFields,provenance:z.partialRecord(z.enum(creationFieldNames),CreationProvenance),
  originalText:z.string().max(DESCRIPTION_MAX_CHARACTERS).nullable(),canonicalUrl:z.string().url().nullable(),
  warnings:z.array(z.string().max(300)).max(12),videoCustomization:VideoCustomization.optional()}).strict();
export type CreationDraftData=z.infer<typeof CreationDraftData>;
export const CreationDraftView=z.object({id:z.string(),version:z.number().int().positive(),status:z.literal('needs_input'),
  sourceKind:z.enum(['url','manual']),sourceUrl:z.string().nullable(),expiresAt:z.iso.datetime(),data:CreationDraftData,
  photos:z.array(PhotoAsset).max(12)}).strict();
export type CreationDraftView=z.infer<typeof CreationDraftView>;
export const emptyCreationFields=():CreationFields=>({title:null,propertyType:null,transaction:null,locality:null,
  description:null,priceCents:null,charges:null,area:null,rooms:null});
