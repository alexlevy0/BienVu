'use client';
import Link from 'next/link';
import {useEffect,useRef,useState} from 'react';
import {creditPlans,CreditHistory} from '@bienvu/contracts';
import {useAccount} from './account';
import {HomeIcon} from './home-icons';
import {CreditTopups} from './credit-topups';
import type {BillingAvailability} from '../lib/billing';
type Billing=BillingAvailability&{topupValidDays?:number;subscription:{plan:string;status:string;cancelAtPeriodEnd:number;periodEnd:string;mode:string}|null};
const benefits=[
  ['Import par lien ou saisie manuelle','Voix off et sous-titres'],
  ['Formats vertical et horizontal','Sans filigrane après connexion'],
  ['Logo et couleurs de votre agence','Zooms et mouvements inclus'],
];
export function Offers({availability}:{availability:BillingAvailability}){
  const {me}=useAccount();const owner=useRef(me?.agency.id);owner.current=me?.agency.id;
  const checkout=useRef<HTMLElement>(null);
  const [photos,setPhotos]=useState(0),[history,setHistory]=useState<CreditHistory|null>(null),[error,setError]=useState(''),[busy,setBusy]=useState(false);
  const [billing,setBilling]=useState<Billing|null>(null),[chosen,setChosen]=useState<'plus'|'pro'|null>(null),[accepted,setAccepted]=useState(false),[paymentBusy,setPaymentBusy]=useState(false),[paymentError,setPaymentError]=useState(''),[confirmation,setConfirmation]=useState(false);
  const payments=billing??availability;
  useEffect(()=>{if(chosen)checkout.current?.scrollIntoView({behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'auto':'smooth',block:'center'});},[chosen]);
  useEffect(()=>{setBilling(null);if(!me)return;const c=new AbortController();setConfirmation(new URLSearchParams(location.search).get('paiement')==='confirmation');void fetch('/api/billing',{signal:c.signal}).then(r=>r.ok?r.json() as Promise<Billing>:null).then(setBilling).catch(()=>{});return()=>c.abort();},[me?.agency.id]);
  async function payment(portal=false){if(paymentBusy||!me)return;setPaymentBusy(true);setPaymentError('');try{
    const storageKey=`bienvu:checkout:${billing?.mode}:${me.agency.id}:${chosen}`,stored=sessionStorage.getItem(storageKey);let key=stored?JSON.parse(stored):null;
    if(!key||key.expires<Date.now()){key={id:crypto.randomUUID(),expires:Date.now()+25*60000};sessionStorage.setItem(storageKey,JSON.stringify(key));}
    const r=await fetch('/api/billing/'+(portal?'portal':'checkout'),{method:'POST',headers:{'Content-Type':'application/json','Idempotency-Key':key.id},body:JSON.stringify(portal?{}:{plan:chosen,accepted})});
    const b=await r.json() as {url?:string};if(!r.ok||!b.url)throw Error(r.status===409?'Un abonnement ou une demande de paiement est déjà en cours. Actualisez cette page.':'Le paiement est momentanément indisponible. Aucun crédit n’a été débité.');
    location.assign(b.url);
  }catch(e){setPaymentError(e instanceof Error?e.message:'Paiement indisponible.');setPaymentBusy(false);}}
  const manages=me&&['owner','admin'].includes(me.role??'owner'),hasSubscription=billing?.subscription&&billing.subscription.mode===billing.mode&&!['canceled','incomplete_expired'].includes(billing.subscription.status);
  useEffect(()=>{setHistory(null);setError('');if(!me)return;const controller=new AbortController();
    void fetch('/api/credits',{cache:'no-store',signal:controller.signal}).then(async response=>{
      if(!response.ok)throw Error();const data=CreditHistory.parse(await response.json());if(!controller.signal.aborted)setHistory(data);
    }).catch(()=>{if(!controller.signal.aborted)setError('Historique momentanément indisponible.');});return()=>controller.abort();
  },[me?.agency.id,me?.rights.developmentRemaining,me?.rights.creditReserved]);
  async function more(){if(!history?.nextCursor||busy)return;setBusy(true);const agency=owner.current;
    try{const response=await fetch('/api/credits?cursor='+encodeURIComponent(history.nextCursor),{cache:'no-store'});if(!response.ok)throw Error();
      const data=CreditHistory.parse(await response.json());if(owner.current===agency)setHistory(current=>current?{...data,entries:[...current.entries,...data.entries]}:data);
    }catch{if(owner.current===agency)setError('La suite de votre historique est momentanément indisponible.');}finally{setBusy(false);}}
  const cost=1+photos,date=(at:string)=>new Intl.DateTimeFormat('fr-FR',{dateStyle:'medium'}).format(new Date(at));
  return <div className="offers-page"><Link className="offers-back" href="/">← Retour au studio</Link>
    <header className="offers-heading">
      <h1>Vos vidéos, <em>à votre rythme.</em></h1>
      <p>Choisissez les crédits qui accompagnent votre activité.</p>
      <div className="offers-credit-rules" aria-label="Le coût en crédits">
        <span><HomeIcon name="video" size={23}/>1 vidéo = 1 crédit</span>
        <span><HomeIcon name="image" size={23}/>+ 1 crédit / photo animée</span>
      </div>
    </header>
    {confirmation&&<p role="status" className="offers-billing-notice">Votre paiement est en cours de confirmation. Les crédits apparaîtront après validation de la facture par Stripe. <button type="button" onClick={()=>location.reload()}>Actualiser</button></p>}
    {paymentError&&<p role="alert" className="offers-billing-notice">{paymentError}</p>}
    <div className="offers-cards">{creditPlans.map(plan=>{const videos=Math.floor(plan.credits/cost);return <section className={'offers-card offers-card-'+plan.code} key={plan.code} aria-labelledby={'offers-'+plan.code}>{plan.code==='plus'&&<span className="offers-recommended">Recommandé</span>}<h2 id={'offers-'+plan.code}>{plan.name}</h2><p className="offers-card-description">{plan.description}</p><div className="offers-price"><strong>{plan.price} €</strong><span>{plan.price?'HT / mois':'/ mois'}</span></div><p className="offers-quota"><strong>{plan.credits} crédits par mois</strong></p><p className="offers-equivalent">{videos>0?<>Jusqu’à {videos} vidéo{videos>1?'s':''}{photos>0&&<><span aria-hidden="true"> · </span><span>{`${photos} photo${photos>1?'s':''} animée${photos>1?'s':''} par vidéo`}</span></>}</>:'Réduisez les animations pour cette offre.'}</p>
      {plan.code==='gratuit'?me?.rights.creditKind==='free'?<span className="offers-action offers-action-current">Votre offre actuelle</span>:<Link className="offers-action offers-action-outline" href={me?'/':'/connexion'}>{me?'Créer ma vidéo':'Obtenir mes crédits'}<HomeIcon name="arrow" size={17}/></Link>:<button className={'offers-action '+(plan.code==='plus'?'offers-action-primary':'offers-action-outline')} type="button" disabled={!payments.enabled||Boolean(me)&&(!billing?.enabled||!manages)||paymentBusy} onClick={()=>{if(!me){location.assign('/connexion?next=/abonnement');return;}if(hasSubscription){void payment(true);return;}setChosen(plan.code as 'plus'|'pro');setAccepted(false);}}>{hasSubscription&&billing?.subscription?.plan===plan.code?'Gérer mon offre':'Passer à '+plan.name}<HomeIcon name="arrow" size={17}/></button>}
      </section>;})}</div>
    <section className="offers-included" aria-labelledby="offers-included-heading">
      <h2 id="offers-included-heading">Tout est inclus. Vous choisissez le volume.</h2>
      <div className="offers-included-grid">{benefits.map(group=><ul key={group[0]}>{group.map(benefit=><li key={benefit}><span className="offers-included-check"><HomeIcon name="check" size={19}/></span>{benefit}</li>)}</ul>)}</div>
    </section>
    <section className="offers-calculator" aria-labelledby="offers-calculator-heading">
      <div><h2 id="offers-calculator-heading">Estimez le coût d’une vidéo</h2><p>Ajustez le nombre de photos animées pour voir le nombre de crédits.</p></div>
      <div className="offers-photo-stepper" role="group" aria-label="Nombre de photos animées">
        <button type="button" aria-label="Retirer une photo animée" disabled={photos===0} onClick={()=>setPhotos(n=>Math.max(0,n-1))}><span aria-hidden="true">−</span></button>
        <span>{photos} photo{photos>1?'s':''} animée{photos>1?'s':''}</span>
        <button type="button" aria-label="Ajouter une photo animée" disabled={photos===12} onClick={()=>setPhotos(n=>Math.min(12,n+1))}><HomeIcon name="plus" size={18}/></button>
      </div>
      <output className="offers-calculated-cost" aria-live="polite" aria-atomic="true"><strong>{cost} crédit{cost>1?'s':''}</strong><span>pour cette vidéo</span></output>
      <div className="offers-ai-animations"><svg aria-hidden="true" viewBox="0 0 32 32"><path d="m12 5 2.5 7.5L22 15l-7.5 2.5L12 25l-2.5-7.5L2 15l7.5-2.5L12 5Zm13 11 1.5 4.5L31 22l-4.5 1.5L25 28l-1.5-4.5L19 22l4.5-1.5L25 16ZM24 2l1 3 3 1-3 1-1 3-1-3-3-1 3-1 1-3Z"/></svg><span>Animations IA</span></div>
    </section>
    <p className="offers-rollover">Crédits renouvelés chaque mois, sans cumul. Résiliation depuis votre abonnement, à la fin de la période payée.</p>
    {!payments.enabled?<p className="offers-billing-notice">Les abonnements et les recharges sont momentanément indisponibles. Les crédits gratuits ne nécessitent aucun paiement.</p>:payments.mode==='test'&&<p className="offers-billing-notice">Les abonnements et les recharges sont en mode test : aucun paiement réel n’est effectué. Utilisez uniquement les moyens de paiement de test.</p>}
    {hasSubscription&&manages&&<button type="button" className="offers-action offers-action-outline offers-manage" disabled={paymentBusy} onClick={()=>void payment(true)}>Gérer mon abonnement et mes factures<HomeIcon name="arrow" size={17}/></button>}
    {me&&<section className="offers-wallet" aria-label="Vos crédits"><div><h2>Vos crédits</h2><strong>{me.rights.developmentRemaining}</strong> disponibles</div><div>{me.rights.creditReserved} réservé(s) · {me.rights.creditConsumed} utilisé(s)<p>{me.rights.creditMonthly??me.rights.developmentRemaining} mensuels · {me.rights.creditPurchased??0} en recharge</p><p>{me.rights.renewalAt?'Crédits mensuels renouvelés le '+date(me.rights.renewalAt)+' · sans report':'Recharges conservées'}</p></div><a href="#credit-history">Voir mon historique ↓</a></section>}
    {chosen&&<section ref={checkout} className="offers-checkout-confirm" aria-label="Confirmer l’abonnement"><h2>BienVu {chosen==='plus'?'Plus':'Pro'}</h2><p>{chosen==='plus'?'19 € HT · 40':'49 € HT · 120'} crédits par mois, renouvellement automatique, sans report des crédits. Résiliation à la fin de la période payée.</p><label><input type="checkbox" checked={accepted} onChange={e=>setAccepted(e.target.checked)}/>J’accepte les <Link href="/conditions">conditions d’utilisation</Link> et j’ai lu la <Link href="/confidentialite">politique de confidentialité</Link>.</label><div><button type="button" disabled={paymentBusy} onClick={()=>setChosen(null)}>Annuler</button><button type="button" disabled={!accepted||paymentBusy} onClick={()=>void payment()}> {paymentBusy?'Ouverture…':'Continuer vers Stripe'}</button></div></section>}
    <CreditTopups enabled={payments.enabled} mode={payments.mode} validDays={billing?.topupValidDays}/>
    <section className="offers-trial-note"><div><h2>Essayez sans compte</h2><p>1 crédit offert pour une vidéo avec les mouvements classiques. Aperçu filigrané, puis téléchargement sans filigrane après connexion.</p><p className="offers-trial-detail">Cet essai ne décompte pas vos 3 crédits mensuels.</p></div><Link href="/">Essayer gratuitement<HomeIcon name="arrow" size={18}/></Link></section>
    <section className="offers-comparison"><h2>Comparez les offres</h2><div className="offers-table-scroll"><table><thead><tr><th scope="col">Fonctionnalités</th>{creditPlans.map(plan=><th key={plan.code} scope="col">{plan.name}</th>)}</tr></thead><tbody><tr><th scope="row">Crédits mensuels</th>{creditPlans.map(plan=><td key={plan.code}>{plan.credits}</td>)}</tr><tr><th scope="row">Prix mensuel</th>{creditPlans.map(plan=><td key={plan.code}>{plan.price} €{plan.price?' HT':''}</td>)}</tr><tr><th scope="row">Coût d’une vidéo</th><td>1 crédit</td><td>1 crédit</td><td>1 crédit</td></tr><tr><th scope="row">Photo animée par IA</th><td>+ 1 crédit</td><td>+ 1 crédit</td><td>+ 1 crédit</td></tr><tr><th scope="row">Voix, sous-titres et mouvements classiques</th><td>Inclus</td><td>Inclus</td><td>Inclus</td></tr></tbody></table></div></section>
    {me&&<section className="offers-credit-history" id="credit-history"><h2>Historique de vos crédits</h2><p>Les crédits sont réservés au lancement. Les nouvelles animations réussies sont conservées 90 jours et débitées une seule fois, même si le montage échoue. Le crédit vidéo est restitué si l’export échoue.</p>{error&&<p role="alert">{error}</p>}{!history&&!error?<p>Chargement…</p>:history?.entries.length?<><div className="offers-table-scroll"><table><thead><tr><th scope="col">Création</th><th scope="col">État</th><th scope="col">Réservés</th><th scope="col">Utilisés</th><th scope="col">Restitués</th></tr></thead><tbody>{history.entries.map(entry=><tr key={entry.id}><th scope="row"><Link href={'/historique/'+entry.id}>{entry.title}</Link><small>{date(entry.at)}</small></th><td>{entry.gift?'Essai offert':entry.status==='ready'?'Terminée':entry.status==='failed'?'Échouée':'En préparation'}</td><td>{entry.reserved}</td><td>{entry.gift?'Offert':entry.used}</td><td>{entry.refunded}</td></tr>)}</tbody></table></div>{history.nextCursor&&<button className="offers-action offers-action-outline offers-history-more" type="button" disabled={busy} onClick={()=>void more()}>{busy?'Chargement…':'Voir la suite'}</button>}</>:history&&<p>Votre première création apparaîtra ici.</p>}</section>}
    <section className="offers-faq"><h2>Une question ?</h2><details><summary>Comment mes crédits sont-ils décomptés ?</summary><p>Une vidéo coûte 1 crédit pour 20, 30 ou 40 secondes. Chaque photo animée par IA ajoute 1 crédit. Le coût maximum est affiché avant le lancement. Télécharger ou revoir une vidéo ne coûte rien.</p></details><details><summary>Et si une création échoue ?</summary><p>Si l’export échoue, le crédit vidéo est restitué. Une animation échouée garde un mouvement classique et son supplément est restitué. Les animations réussies restent dans votre bibliothèque pendant 90 jours ; elles sont débitées une seule fois et réutilisables pour la même photo au même format.</p></details><details><summary>Les crédits gratuits se renouvellent-ils ?</summary><p>Un compte confirmé reçoit 3 crédits chaque mois à partir de son inscription, sans report. L’essai sans compte offre 1 crédit par visiteur. La vérification humaine et les limites du service restent applicables.</p></details><details><summary>Puis-je changer ou arrêter mon abonnement ?</summary><p>Gérez vos factures, votre moyen de paiement et votre résiliation depuis « Gérer mon abonnement ». La résiliation prend effet à la fin de la période déjà payée. Pour changer d’offre, contactez contact@bienvu.online.</p></details></section><footer className="offers-footer"><nav aria-label="Informations"><Link href="/conditions">Conditions</Link><Link href="/confidentialite">Confidentialité</Link><a href="mailto:contact@bienvu.online">Nous contacter</a></nav><span>{!payments.enabled?'Paiements momentanément indisponibles':payments.mode==='test'?'Paiements en mode test · Aucun débit réel':'Paiement sécurisé par Stripe'}</span></footer>
  </div>;
}
