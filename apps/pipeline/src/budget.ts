export type Budget={month:string;paused:boolean;fixedAndOtherCents:number;committedCents:number;attempts:number;days:Record<string,number>;
  ceilingCents?:number;envelopeCents?:number};
export function budgetLimits(b:Pick<Budget,'ceilingCents'|'envelopeCents'>) {
  // Les anciens journaux gardent leur enveloppe. Une hausse exige une
  // configuration explicite ; Alex autorise 50 € depuis le 29/09/2026.
  const ceilingCents=b.ceilingCents??2500,envelopeCents=b.envelopeCents??3000;
  if(!Number.isSafeInteger(ceilingCents)||!Number.isSafeInteger(envelopeCents)||ceilingCents<0
    ||ceilingCents>4500||envelopeCents>5000||envelopeCents-ceilingCents<500)throw new Error('BUDGET_CONFIG_INVALID');
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
export function containerGrossUsd(cpuSeconds:number,uptimeSeconds:number) {
  // standard-2 : 1 vCPU, 6 GiB RAM provisionnée, 12 GB disque provisionné.
  if(!Number.isFinite(cpuSeconds)||!Number.isFinite(uptimeSeconds)||cpuSeconds<0||uptimeSeconds<0)throw new Error('INVALID_MEASUREMENT');
  return cpuSeconds*0.000020+uptimeSeconds*6*0.0000025+uptimeSeconds*12*0.00000007;
}
