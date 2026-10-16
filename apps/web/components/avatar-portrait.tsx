'use client';
import '../app/avatars.css';
import {useEffect,useRef,useState,type RefObject} from 'react';
import type {AvatarLook} from '@bienvu/contracts';
import {HomeIcon} from './home-icons';

// Portraits load near the visible strip, not several screens ahead. Videos are
// mounted only after deliberate interest; leaving also cancels a pending hover.
export function AvatarPortrait({look,playing,root,onUnavailable,priority=false}:{look:Pick<AvatarLook,'id'|'name'|'thumbnail'|'preview'>;playing?:boolean;root?:RefObject<HTMLDivElement|null>;onUnavailable?():void;priority?:boolean}){
  const frame=useRef<HTMLSpanElement>(null),video=useRef<HTMLVideoElement>(null);
  // Bypass browser-cached 320px demos when switching to the original source.
  const preview=look.preview?`${look.preview}${look.preview.includes('?')?'&':'?'}quality=original`:null;
  const [visible,setVisible]=useState(priority),[ready,setReady]=useState(priority),[failed,setFailed]=useState(false),[videoReady,setVideoReady]=useState(false);
  useEffect(()=>{const node=frame.current;if(!node)return;
    const observer=new IntersectionObserver(entries=>{if(entries.some(e=>e.isIntersecting)){setVisible(true);observer.disconnect();}},
      {root:root?.current??null,rootMargin:'160px'});observer.observe(node);return()=>observer.disconnect();
  },[root]);
  useEffect(()=>{if(!playing)return;const node=video.current;if(!node)return;
    node.muted=true;node.src=preview!;void node.play().catch(()=>{/* The explicit play button stays available. */});
    const stop=()=>{if(document.hidden)onUnavailable?.();};document.addEventListener('visibilitychange',stop);
    return()=>{node.pause();node.removeAttribute('src');node.load();document.removeEventListener('visibilitychange',stop);};
  },[playing,preview,onUnavailable]);
  useEffect(()=>{setVideoReady(false);},[playing]);
  return <span className={`avatar-portrait${ready?' is-ready':''}`} ref={frame}>
    {visible&&look.thumbnail&&!failed?<img src={look.thumbnail} alt="" width={320} height={400} decoding="async" loading={priority?'eager':'lazy'} fetchPriority={priority?'high':'auto'}
      onLoad={()=>setReady(true)} onError={()=>{setFailed(true);setReady(true);}}/>:<HomeIcon name="user" size={36}/>}
    {playing&&preview&&<video ref={video} src={preview} data-avatar-preview={look.id} muted autoPlay loop playsInline preload="none"
      className={videoReady?'is-playing':''} onPlaying={()=>setVideoReady(true)} onError={onUnavailable} aria-label={`Extrait de ${look.name}`}/>}
    {playing&&!videoReady&&<span className="avatar-excerpt-loading" role="status">Chargement de l’extrait…</span>}
  </span>;
}

