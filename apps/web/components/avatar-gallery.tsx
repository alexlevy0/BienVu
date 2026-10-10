'use client';
import {useCallback,useEffect,useRef,useState} from 'react';
import {AvatarGallery as GallerySchema,type AvatarGallery as Gallery,type AvatarLook,type AvatarGalleryQuery} from '@bienvu/contracts';
import {AvatarPortrait} from './avatar-picker';
import {HomeIcon} from './home-icons';

export function AvatarGallery({initial}:{initial:Gallery}){
  const [data,setData]=useState(initial),[query,setQuery]=useState(''),[gender,setGender]=useState<AvatarGalleryQuery['gender']>('all');
  const [pending,setPending]=useState(false),[error,setError]=useState(''),[preview,setPreview]=useState<{id:string;pinned:boolean}|null>(null);
  const grid=useRef<HTMLDivElement>(null),timer=useRef<ReturnType<typeof setTimeout>|null>(null);
  const request=useRef<AbortController|null>(null),revision=useRef(0),filter=useRef('all|'),fetching=useRef(false);
  const normalizedQuery=query.trim();
  const clearHover=useCallback(()=>{if(timer.current!==null){clearTimeout(timer.current);timer.current=null;}},[]);
  const stop=useCallback(()=>{clearHover();setPreview(null);},[clearHover]);
  const load=useCallback(async(offset:number,append:boolean,q:string,g:AvatarGalleryQuery['gender'])=>{
    request.current?.abort();const controller=new AbortController(),version=++revision.current;request.current=controller;
    fetching.current=true;setPending(true);setError('');stop();
    try{
      const response=await fetch('/api/avatars/gallery?'+new URLSearchParams({query:q,gender:g,offset:String(offset)}),{signal:controller.signal});
      if(!response.ok)throw Error('AVATAR_GALLERY_UNAVAILABLE');
      const next=GallerySchema.parse(await response.json());if(version!==revision.current||controller.signal.aborted)return;
      setData(current=>({...next,looks:append?[...current.looks,...next.looks.filter(look=>!current.looks.some(old=>old.id===look.id))]:next.looks}));
    }catch{if(!controller.signal.aborted&&version===revision.current)setError('Le catalogue n’a pas pu être chargé. Réessayez dans un instant.');}
    finally{if(version===revision.current&&!controller.signal.aborted){fetching.current=false;setPending(false);}}
  },[stop]);
  useEffect(()=>{
    const key=gender+'|'+normalizedQuery;if(filter.current===key)return;filter.current=key;
    request.current?.abort();++revision.current;fetching.current=true;setPending(true);setError('');stop();
    const timeout=setTimeout(()=>void load(0,false,normalizedQuery,gender),300);return()=>clearTimeout(timeout);
  },[normalizedQuery,gender,load,stop]);
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
  return <section className="avatar-gallery" aria-label="Catalogue des avatars">
    <div className="avatar-gallery-toolbar"><label><span className="sr-only">Rechercher un avatar</span><HomeIcon name="search" size={20}/>
      <input type="search" placeholder="Rechercher un avatar…" maxLength={100} value={query} onChange={event=>setQuery(event.target.value)}/></label>
      <select aria-label="Genre du présentateur" value={gender} onChange={event=>setGender(event.target.value as typeof gender)}>
        <option value="all">Tous les avatars</option><option value="female">Présentatrices</option><option value="male">Présentateurs</option><option value="unknown">Genre non renseigné</option></select>
      <span role="status">{pending?'Chargement…':`${data.total.toLocaleString('fr-FR')} avatar${data.total!==1?'s':''}`}</span></div>
    <p className="avatar-gallery-hint">Survolez un portrait pour lancer la démonstration, ou cliquez sur « Voir l’extrait ». Les extraits sont lus sans son.</p>
    {error&&<p className="avatar-gallery-error" role="alert">{error} <button type="button" onClick={()=>void load(0,false,query.trim(),gender)}>Réessayer</button></p>}
    <div className="avatar-gallery-grid" ref={grid} aria-busy={pending}>
      {data.looks.map((look,index)=><article className="avatar-gallery-card avatar-look" key={look.id} data-avatar-id={look.id}
        onPointerEnter={event=>hover(look,event.pointerType)} onPointerLeave={()=>{clearHover();setPreview(current=>current?.id===look.id&&!current.pinned?null:current);}}>
        <AvatarPortrait look={look} playing={preview?.id===look.id} onUnavailable={stop} priority={index<2}/>
        <div className="avatar-gallery-card-info"><h2>{look.name}</h2><span>{look.gender==='female'?'Présentatrice':look.gender==='male'?'Présentateur':'Avatar IA'}</span></div>
        {look.preview?<button type="button" className="avatar-gallery-play" disabled={pending} aria-label={`${preview?.id===look.id?'Arrêter':'Voir'} l’extrait de ${look.name}`}
          onClick={()=>{clearHover();setPreview(current=>current?.id===look.id?null:{id:look.id,pinned:true});}}><HomeIcon name={preview?.id===look.id?'close':'play'} size={16}/>{preview?.id===look.id?'Arrêter l’extrait':'Voir l’extrait'}</button>:<span className="avatar-gallery-no-preview">Extrait indisponible</span>}
      </article>)}
    </div>
    {!pending&&!error&&!data.looks.length&&<div className="avatar-gallery-empty"><h2>Aucun avatar ne correspond à votre recherche.</h2><button type="button" onClick={()=>{setQuery('');setGender('all');}}>Voir tous les avatars</button></div>}
    {data.hasMore&&!error&&<div className="avatar-gallery-more"><p>{data.looks.length} sur {data.total.toLocaleString('fr-FR')} avatars</p><button type="button" disabled={pending}
      onClick={()=>{if(!fetching.current)void load(data.offset+32,true,query.trim(),gender);}}>{pending?'Chargement…':'Afficher plus d’avatars'}<HomeIcon name="chevron" size={18}/></button></div>}
  </section>;
}
