'use client';
import {useState,type FormEvent} from 'react';
import {AdminAction,MAX_MONTHLY_BUDGET_CENTS,type AdminOverview} from '@bienvu/contracts';

const euro=(cents:number)=>new Intl.NumberFormat('fr-FR',{style:'currency',currency:'EUR'}).format(cents/100);
export function AdminBudgetSettings({data,confirm}:{data:AdminOverview;confirm:(action:AdminAction)=>void}){
  const budget=data.budget,month=data.at.slice(0,7),engaged=budget?budget.baselineCents+budget.importsCents:0;
  const [envelope,setEnvelope]=useState(String((budget?.envelopeCents??10000)/100));
  const [ceiling,setCeiling]=useState(String((budget?.ceilingCents??9000)/100));
  const [opening,setOpening]=useState('8'),[paused,setPaused]=useState(budget?.paused===1);
  const input={action:'monthly_budget' as const,month,envelopeCents:Math.round(Number(envelope)*100),ceilingCents:Math.round(Number(ceiling)*100),
    openingCents:budget?0:Math.round(Number(opening)*100),paused,expected:budget?.revision??null,reason:'À renseigner'};
  const valid=envelope!==''&&ceiling!==''&&(!!budget||opening!=='')&&AdminAction.safeParse(input).success&&input.ceilingCents>=engaged;
  function submit(event:FormEvent){event.preventDefault();if(valid)confirm(input);}
  return <section className="admin-card admin-card-wide admin-budget-settings"><div className="admin-card-heading"><h3>Régler le budget mensuel</h3><span>{month} · UTC</span></div>
    <p className="admin-muted">{budget?`Déjà provisionné : ${euro(engaged)}. Les réservations et les échecs restent comptés.`:'Ce mois n’est pas encore ouvert. Ajoutez les frais fixes et les dépenses déjà engagées avant de l’activer.'}</p>
    <form onSubmit={submit} className="admin-budget-form">
      <label className="admin-field">Enveloppe mensuelle (€)<input type="number" min={5} max={MAX_MONTHLY_BUDGET_CENTS/100} step="0.01" required value={envelope} onChange={e=>setEnvelope(e.target.value)}/></label>
      <label className="admin-field">Coupure des nouvelles générations (€)<input type="number" min={0} max={95} step="0.01" required value={ceiling} onChange={e=>setCeiling(e.target.value)}/></label>
      {!budget&&<label className="admin-field">Frais fixes et dépenses déjà engagées (€)<input type="number" min={0} max={95} step="0.01" required value={opening} onChange={e=>setOpening(e.target.value)}/><small>8 € proposés pour Workers Paid, avec marge de conversion et taxes.</small></label>}
      <label className="admin-budget-pause"><input type="checkbox" checked={paused} onChange={e=>setPaused(e.target.checked)}/>Suspendre ce budget mensuel</label>
      <p className="admin-muted">Gardez au moins 5 € entre la coupure et l’enveloppe. Le plafond actuellement autorisé est de 100 €. Les provisions de narration et de rendu sont comprises dans le total. Chaque nouveau mois doit être ouvert ici.</p>
      {!valid&&<p className="admin-error" role="status">Vérifiez la marge de sécurité et les montants : la coupure doit couvrir les dépenses déjà provisionnées.</p>}
      <button type="submit" className="admin-button admin-button-dark" disabled={!valid}>{budget?'Modifier le budget mensuel':'Ouvrir ce mois'}</button>
    </form>
  </section>;
}
