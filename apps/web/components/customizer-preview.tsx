'use client';
import {useEffect,useId,useImperativeHandle,useRef,useState,type ComponentProps,type Ref} from 'react';
import {mapFrame,VIDEO_LAYERS} from '@bienvu/contracts';
import {claimPreviewAudio,previewAudioEvent} from '../lib/preview-audio';
import {CustomizerFilm} from './customizer-film';
import {CustomizerSoundPreview} from './customizer-sound-preview';
import {HomeIcon} from './home-icons';
export type CustomizerPreviewHandle={seek(seconds:number):void};
type Props=Omit<ComponentProps<typeof CustomizerFilm>,'width'|'frame'|'mapAt'>&{ref?:Ref<CustomizerPreviewHandle>;busy:boolean;animationCount:number};
export function CustomizerPreview(p:Props){
 const {duration}=p,id=useId(),poster=useRef<HTMLDivElement>(null),[width,setWidth]=useState(265),[playing,setPlaying]=useState(false),[time,setTime]=useState(0);
 useImperativeHandle(p.ref,()=>({seek(seconds){setPlaying(false);setTime(Math.max(0,Math.min(duration,seconds)));}}),[duration]);
 useEffect(()=>{const element=poster.current;if(!element)return;const measure=()=>setWidth(element.clientWidth);measure();const observer=new ResizeObserver(measure);observer.observe(element);return()=>observer.disconnect();},[]);
 useEffect(()=>{setPlaying(false);setTime(0);},[duration,p.aspectRatio]);
 useEffect(()=>{if(!playing)return;let animation=0,last=performance.now();
  const tick=(now:number)=>{if(now-last>=1000/30){const delta=(now-last)/1000;last=now;setTime(value=>Math.min(duration,value+delta));}animation=requestAnimationFrame(tick);};
  animation=requestAnimationFrame(tick);return()=>cancelAnimationFrame(animation);},[playing,duration]);
 useEffect(()=>{if(time>=duration&&playing)setPlaying(false);},[time,duration,playing]);
 useEffect(()=>{const hidden=()=>{if(document.hidden)setPlaying(false);};const audio=(event:Event)=>{if((event as CustomEvent).detail!==id)setPlaying(false);};document.addEventListener('visibilitychange',hidden);window.addEventListener(previewAudioEvent,audio);return()=>{document.removeEventListener('visibilitychange',hidden);window.removeEventListener(previewAudioEvent,audio);};},[id]);
 useEffect(()=>{if(p.busy)setPlaying(false);},[p.busy]);
 const mapAt=mapFrame(p.map,duration*30,Math.min(duration*30-1,Math.round(time*30)));
 function toggle(){claimPreviewAudio(id);if(time>=duration)setTime(0);setPlaying(value=>!value);}
 return <><div ref={poster} className="customizer-poster customizer-render-preview">
  <CustomizerFilm {...p} width={width} mapAt={mapAt} frame={time*30}/>
  {!p.photos.length&&<div className="customizer-preview-empty"><HomeIcon name="image" size={40}/><p>Ajoutez des photos pour voir votre aperçu.</p></div>}
  {!playing&&<button type="button" className="customizer-play" style={{zIndex:VIDEO_LAYERS.controls}} aria-label="Lire l’aperçu visuel" disabled={!p.photos.length} onClick={toggle}>▶</button>}
 </div><div className="customizer-player-controls"><button type="button" aria-label={playing?'Pause':'Lecture'} disabled={!p.photos.length} onClick={toggle}>{playing?'Ⅱ':'▶'}</button><span>0:{String(Math.floor(time)).padStart(2,'0')} / 0:{duration}</span>
 <input type="range" min="0" max={duration*30} step={1} value={Math.round(time*30)} disabled={!p.photos.length} aria-label="Position de l’aperçu" onChange={event=>{setPlaying(false);setTime(Number(event.target.value)/30);}}/>
 <button type="button" aria-label="Aperçu en plein écran" disabled={!p.photos.length} onClick={()=>void poster.current?.requestFullscreen?.().catch(()=>{})}>⛶</button></div>
 <p className="customizer-preview-caption">Cadrage et mise en page du rendu final. Rythme indicatif{p.animationCount?' · Animations IA générées après validation':''}.</p>
 <CustomizerSoundPreview voice={p.settings.voice} voiceEnabled={p.voice} music={p.settings.music} busy={p.busy} onStart={()=>setPlaying(false)}/></>;
}
