'use client';
import {editorMusicFrames,fitEditorMusic,type EditorDocument} from '@bienvu/contracts';
import {EditorNumberInput} from './editor-number-input';
import {musicTime} from './music-waveform';
export function EditorMusicControls({doc,onChange}:{doc:EditorDocument;onChange(doc:EditorDocument):void}){
  const music=doc.music;if(!music)return null;
  const total=doc.durationSeconds*30,source=Math.floor(music.durationMs*30/1000),length=editorMusicFrames(doc);
  function patch(change:Partial<NonNullable<EditorDocument['music']>>){const next={...music!,durationFrames:length,...change};
    next.startFrame=Math.max(0,Math.min(total-15,next.startFrame));next.trimFromFrame=Math.max(0,Math.min(source-15,next.trimFromFrame));
    next.durationFrames=Math.max(15,Math.min(next.durationFrames,total-next.startFrame,next.loop?1200:source-next.trimFromFrame));onChange({...doc,music:next});}
  return <div className="editor-music-controls"><p className="editor-music-name">{music.name}<small>Source : {musicTime(music.durationMs)}</small></p>
    <label>Volume ({Math.round(music.volume*100)} %)<input type="range" min={0} max={100} value={music.volume*100} onChange={event=>patch({volume:Number(event.target.value)/100})}/></label>
    <div className="editor-field-pair"><label>Début dans la vidéo (s)<EditorNumberInput label="Début de la musique dans la vidéo" min={0} max={doc.durationSeconds-.5} step={.1} value={Number((music.startFrame/30).toFixed(2))} onValue={value=>patch({startFrame:Math.round(value*30)})}/></label>
      <label>Durée du passage (s)<EditorNumberInput label="Durée de la musique" min={.5} max={Math.min(total-music.startFrame,music.loop?1200:source-music.trimFromFrame)/30} step={.1} value={Number((length/30).toFixed(2))} onValue={value=>patch({durationFrames:Math.round(value*30)})}/></label></div>
    <label>Passage dans le morceau (s)<EditorNumberInput label="Début du passage dans le morceau" min={0} max={(source-15)/30} step={.1} value={Number((music.trimFromFrame/30).toFixed(2))} onValue={value=>patch({trimFromFrame:Math.round(value*30)})}/>
      <input aria-label="Choisir le passage musical" type="range" min={0} max={source-15} step={3} value={music.trimFromFrame} onChange={event=>patch({trimFromFrame:Number(event.target.value)})}/></label>
    <label className="editor-check"><input type="checkbox" checked={music.loop??false} onChange={event=>patch({loop:event.target.checked})}/>Répéter le passage si nécessaire</label>
    <button className="editor-import" type="button" onClick={()=>onChange(fitEditorMusic(doc))}>Adapter à toute la vidéo</button>
    <p className="editor-media-hint">Déplacez la piste et ses bords dans la timeline. Le passage choisi commence à la position indiquée dans le morceau, sans changer sa vitesse.</p>
    <button type="button" className="editor-danger" onClick={()=>onChange({...doc,music:null})}>Retirer la musique</button>
  </div>;
}
