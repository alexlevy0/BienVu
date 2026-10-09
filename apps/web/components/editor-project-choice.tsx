'use client';
import {useEffect,useId,useRef,useState,type MouseEvent} from 'react';
import {demoAssetUrl,editorDemo} from '../lib/editor-demo';
import {HomeIcon} from './home-icons';

export type EditorProjectKind='demo'|'empty';
export function EditorProjectChoice({onChoose,onClose,busy=false,error='',resumeLabel,note}: {
  onChoose(kind:EditorProjectKind):void;onClose():void;busy?:boolean;error?:string;resumeLabel?:string;note?:string;
}){
  const dialog=useRef<HTMLDialogElement>(null),titleId=useId(),demo=editorDemo(),[closing,setClosing]=useState(false),
    closeTimer=useRef<ReturnType<typeof setTimeout>|null>(null),outsidePress=useRef(false);
  useEffect(()=>{
    const node=dialog.current,trigger=document.activeElement;
    node?.showModal();
    return()=>{if(closeTimer.current!==null)clearTimeout(closeTimer.current);node?.close();
      if(trigger instanceof HTMLElement&&trigger.isConnected)trigger.focus({preventScroll:true});};
  },[]);
  function requestClose(){
    if(busy||closing||closeTimer.current!==null)return;
    const duration=Number.parseFloat(getComputedStyle(dialog.current!).getPropertyValue('--dialog-motion-duration'))||0;
    if(!duration){onClose();return;}
    setClosing(true);closeTimer.current=setTimeout(onClose,duration);
  }
  function isOutside(event:MouseEvent<HTMLDialogElement>){
    const bounds=event.currentTarget.getBoundingClientRect();
    return event.target===event.currentTarget&&(event.clientX<bounds.left||event.clientX>bounds.right||event.clientY<bounds.top||event.clientY>bounds.bottom);
  }
  const disabled=busy||closing;
  return <dialog ref={dialog} className="editor-welcome" aria-labelledby={titleId} aria-busy={busy} data-closing={closing?'true':undefined}
    onCancel={event=>{event.preventDefault();requestClose();}}
    onPointerDown={event=>{outsidePress.current=isOutside(event);}}
    onClick={event=>{if(outsidePress.current&&isOutside(event))requestClose();outsidePress.current=false;}}>
    <button type="button" className="editor-welcome-close" aria-label="Fermer le choix du projet" disabled={disabled} onClick={requestClose}><HomeIcon name="close" size={20}/></button>
    <span className="editor-eyebrow">VOTRE STUDIO DE MONTAGE</span><h2 id={titleId}>À vous de jouer.</h2>
    <p>Découvrez l’Éditeur avec une vidéo prête à retoucher, ou partez de vos propres photos.</p>
    <div className="editor-welcome-options"><button type="button" className="editor-welcome-demo" disabled={disabled} onClick={()=>onChoose('demo')}>
      <img src={demoAssetUrl(demo.draft.photos[0].id)} alt="Aperçu du projet de démonstration"/>
      <span><strong>Utiliser la démo</strong><small>Plans animés, textes, voix off et musique.</small><b>Ouvrir la démo <HomeIcon name="arrow" size={18}/></b></span>
    </button><button type="button" className="editor-welcome-empty" disabled={disabled} onClick={()=>onChoose('empty')}><HomeIcon name="plus" size={36}/>
      <strong>Nouveau projet</strong><small>Un éditeur vide pour créer votre propre vidéo.</small><b>Commencer <HomeIcon name="arrow" size={18}/></b></button></div>
    {busy&&<p role="status">Ouverture de votre projet…</p>}
    {error&&<p className="editor-error" role="alert">{error}</p>}
    {resumeLabel&&<button type="button" className="editor-welcome-resume" disabled={disabled} onClick={requestClose}>{resumeLabel}</button>}
    <p className="editor-welcome-note">{note??'Vos essais restent sur cet appareil. Connectez-vous pour enregistrer votre projet dans votre compte et exporter une vidéo.'}</p>
  </dialog>;
}
