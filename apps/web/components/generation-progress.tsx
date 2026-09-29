'use client';
import Link from 'next/link';
import {useEffect,useState} from 'react';
import {publicErrors,type GenerationView,type PublicErrorCode} from '@bienvu/contracts';
const states:Record<GenerationView['status'],string>={queued:'Votre vidéo attend son démarrage',importing:'Lecture de l’annonce et vérification des photos',scripting:'Rédaction de la narration',voicing:'Création de la voix française',rendering:'Montage de votre vidéo',retry_wait:'Reprise du traitement en attente',ready:'Votre vidéo est prête',failed:'La préparation n’a pas abouti'};
export const generationActive=(job:GenerationView|null)=>Boolean(job&&!['ready','failed'].includes(job.status));
export function useGenerationProgress(agencyId?:string){
  const [job,setJob]=useState<GenerationView|null>(null),[unavailable,setUnavailable]=useState(false);
  useEffect(()=>{let disposed=false;setJob(null);if(!agencyId)return;
    void fetch('/api/generations',{cache:'no-store'}).then(async r=>{if(r.ok&&!disposed){const data=await r.json() as {jobs:GenerationView[]};setJob(data.jobs[0]??null);}}).catch(()=>{});
    return()=>{disposed=true;};
  },[agencyId]);
  useEffect(()=>{if(!job||!generationActive(job))return;let disposed=false;
    const refresh=async()=>{try{const response=await fetch(`/api/generations/${job.id}`,{cache:'no-store'});if(!response.ok)throw 0;
      const next=await response.json() as GenerationView;if(!disposed){setJob(next);setUnavailable(false);}}catch{if(!disposed)setUnavailable(true);}};
    const timer=setInterval(()=>void refresh(),4000);return()=>{disposed=true;clearInterval(timer);};
  },[job?.id,job?.status]);
  return {job,setJob,unavailable};
}
export function GenerationProgress({job,unavailable=false}:{job:GenerationView;unavailable?:boolean}){
  const [retrying,setRetrying]=useState(false),[feedback,setFeedback]=useState('');
  async function retry(){setRetrying(true);try{const r=await fetch(`/api/generations/${job.id}/retry`,{method:'POST'});
    if(!r.ok)throw 0;setFeedback('Démarrage demandé. Le même traitement sera repris.');}catch{setFeedback('La reprise reste en attente. Vous pouvez revenir plus tard.');}finally{setRetrying(false);}}
  return <section className="generation-progress panel" aria-label="Votre génération">
    <span className="section-kicker">{job.title}</span><h3 aria-live="polite">{states[job.status]}</h3>
    {generationActive(job)&&<><ol className="generation-steps" aria-label="Étapes de création">{(['importing','scripting','voicing','rendering'] as const).map((s,i)=><li key={s} aria-current={job.stage===s?'step':undefined}>{i+1}. {['Annonce','Texte','Voix','Vidéo'][i]}</li>)}</ol><p>Vous pouvez fermer cette page. Retrouvez la vidéo dans <Link href="/historique">votre historique</Link>.</p></>}
    {unavailable&&<p role="status">La connexion est interrompue. Le traitement continue ; son état sera actualisé à votre retour.</p>}
    {job.status==='failed'&&<p className="form-feedback error" role="alert">{publicErrors[job.errorCode as PublicErrorCode]?.[1]??publicErrors.GENERATION_FAILED[1]}</p>}
    {job.retryAllowed&&<button className="text-button" disabled={retrying} onClick={()=>void retry()}>Relancer le démarrage</button>}
    {feedback&&<p role="status">{feedback}</p>}
    {job.videoUrl&&<><video className="generated-video" src={job.videoUrl} controls playsInline preload="metadata" aria-label={`Vidéo : ${job.title}`}/><p className="field-help">Voix de synthèse · Disponible jusqu’au {new Date(job.expiresAt).toLocaleDateString('fr-FR')}.</p><a className="button primary" href={job.downloadUrl!} download>Télécharger la vidéo</a></>}
    {job.status==='ready'&&!job.videoUrl&&<p>La période de conservation de cette vidéo est terminée.</p>}
  </section>;
}
