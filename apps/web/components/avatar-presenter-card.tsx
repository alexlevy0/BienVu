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
export function AvatarPresenterCard({presenter,selected,onOpen,busy=false,root,priority=false,playback,onAddGroup,groupActionLabel}:{presenter:AvatarPresenter;selected?:string;onOpen(presenter:AvatarPresenter):void;busy?:boolean;gallery?:boolean;root?:RefObject<HTMLDivElement|null>;priority?:boolean;playback:ReturnType<typeof useAvatarPreview>;onAddGroup?(presenter:AvatarPresenter):void;groupActionLabel?:string}){
  const favorites=useAvatarFavorites(),look=presenter.looks.find(item=>item.id===selected)??presenter.looks[0];
  const chosen=presenter.looks.some(item=>item.id===selected),favorite=favorites.ids.includes(look.id);
  const portraits=[...new Map(presenter.looks.flatMap(item=>item.groupPreviews??[item]).map(item=>[item.id,item])).values()].filter(item=>item.id!==look.id).slice(0,2);
  function open(){playback.stop();onOpen(presenter);}
  return <article className={`avatar-presenter-card${chosen?' is-selected':''}`} data-avatar-id={look.id} onPointerEnter={event=>playback.hover(look,event.pointerType)} onPointerLeave={()=>playback.leave(look.id)}>
    <div className="avatar-presenter-portrait"><button type="button" className="avatar-presenter-face" aria-label={`Voir les apparences de ${presenter.name}`} aria-haspopup="dialog" disabled={busy} onClick={open}><span className="avatar-presenter-mosaic" data-count={portraits.length+1}><span className="avatar-mosaic-main"><AvatarPortrait key={look.id} look={look} root={root} playing={playback.preview?.id===look.id} onUnavailable={playback.stop} priority={priority}/></span>{portraits.map(item=><span className="avatar-mosaic-secondary" key={item.id}><AvatarPortrait look={item} root={root}/></span>)}</span></button>
      {presenter.recommended&&<span className="avatar-presenter-badge"><HomeIcon name="sparkle" size={12}/>Recommandé</span>}
      {favorites.authenticated&&look.publication&&<button type="button" className="avatar-presenter-heart" aria-label={`${favorite?'Retirer des favoris':'Ajouter aux favoris'} : ${presenter.name}`} aria-pressed={favorite} disabled={busy||favorites.loading||!favorites.ready||favorites.busy.has(look.id)} onPointerEnter={playback.clear} onFocus={playback.clear} onClick={()=>{playback.clear();void favorites.toggle(look.id);}}><HomeIcon name="heart" size={18} filled={favorite}/></button>}
      {chosen&&<span className="avatar-presenter-chosen"><HomeIcon name="check" size={13}/>Sélectionné</span>}
      <span className="avatar-presenter-count"><HomeIcon name="grid" size={12}/>{presenter.total} apparence{presenter.total>1?'s':''}</span>
    </div>
    <div className="avatar-presenter-info"><h3>{presenter.name}</h3><p>{look.gender==='female'?'Présentatrice':look.gender==='male'?'Présentateur':'Présentation'}{favorite?' · Favori':''}</p>
      {avatarCutoutStatus(look)==='supported'&&<small className="avatar-presenter-cutout"><HomeIcon name="check" size={12}/>Silhouette sans fond confirmée</small>}
    </div>
    <div className="avatar-presenter-actions">{onAddGroup&&<button type="button" className="avatar-presenter-use avatar-add-entire-group" disabled={busy} onClick={()=>{playback.stop();onAddGroup(presenter);}}>{groupActionLabel??'Ajouter le groupe entier'}<HomeIcon name="plus" size={15}/></button>}<button type="button" className={onAddGroup?undefined:'avatar-presenter-use'} disabled={busy} aria-haspopup="dialog" onClick={open}>{onAddGroup?'Voir les apparences':'Choisir une apparence'} <HomeIcon name="arrow" size={15}/></button>{!onAddGroup&&look.preview&&<button type="button" disabled={busy} onClick={()=>playback.toggle(look)}><HomeIcon name={playback.preview?.id===look.id?'pause':'play'} size={14}/>{playback.preview?.id===look.id?'Arrêter':'Voir l’extrait'}</button>}</div>
  </article>;
}
