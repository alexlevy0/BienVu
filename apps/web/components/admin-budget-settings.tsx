'use client';
import {useId,useState,type FormEvent} from 'react';
import {DEFAULT_MONTHLY_BUDGET_CENTS,MAX_MONTHLY_BUDGET_CENTS,MIN_BUDGET_SAFETY_MARGIN_CENTS,type AdminAction,type AdminOverview} from '@bienvu/contracts';
import {monthlyBudgetForm} from '../lib/admin-budget';

const euro=(cents:number)=>new Intl.NumberFormat('fr-FR',{style:'currency',currency:'EUR'}).format(cents/100);
export function AdminBudgetSettings({data,confirm}:{data:AdminOverview;confirm:(action:AdminAction)=>void}){
  const budget=data.budget,month=data.at.slice(0,7),errorId=useId();
  const [envelope,setEnvelope]=useState(String((budget?.envelopeCents??DEFAULT_MONTHLY_BUDGET_CENTS)/100));
  const [ceiling,setCeiling]=useState(String((budget?.ceilingCents??DEFAULT_MONTHLY_BUDGET_CENTS*.9)/100));
  const [opening,setOpening]=useState('8'),[paused,setPaused]=useState(budget?.paused===1);
  const {input,error,engaged}=monthlyBudgetForm(data,{envelope,ceiling,opening,paused}),valid=error===null;
  function submit(event:FormEvent){event.preventDefault();if(valid)confirm(input);}
  return <section className="admin-card admin-card-wide admin-budget-settings"><div className="admin-card-heading"><h3>Régler le budget mensuel</h3><span>{month} · UTC</span></div>
    <p className="admin-muted">{budget?`Déjà provisionné : ${euro(engaged)}. Les réservations et les échecs restent comptés.`:'Ce mois n’est pas encore ouvert. Ajoutez les frais fixes et les dépenses déjà engagées avant de l’activer.'}</p>
    <form onSubmit={submit} className="admin-budget-form">
      <label className="admin-field">Enveloppe mensuelle (€)<input type="number" min={MIN_BUDGET_SAFETY_MARGIN_CENTS/100} max={MAX_MONTHLY_BUDGET_CENTS/100} step="0.01" required aria-describedby={error?errorId:undefined} value={envelope} onChange={e=>setEnvelope(e.target.value)}/></label>
      <label className="admin-field">Coupure des nouvelles générations (€)<input type="number" min={engaged/100} max={(MAX_MONTHLY_BUDGET_CENTS-MIN_BUDGET_SAFETY_MARGIN_CENTS)/100} step="0.01" required aria-describedby={error?errorId:undefined} value={ceiling} onChange={e=>setCeiling(e.target.value)}/></label>
      {!budget&&<label className="admin-field">Frais fixes et dépenses déjà engagées (€)<input type="number" min={0} max={(MAX_MONTHLY_BUDGET_CENTS-MIN_BUDGET_SAFETY_MARGIN_CENTS)/100} step="0.01" required aria-describedby={error?errorId:undefined} value={opening} onChange={e=>setOpening(e.target.value)}/><small>8 € proposés pour Workers Paid, avec marge de conversion et taxes.</small></label>}
      <label className="admin-budget-pause"><input type="checkbox" checked={paused} onChange={e=>setPaused(e.target.checked)}/>Suspendre ce budget mensuel</label>
      <p className="admin-muted">Choisissez votre budget, puis confirmez les montants. Gardez au moins {euro(MIN_BUDGET_SAFETY_MARGIN_CENTS)} entre la coupure et l’enveloppe. La coupure bloque les nouveaux traitements lorsqu’elle est atteinte. Les provisions de narration et de rendu sont comprises dans le total. Chaque nouveau mois doit être ouvert ici.</p>
      {!valid&&<p className="admin-error" role="status" id={errorId}>{error}</p>}
      <button type="submit" className="admin-button admin-button-dark" disabled={!valid}>{budget?'Modifier le budget mensuel':'Ouvrir ce mois'}</button>
    </form>
  </section>;
}
