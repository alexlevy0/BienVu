'use client';
import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { HomeIcon } from './home-icons';
import { HomeVisual, useHomepageMedia } from './homepage-media';
import { imageWidthUrl, previewVideoUrl } from '../lib/home-media-view';
import { trackProductEvent } from '../lib/product-analytics';

type Destination = 'social' | 'site' | 'client';
function DestinationMovie({ context, onClose }: { context: Destination; onClose(): void }) {
  const movie = useHomepageMedia(`share.${context}.video`),
    visual = useHomepageMedia(`share.${context}.visual`);
  const dialog = useRef<HTMLDialogElement>(null),
    video = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    const element = dialog.current,
      player = video.current,
      trigger = document.activeElement as HTMLElement | null,
      previous = document.body.style.overflow;
    element?.showModal();
    document.body.style.overflow = 'hidden';
    const hide = () => {
      if (document.hidden) player?.pause();
    };
    document.addEventListener('visibilitychange', hide);
    return () => {
      player?.pause();
      element?.close();
      document.body.style.overflow = previous;
      document.removeEventListener('visibilitychange', hide);
      trigger?.focus({ preventScroll: true });
    };
  }, []);
  return (
    // biome-ignore lint/a11y/useKeyWithClickEvents: Native dialog keyboard handling and close buttons provide dismissal; this handler only handles backdrop clicks.
    <dialog
      ref={dialog}
      className="beta-example beta-destination-dialog"
      aria-labelledby="beta-destination-video-title"
      onCancel={onClose}
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div className="beta-example-header">
        <h2 id="beta-destination-video-title">Votre bien, en vidéo.</h2>
        <button type="button" className="beta-icon-button" aria-label="Fermer la vidéo" onClick={onClose}>
          <HomeIcon name="close" />
        </button>
      </div>
      <video
        ref={video}
        src={previewVideoUrl(movie.src, 540)}
        poster={imageWidthUrl(movie.poster ?? visual.src, 640)}
        controls
        playsInline
        preload="none"
        onPlay={() => trackProductEvent('video_played', { source_kind: 'demo' })}
      />
      <p>Exemple de présentation · prêt à télécharger et à partager</p>
    </dialog>
  );
}
function DestinationPoster({ context, onPlay }: { context: Destination; onPlay(): void }) {
  const visual = useHomepageMedia(`share.${context}.visual`);
  return (
    <button
      type="button"
      className="beta-destination-poster"
      onClick={onPlay}
      aria-haspopup="dialog"
      aria-label={`Lire l’exemple ${context === 'social' ? 'pour les réseaux' : context === 'site' ? 'pour votre site' : 'pour vos clients'}`}
    >
      <HomeVisual
        media={visual}
        alt="Exemple de présentation immobilière BienVu"
        sizes="(max-width:620px) 80vw, 28vw"
      />
      <span aria-hidden="true">
        <HomeIcon name="play" size={22} filled />
      </span>
    </button>
  );
}
export function BetaDestinations({
  onCreate,
  onPreviewChange,
}: {
  onCreate(): void;
  onPreviewChange(playing: boolean): void;
}) {
  const [preview, setPreview] = useState<Destination | null>(null);
  useEffect(() => {
    onPreviewChange(preview !== null);
    return () => onPreviewChange(false);
  }, [preview, onPreviewChange]);
  return (
    <section className="beta-section beta-destinations" aria-labelledby="beta-destinations-title">
      <header className="beta-section-heading">
        <span className="beta-eyebrow">UN BIEN. TOUTES SES OPPORTUNITÉS.</span>
        <h2 id="beta-destinations-title">
          Votre vidéo commence ici.
          <br />
          <em>Sa vie continue partout.</em>
        </h2>
      </header>
      <div className="beta-destination-grid">
        <article>
          <div className="beta-destination-mock is-social">
            <header>
              <span className="beta-mock-avatar">
                <HomeIcon name="house" size={16} />
              </span>
              <span>
                Votre agence<small>Votre prochaine visite</small>
              </span>
              <HomeIcon name="more" size={18} />
            </header>
            <DestinationPoster context="social" onPlay={() => setPreview('social')} />
            <footer>
              <HomeIcon name="heart" size={18} />
              <HomeIcon name="send" size={18} />
              <span>Instagram · Facebook</span>
            </footer>
          </div>
          <h3>Sur vos réseaux</h3>
          <p>Présentez vos biens en vidéo et préparez vos publications.</p>
          <Link href="/publications">
            Voir le calendrier <HomeIcon name="arrow" size={16} />
          </Link>
        </article>
        <article>
          <div className="beta-destination-mock is-site">
            <header>
              <HomeIcon name="globe" size={17} />
              <span>
                Votre agence<small>Nos biens · Notre équipe</small>
              </span>
            </header>
            <DestinationPoster context="site" onPlay={() => setPreview('site')} />
            <footer>
              <strong>Votre prochain coup de cœur.</strong>
              <span>À découvrir dans notre vitrine.</span>
            </footer>
          </div>
          <h3>Dans votre vitrine</h3>
          <p>Vos biens et vos vidéos, réunis sur une page à vos couleurs.</p>
          <Link href="/ma-vitrine/exemple">
            Visiter une vitrine <HomeIcon name="arrow" size={16} />
          </Link>
        </article>
        <article>
          <div className="beta-destination-mock is-client">
            <header>
              <HomeIcon name="mail" size={18} />
              <span>
                Présentation de votre bien<small>À votre futur acquéreur</small>
              </span>
            </header>
            <div className="beta-mock-message">Voici la vidéo du bien dont nous avons parlé. On visite ?</div>
            <DestinationPoster context="client" onPlay={() => setPreview('client')} />
            <footer>
              <HomeIcon name="paperclip" size={16} />
              <span>Une vidéo à joindre à vos échanges.</span>
            </footer>
          </div>
          <h3>Auprès de vos clients</h3>
          <p>Un fichier à télécharger pour accompagner vos échanges.</p>
          <button type="button" className="beta-text-button" onClick={onCreate}>
            Créer ma présentation <HomeIcon name="arrow" size={16} />
          </button>
        </article>
      </div>
      {preview && <DestinationMovie context={preview} onClose={() => setPreview(null)} />}
    </section>
  );
}
