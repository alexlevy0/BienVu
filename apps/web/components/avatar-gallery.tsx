'use client';
import {useCallback,useEffect,useRef,useState} from 'react';
import {AvatarGallery as GallerySchema,type AvatarGallery as Gallery,type AvatarLook,type AvatarGalleryQuery} from '@bienvu/contracts';
import {AvatarPortrait} from './avatar-picker';
import {HomeIcon} from './home-icons';
import {useAvatarFavorites} from './avatar-favorites';

export function AvatarGallery({initial}:{initial:Gallery}){
  const favorites=useAvatarFavorites();
  const [data,setData]=useState(initial),[query,setQuery]=useState(''),[gender,setGender]=useState<AvatarGalleryQuery['gender']>('all');
  const [pending,setPending]=useState(false),[error,setError]=useState(''),[preview,setPreview]=useState<{id:string;pinned:boolean}|null>(null);
  const grid=useRef<HTMLDivElement>(null),end=useRef<HTMLDivElement>(null),timer=useRef<ReturnType<typeof setTimeout>|null>(null);
  const request=useRef<AbortController|null>(null),revision=useRef(0),filter=useRef('all|'),fetching=useRef(false);
  const failedRequest=useRef<{offset:number;append:boolean}|null>(null);
  const normalizedQuery=query.trim();
  const clearHover=useCallback(()=>{if(timer.current!==null){clearTimeout(timer.current);timer.current=null;}},[]);
  const stop=useCallback(()=>{clearHover();setPreview(null);},[clearHover]);
  const load=useCallback(async(offset:number,append:boolean,q:string,g:AvatarGalleryQuery['gender'])=>{
    request.current?.abort();const controller=new AbortController(),version=++revision.current;request.current=controller;
    fetching.current=true;failedRequest.current=null;setPending(true);setError('');if(!append)stop();
    try{
      const response=await fetch('/api/avatars/gallery?'+new URLSearchParams({query:q,gender:g,offset:String(offset)}),{signal:controller.signal});
      if(!response.ok)throw Error('AVATAR_GALLERY_UNAVAILABLE');
      const next=GallerySchema.parse(await response.json());if(version!==revision.current||controller.signal.aborted)return;
      setData(current=>({...next,looks:append?[...current.looks,...next.looks.filter(look=>!current.looks.some(old=>old.id===look.id))]:next.looks}));
    }catch{if(!controller.signal.aborted&&version===revision.current){failedRequest.current={offset,append};setError('Le catalogue n’a pas pu être chargé. Réessayez dans un instant.');}}
    finally{if(version===revision.current&&!controller.signal.aborted){fetching.current=false;setPending(false);}}
  },[stop]);
  useEffect(()=>{
    const key=gender+'|'+normalizedQuery;if(filter.current===key)return;filter.current=key;
    request.current?.abort();++revision.current;fetching.current=true;setPending(true);setError('');stop();
    const timeout=setTimeout(()=>void load(0,false,normalizedQuery,gender),300);return()=>clearTimeout(timeout);
  },[normalizedQuery,gender,load,stop]);
  const loadMore=useCallback(()=>{
    if(fetching.current||failedRequest.current||!data.hasMore||error||filter.current!==gender+'|'+normalizedQuery)return;
    void load(data.offset+32,true,normalizedQuery,gender);
  },[data.hasMore,data.offset,error,gender,normalizedQuery,load]);
  useEffect(()=>{
    const node=end.current;if(!node||!data.hasMore||pending||error)return;
    const observer=new IntersectionObserver(entries=>{if(entries.some(entry=>entry.isIntersecting))loadMore();},{rootMargin:'400px 0px'});
    observer.observe(node);return()=>observer.disconnect();
  },[data.hasMore,pending,error,loadMore]);
  useEffect(()=>{
    const escape=(event:KeyboardEvent)=>{if(event.key==='Escape')stop();};
    const scroll=()=>clearHover();window.addEventListener('keydown',escape);window.addEventListener('scroll',scroll,{passive:true});
    return()=>{request.current?.abort();clearHover();window.removeEventListener('keydown',escape);window.removeEventListener('scroll',scroll);};
  },[stop,clearHover]);
  useEffect(()=>{
    if(!preview)return;const node=grid.current?.querySelector(`[data-avatar-id="${preview.id}"]`);if(!node)return;
    const observer=new IntersectionObserver(entries=>{if(entries.some(entry=>!entry.isIntersecting))stop();});observer.observe(node);
    return()=>observer.disconnect();
  },[preview,stop]);
  function hover(look:AvatarLook,pointer:string){
    clearHover();if(pending||!look.preview||pointer!=='mouse'||!matchMedia('(hover: hover) and (pointer: fine)').matches||matchMedia('(prefers-reduced-motion: reduce)').matches)return;
    timer.current=setTimeout(()=>{setPreview({id:look.id,pinned:false});timer.current=null;},800);
  }
  const failure=error&&<p className="avatar-gallery-error" role="alert">{error} <button type="button" onClick={()=>{
    const failed=failedRequest.current;if(failed&&!fetching.current)void load(failed.offset,failed.append,normalizedQuery,gender);
  }}>Réessayer</button></p>;
  return <section className="avatar-gallery" aria-label="Catalogue des avatars">
    <div className="avatar-gallery-toolbar"><label><span className="sr-only">Rechercher un avatar</span><HomeIcon name="search" size={20}/>
      <input type="search" placeholder="Rechercher un avatar…" maxLength={100} value={query} onChange={event=>setQuery(event.target.value)}/></label>
      <select aria-label="Genre du présentateur" value={gender} onChange={event=>setGender(event.target.value as typeof gender)}>
        <option value="all">Tous les avatars</option><option value="female">Présentatrices</option><option value="male">Présentateurs</option><option value="unknown">Genre non renseigné</option></select>
      <span role="status">{pending?'Chargement…':`${data.total.toLocaleString('fr-FR')} avatar${data.total!==1?'s':''}`}</span></div>
    <p className="avatar-gallery-hint">Survolez un portrait pour lancer la démonstration, ou cliquez sur « Voir l’extrait ». Les extraits sont lus sans son.</p>
    {favorites.authenticated&&<p className="avatar-gallery-favorites-hint">Cliquez sur le cœur pour retrouver vos favoris en premier dans « Personnaliser ». <span role="status">{favorites.loading?'Chargement des favoris…':`${favorites.ids.length} favori${favorites.ids.length!==1?'s':''}`}</span></p>}
    {favorites.error&&<p className="avatar-gallery-error" role="alert">{favorites.error} <button type="button" onClick={favorites.refresh}>Actualiser les favoris</button></p>}
    {!failedRequest.current?.append&&failure}
    <div className="avatar-gallery-grid" ref={grid} aria-busy={pending}>
      {data.looks.map((look,index)=><article className="avatar-gallery-card avatar-look" key={look.id} data-avatar-id={look.id}
        onPointerEnter={event=>hover(look,event.pointerType)} onPointerLeave={()=>{clearHover();setPreview(current=>current?.id===look.id&&!current.pinned?null:current);}}>
        <AvatarPortrait look={look} playing={preview?.id===look.id} onUnavailable={stop} priority={index<2}/>
        {favorites.authenticated&&<button type="button" className="avatar-gallery-favorite" aria-pressed={favorites.ids.includes(look.id)}
          aria-label={`${favorites.ids.includes(look.id)?'Retirer des favoris':'Ajouter aux favoris'} : ${look.name}`}
          title={favorites.ids.includes(look.id)?'Retirer des favoris':'Ajouter aux favoris'} disabled={!favorites.ready||favorites.loading||favorites.busy.has(look.id)}
          onPointerEnter={clearHover} onFocus={clearHover} onClick={()=>{clearHover();void favorites.toggle(look.id);}}>
          <HomeIcon name="heart" size={20} filled={favorites.ids.includes(look.id)}/>
        </button>}
        <div className="avatar-gallery-card-info"><h2>{look.name}</h2><span>{look.gender==='female'?'Présentatrice':look.gender==='male'?'Présentateur':'Avatar IA'}</span></div>
        {look.preview?<button type="button" className="avatar-gallery-play" disabled={pending} aria-label={`${preview?.id===look.id?'Arrêter':'Voir'} l’extrait de ${look.name}`}
          onClick={()=>{clearHover();setPreview(current=>current?.id===look.id?null:{id:look.id,pinned:true});}}><HomeIcon name={preview?.id===look.id?'close':'play'} size={16}/>{preview?.id===look.id?'Arrêter l’extrait':'Voir l’extrait'}</button>:<span className="avatar-gallery-no-preview">Extrait indisponible</span>}
      </article>)}
    </div>
    {!pending&&!error&&!data.looks.length&&<div className="avatar-gallery-empty"><h2>Aucun avatar ne correspond à votre recherche.</h2><button type="button" onClick={()=>{setQuery('');setGender('all');}}>Voir tous les avatars</button></div>}
    {data.looks.length>0&&<div className="avatar-gallery-more" ref={end}><p>{data.looks.length} sur {data.total.toLocaleString('fr-FR')} avatars</p>
      {pending&&<p role="status">Chargement des avatars…</p>}
      {failedRequest.current?.append&&failure}
      {!data.hasMore&&!pending&&!error&&<p>Tous les résultats sont affichés.</p>}
    </div>}
  </section>;
}
