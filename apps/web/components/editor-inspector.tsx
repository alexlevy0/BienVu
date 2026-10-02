'use client';
import {type EditorDocument,type EditorLayer} from '@bienvu/contracts';
import {HomeIcon} from './home-icons';
import {editorTime} from './editor-preview';
import {EditorNumberInput} from './editor-number-input';
export function EditorInspector(p:{doc:EditorDocument;layer:EditorLayer|null;onPatch(patch:Partial<EditorLayer>):void;onDuplicate():void;onDelete():void;onClose():void}){
  const layer=p.layer,total=p.doc.durationSeconds*30;
  return <aside className="editor-inspector" aria-label="Réglages de l’élément sélectionné"><div className="editor-panel-heading"><h2>{layer?layer.kind==='logo'?'Logo sélectionné':'Texte sélectionné':'Votre montage'}</h2>
    {layer&&<button type="button" aria-label="Fermer les réglages" onClick={p.onClose}><HomeIcon name="close" size={18}/></button>}</div>
    {layer?<>
      {layer.kind==='text'&&<><label>Contenu<textarea value={layer.text} rows={3} maxLength={240} onChange={e=>p.onPatch({text:e.target.value})}/></label>
      <label>Typographie<div className="editor-field-pair"><select aria-label="Police" value={layer.font} onChange={e=>p.onPatch({font:e.target.value as EditorLayer['font']})}>
        <option value="sans">Inter Tight</option><option value="serif">Instrument Serif</option><option value="display">Anton</option></select>
        <EditorNumberInput key={layer.id} label="Taille de police" min={20} max={200} value={layer.fontSize} onValue={n=>p.onPatch({fontSize:Math.round(n)})}/></div></label>
      <div className="editor-formatting"><div><button type="button" aria-label="Gras" aria-pressed={layer.bold} onClick={()=>p.onPatch({bold:!layer.bold})}><b>B</b></button>
        <button type="button" aria-label="Italique" aria-pressed={layer.italic} onClick={()=>p.onPatch({italic:!layer.italic})}><i>I</i></button></div>
        <div>{(['left','center','right'] as const).map((align,i)=><button key={align} type="button" aria-label={`Aligner ${['à gauche','au centre','à droite'][i]}`}
          aria-pressed={layer.align===align} onClick={()=>p.onPatch({align})}><HomeIcon name={i===0?'alignLeft':i===1?'alignCenter':'alignRight'} size={18}/></button>)}</div></div>
      <label className="editor-color-field">Couleur<input aria-label="Couleur du texte" type="color" value={layer.color} onChange={e=>p.onPatch({color:e.target.value})}/><span>{layer.color.toUpperCase()}</span></label></>}
      <label>Position</label><div className="editor-position"><div className="editor-position-grid" role="group" aria-label="Position du texte">{[15,50,85].flatMap((y,row)=>[18,50,82].map((x,col)=><button
        type="button" key={`${x}-${y}`} aria-label={`${['Haut','Milieu','Bas'][row]} ${['gauche','centré','droite'][col]}`} aria-pressed={Math.abs(layer.x-x)<1&&Math.abs(layer.y-y)<1}
        onClick={()=>p.onPatch({x,y})}><span/></button>))}</div><div className="editor-position-values"><label>X (%)<EditorNumberInput key={layer.id} label="Position horizontale" min={2} max={98} value={Math.round(layer.x)} onValue={x=>p.onPatch({x})}/></label>
        <label>Y (%)<EditorNumberInput key={layer.id} label="Position verticale" min={2} max={98} value={Math.round(layer.y)} onValue={y=>p.onPatch({y})}/></label></div></div>
      <label>Largeur ({layer.width} %)<input type="range" min={10} max={96} value={layer.width} onChange={e=>p.onPatch({width:Number(e.target.value)})}/></label>
      {layer.kind==='text'&&<fieldset className="editor-appearance"><legend>Apparence</legend><label><input type="checkbox" role="switch" checked={layer.background} onChange={e=>p.onPatch({background:e.target.checked})}/>Arrière-plan</label>
        <label><input type="checkbox" role="switch" checked={layer.shadow} onChange={e=>p.onPatch({shadow:e.target.checked})}/>Ombre</label></fieldset>}
      <label>Animation<select value={layer.animation} onChange={e=>p.onPatch({animation:e.target.value as EditorLayer['animation']})}><option value="fade">Fondu doux</option><option value="rise">Apparition vers le haut</option><option value="none">Aucune</option></select></label>
      <div className="editor-field-pair"><label>Début (s)<EditorNumberInput key={layer.id} min={0} max={(total-15)/30} step={.1} value={Number((layer.startFrame/30).toFixed(1))} onValue={n=>{
        const startFrame=Math.max(0,Math.min(total-15,Math.round(n*30)));p.onPatch({startFrame,durationFrames:Math.min(layer.durationFrames,total-startFrame)});}}/></label>
        <label>Durée (s)<EditorNumberInput key={layer.id} min={.5} max={(total-layer.startFrame)/30} step={.1} value={Number((layer.durationFrames/30).toFixed(1))} onValue={n=>p.onPatch({durationFrames:Math.max(15,Math.min(total-layer.startFrame,Math.round(n*30)))})}/></label></div>
      <div className="editor-inspector-actions"><button type="button" disabled={p.doc.layers.length>=16} onClick={p.onDuplicate}><HomeIcon name="copy" size={17}/>Dupliquer</button><button type="button" className="editor-danger" onClick={p.onDelete}><HomeIcon name="trash" size={17}/>Supprimer</button></div>
    </>:<div className="editor-inspector-empty"><HomeIcon name="settings" size={32}/><h3>Votre vidéo, à votre façon.</h3><p>Sélectionnez un texte dans l’aperçu ou la timeline pour le modifier.</p><dl><dt>Durée</dt><dd>{editorTime(total)}</dd><dt>Format</dt><dd>{p.doc.aspectRatio}</dd><dt>Photos</dt><dd>{new Set(p.doc.clips.map(c=>c.photoSlot)).size}</dd></dl><p>Glissez les photos pour changer leur ordre. Les poignées de la timeline règlent leur durée.</p></div>}
  </aside>;
}
