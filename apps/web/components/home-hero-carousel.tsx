'use client';

import {useCallback,useEffect,useRef,useState,type CSSProperties,type KeyboardEvent,type RefObject} from 'react';
import {useReducedMotion} from 'motion/react';
import {CreationMotion,m,useCreationMotionReady} from './creation-motion';
import {HomeHeroDepthVideo,SoundIcon} from './home-hero-depth-video';
import {HomeIcon} from './home-icons';
import {HeroBacklight} from './hero-backlight';
import {VideoBacklight} from './video-backlight';
import {homeClock,type HomeMediaView} from './homepage-media';
import {emptyHeroImage} from '../lib/home-hero-depth';
import {homeHeroDepth} from '../lib/home-hero-depth-assets';
import {imageWidthUrl,previewVideoUrl} from '../lib/home-media-view';
import {heroCardPosition} from '../lib/hero-carousel';

type Props={movie:HomeMediaView;visual:HomeMediaView;companions:[HomeMediaView,HomeMediaView];paused:boolean;depth:boolean;onDepthUnavailable():void;onPlayingChange(playing:boolean):void};

export function HomeHeroCarousel(props:Props){return <CreationMotion><Carousel {...props}/></CreationMotion>;}

function Carousel({movie,visual,companions,paused,depth,onDepthUnavailable,onPlayingChange}:Props){
 const [selected,setSelected]=useState(1),[visited,setVisited]=useState(false),[unfolded,setUnfolded]=useState(false),reduced=useReducedMotion(),ready=useCreationMotionReady();
 const pagination=useRef<HTMLDivElement>(null),keyboardSelection=useRef(false);
 const leftPoster=useRef<HTMLImageElement>(null),centerPoster=useRef<HTMLImageElement>(null),rightPoster=useRef<HTMLImageElement>(null),posters=[leftPoster,centerPoster,rightPoster];
 const cards=[companions[0],movie,companions[1]],label=(item:HomeMediaView)=>item.locality??item.title??'Vidéo immobilière';
 const choose=(index:number)=>{if(index===selected)return;setUnfolded(true);setVisited(true);onPlayingChange(false);setSelected(index);};
 useEffect(()=>{
  if(!ready||unfolded)return;
  const desktop=matchMedia('(min-width:761px)');let cancelled=false,delay:number|undefined,deadline:number|undefined;
  const open=()=>{if(!cancelled&&desktop.matches)setUnfolded(true);};
  const start=()=>{
   if(!desktop.matches)return;
   if(reduced||matchMedia('(prefers-reduced-motion:reduce)').matches){open();return;}
   // Wait for the two covers to decode before opening the fan. A missing image
   // cannot leave navigation trapped in the collapsed state.
   deadline=window.setTimeout(open,1600);
   void Promise.all([leftPoster,rightPoster].map(ref=>ref.current?.decode().catch(()=>{}))).then(()=>{if(!cancelled)delay=window.setTimeout(open,360);});
  };
  start();desktop.addEventListener('change',start);
  return()=>{cancelled=true;clearTimeout(delay);clearTimeout(deadline);desktop.removeEventListener('change',start);};
 },[ready,unfolded,reduced]);
 useEffect(()=>{if(keyboardSelection.current){keyboardSelection.current=false;pagination.current?.querySelectorAll('button')[selected]?.focus({preventScroll:true});}},[selected]);
 const keyboard=(event:KeyboardEvent<HTMLDivElement>)=>{
  if(!(event.target instanceof HTMLElement)||!event.target.closest('[data-hero-choose]'))return;
  if(event.key==='ArrowRight'||event.key==='ArrowLeft'){event.preventDefault();keyboardSelection.current=true;choose((selected+(event.key==='ArrowRight'?1:2))%3);}
 };
 return <div className="home-hero-carousel" data-unfolded={unfolded} role="region" aria-roledescription="carrousel" aria-label="Exemples de vidéos immobilières" onKeyDown={keyboard}>
  <div className="home-hero-carousel-stage">
   {cards.map((item,index)=>{
    const position=heroCardPosition(index,selected),active=position===0;
    const target={x:`${unfolded?position*57:0}%`,y:active||!unfolded?'0%':'5%',scale:active?1:unfolded?.83:.97,rotate:unfolded?position*8:0,rotateY:unfolded?-position*12:0};
    const poster=index===1&&depth?homeHeroDepth.backgroundPoster:index===1?(visual.kind==='image'?visual.src:visual.poster??item.poster):item.poster;
    return <m.div key={index} className="home-hero-carousel-card" data-position={position} role="group" aria-roledescription="diapositive" aria-label={`${index+1} sur 3 · ${label(item)}`}
     initial={false} animate={target} style={{zIndex:active?3:1}} transition={{duration:reduced?0:visited?.72:1.05,delay:reduced||visited||index!==2?0:.06,ease:[.22,1,.36,1]}}>
     <VideoBacklight posterImage={posters[index]} active={false} className="home-hero-carousel-static-halo"/>
     <picture className="home-hero-carousel-poster"><source media="(min-width:761px)" srcSet={poster?imageWidthUrl(poster,640):emptyHeroImage}/><img ref={posters[index]} src={emptyHeroImage} alt="" width="540" height="960" decoding="async"/></picture>
     <div className="home-hero-carousel-content" inert={!active} aria-hidden={!active}>
      {index===1&&depth?<HomeHeroDepthVideo paused={paused||!active} onPlayingChange={onPlayingChange} onUnavailable={onDepthUnavailable}/>:
       <CarouselMovie key={item.src} movie={item} poster={poster} posterImage={posters[index]!} active={active&&!paused} selectedByUser={visited} onPlayingChange={onPlayingChange}/>}
     </div>
     {!active&&<button type="button" data-hero-choose className="home-hero-carousel-select" onClick={event=>{keyboardSelection.current=event.detail===0;choose(index);}} aria-label={`Afficher la vidéo au premier plan : ${label(item)}`}>
      <span className="home-hero-carousel-location">{label(item)}<small>{homeClock(item.duration??20)} · Voir la vidéo</small></span>
      <span className="home-hero-carousel-play" aria-hidden="true"><HomeIcon name="play" filled size={19}/></span>
     </button>}
    </m.div>;
   })}
  </div>
  <div className="home-hero-carousel-pagination" ref={pagination} aria-label="Choisir une vidéo">{cards.map((item,index)=><button type="button" data-hero-choose key={index} aria-label={`Afficher ${label(item)}`} aria-pressed={index===selected} onClick={()=>choose(index)}><span/></button>)}</div>
  <p className="home-hero-carousel-hint">Cliquez sur un bien pour découvrir sa vidéo.</p>
  <span className="sr-only" aria-live="polite" aria-atomic="true">Vidéo {selected+1} sur 3 : {label(cards[selected]!)}</span>
 </div>;
}

/** Side movies do not receive a source until selected on desktop. */
function CarouselMovie({movie,poster,posterImage,active,selectedByUser,onPlayingChange}:{movie:HomeMediaView;poster:string|null;posterImage:RefObject<HTMLImageElement|null>;active:boolean;selectedByUser:boolean;onPlayingChange(playing:boolean):void}){
 const root=useRef<HTMLDivElement>(null),video=useRef<HTMLVideoElement>(null),loaded=useRef(false),blocked=useRef(!active),attempt=useRef(0);
 const [shown,setShown]=useState(false),[playing,setPlaying]=useState(false),[loading,setLoading]=useState(false),[error,setError]=useState(false),[muted,setMuted]=useState(true),[time,setTime]=useState(0),[duration,setDuration]=useState(movie.duration??20),[fullscreen,setFullscreen]=useState(false);
 useEffect(()=>setFullscreen(Boolean(document.fullscreenEnabled)),[]);
 blocked.current=!active;
 const play=useCallback(async()=>{
  const player=video.current;if(!player||blocked.current||!matchMedia('(min-width:761px)').matches)return;
  const current=++attempt.current;
  if(!loaded.current){loaded.current=true;player.src=previewVideoUrl(movie.src,540);player.load();}
  else if(player.error)player.load();
  setError(false);setLoading(true);
  try{await player.play();}catch(cause){if(attempt.current===current&&!(cause instanceof DOMException&&cause.name==='AbortError')){setLoading(false);setError(true);}}
 },[movie.src]);
 useEffect(()=>{
  const player=video.current!;
  if(!active){attempt.current++;player.pause();player.muted=true;setMuted(true);setLoading(false);return;}
  const pause=()=>{attempt.current++;player.pause();setLoading(false);};
  const visibility=()=>{if(document.hidden)pause();};
  const other=(event:Event)=>{if(event.target instanceof HTMLMediaElement&&event.target!==player&&!event.target.muted)pause();};
  let idle:number|undefined;
  const start=()=>{
   if(document.hidden)return;
   const automatic=matchMedia('(hover:hover) and (pointer:fine) and (prefers-reduced-motion:no-preference)').matches&&!(navigator as Navigator&{connection?:{saveData?:boolean}}).connection?.saveData;
   if(selectedByUser||automatic)void play();
  };
  const observer=new IntersectionObserver(([entry])=>{if(entry.isIntersecting){if(idle===undefined){idle=window.setTimeout(start,selectedByUser?0:150);}}else pause();},{threshold:.15});
  if(root.current)observer.observe(root.current);
  document.addEventListener('visibilitychange',visibility);document.addEventListener('play',other,true);
  return()=>{if(idle!==undefined)clearTimeout(idle);observer.disconnect();pause();document.removeEventListener('visibilitychange',visibility);document.removeEventListener('play',other,true);};
 },[active,selectedByUser,play]);
 useEffect(()=>{onPlayingChange(active&&playing);return()=>onPlayingChange(false);},[active,playing,onPlayingChange]);
 useEffect(()=>{const player=video.current;return()=>{loaded.current=false;player?.pause();player?.removeAttribute('src');player?.load();};},[]);
 const toggle=()=>{if(playing||loading){attempt.current++;video.current?.pause();setLoading(false);}else void play();};
 const keyboard=(event:KeyboardEvent<HTMLDivElement>)=>{if(event.target!==event.currentTarget)return;if(event.key===' '||event.key==='k'){event.preventDefault();toggle();}else if(event.key==='m'&&video.current)video.current.muted=!video.current.muted;};
 return <div className="home-hero-carousel-movie-frame"><HeroBacklight video={video} active={active&&playing} posterImage={posterImage}/><div className={`home-hero-carousel-movie home-hero-depth-stage${shown?' has-played':''}`} ref={root} role="group" aria-label={`Vidéo : ${movie.title??movie.locality??'Bien immobilier'}`} tabIndex={active?0:-1} onKeyDown={keyboard}>
  <picture><source media="(min-width:761px)" srcSet={poster?imageWidthUrl(poster,640):emptyHeroImage}/><img src={emptyHeroImage} alt="" width="540" height="960" decoding="async"/></picture>
  <video ref={video} muted playsInline loop preload="none" aria-hidden="true" tabIndex={-1}
   onLoadedMetadata={e=>{if(Number.isFinite(e.currentTarget.duration))setDuration(e.currentTarget.duration);}}
   onTimeUpdate={e=>setTime(e.currentTarget.currentTime)} onPlaying={()=>{setShown(true);setPlaying(true);setLoading(false);setError(false);}}
   onPause={()=>{setPlaying(false);setLoading(false);}} onWaiting={()=>{if(!blocked.current)setLoading(true);}} onError={()=>{setPlaying(false);setLoading(false);setError(true);}}
   onVolumeChange={e=>setMuted(e.currentTarget.muted)}/>
  {!shown&&active&&<button className="home-hero-depth-cover" type="button" aria-label="Lire la vidéo" onClick={()=>void play()}><span><HomeIcon name="play" filled size={24}/></span></button>}
  {loading&&active&&<div className="home-hero-depth-loading" role="status"><span/>Chargement…</div>}
  {error&&active&&<button className="home-hero-depth-retry" type="button" onClick={()=>void play()}>Réessayer <HomeIcon name="play" size={14}/></button>}
  <div className="home-hero-depth-controls"><div className="home-hero-depth-toolbar">
   <button type="button" aria-label={playing||loading?'Mettre la vidéo en pause':'Lire la vidéo'} onClick={toggle}><HomeIcon name={playing||loading?'pause':'play'} filled={!playing&&!loading} size={19}/></button>
   <span className="home-hero-depth-time">{homeClock(time)} / {homeClock(duration)}</span>
   <button type="button" className="home-hero-depth-sound" aria-label={muted?'Activer le son':'Couper le son'} aria-pressed={!muted} onClick={()=>{if(video.current)video.current.muted=!video.current.muted;}}><SoundIcon muted={muted}/></button>
   {fullscreen&&<button type="button" aria-label="Afficher la vidéo en plein écran" onClick={()=>void video.current?.requestFullscreen().catch(()=>{})}><HomeIcon name="fullscreen" size={17}/></button>}
  </div><input type="range" aria-label="Position dans la vidéo" min="0" max={duration} step="0.1" value={time} onChange={e=>{if(video.current&&loaded.current){const next=Number(e.target.value);video.current.currentTime=next;setTime(next);}}} style={{'--hero-progress':`${time/duration*100}%`} as CSSProperties}/></div>
 </div></div>;
}
