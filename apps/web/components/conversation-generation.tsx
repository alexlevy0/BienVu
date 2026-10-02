'use client';
import Link from 'next/link';
import {useEffect,useState} from 'react';
import {publicErrors,type GenerationView,type PublicErrorCode,type VideoAspectRatio} from '@bienvu/contracts';
import {generationActive} from './generation-progress';
import {HomeIcon} from './home-icons';
import {ProblemReport} from './problem-report';

type RequestMessage={kind:'url'|'manual';text:string};

export function ConversationGeneration({job,request,sending,anonymous,unavailable,onRefresh,aspectRatio}:{
  aspectRatio?:VideoAspectRatio;job:GenerationView|null;request:RequestMessage;sending:boolean;anonymous:boolean;unavailable?:boolean;onRefresh():Promise<void>}){
  const [posterFailed,setPosterFailed]=useState(false),[busy,setBusy]=useState(false),[feedback,setFeedback]=useState('');
  const poster=job&&!['queued','importing','failed'].includes(job.status)
    ?`/api/${anonymous?'trial':'generations'}/${job.id}/source-photo`:null;
  useEffect(()=>setPosterFailed(false),[poster]);
  const stages=['Annonce analysée','Photos sélectionnées',job?.syntheticVoice===false?'Texte prêt':'Voix off prête','Assemblage de la vidéo'];
  const horizontal=(job?.aspectRatio??aspectRatio)==='16:9';
  const ready=job?.status==='ready',active=job&&generationActive(job);
  const assembling=job?.status==='rendering';
  const percent=assembling?job.progressPercent:0;
  const completed=ready?4:job?.stage==='rendering'?3:job?.stage==='voicing'?2:job?.stage==='scripting'?2:0;
  async function act(path:string){setBusy(true);setFeedback('');try{const response=await fetch(path,{method:'POST'});
    const value=await response.json() as {error?:{message?:string}};
    if(!response.ok)throw new Error(value.error?.message??'Cette action n’a pas abouti. Réessayez.');
    if(path.endsWith('/login')){window.location.assign('/connexion?trial=1');return;}
    await onRefresh();
  }catch(error){setFeedback(error instanceof Error?error.message:'Réessayez.');}finally{setBusy(false);}}
  return <section className="home-conversation-job" aria-label="Votre création">
    <div className="home-request-bubble"><HomeIcon name={request.kind==='manual'?'pencil':'link'} size={22}/><div>
      <strong>{request.kind==='manual'?'Je souhaite ajouter mon annonce manuellement.':request.text}</strong>
      {request.kind==='url'&&<small>Créer une vidéo de cette annonce</small>}
    </div></div>
    <div className="home-conversation-response">
      <p className="home-conversation-lead" role="status">{sending?'Envoi de votre demande…':ready?'Votre vidéo est prête.':job?.status==='failed'?'La création a été interrompue.':'Nous préparons votre visite en vidéo.'}</p>
      <div className={`home-conversation-result${horizontal?' is-horizontal':''}`}><div className={`home-conversation-media${horizontal?' is-horizontal':''}`}>
        {job?.videoUrl?<video src={job.videoUrl} controls playsInline preload="metadata" aria-label={anonymous?'Aperçu filigrané de votre vidéo':'Votre vidéo immobilière'}/>
          :<div className={`home-conversation-poster${job?.status==='failed'?' home-poster-failed':''}`}>{poster&&!posterFailed&&<img src={poster} alt="" onError={()=>setPosterFailed(true)}/>}
            {(!poster||posterFailed)&&<span className="home-poster-skeleton" aria-hidden="true"/>}
            <div className="home-poster-overlay">{job?.status==='failed'||ready?<span className="home-poster-stopped" aria-hidden="true">!</span>:<span className="home-activity-ring" aria-hidden="true"/>}
              <strong>{sending?'Envoi en cours':job?.status==='failed'?'Création interrompue':ready?'Vidéo indisponible':'Génération en cours'}</strong>
              {assembling&&<span className="home-poster-percent">Assemblage · {percent} %</span>}</div>
            <small>{horizontal?'Horizontal 16:9':'Vertical 9:16'} · {job?.syntheticVoice===false?'Sans voix off':'Voix française'}</small></div>}
      </div><div className="home-conversation-status">
        {active||sending?<ol className="home-conversation-steps" aria-label="Étapes de création">{stages.map((label,index)=>{
          const state=sending?'future':index<completed?'done':index===completed?'current':'future';
          const text=request.kind==='manual'&&index===0?'Informations validées':request.kind==='manual'&&index===1?'Photos reçues':label;
          return <li className={`step-${state}`} key={label} aria-current={state==='current'?'step':undefined}>
            <span className="home-step-symbol" aria-hidden="true">{state==='done'?'✓':state==='current'?'◌':'·'}</span><span>{text}</span>
            {assembling&&index===3&&<strong className="home-render-percent">{percent} %</strong>}</li>;
        })}</ol>:null}
        {(active||sending)&&<div className={`home-stage-track${assembling?' is-measured':''}`} role="progressbar" aria-label="Traitement de la vidéo" aria-valuenow={assembling?percent:undefined} aria-valuemin={assembling?0:undefined} aria-valuemax={assembling?100:undefined} aria-valuetext={sending?'Envoi en cours':job?.status==='retry_wait'?'Reprise en attente':job?.status==='queued'?'En attente de démarrage':job?.stage==='importing'?'Lecture de l’annonce':job?.stage==='scripting'?'Préparation du texte':job?.stage==='voicing'?'Création de la voix':`Assemblage de la vidéo : ${percent} %`}><span style={assembling?{width:`${percent}%`}:undefined}/></div>}
        {unavailable&&<p role="status" className="home-stage-note">Connexion momentanément interrompue. L’état sera actualisé à votre retour.</p>}
        {job?.status==='failed'&&<p role="alert" className="home-stage-error">{publicErrors[job.errorCode as PublicErrorCode]?.[1]??publicErrors.GENERATION_FAILED[1]}</p>}
        {job?.retryAllowed&&<button type="button" className="text-button" disabled={busy} onClick={()=>void act(`/api/generations/${job.id}/retry`)}>Relancer le démarrage</button>}
        {ready&&job?.ownership==='owned'&&job.downloadUrl&&<a className="home-primary-button" href={job.downloadUrl} download>Télécharger la vidéo <span aria-hidden="true">↗</span></a>}
        {ready&&anonymous&&job?.ownership==='anonymous'&&<><button type="button" className="home-primary-button" disabled={busy} onClick={()=>void act(`/api/trial/${job.id}/login`)}>Télécharger sans filigrane <span aria-hidden="true">↗</span></button><p className="home-stage-note">Créez votre compte gratuitement pour récupérer votre vidéo.</p></>}
        {ready&&job?.ownership==='owned'&&job.masterAccess==='reserved'&&!job.downloadUrl&&<p className="home-stage-note" role="status">La récupération de votre vidéo est en cours. Le téléchargement apparaîtra ici dès qu’elle sera terminée.</p>}
        {ready&&job?.ownership==='owned'&&job.masterAccess==='locked'&&!job.downloadUrl&&job.videoUrl&&<><p className="home-stage-note">La vidéo est privée. Un crédit est nécessaire pour télécharger le master sans filigrane.</p>
          {!anonymous&&<button type="button" className="home-primary-button" disabled={busy} onClick={()=>void act(`/api/generations/${job.id}/unlock`)}>Utiliser un crédit</button>}</>}
        {ready&&job?.ownership==='owned'&&anonymous&&<Link href="/essai/recuperer">Retrouver ma vidéo dans mon compte</Link>}
        {ready&&<p className="home-stage-note">Disponible jusqu’au {new Date(job.expiresAt).toLocaleString('fr-FR')}.</p>}
        {ready&&!anonymous&&<p className="home-stage-note">{job.creditsUsed} crédit{job.creditsUsed>1?'s':''} utilisé{job.creditsUsed>1?'s':''}.{job.creditsRefunded>0?` ${job.creditsRefunded} crédit(s) restitué(s) pour les animations indisponibles.`:''}</p>}
        {ready&&!job.videoUrl&&<p className="home-stage-error" role="status">Cette vidéo n’est plus disponible dans votre espace. Consultez Mes vidéos pour connaître son état.</p>}
        {(active||sending)&&<p className="home-stage-note">Vous pouvez revenir plus tard. Retrouvez votre création dans <Link href="/historique">Mes vidéos</Link>{anonymous?' depuis ce navigateur':''}.</p>}
        {job&&['ready','failed'].includes(job.status)&&<ProblemReport key={job.id} jobId={job.id} anonymous={anonymous&&job.ownership==='anonymous'}/>}
        {feedback&&<p className="home-stage-error" role="alert">{feedback}</p>}
      </div></div>
    </div>
  </section>;
}
