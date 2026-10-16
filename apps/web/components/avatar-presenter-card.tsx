'use client';
import {useCallback,useEffect,useRef,useState,type RefObject} from 'react';
import {avatarCutoutStatus,type AvatarLook,type AvatarPresenter} from '@bienvu/contracts';
import {AvatarPortrait} from './avatar-portrait';
import {HomeIcon} from './home-icons';
import {useAvatarFavorites} from './avatar-favorites';

export function useAvatarPreview(disabled=false){
  const [preview,setPreview]=useState<{id:string;pinned:boolean}|null>(null),timer=useRef<ReturnType<typeof setTimeout>|null>(null);
  const clear=useCallback(()=>{if(timer.current!==null)clearTimeout(timer.current);timer.current=null;},[]);
  const stop=useCallback(()=>{clear();setPreview(null);},[clear]);
  useEffect(()=>{if(disabled)stop();},[disabled,stop]);
  useEffect(()=>{const escape=(event:KeyboardEvent)=>{if(event.key==='Escape')stop();};window.addEventListener('keydown',escape);window.addEventListener('scroll',clear,{passive:true});return()=>{clear();window.removeEventListener('keydown',escape);window.removeEventListener('scroll',clear);};},[stop,clear]);
  useEffect(()=>{if(!preview)return;const video=document.querySelector(`[data-avatar-preview="${preview.id}"]`),card=video?.closest('[data-avatar-id]');if(!card)return;
    const observer=new IntersectionObserver(entries=>{if(entries.some(entry=>!entry.isIntersecting))stop();});observer.observe(card);return()=>observer.disconnect();
  },[preview,stop]);
  function hover(look:AvatarLook,pointer:string){clear();if(disabled||pointer!=='mouse'||!look.preview||!matchMedia('(hover: hover) and (pointer: fine)').matches||matchMedia('(prefers-reduced-motion: reduce)').matches)return;timer.current=setTimeout(()=>{setPreview({id:look.id,pinned:false});timer.current=null;},800);}
  function leave(id:string){clear();setPreview(current=>current?.id===id&&!current.pinned?null:current);}
  function toggle(look:AvatarLook){clear();if(!disabled)setPreview(current=>current?.id===look.id?null:{id:look.id,pinned:true});}
  return {preview,hover,leave,toggle,stop,clear};
}
export function AvatarPresenterCard({presenter,selected,onChoose,busy=false,gallery=false,root,priority=false,playback}:{presenter:AvatarPresenter;selected?:string;onChoose(look:AvatarLook):void;busy?:boolean;gallery?:boolean;root?:RefObject<HTMLDivElement|null>;priority?:boolean;playback:ReturnType<typeof useAvatarPreview>}){
  const favorites=useAvatarFavorites(),[variant,setVariant]=useState(presenter.looks.find(look=>look.id===selected)?.id??presenter.looks[0].id);
  const look=presenter.looks.find(item=>item.id===variant)??presenter.looks[0],chosen=presenter.looks.some(item=>item.id===selected),favorite=favorites.ids.includes(look.id);
  useEffect(()=>{if(selected&&presenter.looks.some(item=>item.id===selected))setVariant(selected);},[selected,presenter.id]);
  return <article className={`avatar-presenter-card${chosen?' is-selected':''}`} data-avatar-id={look.id} onPointerEnter={event=>playback.hover(look,event.pointerType)} onPointerLeave={()=>playback.leave(look.id)}>
    <div className="avatar-presenter-portrait"><button type="button" className="avatar-presenter-face" aria-label={gallery?`Voir l’extrait de ${presenter.name}`:`Choisir ${presenter.name}`} aria-pressed={gallery?undefined:chosen} disabled={busy||gallery&&!look.preview} onClick={()=>{if(gallery)playback.toggle(look);else{playback.stop();onChoose(look);}}}><AvatarPortrait key={look.id} look={look} root={root} playing={playback.preview?.id===look.id} onUnavailable={playback.stop} priority={priority}/></button>
      {presenter.recommended&&<span className="avatar-presenter-badge"><HomeIcon name="sparkle" size={12}/>Recommandé</span>}
      {favorites.authenticated&&look.publication&&<button type="button" className="avatar-presenter-heart" aria-label={`${favorite?'Retirer des favoris':'Ajouter aux favoris'} : ${presenter.name}`} aria-pressed={favorite} disabled={busy||favorites.loading||!favorites.ready||favorites.busy.has(look.id)} onPointerEnter={playback.clear} onFocus={playback.clear} onClick={()=>{playback.clear();void favorites.toggle(look.id);}}><HomeIcon name="heart" size={18} filled={favorite}/></button>}
      {chosen&&<span className="avatar-presenter-chosen"><HomeIcon name="check" size={13}/>Sélectionné</span>}
    </div>
    <div className="avatar-presenter-info"><h3>{presenter.name}</h3><p>{look.gender==='female'?'Présentatrice':look.gender==='male'?'Présentateur':'Présentation'}{favorite?' · Favori':''}</p>
      {presenter.looks.length>1&&<label><span>Tenue / cadrage</span><select aria-label={`Variante de ${presenter.name}`} value={look.id} disabled={busy} onChange={event=>{playback.stop();setVariant(event.target.value);if(!gallery){const next=presenter.looks.find(item=>item.id===event.target.value);if(next)onChoose(next);}}}>{presenter.looks.map(item=><option key={item.id} value={item.id}>{item.name}</option>)}</select></label>}
      {avatarCutoutStatus(look)==='supported'&&<small className="avatar-presenter-cutout"><HomeIcon name="check" size={12}/>Silhouette sans fond confirmée</small>}
    </div>
    <div className="avatar-presenter-actions">{look.preview&&<button type="button" disabled={busy} onClick={()=>playback.toggle(look)}><HomeIcon name={playback.preview?.id===look.id?'pause':'play'} size={14}/>{playback.preview?.id===look.id?'Arrêter':'Voir l’extrait'}</button>}{gallery&&<button type="button" className="avatar-presenter-use" disabled={busy} onClick={()=>{playback.stop();onChoose(look);}}>Utiliser ce présentateur <HomeIcon name="arrow" size={15}/></button>}</div>
  </article>;
}
