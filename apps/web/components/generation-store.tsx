'use client';
import Link from 'next/link';
import {createContext,useCallback,useContext,useEffect,useRef,useState} from 'react';
import {GenerationView} from '@bienvu/contracts';
import {useAccount} from './account';

export type RecentDraft={id:string;sourceKind:'url'|'manual';title:string|null;locality:string|null;previewPhotoId:string|null;
  createdAt:string;status:'needs_input'};
type State={jobs:GenerationView[];drafts:RecentDraft[];unavailable:boolean;setJob(job:GenerationView,owner:string):void;
  refresh():Promise<void>;refreshDrafts():Promise<void>};
const Context=createContext<State|null>(null);
const active=(job:GenerationView)=>!['ready','failed'].includes(job.status);
export function GenerationStoreProvider({children}:{children:React.ReactNode}){
  const {me}=useAccount(),owner=me?.agency.id;
  const [jobs,setJobs]=useState<GenerationView[]>([]),[drafts,setDrafts]=useState<RecentDraft[]>([]),
    [unavailable,setUnavailable]=useState(false),[notification,setNotification]=useState<GenerationView|null>(null);
  const ownerRef=useRef<string|undefined>(owner),seen=useRef<Set<string>>(new Set()),initialized=useRef(false),jobsRef=useRef(jobs),
    lastDraftRead=useRef(0);
  jobsRef.current=jobs;
  const put=useCallback((job:GenerationView,expectedOwner:string)=>{
    if(ownerRef.current!==expectedOwner)return;
    setJobs(current=>[job,...current.filter(item=>item.id!==job.id)].sort((a,b)=>b.createdAt.localeCompare(a.createdAt)).slice(0,30));
  },[]);
  const refreshDrafts=useCallback(async()=>{
    if(!owner)return;
    try{const response=await fetch('/api/imports',{cache:'no-store'});if(!response.ok)throw new Error();
      const data=await response.json() as {imports:RecentDraft[]};if(ownerRef.current!==owner)return;
      setDrafts(data.imports.filter(row=>row.status==='needs_input').slice(0,20));lastDraftRead.current=Date.now();
    }catch{/* An unavailable import list does not hide the last known private drafts. */}
  },[owner]);
  const refresh=useCallback(async()=>{
    if(!owner)return;
    try{const response=await fetch('/api/generations',{cache:'no-store'});if(!response.ok)throw new Error();
      const data=await response.json() as {jobs:unknown[]};if(ownerRef.current!==owner)return;
      const next=data.jobs.map(value=>GenerationView.parse(value));
      const wasInitialized=initialized.current;
      if(wasInitialized){for(const fresh of next){const old=jobsRef.current.find(job=>job.id===fresh.id);
        if(old&&active(old)&&fresh.status==='ready'&&!seen.current.has(fresh.id)){
          seen.current.add(fresh.id);setNotification(fresh);
        }}}
      else {next.filter(job=>job.status==='ready').forEach(job=>seen.current.add(job.id));initialized.current=true;}
      setJobs(current=>{
        if(!wasInitialized)return next;
        const recentMissing=current.filter(job=>active(job)&&!next.some(item=>item.id===job.id)&&
          Date.now()-Date.parse(job.createdAt)<60_000);
        return [...next,...recentMissing].sort((a,b)=>b.createdAt.localeCompare(a.createdAt)).slice(0,30);
      });setUnavailable(false);
      if(Date.now()-lastDraftRead.current>30_000)void refreshDrafts();
    }catch{if(ownerRef.current===owner)setUnavailable(true);}
  },[owner,refreshDrafts]);
  useEffect(()=>{
    ownerRef.current=owner;setJobs([]);setDrafts([]);setNotification(null);setUnavailable(false);
    seen.current=new Set();initialized.current=false;lastDraftRead.current=0;
    if(owner)void refresh();
  },[owner,refresh]);
  useEffect(()=>{if(!owner)return;
    const tick=()=>{if(document.visibilityState==='visible')void refresh();};
    const timer=window.setInterval(()=>{if(jobsRef.current.some(active))tick();},6500);
    document.addEventListener('visibilitychange',tick);window.addEventListener('focus',tick);
    return()=>{clearInterval(timer);document.removeEventListener('visibilitychange',tick);window.removeEventListener('focus',tick);};
  },[owner,refresh,refreshDrafts]);
  const sameOwner=ownerRef.current===owner;
  return <Context.Provider value={{jobs:sameOwner?jobs:[],drafts:sameOwner?drafts:[],unavailable,setJob:put,refresh,refreshDrafts}}>{children}
    {sameOwner&&notification&&<div className="studio-notification" role="status"><span>Votre vidéo « {notification.title} » est prête.</span>
      <Link href={`/historique#video-${notification.id}`} onClick={()=>setNotification(null)}>Voir la vidéo</Link>
      <button type="button" aria-label="Fermer la notification" onClick={()=>setNotification(null)}>×</button></div>}
  </Context.Provider>;
}
export function useGenerationStore(){const state=useContext(Context);if(!state)throw new Error('GENERATION_STORE_REQUIRED');return state;}
