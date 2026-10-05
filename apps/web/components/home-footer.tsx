'use client';

import Link from 'next/link';
import {HomeIcon, HomeWordmark} from './home-icons';

export function HomeFooter({onCreate}:{onCreate:()=>void}) {
  const backToTop=()=>{
    window.scrollTo({top:0,behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'instant':'smooth'});
    document.getElementById('home-listing-url')?.focus({preventScroll:true});
  };
  return <footer className="home-premium-footer" aria-label="Pied de page BienVu">
    <div className="home-premium-footer-columns">
      <div className="home-premium-footer-about">
        <Link className="home-premium-footer-logo" href="/" aria-label="BienVu, accueil"><HomeWordmark/></Link>
        <h2>L’immobilier, en mouvement.</h2>
        <p>Transformez vos annonces en vidéos<br className="home-premium-footer-desktop-break"/> qui donnent envie de visiter.</p>
        <div className="home-premium-footer-language">
          <label className="sr-only" htmlFor="home-footer-language">Langue du site</label>
          <div className="home-premium-footer-language-control">
            <select id="home-footer-language" defaultValue="fr" aria-describedby="home-footer-language-note">
              <option value="fr">Français</option>
              <option value="coming-soon" disabled>Autres langues — bientôt disponibles</option>
            </select>
            <HomeIcon name="chevron" size={18}/>
          </div>
          <p id="home-footer-language-note">D’autres langues arrivent bientôt.</p>
        </div>
      </div>
      <nav className="home-premium-footer-column" aria-labelledby="home-footer-product-title">
        <h3 id="home-footer-product-title">Produit</h3>
        <button type="button" onClick={onCreate}>Créer une vidéo</button>
        <Link href="/explorer">Explorer</Link>
        <Link href="/editeur">Éditeur</Link>
        <Link href="/abonnement">Tarifs</Link>
      </nav>
      <nav className="home-premium-footer-column" aria-labelledby="home-footer-resources-title">
        <h3 id="home-footer-resources-title">Ressources</h3>
        <Link href="/comment-ca-marche">Comment ça marche</Link>
        <Link href="/modeles-video-immobilier">Modèles de vidéos</Link>
        <Link href="/guides">Guides immobiliers</Link>
        <Link href="/sources">Sources d’import</Link>
        <a href="#home-life-faq-title">Questions fréquentes</a>
      </nav>
      <div className="home-premium-footer-column home-premium-footer-contact">
        <h3>Parlons de votre agence</h3>
        <p>Une question, une idée, un projet ?</p>
        <a href="mailto:contact@bienvu.online">Nous contacter <HomeIcon name="external" size={18}/></a>
      </div>
    </div>
    <div className="home-premium-footer-signature">
      <span className="home-premium-footer-big-logo" aria-hidden="true"><HomeWordmark/></span>
      <svg className="home-premium-footer-star" width="48" height="48" viewBox="0 0 48 48" aria-hidden="true"><path d="M24 0C27 15 33 21 48 24C33 27 27 33 24 48C21 33 15 27 0 24C15 21 21 15 24 0Z" fill="currentColor"/></svg>
      <p>Vos biens méritent{' '}<br/>d’être bien vus.</p>
    </div>
    <div className="home-premium-footer-bottom">
      <small>© {new Date().getUTCFullYear()} BienVu</small>
      <nav aria-label="Informations légales">
        <Link href="/conditions#service">Mentions légales</Link>
        <Link href="/confidentialite">Confidentialité</Link>
        <Link href="/conditions">CGU</Link>
        <Link href="/conditions#offres">CGV</Link>
        <Link href="/confidentialite#cookies">Cookies</Link>
      </nav>
      <button type="button" className="home-premium-footer-back-top" onClick={backToTop} aria-label="Retour en haut de page"><HomeIcon name="arrow" size={20}/></button>
    </div>
  </footer>;
}
