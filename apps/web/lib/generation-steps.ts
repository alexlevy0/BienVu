import type {GenerationView} from '@bienvu/contracts';

type StepKey='importing'|'photos'|'map'|'narration'|'avatar'|'animations'|'rendering';
export type GenerationStep={key:StepKey;state:'future'|'current'|'done'|'skipped';label:string;detail?:string;progress?:{completed:number;total:number}};

export function generationAnimationOmissionText(job:GenerationView|null):string|undefined{
  if(!job?.animationProgress?.skipped)return;
  const reason=job.animationOmissionReason;
  const message=reason==='RUNWAY_BUDGET_LIMIT'?'Le budget du service a empêché la création de certaines animations.':
    reason==='RUNWAY_CREDITS_EXHAUSTED'?'Le solde disponible chez Runway ne suffisait pas pour toutes les animations.':
    reason==='RUNWAY_ACCOUNT_UNAVAILABLE'?'Le solde du service d’animation n’a pas pu être vérifié.':
    reason==='RUNWAY_DISABLED'?'Le service d’animation était désactivé.':
    reason==='RUNWAY_TIMEOUT'?'Certaines animations n’ont pas été disponibles dans le délai prévu.':
    'Certaines animations n’ont pas pu être créées.';
  return `${message} Les photos concernées gardent leurs mouvements classiques. ${['ready','failed'].includes(job.status)?'Les animations non réalisées ne sont pas facturées.':'Seules les animations réalisées seront facturées.'}`;
}

export function generationMapOmissionText(job:GenerationView|null):string|undefined{
  if(job?.preparation?.map!=='skipped')return;
  switch(job.mapOmissionReason){
    case 'location_missing':return 'La ville du bien n’est pas renseignée. Ajoutez-la ou confirmez la localisation dans Personnaliser → Carte pour une prochaine vidéo.';
    case 'ambiguous_location':return `${job.locality?`La localisation « ${job.locality} »`:'La localisation du bien'} n’a pas pu être identifiée sans ambiguïté. Confirmez-la dans Personnaliser → Carte pour une prochaine vidéo.`;
    case 'map_unavailable':return 'Le service cartographique était indisponible lors de la préparation. La vidéo continue sans carte. Vous pourrez réessayer sur une prochaine génération.';
    case 'confirmation_skipped':return 'Vous avez choisi de continuer sans carte.';
    case 'confirmation_timeout':return 'La localisation n’a pas été confirmée à temps. La vidéo a continué sans carte.';
    default:return 'La raison n’a pas été enregistrée pour cette génération. Vérifiez la localisation dans Personnaliser → Carte pour une prochaine vidéo.';
  }
}

// A checklist of server checkpoints, never a progression based on elapsed time.
export function generationSteps(job:GenerationView|null,manual=false):GenerationStep[]{
  const preparation=job?.preparation??{};
  const voiceReady=Boolean(job&&(job.narrationReady||job.stage==='rendering'||job.avatar?.active));
  const imported=Boolean(job&&(job.stage==='scripting'||job.stage==='voicing'||job.stage==='rendering'||preparation.map==='working'||preparation.map==='ready'||preparation.map==='skipped'));
  const waiting=!job||job.status==='queued';
  const working=(['map','avatar','animations'] as const).find(key=>preparation[key]==='working');
  const next:StepKey=working??(!imported?'importing':!voiceReady?'narration':
    preparation.avatar==='pending'?'avatar':preparation.animations==='pending'?'animations':preparation.map==='pending'?'map':'rendering');
  const terminal=job?.status==='ready'||job?.status==='failed';
  function step(key:StepKey,state:GenerationStep['state'],pending:string,current:string,done:string,skipped=done):GenerationStep{
    if(!waiting&&!terminal&&next===key&&state==='future')state='current';
    return {key,state,label:state==='done'?done:state==='skipped'?skipped:state==='current'?current:pending};
  }
  const steps:GenerationStep[]=[
    step('importing',imported?'done':'future',manual?'Informations du bien':'Annonce',manual?'Validation des informations':'Analyse de l’annonce',manual?'Informations validées':'Annonce analysée'),
    step('photos',imported?'done':'future','Photos','Préparation des photos',manual?'Photos reçues':'Photos sélectionnées'),
  ];
  const optional=(key:'map'|'avatar'|'animations',pending:string,current:string,done:string,skipped:string)=>{
    const state=preparation[key];if(!state)return;
    steps.push(step(key,state==='ready'?'done':state==='skipped'?'skipped':'future',pending,current,done,skipped));
  };
  optional('map','Carte','Génération de la carte','Carte prête','Carte non ajoutée');
  const mapStep=steps.find(s=>s.key==='map');
  if(mapStep&&job?.mapConfirmation&&!terminal&&!waiting){mapStep.state='current';mapStep.label='Confirmez la ville pour la carte';}
  if(mapStep?.state==='skipped')mapStep.detail=generationMapOmissionText(job);
  steps.push(step('narration',voiceReady?'done':'future',job?.syntheticVoice===false?'Texte':'Voix off',
    job?.stage==='scripting'||job?.syntheticVoice===false?'Préparation du texte':'Création de la voix off',job?.syntheticVoice===false?'Texte prêt':'Voix off prête'));
  optional('avatar','Avatar IA','Génération de l’avatar','Avatar prêt','Avatar non ajouté');
  optional('animations','Animations IA','Animation des photos','Photos animées','Photos sans animation');
  const animationStep=steps.find(s=>s.key==='animations'),progress=job?.animationProgress;
  if(animationStep&&progress){
    animationStep.progress={completed:progress.ready+progress.skipped,total:progress.total};
    const notes:string[]=[];
    if(progress.reused)notes.push(`${progress.reused} animation${progress.reused>1?'s':''} réutilisée${progress.reused>1?'s':''}`);
    if(progress.skipped){
      animationStep.label=animationStep.state==='done'?'Animations terminées':animationStep.label;
      notes.push(`${progress.skipped} photo${progress.skipped>1?'s':''} avec mouvements classiques`);
    }
    const omission=generationAnimationOmissionText(job);
    if(notes.length||omission)animationStep.detail=[notes.length?notes.join(' · ')+'.':null,omission].filter(Boolean).join(' ');
  }
  steps.push(step('rendering',job?.status==='ready'?'done':'future','Assemblage de la vidéo','Assemblage de la vidéo','Vidéo prête'));
  return steps;
}

export function generationProgressText(job:GenerationView):string{
  if(job.queue&&!['ready','failed'].includes(job.status))return generationQueueText(job);
  if(job.status==='queued')return 'En attente de démarrage';
  if(job.status==='retry_wait')return 'Reprise en attente';
  if(job.status==='failed')return 'La préparation n’a pas abouti';
  if(job.status==='ready')return 'Votre vidéo est prête';
  return generationSteps(job).find(step=>step.state==='current')?.label??'Préparation de la vidéo';
}

export function generationQueueText(job:GenerationView):string{
  const phase=job.queue?.resource;
  const label=phase==='render'?'Assemblage en attente':phase==='runway'?'Animations des photos en attente':phase==='avatar'?'Présentateur en attente':'Votre vidéo attend son tour';
  return job.queue?`${label} · position ${job.queue.position}`:label;
}
