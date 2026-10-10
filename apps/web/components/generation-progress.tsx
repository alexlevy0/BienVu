'use client';
import Link from 'next/link';
import {useState} from 'react';
import {publicErrors,type GenerationView,type PublicErrorCode} from '@bienvu/contracts';
import {useGenerationStore} from './generation-store';
import {generationSteps,generationProgressText} from '../lib/generation-steps';
export const generationActive=(job:GenerationView|null)=>Boolean(job&&!['ready','failed'].includes(job.status));
export function useGenerationProgress(agencyId?:string){
  const store=useGenerationStore();
  return {job:agencyId?store.jobs[0]??null:null,jobs:agencyId?store.jobs:[],setJob:(job:GenerationView)=>{
    if(agencyId)store.setJob(job,agencyId);
  },unavailable:store.unavailable,
    refreshDrafts:store.refreshDrafts};
}
export function GenerationProgress({job,unavailable=false}:{job:GenerationView;unavailable?:boolean}){
  const [retrying,setRetrying]=useState(false),[feedback,setFeedback]=useState('');
  async function retry(){setRetrying(true);try{const r=await fetch(`/api/generations/${job.id}/retry`,{method:'POST'});
    if(!r.ok)throw 0;setFeedback('Démarrage demandé. Le même traitement sera repris.');}catch{setFeedback('La reprise reste en attente. Vous pouvez revenir plus tard.');}finally{setRetrying(false);}}
  return <section id={`video-${job.id}`} className="generation-progress panel" aria-label="Votre génération">
    <span className="section-kicker">{job.title}</span><h3 aria-live="polite">{generationProgressText(job)}</h3>
    {generationActive(job)&&<><ol className="generation-steps" aria-label="Étapes de création">{generationSteps(job,job.sourceKind==='manual').map(({key,state,label})=><li key={key} className={`step-${state}`} aria-current={state==='current'?'step':undefined}>{state==='done'?'✓ ':state==='skipped'?'– ':''}{label}</li>)}</ol><p>Vous pouvez fermer cette page. Retrouvez la vidéo dans <Link href="/biens">Mes biens</Link>.</p></>}
    {unavailable&&<p role="status">La connexion est interrompue. Le traitement continue ; son état sera actualisé à votre retour.</p>}
    {job.status==='failed'&&<p className="form-feedback error" role="alert">{publicErrors[job.errorCode as PublicErrorCode]?.[1]??publicErrors.GENERATION_FAILED[1]}</p>}
    {job.retryAllowed&&<button className="text-button" disabled={retrying} onClick={()=>void retry()}>Relancer le démarrage</button>}
    {feedback&&<p role="status">{feedback}</p>}
    {job.videoUrl&&<><video className={`generated-video${job.aspectRatio==='16:9'?' is-horizontal':''}`} src={job.videoUrl} controls playsInline preload="metadata" aria-label={`Vidéo : ${job.title}`}/>{job.syntheticVoice&&<p className="field-help">Voix de synthèse.</p>}{job.downloadUrl&&<a className="button primary" href={job.downloadUrl} download>Télécharger la vidéo</a>}</>}
    {job.status==='ready'&&Boolean(job.avatar?.failed)&&<p role="status">La vidéo est prête. {job.avatar!.ready?'Un passage de l’avatar n’a pas pu être créé.':'L’avatar n’a pas pu être créé ; ses crédits supplémentaires ont été rendus.'}</p>}
    {job.status==='ready'&&!job.videoUrl&&<p>La période de conservation de cette vidéo est terminée.</p>}
  </section>;
}
