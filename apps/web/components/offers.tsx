'use client';

import Link from 'next/link';
import {useAccount} from './account';
import {HomeIcon} from './home-icons';

const benefits = [
  'Import par lien ou saisie manuelle',
  'Voix off française',
  'Formats vertical 9:16 et horizontal 16:9',
  'Téléchargement sans filigrane avec un crédit',
  'Logo et couleurs de votre agence',
];

const plans = [
  {code: 'gratuit', name: 'Gratuit', description: 'Pour découvrir BienVu', price: '0', quota: 3},
  {code: 'plus', name: 'Plus', description: 'Pour publier régulièrement', price: '19', quota: 20},
  {code: 'pro', name: 'Pro', description: 'Pour toutes vos annonces', price: '49', quota: 60},
] as const;

export function Offers() {
  const {me} = useAccount();
  const freeCurrent = me?.rights.creditKind === 'free';

  return <div className="offers-page">
    <Link className="offers-back" href="/"><span aria-hidden="true">←</span> Retour au studio</Link>
    <header className="offers-heading">
      <p className="offers-kicker">ABONNEMENTS</p>
      <h1>Des vidéos à <em>votre rythme.</em></h1>
      <p>Choisissez le nombre de vidéos dont votre agence a besoin.</p>
      <span>Une même qualité vidéo pour chaque offre.</span>
    </header>

    <div className="offers-cards">
      {plans.map(plan => <section className={`offers-card offers-card-${plan.code}`} key={plan.code} aria-labelledby={`offers-${plan.code}`}>
        {plan.code === 'plus' && <span className="offers-recommended">Recommandé</span>}
        <h2 id={`offers-${plan.code}`}>{plan.name}</h2>
        <p className="offers-card-description">{plan.description}</p>
        <div className="offers-price"><strong>{plan.price} €</strong><span>{plan.code === 'gratuit' ? '/ mois' : 'HT / mois'}</span></div>
        <p className="offers-quota"><strong>{plan.quota} vidéos par mois</strong></p>
        {plan.code === 'gratuit'
          ? freeCurrent
            ? <span className="offers-action offers-action-current">Votre offre actuelle</span>
            : <Link className="offers-action offers-action-outline" href="/">Créer ma vidéo <HomeIcon name="arrow" size={17}/></Link>
          : <button className={`offers-action ${plan.code === 'plus' ? 'offers-action-primary' : 'offers-action-outline'}`} type="button" disabled title="Les abonnements payants ne sont pas encore ouverts">
              Passer à {plan.name} <HomeIcon name="arrow" size={17}/>
            </button>}
        <ul className="offers-benefits">
          {benefits.map(benefit => <li key={benefit}><span aria-hidden="true">✓</span>{benefit}</li>)}
        </ul>
      </section>)}
    </div>
    <p className="offers-rollover">Les quotas se renouvellent chaque mois. Les abonnements payants arrivent bientôt.</p>

    <section className="offers-comparison" aria-labelledby="offers-compare-title">
      <h2 id="offers-compare-title">Comparez les offres</h2>
      <div className="offers-table-scroll"><table>
        <thead><tr><th scope="col">Fonctionnalités</th><th scope="col">Gratuit</th><th scope="col">Plus</th><th scope="col">Pro</th></tr></thead>
        <tbody>
          <tr><th scope="row">Vidéos par mois</th><td>3</td><td>20</td><td>60</td></tr>
          <tr><th scope="row">Voix off française</th><td>✓</td><td>✓</td><td>✓</td></tr>
          <tr><th scope="row">Téléchargement sans filigrane avec un crédit</th><td>✓</td><td>✓</td><td>✓</td></tr>
        </tbody>
      </table></div>
    </section>

    <section className="offers-faq" aria-labelledby="offers-faq-title">
      <h2 id="offers-faq-title">Une question ?</h2>
      <details><summary>Que se passe-t-il si j’atteins mon quota ?</summary><p>Vous pouvez toujours consulter vos vidéos. Les nouvelles créations attendent le renouvellement de votre quota ; une création échouée ne consomme pas de crédit.</p></details>
      <details><summary>Puis-je changer ou arrêter mon abonnement ?</summary><p>La souscription payante n’est pas encore ouverte. Ses modalités de changement et de résiliation seront présentées avant tout paiement.</p></details>
    </section>
    <footer className="offers-footer"><nav aria-label="Informations"><Link href="/conditions">Conditions</Link><Link href="/confidentialite">Confidentialité</Link><a href="mailto:contact@bienvu.online">Nous contacter</a></nav><span>Abonnements payants en préparation</span></footer>
  </div>;
}
