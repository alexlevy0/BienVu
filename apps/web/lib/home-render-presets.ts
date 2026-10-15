import {defaultAvatarCustomization,defaultVideoCustomization,generationCreditCost,type AvatarCustomization,type AvatarCatalog,type VideoCustomization} from '@bienvu/contracts';

export const homeRenderPresets=[
  {id:'standard',slot:'renders.standard.video',title:'Standard',subtitle:'Le rendu essentiel, efficace.',description:'Vidéo standard de 20 s',
    features:['Fondus classiques entre les photos','Sans avatar ni animation IA']},
  {id:'avatar',slot:'renders.avatar.video',title:'Avec avatar',subtitle:'Un avatar du début à la fin.',description:'Vidéo de 20 s + avatar inclus',
    features:['Fondus classiques entre les photos','Avatar pendant toute la vidéo']},
  {id:'avatar-ai',slot:'renders.avatar-ai.video',title:'Avatar + animations IA',subtitle:'Un rendu plus dynamique et immersif.',description:'Vidéo de 20 s + avatar + 4 animations IA',
    features:['Avatar pendant toute la vidéo','4 photos animées par IA','Transitions entre les séquences']},
] as const;
export type HomeRenderPreset=typeof homeRenderPresets[number]['id'];
export type HomeRenderChoice={preset:HomeRenderPreset;revision:number};
export const homeRenderPresetKey='bienvu:home-render-preset';
export function parseHomeRenderPreset(value:unknown):HomeRenderPreset|null{return homeRenderPresets.find(item=>item.id===value)?.id??null;}
export function presetAvatar(catalog:AvatarCatalog,existing?:AvatarCustomization):AvatarCustomization{
  if(!catalog.enabled)throw Error('Les présentateurs sont momentanément indisponibles.');
  const look=catalog.looks.find(item=>item.id===existing?.lookId)??catalog.looks.find(item=>item.id===catalog.defaultLookId)??catalog.looks[0];
  if(!look)throw Error('Aucun présentateur n’est disponible actuellement.');
  const engine=look.engines.includes('avatar_iii')?'avatar_iii':catalog.allowPremium&&look.engines.includes('avatar_iv')?'avatar_iv':null;
  if(!engine)throw Error('Ce présentateur n’est plus disponible. Choisissez-en un autre dans Personnaliser.');
  return {...defaultAvatarCustomization(look.id),...existing,lookId:look.id,engine,moments:'full',hidden:undefined,maxSeconds:Math.min(existing?.maxSeconds??6,catalog.maxSeconds)};
}
export function applyHomeRenderPreset(preset:HomeRenderPreset,base:VideoCustomization,slots:number[]=base.photoOrder??[],avatar=base.avatar):VideoCustomization{
  return {...base,photoMotion:true,transition:'fade',runwayClips:undefined,runwayPhotos:preset==='avatar-ai'?[...slots]:[],
    ...(slots.length?{photoOrder:[...slots]}:{}),avatar:preset==='standard'?undefined:avatar?{...avatar,moments:'full',hidden:undefined}:undefined};
}
export function homeRenderExampleCredits(preset:HomeRenderPreset){
  return generationCreditCost({...defaultVideoCustomization(),runwayPhotos:preset==='avatar-ai'?[0,1,2,3]:[],...(preset!=='standard'?{avatar:{...defaultAvatarCustomization('example'),moments:'full' as const}}:{})},20);
}
