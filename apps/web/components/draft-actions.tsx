'use client';
import {useEffect,useRef,useState} from 'react';
import {HomeIcon} from './home-icons';
import {useGenerationStore,type RecentDraft} from './generation-store';
import {discardManualListingDraft} from '../lib/listing-draft';

export function DraftActions({draft,agencyId,placement='sidebar'}:{draft:RecentDraft;agencyId:string;placement?:'sidebar'|'history'}){
  const {forgetDraft,refreshDrafts}=useGenerationStore();
  const [open,setOpen]=useState(false),[busy,setBusy]=useState(false),[failure,setFailure]=useState('');
  const container=useRef<HTMLDivElement>(null),trigger=useRef<HTMLButtonElement>(null),action=useRef<HTMLButtonElement>(null),owner=useRef(agencyId),requestPending=useRef(false);
  owner.current=agencyId;
  useEffect(()=>{if(!open)return;action.current?.focus();
    const outside=(event:PointerEvent)=>{if(!container.current?.contains(event.target as Node))setOpen(false);};
    document.addEventListener('pointerdown',outside);return()=>document.removeEventListener('pointerdown',outside);
  },[open]);
  async function remove(){
    if(busy||requestPending.current)return;requestPending.current=true;setBusy(true);setFailure('');
    try{
      const response=await fetch(`/api/imports/${encodeURIComponent(draft.id)}/draft`,{method:'DELETE'});
      if(owner.current!==agencyId)return;
      if(!response.ok&&response.status!==404)throw new Error(response.status===409?'Ce brouillon a déjà été enregistré. Actualisez la page.':
        response.status===401?'Reconnectez-vous pour supprimer ce brouillon.':'Suppression interrompue. Réessayez.');
      window.dispatchEvent(new CustomEvent('bienvu:draft-deleted',{detail:{id:draft.id,agencyId}}));
      forgetDraft(draft.id,agencyId);await discardManualListingDraft(agencyId,draft.id);
      if(owner.current!==agencyId)return;await refreshDrafts();
      const next=placement==='history'?document.querySelector<HTMLElement>('.video-library-drafts a')??document.getElementById('history-title'):
        document.querySelector<HTMLElement>('.home-recents a, .home-nav-active');
      next?.focus();
    }catch(error){if(owner.current===agencyId)setFailure(error instanceof Error?error.message:'Suppression interrompue. Réessayez.');}
    finally{requestPending.current=false;if(owner.current===agencyId)setBusy(false);}
  }
  return <div ref={container} className="home-draft-actions" onKeyDown={event=>{
    if(event.key==='Escape'){event.preventDefault();event.stopPropagation();setOpen(false);trigger.current?.focus();}
    if(event.key==='Tab')setOpen(false);
    if(event.key==='ArrowDown'&&!open){event.preventDefault();setOpen(true);}
  }}>
    <button ref={trigger} type="button" className="home-draft-more" aria-label={`Actions du brouillon ${draft.title||'Votre annonce'}`}
      aria-haspopup="menu" aria-expanded={open} onClick={()=>setOpen(value=>!value)}><HomeIcon name="more" size={20}/></button>
    {open&&<div className="home-draft-dropdown"><div role="menu" aria-label="Actions du brouillon"><button ref={action} type="button" role="menuitem" aria-disabled={busy} onClick={()=>void remove()}>
      <HomeIcon name="trash" size={17}/>{busy?'Suppression…':'Supprimer'}</button></div>{failure&&<p role="alert">{failure}</p>}</div>}
  </div>;
}
