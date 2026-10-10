import {AdminAction,MAX_MONTHLY_BUDGET_CENTS,MIN_BUDGET_SAFETY_MARGIN_CENTS,type AdminOverview} from '@bienvu/contracts';

const euro=(cents:number)=>new Intl.NumberFormat('fr-FR',{style:'currency',currency:'EUR'}).format(cents/100);
export type MonthlyBudgetFields={envelope:string;ceiling:string;opening:string;paused:boolean};
export function monthlyBudgetForm(data:Pick<AdminOverview,'at'|'budget'>,fields:MonthlyBudgetFields){
  const budget=data.budget,engaged=budget?budget.baselineCents+budget.importsCents:0;
  const values=[fields.envelope,fields.ceiling,...(!budget?[fields.opening]:[])];
  const input={action:'monthly_budget' as const,month:data.at.slice(0,7),envelopeCents:Math.round(Number(fields.envelope)*100),
    ceilingCents:Math.round(Number(fields.ceiling)*100),openingCents:budget?0:Math.round(Number(fields.opening)*100),
    paused:fields.paused,expected:budget?.revision??null,reason:'À renseigner'};
  let error:string|null=null;
  if(values.some(value=>value.trim()===''))error='Renseignez les montants du budget.';
  else if(values.some(value=>!Number.isFinite(Number(value))||!Number.isSafeInteger(Math.round(Number(value)*100))
    ||Math.abs(Number(value)*100-Math.round(Number(value)*100))>1e-6))error='Utilisez des montants valides avec au maximum deux décimales.';
  else if(input.envelopeCents>MAX_MONTHLY_BUDGET_CENTS)error=`L’enveloppe dépasse la limite technique de saisie de ${euro(MAX_MONTHLY_BUDGET_CENTS)}.`;
  else if(input.envelopeCents<MIN_BUDGET_SAFETY_MARGIN_CENTS)error=`L’enveloppe doit être d’au moins ${euro(MIN_BUDGET_SAFETY_MARGIN_CENTS)}.`;
  else if(input.ceilingCents<0)error='La coupure ne peut pas être négative.';
  else if(input.envelopeCents-input.ceilingCents<MIN_BUDGET_SAFETY_MARGIN_CENTS)
    error=`La coupure doit être au plus de ${euro(input.envelopeCents-MIN_BUDGET_SAFETY_MARGIN_CENTS)} pour garder ${euro(MIN_BUDGET_SAFETY_MARGIN_CENTS)} de marge.`;
  else if(input.ceilingCents<engaged)error=`La coupure doit couvrir les ${euro(engaged)} déjà provisionnés.`;
  else if(input.openingCents<0||input.openingCents>input.ceilingCents)error='Les frais déjà engagés doivent être compris entre 0 € et la coupure.';
  else if(!AdminAction.safeParse(input).success)error='Vérifiez les montants et le mois du budget.';
  return {input,error,engaged};
}
