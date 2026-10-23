'use client';
import { useCallback, useEffect, useRef, useState, type KeyboardEvent, type Ref, type CSSProperties } from 'react';
import { CreationMotion, m } from './creation-motion';
import { HomeIcon } from './home-icons';
import { HeroBacklight } from './hero-backlight';
import { homeClock } from './homepage-media';
import { homeHeroDepth } from '../lib/home-hero-depth-assets';
import { emptyHeroImage, heroAvatarFormat, heroDepthUrl } from '../lib/home-hero-depth';
import { synchronizeVideoGroup, type VideoPairState } from '../lib/synchronized-videos';
import { useHeroDepthMotion } from './use-hero-depth-motion';

type Props = { paused: boolean; onPlayingChange(playing: boolean): void; onUnavailable(): void };
const initial: VideoPairState = {
  requested: false,
  playing: false,
  loading: false,
  ready: false,
  error: false,
  time: 0,
  duration: 40,
};
export function SoundIcon({ muted }: { muted: boolean }) {
  return (
    <svg
      width="19"
      height="19"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M11 4 6 8H3v8h3l5 4V4Z" />
      {muted ? <path d="m16 9 5 6m-5 0 5-6" /> : <path d="M15 8a6 6 0 0 1 0 8m3-11a10 10 0 0 1 0 14" />}
    </svg>
  );
}
function DesktopPicture({
  src,
  alt = '',
  imageRef,
  width = 540,
  height = 960,
}: {
  src: string;
  alt?: string;
  imageRef?: Ref<HTMLImageElement>;
  width?: number;
  height?: number;
}) {
  return (
    <picture>
      <source media="(min-width: 761px)" srcSet={src} />
      <img
        ref={imageRef}
        src={emptyHeroImage}
        alt={alt}
        width={width}
        height={height}
        decoding="async"
        fetchPriority={imageRef ? 'high' : 'auto'}
      />
    </picture>
  );
}
export function HomeHeroDepthVideo({ paused, onPlayingChange, onUnavailable }: Props) {
  const root = useRef<HTMLDivElement>(null),
    stage = useRef<HTMLDivElement>(null),
    background = useRef<HTMLVideoElement>(null),
    avatar = useRef<HTMLVideoElement>(null),
    foreground = useRef<HTMLVideoElement>(null),
    poster = useRef<HTMLImageElement>(null);
  const pair = useRef<ReturnType<typeof synchronizeVideoGroup> | null>(null),
    loaded = useRef(false),
    blocked = useRef(paused);
  const [state, setState] = useState(initial),
    [shown, setShown] = useState(false),
    [muted, setMuted] = useState(true),
    [fullscreen, setFullscreen] = useState(false),
    [canFullscreen, setCanFullscreen] = useState(false);
  const parallax = useHeroDepthMotion(root, paused, fullscreen);
  blocked.current = paused;
  const load = useCallback(() => {
    if (
      !matchMedia('(min-width: 761px)').matches ||
      loaded.current ||
      !background.current ||
      !avatar.current ||
      !foreground.current
    )
      return;
    loaded.current = true;
    background.current.src = heroDepthUrl(homeHeroDepth.assets.background.id);
    avatar.current.src = heroDepthUrl(homeHeroDepth.assets[heroAvatarFormat(navigator.userAgent)].id);
    foreground.current.src = heroDepthUrl(
      homeHeroDepth.assets[heroAvatarFormat(navigator.userAgent) === 'avatarHevc' ? 'foregroundHevc' : 'foregroundWebm']
        .id,
    );
    for (const player of [background.current, avatar.current, foreground.current]) {
      player.preload = 'auto';
      player.load();
    }
  }, []);
  useEffect(() => {
    loaded.current = false;
    setShown(false);
    setState(initial);
    const main = background.current!,
      presenter = avatar.current!,
      text = foreground.current!;
    pair.current = synchronizeVideoGroup(
      [main, presenter, text],
      (next) => {
        setState(next);
        if (next.playing) setShown(true);
      },
      0,
      homeHeroDepth.duration,
      { loop: true },
    );
    const visibility = () => {
      if (document.hidden) pair.current?.pause();
    };
    const other = (event: Event) => {
      if (
        event.target instanceof HTMLMediaElement &&
        ![main, presenter, text].includes(event.target as HTMLVideoElement) &&
        !event.target.muted
      )
        pair.current?.pause();
    };
    const full = () => setFullscreen(document.fullscreenElement === root.current);
    setCanFullscreen(Boolean(root.current?.requestFullscreen));
    document.addEventListener('visibilitychange', visibility);
    document.addEventListener('play', other, true);
    document.addEventListener('fullscreenchange', full);
    return () => {
      pair.current?.destroy();
      pair.current = null;
      loaded.current = false;
      for (const player of [main, presenter, text]) {
        player.removeAttribute('src');
        player.load();
      }
      document.removeEventListener('visibilitychange', visibility);
      document.removeEventListener('play', other, true);
      document.removeEventListener('fullscreenchange', full);
    };
  }, []);
  useEffect(() => {
    onPlayingChange(state.playing);
    return () => onPlayingChange(false);
  }, [onPlayingChange, state.playing]);
  useEffect(() => {
    if (paused) pair.current?.pause();
  }, [paused]);
  useEffect(() => {
    const desktop = matchMedia('(min-width: 761px)'),
      autoplay = matchMedia('(hover: hover) and (pointer: fine) and (prefers-reduced-motion: no-preference)');
    let visible = false,
      attempted = false,
      idle: number | undefined,
      disposed = false;
    const start = () => {
      idle = undefined;
      if (
        disposed ||
        !desktop.matches ||
        !autoplay.matches ||
        !visible ||
        document.hidden ||
        blocked.current ||
        attempted
      )
        return;
      if ((navigator as Navigator & { connection?: { saveData?: boolean } }).connection?.saveData) return;
      attempted = true;
      load();
      pair.current?.play();
    };
    const schedule = () => {
      if (document.readyState !== 'complete' || idle !== undefined) return;
      if (window.requestIdleCallback) idle = window.requestIdleCallback(start, { timeout: 1400 });
      else idle = window.setTimeout(start, 120);
    };
    const resize = () => {
      if (!desktop.matches) pair.current?.pause();
      else schedule();
    };
    const observer = new IntersectionObserver(
      (entries) => {
        visible = entries.some((e) => e.isIntersecting && e.intersectionRatio > 0.1);
        if (visible) schedule();
        else pair.current?.pause();
      },
      { threshold: 0.1 },
    );
    if (stage.current) observer.observe(stage.current);
    desktop.addEventListener('change', resize);
    autoplay.addEventListener('change', resize);
    window.addEventListener('load', schedule);
    return () => {
      disposed = true;
      observer.disconnect();
      desktop.removeEventListener('change', resize);
      autoplay.removeEventListener('change', resize);
      window.removeEventListener('load', schedule);
      if (idle !== undefined) {
        if (window.cancelIdleCallback) window.cancelIdleCallback(idle);
        else clearTimeout(idle);
      }
    };
  }, [load, paused]);
  const play = (withSound = false) => {
    if (blocked.current) return;
    load();
    if (withSound && background.current) {
      background.current.muted = false;
      setMuted(false);
    }
    pair.current?.play();
  };
  const toggle = () => {
    if (state.requested) pair.current?.pause();
    else play(!shown);
  };
  const sound = () => {
    if (background.current) {
      const next = !background.current.muted;
      background.current.muted = next;
      setMuted(next);
    }
  };
  const expand = async () => {
    try {
      if (document.fullscreenElement === root.current) await document.exitFullscreen();
      else await root.current?.requestFullscreen();
    } catch {
      /* Keep inline playback usable if the browser declines fullscreen. */
    }
  };
  const keyboard = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.target !== event.currentTarget) return;
    if (event.key === ' ' || event.key === 'k') {
      event.preventDefault();
      toggle();
    } else if (event.key === 'ArrowRight' || event.key === 'ArrowLeft') {
      event.preventDefault();
      load();
      pair.current?.seek(state.time + (event.key === 'ArrowRight' ? 5 : -5));
    } else if (event.key === 'm') sound();
    else if (event.key === 'f') void expand();
  };
  return (
    <CreationMotion>
      <div className="home-hero-depth" ref={root}>
        <div
          className={`home-hero-depth-stage${shown ? ' has-played' : ''}`}
          ref={stage}
          role="group"
          aria-label="Vidéo immobilière avec un présentateur IA"
          // biome-ignore lint/a11y/noNoninteractiveTabindex: This named scroll region or preview must receive focus for keyboard scrolling, tab navigation or playback controls.
          tabIndex={0}
          onKeyDown={keyboard}
        >
          <m.div className="home-hero-depth-plane" style={parallax.stage}>
            <HeroBacklight video={background} active={state.playing && !paused} posterImage={poster} />
            <div className="home-hero-depth-screen">
              <m.div className="home-hero-depth-imagery" style={parallax.background}>
                <DesktopPicture
                  src={homeHeroDepth.backgroundPoster}
                  alt="Maison au Rouret, avec piscine et jardin"
                  imageRef={poster}
                />
                <video
                  ref={background}
                  playsInline
                  muted={muted}
                  preload="none"
                  tabIndex={-1}
                  aria-hidden="true"
                  onError={onUnavailable}
                />
              </m.div>
            </div>
            <m.div className="home-hero-depth-presenter" style={parallax.avatar} aria-hidden="true">
              <DesktopPicture
                src={homeHeroDepth.avatarPoster}
                width={homeHeroDepth.assets.avatarWebm.width}
                height={homeHeroDepth.assets.avatarWebm.height}
              />
              <video ref={avatar} playsInline muted preload="none" tabIndex={-1} onError={onUnavailable} />
            </m.div>
            <div className="home-hero-depth-foreground" aria-hidden="true">
              <m.div className="home-hero-depth-lettering" style={parallax.foreground}>
                <DesktopPicture src={homeHeroDepth.foregroundPoster} />
                <video ref={foreground} playsInline muted preload="none" tabIndex={-1} onError={onUnavailable} />
              </m.div>
            </div>
            <m.div className="home-hero-depth-badge" style={parallax.badge} aria-hidden="true">
              <span>
                <HomeIcon name="user" filled size={13} />
                Avatar IA
              </span>
              <svg aria-hidden="true" width="35" height="42" viewBox="0 0 35 42" fill="none">
                <path
                  d="M4 2C3 19 11 29 29 32m-7-6 8 6-8 4"
                  stroke="currentColor"
                  strokeWidth="1.3"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </m.div>
            {!shown && (
              <button
                type="button"
                className="home-hero-depth-cover"
                onClick={() => play(true)}
                aria-label="Lire la vidéo de présentation avec l’avatar IA"
              >
                <span>
                  <HomeIcon name="play" filled size={24} />
                </span>
              </button>
            )}
            {state.loading && (
              <div className="home-hero-depth-loading" role="status">
                <span />
                Chargement…
              </div>
            )}
          </m.div>
          <div className="home-hero-depth-controls">
            <div className="home-hero-depth-toolbar">
              <button
                type="button"
                onClick={toggle}
                aria-label={state.requested ? 'Mettre la vidéo en pause' : 'Lire la vidéo'}
              >
                <HomeIcon name={state.requested ? 'pause' : 'play'} filled={!state.requested} size={19} />
              </button>
              <span className="home-hero-depth-time">
                {homeClock(state.time)} / {homeClock(state.duration)}
              </span>
              <button
                type="button"
                className="home-hero-depth-sound"
                onClick={sound}
                aria-label={muted ? 'Activer le son' : 'Couper le son'}
                aria-pressed={!muted}
              >
                <SoundIcon muted={muted} />
              </button>
              {canFullscreen && (
                <button
                  type="button"
                  onClick={() => void expand()}
                  aria-label={fullscreen ? 'Quitter le plein écran' : 'Afficher la vidéo et l’avatar en plein écran'}
                >
                  <HomeIcon name="fullscreen" size={17} />
                </button>
              )}
            </div>
            <input
              type="range"
              aria-label="Position dans la vidéo"
              min="0"
              max={state.duration}
              step="0.1"
              value={state.time}
              onChange={(event) => {
                load();
                pair.current?.seek(Number(event.target.value));
              }}
              style={{ '--hero-progress': `${(state.time / state.duration) * 100}%` } as CSSProperties}
            />
          </div>
          {state.error && (
            <button type="button" className="home-hero-depth-retry" onClick={() => play(true)}>
              Lire la vidéo <HomeIcon name="play" size={14} />
            </button>
          )}
        </div>
      </div>
    </CreationMotion>
  );
}
