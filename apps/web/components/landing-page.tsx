'use client';

import Link from 'next/link';
import {useEffect, useRef, useState} from 'react';
import {HomeCreate} from './home-create';
import {AgencySeal, HomeIcon} from './home-icons';
import {StudioSidebar} from './studio-sidebar';
import {HomeShowcase} from './home-showcase';
import {HomeSharing} from './home-sharing';
import {HomeEditorShowcase} from './home-editor-showcase';

const examples = [
  {id: 'paris', title: 'Lumière sur Paris', agency: 'Maison & Quartier', duration: 28, category: 'Appartements', alt: 'Salon haussmannien ensoleillé, moulures et fenêtres ouvertes sur Paris'},
  {id: 'sud', title: 'L’air du Sud', agency: 'Agence Horizon', duration: 32, category: 'Maisons', alt: 'Piscine et villa contemporaine dans un jardin d’oliviers'},
  {id: 'lyon', title: 'Un loft à Lyon', agency: 'Atelier Immobilier', duration: 27, category: 'Appartements', alt: 'Loft en pierre, grandes fenêtres cintrées et canapé en cuir'},
  {id: 'bordeaux', title: 'Une maison à Bordeaux', agency: 'Les Belles Adresses', duration: 30, category: 'Maisons', alt: 'Maison bordelaise en pierre claire dans un jardin verdoyant'},
] as const;
type Example = typeof examples[number];
type Dialog = 'help' | 'explore' | 'example' | null;

function ExampleCard({example, onPlay}: {example: Example; onPlay(example: Example): void}) {
  return <article className="home-example"><button type="button" className="home-example-cover" onClick={() => onPlay(example)} aria-label={`Lire l’aperçu : ${example.title}`} aria-haspopup="dialog">
    <img src={`/images/studio-home/${example.id}.webp`} width="768" height="1024" alt={example.alt} decoding="async" loading="lazy"/>
    <span className="home-example-shade"/><span className="home-duration">0:{example.duration}</span><span className="home-play"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m9 5 11 7-11 7V5Z"/></svg></span><h3>{example.title}</h3>
  </button><div className="home-example-agency"><AgencySeal kind={example.id}/><span>{example.agency}</span></div></article>;
}

export function LandingPage() {
  const [dialog, setDialog] = useState<Dialog>(null);
  const [selected, setSelected] = useState<Example>(examples[0]), [category, setCategory] = useState('Tous');
  const [conversationActive, setConversationActive] = useState(false);
  const modal = useRef<HTMLDialogElement>(null);
  const modalOpen = dialog !== null;
  useEffect(() => {
    if (!modalOpen) return;
    const trigger = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const element = modal.current; element?.showModal();
    const previous = document.body.style.overflow; document.body.style.overflow = 'hidden';
    return () => {element?.close(); document.body.style.overflow = previous; trigger?.focus();};
  }, [modalOpen]);
  const play = (example: Example) => {setSelected(example); setDialog('example');};
  const focusComposer = () => {
    const input = document.getElementById('home-listing-url');
    input?.focus({preventScroll: true});
    input?.scrollIntoView({block: 'center', behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth'});
  };
  return <div className="home-studio home-studio-home">
    <a className="home-skip" href="#home-content">Aller au contenu</a>
    <StudioSidebar active="create"/>
    <div className="home-workspace"><header className="home-topbar"><span>Votre studio immobilier</span><button type="button" onClick={() => setDialog('help')}>Aide</button></header>
      <main className={`home-content${conversationActive ? ' home-content-conversation' : ''}`} id="home-content" tabIndex={-1}>
        <section className={`home-hero${conversationActive?'':' home-hero-dashboard'}`} aria-label={conversationActive?'Créer votre vidéo':undefined} aria-labelledby={conversationActive?undefined:'home-title'}>
          <div className={`home-hero-intro${conversationActive?' home-hero-intro-leaving':''}`} inert={conversationActive}><h1 id="home-title">Vos annonces, <em>en version vidéo.</em></h1><p className="home-intro">Collez votre annonce. L’IA crée votre vidéo, prête à partager.</p></div>
          <HomeCreate onLayoutChange={setConversationActive}/>
          <aside className="home-hero-showcase" hidden={conversationActive} aria-label="Un aperçu de votre prochaine vidéo">
            <p>Votre prochain coup de cœur, en vidéo.</p>
            <button type="button" className="home-hero-demo" onClick={()=>play(examples[0])} aria-label="Lire la démonstration Lumière sur Paris" aria-haspopup="dialog">
              <img src="/images/studio-home/paris.webp" width="768" height="1024" alt="Salon lumineux avec moulures et grandes fenêtres ouvertes sur la ville" fetchPriority="high" decoding="async"/>
              <span className="home-hero-demo-shade"/>
              <span className="home-duration">0:28</span>
              <span className="home-hero-demo-heading"><strong>Paris</strong><span>Un nouveau regard<br/>sur votre bien</span></span>
              <span className="home-play" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="m9 5 11 7-11 7V5Z"/></svg></span>
              <span className="home-hero-demo-facts"><span><HomeIcon name="house" size={18}/>65 m² · 3 pièces</span><strong>385 000 €</strong></span>
            </button>
          </aside>
        </section>
        {!conversationActive && <section id="explorer" className="home-discover" aria-labelledby="home-discover-title"><div className="home-discover-heading"><div><h2 id="home-discover-title">À découvrir sur BienVu</h2><p>Des inspirations pour donner une autre dimension à vos biens.</p></div><button type="button" className="home-explore-link" onClick={() => {setCategory('Tous'); setDialog('explore');}}>Tout explorer <HomeIcon name="external" size={17}/></button></div><div className="home-example-grid">{examples.map(example => <ExampleCard key={example.id} example={example} onPlay={play}/>)}</div></section>}
        {!conversationActive && <HomeShowcase paused={modalOpen} onCreate={focusComposer}/>}
        {!conversationActive && <HomeSharing onPlay={() => play(examples[0])} onCreate={focusComposer}/>}
        {!conversationActive && <HomeEditorShowcase paused={modalOpen} onCreate={focusComposer}/>}
      </main>
      <footer className="home-footer"><span>BienVu · L’immobilier, en mouvement.</span><nav aria-label="Informations"><a href="mailto:contact@bienvu.online">Contact</a><Link href="/confidentialite">Confidentialité</Link><Link href="/conditions">Conditions</Link></nav></footer>
    </div>
    {dialog && <dialog ref={modal} className={`home-dialog${dialog === 'example' ? ' home-video-dialog' : dialog === 'explore' ? ' home-explore-dialog' : ''}`} aria-labelledby="home-dialog-title" onCancel={() => setDialog(null)} onClick={event => {if (event.target === event.currentTarget) setDialog(null);}}><button className="home-dialog-close" type="button" aria-label="Fermer" onClick={() => setDialog(null)}><HomeIcon name="close" size={21}/></button>
      {dialog === 'example' ? <><div className="home-video-heading"><p className="home-dialog-kicker">L’IMMOBILIER, EN MOUVEMENT</p><h2 id="home-dialog-title">{selected.title}</h2><p>{selected.agency} · Agence fictive</p></div><video key={selected.id} src={`/videos/studio-home/${selected.id}.mp4`} poster={`/images/studio-home/${selected.id}.webp`} controls autoPlay playsInline preload="metadata" aria-label={`Démonstration visuelle : ${selected.title}`}/><p className="home-dialog-footnote">Animation d’un visuel généré, sans voix off. Vos vidéos utilisent les photos de votre bien et votre identité d’agence.</p></>
        : dialog === 'explore' ? <><p className="home-dialog-kicker">À DÉCOUVRIR</p><h2 id="home-dialog-title">À chaque bien, son histoire.</h2><p className="home-explore-intro">Quatre ambiances pour imaginer votre prochaine vidéo.</p><div className="home-gallery-filters" aria-label="Filtrer les inspirations">{['Tous', 'Appartements', 'Maisons'].map(value => <button type="button" key={value} aria-pressed={category === value} onClick={() => setCategory(value)}>{value}</button>)}</div><div className="home-example-grid">{examples.filter(example => category === 'Tous' || example.category === category).map(example => <ExampleCard key={example.id} example={example} onPlay={play}/>)}</div><p className="home-dialog-footnote">Visuels générés, agences fictives et animations sans son.</p><Link className="home-dialog-link" href="/explorer">Voir les vidéos partagées par les agences <HomeIcon name="external" size={16}/></Link></>
        : <><p className="home-dialog-kicker">BIENVENUE DANS VOTRE STUDIO</p><h2 id="home-dialog-title">Un lien. Et ça tourne.</h2><ol className="home-help-steps"><li><span>01</span><div><h3>Ajoutez votre annonce</h3><p>Collez un lien public, ou ouvrez « Ajouter mes photos » pour saisir les informations du bien.</p></div></li><li><span>02</span><div><h3>BienVu crée votre vidéo</h3><p>Vos photos, vos couleurs et une voix française de synthèse. La génération reste réservée aux comptes autorisés pendant l’accès anticipé.</p></div></li><li><span>03</span><div><h3>Retrouvez-la dans Mes vidéos</h3><p>Vous pouvez fermer la page pendant la création. Votre MP4 reste privé et téléchargeable pendant sept jours. Vous pouvez le publier dans Explorer et le retirer à tout moment.</p></div></li></ol><Link className="home-dialog-link" href="/sources">Voir les sources compatibles <HomeIcon name="external" size={16}/></Link><a className="home-support-link" href="mailto:contact@bienvu.online">Une question ? contact@bienvu.online</a></>}
    </dialog>}
  </div>;
}
