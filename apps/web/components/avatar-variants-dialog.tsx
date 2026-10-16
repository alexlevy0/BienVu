'use client';
import {useCallback,useEffect,useId,useRef,useState} from 'react';
import {AvatarGallery,avatarCutoutStatus,type AvatarLook,type AvatarPresenter} from '@bienvu/contracts';
import {AvatarPortrait} from './avatar-portrait';
import {useAvatarPreview} from './avatar-presenter-card';
import {useAvatarFavorites} from './avatar-favorites';
import {HomeIcon} from './home-icons';

type Props={presenter:AvatarPresenter;selected?:string;busy?:boolean;onClose():void;onChoose(look:AvatarLook):void|Promise<void>;
  onAddGroup?():Promise<boolean>;
  remote?:'public'|'admin';selectedIds?:ReadonlySet<string>;allowPremium?:boolean;onAvailability?(look:AvatarLook,enabled:boolean):Promise<void>;
  onTransparency?(look:AvatarLook,value:'supported'|'unsupported'|'auto'):Promise<void>};
export function AvatarVariantsDialog({presenter,selected,busy=false,onClose,onChoose,onAddGroup,remote,selectedIds,allowPremium=false,onAvailability,onTransparency}:Props){
  const dialog=useRef<HTMLDialogElement>(null),heading=useId(),favorites=useAvatarFavorites(),playback=useAvatarPreview(busy);
  const [page,setPage]=useState(()=>({looks:remote?[]:presenter.looks,total:presenter.total,offset:0,hasMore:false,revision:0}));
  const [pending,setPending]=useState(Boolean(remote)),[error,setError]=useState(''),[query,setQuery]=useState(''),[groupAdded,setGroupAdded]=useState(false);
  const controller=useRef<AbortController|null>(null),generation=useRef(0),loadedRevision=useRef<number|null>(null);
  const load=useCallback(async(offset=0)=>{
    controller.current?.abort();const abort=new AbortController(),version=++generation.current;controller.current=abort;setPending(true);setError('');
    try{
      const params=new URLSearchParams({groupId:presenter.id,offset:String(offset),...(remote==='admin'?{catalog:'1'}:{})});
      const response=await fetch((remote==='admin'?'/api/admin/avatars?':'/api/avatars/gallery?')+params,{cache:'no-store',signal:abort.signal});
      if(!response.ok)throw Error();const next=AvatarGallery.parse(await response.json());if(abort.signal.aborted||version!==generation.current)return;
      if(offset&&loadedRevision.current!==next.revision){setError('La sélection a changé. Actualisez les apparences.');return;}
      loadedRevision.current=next.revision;setPage(current=>({...next,looks:offset?[...current.looks,...next.looks.filter(look=>!current.looks.some(old=>old.id===look.id))]:next.looks}));
    }catch{if(!abort.signal.aborted)setError('Les apparences n’ont pas pu être chargées. Réessayez.');}
    finally{if(!abort.signal.aborted&&version===generation.current)setPending(false);}
  },[presenter.id,remote]);
  useEffect(()=>{if(remote)void load();return()=>{controller.current?.abort();};},[load,remote]);
  useEffect(()=>{
    const element=dialog.current,trigger=document.activeElement as HTMLElement|null,previous=document.body.style.overflow;
    element?.showModal();document.body.style.overflow='hidden';return()=>{element?.close();document.body.style.overflow=previous;if(trigger?.isConnected)trigger.focus({preventScroll:true});};
  },[]);
  const normalized=query.trim().toLocaleLowerCase('fr'),visible=page.looks.filter(look=>!normalized||look.name.toLocaleLowerCase('fr').includes(normalized));
  async function choose(look:AvatarLook){
    try{const adding=remote==='admin'&&!selectedIds?.has(look.id);playback.stop();await onChoose(look);
      if(adding)setPage(current=>({...current,looks:current.looks.map(item=>item.id===look.id?{...item,enabled:true}:item)}));
    }catch{setError('La modification n’a pas pu être enregistrée. Réessayez.');}
  }
  function label(look:AvatarLook){return look.name.startsWith(presenter.name+' in ')?look.name.slice(presenter.name.length+4):look.name;}
  return <dialog ref={dialog} className="avatar-selection-dialog avatar-variants-dialog" aria-labelledby={heading} onCancel={onClose} onClick={event=>{if(event.target===event.currentTarget)onClose();}}>
    <header><div><span>{remote==='admin'?'CATALOGUE HEYGEN':'LA SÉLECTION BIENVU'} · APPARENCES</span><h2 id={heading}>{presenter.name}<small>{page.total} apparence{page.total>1?'s':''}</small></h2><p>{remote==='admin'?'Choisissez les déclinaisons à proposer à vos clients. Vos ajouts restent en brouillon jusqu’à publication.':'Un même visage, plusieurs styles. Choisissez la tenue et le cadrage de votre vidéo.'}</p></div><button type="button" aria-label={`Fermer les apparences de ${presenter.name}`} onClick={onClose}><HomeIcon name="close" size={23}/></button></header>
    <div className="avatar-variants-toolbar"><label><HomeIcon name="search" size={18}/><input type="search" aria-label={`Rechercher une apparence de ${presenter.name}`} placeholder="Rechercher une tenue…" value={query} maxLength={100} onChange={event=>{playback.stop();setQuery(event.target.value);}}/></label><p role="status">{selectedIds?`${page.looks.filter(look=>selectedIds.has(look.id)).length} sélectionnée(s) parmi les apparences affichées`:'Survolez pour découvrir chaque style.'}</p>{onAddGroup&&<button type="button" className="avatar-dialog-add-group" disabled={busy||pending} onClick={()=>{playback.stop();setGroupAdded(false);void onAddGroup().then(async success=>{if(success){setGroupAdded(true);await load();}else setError('Le groupe n’a pas pu être ajouté. Vérifiez la capacité de votre sélection et réessayez.');});}}><HomeIcon name="plus" size={16}/>{busy?'Préparation du groupe…':'Ajouter tout le groupe'}</button>}</div>
    {groupAdded&&<p className="avatar-group-added" role="status">Toutes les apparences compatibles sont dans votre brouillon. Publiez la sélection pour les proposer aux utilisateurs.</p>}
    {error&&<p className="avatar-gallery-error" role="alert">{error} <button type="button" onClick={()=>void load()}>Actualiser</button></p>}
    <div className="avatar-selection-grid avatar-variants-grid" aria-busy={pending}>
      {pending&&!page.looks.length&&Array.from({length:4},(_,index)=><div className="avatar-variant-skeleton" key={index} aria-hidden="true"/>)}
      {visible.map((look,index)=>{const chosen=selectedIds?selectedIds.has(look.id):selected===look.id,favorite=favorites.ids.includes(look.id),compatible=remote!=='admin'||look.ownership==='public'&&(look.engines.includes('avatar_iii')||allowPremium&&look.engines.includes('avatar_iv'));
        return <article key={look.id} className={`avatar-variant${chosen?' is-selected':''}`} data-avatar-id={look.id} onPointerEnter={event=>playback.hover(look,event.pointerType)} onPointerLeave={()=>playback.leave(look.id)}>
          <button type="button" className="avatar-variant-face" disabled={busy||!compatible&&!chosen} aria-pressed={chosen} aria-label={`${selectedIds?(chosen?'Retirer':'Ajouter'):'Choisir'} ${look.name}`} onClick={()=>void choose(look)}><AvatarPortrait look={look} playing={playback.preview?.id===look.id} onUnavailable={playback.stop} priority={index<2}/>{chosen&&<span className="avatar-variant-check"><HomeIcon name="check" size={16}/>{selectedIds?'Dans ma sélection':'Sélectionné'}</span>}</button>
          <div className="avatar-variant-info"><h3>{label(look)}</h3><small>{avatarCutoutStatus(look)==='supported'?'Silhouette sans fond confirmée':look.gender==='female'?'Présentatrice':look.gender==='male'?'Présentateur':'Présentateur IA'}</small>
          <button type="button" className="avatar-variant-choose" disabled={busy||!compatible&&!chosen} aria-pressed={selectedIds?chosen:undefined} onClick={()=>void choose(look)}>{selectedIds?(chosen?'Retirer de la sélection':'Ajouter à ma sélection'):(chosen?'Apparence sélectionnée':'Choisir cette apparence')}<HomeIcon name={chosen?'check':'arrow'} size={15}/></button>
          <div className="avatar-variant-actions">{look.preview&&<button type="button" disabled={busy} onClick={()=>playback.toggle(look)}><HomeIcon name={playback.preview?.id===look.id?'pause':'play'} size={14}/>{playback.preview?.id===look.id?'Arrêter':'Voir l’extrait'}</button>}{remote!=='admin'&&favorites.authenticated&&look.publication&&<button type="button" aria-label={`${favorite?'Retirer des favoris':'Ajouter aux favoris'} : ${look.name}`} aria-pressed={favorite} disabled={favorites.loading||!favorites.ready||favorites.busy.has(look.id)} onClick={()=>void favorites.toggle(look.id)}><HomeIcon name="heart" size={16} filled={favorite}/></button>}</div>
          {!compatible&&<small>Ce moteur n’est pas activé dans vos réglages.</small>}
          {onAvailability&&<label className="avatar-variant-setting"><input type="checkbox" checked={look.enabled} disabled={busy} onChange={event=>{const enabled=event.target.checked;void onAvailability(look,enabled).then(()=>setPage(current=>({...current,looks:current.looks.map(item=>item.id===look.id?{...item,enabled}:item)}))).catch(()=>setError('La disponibilité n’a pas pu être enregistrée.'));}}/>Disponible pour la génération</label>}
          {onTransparency&&<label className="avatar-variant-setting">Silhouette sans fond<select value={look.transparency??(look.transparentVerified?'supported':'auto')} disabled={busy} onChange={event=>{const value=event.target.value as 'supported'|'unsupported'|'auto';void onTransparency(look,value).then(()=>setPage(current=>({...current,looks:current.looks.map(item=>item.id===look.id?{...item,transparency:value==='auto'?undefined:value,transparentVerified:value==='supported'}:item)}))).catch(()=>setError('La compatibilité n’a pas pu être enregistrée'));}}><option value="auto">À confirmer</option><option value="supported">Confirmée</option><option value="unsupported">Incompatible</option></select></label>}
          </div>
        </article>;})}
    </div>
    {!pending&&!error&&!visible.length&&<p className="avatar-variants-empty">{query?'Aucune apparence affichée ne correspond à cette recherche.':'Aucune apparence disponible dans cette sélection.'}</p>}
    {page.hasMore&&<div className="avatar-variants-more"><p>{page.looks.length} sur {page.total} apparences chargées</p><button type="button" disabled={pending} onClick={()=>void load(page.offset+32)}>{pending?'Chargement…':'Afficher les apparences suivantes'} <HomeIcon name="arrow" size={16}/></button></div>}
    <footer><HomeIcon name="user" size={17}/>{remote==='admin'?'L’identité HeyGen regroupe automatiquement les tenues. La publication reste sous votre contrôle.':'Votre voix, le placement et la durée restent identiques lorsque vous changez d’apparence.'}</footer>
  </dialog>;
}
