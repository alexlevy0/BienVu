'use client';
import type {EditorCamera} from '@bienvu/contracts';
const initial:EditorCamera={motion:'zoom-in',intensity:'subtle',start:{x:50,y:50,scale:1},end:{x:50,y:50,scale:1.08}};
export function EditorCameraControls({camera,onChange}:{camera?:EditorCamera;onChange(camera?:EditorCamera):void}){
  const value=camera??initial;
  return <fieldset className="editor-camera-controls"><legend>Cadrage et mouvement</legend>
    <label>Mouvement<select aria-label="Mouvement de cette photo" value={camera?.motion??'default'} onChange={e=>onChange(e.target.value==='default'?undefined:{...value,motion:e.target.value as EditorCamera['motion']})}>
      <option value="default">Réglage global</option><option value="still">Photo fixe</option><option value="zoom-in">Zoom avant</option><option value="zoom-out">Recul</option><option value="pan-left">Panoramique à gauche</option><option value="pan-right">Panoramique à droite</option><option value="custom">Cadrage personnalisé</option></select></label>
    {camera&&camera.motion!=='still'&&<label>Intensité<select value={value.intensity} onChange={e=>onChange({...value,intensity:e.target.value as EditorCamera['intensity']})}><option value="subtle">Subtile</option><option value="normal">Normale</option><option value="dynamic">Dynamique</option></select></label>}
    {camera?.motion==='custom'&&(['start','end'] as const).map((point,i)=><div key={point}><strong>{i?'Arrivée':'Départ'}</strong>{(['x','y','scale'] as const).map(key=><label key={key}>{key==='scale'?'Zoom':key==='x'?'Horizontal':'Vertical'} : {key==='scale'?Math.round(value[point][key]*100):value[point][key]} %<input type="range" min={key==='scale'?1:0} max={key==='scale'?1.4:100} step={key==='scale'?.01:1} value={value[point][key]} onChange={e=>onChange({...value,[point]:{...value[point],[key]:Number(e.target.value)}})}/></label>)}</div>)}
    <p className="editor-media-hint">Le cadrage suit le format choisi. Pour un clip animé par IA, le mouvement est celui du clip généré.</p>
  </fieldset>;
}
