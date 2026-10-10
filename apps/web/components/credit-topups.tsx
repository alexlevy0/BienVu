'use client';
import {analyticsFetch as fetch} from '../lib/product-analytics';
import Link from 'next/link';
import {useEffect,useImperativeHandle,useRef,useState,type Ref,type ReactNode} from 'react';
import {creditPacks,type CreditPackCode} from '@bienvu/contracts';
import {useAccount} from './account';
import {HomeIcon} from './home-icons';

type Purchase={id:string;credits:number;priceCents:number;mode:string;at:string;remaining:number;reversed:number;disputed:number;validUntil:string};
type CheckoutKey={id:string;expires:number};
const defaultPack=creditPacks[0].code;
const bestPack=creditPacks.reduce((best,p)=>p.priceCents/p.credits<best.priceCents/best.credits?p:best).code;
const differentUnitPrices=new Set(creditPacks.map(p=>p.priceCents/p.credits)).size>1;
export type CreditTopupsHandle={choose(pack:CreditPackCode):void};
function TopupIcon({name,size=24}:{name:'card'|'chart'|'info';size?:number}){
 return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
  {name==='card'?<><rect x="2" y="5" width="20" height="15" rx="2"/><path d="M2 10h20M6 15h4"/></>:name==='chart'?<path d="M5 20v-6m7 6V9m7 11V3"/>:<><circle cx="12" cy="12" r="10"/><path d="M12 11v6m0-10v.1"/></>}
 </svg>;
}
export function CreditTopups({enabled,mode,validDays=0,ref,helper}:{enabled:boolean;mode:'test'|'live'|null;validDays?:number;ref?:Ref<CreditTopupsHandle>;helper?:ReactNode}){
 const {me,loading,refreshRights}=useAccount(),identity=me?.agency.id,owner=useRef(identity);owner.current=identity;
 const [chosen,setChosen]=useState<CreditPackCode>(defaultPack),[busy,setBusy]=useState(false),[error,setError]=useState(''),[purchases,setPurchases]=useState<Purchase[]|null>(null),[revision,setRevision]=useState(0),[confirmation,setConfirmation]=useState(false);
 const section=useRef<HTMLElement>(null),paymentLock=useRef<object|null>(null),checkoutKeys=useRef(new Map<string,CheckoutKey>());
 useImperativeHandle(ref,()=>({choose(pack){if(paymentLock.current)return;setChosen(pack);setError('');section.current?.scrollIntoView({behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'auto':'smooth',block:'start'});}}),[]);
 useEffect(()=>{setChosen(defaultPack);setBusy(false);paymentLock.current=null;setError('');setPurchases(null);const confirmed=new URLSearchParams(location.search).get('recharge')==='confirmation';setConfirmation(confirmed);if(confirmed&&identity)for(const p of creditPacks){const storage=`bienvu:topup:${mode}:${identity}:${p.code}`;checkoutKeys.current.delete(storage);try{sessionStorage.removeItem(storage);}catch{}}if(!identity)return;const c=new AbortController();void fetch('/api/billing/topups',{signal:c.signal,cache:'no-store'}).then(async r=>{if(!r.ok)throw Error();return r.json() as Promise<{purchases:Purchase[]}>;}).then(b=>{if(!c.signal.aborted)setPurchases(b.purchases);}).catch(()=>{if(!c.signal.aborted)setError('L’historique des recharges est momentanément indisponible.');});return()=>c.abort();},[identity,revision,mode]);
 const pack=creditPacks.find(p=>p.code===chosen)??creditPacks[0],manages=me&&['owner','admin'].includes(me.role??'owner');
 const validity=validDays?'Valable 12 mois':'Sans expiration';
 async function buy(){if(paymentLock.current||loading||!me||!enabled||!manages)return;const attempt={};paymentLock.current=attempt;setBusy(true);setError('');const agency=identity;
  try{const storage=`bienvu:topup:${mode}:${agency}:${chosen}`;let key=checkoutKeys.current.get(storage);if(!key)try{const saved=JSON.parse(sessionStorage.getItem(storage)??'null') as {id?:unknown;expires?:unknown}|null;if(saved&&typeof saved.id==='string'&&/^[-a-zA-Z0-9_]{16,128}$/.test(saved.id)&&typeof saved.expires==='number')key={id:saved.id,expires:saved.expires};}catch{}if(!key||key.expires<=Date.now())key={id:crypto.randomUUID(),expires:Date.now()+44*60000};checkoutKeys.current.set(storage,key);try{sessionStorage.setItem(storage,JSON.stringify(key));}catch{/* Keep the same key in memory for retries. */}
   const r=await fetch('/api/billing/topups',{method:'POST',headers:{'Content-Type':'application/json','Idempotency-Key':key.id},body:JSON.stringify({pack:chosen})}),b=await r.json() as {url?:string};
   if(owner.current!==agency||paymentLock.current!==attempt)return;if(!r.ok||!b.url)throw Error(r.status===409?'Une recharge est déjà en cours. Reprenez le même pack ou attendez l’expiration du paiement.':'Impossible d’ouvrir le paiement. Votre solde reste disponible.');
   const url=new URL(b.url);if(url.hostname!=='checkout.stripe.com'||url.protocol!=='https:')throw Error('Lien de paiement indisponible.');location.assign(url.href);
  }catch(e){if(owner.current===agency&&paymentLock.current===attempt){paymentLock.current=null;setError(e instanceof Error?e.message:'Paiement indisponible.');setBusy(false);}}
 }
 return <section ref={section} className="offers-topups" id="recharges" aria-labelledby="offers-topups-heading">
  <header className="offers-topups-heading"><p className="offers-kicker">UN BESOIN PONCTUEL ?</p><h2 id="offers-topups-heading">Quelques crédits de plus.</h2><p>Une recharge, sans modifier votre abonnement.</p></header>
  <form className="offers-topup-layout" onSubmit={e=>{e.preventDefault();if(paymentLock.current||loading||!enabled)return;if(!me){location.assign('/connexion?next=/abonnement');return;}void buy();}}>
   <div className="offers-topup-selection">
    <fieldset disabled={busy}><legend>Choisissez votre recharge</legend><div className="offers-topup-options">
     {creditPacks.map(p=><label className={'offers-topup-choice'+(chosen===p.code?' offers-topup-choice-selected':'')} key={p.code}>
      <input type="radio" name="credit-pack" value={p.code} checked={chosen===p.code} onChange={()=>{setChosen(p.code);setError('');}}/>
      <span className="offers-topup-choice-copy"><span className="offers-topup-choice-title">{p.credits} crédits</span><span className="offers-topup-choice-price"><strong>{p.priceCents/100} €</strong><span>HT</span></span><span className="offers-topup-unit-price">{(p.priceCents/p.credits/100).toLocaleString('fr-FR',{maximumFractionDigits:2})} € HT par crédit</span>{differentUnitPrices&&p.code===bestPack&&<span className="offers-topup-best">Meilleur prix par crédit</span>}</span>
     </label>)}
    </div></fieldset>
    <p className="offers-topup-priority"><TopupIcon name="info" size={20}/>Les crédits achetés s’ajoutent à votre abonnement et n’ont pas de date d’expiration.</p>{helper}
   </div>
   <aside className="offers-topup-summary" aria-labelledby="offers-topup-summary-heading">
    <h3 id="offers-topup-summary-heading">Votre recharge</h3>
    <output className="offers-topup-summary-cost" aria-live="polite" aria-atomic="true"><span>{pack.credits} crédits</span><span className="offers-topup-summary-price"><strong>{pack.priceCents/100} €</strong><span>HT</span></span></output>
    <ul className="offers-topup-summary-benefits">
     <li><TopupIcon name="card"/><div><strong>Achat unique</strong><span>Un seul paiement.</span></div></li>
     <li><HomeIcon name="clock"/><div><strong>{validity}</strong><span>{validDays?'Utilisez vos crédits dans les 12 mois.':'Utilisez vos crédits quand vous voulez.'}</span></div></li>
     <li><TopupIcon name="chart"/><div><strong>Abonnement inchangé</strong><span>Votre abonnement reste le même.</span></div></li>
    </ul>
    <p className="offers-topup-terms"><Link href="/conditions">Conditions d’utilisation</Link> · <Link href="/confidentialite">Politique de confidentialité</Link>.</p>
    {me&&!manages&&<p className="offers-topup-access">Seuls le propriétaire et les administrateurs de l’agence peuvent acheter des crédits.</p>}
    {error&&<p className="offers-topup-error" role="alert">{error}</p>}
    <button type="submit" className="offers-action offers-action-primary offers-topup-pay" disabled={busy||loading||!enabled||Boolean(me)&&!manages} aria-busy={busy}>{busy?'Ouverture de Stripe…':`Acheter ${pack.credits} crédits`}<HomeIcon name="arrow" size={20}/></button>
    <p className="offers-topup-secure"><HomeIcon name="lock" size={15}/>{!enabled?'Paiements momentanément indisponibles':mode==='test'?'Paiement en mode test · Aucun débit réel':'Paiement sécurisé via Stripe'}</p>
   </aside>
  </form>
  {confirmation&&<p className="offers-billing-notice" role="status">Votre recharge apparaîtra dès que Stripe aura confirmé le paiement. <button type="button" disabled={busy} onClick={()=>{void refreshRights();setRevision(n=>n+1);}}>Actualiser mon solde</button></p>}
  {purchases&&purchases.length>0&&<details className="offers-topup-history"><summary>Mes recharges · {purchases.length}</summary><div className="offers-table-scroll"><table><thead><tr><th>Date</th><th>Pack</th><th>Montant HT</th><th>Crédits restants</th><th>Validité</th></tr></thead><tbody>{purchases.map(p=><tr key={p.id}><td>{new Date(p.at).toLocaleDateString('fr-FR')}</td><td>{p.credits} crédits {p.mode==='test'&&<small>Test</small>}</td><td>{(p.priceCents/100).toLocaleString('fr-FR',{style:'currency',currency:'EUR'})}</td><td>{p.disputed?'En attente · litige':p.remaining}{p.reversed>0&&<small>{p.reversed} crédit(s) annulé(s) après remboursement</small>}</td><td>{p.validUntil.startsWith('9999')?'Sans expiration':new Date(p.validUntil).toLocaleDateString('fr-FR')}</td></tr>)}</tbody></table></div><p>Les 50 dernières recharges. Les crédits réservés par une génération sont déjà retirés du solde disponible.</p></details>}
 </section>;
}
