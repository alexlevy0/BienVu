'use client';

import Link from 'next/link';
import {useEffect,useRef,useState} from 'react';
import type {ShowcasePublicProperty} from '@bienvu/contracts';
import {HomeIcon} from './home-icons';

const availability={under_offer:'Sous compromis',sold:'Vendu',rented:'Loué'};
const favouritesEvent='bienvu:showcase-favourites';
function savedFavourites(key:string):string[]{
  try{const value:unknown=JSON.parse(localStorage.getItem(key)??'[]');return Array.isArray(value)?value.filter((id):id is string=>typeof id==='string'&&/^[a-zA-Z0-9-]{1,80}$/.test(id)).slice(-500):[];}catch{return [];}
}
function durationLabel(seconds:number){return `${Math.floor(seconds/60)}:${String(Math.floor(seconds%60)).padStart(2,'0')}`;}

type GalleryProperty=Pick<ShowcasePublicProperty,'id'|'url'|'status'|'featured'|'cover'|'video'>&{fields:Pick<ShowcasePublicProperty['fields'],'title'|'locality'|'transaction'|'area'|'rooms'>;price:string};
export function ShowcaseGalleryCard({property:p,slug}:{property:GalleryProperty;slug:string}){
  const[favourite,setFavourite]=useState(false),[message,setMessage]=useState(''),[playing,setPlaying]=useState(false),[buffering,setBuffering]=useState(false),[videoError,setVideoError]=useState(''),[videoRatio,setVideoRatio]=useState<string|null>(null);
  const root=useRef<HTMLElement>(null),video=useRef<HTMLVideoElement>(null),playButton=useRef<HTMLButtonElement>(null),storageKey=`bienvu:showcase-favourites:${slug}`;
  useEffect(()=>{
    const sync=()=>setFavourite(savedFavourites(storageKey).includes(p.id));sync();
    const storage=(event:StorageEvent)=>{if(event.key===storageKey)sync();};
    window.addEventListener(favouritesEvent,sync);window.addEventListener('storage',storage);
    return()=>{window.removeEventListener(favouritesEvent,sync);window.removeEventListener('storage',storage);};
  },[p.id,storageKey]);
  useEffect(()=>{
    setVideoRatio(null);setPlaying(false);
    const player=video.current;if(!player)return;
    const observer=new IntersectionObserver(entries=>{if(!entries.some(entry=>entry.isIntersecting))player.pause();});
    if(root.current)observer.observe(root.current);
    return()=>{observer.disconnect();player.pause();player.removeAttribute('src');player.load();};
  },[p.video?.url]);
  function toggleFavourite(){
    const next=!favourite;setFavourite(next);
    try{const ids=savedFavourites(storageKey).filter(id=>id!==p.id);if(next)ids.push(p.id);localStorage.setItem(storageKey,JSON.stringify(ids.slice(-500)));window.dispatchEvent(new Event(favouritesEvent));setMessage(next?'Bien enregistré dans vos favoris sur cet appareil.':'Bien retiré de vos favoris.');}
    catch{setMessage(next?'Bien ajouté aux favoris pour cette visite.':'Bien retiré de vos favoris.');}
  }
  function startVideo(){
    const player=video.current;if(!player||!p.video)return;
    setVideoError('');setPlaying(true);setBuffering(true);
    if(!player.getAttribute('src'))player.src=p.video.url;
    for(const other of document.querySelectorAll<HTMLVideoElement>('video[data-showcase-player]'))if(other!==player)other.pause();
    void player.play().catch(()=>{setBuffering(false);});
  }
  function closeVideo(){video.current?.pause();setPlaying(false);setBuffering(false);playButton.current?.focus();}
  return <article ref={root} className={`showcase-property-card${playing?' is-playing':''}`} style={playing&&p.video?{aspectRatio:videoRatio??p.video.aspectRatio.replace(':',' / ')}:undefined}>
    <Link className="showcase-card-link" href={p.url} prefetch={false}>
      <div className="showcase-card-media">{p.cover?<img src={p.cover.url} alt={`Vue de ${p.fields.title}`} width={p.cover.width} height={p.cover.height} loading="lazy" decoding="async"/>:<div className="showcase-card-placeholder"><HomeIcon name="house" size={54}/><span>{p.fields.title}</span></div>}</div>
      <div className="showcase-card-copy"><h3 className="sr-only">{p.fields.title}</h3><p className="showcase-card-locality"><HomeIcon name="location" size={18}/>{p.fields.locality||p.fields.title}</p><strong>{p.price||'Prix sur demande'}</strong><p className="showcase-card-facts">{[p.fields.area?`${p.fields.area.toLocaleString('fr-FR')} m²`:null,p.fields.rooms?`${p.fields.rooms} pièce${p.fields.rooms>1?'s':''}`:null].filter(Boolean).join(' · ')||'Découvrir le bien'}<span className="showcase-card-transaction">{p.fields.transaction==='rent'?'À louer':'À vendre'}</span></p></div>
    </Link>
    <div className="showcase-card-badges">{p.video&&<span className="showcase-duration"><HomeIcon name="play" size={12} filled/>{durationLabel(p.video.durationSeconds)}</span>}{p.status!=='available'&&<span className="showcase-availability">{availability[p.status]}</span>}{p.featured&&<span className="showcase-featured-badge">À la une</span>}</div>
    <button type="button" className={`showcase-favourite${favourite?' is-saved':''}`} aria-pressed={favourite} aria-label={`${favourite?'Retirer':'Ajouter'} ${p.fields.title} ${favourite?'des':'aux'} favoris`} title="Favoris sur cet appareil" onClick={toggleFavourite}><HomeIcon name="heart" size={25} filled={favourite}/></button>
    {p.video&&<><button ref={playButton} type="button" className="showcase-play" aria-label={`Lire la vidéo de ${p.fields.title}`} onClick={startVideo}><HomeIcon name="play" size={26} filled/></button><video ref={video} className="showcase-card-video" data-showcase-player hidden={!playing} controls playsInline preload="none" aria-label={`Vidéo de ${p.fields.title}`} onLoadedMetadata={event=>{const player=event.currentTarget;if(player.videoWidth>0&&player.videoHeight>0)setVideoRatio(`${player.videoWidth} / ${player.videoHeight}`);}} onPlaying={()=>setBuffering(false)} onWaiting={()=>setBuffering(true)} onPause={()=>setBuffering(false)} onEnded={()=>setBuffering(false)} onError={()=>{setVideoError('La vidéo est momentanément indisponible. Vous pouvez consulter la fiche du bien.');setPlaying(false);setBuffering(false);}}/>{playing&&<><button className="showcase-video-close" type="button" aria-label="Fermer la vidéo" onClick={closeVideo}><HomeIcon name="close" size={18}/></button><Link href={p.url} className="showcase-video-detail" prefetch={false}>Voir le bien <HomeIcon name="arrow" size={15}/></Link>{buffering&&<span className="showcase-video-loading" role="status"><span/>Chargement de la vidéo…</span>}</>}</>}
    {videoError&&<p className="showcase-card-error" role="alert">{videoError}</p>}<span className="sr-only" role="status">{message}</span>
  </article>;
}
