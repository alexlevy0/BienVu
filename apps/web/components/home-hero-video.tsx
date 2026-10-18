'use client';

import {useCallback,useEffect, useRef, useState} from 'react';
import {HomeIcon} from './home-icons';
import {HomeVisual, useHomepageMedia, useHomepageHeroPoster, homeClock, type HomeMediaView} from './homepage-media';
import {imageWidthUrl,previewVideoUrl,heroPosterSizes} from '../lib/home-media-view';
import {HeroBacklight} from './hero-backlight';
import {HomeHeroDepthVideo} from './home-hero-depth-video';
import {emptyHeroImage,hasHeroDepth} from '../lib/home-hero-depth';
import {HomeHeroCarousel} from './home-hero-carousel';

type PlaybackProps = {paused: boolean; onPlayingChange(playing: boolean): void};

export function HomeHeroVideo({render,...props}: PlaybackProps & {render?:'standard'|'avatar-ai'}) {
  const inlinePoster=useHomepageHeroPoster();
  const heroVisual = useHomepageMedia('hero.visual'), heroMovie = useHomepageMedia('hero.video');
  const left=useHomepageMedia('hero.left.video'),right=useHomepageMedia('hero.right.video');
  const example=useHomepageMedia(render==='avatar-ai'?'renders.avatar-ai.video':'renders.standard.video');
  const movie=render?example:heroMovie,visual=render?{...example,kind:'image' as const,src:example.poster??`/images/studio-home/renders-${render}.webp`,custom:true}:heroVisual;
  return <ResponsiveHeroPlayer key={movie.src} visual={visual} movie={movie} inlinePoster={render?null:inlinePoster} depth={!render&&hasHeroDepth(movie)} companions={!render&&left.custom&&right.custom?[left,right]:undefined} {...props}/>;
}

function ResponsiveHeroPlayer({depth,companions,...props}:PlaybackProps&{visual:HomeMediaView;movie:HomeMediaView;inlinePoster:string|null;depth:boolean;companions?:[HomeMediaView,HomeMediaView]}){
 const [desktop,setDesktop]=useState(false),[unavailable,setUnavailable]=useState(false);
 const fallback=useCallback(()=>setUnavailable(true),[]);
 useEffect(()=>{const query=matchMedia('(min-width: 761px)'),change=()=>setDesktop(query.matches);change();query.addEventListener('change',change);return()=>query.removeEventListener('change',change);},[]);
 if(companions)return <>
  <div className="home-hero-mobile-player"><HeroPlayer {...props} mobileOnly paused={props.paused||desktop}/></div>
  <div className="home-hero-desktop-player home-hero-carousel-player"><HomeHeroCarousel movie={props.movie} visual={props.visual} companions={companions} paused={props.paused||!desktop} onPlayingChange={props.onPlayingChange} depth={depth&&!unavailable} onDepthUnavailable={fallback}/></div>
 </>;
 if(!depth||unavailable)return <HeroPlayer {...props}/>;
 return <>
  <div className="home-hero-mobile-player"><HeroPlayer {...props} mobileOnly paused={props.paused||desktop}/></div>
  <div className="home-hero-desktop-player"><HomeHeroDepthVideo paused={props.paused} onPlayingChange={props.onPlayingChange} onUnavailable={fallback}/></div>
 </>;
}

function HeroPlayer({visual, movie, paused, onPlayingChange,inlinePoster,mobileOnly=false}: PlaybackProps & {visual: HomeMediaView; movie: HomeMediaView;inlinePoster:string|null;mobileOnly?:boolean}) {
  const video = useRef<HTMLVideoElement>(null),frame=useRef<HTMLDivElement>(null),posterImage=useRef<HTMLImageElement>(null), attempt = useRef(0);
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
    const reducedMotion=matchMedia('(prefers-reduced-motion: reduce)');
    let visible=false,idle:number|undefined,disposed=false;
    const start = () => {
      if (disposed || !visible || !player || !desktop.matches || reducedMotion.matches || document.hidden || blocked.current || autoplayAttempted.current || !player.paused) return;
      const current = ++attempt.current;
      player.muted = true; setMuted(true);
      void player.play().catch(cause => {
        if (attempt.current !== current || cause instanceof DOMException && cause.name === 'AbortError') return;
        setStarted(false); onPlayingChange(false);
        if (!(cause instanceof DOMException && cause.name === 'NotAllowedError')) setError(true);
      });
    };
    // Let the poster and the initial interface paint before fetching the movie.
    // User-triggered playback remains immediate.
    const schedule=()=>{
      if(document.readyState!=='complete'||idle!==undefined)return;
      if(typeof window.requestIdleCallback==='function')idle=window.requestIdleCallback(()=>{idle=undefined;start();},{timeout:1200});
      else idle=window.setTimeout(()=>{idle=undefined;start();},80);
    };
    const resize = () => {
      if (!desktop.matches) {attempt.current++; player?.pause();}
      else schedule();
    };
    const observer=typeof IntersectionObserver==='undefined'?null:new IntersectionObserver(entries=>{
      visible=entries.some(entry=>entry.isIntersecting&&entry.intersectionRatio>.1);
      if(visible)schedule();else{attempt.current++;player?.pause();}
    },{threshold:.1});
    if(observer&&frame.current)observer.observe(frame.current);else{visible=true;schedule();}
    window.addEventListener('load',schedule);
    desktop.addEventListener('change', resize);
    document.addEventListener('visibilitychange', schedule);
    return () => {
      disposed=true;observer?.disconnect();window.removeEventListener('load',schedule);
      if(idle!==undefined){if(typeof window.cancelIdleCallback==='function')window.cancelIdleCallback(idle);else clearTimeout(idle);}
      desktop.removeEventListener('change', resize);
      document.removeEventListener('visibilitychange', schedule);
    };
  }, [paused, onPlayingChange]);

  useEffect(() => {
    const player = video.current;
    const pause = () => {attempt.current++; player?.pause(); onPlayingChange(false);};
    const visibility = () => {if (document.hidden) pause();};
    const otherPlayback = (event: Event) => {
      if(mobileOnly&&matchMedia('(min-width: 761px)').matches)return;
      if (event.target instanceof HTMLMediaElement && event.target !== player && !event.target.muted) pause();
    };
    document.addEventListener('visibilitychange', visibility);
    document.addEventListener('play', otherPlayback, true);
    return () => {
      document.removeEventListener('visibilitychange', visibility);
      document.removeEventListener('play', otherPlayback, true);
      pause();
    };
  }, [onPlayingChange,mobileOnly]);

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

  const cover=poster&&<HomeVisual imageRef={posterImage} media={visual.kind === 'image' ? visual : {...visual, kind: 'image', src: poster}}
    alt={custom ? visual.title ?? 'Vidéo immobilière' : 'Salon lumineux avec moulures et grandes fenêtres ouvertes sur la ville'} sizes={heroPosterSizes} loading="eager" fetchPriority="high"/>;
  return <>
    <div ref={frame} className="home-hero-video-frame">
    <HeroBacklight key={poster??movie.src} video={video} active={started&&!paused&&!error}
      posterImage={posterImage}/>
    <div className={`home-hero-demo${started ? ' is-started' : ''}`} style={{aspectRatio}}>
      <video ref={video} src={previewVideoUrl(movie.src,540)} poster={started&&poster ? imageWidthUrl(poster,640) : undefined} controls={started} muted={muted} playsInline loop
        preload={poster ? 'none' : 'metadata'} tabIndex={started ? 0 : -1} aria-hidden={!started}
        aria-label={movie.title ? `Vidéo de présentation : ${movie.title}` : 'Vidéo de présentation BienVu'}
        onLoadedMetadata={event => {const player = event.currentTarget; if (player.videoWidth && player.videoHeight) setAspectRatio(`${player.videoWidth} / ${player.videoHeight}`);}}
        onVolumeChange={event => setMuted(event.currentTarget.muted)}
        onPlay={() => {autoplayAttempted.current = true; setError(false); setStarted(true); onPlayingChange(true);}}
        onPause={() => onPlayingChange(false)} onEnded={() => onPlayingChange(false)}
        onError={() => {setError(true); setStarted(false); onPlayingChange(false);}}/>
      {!started && <button type="button" className="home-hero-demo-cover" onClick={() => void play()}
        aria-label={error ? 'Réessayer la lecture de la vidéo de présentation' : 'Lire la vidéo de présentation'}>
        {inlinePoster||mobileOnly?<picture>{mobileOnly&&<source media="(min-width: 761px)" srcSet={emptyHeroImage}/>} {inlinePoster&&<source media="(max-width: 760px)" type={inlinePoster.startsWith('data:image/avif;')?'image/avif':'image/webp'} srcSet={inlinePoster}/>} {cover}</picture>:cover}
        <span className="home-hero-demo-shade"/>
        <span className="home-duration">{homeClock(movie.duration ?? 28)}</span>
        {!custom && <span className="home-hero-demo-heading"><strong>Paris</strong><span>Un nouveau regard<br/>sur votre bien</span></span>}
        <span className="home-play" aria-hidden="true"><HomeIcon name="play" size={23}/></span>
        {!custom && <span className="home-hero-demo-facts"><span><HomeIcon name="house" size={18}/>65 m² · 3 pièces</span><strong>385 000 €</strong></span>}
      </button>}
    </div>
    </div>
    {error && <p className="home-hero-video-error" role="alert">La vidéo n’a pas pu être lue. Cliquez sur Lecture pour réessayer.</p>}
  </>;
}
