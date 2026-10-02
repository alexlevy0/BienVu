import {z} from 'zod';
import type {VideoCustomization} from './customization';

// BienVu credits are product units, independent of the provider's API credits.
export const CREDIT_PRICING_VERSION=1;
export const VIDEO_CREDITS=1;
export const PHOTO_ANIMATION_CREDITS=1;
export const creditPlans=[
  {code:'gratuit',name:'Gratuit',description:'Pour découvrir BienVu',price:0,credits:3},
  {code:'plus',name:'Plus',description:'Pour publier régulièrement',price:19,credits:40},
  {code:'pro',name:'Pro',description:'Pour toutes vos annonces',price:49,credits:120},
] as const;
export function requestedAnimations(settings?:VideoCustomization){return settings?.runwayPhotos?.length??settings?.runwayClips??0;}
export function generationCreditCost(settings?:VideoCustomization){return VIDEO_CREDITS+PHOTO_ANIMATION_CREDITS*requestedAnimations(settings);}
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
  consumed:z.number().int().nonnegative(),total:z.number().int().nonnegative(),renewalAt:z.string().nullable(),kind:z.string().nullable()});
export const CreditEntry=z.object({id:z.string(),title:z.string(),at:z.string(),status:z.string(),
  reserved:z.number().int().nonnegative(),used:z.number().int().nonnegative(),refunded:z.number().int().nonnegative(),
  animations:z.number().int().nonnegative(),gift:z.boolean()});
export const CreditHistory=z.object({balance:CreditBalance,entries:z.array(CreditEntry),nextCursor:z.string().nullable()});

export type CreditBalance=z.infer<typeof CreditBalance>;
export type CreditEntry=z.infer<typeof CreditEntry>;
export type CreditHistory=z.infer<typeof CreditHistory>;
