'use client';
import { useState } from 'react';
import { HomeHeroVideo } from './home-hero-video';
import { HomeIcon } from './home-icons';

export function AutoStudioPreview({
  paused,
  onPlayingChange,
}: {
  paused: boolean;
  onPlayingChange(playing: boolean): void;
}) {
  const [playing, setPlaying] = useState(false);
  return (
    <aside className="auto-studio-preview" aria-label="Exemples immobilier et automobile">
      <p className="auto-note auto-note-top">
        Même puissance IA,
        <br />
        pour l’immobilier et l’auto !
        <svg viewBox="0 0 96 50" aria-hidden="true">
          <path d="M94 5C45-10 10 32 43 31c29-1-18-33-35 15m0 0 1-13m-1 13 13-6" />
        </svg>
      </p>
      <div className="auto-preview-house">
        <HomeHeroVideo render="standard" paused={paused || playing} onPlayingChange={onPlayingChange} />
      </div>
      <div className={`auto-preview-car${playing && !paused ? ' is-playing' : ''}`}>
        <img
          src="/images/studio-auto/suv-alpes-960.webp"
          srcSet="/images/studio-auto/suv-alpes-480.webp 480w, /images/studio-auto/suv-alpes-960.webp 960w"
          sizes="(max-width: 600px) 220px, 320px"
          width={960}
          height={1440}
          alt="SUV gris devant les montagnes, visuel de démonstration"
        />
        <div className="auto-preview-shade" />
        <span className="auto-preview-city">Lyon</span>
        <div className="auto-preview-title">
          <span>LE VÉHICULE</span>
          <strong>EN IMAGES</strong>
        </div>
        <button
          type="button"
          className="auto-preview-play"
          aria-label={playing ? 'Mettre l’aperçu en pause' : 'Animer l’aperçu automobile'}
          aria-pressed={playing}
          onClick={() => {
            setPlaying(!playing);
            onPlayingChange(!playing);
          }}
        >
          <HomeIcon name={playing ? 'pause' : 'play'} size={25} filled />
        </button>
        <div className="auto-preview-facts">
          <strong>
            SUV compact
            <br />
            Votre prochaine vidéo
          </strong>
          <span>2022 · 68 000 km</span>
          <div>
            <span>Diesel</span>
            <span>Automatique</span>
            <span>150 ch</span>
          </div>
        </div>
        <small>Exemple illustratif · données de démonstration</small>
      </div>
      <p className="auto-note auto-note-bottom">
        Des templates
        <br />
        adaptés à l’auto
        <svg viewBox="0 0 48 80" aria-hidden="true">
          <path d="M7 76c52-34 28-55 9-69m0 0 13 4M16 7l1 14" />
        </svg>
      </p>
    </aside>
  );
}

const formats = [
  ['clapper', 'Reel Instagram'],
  ['phone', 'Story'],
  ['music', 'TikTok'],
  ['video', 'Vidéo YouTube'],
  ['globe', 'Post Facebook'],
  ['image', 'Visuel prix / km'],
  ['document', 'Texte annonce'],
] as const;
export function AutoContentKit() {
  return (
    <section className="auto-content-kit" aria-label="Sept façons de partager votre annonce">
      <div className="auto-kit-copy">
        <div className="auto-kit-heading">
          <span>
            <HomeIcon name="car" size={36} />
          </span>
          <div>
            <h2>Annonces auto : les mêmes 7 contenus</h2>
            <p>Une vidéo principale, des idées pour tous vos réseaux.</p>
          </div>
        </div>
        <div className="auto-kit-formats">
          {formats.map(([icon, label]) => (
            <span key={label}>
              <HomeIcon name={icon} size={20} />
              <span>{label}</span>
            </span>
          ))}
        </div>
        <small>
          Vidéos téléchargeables en vertical ou horizontal. Visuels et textes à adapter à partir de votre annonce.
        </small>
      </div>
      <div className="auto-kit-examples" aria-hidden="true">
        <div className="auto-kit-reel">
          <img src="/images/studio-auto/suv-alpes-480.webp" width={480} height={720} alt="" />
          <span>
            Votre annonce.
            <br />
            <strong>En mouvement.</strong>
          </span>
        </div>
        <div className="auto-kit-price">
          <img src="/images/studio-auto/suv-alpes-480.webp" width={480} height={720} alt="" />
          <strong>SUV compact</strong>
          <small>68 000 km</small>
          <b>32 900 €</b>
        </div>
        <div className="auto-kit-text">
          <strong>Votre véhicule, en quelques mots.</strong>
          <p>Les caractéristiques de l’annonce, des photos qui font la différence.</p>
          <i />
          <i />
          <i />
        </div>
      </div>
    </section>
  );
}
