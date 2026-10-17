'use client';
import {useCallback,useEffect,useRef,useState} from 'react';
import {AvatarGallery as GallerySchema,avatarPresenters,type AvatarGallery as Gallery,type AvatarLook,type AvatarPresenter,type AvatarGalleryQuery} from '@bienvu/contracts';
import {AvatarPresenterCard,useAvatarPreview,type AvatarMotionOrigin} from './avatar-presenter-card';
import {runMotion} from '../lib/view-motion';
import {AvatarVariantsDialog} from './avatar-variants-dialog';
import {useAccount} from './account';
import {avatarIntentKey} from '../lib/avatar-intent';
import {homeRenderPresetKey} from '../lib/home-render-presets';
import {authLoginPath} from '../lib/auth-navigation';
import '../app/avatar-selection.css';
import {HomeIcon} from './home-icons';
import {useAvatarFavorites} from './avatar-favorites';

export function AvatarGallery({initial}:{initial:Gallery}){
  const favorites=useAvatarFavorites(),{me,loading}=useAccount();
  const [data,setData]=useState(initial),[query,setQuery]=useState(''),[gender,setGender]=useState<AvatarGalleryQuery['gender']>('all');
  const [group,setGroup]=useState<AvatarPresenter|null>(null),[motionOrigin,setMotionOrigin]=useState<AvatarMotionOrigin|undefined>();
  const [pending,setPending]=useState(false),[error,setError]=useState('');
  const playback=useAvatarPreview(pending),{stop}=playback,publishedRevision=useRef(initial.revision);
  const end=useRef<HTMLDivElement>(null);
  const request=useRef<AbortController|null>(null),revision=useRef(0),filter=useRef('all|'),fetching=useRef(false);
  const failedRequest=useRef<{offset:number;append:boolean}|null>(null);
  const normalizedQuery=query.trim();
  const load=useCallback(async(offset:number,append:boolean,q:string,g:AvatarGalleryQuery['gender'],animate=false)=>{
    request.current?.abort();const controller=new AbortController(),version=++revision.current;request.current=controller;
    fetching.current=true;failedRequest.current=null;setPending(true);setError('');if(!append)stop();
    try{
      const response=await fetch('/api/avatars/gallery?'+new URLSearchParams({query:q,gender:g,offset:String(offset)}),{signal:controller.signal});
      if(!response.ok)throw Error('AVATAR_GALLERY_UNAVAILABLE');
      const next=GallerySchema.parse(await response.json());if(version!==revision.current||controller.signal.aborted)return;
      if(append&&next.revision!==publishedRevision.current){fetching.current=false;void load(0,false,q,g);return;}
      publishedRevision.current=next.revision;
      const commit=()=>setData(current=>({...next,looks:append?[...current.looks,...next.looks.filter(look=>!current.looks.some(old=>old.id===look.id))]:next.looks}));
      if(animate)runMotion('bv-list',commit);else commit();
    }catch{if(!controller.signal.aborted&&version===revision.current){failedRequest.current={offset,append};setError('Le catalogue n’a pas pu être chargé. Réessayez dans un instant.');}}
    finally{if(version===revision.current&&!controller.signal.aborted){fetching.current=false;setPending(false);}}
  },[stop]);
  useEffect(()=>{
    const key=gender+'|'+normalizedQuery;if(filter.current===key)return;filter.current=key;
    request.current?.abort();++revision.current;fetching.current=true;setPending(true);setError('');stop();
    const timeout=setTimeout(()=>void load(0,false,normalizedQuery,gender,true),300);return()=>clearTimeout(timeout);
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
  const filters=useRef({query:normalizedQuery,gender});filters.current={query:normalizedQuery,gender};
  useEffect(()=>{
    const refresh=()=>{if(!document.hidden)void load(0,false,filters.current.query,filters.current.gender);};
    const channel=typeof BroadcastChannel==='undefined'?null:new BroadcastChannel('bienvu-avatar-publication');
    if(channel)channel.onmessage=refresh;window.addEventListener('focus',refresh);window.addEventListener('bienvu:avatars-published',refresh);
    return()=>{request.current?.abort();channel?.close();window.removeEventListener('focus',refresh);window.removeEventListener('bienvu:avatars-published',refresh);};
  },[load]);
  function choose(look:AvatarLook){
    if(loading)return;
    try{sessionStorage.setItem(avatarIntentKey,JSON.stringify({lookId:look.id,at:Date.now()}));sessionStorage.removeItem(homeRenderPresetKey);}
    catch{setError('Votre navigateur ne permet pas de conserver ce choix. Réessayez depuis Personnaliser.');return;}
    window.location.assign(me?'/':authLoginPath('/'));
  }
  const presenters=avatarPresenters(data.looks);
  const failure=error&&<p className="avatar-gallery-error" role="alert">{error} <button type="button" onClick={()=>{
    const failed=failedRequest.current;if(failed&&!fetching.current)void load(failed.offset,failed.append,normalizedQuery,gender);
  }}>Réessayer</button></p>;
  return <section className="avatar-gallery" aria-label="Sélection des présentateurs BienVu">
    <div className="avatar-gallery-toolbar"><label><span className="sr-only">Rechercher un avatar</span><HomeIcon name="search" size={20}/>
      <input type="search" placeholder="Rechercher un avatar…" maxLength={100} value={query} onChange={event=>setQuery(event.target.value)}/></label>
      <select aria-label="Genre du présentateur" value={gender} onChange={event=>setGender(event.target.value as typeof gender)}>
        <option value="all">Tous les profils</option><option value="female">Présentatrices</option><option value="male">Présentateurs</option><option value="unknown">Genre non renseigné</option></select>
      <span role="status">{pending?'Chargement…':`${data.total.toLocaleString('fr-FR')} présentateur${data.total!==1?'s':''}`}</span></div>
    <p className="avatar-gallery-hint">Un visage, plusieurs styles. Ouvrez un présentateur pour choisir son apparence. Survolez un portrait pour voir sa démonstration.</p>
    {favorites.authenticated&&<p className="avatar-gallery-favorites-hint">Cliquez sur le cœur pour retrouver vos favoris en premier dans « Personnaliser ». <span role="status">{favorites.loading?'Chargement des favoris…':`${favorites.ids.length} favori${favorites.ids.length!==1?'s':''}`}</span></p>}
    {favorites.error&&<p className="avatar-gallery-error" role="alert">{favorites.error} <button type="button" onClick={favorites.refresh}>Actualiser les favoris</button></p>}
    {!failedRequest.current?.append&&failure}
    <div className="avatar-gallery-grid avatar-selection-grid" aria-busy={pending}>
      {presenters.map((presenter,index)=><AvatarPresenterCard key={presenter.id} presenter={presenter} gallery busy={pending||loading} motion onOpen={(presenter,origin)=>{stop();setMotionOrigin(origin);setGroup(presenter);}} playback={playback} priority={index<2}/>)}
    </div>
    {!pending&&!error&&!data.looks.length&&<div className="avatar-gallery-empty"><h2>Aucun présentateur ne correspond à votre recherche.</h2><button type="button" onClick={()=>{setQuery('');setGender('all');}}>Voir toute la sélection</button></div>}
    {data.looks.length>0&&<div className="avatar-gallery-more" ref={end}><p>{presenters.length} sur {data.total.toLocaleString('fr-FR')} présentateurs</p>
      {pending&&<p role="status">Chargement des présentateurs…</p>}
      {failedRequest.current?.append&&failure}
      {!data.hasMore&&!pending&&!error&&<p>Tous les résultats sont affichés.</p>}
    </div>}
    {group&&<AvatarVariantsDialog key={group.id} presenter={group} motionOrigin={motionOrigin} remote="public" busy={pending||loading} onClose={()=>setGroup(null)} onChoose={choose}/>}
  </section>;
}
