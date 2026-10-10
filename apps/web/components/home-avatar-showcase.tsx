'use client';

import Link from 'next/link';
import {useEffect,useRef,useState,type RefObject} from 'react';
import {HomeIcon} from './home-icons';
import {HomeVisual,useHomepageMedia,type HomeMediaView} from './homepage-media';
import {imageWidthUrl,previewVideoUrl} from '../lib/home-media-view';

const presentations=[{id:'circle',label:'Une présence discrète'},{id:'integrated',label:'Une présence intégrée'}] as const;
const benefits=[
  {icon:'user',title:'Des vidéos incarnées',text:'Des présentations naturelles et professionnelles.'},
  {icon:'house',title:'Le bien au premier plan',text:'Vos espaces restent au cœur de l’attention.'},
  {icon:'heart',title:'Un style qui vous ressemble',text:'Choisissez l’apparence qui reflète votre agence.'},
] as const;

function AvatarPreview({id,label,movie,visual,videoRef,onPlay}:{id:string;label:string;movie:HomeMediaView;visual:HomeMediaView;videoRef:RefObject<HTMLVideoElement|null>;onPlay():void}){
  const [started,setStarted]=useState(false),[loading,setLoading]=useState(false),[error,setError]=useState(false);
  const poster=visual.kind==='image'?visual.src:visual.poster??movie.poster;
  const custom=movie.custom||visual.custom;
  async function play(){
    const player=videoRef.current;if(!player)return;
    setError(false);setLoading(true);
    if(player.error)player.load();
    try{await player.play();player.focus({preventScroll:true});}
    catch(cause){if(!(cause instanceof DOMException&&cause.name==='AbortError'))setError(true);}
    finally{setLoading(false);}
  }
  return <figure className={`home-avatar-preview home-avatar-preview-${id}`}>
    <div className={`home-avatar-frame${started?' is-started':''}`}>
      <video ref={videoRef} src={previewVideoUrl(movie.src)} poster={started&&poster?imageWidthUrl(poster,640):undefined} width="540" height="960" controls={started} playsInline preload="none" tabIndex={started?0:-1} aria-label={`Démonstration d’avatar IA : ${label}`}
        onPlay={()=>{setStarted(true);setError(false);onPlay();}} onError={()=>{setLoading(false);setError(true);}}>
        {!movie.custom&&<track kind="captions" src="/videos/studio-home/avatar-demo.fr.vtt" srcLang="fr" label="Français"/>}
      </video>
      {!started&&<div className="home-avatar-poster"><HomeVisual media={visual} alt={custom?visual.title??label:`Appartement lumineux à Lyon avec un avatar IA ${id==='circle'?'en médaillon':'intégré au visuel'}`}/></div>}
      {!custom&&<div className="home-avatar-property" aria-hidden="true"><strong>Lyon 6e</strong><span>65 m² · 3 pièces</span></div>}
      {(!started||error)&&<button type="button" className="home-avatar-play" onClick={()=>void play()} disabled={loading} aria-label={`${error?'Réessayer':'Lire'} la démonstration : ${label}`}><HomeIcon name={loading?'refresh':'play'} size={28}/></button>}
      {!started&&<span className="home-avatar-preview-line" aria-hidden="true"/>}
      {loading&&<span className="home-avatar-loading" role="status">Chargement de la vidéo…</span>}
    </div>
    <figcaption>{label}</figcaption>
    {error&&<p className="home-avatar-error" role="alert">La vidéo n’a pas pu être lue. Réessayez avec le bouton Lecture.</p>}
  </figure>;
}

export function HomeAvatarShowcase({paused}:{paused:boolean}){
  const circle=useHomepageMedia('avatars.circle.video'),circleVisual=useHomepageMedia('avatars.circle.visual');
  const integrated=useHomepageMedia('avatars.integrated.video'),integratedVisual=useHomepageMedia('avatars.integrated.visual');
  const circleRef=useRef<HTMLVideoElement>(null),integratedRef=useRef<HTMLVideoElement>(null),section=useRef<HTMLElement>(null);
  function pause(){circleRef.current?.pause();integratedRef.current?.pause();}
  useEffect(()=>{if(paused)pause();},[paused]);
  useEffect(()=>{
    const hidden=()=>{if(document.hidden)pause();};
    const other=(event:Event)=>{if(event.target instanceof HTMLMediaElement&&!event.target.muted&&event.target!==circleRef.current&&event.target!==integratedRef.current)pause();};
    const observer=new IntersectionObserver(([entry])=>{if(!entry.isIntersecting)pause();});
    if(section.current)observer.observe(section.current);
    document.addEventListener('visibilitychange',hidden);document.addEventListener('play',other,true);
    return()=>{observer.disconnect();document.removeEventListener('visibilitychange',hidden);document.removeEventListener('play',other,true);pause();};
  },[]);
  function started(player:HTMLVideoElement|null){for(const media of document.querySelectorAll<HTMLMediaElement>('video,audio'))if(media!==player)media.pause();}
  return <section ref={section} className="home-avatars" aria-labelledby="home-avatars-title">
    <div className="home-avatars-main">
      <div className="home-avatars-copy">
        <span className="home-avatars-new"><HomeIcon name="sparkle" filled size={20}/>Nouveau · Avatars IA</span>
        <h2 id="home-avatars-title">Vos annonces <em>prennent la parole.</em></h2>
        <p>Un avatar IA présente vos biens.<br/>Vous choisissez le style, BienVu s’occupe du rendu.</p>
        <Link href="/avatar" className="home-avatars-action">Voir les avatars en action <HomeIcon name="arrow" size={22}/></Link>
        <p className="home-avatars-note">Sans vous filmer. À votre image.</p>
      </div>
      <div className="home-avatars-stage">
        <AvatarPreview key={circle.src+circleVisual.src} {...presentations[0]} movie={circle} visual={circleVisual} videoRef={circleRef} onPlay={()=>started(circleRef.current)}/>
        <AvatarPreview key={integrated.src+integratedVisual.src} {...presentations[1]} movie={integrated} visual={integratedVisual} videoRef={integratedRef} onPlay={()=>started(integratedRef.current)}/>
      </div>
    </div>
    <div className="home-avatars-benefits">{benefits.map(benefit=><article key={benefit.title}><span className="home-avatars-benefit-icon"><HomeIcon name={benefit.icon} size={30}/></span><div><h3>{benefit.title}</h3><p>{benefit.text}</p></div></article>)}</div>
  </section>;
}
