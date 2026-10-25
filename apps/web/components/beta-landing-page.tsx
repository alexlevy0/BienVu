'use client';
import { cartesiaParisianVoices } from '@bienvu/contracts';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import { type KeyboardEvent, useEffect, useRef, useState } from 'react';
import { type BetaVoiceChoice, betaVoiceKey, parseBetaVoice } from '../lib/beta-preferences';
import {
  type HomeRenderChoice,
  type HomeRenderPreset,
  homeRenderPresetKey,
  parseHomeRenderPreset,
} from '../lib/home-render-presets';
import { trackProductEvent } from '../lib/product-analytics';
import { voicePreviews } from '../lib/voice-previews';
import { useAccount } from './account';
import { AutoCreate } from './auto-create';
import { AutoContentKit, AutoStudioPreview } from './auto-studio-preview';
import { BetaDestinations } from './beta-destinations';
import { useGenerationStore } from './generation-store';
import { HomeCreate } from './home-create';
import { HomeFooter } from './home-footer';
import { HomeHeroVideo } from './home-hero-video';
import { HomeIcon } from './home-icons';
import { HomeRenderComparison } from './home-render-comparison';
import { HomeVitrineShowcase } from './home-vitrine-showcase';
import { StudioSidebar } from './studio-sidebar';

const loadingDemo = () => (
  <p className="beta-loading" role="status">
    Ouverture de la démonstration…
  </p>
);
const Example = dynamic(() => import('./beta-example').then((m) => m.BetaExample), { loading: loadingDemo });
const Avatars = dynamic(() => import('./home-avatar-showcase').then((m) => m.HomeAvatarShowcase), {
  loading: loadingDemo,
});
const Editor = dynamic(() => import('./home-editor-showcase').then((m) => m.HomeEditorShowcase), {
  loading: loadingDemo,
});
const WorldMap = dynamic(() => import('./beta-world-map').then((m) => m.BetaWorldMap));
const tabs = [
  { id: 'avatars', label: 'Présentateurs IA', icon: 'user' },
  { id: 'voice', label: 'Voix off', icon: 'microphone' },
  { id: 'editor', label: 'Éditeur & identité', icon: 'settings' },
] as const;
const questions = [
  [
    'Que comprend mon essai gratuit ?',
    'Vous pouvez créer une vidéo classique sans compte, avec un aperçu filigrané. La connexion permet de retrouver votre essai et de télécharger la vidéo sans filigrane. Les avatars et les animations IA sont des options payantes.',
  ],
  [
    'Combien coûte une vidéo ?',
    'La création coûte 1 crédit. Chaque photo animée par IA ajoute 1 crédit. Un avatar en introduction et/ou en conclusion ajoute 1 crédit ; sur toute la vidéo, il ajoute 1 crédit par tranche de 10 secondes. Le coût est indiqué avant le lancement.',
  ],
  [
    'Puis-je choisir mes photos et les modifier ?',
    'Oui. Importez votre annonce puis ouvrez Personnaliser pour choisir jusqu’à 12 photos parmi celles de l’annonce. Vous pouvez aussi ajouter vos propres photos et ajuster l’ordre, les textes, le cadrage et le rythme dans l’éditeur. Le coût d’un nouvel export est indiqué avant sa création.',
  ],
  [
    'Que faire si le lien de mon annonce ne fonctionne pas ?',
    'Vous pouvez ajouter vos photos et les informations du bien directement. La page Sources d’import détaille les sites testés. Certains portails peuvent temporairement limiter la lecture automatique.',
  ],
  [
    'Où partager ma vidéo ?',
    'Téléchargez-la pour vos échanges clients, votre site ou vos réseaux. Vous pouvez aussi programmer vos publications Instagram et Facebook après avoir connecté vos comptes, et regrouper vos biens sur Ma Vitrine.',
  ],
] as const;

function VoiceDemo({
  selected,
  onChoose,
}: {
  selected?: BetaVoiceChoice | null;
  onChoose(voice: (typeof cartesiaParisianVoices)[number]['id']): void;
}) {
  const [voice, setVoice] = useState(selected?.voice ?? cartesiaParisianVoices[0].id),
    [playing, setPlaying] = useState(false),
    [error, setError] = useState(false);
  const audio = useRef<HTMLAudioElement>(null),
    sample = voicePreviews[voice];
  useEffect(() => {
    const player = audio.current;
    player?.pause();
    setPlaying(false);
    setError(false);
    return () => player?.pause();
  }, [voice]);
  useEffect(() => {
    const pause = () => {
      if (document.hidden) audio.current?.pause();
    };
    document.addEventListener('visibilitychange', pause);
    return () => document.removeEventListener('visibilitychange', pause);
  }, []);
  async function toggle() {
    const player = audio.current;
    if (!player) return;
    if (!player.paused) {
      player.pause();
      return;
    }
    setError(false);
    try {
      await player.play();
    } catch {
      setError(true);
    }
  }
  return (
    <div className="beta-voice">
      <div>
        <span className="beta-eyebrow">FAITES ÉCOUTER VOTRE BIEN</span>
        <h3>
          Une voix naturelle.
          <br />
          <em>Votre façon de raconter.</em>
        </h3>
        <p>Écoutez les voix françaises de BienVu et trouvez celle qui correspond à votre agence.</p>
        <Link href="/avatar">
          Découvrir aussi les présentateurs <HomeIcon name="arrow" size={16} />
        </Link>
      </div>
      <div className="beta-voice-player">
        <HomeIcon name="microphone" size={38} />
        <label htmlFor="beta-voice-choice">La voix de votre prochaine vidéo</label>
        <select id="beta-voice-choice" value={voice} onChange={(event) => setVoice(event.target.value as typeof voice)}>
          {cartesiaParisianVoices.map((v) => (
            <option key={v.id} value={v.id}>
              {v.name} · Français
            </option>
          ))}
        </select>
        <div className={`beta-wave${playing ? ' is-playing' : ''}`} aria-hidden="true">
          {Array.from({ length: 35 }, (_, i) => (
            // biome-ignore lint/suspicious/noArrayIndexKey: Position identifies a fixed visual slot or read-only snapshot row; editable/reorderable records use IDs.
            <i key={i} style={{ height: 8 + (Math.sin(i * 2.3) + 1) * 18, animationDelay: `${i * 27}ms` }} />
          ))}
        </div>
        <button type="button" className="beta-button" aria-pressed={playing} onClick={() => void toggle()}>
          <HomeIcon name={playing ? 'pause' : 'play'} size={18} />
          {playing ? 'Mettre en pause' : 'Écouter cette voix'}
        </button>
        <button
          type="button"
          className="beta-voice-apply"
          onClick={() => {
            audio.current?.pause();
            onChoose(voice);
          }}
        >
          {selected?.voice === voice ? 'Voix choisie · l’utiliser à nouveau' : 'Utiliser cette voix'}{' '}
          <HomeIcon name="arrow" size={17} />
        </button>
        <audio
          ref={audio}
          src={sample.src}
          preload="none"
          onPlay={() => setPlaying(true)}
          onPause={() => setPlaying(false)}
          onEnded={() => setPlaying(false)}
          onError={() => setError(true)}
        />
        {error && <p role="alert">L’extrait est momentanément indisponible. Essayez une autre voix.</p>}
        <small>Extrait préparé · aucune génération payante</small>
      </div>
    </div>
  );
}

function Workspace() {
  const { me } = useAccount(),
    { jobs, drafts, properties } = useGenerationStore();
  if (!me) return null;
  const active = jobs.filter((job) => !['ready', 'failed'].includes(job.status));
  return (
    <section className="beta-workspace" aria-label="Reprendre votre travail">
      <div>
        <HomeIcon name="building" size={22} />
        <span>
          Bonjour {me.user.name.trim().split(/\s+/)[0] || 'à vous'}
          <small>
            {me.agency.name} · {me.rights.developmentRemaining} crédits disponibles
          </small>
        </span>
      </div>
      <nav aria-label="Votre espace">
        <Link href="/biens">
          {active.length
            ? `${active.length} vidéo${active.length > 1 ? 's' : ''} en cours`
            : properties.length
              ? `${properties.length} bien${properties.length > 1 ? 's' : ''}`
              : 'Mes biens'}{' '}
          <HomeIcon name="arrow" size={15} />
        </Link>
        {drafts.length > 0 && (
          <Link href="/biens">
            {drafts.length} brouillon{drafts.length > 1 ? 's' : ''} à reprendre
          </Link>
        )}
        <Link href="/abonnement#facturation">Abonnement & factures</Link>
      </nav>
    </section>
  );
}

export function BetaLandingPage({
  betaPreview = true,
  initialCategory = 'vehicle',
}: {
  betaPreview?: boolean;
  initialCategory?: 'real-estate' | 'vehicle';
}) {
  const { me } = useAccount();
  const studioPath = betaPreview ? '/beta' : '/';
  const [category, setCategory] = useState(initialCategory);
  const [creating, setCreating] = useState(false),
    [example, setExample] = useState(false),
    [heroPlaying, setHeroPlaying] = useState(false),
    [rendersPlaying, setRendersPlaying] = useState(false),
    [destinationPreview, setDestinationPreview] = useState(false),
    [worldPreview, setWorldPreview] = useState(false),
    [heroRender, setHeroRender] = useState<'standard' | 'avatar-ai'>('standard');
  const [choice, setChoice] = useState<HomeRenderChoice | null>(null),
    [tab, setTab] = useState<(typeof tabs)[number]['id']>('avatars'),
    [voiceChoice, setVoiceChoice] = useState<BetaVoiceChoice | null>(null);
  useEffect(() => {
    try {
      const preset = parseHomeRenderPreset(sessionStorage.getItem(homeRenderPresetKey));
      if (preset) setChoice({ preset, revision: 1 });
      const voice = parseBetaVoice(sessionStorage.getItem(betaVoiceKey));
      if (voice) setVoiceChoice({ voice, revision: 1 });
    } catch {}
  }, []);
  function focusComposer() {
    const input = document.getElementById('home-listing-url');
    input?.focus({ preventScroll: true });
    if (!input?.closest('[data-floating]'))
      input?.scrollIntoView({
        block: 'center',
        behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth',
      });
  }
  function openExample() {
    setExample(true);
    trackProductEvent('beta_demo_opened', { source_kind: 'demo' });
  }
  function chooseVoice(voice: (typeof cartesiaParisianVoices)[number]['id']) {
    setVoiceChoice((current) => ({ voice, revision: (current?.revision ?? 0) + 1 }));
    try {
      sessionStorage.setItem(betaVoiceKey, voice);
    } catch {}
    trackProductEvent('beta_voice_applied', { source_kind: 'demo' });
    focusComposer();
  }
  function choose(preset: HomeRenderPreset | null) {
    if (preset) trackProductEvent('beta_render_selected', { render_preset: preset, source_kind: 'demo' });
    setChoice((current) => (preset ? { preset, revision: (current?.revision ?? 0) + 1 } : null));
    try {
      if (preset) sessionStorage.setItem(homeRenderPresetKey, preset);
      else sessionStorage.removeItem(homeRenderPresetKey);
    } catch {}
    focusComposer();
  }
  function changeTab(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    let next = index;
    if (event.key === 'ArrowRight') next = (index + 1) % tabs.length;
    else if (event.key === 'ArrowLeft') next = (index + tabs.length - 1) % tabs.length;
    else if (event.key === 'Home') next = 0;
    else if (event.key === 'End') next = tabs.length - 1;
    else return;
    event.preventDefault();
    setTab(tabs[next].id);
    document.getElementById(`beta-tab-${tabs[next].id}`)?.focus();
  }
  return (
    <div className="home-studio home-studio-home home-studio-beta">
      <a className="home-skip" href="#home-content">
        Aller au contenu
      </a>
      <StudioSidebar active="create" />
      <div className="home-workspace">
        <header className="home-topbar">
          <span>Le studio marketing IA de vos annonces.</span>
          <div className="beta-topbar-links">
            <Link href="/aide">Aide</Link>
            {betaPreview && (
              <Link href="/">
                Version actuelle <HomeIcon name="external" size={13} />
              </Link>
            )}
          </div>
        </header>
        <main
          className={`home-content beta-content${creating ? ' home-content-conversation' : ''}`}
          id="home-content"
          tabIndex={-1}
        >
          {!creating && category === 'real-estate' && <Workspace />}
          <section
            className={`beta-hero${creating ? ' is-creating' : ''}`}
            aria-labelledby={creating ? undefined : 'beta-title'}
            aria-label={creating ? 'Créer votre vidéo' : undefined}
          >
            <div className="beta-hero-main">
              {!creating && (
                <div className="beta-hero-intro">
                  <div className="beta-vertical-switch" role="group" aria-label="Type d’annonce">
                    <button
                      type="button"
                      aria-pressed={category === 'real-estate'}
                      onClick={() => {
                        if (!betaPreview) {
                          window.location.assign('/');
                          return;
                        }
                        setCategory('real-estate');
                        const u = new URL(window.location.href);
                        u.searchParams.set('mode', 'immo');
                        u.searchParams.delete('draft');
                        u.searchParams.delete('job');
                        window.history.replaceState(null, '', u.pathname + u.search);
                      }}
                    >
                      <HomeIcon name="house" size={22} /> Immobilier
                    </button>
                    <button
                      type="button"
                      aria-pressed={category === 'vehicle'}
                      onClick={() => {
                        setCategory('vehicle');
                        const u = new URL(window.location.href);
                        u.searchParams.set('mode', 'auto');
                        u.searchParams.delete('draft');
                        u.searchParams.delete('job');
                        window.history.replaceState(null, '', u.pathname + u.search);
                      }}
                    >
                      <HomeIcon name="car" size={24} /> Auto <span>Nouveau</span>
                    </button>
                  </div>
                  <h1 id="beta-title">
                    Vos annonces,
                    <br />
                    en version
                    <br />
                    <em>vidéo !</em>
                  </h1>
                  <p className="beta-hero-description">
                    {category === 'vehicle'
                      ? 'Voitures aussi ! Transformez vos annonces auto en vidéos percutantes, avec voix off, avatar et animations IA.'
                      : 'Transformez vos annonces immobilières en vidéos qui donnent envie de visiter, avec voix off, avatar et animations IA.'}
                  </p>
                </div>
              )}
              {category === 'vehicle' ? (
                <AutoCreate
                  key={me?.agency.id ?? 'guest'}
                  onLayoutChange={setCreating}
                  voiceChoice={voiceChoice}
                  studioPath={studioPath}
                />
              ) : (
                <HomeCreate
                  variant="beta"
                  studioPath={studioPath}
                  onLayoutChange={setCreating}
                  renderChoice={choice}
                  voiceChoice={voiceChoice}
                  onClearRenderChoice={() => choose(null)}
                />
              )}
              {!creating && category === 'vehicle' && (
                <div className="auto-sources">
                  <p>Exemples de sources auto</p>
                  <div>
                    <span className="auto-source-leboncoin">leboncoin</span>
                    <span className="auto-source-lacentrale">LaCentrale</span>
                    <span className="auto-source-autoscout">
                      <mark>Auto</mark>Scout24
                    </span>
                    <span className="auto-source-aramis">Aramisauto</span>
                    <button type="button" onClick={() => document.getElementById('home-listing-url')?.focus()}>
                      <HomeIcon name="plus" size={17} /> Autres sites
                    </button>
                  </div>
                  <small>Selon l’accès autorisé par le site. Saisie manuelle disponible.</small>
                </div>
              )}
              {!creating && category === 'real-estate' && (
                <div className="beta-hero-actions">
                  <button type="button" className="beta-demo-link" onClick={openExample}>
                    <span>
                      <HomeIcon name="play" size={14} filled />
                    </span>
                    Tester avec une annonce exemple <HomeIcon name="arrow" size={16} />
                  </button>
                  <small>Aucun lien à fournir · Aucun crédit consommé</small>
                </div>
              )}
            </div>
            {!creating && category === 'vehicle' && (
              <AutoStudioPreview
                paused={example || destinationPreview || worldPreview}
                onPlayingChange={setHeroPlaying}
              />
            )}
            {!creating && category === 'real-estate' && (
              <aside className="beta-hero-preview" aria-label="Un résultat créé avec BienVu">
                <div className="beta-preview-tag">
                  <HomeIcon name={heroRender === 'standard' ? 'video' : 'sparkle'} size={14} />
                  {heroRender === 'standard'
                    ? me
                      ? 'Exemple classique'
                      : 'Le rendu de votre essai offert'
                    : 'Exemple avec avatar et animations IA'}
                </div>
                <HomeHeroVideo
                  render={heroRender}
                  paused={example || destinationPreview || worldPreview}
                  onPlayingChange={setHeroPlaying}
                />
                <div className="beta-preview-selector" role="group" aria-label="Aperçu de votre essai">
                  <button
                    type="button"
                    aria-pressed={heroRender === 'standard'}
                    onClick={() => setHeroRender('standard')}
                  >
                    {me ? 'Classique' : 'Essai classique'}
                  </button>
                  <button
                    type="button"
                    aria-pressed={heroRender === 'avatar-ai'}
                    onClick={() => setHeroRender('avatar-ai')}
                  >
                    Options IA
                  </button>
                </div>
                <p className="beta-preview-access">
                  {heroRender === 'standard'
                    ? me
                      ? '1 crédit · voix off et mouvements classiques'
                      : '1 vidéo offerte · sans compte'
                    : me
                      ? 'Avatar et animations · options payantes'
                      : 'Options payantes · connexion nécessaire'}
                </p>
                <div className="beta-preview-caption">
                  <span className="beta-preview-line" />
                  <p>
                    Vos photos. Votre identité.
                    <br />
                    <strong>Une vidéo prête à partager.</strong>
                  </p>
                </div>
              </aside>
            )}
            {!creating && category === 'vehicle' && <AutoContentKit />}
          </section>
          {!creating && category === 'real-estate' && (
            <>
              <div role="group" className="beta-reassurance" aria-label="Votre premier essai">
                <span>
                  <HomeIcon name="check" size={17} />
                  {me ? 'Vos créations dans Mes biens' : 'Un essai classique offert'}
                </span>
                <span>
                  <HomeIcon name="lock" size={17} />
                  {me ? 'Coût indiqué avant création' : 'Sans compte pour essayer'}
                </span>
                <span>
                  <HomeIcon name="download" size={17} />
                  {me ? 'Vos vidéos à télécharger' : 'Sans filigrane après connexion'}
                </span>
              </div>
              <section id="beta-renders" className="beta-section beta-renders">
                <HomeRenderComparison
                  compact
                  paused={example || destinationPreview || worldPreview}
                  selected={choice?.preset}
                  onChoose={choose}
                  onPlayingChange={setRendersPlaying}
                />
              </section>
              <section className="beta-section beta-how" aria-labelledby="beta-how-title">
                <header className="beta-section-heading">
                  <span className="beta-eyebrow">LE PLUS DUR, C’EST D’AVOIR LE MANDAT</span>
                  <h2 id="beta-how-title">
                    La suite tient
                    <br className="beta-mobile-break" /> en <em>trois étapes.</em>
                  </h2>
                </header>
                <ol className="beta-how-grid">
                  {[
                    {
                      icon: 'link',
                      title: 'Votre annonce, en un lien.',
                      text: 'Collez le lien d’une annonce compatible ou ajoutez vos propres photos.',
                      detail: 'Les informations du bien au même endroit.',
                    },
                    {
                      icon: 'settings',
                      title: 'Votre style, vos choix.',
                      text: 'Choisissez vos photos, une voix et, si vous le souhaitez, un présentateur IA.',
                      detail: 'Le coût est visible avant de créer.',
                    },
                    {
                      icon: 'share',
                      title: 'Votre vidéo fait sa visite.',
                      text: 'Téléchargez votre vidéo, partagez-la ou programmez sa publication.',
                      detail: 'Sur vos réseaux, votre site et votre vitrine.',
                    },
                  ].map((step, index) => (
                    <li key={step.title}>
                      <div className="beta-step-top">
                        <span>0{index + 1}</span>
                        <HomeIcon name={step.icon as 'link' | 'settings' | 'share'} size={28} />
                      </div>
                      <h3>{step.title}</h3>
                      <p>{step.text}</p>
                      <small>{step.detail}</small>
                    </li>
                  ))}
                </ol>
              </section>
              <section className="beta-section beta-studio" aria-labelledby="beta-studio-title">
                <header className="beta-section-heading">
                  <span className="beta-eyebrow">LA TOUCHE DE VOTRE AGENCE</span>
                  <h2 id="beta-studio-title">
                    Automatique.
                    <br className="beta-mobile-break" /> <em>Jamais impersonnel.</em>
                  </h2>
                  <p>Explorez les possibilités. Gardez la main sur ce qui compte.</p>
                </header>
                <div className="beta-tabs" role="tablist" aria-label="Explorer les personnalisations">
                  {tabs.map((item, index) => (
                    <button
                      key={item.id}
                      id={`beta-tab-${item.id}`}
                      role="tab"
                      type="button"
                      aria-selected={tab === item.id}
                      aria-controls="beta-studio-panel"
                      tabIndex={tab === item.id ? 0 : -1}
                      onClick={() => setTab(item.id)}
                      onKeyDown={(event) => changeTab(event, index)}
                    >
                      <HomeIcon name={item.icon} size={18} />
                      {item.label}
                    </button>
                  ))}
                </div>
                <div
                  id="beta-studio-panel"
                  role="tabpanel"
                  aria-labelledby={`beta-tab-${tab}`}
                  // biome-ignore lint/a11y/noNoninteractiveTabindex: This named scroll region or preview must receive focus for keyboard scrolling, tab navigation or playback controls.
                  tabIndex={0}
                  className="beta-tab-panel"
                >
                  {tab === 'avatars' ? (
                    <Avatars paused={example || destinationPreview || worldPreview || heroPlaying || rendersPlaying} />
                  ) : tab === 'voice' ? (
                    <VoiceDemo selected={voiceChoice} onChoose={chooseVoice} />
                  ) : (
                    <Editor
                      paused={example || destinationPreview || worldPreview || heroPlaying || rendersPlaying}
                      onCreate={focusComposer}
                    />
                  )}
                </div>
              </section>
              <BetaDestinations onCreate={focusComposer} onPreviewChange={setDestinationPreview} />
              <WorldMap onPlayingChange={setWorldPreview} />
              <div className="beta-section beta-vitrine">
                <HomeVitrineShowcase />
              </div>
              <section className="beta-section beta-pricing" aria-labelledby="beta-pricing-title">
                <div>
                  <span className="beta-eyebrow">VOTRE BUDGET, EN TOUTE CLARTÉ</span>
                  <h2 id="beta-pricing-title">
                    Chaque option.
                    <br />
                    <em>Chaque crédit.</em>
                  </h2>
                  <p>Vous choisissez le rendu et connaissez son coût avant de lancer la création.</p>
                  <Link className="beta-button" href="/abonnement">
                    Voir les offres <HomeIcon name="arrow" size={18} />
                  </Link>
                </div>
                <div className="beta-price-sheet">
                  <div>
                    <HomeIcon name="video" size={21} />
                    <span>
                      La vidéo classique<small>Voix off, textes et mouvements classiques</small>
                    </span>
                    <strong>1 crédit</strong>
                  </div>
                  <div>
                    <HomeIcon name="sparkle" size={21} />
                    <span>
                      Animation IA<small>Pour chaque photo animée</small>
                    </span>
                    <strong>+1 crédit</strong>
                  </div>
                  <div>
                    <HomeIcon name="user" size={21} />
                    <span>
                      Avatar IA<small>Introduction et/ou conclusion</small>
                    </span>
                    <strong>+1 crédit</strong>
                  </div>
                  <div>
                    <HomeIcon name="clock" size={21} />
                    <span>
                      Avatar sur toute la vidéo<small>Par tranche de 10 secondes</small>
                    </span>
                    <strong>+1 crédit</strong>
                  </div>
                  <p>
                    Exemple : 20 s + 4 photos animées + avatar sur toute la vidéo = <strong>7 crédits.</strong>
                  </p>
                </div>
              </section>
              <section className="beta-section beta-faq" aria-labelledby="beta-faq-title">
                <div>
                  <span className="beta-eyebrow">AVANT VOTRE PREMIÈRE VIDÉO</span>
                  <h2 id="beta-faq-title">
                    Les bonnes
                    <br />
                    <em>questions.</em>
                  </h2>
                  <p>
                    Un autre sujet ?<br />
                    <a href="mailto:contact@bienvu.online">
                      Parlons de votre agence <HomeIcon name="arrow" size={16} />
                    </a>
                  </p>
                </div>
                <div>
                  {questions.map(([title, answer]) => (
                    <details key={title}>
                      <summary>
                        {title}
                        <HomeIcon name="plus" size={19} />
                      </summary>
                      <p>{answer}</p>
                      {title.includes('lien') && (
                        <Link href="/sources">
                          Consulter les sources d’import <HomeIcon name="external" size={14} />
                        </Link>
                      )}
                    </details>
                  ))}
                </div>
              </section>
              <section className="beta-final" aria-labelledby="beta-final-title">
                <span className="beta-eyebrow">VOS BIENS MÉRITENT D’ÊTRE BIEN VUS</span>
                <h2 id="beta-final-title">
                  Votre prochain mandat.
                  <br />
                  <em>On lui fait sa vidéo ?</em>
                </h2>
                <button type="button" className="beta-button" onClick={focusComposer}>
                  Créer ma vidéo <HomeIcon name="arrow" size={20} />
                </button>
                <button type="button" className="beta-text-button" onClick={openExample}>
                  Je regarde d’abord un exemple
                </button>
              </section>
            </>
          )}
        </main>
        <HomeFooter onCreate={focusComposer} faqHref={category === 'vehicle' ? '/aide' : '#beta-faq-title'} />
      </div>
      {example && (
        <Example
          initial={choice?.preset ?? 'standard'}
          onClose={() => setExample(false)}
          onCreate={(preset) => {
            setExample(false);
            choose(preset);
            trackProductEvent('beta_demo_applied', { render_preset: preset, source_kind: 'demo' });
            requestAnimationFrame(focusComposer);
          }}
        />
      )}
    </div>
  );
}
