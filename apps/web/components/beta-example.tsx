'use client';
import {useEffect,useRef,useState} from 'react';
import {HomeIcon} from './home-icons';
import {useHomepageMedia} from './homepage-media';
import {imageWidthUrl,previewVideoUrl} from '../lib/home-media-view';
import {trackProductEvent} from '../lib/product-analytics';
import {homeRenderPresets,homeRenderExampleCredits,type HomeRenderPreset} from '../lib/home-render-presets';

/** Prepared public examples only: opening or switching never generates a video. */
export function BetaExample({initial='standard',onClose,onCreate}:{initial?:HomeRenderPreset;onClose():void;onCreate(preset:HomeRenderPreset):void}){
  const modal=useRef<HTMLDialogElement>(null),video=useRef<HTMLVideoElement>(null);
  const [choice,setChoice]=useState(initial),[error,setError]=useState(false);
  const media={standard:useHomepageMedia('renders.standard.video'),avatar:useHomepageMedia('renders.avatar.video'),'avatar-ai':useHomepageMedia('renders.avatar-ai.video')};
  const selected=media[choice],credits=homeRenderExampleCredits(choice);
  useEffect(()=>{
    const trigger=document.activeElement instanceof HTMLElement?document.activeElement:null,dialog=modal.current;
    dialog?.showModal();const previous=document.body.style.overflow;document.body.style.overflow='hidden';
    return()=>{dialog?.close();document.body.style.overflow=previous;trigger?.focus({preventScroll:true});};
  },[]);
  useEffect(()=>{
    const player=video.current;setError(false);
    const hide=()=>{if(document.hidden)player?.pause();};document.addEventListener('visibilitychange',hide);
    return()=>{player?.pause();document.removeEventListener('visibilitychange',hide);};
  },[choice]);
  function select(preset:HomeRenderPreset){setChoice(preset);trackProductEvent('beta_render_selected',{render_preset:preset,source_kind:'demo',credit_cost:homeRenderExampleCredits(preset)});}
  return <dialog ref={modal} className="beta-example" aria-labelledby="beta-example-title" onCancel={onClose} onClick={event=>{if(event.target===event.currentTarget)onClose();}}>
    <div className="beta-example-header"><div><span className="beta-eyebrow">UNE ANNONCE. TROIS POSSIBILITÉS.</span><h2 id="beta-example-title">Regardez. Puis choisissez.</h2></div><button className="beta-icon-button" type="button" aria-label="Fermer l’exemple" onClick={onClose}><HomeIcon name="close"/></button></div>
    <div className="beta-example-body"><div className="beta-example-visual">
      <video key={selected.src} ref={video} src={previewVideoUrl(selected.src,540)} poster={imageWidthUrl(selected.poster??`/images/studio-home/renders-${choice}.webp`,640)} playsInline controls preload="none" aria-label={`Exemple préparé : ${homeRenderPresets.find(p=>p.id===choice)!.title}`} onPlay={()=>trackProductEvent('video_played',{source_kind:'demo',render_preset:choice})} onError={()=>setError(true)}/>
    </div><div className="beta-example-copy">
      <p className="beta-example-context">Même bien · 4 photos · 20 secondes · 9:16</p>
      <div className="beta-example-choices" role="group" aria-label="Choisir le rendu de démonstration">{homeRenderPresets.map(preset=><button key={preset.id} type="button" aria-pressed={choice===preset.id} onClick={()=>select(preset.id)}><span>{preset.title}<small>{preset.id==='standard'?'Le rendu de votre essai offert':preset.id==='avatar'?'Présentateur sur toute la vidéo':'Présentateur et 4 photos animées'}</small></span><strong>{homeRenderExampleCredits(preset.id)} crédit{preset.id==='standard'?'':'s'}</strong></button>)}</div>
      <p className="beta-example-access"><HomeIcon name={choice==='standard'?'check':'lock'} size={16}/>{choice==='standard'?'Essai classique offert, sans compte.':'Option payante · connexion nécessaire pour créer ce rendu.'}</p>
      <div className="beta-example-total"><strong>{credits}</strong><span>crédit{credits>1?'s':''}<small>1 création{choice!=='standard'?' + 2 avatar':''}{choice==='avatar-ai'?' + 4 animations':''}</small></span></div>
      {error&&<p role="alert">La vidéo n’a pas pu être chargée. <button type="button" className="beta-text-button" onClick={()=>{video.current?.load();setError(false);}}>Réessayer</button></p>}
      <button type="button" className="beta-button" onClick={()=>onCreate(choice)}>Essayer avec mon annonce <HomeIcon name="arrow" size={18}/></button>
      <p className="beta-example-selection-note">Ce rendu sera repris dans votre création. Vous pourrez encore le personnaliser.</p>
    </div></div><p className="beta-example-note"><HomeIcon name="lock" size={14}/>Vidéos déjà préparées. Cette démonstration ne consomme aucun crédit.</p>
  </dialog>;
}
