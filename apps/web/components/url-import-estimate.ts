'use client';
import {useEffect,useRef,useState} from 'react';
import {GeneratableListing,CreationDraftView,ImportUrl,publicErrors,type NormalizedListing} from '@bienvu/contracts';
import {analyticsFetch as fetch} from '../lib/product-analytics';

export type PreparedUrlImport={id:string;status:'importing'|'ready'|'needs_input';listing:NormalizedListing|null;draft:CreationDraftView|null};
type Entry={owner:string;url:string;key:string;createdAt:number;controller:AbortController;promise:Promise<PreparedUrlImport>};
type State={owner:string;url:string;phase:'loading'|'ready'|'error';value?:PreparedUrlImport;message?:string};
const lifetime=10*60_000;
const wait=(ms:number)=>new Promise<void>(resolve=>setTimeout(resolve,ms));
export function urlImportPhotoSlots(value?:PreparedUrlImport){return (value?.listing?.photos??value?.draft?.photos??[]).map(p=>p.sourceOrder);}

// Debounce only the preparation. Explicit actions await and reuse its promise and
// idempotency key; they never start a second source read while it is in flight.
export function useUrlImportEstimate(url:string,owner:string|undefined,enabled:boolean){
 const [state,setState]=useState<State|null>(null),[revision,setRevision]=useState(0),entries=useRef(new Map<string,Entry>()),scope=useRef(owner);scope.current=owner;
 const parsed=ImportUrl.safeParse(url.trim()),source=parsed.success?parsed.data:'';
 function keyFor(value:string,agency:string){
  try{const prior=JSON.parse(sessionStorage.getItem('bienvu:url-import-request')??'null');if(prior?.url===value&&typeof prior.key==='string'&&/^[a-zA-Z0-9_-]{16,128}$/.test(prior.key)&&(!prior.owner||prior.owner===agency)&&(!prior.expires||prior.expires>Date.now()))return prior.key as string;}catch{}
  const key=crypto.randomUUID();try{sessionStorage.setItem('bienvu:url-import-request',JSON.stringify({url:value,key,owner:agency,expires:Date.now()+lifetime}));}catch{}return key;
 }
 async function request(value:string,agency:string,key:string,estimate:boolean,signal:AbortSignal){
  if(scope.current!==agency)throw new DOMException('Agence changée','AbortError');
  let response=await fetch('/api/imports',{method:'POST',headers:{'Content-Type':'application/json','Idempotency-Key':key},body:JSON.stringify({url:value,...(estimate?{estimate:true}:{})}),signal});
  for(let attempt=0;attempt<120;attempt++){
   const body=await response.json() as {id?:string;status?:string;listing?:unknown;draft?:unknown;errorCode?:string;error?:{code?:string;message?:string}};
   if(scope.current!==agency)throw new DOMException('Agence changée','AbortError');
   if(!response.ok||body.status==='failed'){
    const code=body.error?.code??body.errorCode;
    throw Error(body.error?.message??(code&&Object.hasOwn(publicErrors,code)?publicErrors[code as keyof typeof publicErrors][1]:'La lecture de cette annonce est indisponible. Réessayez ou utilisez la saisie manuelle.'));
   }
   if(!body.id)throw Error('Réponse d’import incomplète.');
   if(body.status==='ready'||body.status==='needs_input'){
    const parsedListing=body.listing?GeneratableListing.safeParse(body.listing):null,parsedDraft=body.draft?CreationDraftView.safeParse(body.draft):null;
    if(parsedListing&&!parsedListing.success||parsedDraft&&!parsedDraft.success)throw Error('La réponse d’import est incomplète. Réessayez la lecture de l’annonce.');
    const listing=parsedListing?.success?parsedListing.data:null,draft=parsedDraft?.success?parsedDraft.data:null;
    if(listing&&(listing.id!==body.id||listing.agencyId!==agency)||draft&&(draft.id!==body.id||draft.photos.some(photo=>photo.agencyId!==agency)))throw Error('Annonce indisponible dans cette agence.');
    if(!listing&&!draft)throw Error('Réponse d’import incomplète.');
    return {id:body.id,status:body.status,listing,draft} as PreparedUrlImport;
   }
   if(body.status!=='importing')throw Error('Lecture de l’annonce interrompue.');
   await wait(500);signal.throwIfAborted();response=await fetch('/api/imports/'+encodeURIComponent(body.id),{cache:'no-store',signal});
  }
  throw Error('La lecture de cette annonce prend trop de temps. Réessayez ou utilisez la saisie manuelle.');
 }
 function entryFor(value:string,agency:string){
  const cacheKey=agency+'\n'+value,prior=entries.current.get(cacheKey);if(prior&&Date.now()-prior.createdAt<lifetime)return prior;
  const controller=new AbortController(),key=keyFor(value,agency),entry:Entry={owner:agency,url:value,key,controller,createdAt:Date.now(),promise:request(value,agency,key,true,controller.signal)};
  entries.current.set(cacheKey,entry);if(entries.current.size>6)entries.current.delete(entries.current.keys().next().value!);return entry;
 }
 async function prepare(value:string,activate=false){
  const agency=scope.current;if(!agency)throw Error('Connectez-vous pour préparer les animations IA.');
  const valid=ImportUrl.parse(value),entry=entryFor(valid,agency),valueReady=await entry.promise;
  if(scope.current!==agency)throw new DOMException('Agence changée','AbortError');
  return activate?request(valid,agency,entry.key,false,entry.controller.signal):valueReady;
 }
 function retry(){if(!owner||!source)return;entries.current.delete(owner+'\n'+source);try{sessionStorage.removeItem('bienvu:url-import-request');}catch{}setState(null);setRevision(n=>n+1);}
 useEffect(()=>{
  if(!enabled||!owner||!source)return;let cancelled=false;setState({owner,url:source,phase:'loading'});
  const timer=setTimeout(()=>{void prepare(source).then(value=>{if(!cancelled&&scope.current===owner)setState({owner,url:source,phase:'ready',value});})
   .catch(e=>{if(!cancelled&&scope.current===owner)setState({owner,url:source,phase:'error',message:e instanceof Error?e.message:'Estimation indisponible.'});});},800);
  return()=>{cancelled=true;clearTimeout(timer);};
 },[source,owner,enabled,revision]);
 useEffect(()=>{return()=>{for(const entry of entries.current.values())entry.controller.abort();entries.current.clear();};},[owner]);
 const current=state&&state.owner===owner&&state.url===source?state:null;
 return {source,phase:enabled&&owner&&source?(current?.phase??'loading'):'idle',value:current?.value,message:current?.message,prepare,retry};
}
