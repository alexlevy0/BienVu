'use client';

import Link from 'next/link';
import {useEffect, useLayoutEffect, useRef, useState, type DragEvent, type FormEvent} from 'react';
import {ImportUrl, GenerationView, defaultVideoCustomization,GenerationCustomization, type VideoCustomization, type CreationDraftData, type CreationDraftView, type GenerationRequest} from '@bienvu/contracts';
import {useAnonymousTrial, TrialChallenge} from './anonymous-trial';
import {useAccount} from './account';
import {HomeIcon} from './home-icons';
import {ManualListingForm, type ManualListingFormHandle} from './manual-listing-form';
import {generationActive, useGenerationProgress} from './generation-progress';
import {ConversationGeneration} from './conversation-generation';
import {requestGeneration} from '../lib/generation-client';
import {clearListingDraft, readListingDraft, saveListingDraft} from '../lib/listing-draft';
import {inspectManualPhotos} from '../lib/manual-photos';
import {useSubtitlePreference} from './video-settings';
import {VideoCustomizer} from './video-customizer';

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
  const {me, loading} = useAccount();
  const {subtitlesEnabled,setSubtitlesEnabled}=useSubtitlePreference();
  const [screen, setScreen] = useState<Screen>({kind: 'landing'});
  const [customizing,setCustomizing]=useState(false),[guestSettings,setGuestSettings]=useState<VideoCustomization|undefined>();
  const pendingCustomization=useRef<{id:string;key:string}|null>(null);
  const [url, setUrl] = useState(''), [description, setDescription] = useState(''), [step, setStep] = useState(0);
  const [feedback, setFeedback] = useState(''), [manualBusy, setManualBusy] = useState(false);
  const [composerPhotos,setComposerPhotos]=useState<ComposerPhoto[]>([]),[photoChecking,setPhotoChecking]=useState(false),
    [dropActive,setDropActive]=useState(false),[incomingPhotos,setIncomingPhotos]=useState<{id:string;files:File[]}|null>(null);
  const stagedPhotos=useRef<ComposerPhoto[]>([]),dropDepth=useRef(0),photoLock=useRef(false),photoVersion=useRef(0);
  const [importDraft,setImportDraft]=useState<CreationDraftView|null>(null),[manualReady,setManualReady]=useState(false),
    [manualReason,setManualReason]=useState('Terminez les sections puis vérifiez votre annonce.'),
    [guestExtraction,setGuestExtraction]=useState<CreationDraftData|null>(null);
  const lock = useRef(false), startFresh = useRef(false), interactionVersion=useRef(0),
    scrollRegion = useRef<HTMLDivElement>(null),composerDock=useRef<HTMLDivElement>(null),
    composerAnimation=useRef<Animation|null>(null),previousComposer=useRef<DOMRect|null>(null),previousLayout=useRef(false);
  const manualForm=useRef<ManualListingFormHandle>(null);
  const pendingImport=useRef<{url:string;key:string}|null>(null);
  const guestPending=useRef<{text:string;key:string}|null>(null);
  const lastOwner=useRef<string|null>(null);
  const currentOwner=useRef<string|undefined>(me?.agency.id);currentOwner.current=me?.agency.id;
  const {job,jobs,setJob,unavailable,refreshDrafts} = useGenerationProgress(me?.agency.id);
  const trial = useAnonymousTrial(!loading && !me);
  const currentJob = me ? job : trial.job;
  const selectedJob = screen.kind === 'job' ? me?jobs.find(item=>item.id===screen.id)??null:
    currentJob?.id===screen.id?currentJob:null:null;
  const activeOtherJob = Boolean(currentJob && generationActive(currentJob) && screen.kind !== 'job');
  const busy = screen.kind === 'sending' || screen.kind==='extracting' || manualBusy;
  const canGenerate = Boolean(me?.rights.generationEnabled);
  const noCredits = canGenerate && me?.rights.developmentRemaining === 0;
  const importPaused = Boolean(me?.rights.importRetryAt);
  const manual = screen.kind === 'manual';
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
      forget();guestPending.current=null;setScreen({kind:'landing'});setUrl('');setDescription('');setStep(0);
      setImportDraft(null);setGuestExtraction(null);setFeedback('');
    }
    lastOwner.current=owner;
  },[loading,me?.agency.id]);

  useEffect(() => {
    const draft = readListingDraft();
    if (draft?.kind === 'url') setUrl(draft.url);
    if (draft?.kind === 'manual') setScreen({kind: 'manual'});
  }, []);
  useEffect(()=>{
    if(!me)return;const id=new URLSearchParams(window.location.search).get('draft');
    if(!id||!/^[a-zA-Z0-9_-]{1,80}$/.test(id))return;
    const controller=new AbortController(),version=interactionVersion.current;
    void fetch(`/api/imports/${encodeURIComponent(id)}`,{cache:'no-store',signal:controller.signal}).then(async response=>{
      if(!response.ok)return;const value=await response.json() as {status:string;draft?:CreationDraftView|null};
      if(controller.signal.aborted||interactionVersion.current!==version||value.status!=='needs_input'||!value.draft)return;
      interactionVersion.current++;
      startFresh.current=true;setImportDraft(value.draft);setGuestExtraction(null);
      setDescription(value.draft.data.fields.description??value.draft.data.originalText??'');setStep(0);setScreen({kind:'manual'});
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
      setCustomizing(false);setScreen({kind:'landing'});setImportDraft(null);setGuestExtraction(null);setUrl('');setDescription('');setStep(0);setFeedback('');setManualBusy(false);
      try{sessionStorage.removeItem(`bienvu:manual-start:${agencyId}`);}catch{/* Optional storage. */}
      if(location.searchParams.get('draft')===id){location.searchParams.delete('draft');
        window.history.replaceState(window.history.state,'',location.pathname+location.search+location.hash);}
    };
    window.addEventListener('bienvu:draft-deleted',deleted);return()=>window.removeEventListener('bienvu:draft-deleted',deleted);
  },[importDraft?.id]);
  useEffect(() => {if(manual)scrollRegion.current?.scrollTo({top:0,behavior:window.matchMedia('(prefers-reduced-motion: reduce)').matches?'instant':'smooth'});}, [manual,step]);
  useEffect(()=>{if(manual&&step===4)setFeedback(current=>
    current.startsWith('Les informations du bien ont été récupérées.')||
    current.startsWith('Certaines informations du bien sont à compléter')?'':current);},[manual,step]);
  useEffect(() => {
    if (!me || startFresh.current || readListingDraft()?.kind==='manual') return;
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
    if (!currentJob || startFresh.current || readListingDraft()?.kind==='manual'||screen.kind==='manual'||
      screen.kind === 'sending' || screen.kind==='guest-customizing' || screen.kind === 'error') return;
    const saved = remembered();
    if (screen.kind === 'job') return;
    if (generationActive(currentJob) || saved?.id === currentJob.id) {
      const request = saved?.id === currentJob.id ? saved.request : requestFor(currentJob, url);
      setScreen({kind: 'job', id: currentJob.id, request}); remember(currentJob.id, request);
    }
  }, [currentJob?.id, currentJob?.status, screen.kind]);
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
      interactionVersion.current++;lock.current=false;startFresh.current = true; forget(); setFeedback('');guestPending.current=null;
      trial.setToken('');trial.setChallenge(false);
      if (screen.kind !== 'manual') {setScreen({kind: 'landing'});setUrl('');setDescription('');setStep(0);}
    };
    window.addEventListener('bienvu:new-video', fresh);
    return () => window.removeEventListener('bienvu:new-video', fresh);
  }, [screen.kind]);

  async function create(input: GenerationRequest, request: RequestMessage) {
    const customization=manualForm.current?.customization();
    const owner=me!.agency.id,version=interactionVersion.current,next = await requestGeneration(owner, {...input,subtitlesEnabled,...(customization?{customization}:{})});
    if(currentOwner.current!==owner||interactionVersion.current!==version)return;
    setJob(next); setScreen({kind: 'job', id: next.id, request}); remember(next.id, request);
    if(pendingCustomization.current){sessionStorage.removeItem(`bienvu:customize:${owner}:${pendingCustomization.current.id}`);pendingCustomization.current=null;}
    setUrl('');
  }
  function openManual(fromText = '',initialData:CreationDraftData|null=null) {
    if (manualBusy||screen.kind==='sending'||(screen.kind === 'job' && generationActive(selectedJob))) return;
    previousComposer.current=composerDock.current?.getBoundingClientRect()??null;
    interactionVersion.current++;lock.current=false;startFresh.current = true;forget();
    if (fromText) setDescription(fromText);
    setImportDraft(null);setGuestExtraction(initialData);guestPending.current=null;trial.setToken('');trial.setChallenge(false);
    setCustomizing(false);setFeedback('');setStep(0);setScreen({kind: 'manual'});
  }
  async function analyzeGuest(text:string,key:string,token:string){
    if(lock.current||guestPending.current?.key!==key)return;
    const version=++interactionVersion.current;lock.current=true;setScreen({kind:'extracting',text});setFeedback('');
    try{const response=await fetch('/api/trial/describe',{method:'POST',headers:{'Content-Type':'application/json','Idempotency-Key':key},
      body:JSON.stringify({text,turnstileToken:token})});
      if(!response.ok)throw new Error('Analyse indisponible.');
      const value=await response.json() as {extraction:string;data:CreationDraftData|null};
      if(interactionVersion.current!==version)return;
      setGuestExtraction(value.data);setDescription(text);setStep(0);startFresh.current=true;forget();setScreen({kind:'manual'});
      if(value.extraction!=='ready')setFeedback('Vous pouvez compléter les informations manuellement. Votre texte est conservé.');
    }catch{if(interactionVersion.current!==version)return;setGuestExtraction(null);setDescription(text);setStep(0);startFresh.current=true;forget();
      setScreen({kind:'manual'});setFeedback('Vous pouvez compléter les informations manuellement. Votre texte est conservé.');}
    finally{if(interactionVersion.current===version){lock.current=false;guestPending.current=null;
      trial.setToken('');trial.setChallenge(false);trial.setWidgetVersion(n=>n+1);}}
  }
  async function personalize(){
    if(loading||busy||lock.current||activeOtherJob)return;
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
        setImportDraft(result.draft);setGuestExtraction(null);setDescription(text);setStep(0);setScreen({kind:'manual'});setCustomizing(true);
        startFresh.current=true;forget();void refreshDrafts();
      }catch{if(interactionVersion.current===version&&currentOwner.current===owner){openManual(text);setCustomizing(true);}}
      finally{if(interactionVersion.current===version)lock.current=false;}
      return;
    }
    if(!me){setGuestSettings(current=>current??defaultVideoCustomization());setScreen({kind:'guest-customizing',url:parsed.data});return;}
    const owner=me.agency.id,version=interactionVersion.current;
    lock.current=true;setFeedback('');startFresh.current=true;forget();setScreen({kind:'extracting',text:parsed.data});
    try{
      if(pendingImport.current?.url!==parsed.data){pendingImport.current={url:parsed.data,key:crypto.randomUUID()};
        sessionStorage.setItem('bienvu:url-import-request',JSON.stringify(pendingImport.current));}
      const response=await fetch('/api/imports',{method:'POST',headers:{'Content-Type':'application/json','Idempotency-Key':pendingImport.current.key},body:JSON.stringify({url:parsed.data})});
      const imported=await response.json() as {id?:string;status?:string;draft?:CreationDraftView;errorCode?:string;error?:{message?:string}};
      if(!response.ok)throw new Error(imported.error?.message??'La lecture de l’annonce a été interrompue.');
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
      setImportDraft(draft);setGuestExtraction(null);setDescription(draft.data.fields.description??'');setStep(4);setScreen({kind:'manual'});setCustomizing(true);
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
      if ((step === 4||customizing) && !manualBusy && !noCredits && !importPaused && !activeOtherJob)
        (document.getElementById('manual-guided-form') as HTMLFormElement | null)?.requestSubmit();
      return;
    }
    if (loading || busy || lock.current || noCredits || importPaused || activeOtherJob || screen.kind === 'job' && generationActive(selectedJob)) return;
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
          setImportDraft(result.draft);setGuestExtraction(null);setDescription(value);setStep(0);startFresh.current=true;forget();setScreen({kind:'manual'});
          if(result.extraction!=='ready')setFeedback('Vous pouvez compléter les informations manuellement. Votre texte est conservé.');
          else sessionStorage.removeItem('bienvu:description-request');
        }catch{if(interactionVersion.current===version&&currentOwner.current===owner){
          openManual(value);setFeedback('Vous pouvez compléter les informations manuellement. Votre texte est conservé.');}}
        finally{if(interactionVersion.current===version)lock.current=false;}
        return;
      }
      setFeedback('Collez un lien HTTPS public valide, ou décrivez votre bien pour la saisie manuelle.'); return;
    }
    const request: RequestMessage = {kind: 'url', text: parsed.data};
    const version=++interactionVersion.current,owner=me?.agency.id;
    forget();saveListingDraft({kind:'url',url:parsed.data});
    setFeedback('');lock.current = true;
    if (!me) {
      if (!trial.token) {await trial.start(parsed.data,undefined,subtitlesEnabled,guestSettings);lock.current = false;return;}
      setScreen({kind: 'sending', request});
      try {await trial.start(parsed.data,undefined,subtitlesEnabled,guestSettings);} finally {lock.current = false;}
      return;
    }
    setScreen({kind: 'sending', request});
    try {
      if(pendingImport.current?.url!==parsed.data){
        const stored=sessionStorage.getItem('bienvu:url-import-request'),prior=stored?JSON.parse(stored) as {url:string;key:string}:null;
        pendingImport.current=prior?.url===parsed.data?prior:{url:parsed.data,key:crypto.randomUUID()};
        sessionStorage.setItem('bienvu:url-import-request',JSON.stringify(pendingImport.current));
      }
      const response=await fetch('/api/imports',{method:'POST',headers:{'Content-Type':'application/json',
        'Idempotency-Key':pendingImport.current.key},body:JSON.stringify({url:parsed.data})});
      const imported=await response.json() as {id?:string;status?:string;errorCode?:string|null;draft?:CreationDraftView|null;error?:{message?:string}};
      if(interactionVersion.current!==version||currentOwner.current!==owner)return;
      if(!response.ok)throw new Error(imported.error?.message??'L’import a été interrompu. Réessayez.');
      if(imported.status==='needs_input'&&imported.draft){
        startFresh.current=true;forget();setImportDraft(imported.draft);setDescription(imported.draft.data.fields.description??'');
        setStep(0);setScreen({kind:'manual'});
        void refreshDrafts();
        setFeedback(imported.draft.photos.length<3?'Les informations du bien ont été récupérées. Ajoutez vos photos pour continuer.':
          'Certaines informations du bien sont à compléter avant de créer la vidéo.');
        return;
      }
      if(imported.status!=='ready'||!imported.id)throw new Error(imported.errorCode==='SOURCE_BLOCKED'
        ?'Ce site refuse actuellement la lecture automatique de cette annonce. Vous pouvez copier ses informations et ajouter vos photos en saisie manuelle.'
        :imported.errorCode==='IMPORT_TIMEOUT'?'La lecture de cette annonce a pris trop de temps. Vous pouvez continuer en saisie manuelle.'
        :'Cette annonce ne contient pas encore assez d’informations. Vous pouvez continuer manuellement.');
      pendingImport.current=null;sessionStorage.removeItem('bienvu:url-import-request');
      if(!canGenerate){setFeedback('Votre annonce est enregistrée. La création vidéo sera disponible dans votre espace.');setScreen({kind:'landing'});return;}
      await create({listingId:imported.id},request);
    }
    catch (error) {if(interactionVersion.current===version&&currentOwner.current===owner)
      setScreen({kind: 'error', request, message: error instanceof Error ? error.message : 'La connexion a été interrompue. Réessayez pour retrouver votre demande.'});}
    finally {if(interactionVersion.current===version)lock.current = false;}
  }
  const statusRequest = screen.kind === 'sending' || screen.kind === 'job' ? screen.request : null;
  const resultReady = screen.kind === 'job' && selectedJob?.status === 'ready';
  const composerDisabled = screen.kind==='guest-customizing'&&guestSettings&&!GenerationCustomization.safeParse(guestSettings).success || loading || busy || photoChecking || Boolean(incomingPhotos) || (composerPhotos.length
    ? screen.kind==='job'&&generationActive(selectedJob) : manual
    ? !manualReady||Boolean(noCredits)||Boolean(importPaused)||activeOtherJob
    : Boolean(noCredits)||Boolean(importPaused)||activeOtherJob||screen.kind==='job'&&
      (generationActive(selectedJob)||resultReady&&!url.trim()));
  const contextNote = !me ? 'Essayez gratuitement. Connectez-vous pour télécharger sans filigrane.' : canGenerate
    ? ''
    : 'Accès anticipé · Préparez votre annonce';
  return <div className={`home-create${inConversation ? ' home-create-conversation' : ''}${customizing||screen.kind==='guest-customizing'?' home-create-customizing':''}`}>
    <div ref={scrollRegion} className="home-conversation-scroll">
    {screen.kind==='guest-customizing'&&<VideoCustomizer sourceUrl={screen.url} settings={guestSettings??defaultVideoCustomization()} onChange={value=>{const {photoOrder,...settings}=value;setGuestSettings(settings);}} photos={[]} fields={{title:'Votre annonce',propertyType:'',transaction:'',locality:'',description:'',priceCents:'',charges:'',area:'',rooms:''}} agencyName="" subtitlesEnabled={subtitlesEnabled} onSubtitles={setSubtitlesEnabled} onBack={()=>setScreen({kind:'landing'})} onAdd={files=>{if(files){setIncomingPhotos({id:crypto.randomUUID(),files:Array.from(files)});openManual();setCustomizing(true);}}} busy={busy} ready onEdit={()=>{openManual();}} saved={false}/> }
    {manual && <div className="home-conversation-manual"><div className="home-request-bubble" style={customizing?{display:'none'}:undefined}><HomeIcon name={importDraft?.sourceUrl?'link':'pencil'} size={21}/>
      <strong>{importDraft?.sourceUrl??importDraft?.data.originalText??guestExtraction?.originalText??(description.trim()||'Je souhaite ajouter mon annonce manuellement.')}</strong></div>
      <p className="home-conversation-lead" style={customizing?{display:'none'}:undefined}>Décrivons votre bien, étape par étape.</p>
      <div className="home-manual-panel">
        {!me ? <ManualListingForm ref={manualForm} key="guest" initialCustomization={guestSettings} customizing={customizing} onCloseCustomizer={()=>setCustomizing(false)} subtitlesEnabled={subtitlesEnabled} onSubtitles={setSubtitlesEnabled} prepareGuest incomingPhotos={incomingPhotos} onPhotosReceived={receivePhotos} guided={{step,setStep,description,setDescription,initialData:guestExtraction,onCancel:()=>{previousComposer.current=composerDock.current?.getBoundingClientRect()??null;setCustomizing(false);setScreen({kind:'landing'});},
          onReadyChange:(ready,reason)=>{setManualReady(ready);setManualReason(reason);}}} busy={manualBusy} setBusy={setManualBusy} onPrepared={() => window.location.assign('/connexion?mode=signup')}/>
          : <ManualListingForm ref={manualForm} customizing={customizing} onCloseCustomizer={()=>setCustomizing(false)} brand={me.agency} subtitlesEnabled={subtitlesEnabled} onSubtitles={setSubtitlesEnabled} key={`agency:${me.agency.id}:${importDraft?.id??'manual'}`} incomingPhotos={incomingPhotos} onPhotosReceived={receivePhotos} generate={canGenerate} guided={{step,setStep,description,setDescription,agencyId:me.agency.id,initialDraft:importDraft,
            onReadyChange:(ready,reason)=>{setManualReady(ready);setManualReason(reason);},onDraftChange:()=>void refreshDrafts(),
            onCancel:()=>{previousComposer.current=composerDock.current?.getBoundingClientRect()??null;setCustomizing(false);setScreen({kind:'landing'});}}} busy={manualBusy} setBusy={setManualBusy} onCreated={async value => {
            void refreshDrafts();
            if (!canGenerate) {setFeedback('Votre annonce est enregistrée dans votre espace.');setScreen({kind:'landing'});clearListingDraft();return;}
            const request:RequestMessage={kind:'manual',text:'Je souhaite ajouter mon annonce manuellement.'};
            try {await create({listingId:value.id},request);clearListingDraft();}
            catch (error) {setFeedback(`Votre annonce est enregistrée. ${error instanceof Error ? error.message : 'La création vidéo n’a pas démarré.'} Réessayez pour reprendre cette même demande.`);throw error;}
          }}/>}
      </div></div>}
    {statusRequest && <ConversationGeneration job={selectedJob} request={statusRequest} sending={screen.kind === 'sending'} anonymous={!me} unavailable={unavailable}
      onRefresh={async () => {if (me && selectedJob) {const response=await fetch(`/api/generations/${selectedJob.id}`,{cache:'no-store'});if(response.ok)setJob(await response.json() as GenerationView);}
        else if(!me)await trial.refresh();}}/>}
    {screen.kind==='extracting'&&<div className="home-conversation-manual"><div className="home-request-bubble"><HomeIcon name="pencil" size={21}/><strong>{screen.text}</strong></div>
      <p className="home-conversation-lead" role="status">Nous préparons les informations de votre bien…</p></div>}
    </div>
    <div ref={composerDock} className="home-composer-dock"><form className={`home-composer${feedback || screen.kind === 'error' ? ' home-composer-invalid' : ''}${dropActive?' home-composer-dropping':''}`} onSubmit={submit} noValidate aria-label="Créer une vidéo depuis une annonce"
      onDragEnter={event=>{if(draggingFiles(event)&&canDropPhotos){event.preventDefault();dropDepth.current++;setDropActive(true);}}}
      onDragOver={event=>{if(draggingFiles(event)){event.preventDefault();event.dataTransfer.dropEffect=canDropPhotos?'copy':'none';}}}
      onDragLeave={event=>{if(draggingFiles(event)){dropDepth.current=Math.max(0,dropDepth.current-1);if(!dropDepth.current)setDropActive(false);}}}
      onDrop={event=>void dropPhotos(event)}>
      {dropActive&&<div className="home-drop-overlay" aria-hidden="true"><HomeIcon name="upload" size={30}/><strong>Déposez vos photos ici</strong><span>JPEG, PNG ou WebP · Jusqu’à 12 photos</span></div>}
      <div className="home-url-row"><HomeIcon name="link" size={28}/><label htmlFor="home-listing-url" className="sr-only">{manual?'Précisions sur votre bien':'Lien ou description de votre annonce'}</label>
        <input id="home-listing-url" name="url" type="text" autoComplete="off" spellCheck={false} placeholder={composerPhotos.length?'Décrivez votre bien, ou appuyez sur Entrée…':manual?'Ajoutez des précisions sur votre bien…':resultReady?'Collez le lien d’une autre annonce…':'Collez un lien ou décrivez votre bien…'}
          readOnly={customizing} value={manual?customizing?importDraft?.sourceUrl??importDraft?.data.canonicalUrl??importDraft?.data.fields.title??description:description:screen.kind==='sending'?'':url} onChange={event=>{if(manual)setDescription(event.target.value);
            else {if(screen.kind==='extracting'){interactionVersion.current++;lock.current=false;guestPending.current=null;
              trial.setToken('');trial.setChallenge(false);trial.setWidgetVersion(n=>n+1);setScreen({kind:'landing'});}setUrl(event.target.value);}
            setFeedback('');}} disabled={screen.kind==='sending'} aria-invalid={Boolean(feedback || screen.kind==='error')} aria-describedby="home-url-error home-create-note"/></div>
      {composerPhotos.length>0&&<div className="home-composer-attachments"><ol aria-label="Photos à ajouter à votre annonce">{composerPhotos.map((photo,index)=><li key={photo.id}>
        <img src={photo.preview} alt={`Photo ${index+1} : ${photo.file.name}`}/><button type="button" disabled={photoChecking||Boolean(incomingPhotos)} aria-label={`Retirer ${photo.file.name}`} onClick={()=>removeComposerPhoto(photo.id)}><HomeIcon name="close" size={14}/></button>
      </li>)}</ol><p role="status">{composerPhotos.length} photo{composerPhotos.length>1?'s':''} · Appuyez sur Entrée pour compléter votre annonce.</p></div>}
      {photoChecking&&<p className="home-photo-status" role="status">Vérification des photos…</p>}
      <div className="home-composer-bottom"><div className="home-format-tags"><span><HomeIcon name="phone" size={21}/>Vertical 9:16</span><span><HomeIcon name="microphone" size={21}/>Voix française</span>
        <button type="button" className={subtitlesEnabled?'home-subtitles-pill is-active':'home-subtitles-pill'} aria-pressed={subtitlesEnabled} aria-label="Sous-titres de la voix off"
          title="Afficher ou masquer les sous-titres de la voix off" disabled={loading||busy||screen.kind==='job'&&generationActive(selectedJob)}
          onClick={()=>setSubtitlesEnabled(!subtitlesEnabled)}><HomeIcon name="subtitles" size={20}/>Sous-titres</button>
        <button type="button" className={manual?'home-mode-pill is-active':'home-mode-pill'} aria-pressed={manual} disabled={busy || photoChecking || Boolean(incomingPhotos) || screen.kind==='job' && generationActive(selectedJob)} onClick={()=>{if(manual)void manualForm.current?.cancel();else if(composerPhotos.length)openWithPhotos();else openManual();}}><HomeIcon name="pencil" size={20}/>Saisie manuelle</button></div>
        <div className="home-composer-actions"><button type="button" className="home-customize-button" aria-pressed={customizing||screen.kind==='guest-customizing'} disabled={loading||busy||photoChecking||activeOtherJob||screen.kind==='job'&&generationActive(selectedJob)} onClick={()=>void personalize()}><HomeIcon name="settings" size={21}/>Personnaliser</button>
        <button type="submit" className="home-primary-button" disabled={composerDisabled} aria-describedby={manual&&!manualReady?'home-manual-action-note':undefined}>
          {incomingPhotos?'Ajout des photos…':composerPhotos.length?'Compléter mon annonce':screen.kind==='sending'||manualBusy?'Envoi en cours':screen.kind==='job'&&generationActive(selectedJob)?'Génération en cours':manual&&me&&!canGenerate?'Enregistrer mon annonce':'Créer ma vidéo'}<HomeIcon name="arrow" size={20}/></button></div></div>
    </form>
    {manual&&!manualReady&&<p id="home-manual-action-note" className="home-form-note" role="status">{manualReason}</p>}
    {screen.kind==='error'&&<p className="home-form-feedback" role="alert">{screen.message} Votre saisie est conservée pour réessayer.</p>}
    {feedback && <p className="home-form-feedback" id="home-url-error" role="alert">{feedback}</p>}
    {!me && trial.challenge && trial.siteKey && <TrialChallenge siteKey={trial.siteKey} version={trial.widgetVersion}
      purpose={guestPending.current?'description':'trial'} onToken={token=>{trial.setToken(token);if(!token)return;
        const pending=guestPending.current;if(pending){trial.setChallenge(false);void analyzeGuest(pending.text,pending.key,token);return;}
        const parsed=ImportUrl.safeParse(url.trim());if(!parsed.success){trial.setChallenge(false);setFeedback('Collez un lien HTTPS public valide.');return;}
        trial.setChallenge(false);setScreen({kind:'sending',request:{kind:'url',text:parsed.data}});
        void trial.start(parsed.data,token,subtitlesEnabled,guestSettings);
      }} onError={trial.setFailure}/>}
    {!me && trial.failure && screen.kind !== 'error' && <p className="home-form-feedback" role="alert">{trial.failure} <Link href="/connexion">Se connecter</Link></p>}
    {importPaused && <p className="home-form-note" role="status">La limite d’imports est atteinte. Vous pourrez ajouter une annonce à partir du {new Date(me!.rights.importRetryAt!).toLocaleString('fr-FR')}.</p>}
    {activeOtherJob && <p className="home-form-note">Une vidéo est déjà en cours de création. <Link href="/historique">Suivez-la dans Mes vidéos</Link>.</p>}
    <p className="home-create-note" id="home-create-note" hidden={!manual&&!(screen.kind==='job'&&generationActive(selectedJob))&&!contextNote}>{manual ? 'Votre brouillon reste sur cet appareil pendant une heure.' : screen.kind === 'job' && generationActive(selectedJob) ? 'Votre création sera enregistrée dans Mes vidéos.' : contextNote}</p>
    </div>
  </div>;
}
