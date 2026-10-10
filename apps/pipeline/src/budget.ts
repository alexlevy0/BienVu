import {MAX_MONTHLY_BUDGET_CENTS,MIN_BUDGET_SAFETY_MARGIN_CENTS} from '@bienvu/contracts';

export type Budget={month:string;paused:boolean;fixedAndOtherCents:number;committedCents:number;attempts:number;days:Record<string,number>;
  ceilingCents?:number;envelopeCents?:number};
export function budgetLimits(b:Pick<Budget,'ceilingCents'|'envelopeCents'>) {
  // Les anciens journaux gardent leur enveloppe. Une hausse exige une
  // configuration explicite, dans l'enveloppe autorisée commune au produit.
  const ceilingCents=b.ceilingCents??2500,envelopeCents=b.envelopeCents??3000;
  if(!Number.isSafeInteger(ceilingCents)||!Number.isSafeInteger(envelopeCents)||ceilingCents<0
    ||ceilingCents>MAX_MONTHLY_BUDGET_CENTS-MIN_BUDGET_SAFETY_MARGIN_CENTS||envelopeCents>MAX_MONTHLY_BUDGET_CENTS
    ||envelopeCents-ceilingCents<MIN_BUDGET_SAFETY_MARGIN_CENTS)throw new Error('BUDGET_CONFIG_INVALID');
  return {ceilingCents,envelopeCents};
}
export function reserve(b:Budget,now=new Date(),provisionCents=50):Budget {
  if(!Number.isSafeInteger(provisionCents)||provisionCents<50||provisionCents>100)throw new Error('BUDGET_CONFIG_INVALID');
  const {ceilingCents}=budgetLimits(b);
  const day=now.toISOString().slice(0,10),month=day.slice(0,7);
  if(b.paused)throw new Error('PROBES_PAUSED');
  if(b.month!==month)throw new Error('BUDGET_MONTH_REQUIRES_RECONCILIATION');
  if(b.attempts>=5)throw new Error('SPRINT_RENDER_LIMIT');
  if((b.days[day]??0)>=5)throw new Error('DAILY_LIMIT');
  if(b.fixedAndOtherCents+b.committedCents+provisionCents>ceilingCents)throw new Error('BUDGET_LIMIT');
  return {...b,attempts:b.attempts+1,committedCents:b.committedCents+provisionCents,days:{...b.days,[day]:(b.days[day]??0)+1}};
}
export function summary(b:Budget) {
  const engaged=b.fixedAndOtherCents+b.committedCents;
  return {...b,...budgetLimits(b),engagedCents:engaged,remainingEnvelopeCents:Math.max(0,budgetLimits(b).envelopeCents-engaged),alert:engaged>=2000,
    note:'Réservations conservatrices, échecs inclus. Aucun plafond fournisseur garanti. Les allocations partagées ne sont pas soustraites.'};
}
export function containerGrossUsd(cpuSeconds:number,uptimeSeconds:number,instanceType:'standard-2'|'standard-3'='standard-2') {
  // cpuSeconds cumule l'utilisation active de tous les vCPU. La RAM et le
  // disque provisionnés sont facturés pendant toute la durée de fonctionnement.
  if(!Number.isFinite(cpuSeconds)||!Number.isFinite(uptimeSeconds)||cpuSeconds<0||uptimeSeconds<0)throw new Error('INVALID_MEASUREMENT');
  const ramGiB=instanceType==='standard-3'?8:6,diskGB=instanceType==='standard-3'?16:12;
  return cpuSeconds*0.000020+uptimeSeconds*ramGiB*0.0000025+uptimeSeconds*diskGB*0.00000007;
}
