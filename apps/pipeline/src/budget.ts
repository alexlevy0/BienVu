export type Budget={month:string;paused:boolean;fixedAndOtherCents:number;committedCents:number;attempts:number;days:Record<string,number>};
export function reserve(b:Budget,now=new Date()):Budget {
  const day=now.toISOString().slice(0,10),month=day.slice(0,7);
  if(b.paused)throw new Error('PROBES_PAUSED');
  if(b.month!==month)throw new Error('BUDGET_MONTH_REQUIRES_RECONCILIATION');
  if(b.attempts>=5)throw new Error('SPRINT_RENDER_LIMIT');
  if((b.days[day]??0)>=5)throw new Error('DAILY_LIMIT');
  if(b.fixedAndOtherCents+b.committedCents+50>2500)throw new Error('BUDGET_LIMIT');
  return {...b,attempts:b.attempts+1,committedCents:b.committedCents+50,days:{...b.days,[day]:(b.days[day]??0)+1}};
}
export function summary(b:Budget) {
  const engaged=b.fixedAndOtherCents+b.committedCents;
  return {...b,engagedCents:engaged,remainingEnvelopeCents:Math.max(0,3000-engaged),alert:engaged>=2000,
    note:'Réservations conservatrices, échecs inclus. Aucun plafond fournisseur garanti. Les allocations partagées ne sont pas soustraites.'};
}
export function containerGrossUsd(cpuSeconds:number,uptimeSeconds:number) {
  // standard-2 : 1 vCPU, 6 GiB RAM provisionnée, 12 GB disque provisionné.
  if(!Number.isFinite(cpuSeconds)||!Number.isFinite(uptimeSeconds)||cpuSeconds<0||uptimeSeconds<0)throw new Error('INVALID_MEASUREMENT');
  return cpuSeconds*0.000020+uptimeSeconds*6*0.0000025+uptimeSeconds*12*0.00000007;
}
