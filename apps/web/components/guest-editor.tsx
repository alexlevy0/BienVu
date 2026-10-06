'use client';
import {useEffect,useRef,useState,type ReactNode} from 'react';
import {type CreationDraftView} from '@bienvu/contracts';
import {editorDemo,demoAssetUrl} from '../lib/editor-demo';
import {newGuestRecord,readGuestRecord,writeGuestRecord,guestResources,guestPhoto,guestMusic,transferGuestEditor,
  type GuestEditorRecord,type GuestEditorPort} from '../lib/editor-guest';
import {useAccount} from './account';
import {HomeIcon} from './home-icons';
import {EditorProjectChoice} from './editor-project-choice';

export function GuestEditor({render}:{render(draft:CreationDraftView,guest:GuestEditorPort):ReactNode}){
  const {me}=useAccount(),[record,setRecord]=useState<GuestEditorRecord|null>(null),recordRef=useRef(record),
    [persisted,setPersisted]=useState(true),persistedRef=useRef(true),
    [choosing,setChoosing]=useState(true),[canResume,setCanResume]=useState(false),[error,setError]=useState(''),[transferring,setTransferring]=useState(false),[attempt,setAttempt]=useState(0),
    transferStarted=useRef(false),queue=useRef(Promise.resolve()),urls=useRef(new Map<string,{blob:Blob;url:string}>());
  recordRef.current=record;
  useEffect(()=>{let active=true;void readGuestRecord().then(value=>{if(active){setRecord(value??newGuestRecord('demo'));setCanResume(Boolean(value));if(value?.handoff&&me)setChoosing(false);}})
    .catch(()=>{if(active){persistedRef.current=false;setPersisted(false);setRecord(newGuestRecord('demo'));setError('Le stockage de ce navigateur est indisponible. Gardez cet onglet ouvert pendant vos essais.');}});
    return()=>{active=false;};},[]);
  async function update(fn:(current:GuestEditorRecord)=>GuestEditorRecord){
    const task=queue.current.catch(()=>{}).then(async()=>{if(!recordRef.current)throw Error('Le projet n’est pas encore ouvert.');
      const next=fn(recordRef.current);try{await writeGuestRecord(next);persistedRef.current=true;setPersisted(true);}catch{persistedRef.current=false;setPersisted(false);
        setError('Le stockage local est indisponible. Vos retouches restent dans cet onglet ; gardez-le ouvert.');}
      recordRef.current=next;setRecord(next);});
    queue.current=task;await task;
  }
  useEffect(()=>{if(!record?.handoff||!me||transferStarted.current)return;if(me.role==='viewer'){setError('Votre accès Lecteur ne permet pas d’enregistrer un projet.');return;}
    transferStarted.current=true;setChoosing(false);setTransferring(true);setError('');
    void transferGuestEditor(record,me.agency.id,next=>update(()=>next)).then(id=>window.location.assign(`/editeur?draft=${encodeURIComponent(id)}`))
      .catch(cause=>{setError(cause instanceof Error?cause.message:'Le projet n’a pas pu être enregistré. Vos retouches restent sur cet appareil.');setTransferring(false);});
  },[record?.draft.id,record?.handoff,me?.agency.id,attempt]);
  // Blob URLs belong to this mounted editor. Never persist them: retain the
  // actual files in IndexedDB, and create fresh URLs after a page reload.
  for(const file of record?.files??[]){const old=urls.current.get(file.id);if(old?.blob!==file.blob){if(old)URL.revokeObjectURL(old.url);urls.current.set(file.id,{blob:file.blob,url:URL.createObjectURL(file.blob)});}}
  useEffect(()=>{const retained=new Set(record?.files.map(f=>f.id));for(const [id,value] of urls.current)if(!retained.has(id)){URL.revokeObjectURL(value.url);urls.current.delete(id);}},[record?.files]);
  useEffect(()=>()=>{for(const value of urls.current.values())URL.revokeObjectURL(value.url);urls.current.clear();},[]);
  async function choose(kind:'demo'|'empty'){
    const next=newGuestRecord(kind);try{await update(()=>next);setError('');}catch{recordRef.current=next;setRecord(next);setError('Le stockage local est indisponible. Vos retouches restent ouvertes dans cet onglet.');}
    setChoosing(false);
  }
  if(!record)return <p className="editor-guest-loading" role="status">Ouverture de l’Éditeur…</p>;
  const demo=editorDemo(),photoUrls=Object.fromEntries([...demo.media.map(asset=>[asset.id,demoAssetUrl(asset.id)]),...record.files.map(file=>[file.id,urls.current.get(file.id)!.url])]),
    voice=record.kind==='demo'?demo.voice:null,voiceUrls=Object.fromEntries(demo.voice?.clips.map(c=>[c.assetId,demoAssetUrl(c.assetId)])??[]);
  const port:GuestEditorPort={persisted,photoUrls,voice,voiceUrls,
    resources:guestResources,choose:()=>{setCanResume(true);setChoosing(true);},
    save:async draft=>update(current=>current.draft.id!==draft.id?current:({...current,draft,savedAt:Date.now()})),
    upload:async photo=>{const projectId=recordRef.current!.draft.id,result=await guestPhoto(photo.file,photo.id,photo.slot,projectId);
      await update(current=>{if(current.draft.id!==projectId)throw Error('Ce projet a été fermé.');if(current.draft.photos.some(p=>p.contentHash===result.asset.contentHash))throw Error('Cette photo est déjà présente.');
        const photos=current.files.filter(f=>f.id!==photo.id);if(photos.reduce((n,f)=>n+f.blob.size,0)+result.blob.size>65_000_000)throw Error('Les fichiers du projet dépassent 65 Mo. Retirez une photo ou une musique.');
        return {...current,files:[...photos,{id:photo.id,blob:result.blob}]};});return result.asset;},
    remove:async id=>update(current=>current.draft.id!==record.draft.id?current:({...current,files:current.files.filter(f=>f.id!==id),draft:{...current.draft,photos:current.draft.photos.filter(p=>p.id!==id)}})),
    music:async(id,wav)=>{const projectId=recordRef.current!.draft.id,metadata=await guestMusic(id,wav);await update(current=>{if(current.draft.id!==projectId)throw Error('Ce projet a été fermé.');if(current.files.length>=24||current.files.reduce((n,f)=>n+f.blob.size,0)+wav.size>65_000_000)throw Error('Le stockage du projet est plein. Enregistrez votre projet dans un compte pour continuer.');
      return {...current,files:[...current.files,{id,blob:wav}]};});return metadata;},
    connect:async()=>{await update(current=>({...current,handoff:true,connectionKey:current.handoff&&current.connectionKey?current.connectionKey:crypto.randomUUID(),savedAt:Date.now()}));
      if(!me&&!persistedRef.current)throw Error('Activez le stockage de votre navigateur puis réessayez, afin de conserver vos retouches pendant la connexion.');
      if(me){transferStarted.current=false;setAttempt(n=>n+1);}else window.location.assign('/connexion?next='+encodeURIComponent('/editeur?guest=1'));},
  };
  return <>
    {error&&<div className="editor-feedback" role="alert"><span>{error}</span>{me&&record.handoff?<button type="button" onClick={()=>{transferStarted.current=false;setAttempt(n=>n+1);}}>Réessayer le transfert</button>:<button type="button" aria-label="Fermer le message" onClick={()=>setError('')}><HomeIcon name="close" size={17}/></button>}</div>}
    {transferring&&<p className="editor-guest-loading" role="status">Enregistrement de vos photos, de vos animations et de vos pistes audio dans votre compte…</p>}
    <div className="editor-guest-content" inert={choosing||transferring}>{render(record.draft,port)}</div>
    {choosing&&<EditorProjectChoice onChoose={kind=>void choose(kind)} onClose={()=>setChoosing(false)}
      resumeLabel={canResume?'Reprendre mon projet sur cet appareil →':undefined}/>}
  </>;
}
