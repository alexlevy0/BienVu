'use client';
import Link from 'next/link';
import {useCallback,useEffect,useState} from 'react';
import type {GenerationView} from '@bienvu/contracts';
import {useAccount} from './account';
import {GenerationProgress,generationActive} from './generation-progress';
export function GenerationHistory(){
  const {me,loading}=useAccount(),[jobs,setJobs]=useState<GenerationView[]>([]),[cursor,setCursor]=useState<string|null>(null);
  const [busy,setBusy]=useState(false),[feedback,setFeedback]=useState(''),[loaded,setLoaded]=useState(false);
  const load=useCallback(async(next?:string)=>{setBusy(true);try{const response=await fetch(`/api/generations${next?`?cursor=${encodeURIComponent(next)}`:''}`,{cache:'no-store'});
    if(!response.ok)throw 0;const data=await response.json() as {jobs:GenerationView[];nextCursor:string|null};
    setJobs(old=>next?[...old,...data.jobs.filter(j=>!old.some(x=>x.id===j.id))]:data.jobs);setCursor(data.nextCursor);setFeedback('');setLoaded(true);
  }catch{setFeedback('Impossible de charger vos vidéos pour le moment. Réessayez.');}finally{setBusy(false);}},[]);
  useEffect(()=>{setJobs([]);setLoaded(false);if(me)void load();},[me,load]);
  useEffect(()=>{if(!jobs.some(generationActive))return;const timer=setInterval(()=>void load(),5000);return()=>clearInterval(timer);},[jobs,load]);
  if(loading)return <p role="status">Chargement…</p>;
  if(!me)return <Link className="button primary" href="/connexion">Se connecter pour retrouver mes vidéos</Link>;
  return <div className="generation-history">{feedback&&<p role="alert">{feedback} <button className="text-button" onClick={()=>void load()}>Actualiser</button></p>}
    {!loaded&&!feedback&&<p role="status">Chargement de vos vidéos…</p>}
    {loaded&&jobs.length===0&&<section className="panel empty-state"><h2>Aucune vidéo pour le moment.</h2><p>Vos prochaines créations seront disponibles ici.</p><Link className="button primary" href="/generer">Créer une vidéo</Link></section>}
    {jobs.map(job=><GenerationProgress key={job.id} job={job}/>)}
    {cursor&&<button className="button secondary" disabled={busy} onClick={()=>void load(cursor)}>Afficher les vidéos précédentes</button>}
  </div>;
}
