'use client';
import '../app/customizer.css';
import {CreationMotion,CreationSwap,CreationDisclosure,m,AnimatePresence,creationSpring} from './creation-motion';
import {CustomizerPreview,type CustomizerPreviewHandle} from './customizer-preview';
import {CreationCreditAmount} from './creation-credit-amount';
import {CreationPhotoDestination} from './creation-photo-handoff';
import {trackProductEvent} from '../lib/product-analytics';
import {useId,useRef,useState,type CSSProperties} from 'react';
import {VIDEO_PHOTO_MAXIMUM,catalogAvatarLook,CustomNarration,videoStyles,frenchVoices,requestedAnimations,generationCreditCost,selectedAnimationIndices,mapInterval,mapInk,videoMapFromDefaults,type VideoCustomization,type VideoDuration,type VideoAspectRatio} from '@bienvu/contracts';
import {suggestedNarration,narrationWordLimit,wordCount} from '@bienvu/narration/suggestion';
import type {ManualDraftFields} from '../lib/listing-draft';
import {HomeIcon} from './home-icons';
import {PhotoDurationAdvice} from './photo-duration-advice';
import {VoicePreview} from './voice-preview';
import {useAccount} from './account';
import {VideoMapControls,useVideoMapDefaults,useAutomaticMapLocation} from './video-map';
import {AvatarControls,AvatarWarning,useAvatarCatalog} from './avatar-controls';
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
  const duration=p.durationSeconds??20,tabIdentity=useId();
  const [tab,setTab]=useState<'photos'|'style'|'voice'|'music'|'map'|'avatar'>('photos'),[drag,setDrag]=useState<number|null>(null);
  const upload=useRef<HTMLInputElement>(null),preview=useRef<CustomizerPreviewHandle>(null);
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
  const money=Number(p.fields.priceCents.replace(/\s/g,'').replace(',','.'));
  const price=money>0?`${new Intl.NumberFormat('fr-FR').format(money)} €${p.fields.transaction==='rent'?' / mois':''}`:'';
  const interval=mapInterval(previewMap,duration*30);
  return <CreationMotion><section className="video-customizer" aria-label="Personnaliser votre vidéo">
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
          onClick={()=>setTab(id)}><HomeIcon name={icon} size={21}/>{label}{tab===id&&<m.span className="customizer-tab-indicator" layoutId={`creation-tab-${tabIdentity}`} layoutDependency={tab} transition={creationSpring}/>}</button>)}</div>
      <AvatarWarning avatar={p.settings.avatar} voice={p.settings.voice??voiceCatalog?.defaultVoice??frenchVoices[0].id} catalog={avatarCatalog}/>
      <CreationSwap identity={tab}><div role="tabpanel" id={`customizer-panel-${tab}`} aria-labelledby={`customizer-tab-${tab}`}>
      {tab==='photos'&&<><div className="customizer-section-title customizer-photo-heading"><div><strong>Photos de la vidéo</strong><p>{p.sourceUrl&&!p.photos.length?'Connectez-vous pour choisir les photos de l’annonce.':`${p.photos.length} disponibles · Choisissez de 3 à 12 photos, puis réordonnez-les.`}</p></div><span className="customizer-count" role="status" aria-label={`${chosen.length} photos sélectionnées sur ${VIDEO_PHOTO_MAXIMUM}`}>{chosen.length} / {VIDEO_PHOTO_MAXIMUM}</span></div>
        {p.photos.length>VIDEO_PHOTO_MAXIMUM&&order.length>=VIDEO_PHOTO_MAXIMUM&&<p className="customizer-selection-help" role="status">Désélectionnez une photo pour en choisir une autre.</p>}
        <PhotoDurationAdvice photoCount={chosen.length} durationSeconds={duration} onDuration={p.onDuration} disabled={p.busy}/>
        {chosen.length>0&&<div className="customizer-photo-toolbar"><div><HomeIcon name="sparkle" size={20}/><span><strong>Animations IA</strong><small>{animationCount?`${animationCount} photo${animationCount>1?'s':''} animée${animationCount>1?'s':''} · +${animationCount} crédit${animationCount>1?'s':''}`:'1 crédit par photo animée'}</small></span></div><label className="customizer-switch"><span>Tout animer</span><input type="checkbox" role="switch" checked={allAnimated} disabled={p.busy||!me||!order.length} title={!me?'Connectez-vous pour animer vos photos':undefined} onChange={event=>patch({runwayClips:undefined,runwayPhotos:event.target.checked?[...order]:[]})}/><span aria-hidden="true"/></label></div>}
        {chosen.length>0&&!me&&<p className="customizer-hint">Connectez-vous pour activer les animations IA.</p>}
        {p.photos.length?<div className="customizer-photos"><AnimatePresence initial={false} mode="popLayout">{ordered.map((photo,index)=>{const at=order.indexOf(photo.slot),selected=at>=0;return <m.div key={photo.id} layout="position" layoutDependency={`${order.join(',')}:${p.photos.map(item=>item.id).join(',')}`} initial={false} animate={{opacity:drag===photo.slot ? .35 : selected?1:.55,scale:1}} exit={{opacity:0,scale:.96}} transition={{layout:creationSpring,opacity:{duration:.15},scale:{duration:.15}}} className={`customizer-photo${selected?' is-selected':''}${drag===photo.slot?' is-dragging':''}`}
          draggable={selected&&!p.busy&&!photo.removing&&photo.state==='ready'} onDragStartCapture={event=>{if(event.target instanceof Element&&event.target.closest('button,input,a')){event.preventDefault();return;}event.dataTransfer.setData('text/plain',String(photo.slot));event.dataTransfer.effectAllowed='move';setDrag(photo.slot);}}
          onDragEndCapture={()=>setDrag(null)} onDragOver={event=>{if(drag!==null&&selected){event.preventDefault();event.dataTransfer.dropEffect='move';}}}
          onDrop={event=>{if(drag!==null&&selected){event.preventDefault();move(drag,at);setDrag(null);}}}>
          <CreationPhotoDestination slot={photo.slot}><PhotoPreviewImage src={photo.preview} alt={`Photo ${photo.slot+1}`} draggable={false} loading={index<3?'eager':'lazy'} fetchPriority={at===0?'high':'auto'}/></CreationPhotoDestination>{selected&&<span className="customizer-photo-number">{at+1}</span>}
          <button type="button" className="customizer-photo-check" aria-pressed={selected} aria-label={`${selected?'Désélectionner':'Sélectionner'} la photo ${photo.slot+1}`} title={!selected&&order.length>=VIDEO_PHOTO_MAXIMUM?'Désélectionnez une photo pour faire de la place':undefined} onClick={()=>toggle(photo.slot)} disabled={p.busy||photo.removing||photo.state!=='ready'||!selected&&order.length>=VIDEO_PHOTO_MAXIMUM}>{selected?'✓':'+'}</button>
          {selected&&<button type="button" className={`customizer-photo-animate${animated.includes(photo.slot)?' is-active':''}`} aria-pressed={animated.includes(photo.slot)} aria-label={`Animer la photo ${photo.slot+1} avec l’IA`} disabled={!me||p.busy||photo.removing||photo.state!=='ready'} title={!me?'Connectez-vous pour animer vos photos':'1 crédit supplémentaire'} onClick={()=>animate(photo.slot)}>{animated.includes(photo.slot)?'✓ Animée':'Animer'} · 1 crédit</button>}
          {at===0&&<span className="customizer-first-photo">Première image</span>}{photo.state!=='ready'&&<span className="customizer-photo-state">{photo.state==='error'?'Envoi interrompu':'Envoi…'}</span>}
          {photo.error&&<p className="customizer-photo-error" role="alert">{photo.error}</p>}
          {(p.onRemove||photo.state==='error'&&p.onRetry&&photo.file)&&<div className="customizer-photo-actions">
            {photo.state==='error'&&p.onRetry&&photo.file&&<button type="button" disabled={p.busy||photo.removing} onClick={()=>p.onRetry?.(photo.id)}>Réessayer</button>}
            {p.onRemove&&<button type="button" disabled={p.busy||photo.removing} aria-label={`Retirer la photo ${photo.slot+1}`} onClick={()=>p.onRemove?.(photo.id)}>{photo.removing?'Retrait…':'Retirer'}</button>}
          </div>}
          {selected&&order.length>1&&<div className="customizer-photo-moves"><button type="button" disabled={at===0||p.busy||photo.removing} aria-label={`Avancer la photo ${photo.slot+1}`} onClick={()=>move(photo.slot,at-1)}>←</button><button type="button" disabled={at===order.length-1||p.busy||photo.removing} aria-label={`Reculer la photo ${photo.slot+1}`} onClick={()=>move(photo.slot,at+1)}>→</button></div>}</m.div>;})}</AnimatePresence></div>
          :<div className="customizer-empty"><HomeIcon name="image" size={32}/><p>{p.sourceUrl?'Aperçu des photos disponible après import de l’annonce dans votre compte.':'Ajoutez les photos de votre bien pour composer votre vidéo.'}</p></div>}
        <input ref={upload} type="file" accept="image/jpeg,image/png,image/webp" multiple hidden onChange={event=>{p.onAdd(event.target.files);event.target.value='';}}/>
        <p id="customizer-add-help" className="customizer-hint" hidden={p.photos.length<12}>Pour ajouter un nouveau fichier, retirez une photo. Les photos importées restent sélectionnables ci-dessus.</p><button type="button" className="customizer-add" disabled={p.busy||p.photos.length>=12} aria-describedby={p.photos.length>=12?'customizer-add-help':undefined} onClick={()=>upload.current?.click()}><HomeIcon name="plus" size={21}/>Ajouter des photos</button>
      </>}
      {tab==='style'&&<><div className="customizer-section-title"><strong>Style de la vidéo</strong></div>
        <div className="customizer-styles">{videoStyles.map(style=><button type="button" key={style.id} aria-pressed={p.settings.style===style.id} onClick={()=>patch({style:style.id})} disabled={p.busy}>
          <div className={`customizer-style-sample sample-${style.id}`} style={{'--preview-accent':p.settings.primaryColor} as CSSProperties}>{chosen[0]&&<PhotoPreviewImage src={chosen[0].preview} alt=""/>}<span>{style.id==='editorial'?'LYON':style.id==='minimal'?'Une nouvelle adresse':'La visite'}</span></div>
          <strong>{style.name}<span>{p.settings.style===style.id?'✓':''}</span></strong><small>{style.id==='editorial'?'Titres en grand':style.id==='minimal'?'Texte discret':'Infos à la fin'}</small></button>)}</div>
        <div className="customizer-style-colors"><div className="customizer-section-title"><strong>Couleurs</strong><p>Pour cette vidéo uniquement.</p></div><div className="customizer-colors">{([['primaryColor','Principale'],['secondaryColor','Secondaire']] as const).map(([key,label])=><label key={key}>{label}<span><input type="color" aria-label={`Couleur ${label.toLowerCase()}`} value={p.settings[key]} onChange={event=>patch({[key]:event.target.value})} disabled={p.busy}/>{p.settings[key].toUpperCase()}</span></label>)}</div></div>
      </>}
      {tab==='voice'&&<><div className="customizer-voice-toggles"><label className="customizer-switch"><span>Voix off</span><input type="checkbox" role="switch" aria-label="Activer la voix off" checked={p.voiceEnabled!==false} onChange={event=>{p.onVoice?.(event.target.checked);if(!event.target.checked&&p.settings.avatar)patch({avatar:{...p.settings.avatar,hidden:true}});}} disabled={p.busy}/><span aria-hidden="true"/></label><label className="customizer-switch"><span>Sous-titres</span><input type="checkbox" role="switch" aria-label="Afficher les sous-titres" checked={p.subtitlesEnabled} onChange={event=>p.onSubtitles(event.target.checked)} disabled={p.busy||p.voiceEnabled===false} aria-describedby={p.voiceEnabled===false?'customizer-subtitle-help':undefined}/><span aria-hidden="true"/></label></div>
        {p.voiceEnabled===false&&<p id="customizer-subtitle-help" className="customizer-hint">Activez la voix off pour ajouter des sous-titres.</p>}{p.voiceEnabled!==false&&<><div className="customizer-voice-options"><div className="customizer-voice-choice"><label htmlFor="customizer-selected-voice">Voix française</label><div className="customizer-voice-choice-row"><select id="customizer-selected-voice" value={p.settings.voice} onChange={event=>patch({voice:event.target.value as VideoCustomization['voice']})} disabled={p.busy}>{frenchVoices.map(voice=><option key={voice.id} value={voice.id} disabled={voiceCatalog?.voices.find(v=>v.id===voice.id)?.available===false}>{voice.name} · {voice.provider}</option>)}</select><VoicePreview key={p.settings.voice} voice={p.settings.voice} disabled={p.busy}/></div></div></div>
        <div className="customizer-section-title"><strong>Narration</strong><p>{p.settings.narration?'Votre texte sera lu tel quel.':`Texte proposé pour ${duration} secondes, modifiable à votre guise.`}</p></div>
        {p.sourceUrl&&!p.settings.narration?<div className="customizer-empty"><HomeIcon name="microphone" size={26}/><p>Texte rédigé automatiquement à partir de l’annonce.</p><button type="button" className="customizer-add" disabled={p.busy} onClick={()=>patch({narration:['','','','']})}>Écrire mon texte</button></div>:narration.map((text,index)=><label className="customizer-narration" key={index}><span>{index===0?'Ouverture':index===narration.length-1?'Conclusion':`Passage ${index+1}`}</span><textarea value={text} rows={2} maxLength={500} disabled={p.busy}
          onChange={event=>patch({narration:narration.map((line,at)=>at===index?event.target.value:line)})}/></label>)}
        {(!p.sourceUrl||p.settings.narration)&&<p className={validNarration.success?'customizer-hint':'customizer-error'} role="status">{validNarration.success?`${wordCount(narration.join(' '))} / ${narrationWordLimit(duration)} mots conseillés${wordCount(narration.join(' '))>narrationWordLimit(duration)?' · Raccourcissez le texte ou augmentez la durée.':''}`:validNarration.error.issues[0].message}</p>}{p.settings.narration&&<button type="button" className="customizer-reset" disabled={p.busy} onClick={()=>patch({narration:undefined})}>Reprendre le texte automatique</button>}
        </>}
      </>}
      {tab==='music'&&<CustomizerMusic music={p.settings.music??p.settings.editor?.music??undefined} authenticated={Boolean(me?.agency)} voiceEnabled={p.voiceEnabled!==false} busy={p.busy} onPick={p.onMusicPick}
        onChange={music=>p.settings.editor?patch({music:undefined,editor:{...p.settings.editor,music:music?musicForTimeline(music,duration*30):null}}):patch({music})}/>}
      {tab==='avatar'&&<AvatarControls catalog={avatarCatalog} avatar={p.settings.avatar} onChange={avatar=>patch({avatar})} voice={p.settings.voice??voiceCatalog?.defaultVoice??frenchVoices[0].id} voiceEnabled={p.voiceEnabled!==false} onEnableVoice={()=>p.onVoice?.(true)} authenticated={Boolean(me?.agency)} durationSeconds={p.durationSeconds??20} busy={p.busy}/>}
      {tab==='map'&&<VideoMapControls map={mapSettings} automatic={automaticMap} defaults={mapDefaults} onChange={(map,automatic=automaticMap)=>patch({map,mapDisabled:map?undefined:true,mapAutomatic:map&&automatic?true:undefined})} onPreview={endpoint=>preview.current?.seek((interval.startFrame+(endpoint==='end'?interval.durationFrames-1:0))/30)} locality={p.fields.locality} aspectRatio={p.aspectRatio??'9:16'} busy={p.busy} color={mapInk(p.settings.primaryColor,p.settings.secondaryColor)} duration={duration}/>}
      {tab==='photos'&&<CreationDisclosure className="customizer-advanced" label={<><HomeIcon name="settings" size={21}/>Réglages avancés</>}>
        <label className="customizer-checkbox"><input type="checkbox" checked={p.settings.photoMotion} onChange={event=>patch({photoMotion:event.target.checked})} disabled={p.busy}/>Zooms et translations des photos</label>
        <label>Transition<select value={p.settings.transition} onChange={event=>patch({transition:event.target.value as 'fade'|'cut'})} disabled={p.busy}><option value="fade">Fondu</option><option value="cut">Coupe franche</option></select></label></CreationDisclosure>}
      </div></CreationSwap>
      {!p.ready&&<p className="customizer-incomplete">Votre annonce reste à compléter. <button type="button" onClick={p.onEdit}>Revenir aux informations du bien →</button></p>}
    </div><aside className={`customizer-preview${p.aspectRatio==='16:9'?' is-horizontal':''}`}><div className="customizer-preview-title"><strong>Aperçu de votre vidéo</strong><span>{p.aspectRatio??'9:16'}</span></div>
      <CustomizerPreview ref={preview} settings={p.settings} fields={p.fields} agencyName={p.agencyName} duration={duration} aspectRatio={p.aspectRatio??'9:16'} narration={narration} subtitles={p.subtitlesEnabled} voice={p.voiceEnabled!==false} photos={chosen} brand={me?.agency} map={previewMap} automaticMap={automaticMap} look={catalogAvatarLook(avatarCatalog,p.settings.avatar?.lookId)} busy={p.busy} animationCount={animationCount}/>
      <div className="customizer-cost" role="status" aria-live="polite"><div><span>Coût estimé</span><strong><CreationCreditAmount value={creditCost}/></strong></div><p>1 crédit vidéo{animationCount?` · IA +${animationCount} crédit${animationCount>1?'s':''}`:''}{p.settings.avatar&&!p.settings.avatar.hidden?` · Avatar +${creditCost-1-animationCount}`:''}</p>{me&&<small>{me.rights.developmentRemaining} crédits disponibles</small>}</div>
    </aside></div>
  </section></CreationMotion>;
}
