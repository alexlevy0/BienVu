'use client';
import {useEffect,useMemo,useRef,useState,type PointerEvent,type DragEvent} from 'react';
import {editorClipStarts,resizeEditorVisualClip,editorSourceFrame,mapInterval,splitEditorClip,editorMusicFrames,editorMusicWaveform,MUSIC_DRAG_TYPE,EntityId,avatarMoments,type AvatarCustomization,type AvatarLook,type AvatarPreviewClip,type EditorVoicePreview,type EditorDocument,type EditorLayer,type PhotoAsset,type VideoMap} from '@bienvu/contracts';
import {HomeIcon} from './home-icons';
import {editorTime} from './editor-preview';
import {MusicWaveform} from './music-waveform';
type Selection={kind:'text'|'photo'|'music';id:string}|null;
export function EditorTimeline(p:{avatar?:AvatarCustomization;avatarLook?:AvatarLook;avatars?:AvatarPreviewClip[];onAvatarChange?(avatar:AvatarCustomization):void;onAvatarSettings?():void;doc:EditorDocument;map?:VideoMap;voice?:EditorVoicePreview|null;voiceLoading?:boolean;voiceError?:boolean;animatedSlots?:number[];photos:PhotoAsset[];photoUrls?:Record<string,string>;draftId:string;frame:number;selected:Selection;
  musicBusy?:boolean;onAddMusic(id:string,startFrame:number):Promise<void>;onSelect(selection:Selection):void;onSeek(frame:number):void;onChange(doc:EditorDocument,remember?:boolean):void;onCheckpoint():void;onAddPhoto(slot:number,index?:number):void}){
  const [snap,setSnap]=useState(true),[zoom,setZoom]=useState(100),[musicDrag,setMusicDrag]=useState(false),track=useRef<HTMLDivElement>(null),musicTrack=useRef<HTMLDivElement>(null),total=p.doc.durationSeconds*30,starts=editorClipStarts(p.doc,p.map),mapWindow=mapInterval(p.map,p.doc.durationSeconds*30),
    musicPeaks=useMemo(()=>editorMusicWaveform(p.doc),[p.doc.music,p.doc.durationSeconds]);
  useEffect(()=>{const reveal=()=>{const scroll=musicTrack.current?.closest('.editor-timeline-scroll');if(scroll)scroll.scrollTop=scroll.scrollHeight;};
    const drag=(event:globalThis.DragEvent)=>{if(event.dataTransfer?.types.includes(MUSIC_DRAG_TYPE))reveal();};
    document.addEventListener('dragstart',drag);if(p.doc.music)reveal();return()=>document.removeEventListener('dragstart',drag);
  },[p.doc.music?.assetId]);
  const markers=Array.from({length:p.doc.durationSeconds/4+1},(_,i)=>i*120),selectedClip=p.selected?.kind==='photo'?starts.find(c=>c.id===p.selected!.id):null,animatedSlots=new Set(p.animatedSlots);
  function quantize(value:number){const rounded=Math.round(value);if(!snap)return rounded;
    const stops=[0,total,...starts.map(c=>c.startFrame),...p.doc.layers.flatMap(l=>[l.startFrame,l.startFrame+l.durationFrames])];
    const near=stops.find(stop=>Math.abs(stop-rounded)<9);return near??Math.round(rounded/3)*3;}
  function gesture(event:PointerEvent<HTMLElement>,update:(delta:number)=>void){
    event.preventDefault();event.stopPropagation();p.onCheckpoint();
    const element=event.currentTarget,origin=event.clientX,width=track.current?.getBoundingClientRect().width??800;
    element.setPointerCapture(event.pointerId);
    const move=(e:globalThis.PointerEvent)=>update((e.clientX-origin)/width*total),end=()=>{
      element.removeEventListener('pointermove',move);element.removeEventListener('pointerup',end);element.removeEventListener('pointercancel',end);};
    element.addEventListener('pointermove',move);element.addEventListener('pointerup',end);element.addEventListener('pointercancel',end);
  }
  function moveLayer(event:PointerEvent<HTMLElement>,layer:EditorLayer,edge:'move'|'start'|'end'){
    p.onSelect({kind:'text',id:layer.id});gesture(event,delta=>{
      let startFrame=layer.startFrame,durationFrames=layer.durationFrames;
      if(edge==='move')startFrame=Math.max(0,Math.min(total-durationFrames,quantize(startFrame+delta)));
      if(edge==='start'){const end=startFrame+durationFrames;startFrame=Math.max(0,Math.min(end-15,quantize(startFrame+delta)));durationFrames=end-startFrame;}
      if(edge==='end')durationFrames=Math.max(15,Math.min(total-startFrame,quantize(startFrame+durationFrames+delta)-startFrame));
      p.onChange({...p.doc,layers:p.doc.layers.map(l=>l.id===layer.id?{...l,startFrame,durationFrames}:l)},false);
    });
  }
  function drop(event:DragEvent<HTMLElement>,index:number){event.preventDefault();
    const id=event.dataTransfer.getData('application/x-bienvu-clip'),slot=event.dataTransfer.getData('application/x-bienvu-photo');
    if(id){const clips=[...p.doc.clips],from=clips.findIndex(c=>c.id===id);if(from<0)return;
      const [clip]=clips.splice(from,1);clips.splice(Math.min(index,clips.length),0,clip);p.onChange({...p.doc,clips});}
    else if(/^(?:[0-9]|1[01])$/.test(slot))p.onAddPhoto(Number(slot),index);
  }
  function moveMusic(event:PointerEvent<HTMLElement>,edge:'move'|'start'|'end'){
    const music=p.doc.music;if(!music)return;p.onSelect({kind:'music',id:music.assetId});
    const length=editorMusicFrames(p.doc),end=music.startFrame+length,source=Math.floor(music.durationMs*30/1000);
    gesture(event,delta=>{let startFrame=music.startFrame,durationFrames=length,trimFromFrame=music.trimFromFrame;
      if(edge==='move')startFrame=Math.max(0,Math.min(total-length,quantize(startFrame+delta)));
      if(edge==='start'){startFrame=Math.max(0,music.startFrame-music.trimFromFrame,Math.min(end-15,quantize(startFrame+delta)));
        trimFromFrame=music.trimFromFrame+startFrame-music.startFrame;durationFrames=end-startFrame;}
      if(edge==='end')durationFrames=Math.max(15,Math.min(total-startFrame,music.loop?total:source-trimFromFrame,quantize(end+delta)-startFrame));
      durationFrames=Math.min(durationFrames,music.loop?total:source-trimFromFrame);
      p.onChange({...p.doc,music:{...music,startFrame,durationFrames,trimFromFrame}},false);
    });
  }
  return <section className="editor-timeline" aria-label="Timeline de la vidéo">
    <div className="editor-timeline-toolbar"><h2>Timeline</h2><button type="button" aria-pressed={snap} onClick={()=>setSnap(v=>!v)}><HomeIcon name="magnet" size={17}/>Magnétisme <span className="editor-mini-switch"/></button>
      <button type="button" disabled={!selectedClip||p.doc.clips.length>=24||p.frame-selectedClip.startFrame<15||selectedClip.startFrame+selectedClip.durationFrames-p.frame<15}
        onClick={()=>{if(selectedClip)p.onChange(splitEditorClip(p.doc,selectedClip.id,editorSourceFrame(p.doc,p.frame,p.map)??0,crypto.randomUUID()));}}><HomeIcon name="scissors" size={17}/>Scinder</button>
      <label className="editor-timeline-zoom"><button type="button" aria-label="Réduire la timeline" onClick={()=>setZoom(v=>Math.max(100,v-25))}>−</button>
        <span className="sr-only">Zoom de la timeline</span><input type="range" min={100} max={250} step={25} value={zoom} onChange={e=>setZoom(Number(e.target.value))}/>
        <button type="button" aria-label="Agrandir la timeline" onClick={()=>setZoom(v=>Math.min(250,v+25))}>+</button></label><span>{p.doc.durationSeconds} s</span></div>
    <div className="editor-timeline-scroll"><div className="editor-timeline-sheet" style={{width:`${zoom}%`}}>
      <div className="editor-track-label editor-ruler-label"/><div className="editor-ruler" ref={track} onPointerDown={event=>{
        event.preventDefault();
        const element=event.currentTarget,rect=element.getBoundingClientRect();element.setPointerCapture(event.pointerId);
        const seek=(x:number)=>p.onSeek(Math.max(0,Math.min(total-1,Math.round((x-rect.left)/rect.width*total))));seek(event.clientX);
        const move=(e:globalThis.PointerEvent)=>seek(e.clientX),end=()=>{element.removeEventListener('pointermove',move);element.removeEventListener('pointerup',end);element.removeEventListener('pointercancel',end);};
        element.addEventListener('pointermove',move);element.addEventListener('pointerup',end);element.addEventListener('pointercancel',end);
      }}>{markers.map(at=><span key={at} style={{left:`${at/total*100}%`}}>{editorTime(at)}</span>)}</div>
      <div className="editor-track-label"><button type="button" aria-label={p.doc.textsVisible?'Masquer les textes':'Afficher les textes'} aria-pressed={p.doc.textsVisible}
        onClick={()=>p.onChange({...p.doc,textsVisible:!p.doc.textsVisible})}><HomeIcon name="eye" size={17}/></button><span>Textes</span></div>
      <div className={`editor-track editor-text-track${p.doc.textsVisible?'':' is-muted'}`} style={{height:Math.max(40,p.doc.layers.length*30+10)}}>
        {p.doc.layers.map((layer,index)=><button type="button" key={layer.id} className={`editor-text-clip${p.selected?.id===layer.id?' is-selected':''}`} style={{top:index*30+6,left:`${layer.startFrame/total*100}%`,width:`${layer.durationFrames/total*100}%`}}
          aria-label={`Texte ${layer.text}, à ${editorTime(layer.startFrame)}`} onClick={()=>{p.onSelect({kind:'text',id:layer.id});p.onSeek(layer.startFrame+Math.min(12,layer.durationFrames-1));}}
          onPointerDown={e=>moveLayer(e,layer,'move')}>
          <span className="editor-clip-grip" onPointerDown={e=>moveLayer(e,layer,'start')} aria-hidden="true"/>
          <span>{layer.text||'Texte'}</span><span className="editor-clip-grip" onPointerDown={e=>moveLayer(e,layer,'end')} aria-hidden="true"/>
        </button>)}{!p.doc.layers.length&&<span className="editor-track-placeholder">Ajoutez un titre ou les informations du bien</span>}
        <i className="editor-playhead" style={{left:`${p.frame/total*100}%`}}/>
      </div>
      <div className="editor-track-label"><button type="button" aria-label={p.doc.photosVisible?'Masquer les plans':'Afficher les plans'} aria-pressed={p.doc.photosVisible}
        onClick={()=>p.onChange({...p.doc,photosVisible:!p.doc.photosVisible})}><HomeIcon name="eye" size={17}/></button><span>Plans</span></div>
      <div className={`editor-track editor-photo-track${p.doc.photosVisible?'':' is-muted'}`} onDragOver={e=>e.preventDefault()} onDrop={e=>drop(e,p.doc.clips.length)}>
        {starts.map((clip,index)=>{const photo=p.photos.find(photo=>photo.sourceOrder===clip.photoSlot),label=animatedSlots.has(clip.photoSlot)?'Vidéo IA':'Photo';return <button type="button" draggable key={clip.id}
          className={`editor-photo-clip${p.selected?.id===clip.id?' is-selected':''}`} style={{left:`${clip.startFrame/total*100}%`,width:`${clip.durationFrames/total*100}%`}}
          aria-label={`${label} ${index+1}, ${Number((clip.durationFrames/30).toFixed(1))} secondes`} onClick={()=>{p.onSelect({kind:'photo',id:clip.id});p.onSeek(clip.startFrame);}}
          onDragStart={e=>{e.dataTransfer.setData('application/x-bienvu-clip',clip.id);e.dataTransfer.effectAllowed='move';}}
          onDragOver={e=>{e.preventDefault();e.stopPropagation();}} onDrop={e=>{e.stopPropagation();drop(e,index);}}>
          {photo&&<img src={p.photoUrls?p.photoUrls[photo.id]:`/api/imports/${p.draftId}/photos/${photo.id}`} alt="" draggable={false}/>}<span>{String(index+1).padStart(2,'0')} · {label}</span>
          <i className="editor-photo-grip" aria-hidden="true" onPointerDown={e=>gesture(e,delta=>p.onChange(resizeEditorVisualClip(p.doc,clip.id,quantize(clip.startFrame+clip.durationFrames+delta)-clip.startFrame,p.map),false))}/>
        </button>;})}{p.map&&<button type="button" className="editor-map-clip" style={{left:`${mapWindow.startFrame/total*100}%`,width:`${mapWindow.durationFrames/total*100}%`}} onClick={()=>{p.onSelect(null);p.onSeek(mapWindow.startFrame);}} title="Séquence conservée · réglée dans Personnaliser"><HomeIcon name="pin" size={16}/>Carte · {p.map.durationSeconds} s</button>}{!starts.length&&<span className="editor-track-placeholder">Glissez vos photos ici</span>}<i className="editor-playhead" style={{left:`${p.frame/total*100}%`}}/>
      </div>
      <div className="editor-track-label"><button type="button" aria-label={p.doc.voiceEnabled?'Désactiver la voix off':'Activer la voix off'} aria-pressed={p.doc.voiceEnabled}
        onClick={()=>p.onChange({...p.doc,voiceEnabled:!p.doc.voiceEnabled,subtitlesEnabled:p.doc.voiceEnabled?false:p.doc.subtitlesEnabled})}><HomeIcon name="microphone" size={17}/></button><span>Voix off</span></div>
      <div className={`editor-track editor-audio-track${p.doc.voiceEnabled?'':' is-muted'}`}>
        {p.voice?p.voice.clips.filter(clip=>clip.startFrame<total).map((clip,i)=><button type="button" key={clip.assetId} className="editor-voice-clip editor-restored-clip" data-editor-voice-clip={clip.assetId}
          style={{left:`${clip.startFrame/total*100}%`,width:`${Math.min(total-clip.startFrame,Math.ceil(clip.durationMs*30/1000))/total*100}%`}} title={clip.text}
          aria-label={`Voix d’origine, passage ${i+1}, à ${editorTime(clip.startFrame)}`} onClick={()=>p.onSeek(clip.startFrame)}>
          <svg viewBox="0 0 192 26" preserveAspectRatio="none" aria-hidden="true">{clip.waveform.map((peak,j)=><line key={j} x1={j*3+1} x2={j*3+1} y1={13-peak*12} y2={13+peak*12}/>)}</svg>
          <span>{i===0?'Ouverture':i===p.voice!.clips.length-1?'Conclusion':`Passage ${i+1}`}</span></button>):<div className="editor-voice-clip"><HomeIcon name="microphone" size={16}/><span>{!p.doc.voiceEnabled?'Voix off désactivée':p.voiceLoading?'Chargement de la voix d’origine…':p.voiceError?'Voix indisponible · Réessayez dans Audio':'Voix off · créée à l’export'}</span></div>}
        <i className="editor-playhead" style={{left:`${p.frame/total*100}%`}}/></div>
      {p.avatar&&<><div className="editor-track-label"><button type="button" aria-label={p.avatar.hidden?'Afficher l’avatar':'Masquer l’avatar'} aria-pressed={!p.avatar.hidden} onClick={()=>p.onAvatarChange?.({...p.avatar!,hidden:!p.avatar!.hidden})}><HomeIcon name="user" size={17}/></button><span>Avatar IA</span></div>
        <div className={`editor-track editor-avatar-lane${p.avatar.hidden?' is-muted':''}`} style={{height:60}}>{avatarMoments({...p.avatar,hidden:false}).map(moment=>{
          const retained=p.doc.voiceEnabled?p.avatars?.find(c=>c.moment===moment&&c.lookId===p.avatar!.lookId&&c.engine===p.avatar!.engine&&c.transparent===(p.avatar!.appearance==='cutout')):null,
            voice=p.voice?.clips[moment==='intro'?0:p.voice.clips.length-1],frames=moment==='full'?total:Math.min(voice?Math.ceil(voice.durationMs*30/1000):p.avatar!.maxSeconds*30,p.avatar!.maxSeconds*30),start=moment==='full'?0:retained?.startFrame??voice?.startFrame??(moment==='intro'?0:total-frames);
          return <button type="button" key={moment} className={`editor-avatar-clip${retained?'':' is-pending'}`} style={{left:`${start/total*100}%`,width:`${(retained?.durationFrames??frames)/total*100}%`}} onClick={()=>{p.onSeek(start);p.onAvatarSettings?.();}}>
            {p.avatarLook?.thumbnail&&<img src={p.avatarLook.thumbnail} alt=""/>}<span>{moment==='full'?'Toute la vidéo':moment==='intro'?'Ouverture':'Conclusion'} · {retained?'Avatar IA':'À générer'}</span></button>;
        })}<i className="editor-playhead" style={{left:`${p.frame/total*100}%`}}/></div></>}
      <div className="editor-track-label"><button type="button" disabled={!p.doc.music} aria-label={p.doc.music?.volume?'Couper la musique':'Activer la musique'} aria-pressed={Boolean(p.doc.music?.volume)}
        onClick={()=>p.doc.music&&p.onChange({...p.doc,music:{...p.doc.music,volume:p.doc.music.volume?0:.15}})}><HomeIcon name="music" size={17}/></button><span>Musique</span></div>
      <div ref={musicTrack} data-music-track className={`editor-track editor-audio-track editor-music-track${p.doc.music&&p.doc.music.volume===0?' is-muted':''}${musicDrag?' is-drop-target':''}`}
        onDragOver={event=>{if(event.dataTransfer.types.includes(MUSIC_DRAG_TYPE)&&!p.musicBusy){event.preventDefault();event.dataTransfer.dropEffect='copy';setMusicDrag(true);}}}
        onDragLeave={event=>{if(!event.currentTarget.contains(event.relatedTarget as Node))setMusicDrag(false);}}
        onDrop={event=>{event.preventDefault();setMusicDrag(false);if(p.musicBusy)return;
          const id=event.dataTransfer.getData(MUSIC_DRAG_TYPE);if(!EntityId.safeParse(id).success)return;
          const rect=event.currentTarget.getBoundingClientRect(),at=Math.max(0,Math.min(total-15,quantize((event.clientX-rect.left)/rect.width*total)));
          void p.onAddMusic(id,at);}}>
        {p.doc.music?<button type="button" data-music-clip className={`editor-music-clip${p.selected?.kind==='music'?' is-selected':''}`} style={{left:`${p.doc.music.startFrame/total*100}%`,width:`${editorMusicFrames(p.doc)/total*100}%`}}
          aria-label={`Musique ${p.doc.music.name}, à ${editorTime(p.doc.music.startFrame)}, ${Number((editorMusicFrames(p.doc)/30).toFixed(1))} secondes`}
          onClick={()=>p.doc.music&&p.onSelect({kind:'music',id:p.doc.music.assetId})} onPointerDown={event=>moveMusic(event,'move')}
          onKeyDown={event=>{if((event.key==='ArrowLeft'||event.key==='ArrowRight')&&p.doc.music){event.preventDefault();p.onChange({...p.doc,music:{...p.doc.music,
            durationFrames:editorMusicFrames(p.doc),startFrame:Math.max(0,Math.min(total-editorMusicFrames(p.doc),p.doc.music.startFrame+(event.key==='ArrowLeft'?-1:1)*(event.shiftKey?30:3)))}});}}}>
          {musicPeaks.length>0&&<MusicWaveform peaks={musicPeaks}/>}<span className="editor-clip-grip" data-music-trim="start" onPointerDown={event=>moveMusic(event,'start')} aria-hidden="true"/>
          <span className="editor-music-clip-label">{p.doc.music.name} · {Math.round(p.doc.music.volume*100)} %</span>
          <span className="editor-clip-grip" data-music-trim="end" onPointerDown={event=>moveMusic(event,'end')} aria-hidden="true"/>
        </button>:<span className="editor-track-placeholder">{p.musicBusy?'Ajout de la musique…':musicDrag?'Déposez pour ajouter la musique':'Glissez une musique ici depuis l’onglet Audio'}</span>}
        <i className="editor-playhead" style={{left:`${p.frame/total*100}%`}}/>
      </div>
    </div></div>
  </section>;
}
