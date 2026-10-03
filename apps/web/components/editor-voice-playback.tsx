'use client';
import {useEffect,useRef,useState} from 'react';
import {EditorVoicePreview,editorCanReuseVoice,type VideoCustomization} from '@bienvu/contracts';
import {editorResponse} from '../lib/editor-client';
import {useEditorAudioGain} from './editor-audio-gain';

export function useEditorVoice(draftId:string,settings:VideoCustomization){
  const [voice,setVoice]=useState<EditorVoicePreview|null>(null),[loading,setLoading]=useState(false),[error,setError]=useState(''),[attempt,setAttempt]=useState(0);
  useEffect(()=>{setVoice(null);setError('');if(!settings.voiceSourceId){setLoading(false);return;}
    const controller=new AbortController();setLoading(true);
    void fetch(`/api/imports/${draftId}/voice/${settings.voiceSourceId}`,{cache:'no-store',signal:controller.signal})
      .then(editorResponse).then(value=>{if(!controller.signal.aborted)setVoice(EditorVoicePreview.parse(value));})
      .catch(()=>{if(!controller.signal.aborted)setError('La voix d’origine ne peut pas être chargée. Réessayez pour l’écouter.');})
      .finally(()=>{if(!controller.signal.aborted)setLoading(false);});return()=>controller.abort();
  },[draftId,settings.voiceSourceId,attempt]);
  return {voice,loading,error,reusable:editorCanReuseVoice(settings,voice),retry:()=>setAttempt(a=>a+1)};
}
function VoiceClipPlayer(p:{draftId:string;sourceId:string;clip:EditorVoicePreview['clips'][number];frame:number;playing:boolean;volume:number;normalize?:boolean;onError():void}){
  const ref=useRef<HTMLAudioElement>(null),error=useRef(p.onError);error.current=p.onError;
  const source=`/api/imports/${p.draftId}/voice/${p.sourceId}/${p.clip.assetId}`;
  useEditorAudioGain(ref,p.volume*(p.normalize?p.clip.normalizationGain??1:1),p.playing,p.clip.assetId);
  useEffect(()=>{const player=ref.current;if(player)player.src=source;
    return()=>{if(player){player.pause();player.removeAttribute('src');player.load();}};},[source]);
  useEffect(()=>{const player=ref.current;if(!player)return;let alive=true;
    const sync=()=>{const elapsed=(p.frame-p.clip.startFrame)/30,audible=p.playing&&elapsed>=0&&elapsed<p.clip.durationMs/1000;
      if(!audible){player.pause();return;}
      if(player.readyState>0&&Math.abs(player.currentTime-elapsed)>.12)player.currentTime=elapsed;
      if(player.paused)void player.play().catch(()=>{if(alive)error.current();});
    };sync();player.addEventListener('loadedmetadata',sync);return()=>{alive=false;player.removeEventListener('loadedmetadata',sync);};
  },[p.frame,p.playing,p.volume,p.clip]);
  return <audio ref={ref} data-editor-voice={p.clip.assetId} src={source} preload="metadata" hidden/>;
}
export function EditorVoicePlayback(p:{draftId:string;voice:EditorVoicePreview|null;frame:number;playing:boolean;volume:number;normalize?:boolean;onError():void}){
  return <>{p.voice?.clips.map(clip=><VoiceClipPlayer key={`${p.voice!.id}:${clip.assetId}`} {...p} sourceId={p.voice!.id} clip={clip}/>)}</>;
}
