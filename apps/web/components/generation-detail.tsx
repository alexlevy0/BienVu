'use client';
import {useEffect,useState} from 'react';
import Link from 'next/link';
import {GenerationView} from '@bienvu/contracts';
import {useAccount} from './account';
import {GenerationProgress} from './generation-progress';
import {anonymousGenerationScope,useGenerationStore} from './generation-store';
import {AnonymousTrialResult} from './anonymous-trial';
import {ProblemReport} from './problem-report';
export function GenerationDetail({id}:{id:string}){
  const {me,loading,refresh}=useAccount(),store=useGenerationStore();
  const owner=me?.agency.id??anonymousGenerationScope;
  const [fetched,setFetched]=useState<{owner:string;job:GenerationView}|null>(null),[failure,setFailure]=useState(''),[busy,setBusy]=useState(false);
  const job=store.jobs.find(value=>value.id===id)??(fetched&&fetched.owner===owner?fetched.job:null);
  useEffect(()=>{if(loading)return;let disposed=false;setFailure('');
    void (async()=>{try{const r=await fetch(`/api/${me?'generations':'trial'}/${id}`,{cache:'no-store'}),data=await r.json() as {error?:{message?:string}};
      if(!r.ok)throw new Error(data.error?.message??'Cette vidéo est introuvable.');
      if(!disposed){const next=GenerationView.parse(data);setFetched({owner,job:next});store.setJob(next,owner);setFailure('');}}
      catch(e){if(!disposed)setFailure(e instanceof Error?e.message:'Chargement interrompu.');}})();
    return()=>{disposed=true;};
  },[id,owner,loading]);
  async function unlock(){if(!me)return;const expectedOwner=me.agency.id;setBusy(true);setFailure('');try{const r=await fetch(`/api/generations/${id}/unlock`,{method:'POST'}),data=await r.json() as {error?:{message?:string}};if(!r.ok)throw new Error(data.error?.message??'Le téléchargement reste verrouillé.');store.setJob(GenerationView.parse(data),expectedOwner);await refresh();}catch(e){setFailure(e instanceof Error?e.message:'Réessayez.');}finally{setBusy(false);}}
  return <section className="trial-result"><Link href="/historique">← Mes vidéos</Link><h1>Votre vidéo, à retrouver ici.</h1>
    {loading?<p role="status">Chargement de votre espace…</p>:job?<>
      {me?<GenerationProgress job={job}/>:<AnonymousTrialResult key={job.id} job={job}/>}
      {me&&job.masterAccess==='locked'&&job.status!=='failed'&&job.retention==='available'&&new Date(job.expiresAt).getTime()>Date.now()&&<div className="trial-locked"><h2>Votre vidéo est enregistrée et privée.</h2><p>Le téléchargement sans filigrane nécessite un crédit. {me.rights.renewalAt?`Votre quota se renouvelle le ${new Date(me.rights.renewalAt).toLocaleString('fr-FR')}.`:'Vous pouvez utiliser un crédit disponible sur votre compte.'}</p><p>{me.rights.developmentRemaining} crédit{me.rights.developmentRemaining>1?'s':''} disponible{me.rights.developmentRemaining>1?'s':''}.</p><button className="home-primary-button" disabled={busy||me.rights.developmentRemaining===0} onClick={()=>void unlock()}>{busy?'Vérification…':'Utiliser un crédit pour cette vidéo'}</button></div>}
      {job.downloadUrl&&<p>Cette vidéo utilise un seul crédit. Les téléchargements suivants n’utilisent aucun crédit supplémentaire.</p>}
      {['ready','failed'].includes(job.status)&&<ProblemReport key={job.id} jobId={job.id} anonymous={!me}/>}
    </>:!failure&&<p role="status">Chargement de la vidéo…</p>}{failure&&<p role="alert">{failure}</p>}</section>;
}
