import {z} from 'zod';

export const partnerProgram = {commissionPercent:15, months:12} as const;
export const partnerActivities = [
  {value:'photographer', label:'Photographe immobilier'},
  {value:'trainer', label:'Formateur'},
  {value:'consultant', label:'Consultant'},
  {value:'agency', label:'Agence immobilière'},
  {value:'agent', label:'Agent immobilier ou mandataire'},
  {value:'other', label:'Autre professionnel'},
] as const;
export const PartnerApplication = z.object({
  name:z.string().trim().min(2).max(120).regex(/^[^\p{Cc}\p{Zl}\p{Zp}]+$/u),
  email:z.string().trim().max(254).pipe(z.email()).transform(value=>value.toLowerCase()),
  activity:z.enum(partnerActivities.map(activity=>activity.value)),
}).strict();
export type PartnerApplication = z.infer<typeof PartnerApplication>;

// Calculate in cents, rounding once after applying the agreed percentage.
export function partnerCommissionCents(clients:number, monthlySpendCents:number) {
  if(!Number.isSafeInteger(clients)||clients<1||clients>50||!Number.isSafeInteger(monthlySpendCents)||monthlySpendCents<0||monthlySpendCents>100000)
    throw new Error('PARTNER_SIMULATION_INVALID');
  return Math.round(clients*monthlySpendCents*partnerProgram.commissionPercent/100);
}
