'use client';

import Link from 'next/link';
import {useEffect, useRef, useState} from 'react';
import {HomeCreate} from './home-create';
import {AgencySeal, HomeIcon} from './home-icons';
import {StudioSidebar} from './studio-sidebar';

const examples = [
  {id: 'paris', title: 'Lumière sur Paris', agency: 'Maison & Quartier', duration: 28, category: 'Appartements', alt: 'Salon haussmannien ensoleillé, moulures et fenêtres ouvertes sur Paris'},
  {id: 'sud', title: 'L’air du Sud', agency: 'Agence Horizon', duration: 32, category: 'Maisons', alt: 'Piscine et villa contemporaine dans un jardin d’oliviers'},
  {id: 'lyon', title: 'Un loft à Lyon', agency: 'Atelier Immobilier', duration: 27, category: 'Appartements', alt: 'Loft en pierre, grandes fenêtres cintrées et canapé en cuir'},
  {id: 'bordeaux', title: 'Une maison à Bordeaux', agency: 'Les Belles Adresses', duration: 30, category: 'Maisons', alt: 'Maison bordelaise en pierre claire dans un jardin verdoyant'},
] as const;
type Example = typeof examples[number];
type Dialog = 'help' | 'privacy' | 'terms' | 'explore' | 'example' | null;

function ExampleCard({example, onPlay}: {example: Example; onPlay(example: Example): void}) {
  return <article className="home-example"><button type="button" className="home-example-cover" onClick={() => onPlay(example)} aria-label={`Lire l’aperçu : ${example.title}`} aria-haspopup="dialog">
    <img src={`/images/studio-home/${example.id}.webp`} width="768" height="1024" alt={example.alt} decoding="async"/>
    <span className="home-example-shade"/><span className="home-duration">0:{example.duration}</span><span className="home-play"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m9 5 11 7-11 7V5Z"/></svg></span><h3>{example.title}</h3>
  </button><div className="home-example-agency"><AgencySeal kind={example.id}/><span>{example.agency}</span></div></article>;
}

export function LandingPage() {
  const [dialog, setDialog] = useState<Dialog>(null);
  const [selected, setSelected] = useState<Example>(examples[0]), [category, setCategory] = useState('Tous');
  const [conversationActive, setConversationActive] = useState(false), [galleryVisible, setGalleryVisible] = useState(true);
  const modal = useRef<HTMLDialogElement>(null);
  const modalOpen = dialog !== null;
  useEffect(() => {
    if (!conversationActive) {setGalleryVisible(true); return;}
    const timer = window.setTimeout(() => setGalleryVisible(false), 340);
    return () => window.clearTimeout(timer);
  }, [conversationActive]);
  useEffect(() => {
    if (!modalOpen) return;
    const trigger = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const element = modal.current; element?.showModal();
    const previous = document.body.style.overflow; document.body.style.overflow = 'hidden';
    return () => {element?.close(); document.body.style.overflow = previous; trigger?.focus();};
  }, [modalOpen]);
  const play = (example: Example) => {setSelected(example); setDialog('example');};
  return <div className="home-studio">
    <a className="home-skip" href="#home-content">Aller au contenu</a>
    <StudioSidebar active="create"/>
    <div className="home-workspace"><header className="home-topbar"><span>Votre studio immobilier</span><button type="button" onClick={() => setDialog('help')}>Aide</button></header>
      <main className={`home-content${conversationActive ? ' home-content-conversation' : ''}`} id="home-content" tabIndex={-1}>
        <section className="home-hero" aria-label={conversationActive?'Créer votre vidéo':undefined} aria-labelledby={conversationActive?undefined:'home-title'}><div className={`home-hero-intro${conversationActive?' home-hero-intro-leaving':''}`} inert={conversationActive}><h1 id="home-title">Une annonce.<br/>Une vidéo qui <em>donne envie.</em></h1><p className="home-intro">Collez le lien de votre annonce. BienVu s’occupe du reste.</p></div><HomeCreate onLayoutChange={setConversationActive}/></section>
        {galleryVisible && <section id="explorer" className={`home-discover${conversationActive ? ' home-discover-leaving' : ''}`} aria-labelledby="home-discover-title" inert={conversationActive}><div className="home-discover-heading"><div><h2 id="home-discover-title">À découvrir sur BienVu</h2><p>Des inspirations pour donner une autre dimension à vos biens.</p></div><button type="button" className="home-explore-link" onClick={() => {setCategory('Tous'); setDialog('explore');}}>Tout explorer <HomeIcon name="external" size={17}/></button></div><div className="home-example-grid">{examples.map(example => <ExampleCard key={example.id} example={example} onPlay={play}/>)}</div><p className="home-demo-note">Démonstrations visuelles sans son · Biens et agences fictifs · Images générées</p></section>}
      </main>
      <footer className="home-footer"><span>BienVu · L’immobilier, en mouvement.</span><nav aria-label="Informations"><a href="mailto:contact@bienvu.online">Contact</a><button type="button" onClick={() => setDialog('privacy')}>Confidentialité</button><button type="button" onClick={() => setDialog('terms')}>Conditions</button></nav></footer>
    </div>
    {dialog && <dialog ref={modal} className={`home-dialog${dialog === 'example' ? ' home-video-dialog' : dialog === 'explore' ? ' home-explore-dialog' : ''}`} aria-labelledby="home-dialog-title" onCancel={() => setDialog(null)} onClick={event => {if (event.target === event.currentTarget) setDialog(null);}}><button className="home-dialog-close" type="button" aria-label="Fermer" onClick={() => setDialog(null)}><HomeIcon name="close" size={21}/></button>
      {dialog === 'example' ? <><div className="home-video-heading"><p className="home-dialog-kicker">L’IMMOBILIER, EN MOUVEMENT</p><h2 id="home-dialog-title">{selected.title}</h2><p>{selected.agency} · Agence fictive</p></div><video key={selected.id} src={`/videos/studio-home/${selected.id}.mp4`} poster={`/images/studio-home/${selected.id}.webp`} controls autoPlay playsInline preload="metadata" aria-label={`Démonstration visuelle : ${selected.title}`}/><p className="home-dialog-footnote">Animation d’un visuel généré, sans voix off. Vos vidéos utilisent les photos de votre bien et votre identité d’agence.</p></>
        : dialog === 'explore' ? <><p className="home-dialog-kicker">À DÉCOUVRIR</p><h2 id="home-dialog-title">À chaque bien, son histoire.</h2><p className="home-explore-intro">Quatre ambiances pour imaginer votre prochaine vidéo.</p><div className="home-gallery-filters" aria-label="Filtrer les inspirations">{['Tous', 'Appartements', 'Maisons'].map(value => <button type="button" key={value} aria-pressed={category === value} onClick={() => setCategory(value)}>{value}</button>)}</div><div className="home-example-grid">{examples.filter(example => category === 'Tous' || example.category === category).map(example => <ExampleCard key={example.id} example={example} onPlay={play}/>)}</div><p className="home-dialog-footnote">Visuels générés, agences fictives et animations sans son.</p><Link className="home-dialog-link" href="/explorer">Voir les vidéos partagées par les agences <HomeIcon name="external" size={16}/></Link></>
        : dialog === 'help' ? <><p className="home-dialog-kicker">BIENVENUE DANS VOTRE STUDIO</p><h2 id="home-dialog-title">Un lien. Et ça tourne.</h2><ol className="home-help-steps"><li><span>01</span><div><h3>Ajoutez votre annonce</h3><p>Collez un lien public, ou ouvrez « Ajouter mes photos » pour saisir les informations du bien.</p></div></li><li><span>02</span><div><h3>BienVu crée votre vidéo</h3><p>Vos photos, vos couleurs et une voix française de synthèse. La génération reste réservée aux comptes autorisés pendant l’accès anticipé.</p></div></li><li><span>03</span><div><h3>Retrouvez-la dans Mes vidéos</h3><p>Vous pouvez fermer la page pendant la création. Votre MP4 reste privé et téléchargeable pendant sept jours. Vous pouvez le publier dans Explorer et le retirer à tout moment.</p></div></li></ol><Link className="home-dialog-link" href="/sources">Voir les sources compatibles <HomeIcon name="external" size={16}/></Link><a className="home-support-link" href="mailto:contact@bienvu.online">Une question ? contact@bienvu.online</a></>
        : dialog === 'privacy' ? <><p className="home-dialog-kicker">VOTRE ESPACE PRIVÉ</p><h2 id="home-dialog-title">Vos données, chez vous.</h2><p>Votre compte donne accès à votre agence, vos annonces et vos vidéos privées. Les informations de marque et les médias sont hébergés sur Cloudflare. Google est une méthode de connexion facultative.</p><p>Un cookie est nécessaire à votre session. Pour un essai anonyme, une preuve de session reste dans un cookie sécurisé pendant trente jours ; les médias non récupérés expirent vingt-quatre heures après leur préparation. Une empreinte IP protégée par une clé serveur est conservée au plus quarante-huit heures pour limiter les abus. Avant connexion, le lien saisi peut être conservé dans cet onglet pendant une heure. Si vous préparez une annonce manuelle puis continuez vers la connexion, ses champs et photos sont conservés localement dans ce navigateur pendant une heure pour la reprendre après connexion, y compris depuis un autre onglet si le stockage local est autorisé. Ils sont supprimés après enregistrement ou lors d’une visite suivant leur expiration.</p><p>Les exemples de l’accueil sont fictifs. Vos propres vidéos restent privées par défaut ; une publication volontaire dans Explorer crée un lien public, révocable depuis Mes vidéos. La politique complète sera finalisée avant l’ouverture commerciale.</p><a className="home-dialog-link" href="mailto:contact@bienvu.online">contact@bienvu.online <HomeIcon name="external" size={16}/></a></>
        : <><p className="home-dialog-kicker">BIENVU · ACCÈS ANTICIPÉ</p><h2 id="home-dialog-title">Bien commencer.</h2><p>L’essai permet de préparer une vidéo avant inscription, lorsqu’il est disponible. Son aperçu comporte un filigrane. Connectez-vous pour enregistrer cette même vidéo et la télécharger sans filigrane avec un crédit disponible. Le compte gratuit prévoit trois vidéos par mois, essai récupéré compris ; votre espace affiche vos droits actuels. Les abonnements restent en préparation.</p><p>Utilisez uniquement des annonces, photos, textes et logos que vous êtes autorisé à exploiter. La compatibilité varie selon les sites ; la saisie manuelle reste disponible.</p><p>Les démonstrations sont des animations sans son de visuels générés avec des agences fictives. Les tarifs et les conditions commerciales seront finalisés avant l’ouverture des paiements.</p><Link className="home-dialog-link" href="/abonnement">Découvrir les offres <HomeIcon name="external" size={16}/></Link></>}
    </dialog>}
  </div>;
}
