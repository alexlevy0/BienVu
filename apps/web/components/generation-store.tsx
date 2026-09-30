'use client';
import Link from 'next/link';
import {createContext,useCallback,useContext,useEffect,useRef,useState} from 'react';
import {GenerationView} from '@bienvu/contracts';
import {useAccount} from './account';
import {readRecentPages} from '../lib/recent-pages';

export type RecentDraft={id:string;sourceKind:'url'|'manual';title:string|null;locality:string|null;previewPhotoId:string|null;
  createdAt:string;status:'needs_input'};
export const anonymousGenerationScope='anonymous';
type State={jobs:GenerationView[];drafts:RecentDraft[];unavailable:boolean;loading:boolean;setJob(job:GenerationView,owner:string):void;
  refresh():Promise<void>;refreshDrafts():Promise<void>;forgetDraft(id:string,owner:string):void};
const Context=createContext<State|null>(null);
const active=(job:GenerationView)=>!['ready','failed'].includes(job.status);
export function GenerationStoreProvider({children}:{children:React.ReactNode}){
  const {me,loading:accountLoading,refreshRights}=useAccount(),owner=accountLoading?undefined:me?.agency.id??anonymousGenerationScope;
  const [jobs,setJobs]=useState<GenerationView[]>([]),[drafts,setDrafts]=useState<RecentDraft[]>([]),
    [unavailable,setUnavailable]=useState(false),[loading,setLoading]=useState(true),[notification,setNotification]=useState<GenerationView|null>(null);
  const ownerRef=useRef<string|undefined>(owner),seen=useRef<Set<string>>(new Set()),initialized=useRef(false),jobsRef=useRef(jobs),
    lastDraftRead=useRef(0),deletedDrafts=useRef(new Set<string>()),readingJobs=useRef<string|null>(null),readingDrafts=useRef<string|null>(null),queuedDraftRead=useRef<string|null>(null);
  jobsRef.current=jobs;
  const put=useCallback((job:GenerationView,expectedOwner:string)=>{
    if(ownerRef.current!==expectedOwner)return;
    setJobs(current=>[job,...current.filter(item=>item.id!==job.id)].sort((a,b)=>b.createdAt.localeCompare(a.createdAt)));
    if(expectedOwner!==anonymousGenerationScope)void refreshRights();
  },[refreshRights]);
  const refreshDrafts=useCallback(async():Promise<void>=>{
    if(!owner||owner===anonymousGenerationScope)return;
    if(readingDrafts.current===owner){queuedDraftRead.current=owner;return;}readingDrafts.current=owner;
    try{const drafts=await readRecentPages('/api/imports?drafts=1','imports',value=>value as RecentDraft,()=>ownerRef.current===owner);
      if(!drafts||ownerRef.current!==owner)return;
      setDrafts(drafts.filter(row=>row.status==='needs_input'&&!deletedDrafts.current.has(row.id)));lastDraftRead.current=Date.now();
    }catch{/* An unavailable import list does not hide the last known private drafts. */}
    finally{if(readingDrafts.current===owner){readingDrafts.current=null;
      if(queuedDraftRead.current===owner){queuedDraftRead.current=null;void refreshDrafts();}}}
  },[owner]);
  const forgetDraft=useCallback((id:string,expectedOwner:string)=>{
    if(ownerRef.current!==expectedOwner)return;
    deletedDrafts.current.add(id);setDrafts(current=>current.filter(draft=>draft.id!==id));
  },[]);
  const refresh=useCallback(async()=>{
    if(!owner||readingJobs.current===owner)return;readingJobs.current=owner;
    try{const next=await readRecentPages(owner===anonymousGenerationScope?'/api/trial/history':'/api/generations','jobs',value=>GenerationView.parse(value),()=>ownerRef.current===owner);
      if(!next||ownerRef.current!==owner)return;
      const wasInitialized=initialized.current;
      if(wasInitialized&&owner!==anonymousGenerationScope&&next.some(fresh=>{
        const old=jobsRef.current.find(job=>job.id===fresh.id);return old&&active(old)&&!active(fresh);
      }))void refreshRights();
      if(wasInitialized){for(const fresh of next){const old=jobsRef.current.find(job=>job.id===fresh.id);
        if(old&&active(old)&&fresh.status==='ready'&&!seen.current.has(fresh.id)){
          seen.current.add(fresh.id);setNotification(fresh);
        }}}
      else {next.filter(job=>job.status==='ready').forEach(job=>seen.current.add(job.id));initialized.current=true;}
      setJobs(current=>{
        const recentMissing=current.filter(job=>active(job)&&!next.some(item=>item.id===job.id)&&
          Date.now()-Date.parse(job.createdAt)<60_000);
        return [...next,...recentMissing].sort((a,b)=>b.createdAt.localeCompare(a.createdAt));
      });setUnavailable(false);
      if(Date.now()-lastDraftRead.current>30_000)void refreshDrafts();
    }catch{if(ownerRef.current===owner)setUnavailable(true);}
    finally{if(readingJobs.current===owner)readingJobs.current=null;if(ownerRef.current===owner)setLoading(false);}
  },[owner,refreshDrafts,refreshRights]);
  useEffect(()=>{
    ownerRef.current=owner;setJobs([]);setDrafts([]);setNotification(null);setUnavailable(false);setLoading(true);
    seen.current=new Set();deletedDrafts.current=new Set();initialized.current=false;lastDraftRead.current=0;
    if(owner)void refresh();
  },[owner,refresh]);
  useEffect(()=>{if(!owner)return;
    const tick=()=>{if(document.visibilityState==='visible')void refresh();};
    const timer=window.setInterval(()=>{if(jobsRef.current.some(active))tick();},6500);
    document.addEventListener('visibilitychange',tick);window.addEventListener('focus',tick);
    return()=>{clearInterval(timer);document.removeEventListener('visibilitychange',tick);window.removeEventListener('focus',tick);};
  },[owner,refresh,refreshDrafts]);
  const sameOwner=ownerRef.current===owner;
  return <Context.Provider value={{jobs:sameOwner?jobs:[],drafts:sameOwner?drafts:[],unavailable:sameOwner&&unavailable,loading:!sameOwner||loading,setJob:put,refresh,refreshDrafts,forgetDraft}}>{children}
    {sameOwner&&notification&&<div className="studio-notification" role="status"><span>Votre vidéo « {notification.title} » est prête.</span>
      <Link href={`/historique#video-${notification.id}`} onClick={()=>setNotification(null)}>Voir la vidéo</Link>
      <button type="button" aria-label="Fermer la notification" onClick={()=>setNotification(null)}>×</button></div>}
  </Context.Provider>;
}
export function useGenerationStore(){const state=useContext(Context);if(!state)throw new Error('GENERATION_STORE_REQUIRED');return state;}
