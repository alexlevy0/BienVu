'use client';
import { useEffect, useId, useRef, useState } from 'react';
import { DEFAULT_MUSIC_VOLUME, MusicLibraryPage, type VideoMusic } from '@bienvu/contracts';
import { editorResponse } from '../lib/editor-client';
import { claimPreviewAudio, previewAudioEvent } from '../lib/preview-audio';
import { HomeIcon } from './home-icons';
import { MusicWaveform, musicTime } from './music-waveform';

export function CustomizerMusic({
  music,
  onChange,
  onPick,
  authenticated,
  voiceEnabled,
  busy,
}: {
  music?: VideoMusic;
  onChange(value: VideoMusic | undefined): void;
  onPick?(id: string): Promise<VideoMusic>;
  authenticated: boolean;
  voiceEnabled: boolean;
  busy: boolean;
}) {
  const previewId = useId();
  const [page, setPage] = useState<MusicLibraryPage | null>(null),
    [query, setQuery] = useState(''),
    [search, setSearch] = useState(''),
    [retry, setRetry] = useState(0),
    [loading, setLoading] = useState(true),
    [more, setMore] = useState(false),
    [error, setError] = useState(''),
    [adding, setAdding] = useState<string | null>(null),
    [preview, setPreview] = useState<string | null>(null);
  const audio = useRef<HTMLAudioElement>(null),
    controller = useRef<AbortController | null>(null),
    mounted = useRef(true),
    selecting = useRef(false);
  const volume = music?.volume ?? DEFAULT_MUSIC_VOLUME,
    disabled = busy || Boolean(adding);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  useEffect(() => {
    const timer = setTimeout(() => setSearch(query.trim()), 250);
    return () => clearTimeout(timer);
  }, [query]);
  useEffect(() => {
    if (!authenticated) return;
    const request = new AbortController();
    controller.current = request;
    setLoading(true);
    setMore(false);
    setError('');
    setPreview(null);
    void fetch('/api/music-library?' + new URLSearchParams({ q: search }), {
      cache: 'no-store',
      signal: request.signal,
    })
      .then(editorResponse)
      .then((value) => {
        if (!request.signal.aborted) setPage(MusicLibraryPage.parse(value));
      })
      .catch(() => {
        if (!request.signal.aborted)
          setError('La banque de musiques n’a pas pu être chargée. Votre choix est conservé.');
      })
      .finally(() => {
        if (!request.signal.aborted) setLoading(false);
      });
    return () => request.abort();
  }, [authenticated, search, retry]);
  useEffect(() => {
    const node = audio.current;
    if (!node) return;
    let active = true;
    node.volume = volume;
    if (preview)
      void node.play().catch(() => {
        if (active && mounted.current) {
          setPreview(null);
          setError('La lecture n’a pas pu démarrer. Réessayez.');
        }
      });
    return () => {
      active = false;
    };
  }, [preview, volume]);
  useEffect(() => {
    const node = audio.current;
    return () => {
      node?.pause();
    };
  }, [preview]);
  useEffect(() => {
    const other = (event: Event) => {
      if ((event as CustomEvent).detail !== previewId) {
        audio.current?.pause();
        setPreview(null);
      }
    };
    window.addEventListener(previewAudioEvent, other);
    return () => window.removeEventListener(previewAudioEvent, other);
  }, [previewId]);
  async function choose(id: string) {
    if (!onPick || selecting.current || busy) return;
    selecting.current = true;
    setAdding(id);
    setPreview(null);
    setError('');
    try {
      const selected = await onPick(id);
      if (mounted.current) onChange({ ...selected, volume });
    } catch (cause) {
      if (mounted.current)
        setError(
          cause instanceof Error && cause.name !== 'ZodError'
            ? cause.message
            : 'Cette musique n’est plus disponible. Choisissez un autre morceau.',
        );
    } finally {
      selecting.current = false;
      if (mounted.current) setAdding(null);
    }
  }
  async function loadMore() {
    if (!page?.nextCursor || more) return;
    const request = controller.current;
    if (!request) return;
    setMore(true);
    setError('');
    try {
      const next = MusicLibraryPage.parse(
        await editorResponse(
          await fetch('/api/music-library?' + new URLSearchParams({ q: search, cursor: page.nextCursor }), {
            cache: 'no-store',
            signal: request.signal,
          }),
        ),
      );
      if (!request.signal.aborted)
        setPage((previous) =>
          previous
            ? {
                ...next,
                items: [
                  ...previous.items,
                  ...next.items.filter((track) => !previous.items.some((item) => item.id === track.id)),
                ],
              }
            : next,
        );
    } catch {
      if (!request.signal.aborted) setError('Le chargement a été interrompu. Réessayez.');
    } finally {
      if (!request.signal.aborted) setMore(false);
    }
  }
  return (
    <section className="customizer-music" aria-label="Musique de votre vidéo">
      <div className="customizer-section-title">
        <strong>Musique de fond</strong>
        <p>Incluse, sans crédit supplémentaire.</p>
      </div>
      {authenticated && !onPick && (
        <p className="customizer-hint">Enregistrez votre annonce pour pouvoir y ajouter une musique.</p>
      )}
      {!authenticated ? (
        <div className="customizer-empty">
          <HomeIcon name="music" size={28} />
          <p>Connectez-vous pour choisir une musique pour votre vidéo.</p>
          <a href="/connexion">Se connecter</a>
        </div>
      ) : (
        <>
          <div className="customizer-music-selection">
            <div>
              <HomeIcon name="music" size={20} />
              <span>
                <strong>{music?.name ?? 'Sans musique'}</strong>
              </span>
            </div>
            {music && (
              <button
                type="button"
                disabled={disabled}
                onClick={() => {
                  setPreview(null);
                  onChange(undefined);
                }}
              >
                Retirer
              </button>
            )}
          </div>
          {music && (
            <div className="customizer-music-volume">
              <label htmlFor="customizer-music-volume">
                Volume de la musique <output htmlFor="customizer-music-volume">{Math.round(volume * 100)} %</output>
              </label>
              <input
                id="customizer-music-volume"
                aria-describedby="customizer-music-volume-help"
                type="range"
                min={0}
                max={100}
                step={1}
                value={Math.round(volume * 100)}
                disabled={disabled}
                onChange={(event) => onChange({ ...music, volume: Number(event.target.value) / 100 })}
              />
              <div id="customizer-music-volume-help">
                <span>
                  {voiceEnabled && volume > 0.25
                    ? 'Volume élevé : la musique risque de couvrir la voix off.'
                    : volume === 0
                      ? 'La musique est coupée.'
                      : voiceEnabled
                        ? '10 à 20 % conseillés avec une voix off.'
                        : 'Ajustez le volume à l’écoute.'}
                </span>
                <button
                  type="button"
                  disabled={disabled || volume === DEFAULT_MUSIC_VOLUME}
                  onClick={() => onChange({ ...music, volume: DEFAULT_MUSIC_VOLUME })}
                >
                  Revenir à 15 %
                </button>
              </div>
            </div>
          )}
          <label className="customizer-music-search">
            <HomeIcon name="search" size={18} />
            <span className="sr-only">Rechercher une musique</span>
            <input
              type="search"
              maxLength={100}
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Rechercher une musique…"
              disabled={disabled}
            />
          </label>
          {error && (
            <p className="customizer-music-error" role="alert">
              {error}{' '}
              <button type="button" disabled={disabled} onClick={() => setRetry((n) => n + 1)}>
                Réessayer
              </button>
            </p>
          )}
          {loading ? (
            <p className="customizer-hint" role="status">
              Chargement des musiques…
            </p>
          ) : !page?.items.length && !error ? (
            <div className="customizer-empty">
              <HomeIcon name="music" size={26} />
              <p>
                {search
                  ? 'Aucun morceau ne correspond à votre recherche.'
                  : 'Les musiques publiées par BienVu apparaîtront ici.'}
              </p>
            </div>
          ) : (
            <div className="customizer-music-tracks">
              {page?.items.map((track) => {
                const selected = music?.libraryId === track.id;
                return (
                  <article key={track.id} className={`customizer-music-track${selected ? ' is-selected' : ''}`}>
                    <button
                      type="button"
                      className="customizer-music-listen"
                      disabled={disabled}
                      aria-label={`${preview === track.id ? 'Arrêter' : 'Écouter'} ${track.name}`}
                      aria-pressed={preview === track.id}
                      onClick={() => {
                        claimPreviewAudio(previewId);
                        setError('');
                        setPreview((value) => (value === track.id ? null : track.id));
                      }}
                    >
                      <HomeIcon name={preview === track.id ? 'pause' : 'play'} size={20} />
                    </button>
                    <div className="customizer-music-track-info">
                      <strong>{track.name}</strong>
                      <span>
                        {musicTime(track.durationMs)}
                        {track.description ? ` · ${track.description}` : ''}
                      </span>
                      <MusicWaveform peaks={track.waveform} />
                    </div>
                    <button
                      type="button"
                      className="customizer-music-choose"
                      disabled={disabled || !onPick}
                      aria-pressed={selected}
                      aria-label={`Choisir ${track.name}`}
                      onClick={() => void choose(track.id)}
                    >
                      {adding === track.id ? 'Ajout…' : selected ? '✓ Choisie' : 'Choisir'}
                    </button>
                  </article>
                );
              })}
            </div>
          )}
          {page?.nextCursor && (
            <button
              type="button"
              className="customizer-add"
              disabled={disabled || more || loading}
              onClick={() => void loadMore()}
            >
              {more ? 'Chargement…' : 'Plus de musiques'}
            </button>
          )}
          {adding && (
            <p className="customizer-hint" role="status">
              Ajout de la musique à votre vidéo…
            </p>
          )}
          {preview && (
            <audio
              key={preview}
              ref={audio}
              preload="none"
              src={`/api/music-library/${preview}/audio`}
              onEnded={() => setPreview(null)}
              onError={() => {
                setPreview(null);
                setError('Cette piste ne peut pas être lue. Essayez un autre morceau.');
              }}
            />
          )}
        </>
      )}
    </section>
  );
}
