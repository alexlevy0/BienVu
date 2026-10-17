'use client';
import '../app/customizer.css';
import {trackProductEvent} from '../lib/product-analytics';
import {useEffect,useRef,useState,type CSSProperties} from 'react';
import {VIDEO_PHOTO_MAXIMUM,catalogAvatarLook,CustomNarration,videoStyles,frenchVoices,requestedAnimations,generationCreditCost,selectedAnimationIndices,mapFrame,mapInterval,mapInk,videoMapFromDefaults,VIDEO_LAYERS,type VideoCustomization,type VideoDuration,type VideoAspectRatio} from '@bienvu/contracts';
import {suggestedNarration,narrationWordLimit,wordCount} from '@bienvu/narration/suggestion';
import type {ManualDraftFields} from '../lib/listing-draft';
import {HomeIcon} from './home-icons';
import {PhotoDurationAdvice} from './photo-duration-advice';
import {VoicePreview} from './voice-preview';
import {useAccount} from './account';
import {MapScenePreview,VideoMapControls,useVideoMapDefaults,useAutomaticMapLocation} from './video-map';
import {AvatarControls,AvatarWarning,AvatarPoster,useAvatarCatalog} from './avatar-controls';
import {PhotoPreviewImage} from './photo-preview-image';
import {CustomizerMusic} from './customizer-music';
import {musicForTimeline,type VideoMusic} from '@bienvu/contracts';

export type CustomizerPhoto={id:string;preview:string;slot:number;state:string;file?:File|null;error?:string;removing?:boolean};
export {suggestedNarration};
type Props={settings:VideoCustomization;onChange(value:VideoCustomization):void;photos:CustomizerPhoto[];fields:ManualDraftFields;
  agencyName:string;durationSeconds?:VideoDuration;onDuration?(value:VideoDuration):void;aspectRatio?:VideoAspectRatio;voiceEnabled?:boolean;onVoice?(value:boolean):void;subtitlesEnabled:boolean;onSubtitles(value:boolean):void;onBack():void;onAdd(files:FileList|null):void;
  busy:boolean;ready:boolean;onEdit():void;saved:boolean;sourceUrl?:string;onRetry?(id:string):void;onRemove?(id:string):void;onMusicPick?(id:string):Promise<VideoMusic>};
export function VideoCustomizer(p:Props){
  const {me,voiceCatalog}=useAccount(),{catalog:avatarCatalog}=useAvatarCatalog(true,p.settings.avatar?.lookId);
  const mapDefaults=useVideoMapDefaults(),automaticMap=Boolean(p.settings.mapAutomatic||(!p.settings.map&&!p.settings.mapDisabled&&!p.settings.editor&&mapDefaults?.enabled)),
    automaticLocation=useAutomaticMapLocation(p.fields.locality,automaticMap),mapSettings=p.settings.map??(automaticMap&&mapDefaults?videoMapFromDefaults(mapDefaults):undefined),
    previewMap=mapSettings?{...mapSettings,...(automaticMap?{location:automaticLocation}:{})}:undefined;
  const duration=p.durationSeconds??20;
  const [tab,setTab]=useState<'photos'|'style'|'voice'|'music'|'map'|'avatar'>('photos'),[drag,setDrag]=useState<number|null>(null),
    [playing,setPlaying]=useState(false),[time,setTime]=useState(0);
  const secondaryInk=()=>{const rgb=p.settings.secondaryColor.match(/[a-f\d]{2}/gi)!.map(h=>parseInt(h,16)/255).map(v=>v<=.04045?v/12.92:((v+.055)/1.055)**2.4);return rgb[0]*.2126+rgb[1]*.7152+rgb[2]*.0722>.179?'#101d18':'#ffffff';};
  const upload=useRef<HTMLInputElement>(null),preview=useRef<HTMLDivElement>(null);
  const [previewSize,setPreviewSize]=useState({width:300,height:533});
  useEffect(()=>{const element=preview.current;if(!element)return;const measure=()=>setPreviewSize({width:element.clientWidth,height:element.clientHeight});measure();const observer=new ResizeObserver(measure);observer.observe(element);return()=>observer.disconnect();},[]);
  const order=p.settings.photoOrder??p.photos.slice(0,VIDEO_PHOTO_MAXIMUM).map(photo=>photo.slot);
  const ordered=[...order.map(slot=>p.photos.find(photo=>photo.slot===slot)).filter((photo):photo is CustomizerPhoto=>!!photo),
    ...p.photos.filter(photo=>!order.includes(photo.slot))];
  const chosen=ordered.filter(photo=>order.includes(photo.slot));
  const animated=p.settings.runwayPhotos??selectedAnimationIndices(order,p.settings).map(index=>order[index]);
  const animationCount=requestedAnimations(p.settings),creditCost=generationCreditCost(p.settings,duration),allAnimated=order.length>0&&order.every(slot=>animated.includes(slot));
  const narration=p.settings.narration??(p.sourceUrl?['','','','']:suggestedNarration(p.fields,p.agencyName,duration)),validNarration=CustomNarration.safeParse(narration);
  const patch=(next:Partial<VideoCustomization>)=>p.onChange({...p.settings,...next});
  function toggle(slot:number){
    const selected=order.includes(slot);if(!selected&&order.length>=VIDEO_PHOTO_MAXIMUM)return;
    const keepAllAnimated=order.length>0&&order.every(s=>animated.includes(s));
    patch({photoOrder:selected?order.filter(s=>s!==slot):[...order,slot],runwayClips:undefined,
      runwayPhotos:selected?animated.filter(s=>s!==slot):keepAllAnimated?[...animated,slot]:animated});
  }
  function animate(slot:number){trackProductEvent('editor_action',{action:'animation_toggled'});patch({runwayClips:undefined,runwayPhotos:animated.includes(slot)?animated.filter(s=>s!==slot):[...animated,slot]});}
  function move(slot:number,target:number){trackProductEvent('editor_action',{action:'photo_reordered'});const next=order.filter(s=>s!==slot);next.splice(Math.max(0,Math.min(next.length,target)),0,slot);patch({photoOrder:next});}
  useEffect(()=>{setPlaying(false);setTime(0);},[duration]);
  useEffect(()=>{if(!playing)return;const timer=setInterval(()=>setTime(t=>{if(t>=duration-.2){setPlaying(false);return duration;}return t+.1;}),100);return()=>clearInterval(timer);},[playing,duration]);
  const interval=mapInterval(previewMap,duration*30),mapAt=mapFrame(previewMap,duration*30,Math.min(duration*30-1,Math.round(time*30))),
    photo=chosen[Math.max(0,Math.min(chosen.length-1,Math.floor((time*30-interval.photoStartFrame)/interval.photoFrames*chosen.length)))],line=Math.min(narration.length-1,Math.floor(time/duration*narration.length));
  const money=Number(p.fields.priceCents.replace(/\s/g,'').replace(',','.'));
  const price=money>0?`${new Intl.NumberFormat('fr-FR').format(money)} €${p.fields.transaction==='rent'?' / mois':''}`:'';
  return <section className="video-customizer" aria-label="Personnaliser votre vidéo">
    <div className="customizer-topline"><button type="button" onClick={p.onBack} disabled={p.busy}><span>←</span> Retour</button>
      <span role="status">{p.saved?'✓ Réglages enregistrés':'Brouillon enregistré sur cet appareil'}</span></div>
    <header className="customizer-heading"><h1>Personnalisez votre vidéo</h1>
      <div className="customizer-property">{p.photos[0]&&<PhotoPreviewImage src={chosen[0]?.preview??p.photos[0].preview} alt=""/>}<div><strong>{p.sourceUrl?new URL(p.sourceUrl).hostname:p.fields.title||'Votre annonce'}</strong>
        <span>{[price,p.fields.area?`${p.fields.area} m²`:'',p.fields.rooms?`${p.fields.rooms} pièces`:''].filter(Boolean).join(' · ')||'Complétez les informations du bien'}</span></div></div></header>
    <div className={`customizer-panel${p.aspectRatio==='16:9'?' is-horizontal':''}`}><div className="customizer-controls">
      <div className="customizer-tabs" role="tablist" aria-label="Réglages vidéo">{([['photos','Photos','image'],['style','Style','palette'],['voice','Voix et texte','microphone'],['music','Musique','music'],['map','Carte','pin'],['avatar','Avatar IA','user']] as const).map(([id,label,icon])=>
        <button type="button" key={id} role="tab" id={`customizer-tab-${id}`} aria-controls={`customizer-panel-${id}`} aria-selected={tab===id} tabIndex={tab===id?0:-1} disabled={p.busy}
          onKeyDown={event=>{if(!['ArrowLeft','ArrowRight','Home','End'].includes(event.key))return;event.preventDefault();const ids=['photos','style','voice','music','map','avatar'] as const;
            const at=ids.indexOf(tab),next=event.key==='Home'?'photos':event.key==='End'?'avatar':ids[(at+(event.key==='ArrowRight'?1:ids.length-1))%ids.length];setTab(next);document.getElementById(`customizer-tab-${next}`)?.focus();}}
          onClick={()=>setTab(id)}><HomeIcon name={icon} size={21}/>{label}</button>)}</div>
      <AvatarWarning avatar={p.settings.avatar} voice={p.settings.voice??voiceCatalog?.defaultVoice??frenchVoices[0].id} catalog={avatarCatalog}/>
      <div role="tabpanel" id={`customizer-panel-${tab}`} aria-labelledby={`customizer-tab-${tab}`}>
      {tab==='photos'&&<><div className="customizer-section-title customizer-photo-heading"><div><strong>Photos de la vidéo</strong><p>{p.sourceUrl&&!p.photos.length?'Connectez-vous pour choisir les photos de l’annonce.':`${p.photos.length} disponibles · Choisissez de 3 à 12 photos, puis réordonnez-les.`}</p></div><span className="customizer-count" role="status" aria-label={`${chosen.length} photos sélectionnées sur ${VIDEO_PHOTO_MAXIMUM}`}>{chosen.length} / {VIDEO_PHOTO_MAXIMUM}</span></div>
        {p.photos.length>VIDEO_PHOTO_MAXIMUM&&order.length>=VIDEO_PHOTO_MAXIMUM&&<p className="customizer-selection-help" role="status">Désélectionnez une photo pour en choisir une autre.</p>}
        <PhotoDurationAdvice photoCount={chosen.length} durationSeconds={duration} onDuration={p.onDuration} disabled={p.busy}/>
        {chosen.length>0&&<div className="customizer-photo-toolbar"><div><HomeIcon name="sparkle" size={20}/><span><strong>Animations IA</strong><small>{animationCount?`${animationCount} photo${animationCount>1?'s':''} animée${animationCount>1?'s':''} · +${animationCount} crédit${animationCount>1?'s':''}`:'1 crédit par photo animée'}</small></span></div><label className="customizer-switch"><span>Tout animer</span><input type="checkbox" role="switch" checked={allAnimated} disabled={p.busy||!me||!order.length} title={!me?'Connectez-vous pour animer vos photos':undefined} onChange={event=>patch({runwayClips:undefined,runwayPhotos:event.target.checked?[...order]:[]})}/><span aria-hidden="true"/></label></div>}
        {chosen.length>0&&!me&&<p className="customizer-hint">Connectez-vous pour activer les animations IA.</p>}
        {p.photos.length?<div className="customizer-photos">{ordered.map((photo,index)=>{const at=order.indexOf(photo.slot),selected=at>=0;return <div key={photo.id} className={`customizer-photo${selected?' is-selected':''}${drag===photo.slot?' is-dragging':''}`}
          draggable={selected&&!p.busy&&!photo.removing&&photo.state==='ready'} onDragStart={event=>{event.dataTransfer.setData('text/plain',String(photo.slot));event.dataTransfer.effectAllowed='move';setDrag(photo.slot);}}
          onDragEnd={()=>setDrag(null)} onDragOver={event=>{if(drag!==null&&selected){event.preventDefault();event.dataTransfer.dropEffect='move';}}}
          onDrop={event=>{if(drag!==null&&selected){event.preventDefault();move(drag,at);setDrag(null);}}}>
          <div className="customizer-photo-visual"><PhotoPreviewImage src={photo.preview} alt={`Photo ${photo.slot+1}`} draggable={false} loading={index<3?'eager':'lazy'} fetchPriority={at===0?'high':'auto'}/></div>{selected&&<span className="customizer-photo-number">{at+1}</span>}
          <button type="button" className="customizer-photo-check" aria-pressed={selected} aria-label={`${selected?'Désélectionner':'Sélectionner'} la photo ${photo.slot+1}`} title={!selected&&order.length>=VIDEO_PHOTO_MAXIMUM?'Désélectionnez une photo pour faire de la place':undefined} onClick={()=>toggle(photo.slot)} disabled={p.busy||photo.removing||photo.state!=='ready'||!selected&&order.length>=VIDEO_PHOTO_MAXIMUM}>{selected?'✓':'+'}</button>
          {selected&&<button type="button" className={`customizer-photo-animate${animated.includes(photo.slot)?' is-active':''}`} aria-pressed={animated.includes(photo.slot)} aria-label={`Animer la photo ${photo.slot+1} avec l’IA`} disabled={!me||p.busy||photo.removing||photo.state!=='ready'} title={!me?'Connectez-vous pour animer vos photos':'1 crédit supplémentaire'} onClick={()=>animate(photo.slot)}>{animated.includes(photo.slot)?'✓ Animée':'Animer'} · 1 crédit</button>}
          {at===0&&<span className="customizer-first-photo">Première image</span>}{photo.state!=='ready'&&<span className="customizer-photo-state">{photo.state==='error'?'Envoi interrompu':'Envoi…'}</span>}
          {photo.error&&<p className="customizer-photo-error" role="alert">{photo.error}</p>}
          {(p.onRemove||photo.state==='error'&&p.onRetry&&photo.file)&&<div className="customizer-photo-actions">
            {photo.state==='error'&&p.onRetry&&photo.file&&<button type="button" disabled={p.busy||photo.removing} onClick={()=>p.onRetry?.(photo.id)}>Réessayer</button>}
            {p.onRemove&&<button type="button" disabled={p.busy||photo.removing} aria-label={`Retirer la photo ${photo.slot+1}`} onClick={()=>p.onRemove?.(photo.id)}>{photo.removing?'Retrait…':'Retirer'}</button>}
          </div>}
          {selected&&order.length>1&&<div className="customizer-photo-moves"><button type="button" disabled={at===0||p.busy||photo.removing} aria-label={`Avancer la photo ${photo.slot+1}`} onClick={()=>move(photo.slot,at-1)}>←</button><button type="button" disabled={at===order.length-1||p.busy||photo.removing} aria-label={`Reculer la photo ${photo.slot+1}`} onClick={()=>move(photo.slot,at+1)}>→</button></div>}</div>;})}</div>
          :<div className="customizer-empty"><HomeIcon name="image" size={32}/><p>{p.sourceUrl?'Aperçu des photos disponible après import de l’annonce dans votre compte.':'Ajoutez les photos de votre bien pour composer votre vidéo.'}</p></div>}
        <input ref={upload} type="file" accept="image/jpeg,image/png,image/webp" multiple hidden onChange={event=>{p.onAdd(event.target.files);event.target.value='';}}/>
        <button type="button" className="customizer-add" disabled={p.busy||p.photos.length>=12} onClick={()=>upload.current?.click()}><HomeIcon name="plus" size={21}/>Ajouter des photos</button>
      </>}
      {tab==='style'&&<><div className="customizer-section-title"><strong>Style de la vidéo</strong></div>
        <div className="customizer-styles">{videoStyles.map(style=><button type="button" key={style.id} aria-pressed={p.settings.style===style.id} onClick={()=>patch({style:style.id})} disabled={p.busy}>
          <div className={`customizer-style-sample sample-${style.id}`} style={{'--preview-accent':p.settings.primaryColor} as CSSProperties}>{chosen[0]&&<PhotoPreviewImage src={chosen[0].preview} alt=""/>}<span>{style.id==='editorial'?'LYON':style.id==='minimal'?'Une nouvelle adresse':'La visite'}</span></div>
          <strong>{style.name}<span>{p.settings.style===style.id?'✓':''}</span></strong><small>{style.id==='editorial'?'Titres en grand':style.id==='minimal'?'Texte discret':'Infos à la fin'}</small></button>)}</div>
        <div className="customizer-style-colors"><div className="customizer-section-title"><strong>Couleurs</strong><p>Pour cette vidéo uniquement.</p></div><div className="customizer-colors">{([['primaryColor','Principale'],['secondaryColor','Secondaire']] as const).map(([key,label])=><label key={key}>{label}<span><input type="color" aria-label={`Couleur ${label.toLowerCase()}`} value={p.settings[key]} onChange={event=>patch({[key]:event.target.value})} disabled={p.busy}/>{p.settings[key].toUpperCase()}</span></label>)}</div></div>
      </>}
      {tab==='voice'&&<><div className="customizer-voice-toggles"><label className="customizer-switch"><span>Voix off</span><input type="checkbox" role="switch" aria-label="Activer la voix off" checked={p.voiceEnabled!==false} onChange={event=>{p.onVoice?.(event.target.checked);if(!event.target.checked&&p.settings.avatar)patch({avatar:{...p.settings.avatar,hidden:true}});}} disabled={p.busy}/><span aria-hidden="true"/></label><label className="customizer-switch"><span>Sous-titres</span><input type="checkbox" role="switch" aria-label="Afficher les sous-titres" checked={p.subtitlesEnabled} onChange={event=>p.onSubtitles(event.target.checked)} disabled={p.busy||p.voiceEnabled===false}/><span aria-hidden="true"/></label></div>
        {p.voiceEnabled!==false&&<><div className="customizer-voice-options"><div className="customizer-voice-choice"><label htmlFor="customizer-selected-voice">Voix française</label><div className="customizer-voice-choice-row"><select id="customizer-selected-voice" value={p.settings.voice} onChange={event=>patch({voice:event.target.value as VideoCustomization['voice']})} disabled={p.busy}>{frenchVoices.map(voice=><option key={voice.id} value={voice.id} disabled={voiceCatalog?.voices.find(v=>v.id===voice.id)?.available===false}>{voice.name} · {voice.provider}</option>)}</select><VoicePreview key={p.settings.voice} voice={p.settings.voice} disabled={p.busy}/></div></div></div>
        <div className="customizer-section-title"><strong>Narration</strong><p>{p.settings.narration?'Votre texte sera lu tel quel.':`Texte proposé pour ${duration} secondes, modifiable à votre guise.`}</p></div>
        {p.sourceUrl&&!p.settings.narration?<div className="customizer-empty"><HomeIcon name="microphone" size={26}/><p>Texte rédigé automatiquement à partir de l’annonce.</p><button type="button" className="customizer-add" disabled={p.busy} onClick={()=>patch({narration:['','','','']})}>Écrire mon texte</button></div>:narration.map((text,index)=><label className="customizer-narration" key={index}><span>{index===0?'Ouverture':index===narration.length-1?'Conclusion':`Passage ${index+1}`}</span><textarea value={text} rows={2} maxLength={500} disabled={p.busy}
          onChange={event=>patch({narration:narration.map((line,at)=>at===index?event.target.value:line)})}/></label>)}
        {(!p.sourceUrl||p.settings.narration)&&<p className={validNarration.success?'customizer-hint':'customizer-error'} role="status">{validNarration.success?`${wordCount(narration.join(' '))} / ${narrationWordLimit(duration)} mots conseillés${wordCount(narration.join(' '))>narrationWordLimit(duration)?' · Raccourcissez le texte ou augmentez la durée.':''}`:validNarration.error.issues[0].message}</p>}{p.settings.narration&&<button type="button" className="customizer-reset" disabled={p.busy} onClick={()=>patch({narration:undefined})}>Reprendre le texte automatique</button>}
        </>}
      </>}
      {tab==='music'&&<CustomizerMusic music={p.settings.music??p.settings.editor?.music??undefined} authenticated={Boolean(me?.agency)} voiceEnabled={p.voiceEnabled!==false} busy={p.busy} onPick={p.onMusicPick}
        onChange={music=>p.settings.editor?patch({music:undefined,editor:{...p.settings.editor,music:music?musicForTimeline(music,duration*30):null}}):patch({music})}/>}
      {tab==='avatar'&&<AvatarControls catalog={avatarCatalog} avatar={p.settings.avatar} onChange={avatar=>patch({avatar})} voice={p.settings.voice??voiceCatalog?.defaultVoice??frenchVoices[0].id} voiceEnabled={p.voiceEnabled!==false} onEnableVoice={()=>p.onVoice?.(true)} authenticated={Boolean(me?.agency)} durationSeconds={p.durationSeconds??20} busy={p.busy}/>}
      {tab==='map'&&<VideoMapControls map={mapSettings} automatic={automaticMap} defaults={mapDefaults} onChange={(map,automatic=automaticMap)=>patch({map,mapDisabled:map?undefined:true,mapAutomatic:map&&automatic?true:undefined})} onPreview={endpoint=>{setPlaying(false);setTime((interval.startFrame+(endpoint==='end'?interval.durationFrames-1:0))/30);}} locality={p.fields.locality} aspectRatio={p.aspectRatio??'9:16'} busy={p.busy} color={mapInk(p.settings.primaryColor,p.settings.secondaryColor)} duration={duration}/>}
      {tab==='photos'&&<details className="customizer-advanced"><summary><HomeIcon name="settings" size={21}/>Réglages avancés<HomeIcon name="chevron" size={17}/></summary><div>
        <label className="customizer-checkbox"><input type="checkbox" checked={p.settings.photoMotion} onChange={event=>patch({photoMotion:event.target.checked})} disabled={p.busy}/>Zooms et translations des photos</label>
        <label>Transition<select value={p.settings.transition} onChange={event=>patch({transition:event.target.value as 'fade'|'cut'})} disabled={p.busy}><option value="fade">Fondu</option><option value="cut">Coupe franche</option></select></label></div></details>}
      </div>
      {!p.ready&&<p className="customizer-incomplete">Votre annonce reste à compléter. <button type="button" onClick={p.onEdit}>Revenir aux informations du bien →</button></p>}
    </div><aside className={`customizer-preview${p.aspectRatio==='16:9'?' is-horizontal':''}`}><div className="customizer-preview-title"><strong>Aperçu de votre vidéo</strong><span>{p.aspectRatio??'9:16'}</span></div>
      <div ref={preview} className={`customizer-poster poster-${p.settings.style}${playing&&p.settings.photoMotion?' is-playing':''}${time>=duration*.8?' is-ending':''}`} style={{'--preview-accent':p.settings.primaryColor,'--preview-secondary':p.settings.secondaryColor,'--preview-ink':secondaryInk()} as CSSProperties}>
        {photo?<PhotoPreviewImage key={photo.id} src={photo.preview} alt="Aperçu de la photo sélectionnée" fetchPriority="high"/>:<div className="customizer-preview-empty"><HomeIcon name="image" size={40}/></div>}
        <div className="customizer-poster-location" style={{zIndex:VIDEO_LAYERS.content,visibility:previewMap&&mapAt!==null?'hidden':undefined}}>⌖ {p.fields.locality||'Votre localisation'}</div><button type="button" className="customizer-play" style={{zIndex:VIDEO_LAYERS.controls}} aria-label={playing?'Mettre l’aperçu en pause':'Lire l’aperçu visuel'} disabled={!chosen.length} onClick={()=>{if(time>=duration)setTime(0);setPlaying(!playing);}}>{playing?'Ⅱ':'▶'}</button>
        {p.subtitlesEnabled&&!p.sourceUrl&&<div className="customizer-preview-subtitle" style={{zIndex:VIDEO_LAYERS.subtitles}}>{narration[line]}</div>}
        <div className="customizer-poster-copy" style={{zIndex:VIDEO_LAYERS.content,visibility:previewMap&&mapAt!==null?'hidden':undefined}}><h2>{p.settings.style==='cinematic'?p.fields.title||'Une nouvelle adresse':time>=duration*.8?p.agencyName||'Découvrez le bien':p.fields.title||'Une nouvelle adresse'}</h2><p>{[p.fields.area?`${p.fields.area} m²`:'',p.fields.rooms?`${p.fields.rooms} pièces`:''].filter(Boolean).join(' · ')}</p><strong>{price}</strong></div>
        <div className="customizer-poster-agency" style={{zIndex:VIDEO_LAYERS.content,visibility:previewMap&&mapAt!==null?'hidden':undefined}}>{p.agencyName||'BienVu'}</div>
        {previewMap&&mapAt!==null&&<MapScenePreview map={previewMap} automatic={automaticMap} aspectRatio={p.aspectRatio??'9:16'} frame={mapAt} primaryColor={p.settings.primaryColor} secondaryColor={p.settings.secondaryColor} agencyName={p.agencyName}/>}
      <AvatarPoster avatar={p.settings.avatar} look={catalogAvatarLook(avatarCatalog,p.settings.avatar?.lookId)} frame={time*30} total={duration*30} width={previewSize.width} height={previewSize.height}/>
      </div><div className="customizer-player-controls"><button type="button" aria-label={playing?'Pause':'Lecture'} disabled={!chosen.length} onClick={()=>{if(time>=duration)setTime(0);setPlaying(!playing);}}>{playing?'Ⅱ':'▶'}</button><span>0:{String(Math.floor(time)).padStart(2,'0')} / 0:{duration}</span>
        <input type="range" min="0" max={duration} step=".1" value={time} aria-label="Position de l’aperçu" onChange={event=>{setPlaying(false);setTime(Number(event.target.value));}}/>
        <button type="button" aria-label="Aperçu en plein écran" onClick={()=>void preview.current?.requestFullscreen?.()}>⛶</button></div>
      <p className="customizer-preview-caption">Aperçu visuel · Le son est ajouté à la génération.</p>
      <div className="customizer-cost" role="status" aria-live="polite"><div><span>Coût estimé</span><strong>{creditCost} crédit{creditCost>1?'s':''}</strong></div><p>1 vidéo{animationCount?` · ${animationCount} animation${animationCount>1?'s':''} IA`:''}{p.settings.avatar&&!p.settings.avatar.hidden?' · Avatar IA':''}</p>{me&&<small>{me.rights.developmentRemaining} crédits disponibles</small>}</div>
    </aside></div>
  </section>;
}
