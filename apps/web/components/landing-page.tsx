'use client';

import Link from 'next/link';
import {useEffect, useRef, useState, type FormEvent, type ReactNode} from 'react';
import {ImportUrl} from '@bienvu/contracts';
import {useAccount} from './account';
import {Icon} from './icon';
import {saveListingDraft} from '../lib/listing-draft';

const examples = [
  {id: 'atelier', agency: 'ATELIER', signature: 'IMMOBILIER', image: 'interieur', title: <>L’élégance<br/>au quotidien.</>, category: 'Appartement', alt: 'Salon lumineux ouvert sur une terrasse méditerranéenne'},
  {id: 'riviera', agency: 'RIVIERA', signature: 'IMMOBILIER', image: 'riviera', title: <>Un panorama<br/>d’exception.</>, category: 'Maison', alt: 'Villa et piscine avec une vue sur la Méditerranée'},
  {id: 'pierres', agency: 'LES PIERRES', signature: 'SINGULIÈRES', image: 'maison', title: <>Le charme<br/>authentique.</>, category: 'Bien de caractère', alt: 'Maison provençale en pierre dans son jardin'},
];
type Example = typeof examples[number];
type DialogKind = 'privacy' | 'terms' | 'plan' | null;

function FrameMark({className = ''}: {className?: string}) {
  return <svg className={className} viewBox="0 0 28 28" fill="none" aria-hidden="true"><path d="M10 3H3v7m15-7h7v7M3 18v7h7m8 0h7v-7" stroke="currentColor" strokeWidth="2.5"/></svg>;
}
function ArrowUp({size = 20}: {size?: number}) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M6 18 18 6M6 6h12v12" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"/></svg>;
}
function SmallIcon({name}: {name: 'upload' | 'palette' | 'mic' | 'person'}) {
  const paths = {
    upload: <><path d="M5 10v11h16V10M13 15V2m-5 5 5-5 5 5"/></>,
    palette: <><path d="M13 3a10 10 0 1 0 0 20h1a2 2 0 0 0 1-4c-1-1 0-3 2-3h2c5 0 4-13-6-13Z"/><path d="M7 9h.01M11 6h.01M17 7h.01M6 14h.01" strokeWidth="3"/></>,
    mic: <><rect x="9" y="2" width="8" height="15" rx="4"/><path d="M5 12a8 8 0 0 0 16 0M13 20v5m-4 0h8"/></>,
    person: <><circle cx="13" cy="6" r="4"/><path d="M4 25v-4a9 9 0 0 1 18 0v4"/></>,
  };
  return <svg width="28" height="28" viewBox="0 0 26 28" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths[name]}</svg>;
}
function Wordmark() {return <span className="landing-wordmark"><FrameMark/>bienvu</span>;}

function StoryCard({example, compact = false, title}: {example: Example; compact?: boolean; title?: ReactNode}) {
  const [playing, setPlaying] = useState(false);
  return <div className={`story-card ${compact ? 'story-compact' : ''} ${playing ? 'story-playing' : ''}`}>
    <img src={`/images/landing/${example.image}.webp`} alt={example.alt} width="800" height="1200" loading="lazy" decoding="async"/>
    <div className="story-shade"/>
    <div className="story-top"><div className="story-timeline"><i/><i/><i/><i/></div><div className="story-agency"><span>{example.agency}<small>{example.signature}</small></span><small>9:16</small></div></div>
    <div className="story-bottom"><p>{title ?? example.title}</p><div className="story-controls"><button type="button" aria-label={`${playing ? 'Mettre en pause' : 'Animer'} l’aperçu ${example.agency}`} aria-pressed={playing} onClick={() => setPlaying(value => !value)}>{playing ? <span className="pause-symbol"/> : <Icon name="play" size={18}/>}</button><span className="story-progress"><i/></span><span className="story-preview-label">APERÇU</span><span className="story-watermark"><FrameMark/>BienVu</span></div></div>
  </div>;
}

export function LandingPage() {
  const {me} = useAccount();
  const [menuOpen, setMenuOpen] = useState(false), [url, setUrl] = useState(''), [error, setError] = useState('');
  const [firstExample, setFirstExample] = useState(0), [dialog, setDialog] = useState<DialogKind>(null), [plan, setPlan] = useState('');
  const modal = useRef<HTMLDialogElement>(null);
  const accountHref = me ? '/generer' : '/connexion?mode=signup';
  useEffect(() => {
    if (!dialog) return;
    const element = modal.current;
    const trigger = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    element?.showModal();
    const previous = document.body.style.overflow; document.body.style.overflow = 'hidden';
    return () => {element?.close(); document.body.style.overflow = previous; trigger?.focus();};
  }, [dialog]);
  function start(event: FormEvent) {
    event.preventDefault();
    const parsed = ImportUrl.safeParse(url.trim());
    if (!parsed.success) {setError('Collez le lien HTTPS public de votre annonce.'); return;}
    if (!saveListingDraft({kind: 'url', url: parsed.data})) {setError('Votre navigateur ne peut pas conserver le lien. Ouvrez le studio pour le saisir.'); return;}
    window.location.assign(me ? '/generer' : '/connexion?mode=signup');
  }
  function startManual() {
    saveListingDraft({kind: 'manual'});
    window.location.assign(accountHref);
  }
  const navigation = <><a href="#comment-ca-marche" onClick={() => setMenuOpen(false)}>Comment ça marche</a><a href="#exemples" onClick={() => setMenuOpen(false)}>Exemples</a><a href="#tarifs" onClick={() => setMenuOpen(false)}>Tarifs</a></>;
  return <div className="landing">
    <a className="landing-skip" href="#accueil">Aller au contenu</a>
    <header className="landing-header landing-wrap"><Link href="/" aria-label="BienVu, accueil"><Wordmark/></Link><nav className="landing-nav" aria-label="Navigation principale">{navigation}</nav><div className="landing-header-actions"><Link className="landing-login" href={me ? '/studio' : '/connexion'}>{me ? 'Mon studio' : 'Connexion'}</Link><Link className="landing-button landing-button-small" href={accountHref}>{me ? 'Créer une vidéo' : 'Commencer gratuitement'}</Link><button className="landing-menu-button" aria-label={menuOpen ? 'Fermer le menu' : 'Ouvrir le menu'} aria-expanded={menuOpen} aria-controls="landing-mobile-menu" onClick={() => setMenuOpen(value => !value)}><span/>{menuOpen ? <span className="menu-open"/> : <span/>}</button></div></header>
    <nav id="landing-mobile-menu" className="landing-mobile-menu" aria-label="Navigation mobile" hidden={!menuOpen}>{navigation}<Link href={me ? '/studio' : '/connexion'}>{me ? 'Mon studio' : 'Connexion'}</Link></nav>
    <main id="accueil">
      <section className="landing-hero landing-wrap" aria-labelledby="hero-heading">
        <p className="landing-eyebrow">L’IMMOBILIER, EN MOUVEMENT</p>
        <h1 id="hero-heading">Une annonce.<br/><em>Et ça tourne.</em></h1>
        <p className="landing-hero-intro">Des vidéos immobilières avec voix off,<br/>aux couleurs de votre agence.</p>
        <div className="landing-hero-grid"><div className="hero-visual"><img className="hero-property" src="/images/landing/interieur.webp" alt="Un salon baigné de soleil, entre pierre naturelle et Méditerranée" width="1536" height="1024" fetchPriority="high"/><div className="hero-story"><StoryCard example={examples[0]} compact title={<>Un art<br/>de vivre<br/>au quotidien.</>}/><span className="hero-caption">Illustration d’un futur rendu</span></div></div>
          <div className="hero-start"><svg className="hand-arrow" viewBox="0 0 52 100" fill="none" aria-hidden="true"><path d="M18 5c17 25 18 55 10 79m-9-18 9 18 16-13" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg><h2><span>Votre prochaine</span><br/>story commence ici.</h2>
            <form onSubmit={start} noValidate><label className="sr-only" htmlFor="landing-listing-url">Lien de votre annonce</label><div className={`landing-url ${error ? 'landing-url-invalid' : ''}`}><Icon name="link" size={24}/><input id="landing-listing-url" type="url" inputMode="url" autoComplete="off" spellCheck={false} placeholder="Collez le lien de votre annonce…" value={url} onChange={event => {setUrl(event.target.value); setError('');}} aria-invalid={!!error} aria-describedby="landing-url-error landing-trial-note"/></div><p className="landing-error" id="landing-url-error" role="alert">{error}</p><button type="submit" className="landing-button hero-cta">Préparer ma vidéo <ArrowUp/></button></form>
            <button type="button" className="landing-manual" onClick={startManual}>Ou ajouter mes informations et mes photos <span aria-hidden="true">↗</span></button>
            <p id="landing-trial-note" className="landing-trial-note">À l’ouverture · 1 vidéo d’essai avec filigrane</p><div className="landing-early-access"><span/>Accès anticipé <span className="early-divider">/</span> Préparez vos annonces dès aujourd’hui.<br/><span className="early-second-line">La génération vidéo arrive bientôt.</span></div>
          </div></div>
      </section>

      <section id="comment-ca-marche" className="landing-how landing-wrap" aria-labelledby="how-title"><p className="landing-eyebrow">COMMENT ÇA MARCHE</p><h2 className="landing-section-title" id="how-title">Du lien à la vidéo. <em>Tout simplement.</em></h2><div className="landing-steps">
        <article><span className="landing-step-number">01</span><div><Icon name="link" size={34}/><h3>Collez votre lien</h3><p>Copiez l’URL de votre annonce immobilière. Ou ajoutez vos photos.</p></div></article>
        <article><span className="landing-step-number">02</span><div><Icon name="spark" size={34}/><h3>BienVu crée votre vidéo</h3><p>Vos photos, une voix off française et les couleurs de votre agence.</p></div></article>
        <article><span className="landing-step-number">03</span><div><SmallIcon name="upload"/><h3>Téléchargez et partagez</h3><p>Un format vertical, pensé pour faire vivre vos biens sur vos réseaux.</p></div></article>
      </div></section>

      <section id="exemples" className="landing-examples landing-wrap" aria-labelledby="examples-title"><div className="landing-section-heading"><div><p className="landing-eyebrow">EXEMPLES D’AMBIANCES</p><h2 className="landing-section-title" id="examples-title">Des biens. <em>Des histoires.</em></h2></div><div className="examples-aside"><p>Trois ambiances, une même exigence :<br/>mettre en valeur chaque bien.</p><div className="carousel-controls"><button type="button" aria-label="Exemple précédent" onClick={() => setFirstExample(value => (value + 2) % 3)}><Icon name="arrow" style={{transform: 'rotate(180deg)'}}/></button><button type="button" aria-label="Exemple suivant" onClick={() => setFirstExample(value => (value + 1) % 3)}><Icon name="arrow"/></button></div></div></div>
        <div className="landing-example-grid">{[0, 1, 2].map(offset => {const example = examples[(firstExample + offset) % 3]; return <figure key={example.id}><StoryCard example={example}/><figcaption>{example.category}<ArrowUp size={15}/></figcaption></figure>;})}</div><p className="landing-example-note">Aperçus animés sans son · Visuels générés et agences fictives, présentés à titre d’illustration.</p><span className="sr-only" role="status">Premier exemple : {examples[firstExample].category}</span>
      </section>

      <section className="landing-brand" aria-labelledby="brand-title"><div className="landing-wrap landing-brand-grid"><div className="brand-copy"><p className="landing-eyebrow">VOTRE AGENCE, VOTRE UNIVERS</p><h2 className="landing-section-title" id="brand-title">Votre agence.<br/><em>Votre signature.</em></h2><p>Une identité enregistrée,<br/>réutilisée dans vos vidéos.</p><Link className="landing-text-link" href="/agence">Créer ma signature <ArrowUp size={18}/></Link></div><div className="brand-story"><StoryCard example={examples[0]} compact title={<>Des lieux<br/>qui comptent.</>}/></div><div className="brand-details"><div className="brand-moodboard"><span>ATELIER<small>IMMOBILIER</small></span><div className="brand-swatches" aria-label="Palette : vert profond, crème, sable et pierre"><i/><i/><i/><i/></div><img src="/images/landing/maison.webp" alt="Détail végétal d’inspiration provençale" width="150" height="200" loading="lazy"/></div><div className="brand-sound" aria-hidden="true"><SmallIcon name="mic"/><span>{Array.from({length: 37}, (_, i) => <i key={i} style={{height: `${7 + ((i * 13 + i * i) % 27)}px`}}/>)}</span><small>Une voix française.<br/>Une présence naturelle.</small></div><ul><li><SmallIcon name="palette"/><div><h3>Logo et couleurs</h3><p>Votre identité, au cœur de chaque vidéo.</p></div></li><li><SmallIcon name="mic"/><div><h3>Voix off française</h3><p>Une narration synthétique claire et naturelle.</p></div></li><li><SmallIcon name="person"/><div><h3>Coordonnées intégrées</h3><p>Votre agence accompagne chaque histoire.</p></div></li></ul></div></div></section>

      <section id="tarifs" className="landing-pricing landing-wrap" aria-labelledby="pricing-title"><p className="landing-eyebrow">TARIFS INDICATIFS — PROPOSITION</p><h2 className="landing-section-title" id="pricing-title">À chaque agence, <em>son rythme.</em></h2><div className="landing-plans">{[
        {name: 'Découverte', price: 29, videos: 10, copy: 'Pour se lancer en toute simplicité.'},
        {name: 'Agence', price: 59, videos: 30, copy: 'Pour une présence régulière.'},
        {name: 'Volume', price: 99, videos: 60, copy: 'Pour les agences les plus actives.'},
      ].map((offer, index) => <article key={offer.name} className={index === 1 ? 'plan-featured' : ''}><div className="plan-heading"><h3>{offer.name}</h3>{index === 1 && <span>LE BON RYTHME</span>}</div><p className="plan-description">{offer.copy}</p><p className="plan-price">{offer.price} € <span>/ mois HT</span></p><p className="plan-quota">{offer.videos} vidéos / mois</p><ul>{['Voix off française', 'Identité d’agence', 'Sans filigrane BienVu'].map(feature => <li key={feature}><Icon name="check" size={18}/>{feature}</li>)}</ul><button type="button" className={`landing-button ${index !== 1 ? 'landing-button-outline' : ''}`} onClick={() => {setPlan(offer.name); setDialog('plan');}}>Découvrir cette offre <ArrowUp size={16}/></button></article>)}</div><p className="landing-pricing-note">Offres en préparation. Aucun paiement ni abonnement actif pour le moment.</p></section>

      <section className="landing-faq" aria-labelledby="faq-title"><div className="landing-wrap"><div className="landing-section-heading"><div><p className="landing-eyebrow">FAQ</p><h2 className="landing-section-title" id="faq-title">Les bonnes <em>questions.</em></h2></div><p>Une question ? On vous répond simplement.</p></div><div className="landing-questions">{[
        {q: 'Quels liens puis-je utiliser ?', a: <>Commencez par un lien public d’un site d’agence. La compatibilité dépend de la source : consultez <Link href="/sources">les sources testées et leurs limites</Link>. Si un site ne fonctionne pas, la saisie manuelle reste disponible.</>},
        {q: 'Dois-je importer mes photos ?', a: 'BienVu essaie de récupérer les photos depuis votre lien. Vous pouvez aussi saisir l’annonce vous-même et ajouter entre 3 et 12 photos que vous êtes autorisé à utiliser.'},
        {q: 'Puis-je essayer gratuitement ?', a: 'À l’ouverture de la génération, une vidéo d’essai avec filigrane sera offerte après inscription. Dès maintenant, vous pouvez créer votre compte, enregistrer votre agence et préparer vos annonces gratuitement.'},
        {q: 'Ma vidéo sera-t-elle à mes couleurs ?', a: 'Oui. Enregistrez une fois votre logo, vos couleurs et vos coordonnées dans votre espace agence. Cette identité est prévue pour être réutilisée dans vos prochaines vidéos, sans montage à effectuer.'},
      ].map((item, index) => <details key={item.q} name="landing-faq" open={index === 0}><summary><span className="faq-symbol" aria-hidden="true">?</span>{item.q}<span className="faq-toggle" aria-hidden="true"/></summary><p>{item.a}</p></details>)}</div></div></section>

      <section className="landing-final"><div className="landing-wrap"><div><p className="landing-eyebrow">L’IMMOBILIER, EN MOUVEMENT</p><h2>Votre prochain bien<br/>mérite sa <em>story.</em></h2></div><div><Link className="landing-button landing-button-light" href={accountHref}>Préparer ma première vidéo <ArrowUp/></Link><p>Un lien suffit pour commencer.</p></div></div></section>
    </main>
    <footer className="landing-footer landing-wrap"><Link href="/" aria-label="BienVu, accueil"><Wordmark/></Link><span className="footer-domain">bienvu.online</span><nav aria-label="Informations"><a href="mailto:contact@bienvu.online">Contact</a><button type="button" onClick={() => setDialog('privacy')}>Confidentialité</button><button type="button" onClick={() => setDialog('terms')}>Conditions</button></nav><div className="landing-footer-bottom"><span>© {new Date().getFullYear()} BienVu. De belles annonces, de belles histoires.</span><span>Conçu pour votre agence. Sans éditeur.</span></div></footer>

    {dialog && <dialog className="landing-dialog" ref={modal} onCancel={() => setDialog(null)} onClick={event => {if (event.target === event.currentTarget) setDialog(null);}} aria-labelledby="landing-dialog-title"><button className="dialog-close" type="button" aria-label="Fermer" onClick={() => setDialog(null)}>×</button><p className="landing-eyebrow">BIENVU · ACCÈS ANTICIPÉ</p><h2 id="landing-dialog-title">{dialog === 'plan' ? `L’offre ${plan}` : dialog === 'privacy' ? 'Vos données, votre espace.' : 'Bien commencer.'}</h2>
      {dialog === 'plan' ? <><p>Cette offre est en préparation. Les prix et quotas affichés sont indicatifs ; aucun paiement n’est demandé.</p><p>Vous pouvez déjà enregistrer l’identité de votre agence et préparer vos annonces. La génération vidéo et les abonnements seront ouverts dans une prochaine version.</p><Link className="landing-button" href={accountHref}>Rejoindre le studio <ArrowUp size={18}/></Link></>
        : dialog === 'privacy' ? <><p>BienVu utilise votre compte pour vous donner accès à votre agence et à vos annonces privées. Vos informations de marque et les photos importées sont hébergées sur Cloudflare. La connexion Google est facultative.</p><p>Un cookie est nécessaire à votre session. Si vous collez un lien sur cette page, il est enregistré dans cet onglet et peut être repris pendant une heure après connexion. Il est effacé lorsque l’annonce est enregistrée ou que l’onglet est fermé. L’import ne démarre qu’après votre action dans le studio.</p><p>Pour une question sur vos données : <a href="mailto:contact@bienvu.online">contact@bienvu.online</a>. Cette information décrit la version de test ; la politique complète sera finalisée avant l’ouverture commerciale.</p></>
        : <><p>BienVu est actuellement en accès anticipé. Vous pouvez préparer des annonces ; la génération vidéo et les paiements ne sont pas encore ouverts. Les offres présentées sont indicatives.</p><p>Utilisez uniquement des annonces, textes, logos et photos que vous êtes autorisé à exploiter. La compatibilité varie selon les sites. Les visuels présentés sur cette page sont des illustrations générées, avec des agences fictives.</p><p>Les conditions commerciales et les informations complètes de l’exploitant seront publiées avant la souscription d’un abonnement. Pour nous contacter : <a href="mailto:contact@bienvu.online">contact@bienvu.online</a>.</p></>}
    </dialog>}
  </div>;
}
