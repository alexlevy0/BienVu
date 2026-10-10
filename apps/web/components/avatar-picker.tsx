'use client';
import {useCallback,useEffect,useRef,useState,type RefObject} from 'react';
import type {AvatarLook} from '@bienvu/contracts';
import {HomeIcon} from './home-icons';

// Portraits load near the visible strip, not several screens ahead. Videos are
// mounted only after deliberate interest; leaving also cancels a pending hover.
export function AvatarPortrait({look,playing,root,onUnavailable}:{look:AvatarLook;playing?:boolean;root?:RefObject<HTMLDivElement|null>;onUnavailable?():void}){
  const frame=useRef<HTMLSpanElement>(null),video=useRef<HTMLVideoElement>(null);
  const [visible,setVisible]=useState(false),[ready,setReady]=useState(false),[failed,setFailed]=useState(false),[videoReady,setVideoReady]=useState(false);
  useEffect(()=>{const node=frame.current;if(!node)return;
    const observer=new IntersectionObserver(entries=>{if(entries.some(e=>e.isIntersecting)){setVisible(true);observer.disconnect();}},
      {root:root?.current??null,rootMargin:'160px'});observer.observe(node);return()=>observer.disconnect();
  },[root]);
  useEffect(()=>{if(!playing)return;const node=video.current;if(!node)return;
    node.muted=true;node.src=look.preview!;void node.play().catch(()=>{/* The explicit play button stays available. */});
    const stop=()=>{if(document.hidden)onUnavailable?.();};document.addEventListener('visibilitychange',stop);
    return()=>{node.pause();node.removeAttribute('src');node.load();document.removeEventListener('visibilitychange',stop);};
  },[playing,look.preview,onUnavailable]);
  useEffect(()=>{setVideoReady(false);},[playing]);
  return <span className={`avatar-portrait${ready?' is-ready':''}`} ref={frame}>
    {visible&&look.thumbnail&&!failed?<img src={look.thumbnail} alt="" width={320} height={400} decoding="async"
      onLoad={()=>setReady(true)} onError={()=>{setFailed(true);setReady(true);}}/>:<HomeIcon name="user" size={36}/>}
    {playing&&look.preview&&<video ref={video} src={look.preview} muted autoPlay loop playsInline preload="none"
      className={videoReady?'is-playing':''} onPlaying={()=>setVideoReady(true)} onError={onUnavailable} aria-label={`Extrait de ${look.name}`}/>}
    {playing&&!videoReady&&<span className="avatar-excerpt-loading" role="status">Chargement de l’extrait…</span>}
  </span>;
}

export function AvatarPicker({looks,selected,busy,onSelect}:{looks:AvatarLook[];selected:string;busy?:boolean;onSelect(look:AvatarLook):void}){
  const strip=useRef<HTMLDivElement>(null),timer=useRef<ReturnType<typeof setTimeout>|null>(null);
  const [query,setQuery]=useState(''),[gender,setGender]=useState('all'),[preview,setPreview]=useState<{id:string;pinned:boolean}|null>(null);
  const clearTimer=()=>{if(timer.current!==null){clearTimeout(timer.current);timer.current=null;}};
  useEffect(()=>()=>clearTimer(),[]);
  useEffect(()=>{clearTimer();setPreview(null);if(strip.current)strip.current.scrollLeft=0;},[query,gender,busy]);
  const stop=useCallback(()=>setPreview(null),[]);
  const normalized=query.trim().toLocaleLowerCase('fr');
  const filtered=looks.filter(look=>(gender==='all'||look.gender===gender)&&look.name.toLocaleLowerCase('fr').includes(normalized));
  function hover(look:AvatarLook,pointer:string){
    clearTimer();if(busy||!look.preview||pointer!=='mouse'||!matchMedia('(hover: hover) and (pointer: fine)').matches)return;
    timer.current=setTimeout(()=>{setPreview({id:look.id,pinned:false});timer.current=null;},800);
  }
  function leave(id:string){clearTimer();setPreview(current=>current?.id===id&&!current.pinned?null:current);}
  function scroll(direction:number){strip.current?.scrollBy({left:direction*strip.current.clientWidth*.8,
    behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'instant':'smooth'});}
  return <div className="avatar-picker">
    <div className="avatar-picker-toolbar">
      <input type="search" aria-label="Rechercher un avatar" placeholder="Rechercher un présentateur…" value={query} onChange={e=>setQuery(e.target.value)}/>
      <select aria-label="Genre du présentateur" value={gender} onChange={e=>setGender(e.target.value)}><option value="all">Tous les avatars</option><option value="female">Présentatrices</option><option value="male">Présentateurs</option><option value="unknown">Genre non renseigné</option></select>
      <span role="status">{filtered.length} avatar{filtered.length!==1?'s':''}</span>
      <div className="avatar-picker-arrows"><button type="button" aria-label="Avatars précédents" onClick={()=>scroll(-1)}>←</button><button type="button" aria-label="Avatars suivants" onClick={()=>scroll(1)}>→</button></div>
    </div>
    <div className="avatar-look-strip" ref={strip} tabIndex={0} role="region" aria-label="Choisir un présentateur" onScroll={()=>{clearTimer();setPreview(current=>current?.pinned?current:null);}}>
      {filtered.map(look=><div className={`avatar-look${look.id===selected?' is-selected':''}`} key={look.id}
        onPointerEnter={e=>hover(look,e.pointerType)} onPointerLeave={()=>leave(look.id)}>
        <button type="button" aria-pressed={look.id===selected} disabled={busy} onClick={()=>{clearTimer();setPreview(null);onSelect(look);}}>
          <AvatarPortrait look={look} root={strip} playing={preview?.id===look.id} onUnavailable={stop}/>
          <strong>{look.name}</strong><small>{look.gender==='female'?'Présentatrice':look.gender==='male'?'Présentateur':'Présentation'}</small>
        </button>
        {look.preview&&<button type="button" className="avatar-look-preview" disabled={busy} onClick={()=>{clearTimer();setPreview(current=>current?.id===look.id?null:{id:look.id,pinned:true});}}>
          {preview?.id===look.id?'Fermer l’extrait':'Voir un extrait'}
        </button>}
      </div>)}
      {!filtered.length&&<p className="customizer-hint">Aucun présentateur ne correspond à votre recherche.</p>}
    </div>
    <p className="avatar-picker-hint">Survolez un avatar pour voir son extrait, ou cliquez sur « Voir un extrait ». Les démonstrations sont lues sans son.</p>
  </div>;
}
