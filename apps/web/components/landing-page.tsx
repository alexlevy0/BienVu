'use client';

import type { HomepageSlot } from '@bienvu/contracts';
import Link from 'next/link';
import { Suspense, startTransition, useCallback, useEffect, useRef, useState } from 'react';
import {
  type HomeRenderChoice,
  type HomeRenderPreset,
  homeRenderPresetKey,
  parseHomeRenderPreset,
} from '../lib/home-render-presets';
import { publicFeatureLinks as featurePages } from '../lib/marketing-navigation';
import { HomeAnimationComparison } from './home-animation-comparison';
import { HomeAvatarShowcase } from './home-avatar-showcase';
import { HomeCreate } from './home-create';
import { HomeEditorShowcase } from './home-editor-showcase';
import { HomeFooter } from './home-footer';
import { HomeHeroVideo } from './home-hero-video';
import { AgencySeal, HomeIcon } from './home-icons';
import { HomeMandateKit } from './home-mandate-kit';
import { HomeMarketingStyles } from './home-marketing-styles';
import { HomeRenderComparison } from './home-render-comparison';
import { HomeScrollMotion } from './home-scroll-motion';
import { HomeSharing } from './home-sharing';
import { HomeShowcase } from './home-showcase';
import { HomeVitrineShowcase } from './home-vitrine-showcase';
import { HomeVisual, homeClock, useHomepageConfig, useHomepageMedia } from './homepage-media';
import { useSiteFeatures } from './site-features';
import { StudioSidebar } from './studio-sidebar';

const examples = [
  {
    id: 'paris',
    title: 'Lumière sur Paris',
    agency: 'Maison & Quartier',
    duration: 28,
    category: 'Appartements',
    alt: 'Salon haussmannien ensoleillé, moulures et fenêtres ouvertes sur Paris',
  },
  {
    id: 'sud',
    title: 'L’air du Sud',
    agency: 'Agence Horizon',
    duration: 32,
    category: 'Maisons',
    alt: 'Piscine et villa contemporaine dans un jardin d’oliviers',
  },
  {
    id: 'lyon',
    title: 'Un loft à Lyon',
    agency: 'Atelier Immobilier',
    duration: 27,
    category: 'Appartements',
    alt: 'Loft en pierre, grandes fenêtres cintrées et canapé en cuir',
  },
  {
    id: 'bordeaux',
    title: 'Une maison à Bordeaux',
    agency: 'Les Belles Adresses',
    duration: 30,
    category: 'Maisons',
    alt: 'Maison bordelaise en pierre claire dans un jardin verdoyant',
  },
] as const;
type Example = (typeof examples)[number];
type Dialog = 'help' | 'explore' | 'example' | null;
const kitTitles: Partial<Record<HomepageSlot, string>> = {
  'kit.reel.video': 'Votre futur chez-vous',
  'kit.story.video': 'Découvrez ce bien en story',
  'kit.tiktok.video': 'On visite ?',
  'kit.landscape.video': 'Votre bien en vidéo',
};

function ExampleCard({ example, onPlay }: { example: Example; onPlay(example: Example): void }) {
  const visual = useHomepageMedia(`discover.${example.id}.visual`),
    movie = useHomepageMedia(`discover.${example.id}.video`);
  const custom = visual.custom || movie.custom,
    title = custom ? (movie.title ?? visual.title) : example.title;
  return (
    <article className="home-example">
      <button
        type="button"
        className="home-example-cover"
        onClick={() => onPlay(example)}
        aria-label={`Lire l’aperçu : ${title}`}
        aria-haspopup="dialog"
      >
        <HomeVisual
          media={visual}
          alt={custom ? (title ?? 'Vidéo immobilière') : example.alt}
          sizes="(max-width: 900px) calc((100vw - 64px) / 2), (max-width: 1250px) calc((100vw - 312px) / 4), (max-width: 1916px) calc((100vw - 349px) / 4), 392px"
        />
        <span className="home-example-shade" />
        <span className="home-duration">{homeClock(movie.duration ?? example.duration)}</span>
        <span className="home-play">
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="m9 5 11 7-11 7V5Z" />
          </svg>
        </span>
        <h3>{title}</h3>
      </button>
      <div className="home-example-agency">
        {custom ? <HomeIcon name="house" size={24} /> : <AgencySeal kind={example.id} />}
        <span>{custom ? (movie.agency ?? visual.agency ?? 'BienVu') : example.agency}</span>
      </div>
      <Link className="home-example-detail-link" href={`/exemples/${example.id}`} prefetch={false}>
        Voir la présentation →
      </Link>
    </article>
  );
}

export function LandingPage() {
  const features = useSiteFeatures(),
    root = useRef<HTMLDivElement>(null);
  const homepage = useHomepageConfig(),
    customDiscover = Object.keys(homepage.slots).some((id) => id.startsWith('discover.'));
  const [dialog, setDialog] = useState<Dialog>(null);
  useEffect(() => {
    if (!features.explorer && dialog === 'explore') setDialog(null);
  }, [features.explorer, dialog]);
  const [selected, setSelected] = useState<Example>(examples[0]),
    [category, setCategory] = useState('Tous');
  const [selectedSlot, setSelectedSlot] = useState<HomepageSlot>('hero.video');
  const movie = useHomepageMedia(selectedSlot);
  const selectedVisual = useHomepageMedia(selectedSlot.replace(/\.video$/, '.visual') as HomepageSlot);
  const customMovie = movie.custom || selectedVisual.custom,
    movieTitle = movie.custom
      ? movie.title
      : selectedVisual.custom
        ? selectedVisual.title
        : (kitTitles[selectedSlot] ?? selected.title);
  const [conversationActive, setConversationActive] = useState(false);
  const [headlineEntered, setHeadlineEntered] = useState(false);
  const changeLayout = useCallback((active: boolean) => {
    if (active) setHeadlineEntered(true);
    setConversationActive(active);
  }, []);
  const [heroPlaying, setHeroPlaying] = useState(false);
  const [comparisonPlaying, setComparisonPlaying] = useState(false);
  const [rendersPlaying, setRendersPlaying] = useState(false),
    [renderChoice, setRenderChoice] = useState<HomeRenderChoice | null>(null);
  useEffect(() => {
    try {
      const preset = parseHomeRenderPreset(sessionStorage.getItem(homeRenderPresetKey));
      if (preset) startTransition(() => setRenderChoice({ preset, revision: 1 }));
    } catch {
      /* Optional choice persistence. */
    }
  }, []);
  const heroPlayback = useCallback((playing: boolean) => startTransition(() => setHeroPlaying(playing)), []);
  const modal = useRef<HTMLDialogElement>(null);
  const modalOpen = dialog !== null;
  useEffect(() => {
    if (!modalOpen) return;
    const trigger = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const element = modal.current;
    element?.showModal();
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      element?.close();
      document.body.style.overflow = previous;
      trigger?.focus();
    };
  }, [modalOpen]);
  const play = useCallback((example: Example) => {
    setSelected(example);
    setSelectedSlot(`discover.${example.id}.video`);
    setDialog('example');
  }, []);
  const playSlot = useCallback((slot: HomepageSlot) => {
    setSelected(examples[0]);
    setSelectedSlot(slot);
    setDialog('example');
  }, []);
  const playSharing = useCallback(
    (context: 'social' | 'client' | 'site') => playSlot(`share.${context}.video`),
    [playSlot],
  );
  const focusComposer = useCallback(() => {
    const input = document.getElementById('home-listing-url');
    input?.focus({ preventScroll: true });
    if (input?.closest('[data-floating]')) return;
    input?.scrollIntoView({
      block: 'center',
      behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth',
    });
  }, []);
  const chooseRender = useCallback(
    (preset: HomeRenderPreset | null) => {
      setRenderChoice((current) => (preset ? { preset, revision: (current?.revision ?? 0) + 1 } : null));
      try {
        if (preset) sessionStorage.setItem(homeRenderPresetKey, preset);
        else sessionStorage.removeItem(homeRenderPresetKey);
      } catch {
        /* The current choice remains usable. */
      }
      focusComposer();
    },
    [focusComposer],
  );
  return (
    <div ref={root} className="home-studio home-studio-home">
      <HomeScrollMotion root={root} active={!conversationActive} revision={features.explorer} />
      <HomeMarketingStyles />
      <a className="home-skip" href="#home-content">
        Aller au contenu
      </a>
      <StudioSidebar active="create" />
      <div className="home-workspace">
        <header className="home-topbar">
          <span className="home-topbar-description">Le studio marketing IA de votre agence immobilière.</span>
          <div className="home-topbar-actions">
            <nav className="home-market-switch" aria-label="Type d’annonce">
              <Link href="/" aria-current="page">
                <HomeIcon name="house" size={17} /> Immobilier
              </Link>
              <Link href="/?mode=auto" prefetch={false}>
                <HomeIcon name="car" size={19} /> Auto <span>Nouveau</span>
              </Link>
            </nav>
            <button type="button" onClick={() => setDialog('help')}>
              Aide
            </button>
          </div>
        </header>
        <main
          className={`home-content${conversationActive ? ' home-content-conversation' : ''}`}
          id="home-content"
          tabIndex={-1}
        >
          <section
            className={`home-hero${conversationActive ? '' : ' home-hero-dashboard'}`}
            aria-label={conversationActive ? 'Créer votre vidéo' : undefined}
            aria-labelledby={conversationActive ? undefined : 'home-title'}
          >
            <div
              className={`home-hero-intro${conversationActive ? ' home-hero-intro-leaving' : ''}`}
              inert={conversationActive}
            >
              <h1
                id="home-title"
                data-intro-complete={headlineEntered || undefined}
                onAnimationEnd={(event) => {
                  if (event.animationName === 'home-headline-underline') setHeadlineEntered(true);
                }}
              >
                <span>Vos annonces,</span> en version{' '}
                <em>
                  <strong>vidéo</strong>
                </em>
                {'\u202f'}!
              </h1>
              <p className="home-intro">
                <strong>Transformez un lien en vidéo, avec voix off, avatar et animations IA.</strong>
              </p>
            </div>
            <HomeCreate
              onLayoutChange={changeLayout}
              renderChoice={renderChoice}
              onClearRenderChoice={() => chooseRender(null)}
            />
            <aside
              className="home-hero-showcase"
              hidden={conversationActive}
              aria-label="Un aperçu de votre prochaine vidéo"
            >
              <p>Vos biens prennent vie.</p>
              <HomeHeroVideo paused={modalOpen || conversationActive} onPlayingChange={heroPlayback} />
            </aside>
          </section>
          {features.explorer && !conversationActive && (
            <section
              id="explorer"
              className="home-discover"
              data-home-motion="discover"
              aria-labelledby="home-discover-title"
            >
              <div className="home-discover-heading">
                <div>
                  <h2 id="home-discover-title">À découvrir sur BienVu</h2>
                  <p>Des inspirations pour donner une autre dimension à vos biens.</p>
                </div>
                <button
                  type="button"
                  className="home-explore-link"
                  onClick={() => {
                    setCategory('Tous');
                    setDialog('explore');
                  }}
                >
                  Tout explorer <HomeIcon name="external" size={17} />
                </button>
              </div>
              <div className="home-example-grid">
                {examples.map((example) => (
                  <ExampleCard key={example.id} example={example} onPlay={play} />
                ))}
              </div>
            </section>
          )}
          {!conversationActive && (
            <Suspense fallback={null}>
              <HomeAvatarShowcase paused={modalOpen} />
            </Suspense>
          )}
          {!conversationActive && (
            <Suspense fallback={null}>
              <HomeRenderComparison
                paused={modalOpen}
                selected={renderChoice?.preset}
                onChoose={chooseRender}
                onPlayingChange={setRendersPlaying}
              />
            </Suspense>
          )}
          {!conversationActive && (
            <Suspense fallback={null}>
              <HomeAnimationComparison
                paused={modalOpen}
                onCreate={focusComposer}
                onPlayingChange={setComparisonPlaying}
              />
            </Suspense>
          )}
          {!conversationActive && (
            <Suspense fallback={null}>
              <HomeShowcase
                paused={modalOpen || heroPlaying || comparisonPlaying || rendersPlaying}
                onCreate={focusComposer}
              />
            </Suspense>
          )}
          {!conversationActive && (
            <Suspense fallback={null}>
              <HomeMandateKit onPlay={playSlot} onCreate={focusComposer} />
            </Suspense>
          )}
          {!conversationActive && (
            <Suspense fallback={null}>
              <HomeSharing onPlay={playSharing} onCreate={focusComposer} />
            </Suspense>
          )}
          {!conversationActive && (
            <Suspense fallback={null}>
              <HomeVitrineShowcase />
            </Suspense>
          )}
          {!conversationActive && (
            <Suspense fallback={null}>
              <HomeEditorShowcase paused={modalOpen || heroPlaying} onCreate={focusComposer} />
            </Suspense>
          )}
          {!conversationActive && (
            <section
              className="home-resource-links"
              data-home-motion="resources"
              aria-labelledby="home-resources-title"
            >
              <h2 id="home-resources-title">Le marketing immobilier IA, de l’annonce à la publication.</h2>
              <p>
                Créez une vidéo à partir de vos annonces et photos, personnalisez-la avec l’identité de votre agence et
                programmez sa publication sur Instagram et Facebook.
              </p>
              <nav aria-label="Découvrir les fonctionnalités">
                {featurePages.map((page) => (
                  <Link key={page.slug} href={`/${page.slug}`} prefetch={false}>
                    {page.heading}
                  </Link>
                ))}
                <Link href="/guides" prefetch={false}>
                  Conseils et guides
                </Link>
                <Link href="/blog" prefetch={false}>
                  Le blog BienVu
                </Link>
                <Link href="/sources" prefetch={false}>
                  Sources d’import testées
                </Link>
              </nav>
            </section>
          )}
        </main>
        <Suspense fallback={null}>
          <HomeFooter onCreate={focusComposer} />
        </Suspense>
      </div>
      {dialog && (
        // biome-ignore lint/a11y/useKeyWithClickEvents: Native dialog keyboard handling and close buttons provide dismissal; this handler only handles backdrop clicks.
        <dialog
          ref={modal}
          className={`home-dialog${dialog === 'example' ? ' home-video-dialog' : dialog === 'explore' ? ' home-explore-dialog' : ''}`}
          aria-labelledby="home-dialog-title"
          onCancel={() => setDialog(null)}
          onClick={(event) => {
            if (event.target === event.currentTarget) setDialog(null);
          }}
        >
          <button className="home-dialog-close" type="button" aria-label="Fermer" onClick={() => setDialog(null)}>
            <HomeIcon name="close" size={21} />
          </button>
          {dialog === 'example' ? (
            <>
              <div className="home-video-heading">
                <p className="home-dialog-kicker">L’IMMOBILIER, EN MOUVEMENT</p>
                <h2 id="home-dialog-title">{movieTitle}</h2>
                <p>
                  {customMovie
                    ? (movie.agency ?? selectedVisual.agency ?? 'BienVu')
                    : `${selected.agency} · Agence fictive`}
                </p>
              </div>
              <video
                key={movie.src}
                src={movie.src}
                poster={selectedVisual.kind === 'image' ? selectedVisual.src : (movie.poster ?? undefined)}
                controls
                autoPlay
                playsInline
                preload="metadata"
                aria-label={`Vidéo : ${movieTitle}`}
              />
              {!customMovie && (
                <p className="home-dialog-footnote">
                  Animation d’un visuel généré, sans voix off. Vos vidéos utilisent les photos de votre bien et votre
                  identité d’agence.
                </p>
              )}
            </>
          ) : dialog === 'explore' ? (
            <>
              <p className="home-dialog-kicker">À DÉCOUVRIR</p>
              <h2 id="home-dialog-title">À chaque bien, son histoire.</h2>
              <p className="home-explore-intro">
                {customDiscover
                  ? 'Découvrez les vidéos sélectionnées pour BienVu.'
                  : 'Quatre ambiances pour imaginer votre prochaine vidéo.'}
              </p>
              {!customDiscover && (
                <div role="group" className="home-gallery-filters" aria-label="Filtrer les inspirations">
                  {['Tous', 'Appartements', 'Maisons'].map((value) => (
                    <button
                      type="button"
                      key={value}
                      aria-pressed={category === value}
                      onClick={() => setCategory(value)}
                    >
                      {value}
                    </button>
                  ))}
                </div>
              )}
              <div className="home-example-grid">
                {examples
                  .filter((example) => customDiscover || category === 'Tous' || example.category === category)
                  .map((example) => (
                    <ExampleCard key={example.id} example={example} onPlay={play} />
                  ))}
              </div>
              {!customDiscover && (
                <p className="home-dialog-footnote">Visuels générés, agences fictives et animations sans son.</p>
              )}
              <Link className="home-dialog-link" href="/explorer">
                Voir les vidéos partagées par les agences <HomeIcon name="external" size={16} />
              </Link>
            </>
          ) : (
            <>
              <p className="home-dialog-kicker">BIENVENUE DANS VOTRE STUDIO</p>
              <h2 id="home-dialog-title">Un lien. Et ça tourne.</h2>
              <ol className="home-help-steps">
                <li>
                  <span>01</span>
                  <div>
                    <h3>Ajoutez votre annonce</h3>
                    <p>
                      Collez le lien de votre annonce ou choisissez « Saisie manuelle » pour ajouter les informations et
                      les photos du bien. Vous pouvez aussi créer votre vidéo en saisie manuelle sans compte.
                    </p>
                  </div>
                </li>
                <li>
                  <span>02</span>
                  <div>
                    <h3>Essayez gratuitement</h3>
                    <p>
                      1 crédit offert permet de créer une vidéo sans compte, à partir d’un lien compatible ou de vos
                      propres photos, avec les mouvements classiques. Après inscription et confirmation de votre compte,
                      vous recevez 3 crédits gratuits par mois, utilisables aussi pour les animations IA.
                    </p>
                  </div>
                </li>
                <li>
                  <span>03</span>
                  <div>
                    <h3>Prévisualisez et partagez votre vidéo</h3>
                    <p>
                      L’essai affiche un aperçu complet avec filigrane. Connectez-vous pour la télécharger sans
                      filigrane et la retrouver dans « Mes biens ». Vous pouvez ensuite la retoucher dans l’Éditeur ou
                      la publier sur vos réseaux connectés.
                    </p>
                  </div>
                </li>
              </ol>
              <Link className="home-dialog-link" href="/sources">
                Voir les sources compatibles <HomeIcon name="external" size={16} />
              </Link>
              <a className="home-support-link" href="mailto:contact@bienvu.online">
                Une question ? contact@bienvu.online
              </a>
            </>
          )}
        </dialog>
      )}
    </div>
  );
}
