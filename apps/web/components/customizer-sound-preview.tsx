'use client';
import {useEffect,useId,useRef,useState} from 'react';
import {type VideoCustomization,type VideoMusic} from '@bienvu/contracts';
import {voicePreviews} from '../lib/voice-previews';
import {claimPreviewAudio,previewAudioEvent} from '../lib/preview-audio';
import {HomeIcon} from './home-icons';

export function CustomizerSoundPreview({voice,voiceEnabled,music,busy,onStart}:{voice:VideoCustomization['voice'];voiceEnabled:boolean;music?:VideoMusic;busy:boolean;onStart():void}){
 const id=useId(),speech=useRef<HTMLAudioElement>(null),track=useRef<HTMLAudioElement>(null),attempt=useRef(0),[state,setState]=useState<'idle'|'loading'|'playing'>('idle'),[error,setError]=useState('');
 const sample=voiceEnabled?voicePreviews[voice]:null,musicSrc=music?.libraryId&&music.volume>0?`/api/music-library/${encodeURIComponent(music.libraryId)}/audio`:undefined;
 const canListen=Boolean(sample||musicSrc),sourceKey=JSON.stringify([sample?.src,musicSrc]);
 function stop(){attempt.current++;speech.current?.pause();track.current?.pause();setState('idle');}
 useEffect(()=>{const nodes=[speech.current,track.current];attempt.current++;setState('idle');setError('');nodes.forEach(node=>{node?.pause();if(node)node.currentTime=0;});return()=>{attempt.current++;nodes.forEach(node=>node?.pause());};},[sourceKey]);
 useEffect(()=>{if(track.current)track.current.volume=Math.max(0,Math.min(1,music?.volume??0));},[music?.volume,sourceKey]);
 useEffect(()=>{const other=(event:Event)=>{if((event as CustomEvent).detail!==id)stop();};const hidden=()=>{if(document.hidden)stop();};window.addEventListener(previewAudioEvent,other);document.addEventListener('visibilitychange',hidden);return()=>{window.removeEventListener(previewAudioEvent,other);document.removeEventListener('visibilitychange',hidden);};},[id]);
 useEffect(()=>{if(busy)stop();},[busy]);
 async function play(){if(state!=='idle'){stop();return;}if(!canListen||busy)return;
  claimPreviewAudio(id);onStart();setError('');setState('loading');const token=++attempt.current;
  const nodes=[sample?speech.current:null,musicSrc?track.current:null].filter((n):n is HTMLAudioElement=>Boolean(n));
  nodes.forEach(node=>{node.currentTime=0;});
  try{await Promise.all(nodes.map(node=>node.play()));if(token===attempt.current)setState('playing');}
  catch{if(token===attempt.current){stop();setError('La préécoute n’a pas pu démarrer. Réessayez.');}}
 }
 return <div className="customizer-sound-preview">
  <button type="button" className="customizer-sound-button" disabled={busy||!canListen} aria-pressed={state!=='idle'} aria-describedby={`${id}-note`} onClick={()=>void play()}><HomeIcon name={state==='idle'?'play':'pause'} size={17}/>{state==='loading'?'Chargement…':state!=='idle'?'Arrêter l’écoute':sample&&musicSrc?'Écouter voix + musique':sample?'Écouter la voix':'Écouter la musique'}</button>
  <p id={`${id}-note`}>{sample?`Extrait de la voix ${sample.name}${musicSrc?` avec « ${music!.name} » à ${Math.round(music!.volume*100)} %`:''}. Le texte de votre annonce sera lu dans la vidéo finale.`:musicSrc?`« ${music!.name} » à ${Math.round(music!.volume*100)} %.`:'Activez la voix off ou choisissez une musique pour écouter un extrait.'}</p>
  {error&&<p role="alert" className="customizer-error">{error}</p>}
  <audio ref={speech} src={sample?.src} preload="none" onEnded={stop} onError={()=>{if(state!=='idle'){stop();setError('L’extrait de voix est indisponible. Réessayez.');}}}/>
  <audio ref={track} src={musicSrc} preload="none" loop={Boolean(sample)} onEnded={stop} onError={()=>{if(state!=='idle'){stop();setError('La musique est indisponible. Choisissez un autre morceau.');}}}/>
 </div>;
}
