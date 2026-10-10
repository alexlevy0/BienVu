import {z} from 'zod';
import {VideoVoice} from './customization';
import {AvatarGender} from './avatars';
export const VoiceCatalog=z.object({defaultVoice:VideoVoice,revision:z.number().int().positive(),voices:z.array(z.object({
  id:VideoVoice,name:z.string(),provider:z.enum(['cartesia','fish','google']),model:z.string(),accent:z.string(),available:z.boolean(),gender:AvatarGender.optional(),
}).strict()).max(100)}).strict();
export type VoiceCatalog=z.infer<typeof VoiceCatalog>;
export const AdminVoices=z.object({catalog:VoiceCatalog,usage:z.object({limit:z.number(),used:z.number(),remaining:z.number(),active:z.number(),windowDays:z.number()}),
  listings:z.array(z.object({id:z.string(),title:z.string(),text:z.string().max(1000)})).max(30)});
export type AdminVoices=z.infer<typeof AdminVoices>;
export const VoiceSample=z.object({id:z.string().regex(/^[a-f0-9]{64}$/),voice:VideoVoice,url:z.string(),durationMs:z.number(),cached:z.boolean()});
export type VoiceSample=z.infer<typeof VoiceSample>;
