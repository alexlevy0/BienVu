'use client';
import '../app/avatars.css';
import '../app/avatar-selection.css';
import {useEffect,useRef,useState} from 'react';
import {avatarPresenters,type AvatarLook,type AvatarPresenter} from '@bienvu/contracts';
import {HomeIcon} from './home-icons';
import {useAvatarFavorites} from './avatar-favorites';
import {AvatarPresenterCard,useAvatarPreview} from './avatar-presenter-card';
import {AvatarVariantsDialog} from './avatar-variants-dialog';
export {AvatarPortrait} from './avatar-portrait';

export function AvatarPicker({looks,current,selected,busy,onSelect}:{looks:AvatarLook[];current?:AvatarLook|null;selected:string;busy?:boolean;onSelect(look:AvatarLook):void}){
  const favorites=useAvatarFavorites(),strip=useRef<HTMLDivElement>(null),dialog=useRef<HTMLDialogElement>(null);
  const [query,setQuery]=useState(''),[gender,setGender]=useState('all'),[open,setOpen]=useState(false),playback=useAvatarPreview(busy);
  const [group,setGroup]=useState<AvatarPresenter|null>(null);
  const normalized=query.trim().toLocaleLowerCase('fr');
  const presenters=avatarPresenters(looks,favorites.ids),filtered=presenters.filter(presenter=>(!normalized||presenter.name.toLocaleLowerCase('fr').includes(normalized)||presenter.looks.some(look=>look.name.toLocaleLowerCase('fr').includes(normalized)))&&(gender==='all'||presenter.looks.some(look=>look.gender===gender)));
  const selectedPresenter=filtered.find(presenter=>presenter.looks.some(look=>look.id===selected));
  const short=filtered.slice(0,12);if(selectedPresenter&&!short.includes(selectedPresenter)){short.pop();short.unshift(selectedPresenter);}
  useEffect(()=>{playback.stop();if(strip.current)strip.current.scrollLeft=0;},[query,gender,busy]);
  useEffect(()=>{if(!open)return;const element=dialog.current,trigger=document.activeElement as HTMLElement|null,previous=document.body.style.overflow;
    element?.showModal();document.body.style.overflow='hidden';return()=>{element?.close();document.body.style.overflow=previous;trigger?.focus({preventScroll:true});};
  },[open]);
  function close(){playback.stop();setOpen(false);}
  function select(look:AvatarLook){onSelect(look);setGroup(null);close();}
  function scroll(direction:number){strip.current?.scrollBy({left:direction*strip.current.clientWidth*.8,behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'instant':'smooth'});}
  const filters=<div className="avatar-picker-toolbar"><input type="search" aria-label="Rechercher dans la sélection BienVu" placeholder="Rechercher un présentateur…" maxLength={100} value={query} onChange={event=>setQuery(event.target.value)}/><select aria-label="Genre du présentateur" value={gender} onChange={event=>setGender(event.target.value)}><option value="all">Tous les profils</option><option value="female">Présentatrices</option><option value="male">Présentateurs</option><option value="unknown">Non renseigné</option></select><span role="status">{filtered.length} présentateur{filtered.length>1?'s':''}</span></div>;
  return <div className="avatar-picker avatar-picker-curated">
    <div className="avatar-selection-heading"><div><h4>Choisir un présentateur</h4></div><button type="button" className="avatar-selection-see-all" disabled={busy} onClick={()=>{playback.stop();setOpen(true);}}>Tout voir ({presenters.length}) <HomeIcon name="grid" size={17}/></button></div>
    {favorites.authenticated&&favorites.loading&&<p className="avatar-picker-hint" role="status">Chargement de vos favoris…</p>}
    {favorites.error&&<p className="avatar-favorites-error" role="alert">{favorites.error} <button type="button" onClick={favorites.refresh}>Actualiser</button></p>}
    {!open&&filters}
    {current&&!looks.some(look=>look.id===current.id)&&current.id===selected&&<div className="avatar-selection-legacy"><HomeIcon name="user" size={20}/><p><strong>{current.name}</strong> · Votre choix enregistré est conservé. Ce présentateur n’est plus proposé dans la nouvelle sélection.</p></div>}
    <div className="avatar-look-strip avatar-curated-strip" ref={strip} tabIndex={0} role="region" aria-label="Choisir un présentateur" onScroll={()=>playback.clear()}>
      {short.map((presenter,index)=><AvatarPresenterCard key={presenter.id} presenter={presenter} selected={selected} busy={busy} onOpen={presenter=>{playback.stop();setGroup(presenter);}} playback={open||group?{...playback,preview:null}:playback} root={strip} priority={index<2}/>)}
      {!filtered.length&&<p className="customizer-hint">Aucun présentateur ne correspond à votre recherche.</p>}
    </div>
    <div className="avatar-curated-footer"><p className="avatar-picker-hint">Cliquez sur un portrait pour choisir son apparence.</p><div className="avatar-picker-arrows"><button type="button" aria-label="Avatars précédents" onClick={()=>scroll(-1)}>←</button><button type="button" aria-label="Avatars suivants" onClick={()=>scroll(1)}>→</button></div></div>
    {open&&<dialog ref={dialog} className="avatar-selection-dialog" aria-labelledby="avatar-selection-dialog-title" onCancel={close} onClick={event=>{if(event.target===event.currentTarget)close();}}><header><div><span>LA SÉLECTION BIENVU</span><h2 id="avatar-selection-dialog-title">Le présentateur de votre bien.</h2><p>Ouvrez un présentateur pour découvrir ses apparences. Vous gardez votre voix et vos réglages.</p></div><button type="button" aria-label="Fermer la sélection des avatars" onClick={close}><HomeIcon name="close" size={23}/></button></header>{filters}<div className="avatar-selection-grid">{filtered.map((presenter,index)=><AvatarPresenterCard key={presenter.id} presenter={presenter} selected={selected} busy={busy} onOpen={presenter=>{playback.stop();setGroup(presenter);}} playback={playback} priority={index<2}/>)}</div>{!filtered.length&&<p>Aucun présentateur ne correspond à votre recherche.</p>}</dialog>}
    {group&&<AvatarVariantsDialog key={group.id} presenter={group} selected={selected} busy={busy} onClose={()=>setGroup(null)} onChoose={select}/>}
  </div>;
}
