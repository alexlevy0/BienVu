'use client';
import {useEffect, useImperativeHandle, useRef, useState, type ChangeEvent, type FormEvent, type Ref} from 'react';
import {generationCreditCost,selectedAnimationIndices,defaultVideoCustomization,createEditorDocument,CreationFields,VideoCustomization,GenerationCustomization,DESCRIPTION_MAX_CHARACTERS, ManualListingInput, PropertyListingInput,MANUAL_PHOTO_LIMITS, publicErrors, type PublicErrorCode,
  type CreationDraftData, type CreationDraftView, type NormalizedListing,type VideoDuration,type VideoAspectRatio} from '@bienvu/contracts';
import {HomeIcon} from './home-icons';
import type {ImportView} from './generation-form';
import {manualDraftFields, readManualListingDraft, saveManualListingDraft, type ManualDraftFields} from '../lib/listing-draft';
import {inspectManualPhotos} from '../lib/manual-photos';
import {photoUploadError} from '../lib/photo-upload-error';
import {VideoCustomizer} from './video-customizer';
import {useAccount} from './account';

type SelectedPhoto = {id: string; file: File|null; preview: string; sourceHash?:string;remote?:NormalizedListing['photos'][number]; state:'ready'|'sending'|'error'; slot:number; error?:string; removing?:boolean};
type Guided={description:string;setDescription(value:string):void;onCancel():void;
  agencyId?:string;initialDraft?:CreationDraftView|null;initialData?:CreationDraftData|null;
  onReadyChange?(ready:boolean,reason:string):void;onDraftChange?():void};
export type ManualListingFormHandle = {cancel():Promise<void>;isDraft(id:string):boolean;customization():VideoCustomization|undefined};
class FormFailure extends Error {}
const emptyFields:ManualDraftFields={title:'',locality:'',propertyType:'',transaction:'',priceCents:'',charges:'',area:'',rooms:'',description:''};
const propertyNames:Record<string,string>={apartment:'Appartement',house:'Maison',other:'Bien immobilier'};
function listingTitle(title:string,locality:string,propertyType:string,transaction:string){
  return title.trim()||`${propertyNames[propertyType]??'Bien immobilier'} ${transaction==='rent'?'à louer':'à vendre'}${locality.trim()?` — ${locality.trim()}`:''}`.slice(0,200);
}
function fieldMessage(name:string,code:string,message:string){
  return code==='custom'?message:name==='photos'?'Ajoutez au moins 3 photos différentes du bien.':
    name==='title'?'Indiquez un titre de 3 à 200 caractères.':name==='locality'?'Indiquez une ville de 2 à 200 caractères.':
    name==='propertyType'?'Choisissez le type de bien.':name==='transaction'?'Choisissez Vente ou Location.':
    name==='description'?'Limitez la description à 20 000 caractères.':name==='charges'?'Précisez si les charges sont comprises.':
    name==='rooms'?'Indiquez un nombre entier de 1 à 100.':'Indiquez un montant ou une surface valide, supérieur à zéro.';
}
async function photoHash(file:File){
  return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',await file.arrayBuffer())),n=>n.toString(16).padStart(2,'0')).join('');
}
function photoAnimations(settings:VideoCustomization|undefined,order:number[]){
  return settings?.runwayPhotos??selectedAnimationIndices(order,settings).map(index=>order[index]).filter(slot=>slot!==undefined);
}
const labels: Record<string, string> = {title: 'titre', locality: 'localisation', propertyType: 'type de bien', description: 'description',
  priceCents: 'prix', charges: 'charges', area: 'surface', rooms: 'nombre de pièces', photos: 'photos'};
type Props = {busy: boolean; generate?: boolean; setBusy(value: boolean): void;guided?:Guided;ref?:Ref<ManualListingFormHandle>;
  saveOnly?:boolean;onSaved?(draft:CreationDraftView):void;
  onCreditCost?(value:number):void;
  customizing?:boolean;onCloseCustomizer?():void;brand?:{name:string;primaryColor:string;secondaryColor:string};
  initialCustomization?:VideoCustomization;
  subtitlesEnabled?:boolean;onSubtitles?(value:boolean):void;voiceEnabled?:boolean;onVoice?(value:boolean):void;
  durationSeconds?:VideoDuration;aspectRatio?:VideoAspectRatio;
  incomingPhotos?:{id:string;files:File[]}|null;onPhotosReceived?(id:string,result:{accepted:File[];issues:string[]}):void} & (
  {prepareGuest: true; onPrepared(): void; onCreated?: never} |
  {prepareGuest?: false; onCreated(value: ImportView): Promise<void>; onPrepared?: never}
);
export function ManualListingForm(props: Props) {
  const {busy, setBusy, generate = false} = props;
  const {me,defaultVoice,voiceLoading}=useAccount();
  const [transaction, setTransaction] = useState('sale'), [photos, setPhotos] = useState<SelectedPhoto[]>([]);
  const [propertyType,setPropertyType]=useState('apartment'),[hydrated,setHydrated]=useState(false),[photoChecking,setPhotoChecking]=useState(false);
  const [fields,setFields]=useState<ManualDraftFields>(emptyFields),[detailsOpen,setDetailsOpen]=useState(false),[draggedPhoto,setDraggedPhoto]=useState<string|null>(null),[photoDrop,setPhotoDrop]=useState(false);
  const [photoIssues,setPhotoIssues]=useState<string[]>([]),[revision,setRevision]=useState(0);
  const [errors, setErrors] = useState<Record<string, string>>({}), [feedback, setFeedback] = useState(''), [progress, setProgress] = useState('');
  const [guestConfirmed,setGuestConfirmed]=useState<Set<string>>(new Set());
  const [completed,setCompleted]=useState(false),completedRef=useRef<ImportView|null>(null);
  const [serverDraft,setServerDraft]=useState<CreationDraftView|null>(props.guided?.initialDraft??null);
  const serverRef=useRef<CreationDraftView|null>(props.guided?.initialDraft??null),draftPromise=useRef<Promise<CreationDraftView>|null>(null);
  const selected = useRef(photos), pending = useRef<{fingerprint: string; key: string} | null>(null),formRef=useRef<HTMLFormElement>(null),submitLock=useRef(false);
  const removedIds=useRef<Set<string>>(new Set());
  const uploads=useRef(new Set<string>()),removals=useRef(new Set<string>());
  const receivedBatches=useRef(new Set<string>()),photoLock=useRef(false),mounted=useRef(true);
  const [customization,setCustomization]=useState<VideoCustomization|undefined>(),[settingsSaved,setSettingsSaved]=useState(false);
  useEffect(()=>{props.onCreditCost?.(generationCreditCost(customization));},[customization,props.onCreditCost]);
  const customizationRef=useRef<VideoCustomization|undefined>(undefined),settingsVersion=useRef(0),customInitialized=useRef(false),settingsWrite=useRef<Promise<void>|null>(null);
  customizationRef.current=customization;
  useEffect(()=>{mounted.current=true;return()=>{mounted.current=false;};},[]);
  useImperativeHandle(props.ref,()=>({cancel:cancelGuided,isDraft:id=>serverRef.current?.id===id,customization:()=>customizationRef.current}));
  selected.current = photos;
  function finalInput(){
    if(!formRef.current)return null;
    const data=new FormData(formRef.current),value=(name:string)=>String(data.get(name)??'').trim();
    const number=(name:string)=>{const raw=value(name).replace(/\s/g,'');return !raw?null:/^\d+(?:[.,]\d{1,2})?$/.test(raw)?Number(raw.replace(',','.')):NaN;};
    const price=number('priceCents');
    return (props.saveOnly?PropertyListingInput:ManualListingInput).safeParse({title:listingTitle(value('title'),value('locality'),propertyType,transaction),propertyType,transaction,
      locality:value('locality'),description:props.guided?props.guided.description:value('description'),
      priceCents:price===null?null:Math.round(price*100),charges:transaction==='rent'?value('charges')||null:null,
      area:number('area'),rooms:number('rooms'),photos:photos.map((photo,index)=>({hash:photo.remote?.contentHash??photo.sourceHash??index.toString(16).padStart(64,'0'),
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
    const validated=finalInput(),fieldsValid=validated?.success===true;
    const issue=validated&&!validated.success?validated.error.issues.find(i=>i.path[0]!=='photos'):null;
    const selectionValid=props.saveOnly||!customization||GenerationCustomization.safeParse(customization).success&&
      (!customization.photoOrder||customization.photoOrder.every(slot=>photos.some(photo=>photo.slot===slot&&photo.state==='ready')));
    const ready=(completed||hydrated&&fieldsValid&&unresolved().length===0&&(props.saveOnly||photos.filter(photo=>photo.state==='ready').length>=3)&&
      !photos.some(photo=>photo.state!=='ready'||photo.removing)&&(!props.guided.agencyId||Boolean(serverDraft)));
    const reason=customization?.map&&!customization.map.location?'Confirmez la localisation dans Personnaliser → Carte.':!selectionValid?'Vérifiez la narration et sélectionnez au moins trois photos.':completed?'':!hydrated?'Chargement du brouillon en cours.':
      unresolved().length?'Confirmez les informations signalées avant la création.':
      photos.some(photo=>photo.removing)?'Retrait des photos en cours.':photos.some(photo=>photo.state==='sending')?'Envoi des photos en cours.':photos.some(photo=>photo.state==='error')?
      'Réessayez ou retirez les photos en erreur.':issue?fieldMessage(String(issue.path[0]),issue.code,issue.message):!props.saveOnly&&photos.length<3?'Ajoutez au moins trois photos.':!serverDraft&&props.guided.agencyId?
      'Préparation du brouillon privé en cours.':!fieldsValid?'Vérifiez les informations du bien.':'';
    props.guided.onReadyChange?.(Boolean(ready&&selectionValid),reason);
  },[props.guided?.agencyId,props.guided?.description,hydrated,photos,serverDraft,revision,propertyType,transaction,completed,guestConfirmed,customization,props.customizing,props.saveOnly]);
  async function confirmField(name:string){
    await settingsWrite.current;const draft=serverRef.current;if(!draft){setGuestConfirmed(current=>new Set([...current,name]));return;}
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
      if(!response.ok)throw new FormFailure(await photoUploadError(response,'Impossible de préparer le brouillon privé. Réessayez.'));
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
  useEffect(() => {
    let active = true;
    void (async()=>{const draft=props.guided?.initialData?null:await readManualListingDraft(props.guided?.agencyId);
      if (!active) return;
      let remote=props.guided?.initialDraft??null;
      if(props.guided?.agencyId){try{remote=remote??await ensureServerDraft();}catch(error){if(active){setFeedback(error instanceof Error?error.message:'Brouillon indisponible.');
        }}}
      if(!active)return;
      const fromGuest=Boolean(remote&&draft&&!draft.agencyId&&!draft.serverDraftId&&remote.sourceKind==='manual'&&
        !remote.data.fields.title&&remote.photos.length===0);
      const sameRemoteVersion=Boolean(remote&&draft&&draft.serverDraftId===remote.id&&draft.serverDraftVersion===remote.version);
      if(remote&&draft?.serverDraftId===remote.id&&!sameRemoteVersion)
        setFeedback('Le brouillon enregistré sur le serveur a changé. Ses dernières informations ont été rechargées.');
      const restoredDraft=remote ? {fields:sameRemoteVersion||fromGuest?draft!.fields:fieldsFromData(remote.data),
        photos:fromGuest?draft!.photos:[],savedAt:Date.now(),step:4,
        agencyId:props.guided?.agencyId,serverDraftId:remote.id,serverDraftVersion:remote.version,
        videoCustomization:fromGuest||sameRemoteVersion?draft?.videoCustomization:remote.data.videoCustomization,photoSlots:fromGuest?draft?.photoSlots:undefined}
        :props.guided?.initialData?{fields:fieldsFromData(props.guided.initialData),photos:[],savedAt:Date.now(),
          step:4}:draft;
      if(restoredDraft){
        setCustomization(restoredDraft.videoCustomization??props.initialCustomization);customInitialized.current=Boolean(restoredDraft.videoCustomization);
        setFields(restoredDraft.fields);
        const imported=Boolean(remote&&remote.sourceKind!=='manual'||props.guided?.initialData);
        setTransaction(restoredDraft.fields.transaction||(imported?'':'sale'));
        setPropertyType(restoredDraft.fields.propertyType||(imported?'':'apartment'));
        if(remote?.data.provenance&&Object.values(remote.data.provenance).some(source=>source?.confirm)||restoredDraft.fields.title||restoredDraft.fields.description)setDetailsOpen(true);
        const restoredPhotos:SelectedPhoto[]=remote&&!fromGuest?remote.photos.map(photo=>({id:photo.id,file:null,preview:`/api/imports/${remote!.id}/photos/${photo.id}`,
          remote:photo,state:'ready',slot:photo.sourceOrder})):await Promise.all(restoredDraft.photos.map(async(file,index)=>({id:crypto.randomUUID(),file,
          sourceHash:await photoHash(file),preview:URL.createObjectURL(file),state:fromGuest?'sending' as const:'ready' as const,slot:restoredDraft.photoSlots?.[index]??index})));
        if(!active){restoredPhotos.forEach(photo=>{if(photo.file)URL.revokeObjectURL(photo.preview);});return;}
        selected.current=restoredPhotos;setPhotos(restoredPhotos);
        if(fromGuest)for(const photo of restoredPhotos)void uploadSelected(photo);
        if(props.guided){props.guided.setDescription(sameRemoteVersion||fromGuest
          ?props.guided.description.trim()||restoredDraft.fields.description:restoredDraft.fields.description);
        }
      }
      if(!restoredDraft&&props.initialCustomization)setCustomization(props.initialCustomization);
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
    if(!props.guided||!hydrated||busy||!formRef.current)return;
    const timer=setTimeout(()=>{void saveManualListingDraft(draftFields(),props.guided!.agencyId?[]:photos.flatMap(p=>p.file?[p.file]:[]),
      4,props.guided!.agencyId,serverRef.current?.id,serverRef.current?.version,customization,photos.map(p=>p.slot));},650);
    return()=>clearTimeout(timer);
  // FormData captures the latest DOM values after each field edit.
  },[hydrated,busy,photos,transaction,propertyType,revision,props.guided?.description,serverDraft?.version,customization]);
  useEffect(()=>{
    const batch=props.incomingPhotos;
    if(!hydrated||photoChecking||!batch||receivedBatches.current.has(batch.id))return;
    receivedBatches.current.add(batch.id);
    void addPhotos(batch.files).then(result=>{if(mounted.current&&result)props.onPhotosReceived?.(batch.id,result);});
  },[hydrated,photoChecking,props.incomingPhotos?.id]);
  useEffect(()=>{
    if(!props.customizing||!hydrated||voiceLoading||!formRef.current||customInitialized.current)return;
    customInitialized.current=true;
    setCustomization(current=>({...defaultVideoCustomization(props.brand,defaultVoice),...current,photoOrder:current?.photoOrder??photos.map(p=>p.slot)}));
  },[props.customizing,hydrated,voiceLoading,defaultVoice]);
  useEffect(()=>{
    if(!hydrated||!customization||!serverDraft||busy||!VideoCustomization.safeParse(customization).success)return;
    if(JSON.stringify(serverDraft.data.videoCustomization)===JSON.stringify(customization)){setSettingsSaved(true);return;}
    const version=settingsVersion.current;
    const timer=setTimeout(()=>{const draft=serverRef.current;if(!draft||settingsWrite.current)return;
      const write=fetch(`/api/imports/${draft.id}/draft`,{method:'PATCH',headers:{'Content-Type':'application/json'},signal:AbortSignal.timeout(30_000),
        body:JSON.stringify({version:draft.version,changes:{},confirm:[],videoCustomization:customization})}).then(async response=>{
          if(!response.ok)throw new Error('Vos réglages sont conservés ici. Enregistrement interrompu ; réessayez avant de quitter.');
          const value=await response.json() as CreationDraftView;if(!mounted.current)return;
          serverRef.current=value;setServerDraft(value);if(settingsVersion.current===version)setSettingsSaved(true);
        }).catch(error=>{if(mounted.current)setFeedback(error instanceof Error?error.message:'Enregistrement interrompu.');}).finally(()=>{settingsWrite.current=null;});
      settingsWrite.current=write;
    },900);
    return()=>clearTimeout(timer);
  },[hydrated,customization,serverDraft?.version,busy]);
  async function addPhotos(files: FileList | readonly File[] | null) {
    if (!files||photoLock.current) return;
    photoLock.current=true;setPhotoChecking(true);setPhotoIssues([]);setFeedback('');
    let result;
    try{const checked=await inspectManualPhotos(Array.from(files),selected.current.map(p=>p.file?.size??p.remote?.sizeBytes??0));
      const hashed=await Promise.all(checked.accepted.map(async file=>({file,hash:await photoHash(file)}))),
        seen=new Set(selected.current.map(p=>p.sourceHash??p.remote?.contentHash)),accepted:File[]=[],issues=[...checked.issues],hashes=new Map<File,string>();
      for(const {file,hash} of hashed){if(seen.has(hash))issues.push(`${file.name} : cette photo est déjà ajoutée.`);
        else{seen.add(hash);accepted.push(file);hashes.set(file,hash);}}
      result={accepted,issues,hashes};
    }catch{result={accepted:[] as File[],issues:['Les photos n’ont pas pu être vérifiées. Réessayez.'],hashes:new Map<File,string>()};}
    finally{photoLock.current=false;if(mounted.current)setPhotoChecking(false);}
    if(!mounted.current)return;
    const {accepted,issues}=result;
    setErrors(previous=>({...previous,photos:''}));
    if(issues.length)setPhotoIssues(issues);
    if(accepted.length){
      const used=new Set(selected.current.map(p=>p.slot));
      const additions=accepted.map(file=>{let slot=0;while(used.has(slot))slot++;used.add(slot);
        return {id:crypto.randomUUID(),file,sourceHash:result.hashes.get(file),preview:URL.createObjectURL(file),state:props.guided?.agencyId?'sending' as const:'ready' as const,slot};});
      const previousSlots=selected.current.map(p=>p.slot);
      selected.current=[...selected.current,...additions];setPhotos(selected.current);
      settingsVersion.current++;setSettingsSaved(false);
      setCustomization(current=>current?{...current,photoOrder:[...(current.photoOrder??previousSlots),...additions.map(p=>p.slot)],
        runwayClips:undefined,runwayPhotos:photoAnimations(current,current.photoOrder??previousSlots)}:current);
      if(props.guided?.agencyId)for(const photo of additions)void uploadSelected(photo);
    }
    return result;
  }
  async function uploadSelected(photo:SelectedPhoto){
    if(!photo.file||uploads.current.has(photo.id)||removedIds.current.has(photo.id))return;
    uploads.current.add(photo.id);
    setPhotos(current=>current.map(item=>item.id===photo.id?{...item,state:'sending',error:undefined}:item));
    try{const draft=await ensureServerDraft();
      if(removedIds.current.has(photo.id)||!selected.current.some(item=>item.id===photo.id))return;
      const response=await fetch(`/api/imports/${draft.id}/uploads/${photo.slot}`,{
      method:'PUT',headers:{'Content-Type':photo.file.type,'X-Upload-ID':photo.id},body:photo.file,signal:AbortSignal.timeout(65_000)});
      if(!response.ok)throw new FormFailure(await photoUploadError(response,'Cette photo n’a pas été envoyée. Réessayez.'));
      const value=await response.json() as {photo:NormalizedListing['photos'][number]};
      if(removedIds.current.has(photo.id)||!selected.current.some(item=>item.id===photo.id)){
        await fetch(`/api/imports/${draft.id}/uploads/${photo.slot}`,{method:'DELETE',headers:{'X-Upload-ID':photo.id}});return;}
      setPhotos(current=>current.map(item=>item.id===photo.id?{...item,remote:value.photo,state:'ready',error:undefined}:item));
    }catch(error){if(!removedIds.current.has(photo.id)&&selected.current.some(item=>item.id===photo.id))
      setPhotos(current=>current.map(item=>item.id===photo.id?{...item,state:'error',error:error instanceof FormFailure?error.message:'Envoi interrompu. Vérifiez votre connexion puis réessayez.'}:item));
    }finally{uploads.current.delete(photo.id);}
  }
  async function removePhoto(photo:SelectedPhoto){
    if(removals.current.has(photo.id))return;
    removals.current.add(photo.id);
    removedIds.current.add(photo.id);
    setPhotos(current=>current.map(item=>item.id===photo.id?{...item,removing:true}:item));
    try{if(props.guided?.agencyId){
      // Removing a local failed photo must not create a new server draft (which
      // may itself be refused). Wait only for a draft already being prepared.
      const draft=serverRef.current??await draftPromise.current?.catch(()=>null);
      if(draft){const response=await fetch(`/api/imports/${draft.id}/uploads/${photo.slot}`,{
        method:'DELETE',headers:{'X-Upload-ID':photo.id},signal:AbortSignal.timeout(20_000)});
        if(!response.ok&&response.status!==404)throw new FormFailure(await photoUploadError(response,'Cette photo n’a pas pu être retirée. Réessayez.'));}
    }}catch(error){removedIds.current.delete(photo.id);
      setPhotos(current=>current.map(item=>item.id===photo.id?{...item,removing:false,error:error instanceof FormFailure?error.message:'Retrait interrompu. Vérifiez votre connexion puis réessayez.'}:item));
      return;
    }finally{removals.current.delete(photo.id);}
    if(photo.file)URL.revokeObjectURL(photo.preview);
    const previousSlots=selected.current.map(p=>p.slot);
    selected.current=selected.current.filter(p=>p.id!==photo.id);setPhotos(selected.current);settingsVersion.current++;setSettingsSaved(false);
    setCustomization(current=>current?{...current,photoOrder:current.photoOrder?.filter(slot=>slot!==photo.slot),runwayClips:undefined,
      runwayPhotos:photoAnimations(current,current.photoOrder??previousSlots).filter(slot=>slot!==photo.slot)}:current);setErrors(current=>({...current,photos:''}));
  }
  function focusError(name:string){requestAnimationFrame(()=>formRef.current?.querySelector<HTMLElement>(name==='photos'?'#manual-photos, .manual-sheet-gallery':`[name="${name}"]`)?.focus());}
  async function cancelGuided(){if(!props.guided)return;
    if(photoLock.current||props.incomingPhotos){setFeedback('Patientez pendant l’ajout de vos photos.');return;}
    if(!hydrated){setFeedback('Chargement du brouillon en cours. Réessayez dans un instant.');return;}
    if(!await saveManualListingDraft(draftFields(),props.guided.agencyId?[]:photos.flatMap(p=>p.file?[p.file]:[]),
      4,props.guided.agencyId,serverRef.current?.id,serverRef.current?.version,customization,photos.map(p=>p.slot))){
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
      if(value.fields){setErrors(value.fields);if(value.fields.title||value.fields.description)setDetailsOpen(true);focusError(Object.keys(value.fields)[0]);}
      throw new FormFailure(value.error?.code && value.error.code in publicErrors ? publicErrors[value.error.code][1] : 'L’enregistrement a échoué. Réessayez.');
    }
    return value;
  }
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();if(busy||photoChecking||submitLock.current||!hydrated)return;
    if(!props.saveOnly&&customization&&!GenerationCustomization.safeParse(customization).success){setFeedback('Vérifiez la narration et choisissez au moins trois photos.');return;}
    const form = event.currentTarget, data = new FormData(form), validatedBefore=finalInput();
    const text = (name: string) => String(data.get(name) ?? '').trim();
    const number = (name: string) => {
      const value = text(name).replace(/\s/g, '');
      return !value ? null : /^\d+(?:[.,]\d{1,2})?$/.test(value) ? Number(value.replace(',', '.')) : NaN;
    };
    submitLock.current=true;setErrors({}); setFeedback(''); setBusy(true); setProgress('Préparation des photos…');
    try {
      await settingsWrite.current;
      if(completedRef.current&&!props.prepareGuest){
        await props.onCreated(completedRef.current);completedRef.current=null;setCompleted(false);
        try{sessionStorage.removeItem(`bienvu:manual-start:${props.guided?.agencyId}`);}catch{}
        return;
      }
      if(props.guided?.agencyId){
        const draft=await ensureServerDraft(),price=number('priceCents');
        const validated=validatedBefore;if(!validated?.success){
          if(validated){const fields:Record<string,string>={};for(const issue of validated.error.issues){const name=String(issue.path[0]??'form');
            fields[name]=fieldMessage(name,issue.code,issue.message);}setErrors(fields);
            if(fields.title||fields.description)setDetailsOpen(true);focusError(Object.keys(fields)[0]);}
          throw new FormFailure('Vérifiez les champs indiqués avant de créer la vidéo.');}
        if(photos.some(photo=>photo.state!=='ready'||photo.removing)||!props.saveOnly&&photos.filter(photo=>photo.remote).length<3)
          throw new FormFailure('Complétez l’envoi de trois photos valides avant de créer la vidéo.');
        const changes={title:validated.data.title,propertyType:propertyType||null,transaction:transaction||null,
          locality:text('locality')||null,description:props.guided.description||null,
          priceCents:price===null?null:Math.round(price*100),charges:transaction==='rent'?text('charges')||null:null,
          area:number('area'),rooms:number('rooms')};
        const response=await fetch(`/api/imports/${draft.id}/draft`,{method:'PATCH',headers:{'Content-Type':'application/json'},
          body:JSON.stringify({version:draft.version,changes,confirm:[],...(customization?{videoCustomization:customization}:{})})});
        const updated=await response.json() as CreationDraftView&{error?:{message?:string};fields?:Record<string,string>};
        if(!response.ok){if(updated.fields)setErrors(updated.fields);throw new FormFailure(updated.error?.message??'Le brouillon a changé. Rechargez ses données et réessayez.');}
        serverRef.current=updated;setServerDraft(updated);
        if(props.saveOnly){props.onSaved?.(updated);return;}
        setProgress('Validation de votre annonce…');
        const result=await send(`/api/imports/${draft.id}/complete`,{method:'POST',headers:{'Content-Type':'application/json'},
          body:JSON.stringify({version:updated.version})});
        completedRef.current=result;setCompleted(true);
        if(!props.prepareGuest)await props.onCreated(result);
        completedRef.current=null;setCompleted(false);
        try{sessionStorage.removeItem(`bienvu:manual-start:${props.guided.agencyId}`);}catch{}
        setPhotos([]);return;
      }
      const files = [];
      for (const photo of photos) {
        const digest = await crypto.subtle.digest('SHA-256', await photo.file!.arrayBuffer());
        files.push({hash: Array.from(new Uint8Array(digest), n => n.toString(16).padStart(2, '0')).join(''), size: photo.file!.size, mime: photo.file!.type});
      }
      const price = number('priceCents');
      const parsed = ManualListingInput.safeParse({title:listingTitle(text('title'),text('locality'),propertyType,transaction),propertyType,transaction,
        locality: text('locality'), description: text('description'), priceCents: price === null ? null : Math.round(price * 100),
        charges: transaction === 'rent' ? text('charges') || null : null, area: number('area'), rooms: number('rooms'), photos: files});
      if (!parsed.success) {
        const fields: Record<string, string> = {};
        for (const issue of parsed.error.issues) {
          const field = String(issue.path[0] ?? 'form');
          fields[field]=fieldMessage(field,issue.code,issue.message);
        }
        setErrors(fields);
        if(fields.title||fields.description)setDetailsOpen(true);focusError(Object.keys(fields)[0]);
        throw new FormFailure('Vérifiez les champs indiqués avant d’enregistrer.');
      }
      if (props.prepareGuest) {
        setProgress('Conservation de votre annonce dans ce navigateur…');
        const fields = Object.fromEntries(manualDraftFields.map(name => [name, name === 'transaction' ? transaction : name==='propertyType'&&props.guided?propertyType:
          name==='description'&&props.guided?props.guided.description:text(name)])) as Record<typeof manualDraftFields[number], string>;
        if (!await saveManualListingDraft(fields, photos.flatMap(photo=>photo.file?[photo.file]:[]),4,undefined,undefined,undefined,customization,photos.map(p=>p.slot)))
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
      form.reset();setFields(emptyFields);setTransaction('sale');setPropertyType('apartment');photos.forEach(photo => {if(photo.file)URL.revokeObjectURL(photo.preview);}); setPhotos([]);
    } catch (error) {setFeedback(error instanceof FormFailure ? error.message : 'L’envoi a été interrompu. Réessayez avec les mêmes informations et photos.');}
    finally {submitLock.current=false;setBusy(false); setProgress('');}
  }
  async function openEditor(){if(busy||!props.guided?.agencyId)return;setBusy(true);setFeedback('');
    try{await settingsWrite.current;const current=await ensureServerDraft(),raw=draftFields(),number=(value:string)=>value.trim()?Number(value.replace(/\s/g,'').replace(',','.')):null;
      const fields=CreationFields.parse({title:listingTitle(raw.title,raw.locality,propertyType,transaction),locality:raw.locality.trim()||null,propertyType:raw.propertyType||null,transaction:raw.transaction||null,
        description:raw.description.trim()||null,priceCents:number(raw.priceCents)===null?null:Math.round(number(raw.priceCents)!*100),charges:raw.charges||null,area:number(raw.area),rooms:number(raw.rooms)});
      const settings={...defaultVideoCustomization(props.brand,defaultVoice),...customizationRef.current},order=settings.photoOrder??current.photos.map(p=>p.sourceOrder),
        editor=settings.editor??createEditorDocument(order.flatMap(slot=>current.photos.filter(p=>p.sourceOrder===slot)),fields,{agencyName:props.brand?.name,durationSeconds:props.durationSeconds,aspectRatio:props.aspectRatio,
          voiceEnabled:props.voiceEnabled,subtitlesEnabled:props.subtitlesEnabled});
      const response=await fetch(`/api/imports/${current.id}/draft`,{method:'PATCH',headers:{'Content-Type':'application/json'},
        body:JSON.stringify({version:current.version,changes:fields,confirm:[],videoCustomization:{...settings,photoOrder:[...new Set(editor.clips.map(c=>c.photoSlot))],editor}})});
      if(!response.ok)throw new Error('Le brouillon n’a pas pu être enregistré. Réessayez avant d’ouvrir l’Éditeur.');
      window.location.assign(`/editeur?draft=${encodeURIComponent(current.id)}`);
    }catch(error){setFeedback(error instanceof Error&&error.name!=='ZodError'?error.message:'Vérifiez les informations saisies avant d’ouvrir l’Éditeur.');setBusy(false);}
  }
  const error = (name: string) => errors[name] ? <p id={`manual-${name}-error`} className="form-feedback error">{errors[name]}</p> : null;
  const attributes = (name: string) => ({id: `manual-${name}`, name, 'aria-invalid': Boolean(errors[name]), 'aria-describedby': errors[name] ? `manual-${name}-error` : undefined});
  const fieldProps=(name:keyof ManualDraftFields)=>({...attributes(name),value:fields[name],
    onChange:(event:ChangeEvent<HTMLInputElement|HTMLTextAreaElement|HTMLSelectElement>)=>setFields(current=>({...current,[name]:event.target.value}))});
  const orderedPhotos=customization?.photoOrder?[...photos].sort((a,b)=>{
    const first=customization.photoOrder!.indexOf(a.slot),second=customization.photoOrder!.indexOf(b.slot);
    return (first<0?99:first)-(second<0?99:second);
  }):photos;
  const animatedPhotos=new Set(photoAnimations(customization,customization?.photoOrder??photos.map(photo=>photo.slot)));
  function movePhoto(id:string,to:number){
    if(busy||photoChecking)return;
    const photo=orderedPhotos.find(p=>p.id===id);if(!photo||photo.state!=='ready'||photo.removing)return;
    const next=orderedPhotos.filter(p=>p.id!==id);next.splice(Math.max(0,Math.min(next.length,to)),0,photo);
    selected.current=next;setPhotos(next);settingsVersion.current++;setSettingsSaved(false);
    setCustomization(current=>({...defaultVideoCustomization(props.brand,defaultVoice),...current,
      photoOrder:next.filter(p=>!current?.photoOrder||current.photoOrder.includes(p.slot)).map(p=>p.slot),
      runwayClips:undefined,runwayPhotos:photoAnimations(current,current?.photoOrder??orderedPhotos.map(p=>p.slot))}));
  }
  function toggleAnimation(photo:SelectedPhoto){
    if(!me||me.role==='viewer'||busy||photoChecking||photo.state!=='ready'||photo.removing)return;
    settingsVersion.current++;setSettingsSaved(false);
    setCustomization(current=>{
      const order=current?.photoOrder??selected.current.map(p=>p.slot),animated=photoAnimations(current,order);
      return {...defaultVideoCustomization(props.brand,defaultVoice),...current,photoOrder:order.includes(photo.slot)?order:[...order,photo.slot],runwayClips:undefined,
        runwayPhotos:animated.includes(photo.slot)?animated.filter(slot=>slot!==photo.slot):[...animated,photo.slot]};
    });
  }
  function blurField(name:string){
    const input=finalInput();if(!input||input.success)return;
    const issue=input.error.issues.find(i=>i.path[0]===name);
    if(issue)setErrors(current=>({...current,[name]:fieldMessage(name,issue.code,issue.message)}));
  }
  const previewPhoto=orderedPhotos.find(p=>(!customization?.photoOrder||customization.photoOrder.includes(p.slot))&&!p.removing);
  const previewNumber=(value:string)=>{const raw=value.replace(/\s/g,'');return /^\d+(?:[.,]\d{1,2})?$/.test(raw)&&Number(raw.replace(',','.'))>0?Number(raw.replace(',','.')):null;};
  const price=previewNumber(fields.priceCents),area=previewNumber(fields.area),rooms=previewNumber(fields.rooms),numberFormat=new Intl.NumberFormat('fr-FR');
  const canAdd=hydrated&&!busy&&!photoChecking&&!props.incomingPhotos&&photos.length<MANUAL_PHOTO_LIMITS.maximum;
  const pendingConfirmation=unresolved();
  return <>{props.customizing&&hydrated&&<VideoCustomizer settings={customization??defaultVideoCustomization(props.brand,defaultVoice)}
    onChange={value=>{settingsVersion.current++;setSettingsSaved(false);setCustomization(value);}} photos={photos} fields={draftFields()}
    agencyName={props.brand?.name??''} durationSeconds={props.durationSeconds} aspectRatio={props.aspectRatio} voiceEnabled={props.voiceEnabled} onVoice={props.onVoice} subtitlesEnabled={props.subtitlesEnabled!==false} onSubtitles={value=>props.onSubtitles?.(value)}
    onBack={()=>props.onCloseCustomizer?.()} onAdd={files=>void addPhotos(files)}
    onRetry={id=>{const photo=selected.current.find(p=>p.id===id);if(photo)void uploadSelected(photo);}}
    onRemove={id=>{const photo=selected.current.find(p=>p.id===id);if(photo)void removePhoto(photo);}} busy={busy||photoChecking}
    ready={finalInput()?.success===true&&unresolved().length===0&&photos.filter(p=>p.state==='ready').length>=3}
    onEdit={()=>props.onCloseCustomizer?.()} saved={settingsSaved}/>}
    {props.customizing&&props.guided?.agencyId&&<div className="customizer-editor-entry"><button type="button" disabled={busy||photoChecking||photos.some(p=>p.state!=='ready'||p.removing)} onClick={()=>void openEditor()}><HomeIcon name="clapper" size={18}/>Ouvrir le mode Éditeur <HomeIcon name="arrow" size={18}/></button><p>Placez vos textes et ajustez chaque plan dans la timeline.</p></div>}
    <form ref={formRef} hidden={props.customizing} id={props.guided?'manual-guided-form':undefined} className="manual-listing-form manual-property-sheet" onSubmit={submit} noValidate
      onKeyDown={event=>{if(props.guided&&event.key==='Enter'&&event.target instanceof HTMLInputElement&&event.target.type==='text')event.preventDefault();}}
      onBlur={({target})=>{if(target instanceof HTMLInputElement||target instanceof HTMLTextAreaElement||target instanceof HTMLSelectElement)blurField(target.name);}}
      onChange={({target})=>{if(target instanceof HTMLInputElement||target instanceof HTMLSelectElement||target instanceof HTMLTextAreaElement){
        if(target.name)setErrors(current=>({...current,[target.name]:'',...(target.name==='transaction'?{charges:''}:{})}));
        setFeedback('');setRevision(value=>value+1);
      }}}>
      <header className="manual-sheet-heading"><div><h2>Votre bien, en quelques détails.</h2><p>Ajoutez ses informations et ses photos.</p></div>
        {props.guided&&<button type="button" className="manual-import-link" disabled={busy||photoChecking||!hydrated||Boolean(props.incomingPhotos)} onClick={()=>void cancelGuided()}><HomeIcon name="link" size={20}/>Importer un lien</button>}
      </header>
      <div className="manual-sheet-grid">
        <fieldset disabled={busy||!hydrated} className="manual-fields manual-sheet-card" aria-labelledby="manual-information-title">
          <h3 id="manual-information-title">Informations du bien</h3>
          <div className="manual-sheet-kind"><div><label htmlFor="manual-propertyType">Type de bien</label><div className="manual-sheet-select">
            <HomeIcon name={propertyType==='house'?'house':'building'} size={21}/><select {...attributes('propertyType')} value={propertyType} onChange={event=>setPropertyType(event.target.value)} required>
              <option value="" disabled>Choisir un type</option><option value="apartment">Appartement</option><option value="house">Maison</option><option value="other">Autre bien</option>
            </select><HomeIcon name="chevron" size={15}/></div>{error('propertyType')}</div>
            <div className="manual-sheet-transaction" role="radiogroup" aria-label="Type de transaction">{([['sale','Vente'],['rent','Location']] as const).map(([value,label])=><label key={value} className={transaction===value?'is-selected':''}>
              <input type="radio" name="transaction" value={value} checked={transaction===value} onChange={()=>setTransaction(value)}/><span>{label}</span></label>)}{error('transaction')}
            </div>
          </div>
          <div className="manual-sheet-locality"><label htmlFor="manual-locality">Ville</label><div className="manual-sheet-input"><HomeIcon name="location" size={21}/><input {...fieldProps('locality')} required maxLength={200} placeholder="Lyon 6e" autoComplete="address-level2"/></div>{error('locality')}</div>
          <div className="manual-sheet-numbers">
            <div><label htmlFor="manual-area">Surface</label><div className="manual-sheet-input"><input {...fieldProps('area')} inputMode="decimal" placeholder="65"/><span className="manual-sheet-unit">m²</span></div>{error('area')}</div>
            <div><label htmlFor="manual-rooms">Pièces</label><div className="manual-sheet-input"><input {...fieldProps('rooms')} inputMode="numeric" placeholder="3"/><span className="manual-sheet-unit">pièces</span></div>{error('rooms')}</div>
            <div><label htmlFor="manual-priceCents">{transaction==='rent'?'Loyer mensuel':'Prix'}</label><div className="manual-sheet-input"><input {...fieldProps('priceCents')} inputMode="decimal" placeholder={transaction==='rent'?'950':'385 000'}/><span className="manual-sheet-unit">€</span></div>{error('priceCents')}</div>
          </div>
          {transaction==='rent'&&<div className="manual-sheet-charges"><label htmlFor="manual-charges">Charges du loyer</label><select {...fieldProps('charges')}><option value="">Préciser si le loyer est renseigné</option><option value="included">Charges comprises</option><option value="excluded">Charges non comprises</option></select>{error('charges')}</div>}
          <section className={`manual-sheet-gallery${photoDrop?' is-dropping':''}`} aria-labelledby="manual-photos-title" tabIndex={-1}
            onDragOver={event=>{if(Array.from(event.dataTransfer.types).includes('Files')){event.preventDefault();event.dataTransfer.dropEffect=canAdd?'copy':'none';if(canAdd)setPhotoDrop(true);}}}
            onDragLeave={event=>{if(!event.currentTarget.contains(event.relatedTarget as Node|null))setPhotoDrop(false);}}
            onDrop={event=>{if(Array.from(event.dataTransfer.types).includes('Files')){event.preventDefault();setPhotoDrop(false);if(canAdd)void addPhotos(event.dataTransfer.files);}}}>
            <div className="manual-sheet-gallery-title"><h4 id="manual-photos-title">Photos du bien</h4>{photos.length>0&&<span>{photos.length} / 12</span>}</div>
            <ol className={`manual-sheet-photos${photos.length?'':' is-empty'}`}>
              {orderedPhotos.map((photo,index)=><li key={photo.id} className={`manual-sheet-photo${draggedPhoto===photo.id?' is-dragging':''}${photo.state==='error'?' has-error':''}`}
                draggable={!busy&&!photoChecking&&photo.state==='ready'&&!photo.removing} onDragStart={event=>{event.dataTransfer.setData('application/x-bienvu-manual-photo',photo.id);event.dataTransfer.effectAllowed='move';setDraggedPhoto(photo.id);}}
                onDragEnd={()=>setDraggedPhoto(null)} onDragOver={event=>{if(draggedPhoto){event.preventDefault();event.dataTransfer.dropEffect='move';}}}
                onDrop={event=>{if(draggedPhoto){event.preventDefault();event.stopPropagation();movePhoto(draggedPhoto,index);setDraggedPhoto(null);}}}>
                <div className="manual-sheet-thumbnail"><img src={photo.preview} alt={`Photo ${index+1} du bien`} draggable={false}/><span className={`manual-sheet-photo-number${index===0?' is-cover':''}`}>{index+1}</span>
                  <button type="button" className="manual-sheet-animation-toggle" aria-pressed={animatedPhotos.has(photo.slot)} aria-label={`Animer la photo ${index+1} avec l’IA`}
                    disabled={!me||me.role==='viewer'||busy||photoChecking||photo.removing||photo.state!=='ready'}
                    title={!me?'Connectez-vous pour animer vos photos avec l’IA':me.role==='viewer'?'Votre accès Lecteur ne permet pas de modifier les animations':animatedPhotos.has(photo.slot)?'Désactiver l’animation IA':'Animer cette photo avec l’IA · 1 crédit'}
                    draggable={false} onDragStart={event=>{event.preventDefault();event.stopPropagation();}} onClick={()=>toggleAnimation(photo)}>
                    <HomeIcon name="sparkle" size={20} filled={animatedPhotos.has(photo.slot)}/></button>
                  {index===0&&<span className="manual-sheet-cover">Couverture</span>}
                  {(photo.state!=='ready'||photo.removing)&&<span className="manual-sheet-photo-status" role="status">{photo.removing?'Retrait…':photo.state==='sending'?'Envoi…':'Envoi interrompu'}</span>}
                  <div className="manual-sheet-photo-actions"><button type="button" disabled={busy||photoChecking||photo.removing||photo.state!=='ready'||index===0} aria-label={`Avancer la photo ${index+1}`} onClick={()=>movePhoto(photo.id,index-1)}><HomeIcon name="arrow" size={15}/></button>
                    <button type="button" disabled={busy||photoChecking||photo.removing||photo.state!=='ready'||index===orderedPhotos.length-1} aria-label={`Reculer la photo ${index+1}`} onClick={()=>movePhoto(photo.id,index+1)}><HomeIcon name="arrow" size={15}/></button>
                    <button type="button" disabled={busy||photo.removing} aria-label={`Retirer la photo ${index+1}`} onClick={()=>void removePhoto(photo)}><HomeIcon name="trash" size={15}/></button></div>
                </div>
                {photo.error&&<p className="manual-photo-error" role="alert">{photo.error}</p>}
                {photo.state==='error'&&photo.file&&<button type="button" className="manual-sheet-retry" disabled={busy||photo.removing} onClick={()=>void uploadSelected(photo)}>Réessayer</button>}
              </li>)}
              {photos.length<MANUAL_PHOTO_LIMITS.maximum&&<li className="manual-sheet-photo-add"><label htmlFor="manual-photos"><HomeIcon name={photos.length?'plus':'upload'} size={26}/><span>{photos.length?'Ajouter':'Ajouter vos photos'}</span>
                {!photos.length&&<small>ou glissez-les ici</small>}<input id="manual-photos" type="file" multiple disabled={!canAdd} accept="image/jpeg,image/png,image/webp" aria-invalid={Boolean(errors.photos||photoIssues.length)} aria-describedby="manual-photos-help manual-photo-feedback"
                  onChange={event=>{void addPhotos(event.target.files);event.target.value='';}}/></label></li>}
            </ol>
            <p className="manual-sheet-gallery-help" id="manual-photos-help"><HomeIcon name="settings" size={14}/>{photos.length?'Glissez pour changer l’ordre.':'3 à 12 photos · JPEG, PNG ou WebP · 10 Mo par photo.'}</p>
            {photos.length>0&&<p className="manual-sheet-gallery-help"><HomeIcon name="sparkle" size={14}/>{me?'Cliquez sur l’étoile pour animer une photo avec l’IA · 1 crédit par photo.':'Connectez-vous pour animer vos photos avec l’IA.'}</p>}
            {photoChecking&&<p role="status" className="field-help">Vérification des images…</p>}
            <div id="manual-photo-feedback" className="form-feedback error" role="alert">{errors.photos}{photoIssues.map(issue=><p key={issue}>{issue}</p>)}</div>
          </section>
          <details className="manual-sheet-details" open={detailsOpen} onToggle={event=>setDetailsOpen(event.currentTarget.open)}><summary>Ajouter des précisions <em>(facultatif)</em><HomeIcon name="chevron" size={17}/></summary>
            <div className="manual-sheet-details-body"><div><label htmlFor="manual-title">Titre de l’annonce</label><input {...fieldProps('title')} maxLength={200} placeholder={listingTitle('',fields.locality,propertyType,transaction)}/><p className="field-help">Un titre est proposé automatiquement. Vous pouvez le remplacer.</p>{error('title')}</div>
              <div><label htmlFor="manual-description">Description du bien</label><textarea {...attributes('description')} rows={5} maxLength={DESCRIPTION_MAX_CHARACTERS} value={props.guided?.description??fields.description}
                onChange={event=>props.guided?props.guided.setDescription(event.target.value):setFields(current=>({...current,description:event.target.value}))} placeholder="Décrivez les espaces et les atouts de votre bien…"/>{error('description')}</div>
            </div>
          </details>
          {pendingConfirmation.length>0&&<div className="manual-provenance" aria-label="Informations à confirmer">{pendingConfirmation.map(([name,source])=><p key={name}><strong>{labels[name]??name}</strong> · {source!.source==='ai'?'Suggestion IA':'Information importée'}
            {source!.evidence&&<small>« {source!.evidence} »</small>}<button type="button" onClick={()=>void confirmField(name)}>Confirmer cette valeur</button></p>)}</div>}
          {feedback&&<div className="form-feedback error" role="alert"><p>{feedback}</p></div>}
          {progress&&<p role="status" className="field-help">{progress}</p>}
        </fieldset>
        <aside className={`manual-sheet-preview${props.aspectRatio==='16:9'?' is-horizontal':''}`} aria-labelledby="manual-preview-title"><h3 id="manual-preview-title">Aperçu de la mise en page</h3>
          <div className={`manual-sheet-poster${previewPhoto?'':' is-empty'}`}>
            {previewPhoto?<img src={previewPhoto.preview} alt="Aperçu de la photo de couverture"/>:<div className="manual-sheet-preview-empty"><HomeIcon name="image" size={38}/><p>Vos photos prennent place ici.</p></div>}
            <div className="manual-sheet-poster-copy"><h4>{fields.locality.trim()||'Votre bien'}</h4>
              {(area||rooms)&&<p>{[area?`${numberFormat.format(area)} m²`:'',rooms?`${numberFormat.format(rooms)} pièce${rooms>1?'s':''}`:''].filter(Boolean).join(' · ')}</p>}
              {price&&<strong>{numberFormat.format(price)} €{transaction==='rent'&&<small> / mois</small>}</strong>}
            </div>
          </div><p className="manual-sheet-preview-caption">Le rendu s’adapte à vos informations.</p>
        </aside>
      </div>
      {!props.guided&&<button className="button primary" type="submit" disabled={busy||photoChecking||!hydrated}>{progress?'Préparation en cours…':props.prepareGuest?'Continuer avec mon annonce':generate?'Créer la vidéo de mon annonce':'Enregistrer mon annonce'}</button>}
    </form>
  </>;
}
