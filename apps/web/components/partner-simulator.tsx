'use client';
import {useState} from 'react';
import {partnerCommissionCents,partnerProgram} from '@bienvu/contracts';
const euros=(amount:number)=>new Intl.NumberFormat('fr-FR',{style:'currency',currency:'EUR',maximumFractionDigits:Number.isInteger(amount)?0:2}).format(amount);
const clamp=(value:string,min:number,max:number)=>Math.min(max,Math.max(min,Number(value)||min));
export function PartnerSimulator() {
  const [clientInput,setClientInput]=useState('10'),[spendInput,setSpendInput]=useState('100');
  const clients=Math.round(clamp(clientInput,1,50)),spend=Math.round(clamp(spendInput,0,1000)*100)/100;
  const commission=partnerCommissionCents(clients,Math.round(spend*100))/100;
  return <section className="partner-simulator" aria-labelledby="partner-simulator-title">
    <div className="partner-simulator-heading"><h2 id="partner-simulator-title">Simulateur de commissions</h2><span>Simulation indicative</span></div>
    <p>Estimez vos commissions en fonction de vos recommandations.</p>
    <div className="partner-simulator-field"><label htmlFor="partner-clients">Clients actifs</label><div>
      <input id="partner-clients" type="number" inputMode="numeric" min="1" max="50" step="1" value={clientInput}
        onChange={e=>setClientInput(e.target.value)} onBlur={()=>setClientInput(String(clients))}/>
      <div className="partner-slider"><input type="range" min="1" max="50" step="1" value={clients} aria-label="Ajuster le nombre de clients actifs"
        onChange={e=>setClientInput(e.target.value)}/><div aria-hidden="true">{[1,5,10,25,50].map(value=><span key={value} style={{left:`${(value-1)/49*100}%`}}>{value}</span>)}</div></div>
    </div></div>
    <div className="partner-simulator-field"><label htmlFor="partner-spend">Dépense mensuelle moyenne</label><div>
      <div className="partner-amount-input"><input id="partner-spend" type="number" inputMode="decimal" min="0" max="1000" step="0.01" value={spendInput}
        aria-describedby="partner-spend-unit" onChange={e=>setSpendInput(e.target.value)} onBlur={()=>setSpendInput(String(spend))}/><span id="partner-spend-unit">€ HT</span></div>
      <div className="partner-slider"><input type="range" min="0" max="1000" step="1" value={spend} aria-label="Ajuster la dépense mensuelle moyenne en euros hors taxes"
        onChange={e=>setSpendInput(e.target.value)}/><div aria-hidden="true">{[0,100,250,500,1000].map(value=><span key={value} style={{left:`${value/1000*100}%`}}>{value.toLocaleString('fr-FR')}</span>)}</div></div>
    </div></div>
    <div className="partner-simulator-result"><span>Votre commission estimée</span><output aria-live="polite" aria-atomic="true">{euros(commission)} <small>/ mois</small></output>
      <p>{clients} client{clients>1?'s':''} × {euros(spend)} HT × {partnerProgram.commissionPercent} %</p></div>
    <p className="partner-simulator-note">Estimation selon les paiements HT encaissés des clients, pendant les {partnerProgram.months} mois de commission. Aucun revenu n’est garanti.</p>
  </section>;
}
