'use client';
import {analyticsFetch as fetch,trackProductEvent} from '../lib/product-analytics';

import Link from 'next/link';
import {useEffect, useLayoutEffect, useRef, useState, type DragEvent, type FormEvent} from 'react';
import {VideoDuration,ImportUrl, GenerationView, defaultVideoCustomization,GenerationCustomization,generationCreditCost, type VideoCustomization, type CreationDraftData, type CreationDraftView, type GenerationRequest} from '@bienvu/contracts';
import {useAnonymousTrial, TrialChallenge} from './anonymous-trial';
import {useAccount} from './account';
import {HomeIcon} from './home-icons';
import {PhotoDurationAdvice} from './photo-duration-advice';
import {ManualListingForm, type ManualListingFormHandle,type PreparedManualListing} from './manual-listing-form';
import {generationActive, useGenerationProgress} from './generation-progress';
import {ConversationGeneration} from './conversation-generation';
import {requestGeneration} from '../lib/generation-client';
import {clearListingDraft, readListingDraft, saveListingDraft} from '../lib/listing-draft';
import {inspectManualPhotos} from '../lib/manual-photos';
import {useSubtitlePreference} from './video-settings';
import {VideoCustomizer} from './video-customizer';
import {useUrlImportEstimate,urlImportPhotoSlots,type PreparedUrlImport} from './url-import-estimate';

type RequestMessage = {kind: 'url' | 'manual'; text: string};
type ComposerPhoto={id:string;file:File;preview:string};
type Screen = {kind:'guest-customizing';url:string} | {kind: 'landing'} | {kind: 'manual'} | {kind:'extracting';text:string} | {kind: 'sending'; request: RequestMessage} |
  {kind: 'job'; id: string; request: RequestMessage} | {kind: 'error'; request: RequestMessage; message: string};
const viewKey = 'bienvu:home-conversation';
function remember(id: string, request: RequestMessage) {
  try {sessionStorage.setItem(viewKey, JSON.stringify({id, request}));} catch { /* Navigation still works without session storage. */ }
}
function remembered(): {id: string; request: RequestMessage} | null {
  try {
    const value = JSON.parse(sessionStorage.getItem(viewKey) ?? 'null') as {id?: unknown; request?: {kind?: unknown; text?: unknown}} | null;
    return typeof value?.id === 'string' && (value.request?.kind === 'url' || value.request?.kind === 'manual') &&
      typeof value.request.text === 'string' ? value as {id: string; request: RequestMessage} : null;
  } catch {return null;}
}
function forget() {try {sessionStorage.removeItem(viewKey);} catch { /* Optional. */ }}
function requestFor(job: GenerationView, url: string): RequestMessage {
  return job.sourceKind === 'manual' ? {kind: 'manual', text: 'Je souhaite ajouter mon annonce manuellement.'}
    : {kind: 'url', text: url || job.title || 'Votre annonce immobilière'};
}

export function HomeCreate({onLayoutChange}: {onLayoutChange(active: boolean): void}) {
  const {me, loading,defaultVoice} = useAccount();
  const {subtitlesEnabled,setSubtitlesEnabled,voiceEnabled,setVoiceEnabled,durationSeconds,setDurationSeconds,aspectRatio,setAspectRatio}=useSubtitlePreference();
  const [screen, setScreen] = useState<Screen>({kind: 'landing'});
  const [manualCredits,setManualCredits]=useState(1);
  const [customizing,setCustomizing]=useState(false),[guestSettings,setGuestSettings]=useState<VideoCustomization|undefined>();
  const pendingCustomization=useRef<{id:string;key:string}|null>(null);
  const [url, setUrl] = useState(''), [description, setDescription] = useState('');
  const [feedback, setFeedback] = useState(''), [manualBusy, setManualBusy] = useState(false),[editingProperty,setEditingProperty]=useState(false);
  const [composerPhotos,setComposerPhotos]=useState<ComposerPhoto[]>([]),[photoChecking,setPhotoChecking]=useState(false),
    [dropActive,setDropActive]=useState(false),[incomingPhotos,setIncomingPhotos]=useState<{id:string;files:File[]}|null>(null);
  const stagedPhotos=useRef<ComposerPhoto[]>([]),dropDepth=useRef(0),photoLock=useRef(false),photoVersion=useRef(0);
  const [importDraft,setImportDraft]=useState<CreationDraftView|null>(null),[manualReady,setManualReady]=useState(false),
    [manualReason,setManualReason]=useState('Ajoutez les informations du bien et au moins trois photos.'),
    [guestExtraction,setGuestExtraction]=useState<CreationDraftData|null>(null);
  const lock = useRef(false), startFresh = useRef(false), interactionVersion=useRef(0),
    scrollRegion = useRef<HTMLDivElement>(null),composerDock=useRef<HTMLDivElement>(null),
    composerAnimation=useRef<Animation|null>(null),previousComposer=useRef<DOMRect|null>(null),previousLayout=useRef(false);
  const manualForm=useRef<ManualListingFormHandle>(null),composerInput=useRef<HTMLInputElement>(null),autoFocusHandled=useRef(false);
  const guestPending=useRef<{text:string;key:string}|null>(null);
  const lastOwner=useRef<string|null>(null);
  const currentOwner=useRef<string|undefined>(me?.agency.id);currentOwner.current=me?.agency.id;
  const {job,jobs,setJob,unavailable,refreshDrafts} = useGenerationProgress(me?.agency.id);
  const trial = useAnonymousTrial(!loading && !me);
  const currentJob = me ? job : trial.job;
  const selectedJob = screen.kind === 'job' ? me?jobs.find(item=>item.id===screen.id)??null:
    currentJob?.id===screen.id?currentJob:null:null;
  const activeOtherJob = Boolean(currentJob && generationActive(currentJob) && screen.kind !== 'job');
  const guestManualBusy=trial.preparingManual||Boolean(trial.pendingManual);
  const busy = screen.kind === 'sending' || screen.kind==='extracting' || manualBusy||guestManualBusy;
  const canGenerate = Boolean(me?.rights.generationEnabled);
  const importPaused = Boolean(me?.rights.importRetryAt);
  const manual = screen.kind === 'manual';
  const estimate=useUrlImportEstimate(url,me?.agency.id,!loading&&!busy&&!manual&&!composerPhotos.length&&
    screen.kind!=='guest-customizing'&&!importPaused&&!(screen.kind==='job'&&generationActive(selectedJob)));
  function settingsForImport(imported:PreparedUrlImport):VideoCustomization{
    const slots=urlImportPhotoSlots(imported);
    return {...guestSettings??defaultVideoCustomization(me?.agency,defaultVoice),photoOrder:slots,runwayPhotos:slots,runwayClips:undefined};
  }
  const estimatedSettings=me&&estimate.value?settingsForImport(estimate.value):guestSettings;
  const creditCost=manual?manualCredits:generationCreditCost(estimatedSettings,durationSeconds);
  const noCredits = !editingProperty && canGenerate && (me?.rights.developmentRemaining??0)<creditCost;
  const estimatePending=Boolean(me&&estimate.source&&!manual&&!composerPhotos.length&&estimate.phase==='loading');
  const estimateFailed=Boolean(me&&estimate.source&&!manual&&!composerPhotos.length&&estimate.phase==='error');
  const inConversation = screen.kind !== 'landing' && screen.kind !== 'error';
  const canDropPhotos=!loading&&!busy&&!incomingPhotos&&!photoChecking&&
    !(screen.kind==='job'&&generationActive(selectedJob));
  function clearComposerPhotos(){
    photoVersion.current++;stagedPhotos.current.forEach(p=>URL.revokeObjectURL(p.preview));
    stagedPhotos.current=[];setComposerPhotos([]);setIncomingPhotos(null);setDropActive(false);dropDepth.current=0;
  }
  useEffect(()=>()=>{photoVersion.current++;stagedPhotos.current.forEach(p=>URL.revokeObjectURL(p.preview));},[]);
  useEffect(()=>{
    const reset=()=>{dropDepth.current=0;setDropActive(false);};
    window.addEventListener('dragend',reset);window.addEventListener('blur',reset);
    return()=>{window.removeEventListener('dragend',reset);window.removeEventListener('blur',reset);};
  },[]);
  function draggingFiles(event:DragEvent){return Array.from(event.dataTransfer.types).includes('Files');}
  async function dropPhotos(event:DragEvent<HTMLFormElement>){
    if(!draggingFiles(event))return;
    event.preventDefault();dropDepth.current=0;setDropActive(false);
    if(!canDropPhotos||photoLock.current)return;
    const files=Array.from(event.dataTransfer.files);if(!files.length)return;
    const version=photoVersion.current;photoLock.current=true;setPhotoChecking(true);setFeedback('');
    try{const {accepted,issues}=await inspectManualPhotos(files,stagedPhotos.current.map(p=>p.file.size));
      if(version!==photoVersion.current)return;
      const additions=accepted.map(file=>({id:crypto.randomUUID(),file,preview:URL.createObjectURL(file)}));
      stagedPhotos.current=[...stagedPhotos.current,...additions];setComposerPhotos(stagedPhotos.current);
      if(issues.length)setFeedback(issues.join(' '));
      if(additions.length)document.getElementById('home-listing-url')?.focus();
    }finally{photoLock.current=false;setPhotoChecking(false);}
  }
  function removeComposerPhoto(id:string){
    const photo=stagedPhotos.current.find(p=>p.id===id);if(photo)URL.revokeObjectURL(photo.preview);
    stagedPhotos.current=stagedPhotos.current.filter(p=>p.id!==id);setComposerPhotos(stagedPhotos.current);setFeedback('');
  }
  function receivePhotos(id:string,result:{accepted:File[];issues:string[]}){
    if(incomingPhotos?.id!==id)return;
    stagedPhotos.current=stagedPhotos.current.filter(photo=>{
      if(!result.accepted.includes(photo.file))return true;
      URL.revokeObjectURL(photo.preview);return false;
    });
    setComposerPhotos(stagedPhotos.current);setIncomingPhotos(null);
    if(result.issues.length)setFeedback(result.issues.join(' '));
  }
  function openWithPhotos(){
    if(!stagedPhotos.current.length||photoLock.current||incomingPhotos||busy)return;
    setIncomingPhotos({id:crypto.randomUUID(),files:stagedPhotos.current.map(p=>p.file)});
    if(!manual)openManual(ImportUrl.safeParse(url.trim()).success?'':url.trim());
  }

  useEffect(()=>{
    if(loading)return;const owner=me?.agency.id??'guest';
    if(lastOwner.current&&lastOwner.current!=='guest'&&lastOwner.current!==owner){
      clearComposerPhotos();setCustomizing(false);setGuestSettings(undefined);
      interactionVersion.current++;
      forget();guestPending.current=null;setScreen({kind:'landing'});setUrl('');setDescription('');
      setEditingProperty(false);setImportDraft(null);setGuestExtraction(null);setFeedback('');
    }
    lastOwner.current=owner;
  },[loading,me?.agency.id]);

  useEffect(() => {
    const draft = readListingDraft();
    if (draft?.kind === 'url') setUrl(draft.url);
    if (draft?.kind === 'manual'&&!remembered()) setScreen({kind: 'manual'});
  }, []);
  useEffect(()=>{
    if(loading||autoFocusHandled.current)return;
    autoFocusHandled.current=true;
    if(screen.kind!=='landing'||window.location.hash||new URLSearchParams(window.location.search).has('draft')||
      remembered()||readListingDraft()?.kind==='manual')return;
    const active=document.activeElement;
    if(active&&active!==document.body&&active!==document.documentElement)return;
    composerInput.current?.focus({preventScroll:true});
  },[loading,screen.kind]);
  useEffect(()=>{
    if(!me)return;const id=new URLSearchParams(window.location.search).get('draft');
    if(!id||!/^[a-zA-Z0-9_-]{1,80}$/.test(id))return;
    const controller=new AbortController(),version=interactionVersion.current;
    void fetch(`/api/imports/${encodeURIComponent(id)}`,{cache:'no-store',signal:controller.signal}).then(async response=>{
      if(!response.ok)return;const value=await response.json() as {status:string;draft?:CreationDraftView|null};
      if(controller.signal.aborted||interactionVersion.current!==version||value.status!=='needs_input'||!value.draft)return;
      if(value.draft.data.videoCustomization?.editor&&new URLSearchParams(window.location.search).get('fiche')!=='1'){window.location.replace(`/editeur?draft=${encodeURIComponent(value.draft.id)}`);return;}
      interactionVersion.current++;
      startFresh.current=true;setEditingProperty(new URLSearchParams(window.location.search).get('fiche')==='1');setImportDraft(value.draft);setGuestExtraction(null);
      setDescription(value.draft.data.fields.description??value.draft.data.originalText??'');setScreen({kind:'manual'});
    }).catch(()=>{});
    return()=>controller.abort();
  },[me?.agency.id]);
  useLayoutEffect(() => {onLayoutChange(inConversation);}, [inConversation, onLayoutChange]);
  useLayoutEffect(()=>{
    const dock=composerDock.current;if(!dock)return;
    // Wait for the parent layout commit. The final position is measured before
    // paint, then animated from the previous position without a height collapse.
    if(Boolean(dock.closest('.home-content-conversation'))!==inConversation)return;
    if(previousLayout.current!==inConversation)composerAnimation.current?.cancel();
    const target=dock.getBoundingClientRect();
    if(previousLayout.current!==inConversation){
      const from=previousComposer.current;
      if(from&&!window.matchMedia('(prefers-reduced-motion: reduce)').matches){
        const delta=from.top-target.top;
        // Entering conversation only moves down; there is no upward overshoot.
        const offset=inConversation?Math.min(0,delta):delta;
        if(Math.abs(offset)>1)composerAnimation.current=dock.animate(
          [{transform:`translateY(${offset}px)`},{transform:'translateY(0)'}],
          {duration:460,easing:'cubic-bezier(.22,.68,.3,1)'});
      }
      previousLayout.current=inConversation;
    }
    previousComposer.current=target;
  });
  useEffect(()=>()=>composerAnimation.current?.cancel(),[]);
  useEffect(()=>{
    const deleted=(event:Event)=>{
      const {id,agencyId}=(event as CustomEvent<{id:string;agencyId:string}>).detail;
      if(agencyId!==currentOwner.current)return;
      const location=new URL(window.location.href);
      if(importDraft?.id!==id&&!manualForm.current?.isDraft(id)&&location.searchParams.get('draft')!==id)return;
      previousComposer.current=composerDock.current?.getBoundingClientRect()??null;
      interactionVersion.current++;lock.current=false;startFresh.current=true;forget();
      setCustomizing(false);setScreen({kind:'landing'});setImportDraft(null);setGuestExtraction(null);setUrl('');setDescription('');setFeedback('');setManualBusy(false);
      try{sessionStorage.removeItem(`bienvu:manual-start:${agencyId}`);}catch{/* Optional storage. */}
      if(location.searchParams.get('draft')===id){location.searchParams.delete('draft');
        window.history.replaceState(window.history.state,'',location.pathname+location.search+location.hash);}
    };
    window.addEventListener('bienvu:draft-deleted',deleted);return()=>window.removeEventListener('bienvu:draft-deleted',deleted);
  },[importDraft?.id]);
  useEffect(() => {if(manual)scrollRegion.current?.scrollTo({top:0,behavior:window.matchMedia('(prefers-reduced-motion: reduce)').matches?'instant':'smooth'});}, [manual]);
  useEffect(()=>{if(manual)setFeedback(current=>
    current.startsWith('Les informations du bien ont été récupérées.')||
    current.startsWith('Certaines informations du bien sont à compléter')?'':current);},[manual]);
  useEffect(() => {
    if (!me || startFresh.current || readListingDraft()?.kind==='manual'&&!remembered()) return;
    const saved=remembered();if(!saved)return;
    const controller=new AbortController();
    void fetch(`/api/generations/${saved.id}`,{cache:'no-store',signal:controller.signal}).then(async response=>{
      if(!response.ok){if(!controller.signal.aborted)forget();return;}
      const restored=GenerationView.parse(await response.json());
      if(!controller.signal.aborted&&remembered()?.id===saved.id&&!startFresh.current){
        setJob(restored);setScreen(current=>current.kind==='manual'||current.kind==='sending'?current:{kind:'job',id:restored.id,request:saved.request});
      }
    }).catch(()=>{});
    return()=>controller.abort();
  },[me?.agency.id]);
  useEffect(() => {
    if (!currentJob || startFresh.current || readListingDraft()?.kind==='manual'&&!remembered()||screen.kind==='manual'||
      screen.kind === 'sending' || screen.kind==='guest-customizing' || screen.kind === 'error') return;
    const saved = remembered();
    if (screen.kind === 'job') return;
    if (generationActive(currentJob) || saved?.id === currentJob.id) {
      const request = saved?.id === currentJob.id ? saved.request : requestFor(currentJob, url);
      setScreen({kind: 'job', id: currentJob.id, request}); remember(currentJob.id, request);
    }
  }, [currentJob?.id, currentJob?.status, screen.kind]);
  useEffect(()=>{
    if(!me&&screen.kind==='job'&&trial.job?.id===screen.id&&trial.job.status==='ready'&&trial.job.sourceKind==='manual')clearListingDraft();
  },[me,screen.kind,trial.job?.id,trial.job?.status]);
  useEffect(() => {
    if (!trial.job || me || screen.kind !== 'sending') return;
    setScreen({kind: 'job', id: trial.job.id, request: screen.request}); remember(trial.job.id, screen.request);
    setUrl('');
  }, [trial.job?.id, me, screen.kind]);
  useEffect(() => {
    if (screen.kind !== 'sending' || !trial.failure || me) return;
    setScreen({kind: 'error', request: screen.request, message: trial.failure});
  }, [trial.failure, screen.kind, me]);
  useEffect(() => {
    const fresh = () => {
      if(trial.preparingManual)return;
      interactionVersion.current++;lock.current=false;startFresh.current = true; forget(); setFeedback('');guestPending.current=null;
      trial.cancelManual();
      if (screen.kind !== 'manual') {setScreen({kind: 'landing'});setUrl('');setDescription('');}
    };
    window.addEventListener('bienvu:new-video', fresh);
    return () => window.removeEventListener('bienvu:new-video', fresh);
  }, [screen.kind,trial.preparingManual]);

  async function create(input: GenerationRequest, request: RequestMessage) {
    const customization=manualForm.current?.customization()??input.customization??guestSettings;
    const owner=me!.agency.id,version=interactionVersion.current,next = await requestGeneration(owner, {...input,subtitlesEnabled,voiceEnabled,durationSeconds,aspectRatio,...(customization?{customization}:{})});
    if(currentOwner.current!==owner||interactionVersion.current!==version)return;
    setJob(next); setScreen({kind: 'job', id: next.id, request}); remember(next.id, request);
    if(pendingCustomization.current){sessionStorage.removeItem(`bienvu:customize:${owner}:${pendingCustomization.current.id}`);pendingCustomization.current=null;}
    setUrl('');
  }
  function openManual(fromText = '',initialData:CreationDraftData|null=null) {
    if (manualBusy||guestManualBusy||screen.kind==='sending'||(screen.kind === 'job' && generationActive(selectedJob))) return;
    trackProductEvent('manual_form_opened',{source_kind:fromText?'description':'manual'});
    previousComposer.current=composerDock.current?.getBoundingClientRect()??null;
    interactionVersion.current++;lock.current=false;startFresh.current = true;forget();
    if (fromText) setDescription(fromText);
    setEditingProperty(false);setImportDraft(null);setGuestExtraction(initialData);guestPending.current=null;trial.setToken('');trial.setChallenge(false);
    setCustomizing(false);setFeedback('');setScreen({kind: 'manual'});
  }
  function showManualTrial(next:GenerationView|null){
    if(!next)return;
    const request:RequestMessage={kind:'manual',text:'Je souhaite ajouter mon annonce manuellement.'};
    startFresh.current=false;setScreen({kind:'job',id:next.id,request});remember(next.id,request);
    // Keep the browser's fields/photos until the export succeeds, so a failed
    // anonymous generation can be retried from the manual form.
    setCustomizing(false);setFeedback('');
  }
  async function prepareManualTrial(value:PreparedManualListing){
    showManualTrial(await trial.startManual(value,{subtitlesEnabled,voiceEnabled,durationSeconds,aspectRatio,customization:value.customization}));
  }
  const manualNavigation=useRef(false);
  useEffect(()=>{if(loading||manualNavigation.current||new URLSearchParams(window.location.search).get('manuel')!=='1')return;
    manualNavigation.current=true;openManual();const url=new URL(window.location.href);url.searchParams.delete('manuel');window.history.replaceState(window.history.state,'',url.pathname+url.search+url.hash);
  },[loading]);
  async function analyzeGuest(text:string,key:string,token:string){
    if(lock.current||guestPending.current?.key!==key)return;
    const version=++interactionVersion.current;lock.current=true;setScreen({kind:'extracting',text});setFeedback('');
    try{const response=await fetch('/api/trial/describe',{method:'POST',headers:{'Content-Type':'application/json','Idempotency-Key':key},
      body:JSON.stringify({text,turnstileToken:token})});
      if(!response.ok)throw new Error('Analyse indisponible.');
      const value=await response.json() as {extraction:string;data:CreationDraftData|null};
      if(interactionVersion.current!==version)return;
      setGuestExtraction(value.data);setDescription(text);startFresh.current=true;forget();setScreen({kind:'manual'});
      if(value.extraction!=='ready')setFeedback('Vous pouvez compléter les informations manuellement. Votre texte est conservé.');
    }catch{if(interactionVersion.current!==version)return;setGuestExtraction(null);setDescription(text);startFresh.current=true;forget();
      setScreen({kind:'manual'});setFeedback('Vous pouvez compléter les informations manuellement. Votre texte est conservé.');}
    finally{if(interactionVersion.current===version){lock.current=false;guestPending.current=null;
      trial.setToken('');trial.setChallenge(false);trial.setWidgetVersion(n=>n+1);}}
  }
  function closeCustomization(){
    previousComposer.current=composerDock.current?.getBoundingClientRect()??null;
    setCustomizing(false);
    if(screen.kind==='guest-customizing')setScreen({kind:'landing'});
  }
  async function personalize(){
    if(loading||busy||lock.current||activeOtherJob)return;
    if(customizing||screen.kind==='guest-customizing'){closeCustomization();return;}
    if(manual){setCustomizing(true);scrollRegion.current?.scrollTo({top:0,behavior:'smooth'});return;}
    if(composerPhotos.length){openWithPhotos();setCustomizing(true);return;}
    const parsed=ImportUrl.safeParse(url.trim());
    if(!parsed.success){
      const text=url.trim();
      if(!me||!text){openManual(text);setCustomizing(true);return;}
      const version=++interactionVersion.current,owner=me.agency.id;lock.current=true;setScreen({kind:'extracting',text});setFeedback('');
      try{
        const raw=sessionStorage.getItem('bienvu:description-request'),prior=raw?JSON.parse(raw) as {text:string;key:string}:null;
        const key=prior?.text===text?prior.key:crypto.randomUUID();sessionStorage.setItem('bienvu:description-request',JSON.stringify({text,key}));
        const response=await fetch('/api/imports/describe',{method:'POST',headers:{'Content-Type':'application/json','Idempotency-Key':key},body:JSON.stringify({text})});
        if(!response.ok)throw new Error();const result=await response.json() as {draft:CreationDraftView|null};
        if(interactionVersion.current!==version||currentOwner.current!==owner)return;
        setImportDraft(result.draft);setGuestExtraction(null);setDescription(text);setScreen({kind:'manual'});setCustomizing(true);
        startFresh.current=true;forget();void refreshDrafts();
      }catch{if(interactionVersion.current===version&&currentOwner.current===owner){openManual(text);setCustomizing(true);}}
      finally{if(interactionVersion.current===version)lock.current=false;}
      return;
    }
    if(!me){setGuestSettings(current=>current??defaultVideoCustomization(undefined,defaultVoice));setScreen({kind:'guest-customizing',url:parsed.data});return;}
    const owner=me.agency.id,version=interactionVersion.current;
    lock.current=true;setFeedback('');startFresh.current=true;forget();setScreen({kind:'extracting',text:parsed.data});
    try{
      const imported=await estimate.prepare(parsed.data,true);
      let draft=imported.draft;
      if(imported.status==='ready'&&imported.id){
        if(pendingCustomization.current?.id!==imported.id){
          const storageKey=`bienvu:customize:${owner}:${imported.id}`;
          const key=sessionStorage.getItem(storageKey)??crypto.randomUUID();sessionStorage.setItem(storageKey,key);
          pendingCustomization.current={id:imported.id,key};
        }
        const prepared=await fetch(`/api/imports/${imported.id}/customize`,{method:'POST',headers:{'Idempotency-Key':pendingCustomization.current.key}});
        if(!prepared.ok)throw new Error('La préparation des photos a été interrompue. Réessayez pour reprendre la même annonce.');
        draft=await prepared.json() as CreationDraftView;
      }
      if(!draft)throw new Error('Ce site ne permet pas de préparer cette annonce. Vous pouvez saisir ses informations et ajouter vos photos manuellement.');
      if(interactionVersion.current!==version||currentOwner.current!==owner)return;
      setImportDraft({...draft,data:{...draft.data,videoCustomization:draft.data.videoCustomization??settingsForImport(imported)}});
      setGuestExtraction(null);setDescription(draft.data.fields.description??'');setScreen({kind:'manual'});setCustomizing(true);
      void refreshDrafts();
    }catch(error){if(interactionVersion.current===version&&currentOwner.current===owner)
      setScreen({kind:'error',request:{kind:'url',text:parsed.data},message:error instanceof Error?error.message:'Préparation interrompue.'});}
    finally{if(interactionVersion.current===version)lock.current=false;}
  }
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if(loading||photoChecking||incomingPhotos)return;
    if(composerPhotos.length){openWithPhotos();return;}
    if (manual) {
      if (manualReady && !manualBusy && !noCredits && (editingProperty||!activeOtherJob))
        (document.getElementById('manual-guided-form') as HTMLFormElement | null)?.requestSubmit();
      return;
    }
    if (loading || busy || lock.current || estimatePending || estimateFailed || noCredits || activeOtherJob || screen.kind === 'job' && generationActive(selectedJob)) return;
    previousComposer.current=composerDock.current?.getBoundingClientRect()??null;
    const value = url.trim();
    const parsed = ImportUrl.safeParse(value);
    if (!parsed.success) {
      if(value&&(value.split(/\s+/).length>=3||!/^https?:\/\//i.test(value)&&!/^www\./i.test(value)&&
        !/^(?:[\w-]+\.)+[\w-]+(?:\/|$)/.test(value))){
        if(!me){
          if(!trial.available||!trial.siteKey){openManual(value);setFeedback('Vous pouvez compléter les informations manuellement. Votre texte est conservé.');return;}
          const pending=guestPending.current?.text===value?guestPending.current:{text:value,key:crypto.randomUUID()};
          guestPending.current=pending;
          if(!trial.token){trial.setChallenge(true);setFeedback('Vérifiez que vous êtes humain pour préparer votre annonce.');return;}
          await analyzeGuest(value,pending.key,trial.token);return;
        }
        const version=++interactionVersion.current,owner=me.agency.id;lock.current=true;setScreen({kind:'extracting',text:value});setFeedback('');
        try{const stored=sessionStorage.getItem('bienvu:description-request'),prior=stored?JSON.parse(stored) as {text:string;key:string}:null;
          const key=prior?.text===value?prior.key:crypto.randomUUID();sessionStorage.setItem('bienvu:description-request',JSON.stringify({text:value,key}));
          const response=await fetch('/api/imports/describe',{method:'POST',headers:{'Content-Type':'application/json','Idempotency-Key':key},
            body:JSON.stringify({text:value})});
          if(!response.ok)throw new Error('L’analyse est indisponible.');
          const result=await response.json() as {draft:CreationDraftView|null;extraction:string};
          if(interactionVersion.current!==version||currentOwner.current!==owner)return;
          setImportDraft(result.draft);setGuestExtraction(null);setDescription(value);startFresh.current=true;forget();setScreen({kind:'manual'});
          if(result.extraction!=='ready')setFeedback('Vous pouvez compléter les informations manuellement. Votre texte est conservé.');
          else sessionStorage.removeItem('bienvu:description-request');
        }catch{if(interactionVersion.current===version&&currentOwner.current===owner){
          openManual(value);setFeedback('Vous pouvez compléter les informations manuellement. Votre texte est conservé.');}}
        finally{if(interactionVersion.current===version)lock.current=false;}
        return;
      }
      setFeedback('Collez un lien HTTPS public valide, ou décrivez votre bien pour la saisie manuelle.'); return;
    }
    if(importPaused&&!estimate.value){setFeedback('La limite des imports par lien est atteinte. Vous pouvez ajouter vos informations et photos manuellement.');return;}
    const request: RequestMessage = {kind: 'url', text: parsed.data};
    const version=++interactionVersion.current,owner=me?.agency.id;
    forget();saveListingDraft({kind:'url',url:parsed.data});
    setFeedback('');lock.current = true;
    if (!me) {
      if (!trial.token) {await trial.start(parsed.data,undefined,subtitlesEnabled,guestSettings,voiceEnabled,durationSeconds,aspectRatio);lock.current = false;return;}
      setScreen({kind: 'sending', request});
      try {await trial.start(parsed.data,undefined,subtitlesEnabled,guestSettings,voiceEnabled,durationSeconds,aspectRatio);} finally {lock.current = false;}
      return;
    }
    setScreen({kind: 'sending', request});
    try {
      const imported=await estimate.prepare(parsed.data,true);
      if(interactionVersion.current!==version||currentOwner.current!==owner)return;
      if(imported.status==='needs_input'&&imported.draft){
        startFresh.current=true;forget();setImportDraft({...imported.draft,data:{...imported.draft.data,videoCustomization:imported.draft.data.videoCustomization??settingsForImport(imported)}});setDescription(imported.draft.data.fields.description??'');
        setScreen({kind:'manual'});
        void refreshDrafts();
        setFeedback(imported.draft.photos.length<3?'Les informations du bien ont été récupérées. Ajoutez vos photos pour continuer.':
          'Certaines informations du bien sont à compléter avant de créer la vidéo.');
        return;
      }
      if(imported.status!=='ready')throw new Error('Complétez les informations de cette annonce avant de créer la vidéo.');
      if(!canGenerate){setFeedback('Votre annonce est enregistrée. La création vidéo sera disponible dans votre espace.');setScreen({kind:'landing'});return;}
      await create({listingId:imported.id,customization:settingsForImport(imported)},request);
    }
    catch (error) {if(interactionVersion.current===version&&currentOwner.current===owner)
      setScreen({kind: 'error', request, message: error instanceof Error ? error.message : 'La connexion a été interrompue. Réessayez pour retrouver votre demande.'});}
    finally {if(interactionVersion.current===version)lock.current = false;}
  }
  const statusRequest = screen.kind === 'sending' || screen.kind === 'job' ? screen.request : null;
  const resultReady = screen.kind === 'job' && selectedJob?.status === 'ready';
  const composerDisabled = screen.kind==='guest-customizing'&&guestSettings&&!GenerationCustomization.safeParse(guestSettings).success || loading || busy || estimatePending || estimateFailed || photoChecking || Boolean(incomingPhotos) || (composerPhotos.length
    ? screen.kind==='job'&&generationActive(selectedJob) : manual
    ? !manualReady||Boolean(noCredits)||!editingProperty&&activeOtherJob
    : Boolean(noCredits)||Boolean(importPaused&&!estimate.value&&ImportUrl.safeParse(url.trim()).success)||activeOtherJob||screen.kind==='job'&&
      (generationActive(selectedJob)||resultReady&&!url.trim()));
  const contextNote = !me ? estimate.source?'Essai classique gratuit. Connectez-vous pour animer les photos par IA et estimer leur coût en crédits.':'Essayez gratuitement.' : canGenerate
    ? (noCredits?'Crédits insuffisants pour ce montage. Réduisez les animations ou consultez vos crédits.':'')
    : 'Accès anticipé · Préparez votre annonce';
  return <div className={`home-create${inConversation ? ' home-create-conversation' : ''}${customizing||screen.kind==='guest-customizing'?' home-create-customizing':''}`}>
    <div ref={scrollRegion} className="home-conversation-scroll">
    {screen.kind==='guest-customizing'&&<VideoCustomizer sourceUrl={screen.url} settings={guestSettings??defaultVideoCustomization(undefined,defaultVoice)} onChange={value=>{const {photoOrder,runwayPhotos,...settings}=value;setGuestSettings(settings);}} photos={[]} fields={{title:'Votre annonce',propertyType:'',transaction:'',locality:'',description:'',priceCents:'',charges:'',area:'',rooms:''}} agencyName="" subtitlesEnabled={subtitlesEnabled} onSubtitles={setSubtitlesEnabled} voiceEnabled={voiceEnabled} onVoice={setVoiceEnabled} durationSeconds={durationSeconds} onDuration={setDurationSeconds} aspectRatio={aspectRatio} onBack={closeCustomization} onAdd={files=>{if(files){setIncomingPhotos({id:crypto.randomUUID(),files:Array.from(files)});openManual();setCustomizing(true);}}} busy={busy} ready onEdit={()=>{openManual();}} saved={false}/> }
    {manual && <div className="home-conversation-manual home-manual-sheet-view">
      <div className="home-manual-panel">
        {!me ? <ManualListingForm onCreditCost={setManualCredits} ref={manualForm} key="guest" initialCustomization={guestSettings} customizing={customizing} onCloseCustomizer={closeCustomization} subtitlesEnabled={subtitlesEnabled} onSubtitles={setSubtitlesEnabled} voiceEnabled={voiceEnabled} onVoice={setVoiceEnabled} durationSeconds={durationSeconds} onDuration={setDurationSeconds} aspectRatio={aspectRatio} prepareGuest incomingPhotos={incomingPhotos} onPhotosReceived={receivePhotos} guided={{description,setDescription,initialData:guestExtraction,onCancel:()=>{previousComposer.current=composerDock.current?.getBoundingClientRect()??null;setCustomizing(false);setScreen({kind:'landing'});},
          onReadyChange:(ready,reason)=>{setManualReady(ready);setManualReason(reason);}}} busy={manualBusy||guestManualBusy} setBusy={setManualBusy} onPrepared={prepareManualTrial}/>
          : <ManualListingForm initialCustomization={guestSettings} saveOnly={editingProperty} onSaved={draft=>{clearListingDraft();void refreshDrafts();window.location.assign(`/biens/${encodeURIComponent(`listing:${draft.id}`)}`);}} onCreditCost={setManualCredits} ref={manualForm} customizing={customizing} onCloseCustomizer={closeCustomization} brand={me.agency} subtitlesEnabled={subtitlesEnabled} onSubtitles={setSubtitlesEnabled} voiceEnabled={voiceEnabled} onVoice={setVoiceEnabled} durationSeconds={durationSeconds} onDuration={setDurationSeconds} aspectRatio={aspectRatio} key={`agency:${me.agency.id}:${importDraft?.id??'manual'}`} incomingPhotos={incomingPhotos} onPhotosReceived={receivePhotos} generate={canGenerate} guided={{description,setDescription,agencyId:me.agency.id,initialDraft:importDraft,
            onReadyChange:(ready,reason)=>{setManualReady(ready);setManualReason(reason);},onDraftChange:()=>void refreshDrafts(),
            onCancel:()=>{previousComposer.current=composerDock.current?.getBoundingClientRect()??null;setCustomizing(false);setScreen({kind:'landing'});}}} busy={manualBusy} setBusy={setManualBusy} onCreated={async value => {
            void refreshDrafts();
            if (!canGenerate) {setFeedback('Votre annonce est enregistrée dans votre espace.');setScreen({kind:'landing'});clearListingDraft();return;}
            const request:RequestMessage={kind:'manual',text:'Je souhaite ajouter mon annonce manuellement.'};
            try {await create({listingId:value.id},request);clearListingDraft();}
            catch (error) {setFeedback(`Votre annonce est enregistrée. ${error instanceof Error ? error.message : 'La création vidéo n’a pas démarré.'} Réessayez pour reprendre cette même demande.`);throw error;}
          }}/>}
      </div></div>}
    {statusRequest && <ConversationGeneration aspectRatio={aspectRatio} job={selectedJob} request={statusRequest} sending={screen.kind === 'sending'} anonymous={!me} unavailable={unavailable}
      onRefresh={async () => {if (me && selectedJob) {const response=await fetch(`/api/generations/${selectedJob.id}`,{cache:'no-store'});if(response.ok)setJob(await response.json() as GenerationView);}
        else if(!me)await trial.refresh();}}/>}
    {screen.kind==='extracting'&&<div className="home-conversation-manual"><div className="home-request-bubble"><HomeIcon name="pencil" size={21}/><strong>{screen.text}</strong></div>
      <p className="home-conversation-lead" role="status">Nous préparons les informations de votre bien…</p></div>}
    </div>
    <div ref={composerDock} className="home-composer-dock">{manual?<form className="home-manual-toolbar" onSubmit={submit} aria-label={editingProperty?"Enregistrer les informations du bien":"Créer la vidéo de votre bien"}>
      <div className="home-manual-settings"><details><summary aria-disabled={busy||loading} onClick={event=>{if(busy||loading)event.preventDefault();}}><HomeIcon name="settings" size={22}/>Réglages</summary>
        <fieldset className="home-manual-settings-panel" disabled={busy||loading}><legend>Réglages de la vidéo</legend>
          <label>Format<select aria-label="Format de la vidéo" value={aspectRatio} onChange={event=>setAspectRatio(event.target.value==='16:9'?'16:9':'9:16')}><option value="9:16">Vertical 9:16</option><option value="16:9">Horizontal 16:9</option></select></label>
          <label>Durée<select aria-label="Durée de la vidéo" value={durationSeconds} onChange={event=>setDurationSeconds(VideoDuration.parse(Number(event.target.value)))}><option value={20}>20 secondes</option><option value={30}>30 secondes</option><option value={40}>40 secondes</option></select></label>
          <label className="home-manual-setting-check"><input type="checkbox" aria-label="Voix off" checked={voiceEnabled} onChange={event=>setVoiceEnabled(event.target.checked)}/>Voix off</label>
          <label className="home-manual-setting-check"><input type="checkbox" aria-label="Sous-titres de la voix off" checked={subtitlesEnabled} disabled={!voiceEnabled} onChange={event=>setSubtitlesEnabled(event.target.checked)}/>Sous-titres</label>
          <button type="button" className="home-manual-personalize" disabled={photoChecking||activeOtherJob} onClick={event=>{event.currentTarget.closest('details')!.open=false;void personalize();}}>{customizing?'Revenir à la fiche du bien':'Personnaliser la vidéo'}<HomeIcon name="arrow" size={17}/></button>
        </fieldset></details></div>
      <p className="home-manual-settings-summary">{aspectRatio==='16:9'?'Horizontal':'Vertical'} · {durationSeconds} s{voiceEnabled?' · Voix off':''}{subtitlesEnabled?' · Sous-titres':''}</p>
      <span className="home-credit-cost" aria-live="polite">{editingProperty?'Sans crédit':`${creditCost} crédit${creditCost>1?'s':''}`}</span>
      <button type="submit" className="home-primary-button" disabled={composerDisabled} aria-describedby={!manualReady?'home-manual-action-note':undefined}>{trial.preparingManual?'Envoi des photos…':manualBusy?'Enregistrement…':editingProperty?'Enregistrer le bien':me&&!canGenerate?'Enregistrer mon annonce':'Créer ma vidéo'}<HomeIcon name="arrow" size={19}/></button>
    </form>:<><form className={`home-composer home-composer-modern${feedback || screen.kind === 'error' ? ' home-composer-invalid' : ''}${dropActive?' home-composer-dropping':''}`} onSubmit={submit} noValidate aria-label="Créer une vidéo depuis une annonce"
      onDragEnter={event=>{if(draggingFiles(event)&&canDropPhotos){event.preventDefault();dropDepth.current++;setDropActive(true);}}}
      onDragOver={event=>{if(draggingFiles(event)){event.preventDefault();event.dataTransfer.dropEffect=canDropPhotos?'copy':'none';}}}
      onDragLeave={event=>{if(draggingFiles(event)){dropDepth.current=Math.max(0,dropDepth.current-1);if(!dropDepth.current)setDropActive(false);}}}
      onDrop={event=>void dropPhotos(event)}>
      {dropActive&&<div className="home-drop-overlay" aria-hidden="true"><HomeIcon name="upload" size={30}/><strong>Déposez vos photos ici</strong><span>JPEG, PNG ou WebP · Jusqu’à 12 photos</span></div>}
      <div className="home-composer-main"><div className="home-url-row"><HomeIcon name="link" size={28}/><label htmlFor="home-listing-url" className="sr-only">{manual?'Précisions sur votre bien':'Lien ou description de votre annonce'}</label>
        <input ref={composerInput} id="home-listing-url" name="url" type="text" autoComplete="off" spellCheck={false} placeholder={composerPhotos.length?'Décrivez votre bien, ou appuyez sur Entrée…':manual?'Ajoutez des précisions sur votre bien…':resultReady?'Collez le lien d’une autre annonce…':'Collez un lien ou décrivez votre bien…'}
          readOnly={customizing} value={manual?customizing?importDraft?.sourceUrl??importDraft?.data.canonicalUrl??importDraft?.data.fields.title??description:description:screen.kind==='sending'?'':url} onChange={event=>{if(manual)setDescription(event.target.value);
            else {if(screen.kind==='extracting'){interactionVersion.current++;lock.current=false;guestPending.current=null;
              trial.setToken('');trial.setChallenge(false);trial.setWidgetVersion(n=>n+1);setScreen({kind:'landing'});}setUrl(event.target.value);}
            setFeedback('');}} disabled={screen.kind==='sending'} aria-invalid={Boolean(feedback || screen.kind==='error')} aria-describedby="home-url-error home-create-note"/></div>
        <div className="home-composer-actions"><button type="submit" className="home-primary-button" disabled={composerDisabled} aria-describedby={manual&&!manualReady?'home-manual-action-note':undefined}>
          {incomingPhotos?'Ajout des photos…':composerPhotos.length?'Compléter mon annonce':screen.kind==='sending'||manualBusy?'Envoi en cours':screen.kind==='job'&&generationActive(selectedJob)?'Génération en cours':manual&&me&&!canGenerate?'Enregistrer mon annonce':'Créer ma vidéo'}<HomeIcon name="arrow" size={20}/></button>
          <span className="home-credit-cost" aria-live="polite">{estimatePending?'Estimation en cours…':estimateFailed?'Estimation indisponible':`${creditCost} crédit${creditCost>1?'s':''}${me&&estimate.value?' estimés':''}`}
            {me&&estimate.value&&<small className="home-credit-estimate-detail">{urlImportPhotoSlots(estimate.value).length} photos · Animations IA activées</small>}
          </span></div>
      </div>
      {me&&estimate.phase==='ready'&&estimate.value&&!busy&&<PhotoDurationAdvice photoCount={urlImportPhotoSlots(estimate.value).length} durationSeconds={durationSeconds} onDuration={setDurationSeconds} disabled={loading||activeOtherJob}/>}
      {composerPhotos.length>0&&<div className="home-composer-attachments"><ol aria-label="Photos à ajouter à votre annonce">{composerPhotos.map((photo,index)=><li key={photo.id}>
        <img src={photo.preview} alt={`Photo ${index+1} : ${photo.file.name}`}/><button type="button" disabled={photoChecking||Boolean(incomingPhotos)} aria-label={`Retirer ${photo.file.name}`} onClick={()=>removeComposerPhoto(photo.id)}><HomeIcon name="close" size={14}/></button>
      </li>)}</ol><p role="status">{composerPhotos.length} photo{composerPhotos.length>1?'s':''} · Appuyez sur Entrée pour compléter votre annonce.</p></div>}
      {photoChecking&&<p className="home-photo-status" role="status">Vérification des photos…</p>}
      <div className="home-composer-bottom"><div className="home-format-tags">
        <label className="home-format-control"><span className="home-select-content"><HomeIcon name={aspectRatio==='16:9'?'landscape':'phone'} size={21}/><select aria-label="Format de la vidéo" value={aspectRatio} title="Format de la vidéo"
          disabled={loading||busy||screen.kind==='job'&&generationActive(selectedJob)} onChange={event=>setAspectRatio(event.target.value==='16:9'?'16:9':'9:16')}>
          <option value="9:16">Vertical 9:16</option><option value="16:9">Horizontal 16:9</option></select><HomeIcon name="chevron" size={16}/></span></label>
        <label className="home-duration-pill"><span className="home-select-content"><HomeIcon name="clock" size={20}/><select aria-label="Durée de la vidéo" value={durationSeconds} title="Durée de la vidéo"
          disabled={loading||busy||screen.kind==='job'&&generationActive(selectedJob)} onChange={event=>setDurationSeconds(VideoDuration.parse(Number(event.target.value)))}>
          <option value={20}>20 s</option><option value={30}>30 s</option><option value={40}>40 s</option></select></span></label>
        <button type="button" className={`home-voice-pill home-setting-toggle${voiceEnabled?' is-active':''}`} aria-pressed={voiceEnabled} aria-label="Voix off" title="Activer ou désactiver la voix off" disabled={loading||busy||screen.kind==='job'&&generationActive(selectedJob)} onClick={()=>setVoiceEnabled(!voiceEnabled)}><span className="home-option-label">Voix off</span><span className="home-toggle-track" aria-hidden="true"/></button>
        <button type="button" className={`home-subtitles-pill home-setting-toggle${subtitlesEnabled?' is-active':''}`} aria-pressed={subtitlesEnabled} aria-label="Sous-titres de la voix off"
          title={voiceEnabled?"Afficher ou masquer les sous-titres de la voix off":"Activez la voix off pour ajouter des sous-titres"} disabled={!voiceEnabled||loading||busy||screen.kind==='job'&&generationActive(selectedJob)}
          onClick={()=>setSubtitlesEnabled(!subtitlesEnabled)}><span className="home-option-label">Sous-titres</span><span className="home-toggle-track" aria-hidden="true"/></button>
        </div><button type="button" className="home-customize-button" aria-pressed={customizing||screen.kind==='guest-customizing'} disabled={loading||busy||photoChecking||activeOtherJob||screen.kind==='job'&&generationActive(selectedJob)} onClick={()=>void personalize()}><HomeIcon name="settings" size={21}/>Personnaliser</button>
      </div>
    </form>
    <button type="button" className={manual?'home-mode-pill is-active':'home-mode-pill'} aria-pressed={manual} disabled={busy || photoChecking || Boolean(incomingPhotos) || screen.kind==='job' && generationActive(selectedJob)} onClick={()=>{if(manual)void manualForm.current?.cancel();else if(composerPhotos.length)openWithPhotos();else openManual();}}><HomeIcon name="pencil" size={20}/>Saisie manuelle</button>
    </>}
    {manual&&!manualReady&&<p id="home-manual-action-note" className="home-form-note" role="status">{manualReason}</p>}
    {screen.kind==='error'&&<p className="home-form-feedback" role="alert">{screen.message} Votre saisie est conservée pour réessayer.</p>}
    {estimateFailed&&<p className="home-form-feedback" role="alert">{estimate.message} <button type="button" className="text-button" onClick={estimate.retry}>Réessayer l’estimation</button></p>}
    {feedback && <p className="home-form-feedback" id="home-url-error" role="alert">{feedback}</p>}
    {!me && trial.challenge && trial.siteKey && <TrialChallenge siteKey={trial.siteKey} version={trial.widgetVersion}
      purpose={guestPending.current?'description':'trial'} onToken={token=>{trial.setToken(token);if(!token)return;
        if(trial.pendingManual){void trial.continueManual(token).then(showManualTrial);return;}
        const pending=guestPending.current;if(pending){trial.setChallenge(false);void analyzeGuest(pending.text,pending.key,token);return;}
        const parsed=ImportUrl.safeParse(url.trim());if(!parsed.success){trial.setChallenge(false);setFeedback('Collez un lien HTTPS public valide.');return;}
        trial.setChallenge(false);setScreen({kind:'sending',request:{kind:'url',text:parsed.data}});
        void trial.start(parsed.data,token,subtitlesEnabled,guestSettings,voiceEnabled,durationSeconds,aspectRatio);
      }} onError={trial.setFailure}/>}
    {!me&&trial.pendingManual&&<button type="button" className="text-button" onClick={trial.cancelManual}>Revenir à mon annonce</button>}
    {!me&&trial.manualProgress&&<p className="home-form-note" role="status">{trial.manualProgress}</p>}
    {!me && trial.failure && screen.kind !== 'error' && <p className="home-form-feedback" role="alert">{trial.failure} <Link href="/connexion">Se connecter</Link></p>}
    {importPaused&&!manual && <p className="home-form-note" role="status">La limite des imports par lien est atteinte jusqu’au {new Date(me!.rights.importRetryAt!).toLocaleString('fr-FR')}. Vous pouvez ajouter vos informations et photos en saisie manuelle.</p>}
    {activeOtherJob && <p className="home-form-note">Une vidéo est déjà en cours de création. <Link href="/biens">Suivez-la dans Mes biens</Link>.</p>}
    <p className="home-create-note" id="home-create-note" hidden={manual?Boolean(me):!(screen.kind==='job'&&generationActive(selectedJob))&&!contextNote}>{manual ? '1 crédit offert pour créer votre vidéo sans compte. Connectez-vous pour la télécharger sans filigrane.' : screen.kind === 'job' && generationActive(selectedJob) ? me?'Votre création sera enregistrée dans Mes biens.':'Votre aperçu avec filigrane sera disponible dans ce navigateur.' : contextNote}</p>
    </div>
  </div>;
}
