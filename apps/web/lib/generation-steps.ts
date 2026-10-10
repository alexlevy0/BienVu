import type {GenerationView} from '@bienvu/contracts';

type StepKey='importing'|'photos'|'map'|'narration'|'avatar'|'animations'|'rendering';
export type GenerationStep={key:StepKey;state:'future'|'current'|'done'|'skipped';label:string};

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
  steps.push(step('narration',voiceReady?'done':'future',job?.syntheticVoice===false?'Texte':'Voix off',
    job?.stage==='scripting'||job?.syntheticVoice===false?'Préparation du texte':'Création de la voix off',job?.syntheticVoice===false?'Texte prêt':'Voix off prête'));
  optional('avatar','Avatar IA','Génération de l’avatar','Avatar prêt','Avatar non ajouté');
  optional('animations','Animations IA','Animation des photos','Photos animées','Photos sans animation');
  steps.push(step('rendering',job?.status==='ready'?'done':'future','Assemblage de la vidéo','Assemblage de la vidéo','Vidéo prête'));
  return steps;
}

export function generationProgressText(job:GenerationView):string{
  if(job.status==='queued')return 'En attente de démarrage';
  if(job.status==='retry_wait')return 'Reprise en attente';
  if(job.status==='failed')return 'La préparation n’a pas abouti';
  if(job.status==='ready')return 'Votre vidéo est prête';
  return generationSteps(job).find(step=>step.state==='current')?.label??'Préparation de la vidéo';
}
