'use client';
import {useEffect,useRef,useState} from 'react';
import type {VideoCustomization} from '@bienvu/contracts';
import {voicePreviews} from '../lib/voice-previews';
import {HomeIcon} from './home-icons';

export function VoicePreview({voice,disabled}: {voice:VideoCustomization['voice'];disabled:boolean}) {
  const sample=voicePreviews[voice],audio=useRef<HTMLAudioElement>(null),attempt=useRef(0);
  const [state,setState]=useState<'idle'|'loading'|'playing'>('idle'),[error,setError]=useState(false);
  useEffect(()=>{const player=audio.current;player?.setAttribute('src',sample.src);return()=>{attempt.current++;player?.pause();player?.removeAttribute('src');player?.load();};},[sample.src]);
  useEffect(()=>{if(disabled){attempt.current++;audio.current?.pause();setState('idle');}},[disabled]);
  async function toggle() {
    const player=audio.current;if(!player||disabled)return;
    if(state!=='idle'){attempt.current++;player.pause();player.currentTime=0;setState('idle');return;}
    const current=++attempt.current;setError(false);setState('loading');
    if(player.error)player.load();player.currentTime=0;
    try{await player.play();if(attempt.current===current)setState('playing');}
    catch{if(attempt.current===current){setState('idle');setError(true);}}
  }
  const active=state!=='idle';
  return <div className="customizer-voice-preview">
    <button type="button" className="voice-preview-button" disabled={disabled} aria-pressed={active}
      aria-label={active?`Arrêter l’extrait de la voix ${sample.name}`:`Écouter un extrait avec la voix ${sample.name}`}
      onClick={()=>void toggle()}><HomeIcon name={active?'stop':'play'} size={17}/>
      {state==='loading'?'Chargement…':state==='playing'?'Arrêter':'Écouter un extrait'}</button>
    <audio ref={audio} src={sample.src} preload="none" hidden onEnded={()=>setState('idle')}
      onError={()=>{attempt.current++;setState('idle');setError(true);}}/>
    {error&&<span className="voice-preview-error" role="alert">L’extrait est indisponible. Réessayez dans un instant.</span>}
  </div>;
}
