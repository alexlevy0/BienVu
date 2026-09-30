'use client';
import {useEffect, useImperativeHandle, useRef, useState, type ChangeEvent, type FormEvent, type Ref} from 'react';
import {DESCRIPTION_MAX_CHARACTERS, ManualListingInput, MANUAL_PHOTO_LIMITS, publicErrors, type PublicErrorCode,
  type CreationDraftData, type CreationDraftView, type NormalizedListing} from '@bienvu/contracts';
import {HomeIcon} from './home-icons';
import type {ImportView} from './generation-form';
import {manualDraftFields, readManualListingDraft, saveManualListingDraft, type ManualDraft, type ManualDraftFields} from '../lib/listing-draft';

type SelectedPhoto = {id: string; file: File|null; preview: string; remote?:NormalizedListing['photos'][number]; state:'ready'|'sending'|'error'; slot:number};
type Guided={step:number;setStep(step:number):void;description:string;setDescription(value:string):void;onCancel():void;
  agencyId?:string;initialDraft?:CreationDraftView|null;initialData?:CreationDraftData|null;
  onReadyChange?(ready:boolean,reason:string):void;onDraftChange?():void};
export type ManualListingFormHandle = {cancel():Promise<void>};
class FormFailure extends Error {}
const labels: Record<string, string> = {title: 'titre', locality: 'localisation', propertyType: 'type de bien', description: 'description',
  priceCents: 'prix', charges: 'charges', area: 'surface', rooms: 'nombre de pièces', photos: 'photos'};
type Props = {busy: boolean; generate?: boolean; setBusy(value: boolean): void;guided?:Guided;ref?:Ref<ManualListingFormHandle>} & (
  {prepareGuest: true; onPrepared(): void; onCreated?: never} |
  {prepareGuest?: false; onCreated(value: ImportView): Promise<void>; onPrepared?: never}
);
export function ManualListingForm(props: Props) {
  const {busy, setBusy, generate = false} = props;
  const [transaction, setTransaction] = useState(props.guided?'':'sale'), [photos, setPhotos] = useState<SelectedPhoto[]>([]);
  const [propertyType,setPropertyType]=useState(props.guided?'':'apartment'),[hydrated,setHydrated]=useState(false),[photoChecking,setPhotoChecking]=useState(false),[reached,setReached]=useState(0);
  const [photoIssues,setPhotoIssues]=useState<string[]>([]),[revision,setRevision]=useState(0);
  const [errors, setErrors] = useState<Record<string, string>>({}), [feedback, setFeedback] = useState(''), [progress, setProgress] = useState('');
  const [restored, setRestored] = useState<ManualDraft | null>(null);
  const [guestConfirmed,setGuestConfirmed]=useState<Set<string>>(new Set());
  const [completed,setCompleted]=useState(false),completedRef=useRef<ImportView|null>(null);
  const [serverDraft,setServerDraft]=useState<CreationDraftView|null>(props.guided?.initialDraft??null);
  const serverRef=useRef<CreationDraftView|null>(props.guided?.initialDraft??null),draftPromise=useRef<Promise<CreationDraftView>|null>(null);
  const history=useRef<number[]>([]);
  const selected = useRef(photos), pending = useRef<{fingerprint: string; key: string} | null>(null),formRef=useRef<HTMLFormElement>(null),submitLock=useRef(false);
  const removedIds=useRef<Set<string>>(new Set());
  useImperativeHandle(props.ref,()=>({cancel:cancelGuided}));
  selected.current = photos;
  function finalInput(){
    if(!formRef.current)return null;
    const data=new FormData(formRef.current),value=(name:string)=>String(data.get(name)??'').trim();
    const number=(name:string)=>{const raw=value(name).replace(/\s/g,'');return !raw?null:/^\d+(?:[.,]\d{1,2})?$/.test(raw)?Number(raw.replace(',','.')):NaN;};
    const price=number('priceCents');
    return ManualListingInput.safeParse({title:value('title'),propertyType:props.guided?propertyType:value('propertyType'),transaction,
      locality:value('locality'),description:props.guided?props.guided.description:value('description'),
      priceCents:price===null?null:Math.round(price*100),charges:transaction==='rent'?value('charges')||null:null,
      area:number('area'),rooms:number('rooms'),photos:photos.map((photo,index)=>({hash:photo.remote?.contentHash??index.toString(16).padStart(64,'0'),
        size:photo.remote?.sizeBytes??photo.file?.size??0,mime:photo.remote?.mime??photo.file?.type??'image/jpeg'}))});
  }
  const provenanceData=serverDraft?.data??props.guided?.initialData;
  const unresolved=()=>provenanceData?Object.entries(provenanceData.provenance).filter(([name,source])=>{
    if(!source?.confirm||guestConfirmed.has(name)||!formRef.current)return false;
    const current=name==='propertyType'?propertyType:name==='transaction'?transaction:name==='description'?props.guided?.description:
      String(new FormData(formRef.current).get(name)??'').trim();
    const original=provenanceData.fields[name as keyof typeof provenanceData.fields];
    return String(original??'')===String(name==='priceCents'&&current?Number(current.replace(/\s/g,'').replace(',','.'))*100:current??'');
  }):[];
  useEffect(()=>{if(!props.guided)return;
    const fieldsValid=finalInput()?.success===true;
    const ready=completed||hydrated&&props.guided.step===4&&fieldsValid&&unresolved().length===0&&photos.filter(photo=>photo.state==='ready').length>=3&&
      !photos.some(photo=>photo.state!=='ready')&&(!props.guided.agencyId||Boolean(serverDraft));
    const reason=completed?'':!hydrated?'Chargement du brouillon en cours.':props.guided.step!==4?'Terminez les sections puis vérifiez votre annonce.':
      unresolved().length?'Confirmez les informations signalées avant la création.':
      photos.some(photo=>photo.state==='sending')?'Envoi des photos en cours.':photos.some(photo=>photo.state==='error')?
      'Réessayez ou retirez les photos en erreur.':photos.length<3?'Ajoutez au moins trois photos.':!serverDraft&&props.guided.agencyId?
      'Préparation du brouillon privé en cours.':!fieldsValid?'Vérifiez les informations du bien dans les sections indiquées.':'';
    props.guided.onReadyChange?.(ready,reason);
  },[props.guided?.step,props.guided?.agencyId,props.guided?.description,hydrated,photos,serverDraft,revision,propertyType,transaction,completed,guestConfirmed]);
  async function confirmField(name:string){
    const draft=serverRef.current;if(!draft){setGuestConfirmed(current=>new Set([...current,name]));return;}
    try{const response=await fetch(`/api/imports/${draft.id}/draft`,{method:'PATCH',headers:{'Content-Type':'application/json'},
      body:JSON.stringify({version:draft.version,changes:{},confirm:[name]})});
      if(!response.ok)throw 0;const updated=await response.json() as CreationDraftView;serverRef.current=updated;setServerDraft(updated);
    }catch{setFeedback('Confirmation interrompue. Réessayez.');}
  }
  useEffect(() => () => selected.current.forEach(photo => {if(photo.file)URL.revokeObjectURL(photo.preview);}), []);
  async function ensureServerDraft():Promise<CreationDraftView>{
    if(serverRef.current)return serverRef.current;
    if(!props.guided?.agencyId)throw new FormFailure('Connectez-vous pour envoyer des photos.');
    if(draftPromise.current)return draftPromise.current;
    draftPromise.current=(async()=>{
      const saved=await readManualListingDraft(props.guided!.agencyId);
      if(saved?.serverDraftId){const response=await fetch(`/api/imports/${saved.serverDraftId}/draft`,{cache:'no-store'});
        if(response.ok){const value=await response.json() as CreationDraftView;serverRef.current=value;setServerDraft(value);
          props.guided?.onDraftChange?.();return value;}
        const finished=await fetch(`/api/imports/${saved.serverDraftId}`,{cache:'no-store'});
        if(finished.ok){const value=await finished.json() as ImportView;
          if(value.status==='ready'){completedRef.current=value;setCompleted(true);
            throw new FormFailure('Votre annonce est enregistrée. Reprenez la création de sa vidéo.');}}}
      const keyName=`bienvu:manual-start:${props.guided!.agencyId}`;
      let key=sessionStorage.getItem(keyName);if(!key){key=crypto.randomUUID();sessionStorage.setItem(keyName,key);}
      const response=await fetch('/api/imports/draft',{method:'POST',headers:{'Idempotency-Key':key}});
      if(!response.ok)throw new FormFailure('Impossible de préparer le brouillon privé. Réessayez.');
      const value=await response.json() as CreationDraftView;serverRef.current=value;setServerDraft(value);
      props.guided?.onDraftChange?.();return value;
    })().finally(()=>{draftPromise.current=null;});
    return draftPromise.current;
  }
  const fieldsFromData=(data:CreationDraftData):ManualDraftFields=>({
    title:data.fields.title??'',propertyType:data.fields.propertyType??'',transaction:data.fields.transaction??'',
    locality:data.fields.locality??'',description:data.fields.description??data.originalText??'',
    priceCents:data.fields.priceCents===null?'':String(data.fields.priceCents/100),
    charges:data.fields.charges??'',area:data.fields.area===null?'':String(data.fields.area),
    rooms:data.fields.rooms===null?'':String(data.fields.rooms)});
  const firstMissing=(data:CreationDraftData,photoCount:number)=>!data.fields.propertyType||!data.fields.transaction?0
    :!data.fields.title||!data.fields.locality?1:photoCount<3?3:4;
  useEffect(() => {
    let active = true;
    void (async()=>{const draft=props.guided?.initialData?null:await readManualListingDraft(props.guided?.agencyId);
      if (!active) return;
      let remote=props.guided?.initialDraft??null;
      if(props.guided?.agencyId){try{remote=remote??await ensureServerDraft();}catch(error){if(active){setFeedback(error instanceof Error?error.message:'Brouillon indisponible.');
        if(completedRef.current)props.guided.setStep(4);}}}
      if(!active)return;
      const fromGuest=Boolean(remote&&draft&&!draft.agencyId&&!draft.serverDraftId&&remote.sourceKind==='manual'&&
        !remote.data.fields.title&&remote.photos.length===0);
      const sameRemoteVersion=Boolean(draft?.serverDraftId===remote?.id&&draft?.serverDraftVersion===remote?.version);
      if(remote&&draft?.serverDraftId===remote.id&&!sameRemoteVersion)
        setFeedback('Le brouillon enregistré sur le serveur a changé. Ses dernières informations ont été rechargées.');
      const restoredDraft=remote ? {fields:sameRemoteVersion||fromGuest?draft!.fields:fieldsFromData(remote.data),
        photos:fromGuest?draft!.photos:[],savedAt:Date.now(),step:sameRemoteVersion||fromGuest?draft!.step:firstMissing(remote.data,remote.photos.length),
        agencyId:props.guided?.agencyId,serverDraftId:remote.id,serverDraftVersion:remote.version}
        :props.guided?.initialData?{fields:fieldsFromData(props.guided.initialData),photos:[],savedAt:Date.now(),
          step:firstMissing(props.guided.initialData,0)}:draft;
      if(restoredDraft){
        setRestored(restoredDraft); setTransaction(restoredDraft.fields.transaction||(!props.guided?'sale':''));
        setPropertyType(restoredDraft.fields.propertyType||(!props.guided?'apartment':''));
        const restoredPhotos=remote&&!fromGuest?remote.photos.map(photo=>({id:photo.id,file:null,preview:`/api/imports/${remote!.id}/photos/${photo.id}`,
          remote:photo,state:'ready' as const,slot:photo.sourceOrder})):restoredDraft.photos.map((file,index) => ({id: crypto.randomUUID(), file,
          preview: URL.createObjectURL(file),state:fromGuest?'sending' as const:'ready' as const,slot:index}));
        selected.current=restoredPhotos;setPhotos(restoredPhotos);
        if(fromGuest)for(const photo of restoredPhotos)void uploadSelected(photo);
        if(props.guided){props.guided.setDescription(sameRemoteVersion||fromGuest
          ?props.guided.description.trim()||restoredDraft.fields.description:restoredDraft.fields.description);
          props.guided.setStep(restoredDraft.step);setReached(remote||props.guided.initialData?4:restoredDraft.step);}
      }
      setHydrated(true);
    })();
    return () => {active = false;};
  }, []);
  function draftFields(){
    const data=new FormData(formRef.current!);
    return Object.fromEntries(manualDraftFields.map(name=>[name,name==='transaction'?transaction:
      name==='propertyType'&&props.guided?propertyType:name==='description'&&props.guided?props.guided.description:String(data.get(name)??'')])) as Record<typeof manualDraftFields[number],string>;
  }
  useEffect(()=>{
    if(!props.guided||!hydrated||!formRef.current)return;
    const timer=setTimeout(()=>{void saveManualListingDraft(draftFields(),props.guided!.agencyId?[]:photos.flatMap(p=>p.file?[p.file]:[]),
      props.guided!.step,props.guided!.agencyId,serverRef.current?.id,serverRef.current?.version);},650);
    return()=>clearTimeout(timer);
  // FormData captures the latest DOM values after each field edit.
  },[hydrated,photos,transaction,propertyType,revision,props.guided?.description,props.guided?.step,serverDraft?.version]);
  async function addPhotos(files: FileList | null) {
    if (!files) return;
    const added = Array.from(files), all = [...photos.flatMap(p=>p.file?[p.file]:[]), ...added];
    const failure = photos.length+added.length > MANUAL_PHOTO_LIMITS.maximum ? 'Choisissez 12 photos maximum.'
      : added.some(f => !['image/jpeg', 'image/png', 'image/webp'].includes(f.type)) ? 'Utilisez des photos JPEG, PNG ou WebP.'
      : added.some(f => !f.size || f.size > MANUAL_PHOTO_LIMITS.fileBytes) ? 'Chaque photo doit peser moins de 10 Mo.'
      : all.reduce((sum, f) => sum + f.size, photos.reduce((sum,p)=>sum+(p.file?0:p.remote?.sizeBytes??0),0)) > MANUAL_PHOTO_LIMITS.totalBytes
        ? 'Les photos dépassent 50 Mo au total.' : '';
    setErrors(previous => ({...previous, photos: failure}));setPhotoIssues([]);setFeedback('');
    if(failure)return;
    setPhotoChecking(true);
    const accepted:File[]=[],issues:string[]=[];
    try {for(const file of added){
      try {const bitmap=await createImageBitmap(file);const {width,height}=bitmap;bitmap.close();
        if(width<640||height<360||width*height>16_000_000)issues.push(`${file.name} : 640 × 360 pixels minimum, 16 millions de pixels maximum.`);
        else accepted.push(file);
      }catch{issues.push(`${file.name} : cette image ne peut pas être lue.`);}
    }}finally{setPhotoChecking(false);}
    if(issues.length)setPhotoIssues(issues);
    if(accepted.length){
      const used=new Set(photos.map(p=>p.slot));
      const additions=accepted.map(file=>{let slot=0;while(used.has(slot))slot++;used.add(slot);
        return {id:crypto.randomUUID(),file,preview:URL.createObjectURL(file),state:props.guided?.agencyId?'sending' as const:'ready' as const,slot};});
      setPhotos(current=>[...current,...additions]);
      if(props.guided?.agencyId)for(const photo of additions)void uploadSelected(photo);
    }
  }
  async function uploadSelected(photo:SelectedPhoto){
    if(!photo.file)return;
    setPhotos(current=>current.map(item=>item.id===photo.id?{...item,state:'sending'}:item));
    try{const draft=await ensureServerDraft();const response=await fetch(`/api/imports/${draft.id}/uploads/${photo.slot}`,{
      method:'PUT',headers:{'Content-Type':photo.file.type,'X-Upload-ID':photo.id},body:photo.file});
      if(!response.ok)throw new FormFailure('Cette photo n’a pas été envoyée. Réessayez.');
      const value=await response.json() as {photo:NormalizedListing['photos'][number]};
      if(removedIds.current.has(photo.id)||!selected.current.some(item=>item.id===photo.id)){
        await fetch(`/api/imports/${draft.id}/uploads/${photo.slot}`,{method:'DELETE',headers:{'X-Upload-ID':photo.id}});return;}
      setPhotos(current=>current.map(item=>item.id===photo.id?{...item,remote:value.photo,state:'ready'}:item));
    }catch{if(!removedIds.current.has(photo.id)&&selected.current.some(item=>item.id===photo.id))
      setPhotos(current=>current.map(item=>item.id===photo.id?{...item,state:'error'}:item));}
  }
  async function removePhoto(photo:SelectedPhoto){
    removedIds.current.add(photo.id);
    if(props.guided?.agencyId){try{const draft=await ensureServerDraft();const response=await fetch(`/api/imports/${draft.id}/uploads/${photo.slot}`,{
      method:'DELETE',headers:{'X-Upload-ID':photo.id}});
      if(!response.ok)throw 0;
    }catch{removedIds.current.delete(photo.id);setFeedback('Cette photo n’a pas pu être retirée du brouillon privé. Réessayez.');return;}}
    if(photo.file)URL.revokeObjectURL(photo.preview);
    setPhotos(current=>current.filter(p=>p.id!==photo.id));setErrors(current=>({...current,photos:''}));
  }
  function focusError(name:string){requestAnimationFrame(()=>formRef.current?.querySelector<HTMLElement>(name==='photos'?'#manual-photos':`[name="${name}"]`)?.focus());}
  async function nextStep(){
    if(!props.guided||busy||photoChecking)return;
    const step=props.guided.step,data=new FormData(formRef.current!),text=(key:string)=>String(data.get(key)??'').trim();
    const next:Record<string,string>={};
    if(step===0){if(!['apartment','house','other'].includes(propertyType))next.propertyType='Choisissez le type de bien.';
      if(!['sale','rent'].includes(transaction))next.transaction='Choisissez Vente ou Location.';}
    if(step===1){if(text('title').length<3||text('title').length>200)next.title='Indiquez un titre de 3 à 200 caractères.';
      if(text('locality').length<2||text('locality').length>200)next.locality='Indiquez une localisation de 2 à 200 caractères.';}
    if(step===2){
      const decimal=(value:string)=>value.replace(/\s/g,'').replace(',','.');
      for(const [field,max] of [['priceCents',1_000_000_000],['area',100_000]] as const){const v=text(field);if(v&&(!/^\d+(?:[.,]\d{1,2})?$/.test(v.replace(/\s/g,''))||Number(decimal(v))<=0||Number(decimal(v))>max))next[field]='Indiquez une valeur positive valide.';}
      const rooms=text('rooms');if(rooms&&(!/^\d+$/.test(rooms)||Number(rooms)<1||Number(rooms)>100))next.rooms='Indiquez de 1 à 100 pièces.';
      if(transaction==='rent'&&text('priceCents')&&!text('charges'))next.charges='Précisez si les charges sont comprises.';
      if(props.guided.description.length>DESCRIPTION_MAX_CHARACTERS)next.description='Limitez la description à 20 000 caractères.';
    }
    if(step===3){if(photos.filter(p=>p.state==='ready').length<MANUAL_PHOTO_LIMITS.minimum)next.photos='Ajoutez au moins 3 photos du bien.';
      else if(photos.some(p=>p.state==='sending'||p.state==='error'))next.photos='Terminez ou retirez les envois en attente.';
      else {setPhotoChecking(true);try{const hashes=await Promise.all(photos.map(async p=>p.remote?.contentHash??Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',await p.file!.arrayBuffer())),n=>n.toString(16).padStart(2,'0')).join('')));
        if(new Set(hashes).size!==hashes.length)next.photos='Choisissez des photos différentes du bien.';
      }finally{setPhotoChecking(false);}}
    }
    if(Object.keys(next).length){setErrors(previous=>({...previous,...next}));focusError(Object.keys(next)[0]);return;}
    const fields=draftFields(),nextStep=step===0&&fields.title&&fields.locality?photos.filter(p=>p.state==='ready').length>=3?4:3
      :step===1?photos.filter(p=>p.state==='ready').length>=3?4:3:step===2?photos.filter(p=>p.state==='ready').length>=3?4:3:Math.min(4,step+1);
    history.current.push(step);setReached(value=>Math.max(value,nextStep));props.guided.setStep(nextStep);
    void saveManualListingDraft(fields,props.guided.agencyId?[]:photos.flatMap(p=>p.file?[p.file]:[]),nextStep,props.guided.agencyId,
      serverRef.current?.id,serverRef.current?.version);
  }
  async function cancelGuided(){if(!props.guided)return;
    if(!hydrated){setFeedback('Chargement du brouillon en cours. Réessayez dans un instant.');return;}
    if(!await saveManualListingDraft(draftFields(),props.guided.agencyId?[]:photos.flatMap(p=>p.file?[p.file]:[]),
      props.guided.step,props.guided.agencyId,serverRef.current?.id,serverRef.current?.version)){
      setFeedback('Impossible de conserver le brouillon sur cet appareil. Gardez ce formulaire ouvert et réessayez.');return;
    }
    props.guided.onCancel();
  }
  useEffect(()=>{
    if(!props.guided)return;
    const leave=()=>{void cancelGuided();};
    window.addEventListener('bienvu:new-video',leave);
    return()=>window.removeEventListener('bienvu:new-video',leave);
  });
  async function send(path: string, options: RequestInit) {
    const response = await fetch(path, {...options, signal: AbortSignal.timeout(30_000)});
    const value = await response.json() as ImportView & {error?: {code: PublicErrorCode}; fields?: Record<string, string>};
    if (!response.ok) {
      if (value.fields) {setErrors(value.fields);if(props.guided&&value.fields.photos)props.guided.setStep(3);}
      throw new FormFailure(value.error?.code && value.error.code in publicErrors ? publicErrors[value.error.code][1] : 'L’enregistrement a échoué. Réessayez.');
    }
    return value;
  }
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (busy||photoChecking||submitLock.current||props.guided&&props.guided.step!==4) return;
    const form = event.currentTarget, data = new FormData(form), validatedBefore=finalInput();
    const text = (name: string) => String(data.get(name) ?? '').trim();
    const number = (name: string) => {
      const value = text(name).replace(/\s/g, '');
      return !value ? null : /^\d+(?:[.,]\d{1,2})?$/.test(value) ? Number(value.replace(',', '.')) : NaN;
    };
    submitLock.current=true;setErrors({}); setFeedback(''); setBusy(true); setProgress('Préparation des photos…');
    try {
      if(completedRef.current&&!props.prepareGuest){
        await props.onCreated(completedRef.current);completedRef.current=null;setCompleted(false);
        try{sessionStorage.removeItem(`bienvu:manual-start:${props.guided?.agencyId}`);}catch{}
        return;
      }
      if(props.guided?.agencyId){
        const draft=await ensureServerDraft(),price=number('priceCents');
        const validated=validatedBefore;if(!validated?.success){
          if(validated){const fields:Record<string,string>={};for(const issue of validated.error.issues)
            fields[String(issue.path[0]??'form')]=issue.message;setErrors(fields);}
          throw new FormFailure('Vérifiez les champs indiqués avant de créer la vidéo.');}
        if(photos.some(photo=>photo.state!=='ready')||photos.filter(photo=>photo.remote).length<3)
          throw new FormFailure('Complétez l’envoi de trois photos valides avant de créer la vidéo.');
        const changes={title:text('title')||null,propertyType:propertyType||null,transaction:transaction||null,
          locality:text('locality')||null,description:props.guided.description||null,
          priceCents:price===null?null:Math.round(price*100),charges:transaction==='rent'?text('charges')||null:null,
          area:number('area'),rooms:number('rooms')};
        const response=await fetch(`/api/imports/${draft.id}/draft`,{method:'PATCH',headers:{'Content-Type':'application/json'},
          body:JSON.stringify({version:draft.version,changes,confirm:[]})});
        const updated=await response.json() as CreationDraftView&{error?:{message?:string};fields?:Record<string,string>};
        if(!response.ok){if(updated.fields)setErrors(updated.fields);throw new FormFailure(updated.error?.message??'Le brouillon a changé. Rechargez ses données et réessayez.');}
        serverRef.current=updated;setServerDraft(updated);
        setProgress('Validation de votre annonce…');
        const result=await send(`/api/imports/${draft.id}/complete`,{method:'POST',headers:{'Content-Type':'application/json'},
          body:JSON.stringify({version:updated.version})});
        completedRef.current=result;setCompleted(true);
        if(!props.prepareGuest)await props.onCreated(result);
        completedRef.current=null;setCompleted(false);
        try{sessionStorage.removeItem(`bienvu:manual-start:${props.guided.agencyId}`);}catch{}
        setRestored(null);setPhotos([]);return;
      }
      const files = [];
      for (const photo of photos) {
        const digest = await crypto.subtle.digest('SHA-256', await photo.file!.arrayBuffer());
        files.push({hash: Array.from(new Uint8Array(digest), n => n.toString(16).padStart(2, '0')).join(''), size: photo.file!.size, mime: photo.file!.type});
      }
      const price = number('priceCents');
      const parsed = ManualListingInput.safeParse({title: text('title'), propertyType: props.guided?propertyType:text('propertyType'), transaction,
        locality: text('locality'), description: text('description'), priceCents: price === null ? null : Math.round(price * 100),
        charges: transaction === 'rent' ? text('charges') || null : null, area: number('area'), rooms: number('rooms'), photos: files});
      if (!parsed.success) {
        const fields: Record<string, string> = {};
        for (const issue of parsed.error.issues) {
          const field = String(issue.path[0] ?? 'form');
          fields[field] = issue.code === 'custom' ? issue.message : field === 'photos' ? 'Ajoutez au moins 3 photos différentes du bien.'
            : field === 'title' ? 'Indiquez un titre de 3 à 200 caractères.' : field === 'locality' ? 'Indiquez une localisation de 2 à 200 caractères.'
            : field === 'propertyType' ? 'Choisissez le type de bien.' : field === 'description' ? 'Limitez la description à 20 000 caractères.'
            : field === 'rooms' ? 'Indiquez un nombre entier de 1 à 100.' : 'Indiquez un montant ou une surface valide, supérieur à zéro.';
        }
        setErrors(fields);
        if(props.guided){const first=Object.keys(fields)[0];const target=['propertyType','transaction'].includes(first)?0:['title','locality'].includes(first)?1:['photos'].includes(first)?3:2;
          props.guided.setStep(target);focusError(first);}
        throw new FormFailure('Vérifiez les champs indiqués avant d’enregistrer.');
      }
      if (props.prepareGuest) {
        setProgress('Conservation de votre annonce dans ce navigateur…');
        const fields = Object.fromEntries(manualDraftFields.map(name => [name, name === 'transaction' ? transaction : name==='propertyType'&&props.guided?propertyType:
          name==='description'&&props.guided?props.guided.description:text(name)])) as Record<typeof manualDraftFields[number], string>;
        if (!await saveManualListingDraft(fields, photos.flatMap(photo=>photo.file?[photo.file]:[]),props.guided?.step??0))
          throw new FormFailure('Impossible de conserver votre annonce sur cet appareil. Gardez cette page ouverte et réessayez.');
        props.onPrepared(); return;
      }
      const fingerprint = JSON.stringify(parsed.data);
      if (pending.current?.fingerprint !== fingerprint) pending.current = {fingerprint, key: crypto.randomUUID()};
      const draft = await send('/api/imports/manual', {method: 'POST', headers: {'Content-Type': 'application/json', 'Idempotency-Key': pending.current.key}, body: fingerprint});
      let result = draft;
      if (draft.status !== 'ready') {
        for (const [index, photo] of photos.entries()) {
          setProgress(`Envoi et vérification de la photo ${index + 1} sur ${photos.length}…`);
          await send(`/api/imports/${draft.id}/uploads/${index}`, {method: 'PUT', headers: {'Content-Type': photo.file!.type}, body: photo.file!});
        }
        setProgress('Enregistrement de votre annonce…');
        result = await send(`/api/imports/${draft.id}/complete`, {method: 'POST'});
      }
      await props.onCreated(result); pending.current = null;
      form.reset(); setRestored(null); setTransaction('sale');setPropertyType('apartment');photos.forEach(photo => {if(photo.file)URL.revokeObjectURL(photo.preview);}); setPhotos([]);
    } catch (error) {setFeedback(error instanceof FormFailure ? error.message : 'L’envoi a été interrompu. Réessayez avec les mêmes informations et photos.');}
    finally {submitLock.current=false;setBusy(false); setProgress('');}
  }
  const error = (name: string) => errors[name] ? <p id={`manual-${name}-error`} className="form-feedback error">{errors[name]}</p> : null;
  const attributes = (name: string) => ({id: `manual-${name}`, name, 'aria-invalid': Boolean(errors[name]), 'aria-describedby': errors[name] ? `manual-${name}-error` : undefined});
  const summaryValue=(name:keyof ManualDraftFields)=>{
    const control=formRef.current?.elements.namedItem(name);
    return control instanceof HTMLInputElement || control instanceof HTMLTextAreaElement || control instanceof HTMLSelectElement
      ? control.value : restored?.fields[name]??'';
  };
  const sectionComplete=(index:number)=>index===0?Boolean(propertyType&&transaction):index===1?
    summaryValue('title').trim().length>=3&&summaryValue('locality').trim().length>=2:index===2?true:index===3?
    photos.filter(photo=>photo.state==='ready').length>=3&&!photos.some(photo=>photo.state!=='ready'):false;
  return <form ref={formRef} id={props.guided?'manual-guided-form':undefined} className={`manual-listing-form${props.guided?' manual-guided-form':''}`} onSubmit={submit} noValidate
    onKeyDown={event=>{if(props.guided&&event.key==='Enter'&&event.target instanceof HTMLInputElement&&event.target.type==='text'){
      event.preventDefault();if(props.guided.step<4)void nextStep();
    }}}
    onChange={({target}) => {
    if (target instanceof HTMLInputElement || target instanceof HTMLSelectElement || target instanceof HTMLTextAreaElement) {
      if (target.name) setErrors(current => ({...current, [target.name]: '', ...(target.name === 'transaction' ? {charges: ''} : {})}));
      setFeedback('');setRevision(value=>value+1);
    }
  }}>
    {props.guided?<><div className="manual-step-header"><span>ÉTAPE {props.guided.step+1} SUR 5</span><div className="manual-step-bars" aria-hidden="true">{[0,1,2,3,4].map(index=><i key={index} className={index<=props.guided!.step?'is-current':''}/>)}</div></div>
      <nav className="manual-step-nav" aria-label="Étapes du formulaire">{['Bien','Présentation','Détails','Photos','Validation'].map((label,index)=><button type="button" key={label}
        disabled={busy||photoChecking||index>reached} aria-current={index===props.guided!.step?'step':undefined}
        onClick={()=>{history.current.push(props.guided!.step);props.guided!.setStep(index);}}>{label}{index!==props.guided!.step&&sectionComplete(index)?' ✓':''}</button>)}</nav>
      <h3>{['Quel bien souhaitez-vous présenter ?','Présentez votre annonce.','Ajoutez les détails utiles.','Montrez votre bien.','Vérifiez votre annonce.'][props.guided.step]}</h3></>
      :<><h3>Ajoutez votre annonce</h3><p className="field-help">Renseignez le bien et ajoutez vos photos. Le titre, le type et la localisation sont obligatoires.</p></>}
    {props.prepareGuest && <p className="home-guest-manual-note">Vous pouvez préparer toute votre annonce sans compte. La connexion sera demandée seulement pour l’enregistrer et créer la vidéo.</p>}
    <fieldset key={restored?.savedAt ?? 'new'} disabled={busy} className="manual-fields">
      {props.guided&&provenanceData&&<p className="manual-draft-summary" role="status">{[propertyType==='apartment'?'Appartement':propertyType==='house'?'Maison':null,
        transaction==='sale'?'Vente':transaction==='rent'?'Location':null,summaryValue('locality'),summaryValue('area')?`${summaryValue('area')} m²`:null]
        .filter(Boolean).join(' · ')||'Votre annonce à compléter'}</p>}
      <div className="manual-step-fields" hidden={Boolean(props.guided&&props.guided.step!==0)}>
        {props.guided?<><p>Type de bien</p><div className="manual-property-choices" role="radiogroup" aria-label="Type de bien">{([['apartment','Appartement','building'],['house','Maison','house'],['other','Autre','plus']] as const).map(([value,label,icon])=><label className={propertyType===value?'selected':''} key={value}>
          <input type="radio" name="propertyType" value={value} checked={propertyType===value} onChange={()=>setPropertyType(value)}/><HomeIcon name={icon} size={38}/><span>{label}</span></label>)}</div>{error('propertyType')}
          <p>Type de transaction</p><div className="manual-transaction-choices" role="radiogroup" aria-label="Type de transaction">{([['sale','Vente'],['rent','Location']] as const).map(([value,label])=><label className={transaction===value?'selected':''} key={value}>
            <input type="radio" name="transaction" value={value} checked={transaction===value} onChange={()=>setTransaction(value)}/>{label}</label>)}</div></>
          :<><div><label htmlFor="manual-propertyType">Type de bien</label><select {...attributes('propertyType')} required defaultValue={restored?.fields.propertyType ?? ''}><option value="" disabled>Choisir un type</option><option value="apartment">Appartement</option><option value="house">Maison</option><option value="other">Autre bien</option></select>{error('propertyType')}</div>
            <div><label htmlFor="manual-transaction">Transaction</label><select id="manual-transaction" name="transaction" value={transaction} onChange={e => setTransaction(e.target.value)}><option value="sale">Vente</option><option value="rent">Location</option></select></div></>}
      </div>
      <div className="manual-step-fields" hidden={Boolean(props.guided&&props.guided.step!==1)}><div className="manual-wide"><label htmlFor="manual-title">Titre de l’annonce</label><input {...attributes('title')} required maxLength={200} defaultValue={restored?.fields.title ?? ''} placeholder="Appartement lumineux avec terrasse"/>{error('title')}</div>
        <div className="manual-wide"><label htmlFor="manual-locality">Ville ou localisation</label><input {...attributes('locality')} required maxLength={200} defaultValue={restored?.fields.locality ?? ''} placeholder="Lyon 6e, quartier des Brotteaux"/>{error('locality')}</div></div>
      <div className="manual-step-fields" hidden={Boolean(props.guided&&props.guided.step!==2)}><div><label htmlFor="manual-priceCents">{transaction === 'rent' ? 'Loyer mensuel (€)' : 'Prix de vente (€)'} <span>facultatif</span></label><input {...attributes('priceCents')} inputMode="decimal" defaultValue={restored?.fields.priceCents ?? ''} placeholder={transaction === 'rent' ? '950' : '280 000'}/>{error('priceCents')}</div>
        {transaction === 'rent' && <div><label htmlFor="manual-charges">Charges du loyer</label><select {...attributes('charges')} defaultValue={restored?.fields.charges ?? ''}><option value="">Préciser si loyer renseigné</option><option value="included">Charges comprises</option><option value="excluded">Charges non comprises</option></select>{error('charges')}</div>}
        <div><label htmlFor="manual-area">Surface (m²) <span>facultatif</span></label><input {...attributes('area')} inputMode="decimal" defaultValue={restored?.fields.area ?? ''} placeholder="65"/>{error('area')}</div>
        <div><label htmlFor="manual-rooms">Nombre de pièces <span>facultatif</span></label><input {...attributes('rooms')} inputMode="numeric" defaultValue={restored?.fields.rooms ?? ''} placeholder="3"/>{error('rooms')}</div>
        <div className="manual-wide"><label htmlFor="manual-description">Description du bien <span>facultatif</span></label><textarea {...attributes('description')} rows={6} maxLength={DESCRIPTION_MAX_CHARACTERS}
          {...(props.guided?{value:props.guided.description,onChange:(event:ChangeEvent<HTMLTextAreaElement>)=>props.guided!.setDescription(event.target.value)}:{defaultValue:restored?.fields.description??''})}
          placeholder="Décrivez les espaces et les atouts de votre bien…"/>{error('description')}</div></div>
      <div className="manual-step-fields" hidden={Boolean(props.guided&&props.guided.step!==3)}><div className="manual-wide"><label htmlFor="manual-photos">Photos du bien</label>
        <p id="manual-photos-help" className="field-help">3 à 12 photos différentes, JPEG, PNG ou WebP. 10 Mo par photo, 50 Mo au total. Minimum 640 × 360 pixels, maximum 16 millions de pixels.</p>
        <div className="manual-upload"><span aria-hidden="true">Ajouter des photos</span>
          <input id="manual-photos" type="file" multiple disabled={photoChecking} accept="image/jpeg,image/png,image/webp" aria-invalid={Boolean(errors.photos||photoIssues.length)} aria-describedby="manual-photos-help manual-photo-feedback"
            onChange={e => {void addPhotos(e.target.files); e.target.value = '';}}/>
        </div>
        {photoChecking&&<p role="status" className="field-help">Vérification des images…</p>}
        <p id="manual-photo-feedback" className="form-feedback error">{errors.photos}{photoIssues.map(issue=><span key={issue}>{issue}<br/></span>)}</p>
        {photos.length > 0 && <><p className="field-help">{`${photos.length} photo${photos.length > 1 ? 's' : ''} sélectionnée${photos.length > 1 ? 's' : ''}`}</p><ol className="manual-photos">{photos.map((photo, index) => <li key={photo.id}>
          <img src={photo.preview} alt={`Aperçu de la photo ${index + 1}`}/><span title={photo.file?.name??'Photo importée'}>{photo.file?.name??'Photo importée'} · {photo.state==='sending'?'Envoi…':photo.state==='error'?'Erreur':'Disponible'}</span>
          {photo.state==='error'&&<button type="button" onClick={()=>void uploadSelected(photo)}>Réessayer</button>}
          <button type="button" aria-label={`Retirer la photo ${index + 1}`} onClick={() => void removePhoto(photo)}>Retirer</button>
        </li>)}</ol></>}
      </div></div>
      {props.guided&&<div className="manual-step-fields manual-recap" hidden={props.guided.step!==4}>
        <dl><div><dt>Bien</dt><dd>{({apartment:'Appartement',house:'Maison',other:'Autre'} as Record<string,string>)[propertyType]} · {transaction==='rent'?'Location':'Vente'} <button type="button" onClick={()=>props.guided!.setStep(0)}>Modifier</button></dd></div>
          <div><dt>Présentation</dt><dd>{summaryValue('title')} · {summaryValue('locality')} <button type="button" onClick={()=>props.guided!.setStep(1)}>Modifier</button></dd></div>
          <div><dt>Détails</dt><dd>{[
            summaryValue('priceCents')?`${summaryValue('priceCents')} €${transaction==='rent'?' / mois':''}`:null,
            summaryValue('area')?`${summaryValue('area')} m²`:null,
            summaryValue('rooms')?`${summaryValue('rooms')} pièces`:null,
          ].filter(Boolean).join(' · ')||'Aucun détail ajouté'} <button type="button" onClick={()=>props.guided!.setStep(2)}>Modifier</button></dd></div>
          <div><dt>Photos</dt><dd>{photos.filter(p=>p.state==='ready').length} images disponibles{photos.some(p=>p.state==='sending')?' · envoi en cours':''} <button type="button" onClick={()=>props.guided!.setStep(3)}>Modifier</button></dd></div>
          {props.guided.description&&<div><dt>Description</dt><dd>{props.guided.description}<button type="button" onClick={()=>props.guided!.setStep(2)}>Modifier</button></dd></div>}
        </dl>{provenanceData&&Object.entries(provenanceData.provenance).some(([,source])=>source)&&<div className="manual-provenance" aria-label="Origine des informations">
          {Object.entries(provenanceData.provenance).filter(([,source])=>Boolean(source)).map(([name,source])=><p key={name}>
            <strong>{labels[name]??name}</strong> · {source!.source==='ai'?'Suggestion IA':source!.source==='import'?'Import':'Votre saisie'}
            {source!.evidence&&<small>« {source!.evidence} »</small>}
            {source!.confirm&&!guestConfirmed.has(name)&&<><span className="manual-confirmation">À confirmer</span> <button type="button" onClick={()=>void confirmField(name)}>Confirmer cette valeur</button></>}
          </p>)}</div>}
        <div className="manual-recap-photos">{photos.filter(photo=>photo.state==='ready').map((photo,index)=><img key={photo.id} src={photo.preview} alt={`Photo ${index+1} du brouillon`}/>)}</div>
      </div>}
    </fieldset>
    {(!props.guided||props.guided.step>=3)&&<p className="field-help">Ajoutez uniquement les informations et photos du bien que vous êtes autorisé à utiliser.</p>}
    {props.prepareGuest && <p className="field-help">En continuant, les champs et les photos sont conservés dans ce navigateur pendant une heure pour reprendre après connexion.</p>}
    {feedback && <div className="form-feedback error" role="alert"><p>{feedback}</p>{Object.entries(errors).filter(([, value]) => value).map(([name, value]) => <p key={name}>{labels[name] ?? name} : {value}</p>)}</div>}
    {progress && <p role="status" className="field-help">{progress}</p>}
    {props.guided?<div className="manual-step-actions"><button type="button" className="text-button" disabled={busy} onClick={()=>void cancelGuided()}>Annuler</button>
      <div>{props.guided.step>0&&<button type="button" className="text-button" disabled={busy} onClick={()=>props.guided!.setStep(history.current.pop()??props.guided!.step-1)}>Précédent</button>}
        {props.guided.step===2&&<button type="button" className="text-button" disabled={busy} onClick={()=>{history.current.push(2);props.guided!.setStep(photos.filter(p=>p.state==='ready').length>=3?4:3);}}>Passer cette étape</button>}
        {props.guided.step<4&&<button type="button" className="home-primary-button" disabled={busy||photoChecking} onClick={()=>void nextStep()}>Continuer <span aria-hidden="true">→</span></button>}</div></div>
      :<button className="button primary" type="submit" disabled={busy}>{progress ? 'Préparation en cours…' : props.prepareGuest ? 'Continuer avec mon annonce' : generate ? 'Créer la vidéo de mon annonce' : 'Enregistrer mon annonce'}</button>}
  </form>;
}
