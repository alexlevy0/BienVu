'use client';
import {useEffect,useId,useRef} from 'react';
import {demoAssetUrl,editorDemo} from '../lib/editor-demo';
import {HomeIcon} from './home-icons';

export type EditorProjectKind='demo'|'empty';
export function EditorProjectChoice({onChoose,onClose,busy=false,error='',resumeLabel,note}: {
  onChoose(kind:EditorProjectKind):void;onClose():void;busy?:boolean;error?:string;resumeLabel?:string;note?:string;
}){
  const dialog=useRef<HTMLDialogElement>(null),titleId=useId(),demo=editorDemo();
  useEffect(()=>{const node=dialog.current;node?.showModal();return()=>node?.close();},[]);
  return <dialog ref={dialog} className="editor-welcome" aria-labelledby={titleId} aria-busy={busy}
    onCancel={event=>{event.preventDefault();if(!busy)onClose();}}>
    <span className="editor-eyebrow">VOTRE STUDIO DE MONTAGE</span><h2 id={titleId}>À vous de jouer.</h2>
    <p>Découvrez l’Éditeur avec une vidéo prête à retoucher, ou partez de vos propres photos.</p>
    <div className="editor-welcome-options"><button type="button" className="editor-welcome-demo" disabled={busy} onClick={()=>onChoose('demo')}>
      <img src={demoAssetUrl(demo.draft.photos[0].id)} alt="Aperçu du projet de démonstration"/>
      <span><strong>Utiliser la démo</strong><small>Plans animés, textes, voix off et musique.</small><b>Ouvrir la démo <HomeIcon name="arrow" size={18}/></b></span>
    </button><button type="button" className="editor-welcome-empty" disabled={busy} onClick={()=>onChoose('empty')}><HomeIcon name="plus" size={36}/>
      <strong>Nouveau projet</strong><small>Un éditeur vide pour créer votre propre vidéo.</small><b>Commencer <HomeIcon name="arrow" size={18}/></b></button></div>
    {busy&&<p role="status">Ouverture de votre projet…</p>}
    {error&&<p className="editor-error" role="alert">{error}</p>}
    {resumeLabel&&<button type="button" className="editor-welcome-resume" disabled={busy} onClick={onClose}>{resumeLabel}</button>}
    <p className="editor-welcome-note">{note??'Vos essais restent sur cet appareil. Connectez-vous pour enregistrer votre projet dans votre compte et exporter une vidéo.'}</p>
  </dialog>;
}
