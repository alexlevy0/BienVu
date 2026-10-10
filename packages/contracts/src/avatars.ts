import {z} from 'zod';
import {cartesiaParisianVoices} from './cartesia-voices';

export const AvatarId=z.string().regex(/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,127}$/);
export const AvatarGender=z.enum(['female','male','unknown']);
export const AvatarEngine=z.enum(['avatar_iii','avatar_iv']);
export type AvatarMoment='intro'|'outro'|'full';
export const AvatarCustomization=z.object({lookId:AvatarId,engine:AvatarEngine,
  moments:z.enum(['intro','outro','both','full']),appearance:z.enum(['circle','card','cutout']),
  x:z.number().min(10).max(90),y:z.number().min(15).max(85),width:z.number().min(15).max(40),
  maxSeconds:z.number().int().min(3).max(8),hidden:z.boolean().optional()}).strict();
export type AvatarCustomization=z.infer<typeof AvatarCustomization>;
export function avatarMoments(settings?:AvatarCustomization):readonly AvatarMoment[]{return !settings||settings.hidden?[]:
  settings.moments==='both'?['intro','outro'] as const:[settings.moments];}
export const AVATAR_SECONDS_PER_CREDIT=10;
export const MAX_AVATAR_CREDITS=4;
export const AVATAR_AUDIO_BYTES=4*1024*1024;
export const AVATAR_VIDEO_BYTES=32*1024*1024;
export function avatarCreditCost(settings?:AvatarCustomization,durationSeconds=20){
  if(!avatarMoments(settings).length)return 0;
  if(settings!.moments!=='full')return 1;
  if(!Number.isFinite(durationSeconds)||durationSeconds<=0||durationSeconds>40)throw Error('INVALID_AVATAR_DURATION');
  return Math.ceil(durationSeconds/AVATAR_SECONDS_PER_CREDIT);
}
export const AvatarAudioSources=z.array(z.object({audioAssetId:AvatarId,audioSha256:z.string().regex(/^[a-f0-9]{64}$/),
  startFrame:z.number().int().min(0).max(1199),durationMs:z.number().int().min(1).max(35000)}).strict()).min(4).max(6);
export type AvatarAudioSources=z.infer<typeof AvatarAudioSources>;
export const avatarPriceUsdPerMinute=(engine:AvatarCustomization['engine'],type:string)=>engine==='avatar_iii'?(type==='digital_twin'?.60:.99):(type==='photo_avatar'?2.31:4.83);
export const AvatarLook=z.object({id:AvatarId,name:z.string().min(1).max(160),gender:AvatarGender,
  type:z.enum(['studio_avatar','photo_avatar','digital_twin']),engines:z.array(AvatarEngine).min(1).max(2),
  enabled:z.boolean(),thumbnail:z.string().nullable(),preview:z.string().nullable(),transparentVerified:z.boolean(),
  ownership:z.enum(['public','private']),updatedAt:z.string()}).strict();
export type AvatarLook=z.infer<typeof AvatarLook>;
export const AvatarSettings=z.object({enabled:z.boolean(),allowPremium:z.boolean(),defaultLookId:AvatarId.nullable(),
  maxSeconds:z.number().int().min(3).max(8),monthlyUsd:z.number().min(0).max(10000),perVideoUsd:z.number().min(.05).max(10),
  concurrent:z.number().int().min(1).max(10),priceIII:z.number().min(.01).max(100),priceIVPhoto:z.number().min(.01).max(100),
  priceIVStudio:z.number().min(.01).max(100)}).strict();
export type AvatarSettings=z.infer<typeof AvatarSettings>;
export const DEFAULT_AVATAR_SETTINGS:AvatarSettings={enabled:false,allowPremium:false,defaultLookId:null,maxSeconds:6,
  monthlyUsd:5,perVideoUsd:1,concurrent:2,priceIII:.99,priceIVPhoto:2.31,priceIVStudio:4.83};
export const AvatarCatalog=z.object({enabled:z.boolean(),allowPremium:z.boolean(),maxSeconds:z.number(),defaultLookId:AvatarId.nullable(),
  looks:z.array(AvatarLook).max(1000)}).strict();
export type AvatarCatalog=z.infer<typeof AvatarCatalog>;
export const AvatarAdmission=z.object({settings:AvatarSettings,look:AvatarLook,voice:z.string().min(1).max(128)}).strict();
export type AvatarAdmission=z.infer<typeof AvatarAdmission>;
export const AdminAvatarData=z.object({settings:AvatarSettings,revision:z.number().int().positive(),looks:z.array(AvatarLook).max(1000),
  connected:z.boolean(),wallet:z.object({currency:z.string().nullable(),balance:z.number().nullable(),autoReload:z.boolean(),billingType:z.string().nullable()}).nullable(),
  usage:z.object({month:z.string(),reservedUsd:z.number(),ready:z.number(),reused:z.number(),active:z.number(),uncertain:z.number()}),
  tasks:z.array(z.object({id:AvatarId,jobId:z.string(),moment:z.string(),engine:AvatarEngine,state:z.string(),reused:z.boolean(),
    estimatedUsd:z.number(),error:z.string().nullable(),createdAt:z.string()})).max(100)}).strict();
export type AdminAvatarData=z.infer<typeof AdminAvatarData>;
export function voiceGender(id:string):z.infer<typeof AvatarGender>{
  const voice=cartesiaParisianVoices.find(v=>v.id===id);
  if(voice)return voice.gender==='feminine'?'female':voice.gender==='masculine'?'male':'unknown';
  return ({'fr-FR-Chirp3-HD-Aoede':'female','fr-FR-Chirp3-HD-Kore':'female','fr-FR-Chirp3-HD-Charon':'male',
    'fish-manon':'female','fish-lucas':'male'} as Record<string,z.infer<typeof AvatarGender>>)[id]??'unknown';
}
export function avatarVoiceWarning(voice:string,gender:z.infer<typeof AvatarGender>){
  const selected=voiceGender(voice);if(selected==='unknown'||gender==='unknown'||selected===gender)return null;
  return selected==='female'?'Vous avez choisi une voix féminine et un avatar masculin. Vous pouvez conserver ce choix ou changer la voix ou le présentateur.':
    'Vous avez choisi une voix masculine et un avatar féminin. Vous pouvez conserver ce choix ou changer la voix ou le présentateur.';
}
export const defaultAvatarCustomization=(id:string):AvatarCustomization=>({lookId:id,engine:'avatar_iii',moments:'both',appearance:'circle',x:78,y:38,width:25,maxSeconds:6});
export const AvatarPreviewClip=z.object({id:AvatarId,moment:z.enum(['intro','outro','full']),startFrame:z.number().int().min(0).max(1199),
  durationFrames:z.number().int().min(1).max(1200),audioSha256:z.string().regex(/^[a-f0-9]{64}$/),url:z.string(),sources:AvatarAudioSources.optional(),
  lookId:AvatarId,engine:AvatarEngine,transparent:z.boolean(),width:z.number().int().positive(),height:z.number().int().positive()}).strict();
export type AvatarPreviewClip=z.infer<typeof AvatarPreviewClip>;
export function avatarFrameStyle(settings:AvatarCustomization,width:number,height:number,transparent=false){
  const size=width*settings.width/100,h=settings.appearance==='circle'?size:size*1.3;
  return {position:'absolute' as const,left:Math.max(0,Math.min(width-size,width*settings.x/100-size/2)),
    top:Math.max(0,Math.min(height-h,height*settings.y/100-h/2)),width:size,height:h,
    borderRadius:settings.appearance==='circle'?'50%':settings.appearance==='card'?Math.round(size*.05):0,
    overflow:'hidden' as const,background:transparent?'transparent':'#e6eddf',
    boxShadow:transparent?'none':'0 4px 18px #0003',pointerEvents:'none' as const};
}
