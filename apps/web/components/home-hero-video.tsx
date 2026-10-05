'use client';

import {useEffect, useRef, useState} from 'react';
import {HomeIcon} from './home-icons';
import {HomeVisual, useHomepageMedia, homeClock, type HomeMediaView} from './homepage-media';

type PlaybackProps = {paused: boolean; onPlayingChange(playing: boolean): void};

export function HomeHeroVideo(props: PlaybackProps) {
  const visual = useHomepageMedia('hero.visual'), movie = useHomepageMedia('hero.video');
  return <HeroPlayer key={movie.src} visual={visual} movie={movie} {...props}/>;
}

function HeroPlayer({visual, movie, paused, onPlayingChange}: PlaybackProps & {visual: HomeMediaView; movie: HomeMediaView}) {
  const video = useRef<HTMLVideoElement>(null), attempt = useRef(0);
  const [started, setStarted] = useState(false), [error, setError] = useState(false);
  const [muted, setMuted] = useState(true);
  const [aspectRatio, setAspectRatio] = useState(movie.width && movie.height ? `${movie.width} / ${movie.height}` : '9 / 16');
  const autoplayAttempted = useRef(false), blocked = useRef(paused);
  blocked.current = paused;
  const poster = visual.kind === 'image' ? visual.src : visual.poster ?? movie.poster;
  const custom = visual.custom || movie.custom;

  useEffect(() => {
    if (paused) {attempt.current++; video.current?.pause();}
  }, [paused]);

  useEffect(() => {
    const player = video.current;
    // A wide phone in landscape still has a touch pointer: it must keep
    // click-to-play. No autoplay attribute is sent in the server HTML.
    const desktop = matchMedia('(min-width: 761px) and (hover: hover) and (pointer: fine)');
    const start = () => {
      if (!player || !desktop.matches || document.hidden || blocked.current || autoplayAttempted.current || !player.paused) return;
      const current = ++attempt.current;
      player.muted = true; setMuted(true);
      void player.play().catch(cause => {
        if (attempt.current !== current || cause instanceof DOMException && cause.name === 'AbortError') return;
        setStarted(false); onPlayingChange(false);
        if (!(cause instanceof DOMException && cause.name === 'NotAllowedError')) setError(true);
      });
    };
    const resize = () => {
      if (!desktop.matches) {attempt.current++; player?.pause();}
      else start();
    };
    start();
    desktop.addEventListener('change', resize);
    document.addEventListener('visibilitychange', start);
    return () => {
      desktop.removeEventListener('change', resize);
      document.removeEventListener('visibilitychange', start);
    };
  }, [paused, onPlayingChange]);

  useEffect(() => {
    const player = video.current;
    const pause = () => {attempt.current++; player?.pause(); onPlayingChange(false);};
    const visibility = () => {if (document.hidden) pause();};
    const otherPlayback = (event: Event) => {
      if (event.target instanceof HTMLMediaElement && event.target !== player && !event.target.muted) pause();
    };
    document.addEventListener('visibilitychange', visibility);
    document.addEventListener('play', otherPlayback, true);
    return () => {
      document.removeEventListener('visibilitychange', visibility);
      document.removeEventListener('play', otherPlayback, true);
      pause();
    };
  }, [onPlayingChange]);

  async function play() {
    const player = video.current; if (!player || paused) return;
    const current = ++attempt.current;
    autoplayAttempted.current = true;
    player.muted = false; setMuted(false);
    setError(false); setStarted(true);
    if (player.error) player.load();
    try {
      await player.play();
      if (attempt.current === current) player.focus({preventScroll: true});
    } catch (cause) {
      if (attempt.current === current && !(cause instanceof DOMException && cause.name === 'AbortError')) {
        setError(true); setStarted(false); onPlayingChange(false);
      }
    }
  }

  return <>
    <div className={`home-hero-demo${started ? ' is-started' : ''}`} style={{aspectRatio}}>
      <video ref={video} src={movie.src} poster={poster ?? undefined} controls={started} muted={muted} playsInline loop
        preload={poster ? 'none' : 'metadata'} tabIndex={started ? 0 : -1} aria-hidden={!started}
        aria-label={movie.title ? `Vidéo de présentation : ${movie.title}` : 'Vidéo de présentation BienVu'}
        onLoadedMetadata={event => {const player = event.currentTarget; if (player.videoWidth && player.videoHeight) setAspectRatio(`${player.videoWidth} / ${player.videoHeight}`);}}
        onVolumeChange={event => setMuted(event.currentTarget.muted)}
        onPlay={() => {autoplayAttempted.current = true; setError(false); setStarted(true); onPlayingChange(true);}}
        onPause={() => onPlayingChange(false)} onEnded={() => onPlayingChange(false)}
        onError={() => {setError(true); setStarted(false); onPlayingChange(false);}}/>
      {!started && <button type="button" className="home-hero-demo-cover" onClick={() => void play()}
        aria-label={error ? 'Réessayer la lecture de la vidéo de présentation' : 'Lire la vidéo de présentation'}>
        {poster && <HomeVisual media={visual.kind === 'image' ? visual : {...visual, kind: 'image', src: poster}}
          alt={custom ? visual.title ?? 'Vidéo immobilière' : 'Salon lumineux avec moulures et grandes fenêtres ouvertes sur la ville'} loading="eager" fetchPriority="high"/>}
        <span className="home-hero-demo-shade"/>
        <span className="home-duration">{homeClock(movie.duration ?? 28)}</span>
        {!custom && <span className="home-hero-demo-heading"><strong>Paris</strong><span>Un nouveau regard<br/>sur votre bien</span></span>}
        <span className="home-play" aria-hidden="true"><HomeIcon name="play" size={23}/></span>
        {!custom && <span className="home-hero-demo-facts"><span><HomeIcon name="house" size={18}/>65 m² · 3 pièces</span><strong>385 000 €</strong></span>}
      </button>}
    </div>
    {error && <p className="home-hero-video-error" role="alert">La vidéo n’a pas pu être lue. Cliquez sur Lecture pour réessayer.</p>}
  </>;
}
