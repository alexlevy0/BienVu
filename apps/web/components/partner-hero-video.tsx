'use client';
import {useRef,useState} from 'react';
import {HomeIcon} from './home-icons';
export function PartnerHeroVideo() {
  const [started,setStarted]=useState(false),[failure,setFailure]=useState(false),video=useRef<HTMLVideoElement>(null);
  const start=()=>{setStarted(true);setFailure(false);};
  return <div className="partner-hero-video">
    {started?<video ref={video} src="/videos/studio-home/paris.mp4" poster="/images/studio-home/paris-640.webp" controls playsInline autoPlay muted
      onError={()=>setFailure(true)} aria-label="Exemple de vidéo immobilière BienVu"/>:
      <><img src="/images/studio-home/paris-640.webp" width="640" height="853" alt=""/>
        <div className="partner-video-heading"><strong>Appartement familial</strong><span>Paris</span></div>
        <button type="button" onClick={start} className="partner-video-play" aria-label="Lire l’exemple de vidéo BienVu"><HomeIcon name="play" size={26} filled/></button>
        <div className="partner-video-facts"><span><HomeIcon name="pin" size={14}/> Paris</span><span><HomeIcon name="video" size={14}/> Votre vidéo BienVu</span></div></>}
    {failure&&<p role="alert" className="partner-video-error">La lecture est indisponible. <button type="button" onClick={()=>setStarted(false)}>Réessayer</button></p>}
  </div>;
}
