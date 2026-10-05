'use client';
import Link from 'next/link';
import {useSearchParams} from 'next/navigation';
import {useCallback,useEffect,useRef,useState,type ChangeEvent} from 'react';
import {CreationDraftView,CreationFields,VideoCustomization as VideoCustomizationSchema,DESCRIPTION_MAX_CHARACTERS,EntityId,GenerationCustomization,GenerationView,PhotoAsset,ManualListingInput,createEditorDocument,defaultVideoCustomization,
  editorClipStarts,editorFrames,generationCreditCost,selectedAnimationIndices,newEditorLayer,resizeEditorClip,resizeEditorDocument,frenchVoices,CustomNarration,editorMusicGain,editorMusicSourceFrame,editorQuality,defaultEditorMix,
  type CreationFields as Fields,type EditorMusicUpload,type EditorDocument,type EditorLayer,type VideoCustomization,type AgencyProfile} from '@bienvu/contracts';
import {suggestedNarration} from '@bienvu/narration/suggestion';
import {useAccount} from './account';
import {useGenerationStore} from './generation-store';
import {StudioSidebar} from './studio-sidebar';
import {HomeIcon} from './home-icons';
import {VoicePreview} from './voice-preview';
import {EditorPreview} from './editor-preview';
import {EditorInspector} from './editor-inspector';
import {EditorTimeline} from './editor-timeline';
import {EditorNumberInput} from './editor-number-input';
import {EditorVoicePlayback,useEditorVoice} from './editor-voice-playback';
import {EditorLibrary} from './workspace-library';
import {EditorCameraControls} from './editor-camera-controls';
import {EditorMusicLibrary} from './editor-music-library';
import {EditorMusicControls} from './editor-music-controls';
import {useEditorAudioGain} from './editor-audio-gain';
import {distributeEditorClips,editorResponse,editorMusicWav,editorMediaSourcesKey,type EditorResources} from '../lib/editor-client';
import {GuestEditor} from './guest-editor';
import {guestAgency} from '../lib/editor-demo';
import {type GuestEditorPort} from '../lib/editor-guest';

type Model={fields:Fields;settings:VideoCustomization&{editor:EditorDocument}};
type Selection={kind:'text'|'photo'|'music';id:string}|null;
type PendingPhoto={id:string;slot:number;file:File;preview:string;error:string;state:'uploading'|'failed'};
function normalizeSettings(settings:VideoCustomization&{editor:EditorDocument}){
  const photoOrder=[...new Set(settings.editor.clips.map(c=>c.photoSlot))];
  const runwayPhotos=settings.runwayPhotos??selectedAnimationIndices(photoOrder,settings).map(index=>photoOrder[index]);
  return {...settings,photoOrder,runwayClips:undefined,runwayPhotos:runwayPhotos.filter(slot=>photoOrder.includes(slot))};
}
function initialModel(draft:CreationDraftView,agency:AgencyProfile):Model{
  const settings=draft.data.videoCustomization??defaultVideoCustomization(agency),order=settings.photoOrder??draft.photos.map(p=>p.sourceOrder),
    photos=order.flatMap(slot=>draft.photos.filter(p=>p.sourceOrder===slot));
  const editor=settings.editor?distributeEditorClips(settings.editor,settings.editor.clips.filter(c=>draft.photos.some(p=>p.sourceOrder===c.photoSlot))):
    createEditorDocument(photos,draft.data.fields,{agencyName:agency.name,logo:Boolean(agency.logoAssetId)});
  return {fields:draft.data.fields,settings:normalizeSettings({...settings,editor})};
}
export function VideoEditor(){
  const params=useSearchParams(),{me,loading}=useAccount(),store=useGenerationStore(),
    [draft,setDraft]=useState<CreationDraftView|null>(null),[busy,setBusy]=useState(false),[error,setError]=useState(''),[retry,setRetry]=useState(0);
  const draftId=params.get('draft'),videoId=params.get('video');
  useEffect(()=>{setDraft(null);setError('');if(loading||!me||me.role==='viewer'||!draftId&&!videoId)return;
    const controller=new AbortController();setBusy(true);
    void (async()=>{try{
      if(!EntityId.safeParse(draftId??videoId).success)throw new Error('Ce projet est introuvable.');
      let response:Response;
      if(draftId)response=await fetch(`/api/imports/${encodeURIComponent(draftId)}/draft`,{cache:'no-store',signal:controller.signal});
      else{const storageKey=`bienvu:editor-copy:${me.agency.id}:${videoId}`;let key='';try{key=sessionStorage.getItem(storageKey)??'';}catch{}
        if(!/^[a-zA-Z0-9_-]{16,128}$/.test(key)){key=crypto.randomUUID();try{sessionStorage.setItem(storageKey,key);}catch{}}
        response=await fetch(`/api/generations/${encodeURIComponent(videoId!)}/edit`,{method:'POST',headers:{'Idempotency-Key':key},signal:controller.signal});
      }
      let value=CreationDraftView.parse(await editorResponse(response));if(controller.signal.aborted)return;
      if(value.data.videoCustomization?.editor&&!value.data.videoCustomization.voiceSourceId){
        value=CreationDraftView.parse(await editorResponse(await fetch(`/api/imports/${value.id}/voice-restore`,{method:'POST',signal:controller.signal})));}
      if(controller.signal.aborted)return;
      if(!value.data.videoCustomization?.editor&&me.role!=='viewer'){value=CreationDraftView.parse(await editorResponse(await fetch(`/api/imports/${value.id}/editor-template`,{method:'POST',signal:controller.signal})));}
      if(controller.signal.aborted)return;
      setDraft(value);if(videoId){window.history.replaceState(null,'',`/editeur?draft=${encodeURIComponent(value.id)}`);void store.refreshDrafts();}
    }catch(cause){if(!controller.signal.aborted)setError(cause instanceof Error?cause.message:'Le projet n’a pas pu être ouvert.');}
    finally{if(!controller.signal.aborted)setBusy(false);}})();return()=>controller.abort();
  },[me?.agency.id,loading,draftId,videoId,retry]);
  async function create(){setBusy(true);setError('');try{const value=CreationDraftView.parse(await editorResponse(await fetch('/api/imports/draft',{
    method:'POST',headers:{'Idempotency-Key':crypto.randomUUID()}})));window.location.assign(`/editeur?draft=${encodeURIComponent(value.id)}`);}
    catch(cause){setError(cause instanceof Error?cause.message:'La création du projet a échoué.');setBusy(false);}}
  return <div className="home-studio editor-shell"><a className="home-skip" href="#editor-content">Aller à l’Éditeur</a><StudioSidebar active="editor"/>
    <main className="editor-workspace" id="editor-content" tabIndex={-1}>
      {!loading&&(!me||params.get('guest')==='1')?<GuestEditor render={(initial,guest)=><EditorProject key={initial.id} initial={initial} agency={guestAgency()} guest={guest}/>}/>:draft&&me?<EditorProject key={`${me.agency.id}:${draft.id}`} initial={draft} agency={me.agency}/>:<section className="editor-start">
        <div className="editor-start-top"><Link href="/biens">← Mes biens</Link><a href="mailto:contact@bienvu.online">Aide</a></div>
        <span className="editor-eyebrow">VOTRE STUDIO DE MONTAGE</span><h1>Chaque détail<br/><em>fait la différence.</em></h1>
        <p>Vos photos, vos textes, votre rythme. Composez une vidéo qui vous ressemble.</p>
        {loading||busy?<p role="status">{videoId?'Préparation d’une version modifiable…':'Ouverture de votre projet…'}</p>:!me?<Link className="editor-primary" href={`/connexion?next=${encodeURIComponent(`/editeur${params.size?`?${params.toString()}`:''}`)}`}>Se connecter pour ouvrir l’Éditeur <HomeIcon name="arrow" size={20}/></Link>:me.role==='viewer'?<p>Votre accès Lecteur permet de consulter les vidéos de l’agence. <Link href="/biens">Ouvrir Mes biens →</Link></p>:<>
          <button className="editor-primary" type="button" onClick={()=>void create()}><HomeIcon name="plus" size={20}/>Nouveau projet</button>
          <div className="editor-project-list">{store.drafts.length>0&&<h2>Vos brouillons</h2>}{store.drafts.map(d=><Link key={d.id} href={`/editeur?draft=${d.id}`}>
            <span className="editor-project-thumb">{d.previewPhotoId?<img src={`/api/imports/${d.id}/photos/${d.previewPhotoId}`} alt=""/>:<HomeIcon name="pencil"/>}</span><span><strong>{d.title??'Votre annonce'}</strong><small>Brouillon{d.locality?` · ${d.locality}`:''}</small></span><HomeIcon name="arrow" size={18}/></Link>)}
            {store.jobs.some(j=>j.status==='ready'&&j.retention==='available')&&<h2>Retoucher une vidéo</h2>}{store.jobs.filter(j=>j.status==='ready'&&j.retention==='available').map(j=><Link key={j.id} href={`/editeur?video=${j.id}`}>
              <span className="editor-project-thumb"><img src={`/api/generations/${j.id}/source-photo`} alt=""/></span><span><strong>{j.title}</strong><small>Créer une nouvelle version</small></span><HomeIcon name="arrow" size={18}/></Link>)}
          </div></>}
        {error&&<p className="editor-error" role="alert">{error} <button type="button" onClick={()=>setRetry(n=>n+1)}>Réessayer</button></p>}
      </section>}
    </main></div>;
}

function EditorProject({initial,agency,guest}:{initial:CreationDraftView;agency:AgencyProfile;guest?:GuestEditorPort}){
  const {me,refreshRights}=useAccount(),store=useGenerationStore(),[draft,setDraft]=useState(initial),draftRef=useRef(initial),
    [model,setModel]=useState<Model>(()=>initialModel(initial,agency)),modelRef=useRef(model),
    saved=useRef(JSON.stringify({fields:initial.data.fields,settings:initial.data.videoCustomization})),
    [past,setPast]=useState<Model[]>([]),[future,setFuture]=useState<Model[]>([]),
    [selection,setSelection]=useState<Selection>(()=>({kind:'text',id:model.settings.editor.layers.find(l=>l.id==='facts')?.id??model.settings.editor.layers[0]?.id??''})),
    [tab,setTab]=useState<'photos'|'text'|'audio'>('photos'),[mobilePanel,setMobilePanel]=useState('preview'),[frame,setFrame]=useState(120),[playing,setPlaying]=useState(false),[zoom,setZoom]=useState(50),
    [saveState,setSaveState]=useState<'saved'|'saving'|'unsaved'|'error'>('unsaved'),[error,setError]=useState(''),[conflict,setConflict]=useState(false),conflictRef=useRef(false),
    [pending,setPending]=useState<PendingPhoto[]>([]),pendingRef=useRef<PendingPhoto[]>([]),uploads=useRef(new Map<string,AbortController>()),
    [musicBusy,setMusicBusy]=useState(false),[exporting,setExporting]=useState(false),[confirm,setConfirm]=useState(false),[rights,setRights]=useState(false),[previewIntent,setPreviewIntent]=useState(false),[fullPreview,setFullPreview]=useState<{version:number;job:GenerationView|null}|null>(null),[resources,setResources]=useState<EditorResources|null>(null),[resourcesError,setResourcesError]=useState(''),[resourcesAttempt,setResourcesAttempt]=useState(0),
    write=useRef<Promise<void>|null>(null),alive=useRef(true),photoInput=useRef<HTMLInputElement>(null),musicInput=useRef<HTMLInputElement>(null),audio=useRef<HTMLAudioElement>(null),dialog=useRef<HTMLDialogElement>(null);
  const photoUrl=(id:string)=>guest?guest.photoUrls[id]:`/api/imports/${draft.id}/photos/${id}`;
  const doc=model.settings.editor,total=editorFrames(doc),currentResources=guest?guest.resources(model.settings,draft.photos):resources?.sourceKey===editorMediaSourcesKey(model.settings,draft.photos)?resources:null,
    availableAnimations=currentResources?.availableAnimations??[],
    selectedAnimations=new Set(selectedAnimationIndices(model.settings.photoOrder??[],model.settings).map(index=>model.settings.photoOrder![index])),
    previewAnimations=availableAnimations.filter(a=>selectedAnimations.has(a.slot)),
    recoverableAnimations=availableAnimations.filter(a=>model.settings.photoOrder?.includes(a.slot)&&!model.settings.runwayPhotos?.includes(a.slot)),
    existingExport=fullPreview?.version===draft.version&&saveState==='saved'&&fullPreview.job&&fullPreview.job.status!=='failed'&&fullPreview.job.retention==='available'&&(fullPreview.job.expiresAt===null||Date.parse(fullPreview.job.expiresAt)>Date.now()),cost=existingExport?0:generationCreditCost(model.settings)-(currentResources?previewAnimations.length:0),selectedLayer=selection?.kind==='text'?doc.layers.find(l=>l.id===selection.id)??null:null,
    selectedClip=selection?.kind==='photo'?editorClipStarts(doc).find(c=>c.id===selection.id)??null:null,
    selectedClipLabel=previewAnimations.some(a=>a.slot===selectedClip?.photoSlot)?'Vidéo IA':'Photo';
  const restoredVoice=useEditorVoice(draft.id,model.settings,guest?.voice),voice=restoredVoice.voice;
  useEffect(()=>{if(guest)return;const controller=new AbortController();setResourcesError('');
    void fetch(`/api/imports/${draft.id}/editor-resources`,{signal:controller.signal}).then(r=>editorResponse<EditorResources>(r))
      .then(value=>{if(!controller.signal.aborted)setResources(value);})
      .catch(()=>{if(!controller.signal.aborted)setResourcesError('Les animations conservées n’ont pas pu être chargées.');});return()=>controller.abort();
  },[draft.id,draft.version,resourcesAttempt]);
  useEffect(()=>{if(guest||saveState!=='saved')return;let timer:ReturnType<typeof setTimeout>;const controller=new AbortController();
    const poll=()=>{void fetch(`/api/imports/${draft.id}/editor-preview`,{signal:controller.signal}).then(r=>editorResponse<{version:number;job:GenerationView|null}>(r)).then((value:{version:number;job:GenerationView|null})=>{
      if(controller.signal.aborted)return;setFullPreview(value);if(value.job&&!['ready','failed'].includes(value.job.status))timer=setTimeout(poll,2500);
    }).catch(()=>{});};poll();return()=>{controller.abort();clearTimeout(timer);};},[draft.id,draft.version,saveState,exporting]);
  modelRef.current=model;draftRef.current=draft;pendingRef.current=pending;conflictRef.current=conflict;
  const change=useCallback((fn:(before:Model)=>Model,remember=true)=>{const before=modelRef.current,next=fn(before);
    next.settings=normalizeSettings(next.settings);if(JSON.stringify(next)===JSON.stringify(before))return;
    if(remember){setPast(values=>[...values.slice(-49),before]);setFuture([]);}modelRef.current=next;setModel(next);setSaveState('unsaved');},[]);
  const checkpoint=()=>{setPast(values=>[...values.slice(-49),modelRef.current]);setFuture([]);};
  function changeDoc(editor:EditorDocument,remember=true){change(m=>({...m,settings:{...m.settings,editor}}),remember);}
  function restoreOriginalVoice(){if(!voice)return;setPlaying(false);change(m=>({...m,settings:{...m.settings,
    voice:voice.voice as VideoCustomization['voice'],narration:voice.clips.map(c=>c.text),editor:resizeEditorDocument(m.settings.editor,voice.durationSeconds)}}));}
  function patchLayer(patch:Partial<EditorLayer>){if(!selectedLayer)return;change(m=>({...m,settings:{...m.settings,editor:{...m.settings.editor,
    layers:m.settings.editor.layers.map(l=>l.id===selectedLayer.id?{...l,...patch}:l)}}}));}
  function undo(){const previous=past.at(-1);if(!previous)return;setPlaying(false);setPast(past.slice(0,-1));setFuture([modelRef.current,...future]);modelRef.current=previous;setModel(previous);setSaveState('unsaved');}
  function redo(){const next=future[0];if(!next)return;setPlaying(false);setPast([...past,modelRef.current]);setFuture(future.slice(1));modelRef.current=next;setModel(next);setSaveState('unsaved');}
  const save=useCallback(async()=>{
    if(write.current)return write.current;
    if(conflictRef.current)throw new Error('Rechargez le projet avant de l’enregistrer à nouveau.');
    const task=(async()=>{setSaveState('saving');
      try{for(let count=0;count<20;count++){
        const wanted=modelRef.current,serialized=JSON.stringify(wanted);if(serialized===saved.current)break;
        if(guest){const current=draftRef.current,next={...current,data:{...current.data,fields:wanted.fields,videoCustomization:wanted.settings}};
          await guest.save(next);if(!alive.current)return;const merged={...next,photos:draftRef.current.photos};draftRef.current=merged;setDraft(merged);saved.current=serialized;continue;}
        if(!CreationFields.safeParse(wanted.fields).success)throw new Error('Vérifiez le titre (3 caractères minimum), la ville (2 caractères minimum) et les valeurs numériques.');
        if(!VideoCustomizationSchema.safeParse(wanted.settings).success)throw new Error('Vérifiez les réglages et complétez chaque passage de la narration.');
        const current=draftRef.current,changes=Object.fromEntries(Object.entries(wanted.fields).filter(([key,value])=>current.data.fields[key as keyof Fields]!==value));
        const value=CreationDraftView.parse(await editorResponse(await fetch(`/api/imports/${current.id}/draft`,{method:'PATCH',headers:{'Content-Type':'application/json'},
          body:JSON.stringify({version:current.version,changes,confirm:[],videoCustomization:wanted.settings}),signal:AbortSignal.timeout(30_000)})));
        if(!alive.current)return;const next={...value,photos:draftRef.current.photos};draftRef.current=next;setDraft(next);saved.current=serialized;
      }
      if(alive.current)setSaveState(JSON.stringify(modelRef.current)===saved.current?'saved':'unsaved');
      }catch(cause){if(alive.current){setSaveState('error');if((cause as Error&{code?:string}).code==='CONFLICT')setConflict(true);
        setError((cause as Error&{code?:string}).code==='CONFLICT'?'Ce projet a changé dans un autre onglet. Vos retouches restent ici ; rechargez le projet pour repartir de sa dernière version.':cause instanceof Error?cause.message:'L’enregistrement a échoué.');}throw cause;}
    })();write.current=task;try{await task;}finally{write.current=null;}
  },[]);
  useEffect(()=>{if(conflict||!guest&&!CreationFields.safeParse(model.fields).success||!VideoCustomizationSchema.safeParse(model.settings).success)return;
    const timer=setTimeout(()=>void save().catch(()=>{}),800);return()=>clearTimeout(timer);},[model,conflict,save]);
  useEffect(()=>{alive.current=true;return()=>{alive.current=false;for(const controller of uploads.current.values())controller.abort();
    for(const photo of pendingRef.current)URL.revokeObjectURL(photo.preview);};},[]);
  useEffect(()=>{const unload=(e:BeforeUnloadEvent)=>{if(JSON.stringify(modelRef.current)!==saved.current||uploads.current.size||musicBusy){e.preventDefault();e.returnValue='';}};
    window.addEventListener('beforeunload',unload);return()=>window.removeEventListener('beforeunload',unload);},[musicBusy]);
  useEffect(()=>{const navigate=(event:MouseEvent)=>{
    if(event.button!==0||event.metaKey||event.ctrlKey||event.shiftKey||event.altKey)return;
    const link=(event.target as HTMLElement)?.closest<HTMLAnchorElement>('a[href]');
    if(!link||link.target==='_blank'||link.hasAttribute('download'))return;
    const target=new URL(link.href,window.location.href);
    if(target.origin!==window.location.origin||target.href===window.location.href)return;
    if(JSON.stringify(modelRef.current)===saved.current&&!uploads.current.size&&!musicBusy)return;
    event.preventDefault();
    if(uploads.current.size||musicBusy){setError('Attendez la fin de l’import avant de quitter le projet.');return;}
    void save().then(()=>window.location.assign(target.href)).catch(()=>{});
  };document.addEventListener('click',navigate,true);return()=>document.removeEventListener('click',navigate,true);},[save,musicBusy]);
  useEffect(()=>{if(!playing)return;const from=frame,start=performance.now();let handle=0;
    const tick=(now:number)=>{const next=from+Math.floor((now-start)*30/1000);if(next>=total){setFrame(total-1);setPlaying(false);return;}setFrame(next);handle=requestAnimationFrame(tick);};
    handle=requestAnimationFrame(tick);return()=>cancelAnimationFrame(handle);},[playing,total]);
  useEffect(()=>{setFrame(current=>Math.min(current,total-1));},[total]);
  const musicUrl=doc.music?(guest?guest.photoUrls[doc.music.assetId]:`/api/imports/${draft.id}/music/${doc.music.assetId}`):undefined;
  useEffect(()=>{if(guest||!musicUrl||doc.music?.waveform)return;const controller=new AbortController();
    void fetch(musicUrl+'?metadata=1',{signal:controller.signal,cache:'no-store'}).then(r=>editorResponse<EditorMusicUpload>(r)).then(value=>{
      if(controller.signal.aborted)return;change(m=>{const music=m.settings.editor.music;if(!music||music.assetId!==value.assetId||music.waveform)return m;
        return {...m,settings:{...m.settings,editor:{...m.settings.editor,music:{...music,waveform:value.waveform}}}};},false);
    }).catch(()=>{});return()=>controller.abort();},[musicUrl,Boolean(doc.music?.waveform),change]);
  useEditorAudioGain(audio,editorMusicGain(doc,frame,voice?.clips),playing,musicUrl??'none');
  useEffect(()=>{const player=audio.current,music=doc.music;if(!player||!music)return;
    let active=true;const sync=()=>{const sourceFrame=editorMusicSourceFrame(doc,frame),audible=playing&&sourceFrame!==null&&music.volume>0;
      if(!audible){player.pause();return;}const elapsed=sourceFrame!/30;if(player.readyState>0&&Math.abs(player.currentTime-elapsed)>.25)player.currentTime=Math.max(0,elapsed);
      if(player.paused)void player.play().catch((cause:unknown)=>{if(active&&(cause as {name?:string})?.name!=='AbortError')setError('La musique ne peut pas être lue pour le moment. Relancez l’aperçu.');});
    };sync();player.addEventListener('loadedmetadata',sync);return()=>{active=false;player.removeEventListener('loadedmetadata',sync);};
  },[frame,playing,doc.music,musicUrl]);
  useEffect(()=>{if(!confirm)return;setPlaying(false);dialog.current?.showModal();return()=>dialog.current?.close();},[confirm]);
  function seek(at:number){setPlaying(false);setFrame(Math.max(0,Math.min(total-1,at)));}
  function addLayer(text:string,kind:EditorLayer['kind']='text'){
    if(doc.layers.length>=16){setError('La vidéo peut contenir jusqu’à 16 textes et logos.');return;}
    const layer=newEditorLayer(crypto.randomUUID(),text,total,kind);layer.startFrame=Math.min(frame,total-15);layer.durationFrames=total-layer.startFrame;
    changeDoc({...doc,layers:[...doc.layers,layer]});setSelection({kind:'text',id:layer.id});setPlaying(false);setFrame(Math.min(total-1,layer.startFrame+12));
  }
  function addClip(slot:number,index=doc.clips.length){if(doc.clips.length>=24){setError('La timeline peut contenir jusqu’à 24 plans.');return;}
    const clip={id:crypto.randomUUID(),photoSlot:slot,durationFrames:Math.floor(total/Math.max(1,doc.clips.length+1))},clips=[...doc.clips];
    clips.splice(index,0,clip);const next=distributeEditorClips(doc,clips);changeDoc(next);setSelection({kind:'photo',id:clip.id});seek(editorClipStarts(next).find(c=>c.id===clip.id)!.startFrame);
  }
  async function uploadPhoto(photo:PendingPhoto){if(uploads.current.has(photo.id))return;
    const controller=new AbortController();uploads.current.set(photo.id,controller);setPending(values=>values.map(p=>p.id===photo.id?{...p,state:'uploading',error:''}:p));
    try{const uploaded=guest?await guest.upload(photo):PhotoAsset.parse((await editorResponse<{photo:unknown}>(await fetch(`/api/imports/${draft.id}/uploads/${photo.slot}`,{method:'PUT',headers:{'Content-Type':photo.file.type,'X-Upload-ID':photo.id},body:photo.file,signal:controller.signal}))).photo);
      if(controller.signal.aborted||!alive.current)return;
      // Uploads change the private media journal, not the field version. Merge
      // the acknowledged photo so concurrent saves cannot restore an old row.
      const current=draftRef.current,value={...current,photos:[...current.photos.filter(p=>p.id!==uploaded.id),uploaded].sort((a,b)=>a.sourceOrder-b.sourceOrder)};
      draftRef.current=value;setDraft(value);setPending(values=>values.filter(p=>p.id!==photo.id));URL.revokeObjectURL(photo.preview);
      const before=modelRef.current;
      if(!before.settings.editor.clips.some(c=>c.photoSlot===uploaded.sourceOrder))change(m=>({...m,settings:{...m.settings,editor:distributeEditorClips(m.settings.editor,
        [...m.settings.editor.clips,{id:crypto.randomUUID(),photoSlot:uploaded.sourceOrder,durationFrames:Math.floor(editorFrames(m.settings.editor)/(m.settings.editor.clips.length+1))}])}}));
    }catch(cause){if(!controller.signal.aborted&&alive.current)setPending(values=>values.map(p=>p.id===photo.id?{...p,state:'failed',error:cause instanceof Error?cause.message:'L’envoi a échoué.'}:p));}
    finally{uploads.current.delete(photo.id);}
  }
  function choosePhotos(files:FileList|null){if(!files)return;setError('');
    const used=new Set([...draftRef.current.photos.map(p=>p.sourceOrder),...pendingRef.current.map(p=>p.slot)]),added:PendingPhoto[]=[];
    for(const file of [...files]){if(!['image/jpeg','image/png','image/webp'].includes(file.type)||file.size>10*1024*1024){setError('Utilisez des photos JPG, PNG ou WebP de moins de 10 Mo.');continue;}
      const slot=Array.from({length:12},(_,i)=>i).find(slot=>!used.has(slot));if(slot===undefined){setError('Vous pouvez importer jusqu’à 12 photos.');break;}
      used.add(slot);added.push({id:crypto.randomUUID(),slot,file,preview:URL.createObjectURL(file),error:'',state:'uploading'});
    }
    pendingRef.current=[...pendingRef.current,...added];setPending(values=>[...values,...added]);for(const photo of added)void uploadPhoto(photo);
  }
  async function removePhoto(id:string,slot:number){uploads.current.get(id)?.abort();setError('');
    try{if(guest)await guest.remove(id);else await editorResponse(await fetch(`/api/imports/${draft.id}/uploads/${slot}`,{method:'DELETE',headers:{'X-Upload-ID':id}}));
      const item=pendingRef.current.find(p=>p.id===id);if(item)URL.revokeObjectURL(item.preview);setPending(values=>values.filter(p=>p.id!==id));
      const value={...draftRef.current,photos:draftRef.current.photos.filter(photo=>photo.id!==id)};draftRef.current=value;setDraft(value);
      change(m=>({...m,settings:{...m.settings,editor:distributeEditorClips(m.settings.editor,m.settings.editor.clips.filter(c=>c.photoSlot!==slot))}}));
      setPast([]);setFuture([]);setSelection(null);
    }catch(cause){setError(cause instanceof Error?cause.message:'La photo n’a pas pu être retirée.');}
  }
  async function chooseMusic(event:ChangeEvent<HTMLInputElement>){const file=event.target.files?.[0];event.target.value='';if(!file)return;
    if(musicBusy)return;setPlaying(false);setMusicBusy(true);setError('');try{const wav=await editorMusicWav(file),id=crypto.randomUUID(),value=guest?await guest.music(id,wav):await editorResponse<EditorMusicUpload>(await fetch(`/api/imports/${draft.id}/music/${id}`,{
      method:'PUT',headers:{'Content-Type':'audio/wav'},body:wav}));installMusic(value,file.name.slice(0,100),0);
    }catch(cause){setError(cause instanceof Error?cause.message:'La musique n’a pas pu être importée.');}finally{setMusicBusy(false);}
  }
  function installMusic(value:EditorMusicUpload,name:string,startFrame:number){change(m=>{const editor=m.settings.editor,start=Math.max(0,Math.min(editor.durationSeconds*30-15,startFrame)),length=editor.durationSeconds*30-start;
    return {...m,settings:{...m.settings,editor:{...editor,music:{...value,name,volume:.15,startFrame:start,trimFromFrame:0,
      durationFrames:length,loop:Math.floor(value.durationMs*30/1000)<length}}}};});setSelection({kind:'music',id:value.assetId});}
  async function addLibraryMusic(id:string,startFrame=0){if(guest){setError('Connectez-vous pour utiliser la banque de musiques. Vous pouvez déjà importer votre propre piste.');return;}if(musicBusy)return;setPlaying(false);setMusicBusy(true);setError('');try{
    const value=await editorResponse<EditorMusicUpload&{name:string}>(await fetch(`/api/imports/${draft.id}/music/from-library`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({musicId:id})}));
    installMusic(value,value.name,startFrame);
  }catch(cause){setError(cause instanceof Error?cause.message:'La musique n’a pas pu être ajoutée.');}finally{setMusicBusy(false);}}
  async function exportVideo(){if(!me||!rights||exporting)return;setExporting(true);setError('');
    try{await save();const current=draftRef.current,settings=modelRef.current.settings,body={version:current.version,confirmed:true},
        storageKey=`bienvu:editor-export:${agency.id}:${draft.id}`;let previous:{version:number;key:string}|null=null;
      try{previous=JSON.parse(sessionStorage.getItem(storageKey)??'null');}catch{}
      const key=previous?.version===body.version?previous.key:crypto.randomUUID();try{sessionStorage.setItem(storageKey,JSON.stringify({version:body.version,key}));}catch{}
      if(!GenerationCustomization.safeParse(settings).success)throw new Error('Sélectionnez au moins trois photos et vérifiez la narration.');
      const job=GenerationView.parse(await editorResponse(await fetch(`/api/imports/${draft.id}/editor-export`,{method:'POST',headers:{'Content-Type':'application/json','Idempotency-Key':key},body:JSON.stringify(body)})));
      store.setJob(job,agency.id);void refreshRights();try{sessionStorage.removeItem(storageKey);}catch{}
      if(previewIntent){setFullPreview({version:current.version,job});setConfirm(false);setExporting(false);setPlaying(false);}else window.location.assign(`/historique/${job.id}`);
    }catch(cause){setError(cause instanceof Error?cause.message:'L’export n’a pas pu démarrer.');setConfirm(false);setExporting(false);}
  }
  async function leave(){setError('');if(uploads.current.size||musicBusy){setError('Attendez la fin de l’import avant de quitter le projet.');return;}
    try{await save();window.location.assign(guest?'/':'/biens');}catch{}}
  async function connect(){if(!guest)return;setPlaying(false);setError('');if(uploads.current.size||musicBusy){setError('Attendez la fin de l’import avant de vous connecter.');return;}
    try{await save();await guest.connect();}catch(cause){setError(cause instanceof Error?cause.message:'Votre projet n’a pas pu être conservé. Gardez cet onglet ouvert et réessayez.');}}
  const fieldsValid=ManualListingInput.safeParse({...model.fields,description:model.fields.description??'',photos:draft.photos.map(p=>({hash:p.contentHash,size:p.sizeBytes,mime:p.mime}))});
  const quality=editorQuality(doc,draft.photos,restoredVoice.reusable?voice:null,model.settings.narration);
  function inspectIssue(issue:typeof quality[number]){setConfirm(false);setPlaying(false);setTab(issue.kind==='audio'?'audio':issue.kind==='photo'?'photos':'text');setMobilePanel('media');
    if(issue.targetId){setSelection({kind:issue.kind==='photo'?'photo':'text',id:issue.targetId});const layer=doc.layers.find(l=>l.id===issue.targetId),clip=editorClipStarts(doc).find(c=>c.id===issue.targetId);seek(layer?.startFrame??clip?.startFrame??0);}}
  const canExport=fieldsValid.success&&GenerationCustomization.safeParse(model.settings).success&&Boolean(model.fields.title&&model.fields.locality&&model.fields.propertyType&&model.fields.transaction)&&
    !pending.length&&!musicBusy&&!conflict&&!exporting&&doc.clips.every(c=>draft.photos.some(p=>p.sourceOrder===c.photoSlot));
  const setField=(name:keyof Fields,value:Fields[keyof Fields])=>change(m=>({...m,fields:{...m.fields,[name]:value,...(name==='transaction'?{priceCents:null,charges:null}:{})}}));
  return <div className="editor-project" data-mobile-panel={mobilePanel}>
    <header className="editor-header"><button type="button" className="editor-back" onClick={()=>void leave()}><HomeIcon name="arrow" size={20}/>{guest?'Retour au studio':'Mes biens'}</button>
      <div className="editor-project-title"><strong>{model.fields.title??'Nouveau projet'}</strong><span role="status" className={`editor-save is-${saveState}`}><i/>{saveState==='saved'?(guest?guest.persisted?'Sur cet appareil':'Onglet uniquement':'Enregistré'):saveState==='saving'?'Enregistrement…':saveState==='error'?'Non enregistré':'Modifications en cours'}</span></div>
      <div className="editor-header-actions"><button type="button" aria-label="Annuler la dernière modification" disabled={!past.length||exporting} onClick={undo}><HomeIcon name="undo" size={20}/></button><button type="button" aria-label="Rétablir la modification" disabled={!future.length||exporting} onClick={redo}><HomeIcon name="redo" size={20}/></button>
        <button type="button" className="editor-preview-button" onClick={()=>{if(frame>=total-1)setFrame(0);setPlaying(v=>!v);}}><HomeIcon name="play" size={18}/>Prévisualiser</button>
        {!guest&&<button type="button" className="editor-preview-button" disabled={!canExport} onClick={()=>{setPreviewIntent(true);setRights(false);setConfirm(true);}}>Aperçu complet</button>}
        <button type="button" className="editor-primary" disabled={!canExport} onClick={()=>{if(guest){void connect();return;}setPreviewIntent(false);setRights(false);setConfirm(true);}}>{guest?'Enregistrer et exporter':'Exporter la vidéo'} <HomeIcon name="arrow" size={19}/></button></div>
    </header>
    {guest&&<div className="editor-guest-banner"><span>Essai de l’Éditeur · vos retouches restent {guest.persisted?'sur cet appareil.':'dans cet onglet.'}</span><div><button type="button" disabled={Boolean(pending.length||musicBusy)} onClick={()=>{setPlaying(false);void save().then(()=>guest.choose()).catch(()=>{});}}>Changer de projet</button><button type="button" onClick={()=>void connect()}>{me?'Enregistrer dans mon compte':'Se connecter pour enregistrer'} <HomeIcon name="arrow" size={15}/></button></div></div>}
    <nav className="editor-mobile-panels" aria-label="Panneaux de l’Éditeur">{[['preview','Aperçu'],['media','Médias'],['settings','Réglages'],['timeline','Timeline']].map(([value,label])=><button type="button" key={value} aria-pressed={mobilePanel===value} onClick={()=>setMobilePanel(value)}>{label}</button>)}</nav>
    {error&&<div className="editor-feedback" role="alert"><span>{error}</span>{conflict?<button type="button" onClick={()=>window.location.reload()}>Recharger le projet</button>:saveState==='error'?<button type="button" onClick={()=>{setError('');void save().catch(()=>{});}}>Réessayer l’enregistrement</button>:<button type="button" aria-label="Fermer le message" onClick={()=>setError('')}><HomeIcon name="close" size={17}/></button>}</div>}
    {!guest&&<EditorLibrary draft={draft} agency={agency} save={async()=>{await save();return draftRef.current;}} onApply={settings=>{if(settings.editor)change(m=>({...m,settings:{...settings,editor:settings.editor!}}));}}/>}
    <details className="editor-quality"><summary>Contrôle avant export · {quality.length?`${quality.length} point(s) à vérifier`:'aucun problème détecté'}</summary><p>Contrôle de cadrage, de résolution et d’équilibre audio. Vérifiez aussi l’aperçu à l’œil et à l’écoute.</p>{quality.map(issue=><button type="button" key={issue.id} onClick={()=>inspectIssue(issue)}>{issue.message} <span>Vérifier →</span></button>)}</details>
    {fullPreview?.job&&fullPreview.version===draft.version&&saveState==='saved'&&<details className="editor-complete-preview" open><summary>Aperçu complet · {fullPreview.job.status==='ready'?'prêt':fullPreview.job.status==='failed'?'interrompu':'préparation en cours'}</summary>{fullPreview.job.videoUrl?<><video src={fullPreview.job.videoUrl} controls playsInline preload="metadata"/><a href={fullPreview.job.downloadUrl??`/historique/${fullPreview.job.id}`}>Télécharger cet export</a><p>Ce fichier est l’export final. Le télécharger à nouveau ne consomme aucun crédit.</p></>:<p role="status">{fullPreview.job.status==='failed'?'La préparation a échoué. Retrouvez le détail dans Mes biens.':`Création du montage : ${fullPreview.job.progressPercent} %`}</p>}<a href={`/historique/${fullPreview.job.id}`}>Voir le suivi</a></details>}
    <div className="editor-main">
      <aside className="editor-media" aria-label="Médias du projet"><h2>Médias</h2><div className="editor-media-tabs" role="tablist" aria-label="Types de médias">{(['photos','text','audio'] as const).map((value,i)=><button key={value} type="button" role="tab" aria-selected={tab===value} aria-controls={`editor-media-${value}`} id={`editor-tab-${value}`} onClick={()=>setTab(value)}>{['Photos','Texte','Audio'][i]}</button>)}</div>
        <div role="tabpanel" id={`editor-media-${tab}`} aria-labelledby={`editor-tab-${tab}`}>
        {tab==='photos'?<><button type="button" className="editor-import" disabled={draft.photos.length+pending.length>=12} onClick={()=>photoInput.current?.click()}><HomeIcon name="plus" size={23}/>Importer des photos</button>
          <input type="file" ref={photoInput} accept="image/jpeg,image/png,image/webp" multiple hidden onChange={e=>{choosePhotos(e.target.files);e.target.value='';}}/>
          <div className="editor-media-grid" onDragOver={e=>{if(e.dataTransfer.types.includes('Files'))e.preventDefault();}} onDrop={e=>{if(e.dataTransfer.files.length){e.preventDefault();choosePhotos(e.dataTransfer.files);}}}>
            {draft.photos.map(photo=>{const at=doc.clips.findIndex(c=>c.photoSlot===photo.sourceOrder),clip=doc.clips[at];return <div className={`editor-media-photo${clip&&selection?.id===clip.id?' is-selected':''}`} key={photo.id}>
              <button type="button" draggable onDragStart={e=>{e.dataTransfer.setData('application/x-bienvu-photo',String(photo.sourceOrder));e.dataTransfer.effectAllowed='copy';}}
                aria-label={`Photo ${photo.sourceOrder+1}${at>=0?', présente dans la vidéo':', ajouter à la vidéo'}`} onClick={()=>{if(clip){setSelection({kind:'photo',id:clip.id});seek(editorClipStarts(doc)[at].startFrame);}else addClip(photo.sourceOrder);}}>
                <img src={photoUrl(photo.id)} alt={`Photo ${photo.sourceOrder+1} du bien`} draggable={false}/>{at>=0&&<span className="editor-photo-number">{at+1}</span>}</button>
              <button type="button" className="editor-media-remove" aria-label={`Retirer la photo ${photo.sourceOrder+1}`} onClick={()=>void removePhoto(photo.id,photo.sourceOrder)}><HomeIcon name="close" size={13}/></button>
            </div>;})}
            {pending.map(photo=><div className="editor-media-photo editor-photo-pending" key={photo.id}><img src={photo.preview} alt="Photo en cours d’import"/><span role="status">{photo.state==='uploading'?'Envoi…':'Envoi interrompu'}</span>
              <button className="editor-media-remove" type="button" aria-label="Retirer cette photo" onClick={()=>void removePhoto(photo.id,photo.slot)}><HomeIcon name="close" size={13}/></button>
              {photo.error&&<p>{photo.error}<button type="button" onClick={()=>void uploadPhoto(photo)}>Réessayer</button></p>}</div>)}
          </div><p className="editor-media-hint">Glissez vos photos dans la timeline.<br/>{draft.photos.length} / 12 photos importées.</p>
          {resourcesError&&<p className="editor-error" role="alert">{resourcesError} <button type="button" onClick={()=>setResourcesAttempt(n=>n+1)}>Réessayer</button></p>}
          {recoverableAnimations.length>0&&<div className="editor-restored-voice"><p>{recoverableAnimations.length} animation{recoverableAnimations.length>1?'s':''} déjà créée{recoverableAnimations.length>1?'s':''} disponible{recoverableAnimations.length>1?'s':''} pour ces photos, sans supplément de crédits.</p>
            <button type="button" onClick={()=>change(m=>({...m,settings:{...m.settings,runwayPhotos:[...new Set([...(m.settings.runwayPhotos??[]),...recoverableAnimations.map(a=>a.slot)])]}}))}>Réutiliser les animations conservées</button></div>}
          <label className="editor-check"><input type="checkbox" checked={model.settings.photoMotion} onChange={e=>change(m=>({...m,settings:{...m.settings,photoMotion:e.target.checked}}))}/>Mouvements de caméra</label>
          <label>Transition<select value={model.settings.transition} onChange={e=>change(m=>({...m,settings:{...m.settings,transition:e.target.value as 'fade'|'cut'}}))}><option value="fade">Fondu doux</option><option value="cut">Coupe directe</option></select></label>
        </>:tab==='text'?<>
          <div className="editor-text-list">{doc.layers.map(layer=><button type="button" key={layer.id} onClick={()=>{setSelection({kind:'text',id:layer.id});seek(layer.startFrame+Math.min(12,layer.durationFrames-1));}}><span>{layer.kind==='logo'?'Logo de l’agence':layer.text||'Nouveau texte'}</span><HomeIcon name="pencil" size={15}/></button>)}</div>
          <details className="editor-property" open={!model.fields.title||!model.fields.locality}><summary>Informations du bien</summary>
            <label>Titre<input value={model.fields.title??''} maxLength={200} onChange={e=>setField('title',e.target.value||null)}/></label>
            <label>Ville<input value={model.fields.locality??''} maxLength={200} onChange={e=>setField('locality',e.target.value||null)}/></label>
            <div className="editor-field-pair"><label>Bien<select value={model.fields.propertyType??''} onChange={e=>setField('propertyType',e.target.value as Fields['propertyType'])}><option value="">Choisir</option><option value="apartment">Appartement</option><option value="house">Maison</option><option value="other">Autre</option></select></label>
              <label>Transaction<select value={model.fields.transaction??''} onChange={e=>setField('transaction',e.target.value as Fields['transaction'])}><option value="">Choisir</option><option value="sale">Vente</option><option value="rent">Location</option></select></label></div>
            <label>{model.fields.transaction==='rent'?'Loyer mensuel (€)':'Prix (€)'}<input type="number" min={1} value={model.fields.priceCents===null?'':model.fields.priceCents/100} onChange={e=>setField('priceCents',e.target.value?Math.round(Number(e.target.value)*100):null)}/></label>
            {model.fields.transaction==='rent'&&<label>Charges<select value={model.fields.charges??''} onChange={e=>setField('charges',e.target.value as Fields['charges'])}><option value="">Préciser</option><option value="included">Comprises</option><option value="excluded">Non comprises</option></select></label>}
            <div className="editor-field-pair"><label>Surface (m²)<input type="number" min={.01} max={100000} step={.01} value={model.fields.area??''} onChange={e=>setField('area',e.target.value?Number(e.target.value):null)}/></label>
              <label>Pièces<input type="number" min={1} max={100} value={model.fields.rooms??''} onChange={e=>setField('rooms',e.target.value?Number(e.target.value):null)}/></label></div>
            <label>Description<textarea rows={5} maxLength={DESCRIPTION_MAX_CHARACTERS} value={model.fields.description??''} onChange={e=>setField('description',e.target.value||null)}/></label>
            {!CreationFields.safeParse(model.fields).success&&<p className="editor-error">Vérifiez le titre (3 caractères), la ville (2 caractères) et les valeurs numériques pour enregistrer.</p>}
          </details>
        </>:<>
          {!guest&&<EditorMusicLibrary busy={musicBusy} playing={playing} onAdd={addLibraryMusic} onPreview={()=>setPlaying(false)}/>}
          <h3>Votre musique</h3><button type="button" className="editor-import" disabled={musicBusy} onClick={()=>musicInput.current?.click()}><HomeIcon name="upload" size={17}/>{musicBusy?'Préparation…':doc.music?'Importer une autre musique':'Importer une musique'}</button>
          <input type="file" ref={musicInput} hidden accept="audio/*,video/mp4,video/webm,video/quicktime" onChange={e=>void chooseMusic(e)}/><p className="editor-media-hint">Audio ou vidéo avec une piste audio · 50 Mo · 5 minutes maximum. Le morceau complet est conservé pour choisir votre passage.</p>
          {doc.music&&<EditorMusicControls doc={doc} onChange={changeDoc}/>}
          <details className="editor-audio-settings"><summary>Voix, sous-titres et mixage</summary>
          <label className="editor-check"><input type="checkbox" checked={doc.voiceEnabled} onChange={e=>changeDoc({...doc,voiceEnabled:e.target.checked,subtitlesEnabled:e.target.checked?doc.subtitlesEnabled:false})}/>Activer la voix off</label>
          <label>Voix<select disabled={!doc.voiceEnabled} value={model.settings.voice} onChange={e=>change(m=>({...m,settings:{...m.settings,voice:e.target.value as VideoCustomization['voice']}}))}>{frenchVoices.map(voice=><option value={voice.id} key={voice.id}>{voice.name} · {voice.provider}</option>)}</select></label>
          <VoicePreview voice={model.settings.voice} disabled={!doc.voiceEnabled||playing}/>
          {restoredVoice.loading&&<p className="editor-media-hint" role="status">Chargement de la voix d’origine…</p>}
          {restoredVoice.error&&<p className="editor-error" role="alert">{restoredVoice.error} <button type="button" onClick={restoredVoice.retry}>Réessayer</button></p>}
          {voice&&<div className="editor-restored-voice"><p>{!doc.voiceEnabled?'La voix off est désactivée. Sa piste d’origine reste disponible dans la timeline.':restoredVoice.reusable?'La voix d’origine est placée dans la timeline. Elle sera conservée à l’export.':'La piste d’origine reste visible et écoutable. Vos changements de voix, de narration ou de durée créeront une nouvelle voix à l’export.'}</p>
            {!restoredVoice.reusable&&<button type="button" onClick={restoreOriginalVoice}>Reprendre la voix d’origine</button>}</div>}
          <label className="editor-check"><input type="checkbox" disabled={!doc.voiceEnabled} checked={doc.subtitlesEnabled} onChange={e=>changeDoc({...doc,subtitlesEnabled:e.target.checked})}/>Afficher les sous-titres</label>
          <label>Volume de la voix ({Math.round(doc.voiceVolume*100)} %)<input type="range" disabled={!doc.voiceEnabled} min={5} max={100} value={doc.voiceVolume*100} onChange={e=>changeDoc({...doc,voiceVolume:Number(e.target.value)/100})}/></label>
          <fieldset className="editor-mix-controls"><legend>Mixage automatique</legend>
            <label className="editor-check"><input type="checkbox" checked={doc.audioMix?.normalize??false} onChange={e=>changeDoc({...doc,audioMix:{...defaultEditorMix,...doc.audioMix,normalize:e.target.checked}})}/>Harmoniser les volumes</label>
            <label className="editor-check"><input type="checkbox" checked={doc.audioMix?.ducking??false} onChange={e=>changeDoc({...doc,audioMix:{...defaultEditorMix,...doc.audioMix,ducking:e.target.checked}})}/>Baisser la musique pendant la voix</label>
            {doc.audioMix?.ducking&&<label>Niveau de musique pendant la voix ({Math.round(doc.audioMix.duckLevel*100)} %)<input type="range" min={5} max={80} value={doc.audioMix.duckLevel*100} onChange={e=>changeDoc({...doc,audioMix:{...doc.audioMix!,duckLevel:Number(e.target.value)/100}})}/></label>}
            <div className="editor-field-pair">{(['fadeInFrames','fadeOutFrames'] as const).map((key,i)=><label key={key}>{i?'Fondu de fin (s)':'Fondu de début (s)'}<EditorNumberInput label={i?'Fondu de fin':'Fondu de début'} min={0} max={3} step={.1} value={(doc.audioMix?.[key]??(i?18:12))/30} onValue={value=>changeDoc({...doc,audioMix:{...defaultEditorMix,...doc.audioMix,[key]:Math.round(value*30)}})}/></label>)}</div>
          </fieldset>
          <details className="editor-narration"><summary>Votre narration</summary><p>{voice?'Texte de la voix déjà générée. Le modifier créera une nouvelle piste à l’export.':'Rédaction automatique à partir de la description, ou texte personnalisé.'}</p>
            {(model.settings.narration??[]).map((line,i)=> <label key={i}>{i===0?'Ouverture':i===model.settings.narration!.length-1?'Conclusion':`Passage ${i+1}`}<textarea rows={3} maxLength={500} value={line} onChange={e=>change(m=>({...m,settings:{...m.settings,narration:m.settings.narration!.map((t,j)=>i===j?e.target.value:t)}}))}/></label>)}
            {model.settings.narration&&!CustomNarration.safeParse(model.settings.narration).success&&<p className="editor-error">{CustomNarration.safeParse(model.settings.narration).error?.issues[0]?.message}</p>}
            <button type="button" onClick={()=>change(m=>({...m,settings:{...m.settings,narration:m.settings.narration?undefined:suggestedNarration({propertyType:m.fields.propertyType??'other',transaction:m.fields.transaction??'sale',locality:m.fields.locality??'',description:m.fields.description??'',
              priceCents:m.fields.priceCents===null?'':String(m.fields.priceCents/100),area:m.fields.area===null?'':String(m.fields.area),rooms:m.fields.rooms===null?'':String(m.fields.rooms),charges:m.fields.charges??''},agency.name,doc.durationSeconds)}}))}>{model.settings.narration?'Reprendre la rédaction automatique':'Modifier la narration'}</button>
          </details>
          </details>
        </>}
        </div><div className="editor-add"><h3>Ajouter à la vidéo</h3><div><button type="button" disabled={doc.layers.length>=16} onClick={()=>addLayer(model.fields.title??'Votre titre')}><b>T</b>Titre</button>
          <button type="button" disabled={doc.layers.length>=16} onClick={()=>addLayer([model.fields.area?`${model.fields.area} m²`:'',model.fields.rooms?`${model.fields.rooms} pièces`:''].filter(Boolean).join(' · ')||'Informations du bien')}><HomeIcon name="document" size={19}/>Informations<br/>du bien</button>
          <button type="button" disabled={!agency.logoAssetId||doc.layers.length>=16} onClick={()=>addLayer('Logo de l’agence','logo')}><HomeIcon name="image" size={19}/>Logo de<br/>l’agence</button></div></div>
      </aside>
      <div className="editor-preview-panel"><div className="editor-preview-toolbar"><label className="editor-format"><HomeIcon name={doc.aspectRatio==='9:16'?'phone':'landscape'} size={18}/><span className="sr-only">Format de la vidéo</span>
        <select value={doc.aspectRatio} onChange={e=>changeDoc({...doc,aspectRatio:e.target.value as EditorDocument['aspectRatio']})}><option value="9:16">Vertical · 9:16</option><option value="16:9">Horizontal · 16:9</option></select></label>
        <label className="editor-duration"><span className="sr-only">Durée de la vidéo</span><select value={doc.durationSeconds} onChange={e=>{setPlaying(false);changeDoc(resizeEditorDocument(doc,Number(e.target.value) as 20|30|40));}}><option value={20}>20 s</option><option value={30}>30 s</option><option value={40}>40 s</option></select></label>
        <div className="editor-canvas-zoom"><button type="button" aria-label="Réduire l’aperçu" onClick={()=>setZoom(z=>Math.max(25,z-10))}>−</button><span>{zoom} %</span><button type="button" aria-label="Agrandir l’aperçu" onClick={()=>setZoom(z=>Math.min(75,z+10))}>+</button></div>
      </div>
        <EditorPreview doc={doc} voice={voice} voiceReusable={restoredVoice.reusable} draftId={draft.id} photos={draft.photos} photoUrls={guest?.photoUrls} logoId={agency.logoAssetId} frame={frame} playing={playing} zoom={zoom}
          animations={previewAnimations} photoMotion={model.settings.photoMotion} transition={model.settings.transition} selected={selection?.kind==='text'?selection.id:null} onSelect={id=>setSelection({kind:'text',id})} onSeek={seek} onPlay={()=>{if(frame>=total-1)setFrame(0);setPlaying(p=>!p);}}
          onCheckpoint={checkpoint} onMove={layer=>change(m=>({...m,settings:{...m.settings,editor:{...m.settings.editor,layers:m.settings.editor.layers.map(l=>l.id===layer.id?layer:l)}}}),false)}/>
      </div>
      {selection?.kind==='music'&&doc.music?<aside className="editor-inspector"><div className="editor-panel-heading"><h2>Musique sélectionnée</h2><button type="button" aria-label="Fermer les réglages" onClick={()=>setSelection(null)}><HomeIcon name="close" size={18}/></button></div><EditorMusicControls doc={doc} onChange={next=>{changeDoc(next);if(!next.music)setSelection(null);}}/></aside>:selectedClip?<aside className="editor-inspector"><div className="editor-panel-heading"><h2>{selectedClipLabel} sélectionnée</h2><button type="button" aria-label="Fermer les réglages" onClick={()=>setSelection(null)}><HomeIcon name="close" size={18}/></button></div>
        <div className="editor-selected-photo">{draft.photos.find(p=>p.sourceOrder===selectedClip.photoSlot)&&<img src={photoUrl(draft.photos.find(p=>p.sourceOrder===selectedClip.photoSlot)!.id)} alt={`${selectedClipLabel} sélectionnée`}/>}</div>
        <label>Durée du plan (s)<EditorNumberInput key={selectedClip.id} min={.5} max={doc.durationSeconds} step={.1} value={Number((selectedClip.durationFrames/30).toFixed(1))} onValue={n=>changeDoc(resizeEditorClip(doc,selectedClip.id,Math.round(n*30)))}/></label>
        <p className="editor-media-hint">La durée totale reste fixe ; le plan voisin s’ajuste.</p>
        <EditorCameraControls camera={selectedClip.camera} onChange={camera=>changeDoc({...doc,clips:doc.clips.map(c=>c.id===selectedClip.id?{...c,camera}:c)})}/>
        <label className="editor-check"><input type="checkbox" checked={model.settings.runwayPhotos?.includes(selectedClip.photoSlot)??false} onChange={e=>change(m=>({...m,settings:{...m.settings,
          runwayPhotos:e.target.checked?[...(m.settings.runwayPhotos??[]),selectedClip.photoSlot]:(m.settings.runwayPhotos??[]).filter(slot=>slot!==selectedClip.photoSlot)}}))}/>Animer avec l’IA</label>
        <p className="editor-media-hint">{availableAnimations.some(a=>a.slot===selectedClip.photoSlot)?'Animation déjà créée disponible pour ce plan. Cochez l’animation IA pour la conserver sans supplément.':'1 crédit par nouvelle animation. Une animation conservée est réutilisée sans supplément pour la même photo au même format.'} Les plans scindés partagent son animation.</p>
        <div className="editor-inspector-actions">{[-1,1].map(direction=><button type="button" key={direction} disabled={direction<0?doc.clips[0].id===selectedClip.id:doc.clips.at(-1)!.id===selectedClip.id} onClick={()=>{
          const clips=[...doc.clips],at=clips.findIndex(c=>c.id===selectedClip.id);[clips[at],clips[at+direction]]=[clips[at+direction],clips[at]];changeDoc({...doc,clips});
        }}>{direction<0?'← Avant':'Après →'}</button>)}</div>
        <button type="button" className="editor-danger" onClick={()=>{changeDoc(distributeEditorClips(doc,doc.clips.filter(c=>c.id!==selectedClip.id)));setSelection(null);}}>Retirer ce plan de la vidéo</button>
      </aside>:<EditorInspector doc={doc} layer={selectedLayer} onPatch={patchLayer} onClose={()=>setSelection(null)} onDuplicate={()=>{if(!selectedLayer)return;
        const layer={...selectedLayer,id:crypto.randomUUID(),y:Math.min(98,selectedLayer.y+3)};changeDoc({...doc,layers:[...doc.layers,layer]});setSelection({kind:'text',id:layer.id});}}
        onDelete={()=>{if(!selectedLayer)return;changeDoc({...doc,layers:doc.layers.filter(l=>l.id!==selectedLayer.id)});setSelection(null);}}/>}
    </div>
    {voice&&doc.voiceEnabled&&!restoredVoice.reusable&&<div className="editor-feedback" role="status"><span>Voix d’origine conservée dans la timeline. Le texte, la voix ou la durée a changé : l’export utilisera une nouvelle narration.</span><button type="button" onClick={restoreOriginalVoice}>Reprendre la voix d’origine</button></div>}
    <EditorTimeline doc={doc} voice={voice} voiceLoading={restoredVoice.loading} voiceError={Boolean(restoredVoice.error)} animatedSlots={previewAnimations.map(a=>a.slot)} photos={draft.photos} photoUrls={guest?.photoUrls} draftId={draft.id} frame={frame} selected={selection} onSelect={setSelection} onSeek={seek} onChange={changeDoc} onCheckpoint={checkpoint} onAddPhoto={addClip} musicBusy={musicBusy} onAddMusic={addLibraryMusic}/>
    <footer className="editor-statusbar"><span>{canExport?'Votre projet est prêt à être exporté.':!model.fields.title||!model.fields.locality||!model.fields.propertyType||!model.fields.transaction?'Complétez les informations du bien dans l’onglet Texte.':'Ajoutez au moins trois photos et vérifiez la narration.'}</span><span>{guest?'Aucun crédit pendant vos essais':`${cost} crédit${cost>1?'s':''} à l’export`}</span></footer>
    {musicUrl&&<audio key={musicUrl} ref={audio} src={musicUrl} preload="metadata" hidden/>}
    <EditorVoicePlayback draftId={draft.id} voice={doc.voiceEnabled?voice:null} audioUrls={guest?.voiceUrls} frame={frame} playing={playing} volume={doc.voiceVolume} normalize={doc.audioMix?.normalize}
      onError={()=>{setPlaying(false);setError('La voix ne peut pas être lue pour le moment. Relancez l’aperçu.');}}/>
    {confirm&&<dialog ref={dialog} className="editor-export-dialog" onCancel={()=>{if(!exporting)setConfirm(false);}}><h2>{previewIntent?'Préparer l’aperçu complet':'Exporter votre vidéo'}</h2><p>{doc.durationSeconds} secondes · {doc.aspectRatio} · {new Set(doc.clips.map(c=>c.photoSlot)).size} photos</p>
      {quality.length>0&&<div className="editor-quality-dialog"><strong>À vérifier avant export</strong>{quality.map(issue=><button type="button" key={issue.id} onClick={()=>inspectIssue(issue)}>{issue.message} →</button>)}</div>}
      <div className="editor-export-cost"><strong>{cost} crédit{cost>1?'s':''}</strong><span>{existingExport?'Cette version est déjà préparée.':`1 pour la vidéo${cost>1?` + ${cost-1} pour les nouvelles animations`:''}`}</span></div>
      <p>Le MP4 sera enregistré dans Mes biens. Une version déjà préparée peut être récupérée sans nouveau débit.</p>
      {voice&&doc.voiceEnabled&&!restoredVoice.reusable&&<p>Vous écoutez actuellement la voix d’origine. Une nouvelle voix sera générée pour vos réglages modifiés.</p>}
      <label className="editor-check"><input type="checkbox" checked={rights} disabled={exporting} onChange={e=>setRights(e.target.checked)}/>J’ai le droit d’utiliser ces photos et cette musique.</label>
      {me&&me.rights.developmentRemaining<cost&&<p className="editor-error">Vous avez {me.rights.developmentRemaining} crédit(s) disponible(s). Retirez des animations ou découvrez les offres.</p>}
      <div><button type="button" disabled={exporting} onClick={()=>setConfirm(false)}>Annuler</button><button type="button" className="editor-primary" disabled={!rights||exporting||!me||me.rights.developmentRemaining<cost} onClick={()=>void exportVideo()}>{exporting?'Lancement…':`Exporter · ${cost} crédit${cost>1?'s':''}`}</button></div>
    </dialog>}
  </div>;
}
