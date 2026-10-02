import {z} from 'zod';
import {NarrationAudio} from './narration';
import {EntityId} from './product';

const id=z.string().regex(/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,63}$/);
// Public metadata only. Private storage paths are never sent to the editor.
export const EditorVoicePreview=z.object({id,voice:z.string().min(1).max(64),
  durationSeconds:z.union([z.literal(20),z.literal(30),z.literal(40)]),
  clips:z.array(z.object({assetId:id,startFrame:z.number().int().min(0).max(1199),
    durationMs:z.number().int().positive().max(35000),text:z.string().min(1).max(500),
    waveform:z.array(z.number().min(0).max(1)).length(64)}).strict()).min(4).max(6),
}).strict().superRefine((value,ctx)=>{
  const total=value.durationSeconds*30;
  if(new Set(value.clips.map(c=>c.assetId)).size!==value.clips.length||value.clips[0].startFrame!==0||
    value.clips.some((c,i)=>c.startFrame+Math.ceil(c.durationMs*30/1000)>total||
      i>0&&c.startFrame<value.clips[i-1].startFrame+Math.ceil(value.clips[i-1].durationMs*30/1000)))
    ctx.addIssue({code:'custom',message:'Timings de voix incohérents.'});
});
export type EditorVoicePreview=z.infer<typeof EditorVoicePreview>;
// Server-side journal only; HTTP responses expose just `preview`.
export const EditorVoiceSource=z.object({preview:EditorVoicePreview,originJobId:EntityId,
  audio:z.array(NarrationAudio).min(4).max(6),durationFrames:z.array(z.number().int().positive().max(1200)).min(4).max(6),
}).strict().superRefine((source,ctx)=>{
  let at=0;
  if(source.audio.length!==source.preview.clips.length||source.durationFrames.length!==source.audio.length||
    source.durationFrames.reduce((n,f)=>n+f,0)!==source.preview.durationSeconds*30||source.audio.some((audio,i)=>{
      const clip=source.preview.clips[i],from=at;at+=source.durationFrames[i];
      return !clip||clip.assetId!==audio.id||clip.durationMs!==audio.durationMs||clip.startFrame!==from||source.durationFrames[i]<Math.ceil(audio.durationMs*30/1000);
    }))ctx.addIssue({code:'custom',message:'Voix conservée incohérente.'});
});
export type EditorVoiceSource=z.infer<typeof EditorVoiceSource>;
export function editorCanReuseVoice(settings:{voiceSourceId?:string;voice:string;narration?:string[];editor?:{durationSeconds:number}},source:EditorVoicePreview|null){
  return Boolean(source&&settings.voiceSourceId===source.id&&settings.voice===source.voice&&settings.editor?.durationSeconds===source.durationSeconds&&
    settings.narration&&JSON.stringify(settings.narration)===JSON.stringify(source.clips.map(c=>c.text)));
}
export function editorVoiceCaption(source:EditorVoicePreview,frame:number){
  const clip=source.clips.find(c=>frame>=c.startFrame&&frame<c.startFrame+Math.ceil(c.durationMs*30/1000));
  if(!clip)return null;
  const groups:string[]=[];
  for(const sentence of clip.text.match(/[^.!?]+[.!?]*/g)??[clip.text]){let current='';
    for(const word of sentence.trim().split(/\s+/)){if(current&&(current+' '+word).length>65){groups.push(current);current='';}current+=(current?' ':'')+word;}
    if(current)groups.push(current);
  }
  const weight=groups.reduce((n,g)=>n+g.length,0);let threshold=0;
  return groups.find(g=>{threshold+=g.length/weight*Math.ceil(clip.durationMs*30/1000);return frame-clip.startFrame<threshold;})??groups.at(-1)??null;
}
