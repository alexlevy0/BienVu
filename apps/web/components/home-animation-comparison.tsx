'use client';
import {useEffect,useRef,useState,type CSSProperties,type KeyboardEvent,type PointerEvent} from 'react';
import {HomeIcon} from './home-icons';
import {HomeVisual,useHomepageMedia,type HomeMediaView} from './homepage-media';
import {previewVideoUrl} from '../lib/home-media-view';
import {synchronizeVideos,type VideoPairState} from '../lib/synchronized-videos';

const clock=(seconds:number)=>`${Math.floor(seconds/60)}:${String(Math.floor(seconds%60)).padStart(2,'0')}`;
type Props={paused:boolean;onCreate():void;onPlayingChange?(playing:boolean):void};
export function HomeAnimationComparison(props:Props){
  const classic=useHomepageMedia('comparison.classic.video'),ai=useHomepageMedia('comparison.ai.video');
  return <ComparisonPlayer key={classic.src+'|'+ai.src} classic={classic} ai={ai} {...props}/>;
}
function ComparisonPlayer({classic,ai,paused,onCreate,onPlayingChange}:Props&{classic:HomeMediaView;ai:HomeMediaView}){
  const first=useRef<HTMLVideoElement>(null),second=useRef<HTMLVideoElement>(null),stage=useRef<HTMLDivElement>(null),frame=useRef<HTMLDivElement>(null);
  const pair=useRef<ReturnType<typeof synchronizeVideos>|null>(null),sourceLoaded=useRef(false);
  const initialTime=!classic.custom&&!ai.custom?4.4:0;
  const [split,setSplit]=useState(50),[muted,setMuted]=useState(true),[shown,setShown]=useState(false),[fullscreen,setFullscreen]=useState(false);
  const [state,setState]=useState<VideoPairState>({requested:false,playing:false,loading:false,ready:false,error:false,time:initialTime,duration:Math.min(classic.duration??40,ai.duration??40)});
  useEffect(()=>{
    const left=first.current!,right=second.current!;
    pair.current=synchronizeVideos(left,right,next=>{setState(next);if(next.ready)setShown(true);},initialTime,Math.min(classic.duration??40,ai.duration??40));
    const visibility=()=>{if(document.hidden)pair.current?.pause();};
    const other=(event:Event)=>{if(event.target instanceof HTMLMediaElement&&event.target!==left&&event.target!==right&&!event.target.muted)pair.current?.pause();};
    const full=()=>setFullscreen(document.fullscreenElement===frame.current);
    const observer=typeof IntersectionObserver==='undefined'?null:new IntersectionObserver(entries=>{if(!entries.some(e=>e.isIntersecting))pair.current?.pause();});
    if(stage.current)observer?.observe(stage.current);
    document.addEventListener('visibilitychange',visibility);document.addEventListener('play',other,true);document.addEventListener('fullscreenchange',full);
    return()=>{observer?.disconnect();pair.current?.destroy();pair.current=null;document.removeEventListener('visibilitychange',visibility);document.removeEventListener('play',other,true);document.removeEventListener('fullscreenchange',full);};
  },[classic.duration,ai.duration,initialTime]);
  useEffect(()=>{if(paused)pair.current?.pause();},[paused]);
  useEffect(()=>{onPlayingChange?.(state.playing);return()=>onPlayingChange?.(false);},[state.playing,onPlayingChange]);
  const play=()=>{
    if(paused)return;
    if(!sourceLoaded.current){sourceLoaded.current=true;for(const [player,media] of [[first.current!,classic],[second.current!,ai]] as const){player.preload='auto';player.src=previewVideoUrl(media.src);player.load();}}
    else if(state.error){first.current?.load();second.current?.load();pair.current?.seek(state.time);}
    pair.current?.play();
  };
  const position=(event:PointerEvent<HTMLElement>)=>{const box=stage.current?.getBoundingClientRect();if(box)setSplit(Math.max(0,Math.min(100,(event.clientX-box.left)/box.width*100)));};
  const keyboard=(event:KeyboardEvent<HTMLElement>)=>{
    const step=event.shiftKey?10:2;
    const next=event.key==='Home'?0:event.key==='End'?100:event.key==='PageUp'?split+10:event.key==='PageDown'?split-10:
      ['ArrowRight','ArrowUp'].includes(event.key)?split+step:['ArrowLeft','ArrowDown'].includes(event.key)?split-step:null;
    if(next!==null){event.preventDefault();setSplit(Math.max(0,Math.min(100,next)));}
  };
  const expand=async()=>{try{if(document.fullscreenElement)await document.exitFullscreen();else await frame.current?.requestFullscreen?.();}catch{/* Playback stays usable when fullscreen is unavailable. */}};
  const poster=(media:HomeMediaView):HomeMediaView=>({...media,kind:'image',src:media.poster??'/images/studio-home/comparison-classic.webp'});
  const sourceVideo=(ref:typeof first,label:string)=><video ref={ref} muted={ref===second||muted} playsInline preload="none" tabIndex={-1} aria-label={label} className={shown&&!state.error?'is-shown':undefined}/>;
  return <section className="home-animation-comparison" data-home-motion="comparison" aria-labelledby="home-comparison-title">
    <header className="home-comparison-heading"><p>ANIMATIONS IA</p><h2 id="home-comparison-title">La différence ? <em>Le mouvement.</em></h2><p>Le même bien, avec et sans animations IA.</p></header>
    <div ref={frame} className="home-comparison-frame">
      <div ref={stage} className="home-comparison-stage" role="group" aria-label="Comparer les deux vidéos du même bien" aria-busy={state.loading} style={{'--comparison-split':`${split}%`} as CSSProperties}>
        <div className="home-comparison-layer is-classic"><HomeVisual media={poster(classic)} alt="Le bien dans la version sans animation IA" sizes="(max-width: 900px) 90vw, (max-width: 1500px) calc(100vw - 330px), 1200px"/>{sourceVideo(first,'Version sans animation IA')}</div>
        <div className="home-comparison-layer is-ai"><HomeVisual media={poster(ai)} alt="Le même bien dans la version avec animation IA" sizes="(max-width: 900px) 90vw, (max-width: 1500px) calc(100vw - 330px), 1200px"/>{sourceVideo(second,'Version avec animation IA')}</div>
        <span className={`home-comparison-label is-classic${split<18?' is-hidden':''}`}>Sans animation IA</span>
        <span className={`home-comparison-label is-ai${split>82?' is-hidden':''}`}><HomeIcon name="sparkle" size={16} filled/>Avec animation IA</span>
        <div className="home-comparison-divider" role="slider" tabIndex={0} aria-label="Part de la version sans animation IA" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(split)} aria-valuetext={`${Math.round(split)} % sans IA, ${Math.round(100-split)} % avec IA`} aria-orientation="horizontal"
          onKeyDown={keyboard} onPointerDown={event=>{event.preventDefault();event.currentTarget.focus({preventScroll:true});event.currentTarget.setPointerCapture(event.pointerId);position(event);}}
          onPointerMove={event=>{if(event.currentTarget.hasPointerCapture(event.pointerId))position(event);}} onPointerUp={event=>{if(event.currentTarget.hasPointerCapture(event.pointerId))event.currentTarget.releasePointerCapture(event.pointerId);}}>
          <span className="home-comparison-handle" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="m8 5-7 7 7 7m8-14 7 7-7 7"/></svg></span>
        </div>
        {state.loading&&<div className="home-comparison-loading" role="status"><span/>Chargement des deux vidéos…</div>}
        {state.error&&<div className="home-comparison-error" role="alert"><p>La comparaison n’a pas pu être lue.</p><button type="button" onClick={play}>Réessayer <HomeIcon name="refresh" size={17}/></button></div>}
        <div className="home-comparison-controls">
          <button type="button" className="home-comparison-play" disabled={paused} aria-label={state.requested?'Mettre la comparaison en pause':'Lire la comparaison'} onClick={()=>state.requested?pair.current?.pause():play()}><HomeIcon name={state.requested?'pause':'play'} size={24} filled={!state.requested}/></button>
          <input type="range" className="home-comparison-seek" min="0" max={state.duration||40} step=".05" value={state.time} disabled={!sourceLoaded.current||state.error} aria-label="Position de lecture des deux vidéos" aria-valuetext={`${clock(state.time)} sur ${clock(state.duration)}`} onChange={event=>pair.current?.seek(Number(event.target.value))}/>
          <span className="home-comparison-time">{clock(state.time)} / {clock(state.duration)}</span>
          <button type="button" aria-label={muted?'Activer le son de la comparaison':'Couper le son de la comparaison'} aria-pressed={!muted} onClick={()=>{setMuted(!muted);if(first.current)first.current.muted=!muted;}}><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M11 4 6 8H2v8h4l5 4V4Z"/>{muted?<path d="m16 9 6 6m0-6-6 6"/>:<><path d="M15 8a6 6 0 0 1 0 8m3-11a10 10 0 0 1 0 14"/></>}</svg></button>
          <button type="button" aria-label={fullscreen?'Quitter le plein écran':'Afficher la comparaison en plein écran'} onClick={()=>void expand()}><HomeIcon name="fullscreen" size={20}/></button>
        </div>
      </div>
    </div>
    <p className="home-comparison-hint">Glissez pour comparer <span>·</span> Lecture synchronisée</p>
    <button type="button" className="home-comparison-create" onClick={onCreate}>Créer ma vidéo avec l’IA <HomeIcon name="arrow" size={20}/></button>
  </section>;
}
