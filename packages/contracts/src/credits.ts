import {z} from 'zod';
import type {VideoCustomization} from './customization';
import {avatarCreditCost} from './avatars';

// BienVu credits are product units, independent of the provider's API credits.
export const CREDIT_PRICING_VERSION=1;
export const VIDEO_CREDITS=1;
export const PHOTO_ANIMATION_CREDITS=1;
export const legacyCreditPlans=[
  {code:'gratuit',name:'Gratuit',description:'Pour découvrir BienVu',price:0,credits:3},
  {code:'plus',name:'Plus',description:'Pour publier régulièrement',price:19,credits:40},
  {code:'pro',name:'Pro',description:'Pour toutes vos annonces',price:49,credits:120},
] as const;
export const creditPlans=[
  {code:'gratuit',name:'Gratuit',description:'Pour découvrir BienVu',price:0,credits:3},
  {code:'solo',name:'Solo',description:'Pour les indépendants',price:50,credits:50},
  {code:'agence',name:'Agence',description:'Pour publier régulièrement',price:100,credits:100},
  {code:'equipe',name:'Équipe',description:'Pour un volume soutenu',price:200,credits:200},
  {code:'reseau',name:'Réseau',description:'Pour les agences multi-sites',price:500,credits:500},
] as const;
export type PaidCreditPlanCode=Exclude<typeof creditPlans[number]['code'],'gratuit'>;
export const legacyCreditPacks=[
  {code:'pack10',credits:10,priceCents:700},
  {code:'pack30',credits:30,priceCents:1900},
  {code:'pack100',credits:100,priceCents:5900},
] as const;
// New identifiers keep already-created orders at their original price.
export const creditPacks=[
  {code:'pack20v2',credits:20,priceCents:2000},
  {code:'pack50v2',credits:50,priceCents:5000},
  {code:'pack100v2',credits:100,priceCents:10000},
] as const;
export type CreditPackCode=typeof creditPacks[number]['code'];
export function requestedAnimations(settings?:VideoCustomization){return settings?.runwayPhotos?.length??settings?.runwayClips??0;}
export function generationCreditCost(settings?:VideoCustomization,durationSeconds=settings?.editor?.durationSeconds??20){return VIDEO_CREDITS+PHOTO_ANIMATION_CREDITS*requestedAnimations(settings)+avatarCreditCost(settings?.avatar,durationSeconds);}
// Legacy requests keep the first/middle choices. New requests use source slots,
// so reordering photos does not silently animate a different room.
export function selectedAnimationIndices(sourceSlots:number[],settings?:VideoCustomization){
  if(settings?.runwayPhotos)return settings.runwayPhotos.map(slot=>{
    const index=sourceSlots.indexOf(slot);if(index<0)throw Error('INVALID_ANIMATION_SELECTION');return index;
  });
  const count=settings?.runwayClips??0;
  return count===2?[0,Math.floor(sourceSlots.length/2)]:count===1?[0]:[];
}
export const CreditBalance=z.object({available:z.number().int().nonnegative(),reserved:z.number().int().nonnegative(),
  consumed:z.number().int().nonnegative(),total:z.number().int().nonnegative(),renewalAt:z.string().nullable(),kind:z.string().nullable(),
  purchasedAvailable:z.number().int().nonnegative().optional(),monthlyAvailable:z.number().int().nonnegative().optional(),rolloverAvailable:z.number().int().nonnegative().optional()});
export const CreditEntry=z.object({id:z.string(),title:z.string(),at:z.string(),status:z.string(),
  reserved:z.number().int().nonnegative(),used:z.number().int().nonnegative(),refunded:z.number().int().nonnegative(),
  animations:z.number().int().nonnegative(),gift:z.boolean()});
export const CreditHistory=z.object({balance:CreditBalance,entries:z.array(CreditEntry),nextCursor:z.string().nullable()});

export type CreditBalance=z.infer<typeof CreditBalance>;
export type CreditEntry=z.infer<typeof CreditEntry>;
export type CreditHistory=z.infer<typeof CreditHistory>;
