import {z} from 'zod';
import {creditPlans} from './credits';

export const promotionPlans=z.enum(['solo','agence','equipe','reseau']);
export const PromotionCode=z.string().trim().toUpperCase().regex(/^[A-Z0-9][A-Z0-9_-]{2,31}$/);
export const PromotionSettings=z.object({
  code:PromotionCode,name:z.string().trim().min(3).max(100),active:z.boolean(),
  startsAt:z.iso.datetime().nullable(),endsAt:z.iso.datetime().nullable(),
  maxRedemptions:z.number().int().min(1).max(100000).nullable(),
  plans:z.array(promotionPlans).min(1).max(4).refine(v=>new Set(v).size===v.length),
}).strict().refine(v=>!v.startsAt||!v.endsAt||v.endsAt>v.startsAt,{message:'La date de fin doit suivre la date de début.',path:['endsAt']});
export const PROMOTION_PERCENT=20;
export function promotionCredits(plan:typeof promotionPlans['_output']) {
  return Math.floor(creditPlans.find(p=>p.code===plan)!.credits*PROMOTION_PERCENT/100);
}
export type PromotionSettings=z.infer<typeof PromotionSettings>;
export type PromotionPreview={code:string;percent:number;plans:{plan:typeof promotionPlans['_output'];base:number;bonus:number;total:number}[];endsAt:string|null};
export const promotionErrors:Record<string,string>={
  invalid:'Ce code est inconnu ou désactivé.',scheduled:'Ce code n’est pas encore actif.',expired:'Ce code a expiré.',
  exhausted:'Toutes les utilisations de ce code ont été attribuées.',used:'Votre agence a déjà bénéficié d’un bonus d’abonnement.',
  plan:'Ce code ne s’applique pas à cette offre.',subscription:'Ce bonus est réservé à une nouvelle souscription.',
  pending:'Un paiement avec un code est déjà en cours pour votre agence.',
};
