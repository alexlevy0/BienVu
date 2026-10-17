import Link from 'next/link';
import {HomeIcon} from './home-icons';
import type {PublicFreeOffer} from '../lib/free-offer';

export function OffersFreePlan({offer,signedIn}:{offer:PublicFreeOffer;signedIn:boolean}){
  const monthly=offer.monthlyCredits!==null;
  return <section className="offers-free" aria-labelledby="offers-free-title">
    <div className="offers-free-main">
      <span className="offers-free-icon"><HomeIcon name="sparkle" size={27}/></span>
      <div className="offers-free-copy">
        <span className="offers-free-kicker">{monthly?'L’offre gratuite':'L’essai gratuit'}</span>
        <h2 id="offers-free-title">Commencez gratuitement.</h2>
        <p>{monthly?<><strong>{offer.monthlyCredits} crédit{offer.monthlyCredits===1?'':'s'} offert{offer.monthlyCredits===1?'':'s'} chaque mois</strong> pour découvrir le studio.</>:<>1 vidéo classique offerte, sans créer de compte.</>}</p>
      </div>
      <div className="offers-free-price"><strong>0 €</strong>{monthly&&<span>/ mois</span>}</div>
      <div className="offers-free-actions">
        <Link className="offers-action offers-action-primary" href={monthly&&!signedIn?'/connexion?mode=signup&next=%2F':'/'}>Commencer gratuitement <HomeIcon name="arrow" size={17}/></Link>
        <span><HomeIcon name="check" size={14}/> Sans carte bancaire</span>
      </div>
    </div>
    <div className="offers-free-detail">
      {monthly&&<p>Après vérification de l’e-mail, pour les comptes sans abonnement. Crédits non reportables.</p>}
      {offer.anonymousTrial&&<p>{monthly&&<><Link href="/">Essayer sans compte <HomeIcon name="arrow" size={13}/></Link><span className="offers-free-separator" aria-hidden="true"> · </span></>}1 vidéo classique offerte. Aperçu avec filigrane, puis téléchargement sans filigrane après connexion.</p>}
    </div>
  </section>;
}
