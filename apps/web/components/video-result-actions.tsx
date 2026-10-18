'use client';

import Link from 'next/link';
import {useEffect,useRef,useState} from 'react';
import type {GenerationView} from '@bienvu/contracts';
import {useAccount} from './account';
import {HomeIcon} from './home-icons';
import {videoResultActions} from '../lib/video-result-actions';
import './video-result-actions.css';

type PublishDialog=typeof import('./social-publish-dialog')['SocialPublishDialog'];

export function VideoResultActions({job,onPublished}:{job:GenerationView;onPublished?():void}){
 const {me}=useAccount(),actions=videoResultActions(job,me?.role??null);
 const scope=JSON.stringify([me?.user.id,me?.agency.id,me?.role,job.id]),current=useRef<string|null>(scope),completed=useRef(false);
 const [Dialog,setDialog]=useState<PublishDialog|null>(null),[open,setOpen]=useState<string|null>(null),[pending,setPending]=useState<string|null>(null),[error,setError]=useState<{scope:string;message:string}|null>(null);
 useEffect(()=>{current.current=scope;setPending(null);setOpen(null);setError(null);completed.current=false;return()=>{current.current=null;};},[scope]);
 async function publish(){
  if(!actions?.canPublish||pending===scope)return;
  const expected=scope;setPending(expected);setError(null);
  try{
   const module=await import('./social-publish-dialog');
   if(current.current!==expected)return;
   completed.current=false;setDialog(()=>module.SocialPublishDialog);setOpen(expected);
  }catch{if(current.current===expected)setError({scope:expected,message:'Le formulaire de publication n’a pas pu s’ouvrir. Réessayez.'});}
  finally{if(current.current===expected)setPending(null);}
 }
 function close(){setOpen(null);if(completed.current){completed.current=false;onPublished?.();}}
 if(!actions||!actions.downloadUrl&&!actions.editorUrl)return null;
 return <div className="video-result-tools">
  <div className="video-result-actions" role="group" aria-label={`Actions pour la vidéo : ${job.title}`}>
   {actions.downloadUrl&&<a className="video-result-action video-result-download" href={actions.downloadUrl} download aria-label="Télécharger la vidéo"><HomeIcon name="download" size={18}/><span>Télécharger</span></a>}
   {actions.editorUrl&&<Link className="video-result-action" href={actions.editorUrl} prefetch={false} aria-label="Modifier la vidéo dans l’Éditeur"><HomeIcon name="pencil" size={17}/><span>Modifier</span></Link>}
   {actions.canPublish&&<button className="video-result-action" type="button" aria-haspopup="dialog" aria-label="Publier la vidéo sur mes réseaux" aria-busy={pending===scope} disabled={pending===scope} onClick={()=>void publish()}><HomeIcon name="send" size={17}/><span>{pending===scope?'Ouverture…':'Publier'}</span></button>}
  </div>
  {error?.scope===scope&&<p className="video-result-error" role="alert">{error.message}</p>}
  {Dialog&&open===scope&&actions.canPublish&&<Dialog key={scope} job={job} onClose={close} onPublished={()=>{completed.current=true;}}/>}
 </div>;
}
