'use client';
import {useEffect,useRef,useState,type CSSProperties,type PointerEvent} from 'react';
import {editorActiveClip,editorClipStarts,editorLayerStyle,editorPhotoMotion,editorCaptionStyle,editorVoiceCaption,type EditorVoicePreview,type EditorDocument,type EditorLayer,type PhotoAsset} from '@bienvu/contracts';
import {HomeIcon} from './home-icons';
export const editorTime=(frames:number)=>`${Math.floor(frames/30/60).toString().padStart(2,'0')}:${Math.floor(frames/30%60).toString().padStart(2,'0')}`;
function RetainedClip(p:{url:string;poster?:string;frame:number;playing:boolean;style:CSSProperties}){
 const ref=useRef<HTMLVideoElement>(null),[error,setError]=useState(false);
 useEffect(()=>setError(false),[p.url]);
 useEffect(()=>{const player=ref.current;if(!player)return;const elapsed=Math.min(4.96,Math.max(0,p.frame/30));
  let alive=true;
  const sync=()=>{if(player.readyState>0&&Math.abs(player.currentTime-elapsed)>.12)player.currentTime=elapsed;
   if(p.playing&&p.frame>=0&&p.frame<149)void player.play().catch(cause=>{if(alive&&cause?.name!=='AbortError')setError(true);});else player.pause();};
  sync();player.addEventListener('loadedmetadata',sync);return()=>{alive=false;player.removeEventListener('loadedmetadata',sync);};
 },[p.frame,p.playing,p.url]);
 return <>{error&&<span className="editor-media-unavailable" role="alert">Ce clip ne peut pas être lu. Rechargez l’aperçu.</span>}<video ref={ref} src={p.url} poster={p.poster} muted playsInline preload="metadata" style={p.style} onError={()=>setError(true)}/></>;
}
export function EditorPreview(p:{doc:EditorDocument;voice?:EditorVoicePreview|null;voiceReusable?:boolean;photos:PhotoAsset[];photoUrls?:Record<string,string>;draftId:string;logoId?:string|null;frame:number;playing:boolean;zoom:number;
  photoMotion:boolean;transition:'fade'|'cut';animations?:{slot:number;url:string}[];
  selected:string|null;onSelect(id:string):void;onSeek(frame:number):void;onPlay():void;onMove(layer:EditorLayer):void;onCheckpoint():void}){
  const stage=useRef<HTMLDivElement>(null),canvas=useRef<HTMLDivElement>(null),[scale,setScale]=useState(.25),
    width=p.doc.aspectRatio==='16:9'?1920:1080,height=p.doc.aspectRatio==='16:9'?1080:1920,total=p.doc.durationSeconds*30,
    active=editorActiveClip(p.doc,p.frame),starts=editorClipStarts(p.doc),index=active?starts.findIndex(c=>c.id===active.id):-1,
    previous=index>0?starts[index-1]:null,caption=p.voice?editorVoiceCaption(p.voice,p.frame):null;
  useEffect(()=>{const element=stage.current;if(!element)return;const observer=new ResizeObserver(entries=>{
    const size=entries[0].contentRect;setScale(Math.min((size.width-36)/width,(size.height-20)/height)*(p.zoom/50));
  });observer.observe(element);return()=>observer.disconnect();},[width,height,p.zoom]);
  function drag(event:PointerEvent<HTMLButtonElement>,layer:EditorLayer){
    if(p.playing)return;event.preventDefault();p.onSelect(layer.id);p.onCheckpoint();
    const origin={x:event.clientX,y:event.clientY},element=event.currentTarget;element.setPointerCapture(event.pointerId);
    const move=(e:globalThis.PointerEvent)=>p.onMove({...layer,x:Math.max(2,Math.min(98,layer.x+(e.clientX-origin.x)/scale/width*100)),
      y:Math.max(2,Math.min(98,layer.y+(e.clientY-origin.y)/scale/height*100))});
    const end=()=>{element.removeEventListener('pointermove',move);element.removeEventListener('pointerup',end);element.removeEventListener('pointercancel',end);};
    element.addEventListener('pointermove',move);element.addEventListener('pointerup',end);element.addEventListener('pointercancel',end);
  }
  function photo(clip:typeof active,i:number){if(!clip)return null;const source=p.photos.find(photo=>photo.sourceOrder===clip.photoSlot);
    const animation=p.animations?.find(a=>a.slot===clip.photoSlot);
    const elapsed=p.frame-(('startFrame' in clip?clip.startFrame:0) as number),opacity=p.transition==='fade'&&clip===active&&previous?Math.min(1,elapsed/12):1;
    if(animation)return <RetainedClip key={clip.id} url={animation.url} poster={source?(p.photoUrls?p.photoUrls[source.id]:`/api/imports/${p.draftId}/photos/${source.id}`):undefined} frame={elapsed} playing={p.playing} style={{position:'absolute',width:'100%',height:'100%',objectFit:'cover',opacity}}/>;
    return source?<img src={p.photoUrls?p.photoUrls[source.id]:`/api/imports/${p.draftId}/photos/${source.id}`} alt="" draggable={false} style={{position:'absolute',width:'100%',height:'100%',objectFit:'cover',
      ...editorPhotoMotion(Math.max(0,p.frame-(('startFrame' in clip?clip.startFrame:0) as number)),clip.durationFrames,i,p.photoMotion,clip.camera),
      opacity:p.transition==='fade'&&clip===active&&previous?Math.min(1,(p.frame-('startFrame' in clip?Number(clip.startFrame):0))/12):1}}/>:null;}
  return <section className="editor-canvas-area" aria-label="Aperçu du montage">
    <div className="editor-stage" ref={stage}><div className="editor-canvas-frame" style={{width:width*scale,height:height*scale}}>
      <div className="editor-canvas" ref={canvas} style={{width,height,transform:`scale(${scale})`}}>
        {p.doc.photosVisible&&<>{previous&&photo(previous,index-1)}{photo(active,index)}</>}
        <div className="editor-canvas-gradient"/>
        {!active&&<div className="editor-canvas-empty"><HomeIcon name="image" size={90}/><span>Ajoutez vos photos</span></div>}
        {p.doc.textsVisible&&p.doc.layers.filter(l=>p.frame>=l.startFrame&&p.frame<l.startFrame+l.durationFrames).map(layer=><button key={layer.id}
          type="button" data-editor-layer={layer.id} className={`editor-preview-layer${p.selected===layer.id&&!p.playing?' is-selected':''}`}
          style={editorLayerStyle(layer,p.frame) as CSSProperties} aria-label={`Modifier ${layer.kind==='logo'?'le logo':layer.text||'ce texte'}`}
          onClick={()=>p.onSelect(layer.id)} onPointerDown={event=>drag(event,layer)} onKeyDown={event=>{const directions={ArrowLeft:[-1,0],ArrowRight:[1,0],ArrowUp:[0,-1],ArrowDown:[0,1]};
            const direction=directions[event.key as keyof typeof directions];if(direction){event.preventDefault();p.onCheckpoint();p.onMove({...layer,
              x:Math.max(2,Math.min(98,layer.x+direction[0])),y:Math.max(2,Math.min(98,layer.y+direction[1]))});}}}>
          {layer.kind==='logo'?p.logoId?<img src={`/api/agency/logo/${p.logoId}`} alt="Logo de l’agence" style={{display:'block',width:'100%',maxHeight:height*.12,objectFit:'contain'}}/>:<span>Votre logo</span>:layer.text}
          {p.selected===layer.id&&!p.playing&&<span className="editor-layer-handles" aria-hidden="true"><i/><i/><i/><i/></span>}
        </button>)}
        {p.doc.clips.length>0&&p.doc.textsVisible&&p.doc.voiceEnabled&&p.doc.subtitlesEnabled&&(p.voice?caption&&<div className="editor-caption-placement" style={editorCaptionStyle(width)} aria-label="Sous-titres de la voix d’origine">{caption}</div>:<div className="editor-caption-placement" style={editorCaptionStyle(width)} aria-label="Emplacement des sous-titres">Sous-titres de votre narration<br/><span>Aperçu de leur emplacement</span></div>)}
      </div></div></div>
    <div className="editor-playback"><button type="button" aria-label="Photo précédente" onClick={()=>p.onSeek(Math.max(0,(starts.find(c=>c.id===active?.id)?.startFrame??0)-1))}><HomeIcon name="previous" size={21}/></button>
      <button type="button" className="editor-play" aria-label={p.playing?'Mettre en pause':'Lire l’aperçu'} onClick={p.onPlay}><HomeIcon name={p.playing?'pause':'play'} size={21}/></button>
      <button type="button" aria-label="Photo suivante" onClick={()=>p.onSeek(Math.min(total-1,(starts.find(c=>c.id===active?.id)?.startFrame??0)+(active?.durationFrames??0)))}><HomeIcon name="next" size={21}/></button>
      <span>{editorTime(p.frame)} / {editorTime(total)}</span><button type="button" aria-label="Aperçu en plein écran" onClick={()=>void stage.current?.requestFullscreen?.()}><HomeIcon name="fullscreen" size={20}/></button>
    </div><label className="editor-seek"><span className="sr-only">Position de lecture</span><input type="range" min={0} max={total-1} step={1} value={p.frame} onChange={e=>p.onSeek(Number(e.target.value))}/></label>
    <p className="editor-preview-note">{!p.doc.voiceEnabled?'La voix off est désactivée.':p.voice?p.voiceReusable===false?'Vous écoutez la voix d’origine. Vos changements seront appliqués à l’export.':'La voix d’origine accompagne l’aperçu.':'La voix off sera créée à l’export.'} {p.animations?.length?'Les animations conservées sont lues dans l’aperçu.':'Les nouvelles animations seront créées à l’export.'}</p>
  </section>;
}
