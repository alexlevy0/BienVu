import {z} from 'zod';
import type {AgencyBrand, NormalizedListing} from './product';
import {fishFrenchVoices,CartesiaVoiceId,cartesiaParisianVoices} from './voice';
import {EditorDocument} from './editor';

export const DEFAULT_VIDEO_VOICE='fish-manon' as const;

export const videoStyles=[{id:'editorial',name:'Éditorial',description:'Des repères affirmés, en grand.'},
  {id:'minimal',name:'Minimal',description:'Des informations sobres, au fil des photos.'},
  {id:'cinematic',name:'Cinéma',description:'Les images à l’honneur, les informations à la fin.'}] as const;
export const frenchVoices=[{id:'fr-FR-Chirp3-HD-Aoede',name:'Aoede',provider:'Google · Chirp 3 HD'},
  {id:'fr-FR-Chirp3-HD-Kore',name:'Kore',provider:'Google · Chirp 3 HD'},
  {id:'fr-FR-Chirp3-HD-Charon',name:'Charon',provider:'Google · Chirp 3 HD'},
  ...fishFrenchVoices.map(voice=>({...voice,provider:'Fish Audio · S2.1 Pro'})),
  ...cartesiaParisianVoices.map(voice=>({...voice,provider:'Cartesia · Sonic 3.6'}))] as const;
export const VideoVoice=z.union([z.enum(['fr-FR-Chirp3-HD-Aoede','fr-FR-Chirp3-HD-Kore','fr-FR-Chirp3-HD-Charon','fish-manon','fish-lucas','fish-camille']),CartesiaVoiceId]);
export const VideoStyle=z.enum(['editorial','minimal','cinematic']);
const photoOrder=z.array(z.number().int().min(0).max(11)).max(12)
  .refine(values=>new Set(values).size===values.length,'Une photo ne peut être sélectionnée deux fois.');
export const CustomNarration=z.array(z.string().trim().min(1).max(500)
  .refine(value=>!/[<>\u0000-\u001f\u007f]/.test(value),'Utilisez du texte simple, sans balise.')).min(4).max(6)
  .refine(lines=>lines.join(' ').length<=900,'Limitez la narration à 900 caractères.')
  .refine(lines=>lines.join(' ').split(/\s+/).length<=120,'Limitez la narration à 120 mots pour conserver les phrases complètes.');
// No defaults: historical draft and admission JSON remain unchanged.
export const VideoCustomization=z.object({style:VideoStyle,
  voice:VideoVoice,
  primaryColor:z.string().regex(/^#[a-fA-F0-9]{6}$/),secondaryColor:z.string().regex(/^#[a-fA-F0-9]{6}$/),
  photoMotion:z.boolean(),transition:z.enum(['fade','cut']),photoOrder:photoOrder.optional(),
  // Optional to preserve historical request hashes. Generation, never preview, pays for these clips.
  runwayClips:z.number().int().min(0).max(2).optional(),
  runwayPhotos:photoOrder.optional(),
  // Draft text may be incomplete while editing; generation validates it below.
  narration:z.array(z.string().max(500)).min(4).max(6).optional(),editor:EditorDocument.optional(),
  voiceSourceId:z.string().regex(/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,63}$/).optional()}).strict();
export type VideoCustomization=z.infer<typeof VideoCustomization>;
export const GenerationCustomization=VideoCustomization.superRefine((value,context)=>{
  if(value.voiceSourceId&&!value.editor)context.addIssue({code:'custom',path:['voiceSourceId'],message:'La voix conservée nécessite un projet d’éditeur.'});
  if(value.runwayPhotos&&value.runwayClips!==undefined&&value.runwayClips!==value.runwayPhotos.length)
    context.addIssue({code:'custom',path:['runwayPhotos'],message:'Choisissez une seule liste de photos à animer.'});
  if(value.runwayPhotos?.some(slot=>value.photoOrder&&!value.photoOrder.includes(slot)))
    context.addIssue({code:'custom',path:['runwayPhotos'],message:'Une photo animée doit être sélectionnée dans la vidéo.'});
  if(value.photoOrder&&value.photoOrder.length<3)context.addIssue({code:'custom',path:['photoOrder'],message:'Sélectionnez au moins trois photos.'});
  if(value.editor){const slots=[...new Set(value.editor.clips.map(c=>c.photoSlot))];
    if(slots.length<3||!value.photoOrder||slots.length!==value.photoOrder.length||slots.some(slot=>!value.photoOrder!.includes(slot)))
      context.addIssue({code:'custom',path:['editor','clips'],message:'La timeline doit contenir au moins trois photos sélectionnées.'});
  }
  if(value.narration){const parsed=CustomNarration.safeParse(value.narration);if(!parsed.success)
    for(const issue of parsed.error.issues)context.addIssue({code:'custom',path:['narration',...issue.path],message:issue.message});}
});
export function defaultVideoCustomization(brand?:{primaryColor:string;secondaryColor:string},voice:VideoCustomization['voice']=DEFAULT_VIDEO_VOICE):VideoCustomization {
  return {style:'cinematic',voice,primaryColor:brand?.primaryColor??'#E1E8D9',
    secondaryColor:brand?.secondaryColor??'#171714',photoMotion:true,transition:'fade'};
}
export function customizedListing(listing:NormalizedListing,settings?:VideoCustomization):NormalizedListing {
  if(!settings?.photoOrder)return listing;
  const photos=settings.photoOrder.map(order=>listing.photos.find(photo=>photo.sourceOrder===order));
  if(photos.length<3||photos.some(photo=>!photo))throw new Error('INVALID_PHOTO_SELECTION');
  return {...listing,photos:photos.map((photo,sourceOrder)=>({...photo!,sourceOrder}))};
}
export function customizedBrand(brand:AgencyBrand,settings?:VideoCustomization):AgencyBrand {
  return settings?{...brand,primaryColor:settings.primaryColor,secondaryColor:settings.secondaryColor}:brand;
}
