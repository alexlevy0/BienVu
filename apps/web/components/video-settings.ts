'use client';
import {useEffect,useState} from 'react';
import {VideoDuration,VideoAspectRatio} from '@bienvu/contracts';

// Keep the choice through navigation and guest sign-in in this tab.
const key='bienvu:subtitles-enabled';
export function useSubtitlePreference(){
  const [subtitlesEnabled,setValue]=useState(true),[voiceEnabled,setVoice]=useState(true),[durationSeconds,setDuration]=useState<VideoDuration>(20);
  const [aspectRatio,setRatio]=useState<VideoAspectRatio>('9:16');
  useEffect(()=>{try{const parsed=VideoAspectRatio.safeParse(sessionStorage.getItem('bienvu:aspect-ratio'));if(parsed.success)setRatio(parsed.data);}catch{/* Default remains vertical. */}},[]);
  function setAspectRatio(value:VideoAspectRatio){const parsed=VideoAspectRatio.safeParse(value);if(!parsed.success)return;setRatio(parsed.data);try{sessionStorage.setItem('bienvu:aspect-ratio',parsed.data);}catch{/* Current selection still works. */}}
  useEffect(()=>{try{const enabled=sessionStorage.getItem('bienvu:voice-enabled')!=='false';setVoice(enabled);setValue(enabled&&sessionStorage.getItem(key)!=='false');}catch{/* Default remains enabled. */}},[]);
  useEffect(()=>{try{const parsed=VideoDuration.safeParse(Number(sessionStorage.getItem('bienvu:duration-seconds')));if(parsed.success)setDuration(parsed.data);}catch{/* Default remains 20 seconds. */}},[]);
  function setDurationSeconds(value:VideoDuration){const parsed=VideoDuration.safeParse(value);if(!parsed.success)return;setDuration(parsed.data);try{sessionStorage.setItem('bienvu:duration-seconds',String(parsed.data));}catch{/* Current selection still works. */}}
  function setSubtitlesEnabled(value:boolean){
    if(value&&!voiceEnabled)return;
    setValue(value);try{sessionStorage.setItem(key,String(value));}catch{/* Current selection still works. */}
  }
  function setVoiceEnabled(value:boolean){setVoice(value);if(!value){setValue(false);try{sessionStorage.setItem(key,'false');}catch{/* Current selection still works. */}}try{sessionStorage.setItem('bienvu:voice-enabled',String(value));}catch{/* Current selection still works. */}}
  return {subtitlesEnabled,setSubtitlesEnabled,voiceEnabled,setVoiceEnabled,durationSeconds,setDurationSeconds,aspectRatio,setAspectRatio};
}
