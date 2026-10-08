'use client';
import {useEffect,useRef,useState,type CSSProperties} from 'react';
import {CustomNarration,videoStyles,frenchVoices,requestedAnimations,generationCreditCost,selectedAnimationIndices,mapFrame,mapInterval,mapInk,type VideoCustomization,type VideoDuration,type VideoAspectRatio} from '@bienvu/contracts';
import {suggestedNarration,narrationWordLimit,wordCount} from '@bienvu/narration/suggestion';
import type {ManualDraftFields} from '../lib/listing-draft';
import {HomeIcon} from './home-icons';
import {VoicePreview} from './voice-preview';
import {useAccount} from './account';
import {MapScenePreview,VideoMapControls} from './video-map';
import {PhotoPreviewImage} from './photo-preview-image';

export type CustomizerPhoto={id:string;preview:string;slot:number;state:string;file?:File|null;error?:string;removing?:boolean};
export {suggestedNarration};
type Props={settings:VideoCustomization;onChange(value:VideoCustomization):void;photos:CustomizerPhoto[];fields:ManualDraftFields;
  agencyName:string;durationSeconds?:VideoDuration;aspectRatio?:VideoAspectRatio;voiceEnabled?:boolean;onVoice?(value:boolean):void;subtitlesEnabled:boolean;onSubtitles(value:boolean):void;onBack():void;onAdd(files:FileList|null):void;
  busy:boolean;ready:boolean;onEdit():void;saved:boolean;sourceUrl?:string;onRetry?(id:string):void;onRemove?(id:string):void};
export function VideoCustomizer(p:Props){
  const {me,voiceCatalog}=useAccount();
  const duration=p.durationSeconds??20;
  const [tab,setTab]=useState<'photos'|'style'|'voice'|'map'>('photos'),[drag,setDrag]=useState<number|null>(null),
    [playing,setPlaying]=useState(false),[time,setTime]=useState(0);
  const secondaryInk=()=>{const rgb=p.settings.secondaryColor.match(/[a-f\d]{2}/gi)!.map(h=>parseInt(h,16)/255).map(v=>v<=.04045?v/12.92:((v+.055)/1.055)**2.4);return rgb[0]*.2126+rgb[1]*.7152+rgb[2]*.0722>.179?'#101d18':'#ffffff';};
  const upload=useRef<HTMLInputElement>(null),preview=useRef<HTMLDivElement>(null);
  const order=p.settings.photoOrder??p.photos.map(photo=>photo.slot);
  const ordered=[...order.map(slot=>p.photos.find(photo=>photo.slot===slot)).filter((photo):photo is CustomizerPhoto=>!!photo),
    ...p.photos.filter(photo=>!order.includes(photo.slot))];
  const chosen=ordered.filter(photo=>order.includes(photo.slot));
  const animated=p.settings.runwayPhotos??selectedAnimationIndices(order,p.settings).map(index=>order[index]);
  const narration=p.settings.narration??(p.sourceUrl?['','','','']:suggestedNarration(p.fields,p.agencyName,duration)),validNarration=CustomNarration.safeParse(narration);
  const patch=(next:Partial<VideoCustomization>)=>p.onChange({...p.settings,...next});
  function toggle(slot:number){patch({photoOrder:order.includes(slot)?order.filter(s=>s!==slot):[...order,slot],runwayClips:undefined,runwayPhotos:animated.filter(s=>s!==slot)});}
  function animate(slot:number){patch({runwayClips:undefined,runwayPhotos:animated.includes(slot)?animated.filter(s=>s!==slot):[...animated,slot]});}
  function move(slot:number,target:number){const next=order.filter(s=>s!==slot);next.splice(Math.max(0,Math.min(next.length,target)),0,slot);patch({photoOrder:next});}
  useEffect(()=>{setPlaying(false);setTime(0);},[duration]);
  useEffect(()=>{if(!playing)return;const timer=setInterval(()=>setTime(t=>{if(t>=duration-.2){setPlaying(false);return duration;}return t+.1;}),100);return()=>clearInterval(timer);},[playing,duration]);
  const interval=mapInterval(p.settings.map,duration*30),mapAt=mapFrame(p.settings.map,duration*30,Math.min(duration*30-1,Math.round(time*30))),
    photo=chosen[Math.max(0,Math.min(chosen.length-1,Math.floor((time*30-interval.photoStartFrame)/interval.photoFrames*chosen.length)))],line=Math.min(narration.length-1,Math.floor(time/duration*narration.length));
  const money=Number(p.fields.priceCents.replace(/\s/g,'').replace(',','.'));
  const price=money>0?`${new Intl.NumberFormat('fr-FR').format(money)} €${p.fields.transaction==='rent'?' / mois':''}`:'';
  return <section className="video-customizer" aria-label="Personnaliser votre vidéo">
    <div className="customizer-topline"><button type="button" onClick={p.onBack} disabled={p.busy}><span>←</span> Retour</button>
      <span role="status">{p.saved?'✓ Réglages enregistrés':'Brouillon · Réglages conservés sur cet appareil'}</span></div>
    <header className="customizer-heading"><h1>Personnalisez votre vidéo</h1><p>Vos photos, votre style. BienVu s’occupe du montage.</p>
      <div className="customizer-property">{p.photos[0]&&<PhotoPreviewImage src={chosen[0]?.preview??p.photos[0].preview} alt=""/>}<div><strong>{p.sourceUrl?new URL(p.sourceUrl).hostname:p.fields.title||'Votre annonce'}</strong>
        <span>{[price,p.fields.area?`${p.fields.area} m²`:'',p.fields.rooms?`${p.fields.rooms} pièces`:''].filter(Boolean).join(' · ')||'Complétez les informations du bien'}</span></div></div></header>
    <div className={`customizer-panel${p.aspectRatio==='16:9'?' is-horizontal':''}`}><div className="customizer-controls">
      <div className="customizer-tabs" role="tablist" aria-label="Réglages vidéo">{([['photos','Photos','image'],['style','Style','palette'],['voice','Voix et texte','microphone'],['map','Carte','pin']] as const).map(([id,label,icon])=>
        <button type="button" key={id} role="tab" id={`customizer-tab-${id}`} aria-controls={`customizer-panel-${id}`} aria-selected={tab===id} tabIndex={tab===id?0:-1}
          onKeyDown={event=>{if(!['ArrowLeft','ArrowRight','Home','End'].includes(event.key))return;event.preventDefault();const ids=['photos','style','voice','map'] as const;
            const at=ids.indexOf(tab),next=event.key==='Home'?'photos':event.key==='End'?'map':ids[(at+(event.key==='ArrowRight'?1:3))%4];setTab(next);document.getElementById(`customizer-tab-${next}`)?.focus();}}
          onClick={()=>setTab(id)}><HomeIcon name={icon} size={21}/>{label}</button>)}</div>
      <div role="tabpanel" id={`customizer-panel-${tab}`} aria-labelledby={`customizer-tab-${tab}`}>
      {tab==='photos'&&<><div className="customizer-section-title"><strong>{p.sourceUrl?'Photos de votre annonce':`${chosen.length} photo${chosen.length>1?'s':''} sélectionnée${chosen.length>1?'s':''}`}</strong><p>{p.sourceUrl?'Les photos seront récupérées avec l’annonce à la génération. Connectez-vous pour les choisir et les réordonner avant génération.':'Glissez les photos pour changer leur ordre. Gardez au moins 3 photos.'}</p></div>
        {p.photos.length?<div className="customizer-photos">{ordered.map((photo,index)=>{const at=order.indexOf(photo.slot),selected=at>=0;return <div key={photo.id} className={`customizer-photo${selected?' is-selected':''}${drag===photo.slot?' is-dragging':''}`}
          draggable={selected&&!p.busy&&!photo.removing&&photo.state==='ready'} onDragStart={event=>{event.dataTransfer.setData('text/plain',String(photo.slot));event.dataTransfer.effectAllowed='move';setDrag(photo.slot);}}
          onDragEnd={()=>setDrag(null)} onDragOver={event=>{if(drag!==null&&selected){event.preventDefault();event.dataTransfer.dropEffect='move';}}}
          onDrop={event=>{if(drag!==null&&selected){event.preventDefault();move(drag,at);setDrag(null);}}}>
          <div className="customizer-photo-visual"><PhotoPreviewImage src={photo.preview} alt={`Photo ${photo.slot+1}`} draggable={false} loading={index<3?'eager':'lazy'} fetchPriority={at===0?'high':'auto'}/></div>{selected&&<span className="customizer-photo-number">{at+1}</span>}
          <button type="button" className="customizer-photo-check" aria-pressed={selected} aria-label={`${selected?'Désélectionner':'Sélectionner'} la photo ${photo.slot+1}`} onClick={()=>toggle(photo.slot)} disabled={p.busy||photo.removing||photo.state!=='ready'}>{selected?'✓':'+'}</button>
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
      {tab==='style'&&<><div className="customizer-section-title"><strong>Un style pour votre bien</strong><p>Les photos restent en plein écran dans les trois styles.</p></div>
        <div className="customizer-styles">{videoStyles.map(style=><button type="button" key={style.id} aria-pressed={p.settings.style===style.id} onClick={()=>patch({style:style.id})} disabled={p.busy}>
          <div className={`customizer-style-sample sample-${style.id}`} style={{'--preview-accent':p.settings.primaryColor} as CSSProperties}>{chosen[0]&&<PhotoPreviewImage src={chosen[0].preview} alt=""/>}<span>{style.id==='editorial'?'LYON':style.id==='minimal'?'Une nouvelle adresse':'La visite'}</span></div>
          <strong>{style.name}<span>{p.settings.style===style.id?'✓':''}</span></strong><small>{style.description}</small></button>)}</div>
        <div className="customizer-colors">{([['primaryColor','Couleur principale'],['secondaryColor','Couleur secondaire']] as const).map(([key,label])=><label key={key}>{label}<span><input type="color" value={p.settings[key]} onChange={event=>patch({[key]:event.target.value})} disabled={p.busy}/>{p.settings[key].toUpperCase()}</span></label>)}</div><p className="customizer-hint">Ces couleurs s’appliquent à cette vidéo. Votre charte d’agence est conservée.</p>
        <div className="customizer-animation"><div className="customizer-section-title"><strong>Donnez vie aux photos</strong><p>Une visite plus immersive, avec des mouvements de caméra doux.</p></div>
          <div className="customizer-animation-actions"><button type="button" className="customizer-add" disabled={p.busy||!me||!order.length} onClick={()=>patch({runwayClips:undefined,runwayPhotos:[...order]})}>Animer toutes les photos</button><button type="button" className="customizer-reset" disabled={p.busy} onClick={()=>patch({runwayClips:undefined,runwayPhotos:[]})}>Mouvements classiques</button></div>
          <p className="customizer-hint">{!me?'Connectez-vous pour animer les photos avec l’IA. Les zooms et translations sont inclus dans votre essai.':requestedAnimations(p.settings)?`${requestedAnimations(p.settings)} photo(s) animée(s). Choisissez chaque photo dans l’onglet Photos. Durée à l’écran adaptée au montage.`:'Zooms et translations inclus. Choisissez les photos à animer dans l’onglet Photos.'}</p>
          {Boolean(requestedAnimations(p.settings))&&<p className="customizer-hint">Les animations IA sont créées à partir des photos sélectionnées. Une animation non utilisée est remboursée en crédits. Vérifiez le rendu avant de partager.</p>}
          <p className="customizer-credit-total" role="status">Coût prévu : <strong>{generationCreditCost(p.settings)} crédit{generationCreditCost(p.settings)>1?'s':''}</strong> · 1 vidéo{requestedAnimations(p.settings)?` + ${requestedAnimations(p.settings)} animation(s)`:''}{me?` · ${me.rights.developmentRemaining} disponible(s)`:''}</p>
        </div>
      </>}
      {tab==='voice'&&<><div className="customizer-voice-options"><div className="customizer-voice-choice"><label htmlFor="customizer-selected-voice">Voix française</label><div className="customizer-voice-choice-row"><select id="customizer-selected-voice" value={p.settings.voice} onChange={event=>patch({voice:event.target.value as VideoCustomization['voice']})} disabled={p.busy||p.voiceEnabled===false}>{frenchVoices.map(voice=><option key={voice.id} value={voice.id} disabled={voiceCatalog?.voices.find(v=>v.id===voice.id)?.available===false}>{voice.name} · {voice.provider}</option>)}</select><VoicePreview key={p.settings.voice} voice={p.settings.voice} disabled={p.busy||p.voiceEnabled===false}/></div></div>
        <label className="customizer-checkbox"><input type="checkbox" aria-label="Activer la voix off" checked={p.voiceEnabled!==false} onChange={event=>p.onVoice?.(event.target.checked)} disabled={p.busy}/>Activer la voix off</label><label className="customizer-checkbox"><input type="checkbox" aria-label="Afficher les sous-titres" checked={p.subtitlesEnabled} onChange={event=>p.onSubtitles(event.target.checked)} disabled={p.busy||p.voiceEnabled===false}/>Afficher les sous-titres</label></div>
        <p className="customizer-hint customizer-voice-sample-note">Le même texte de démonstration pour comparer les voix.</p>
        <div className="customizer-section-title"><strong>Votre narration</strong><p>{p.voiceEnabled===false?'La voix off et les sous-titres sont désactivés.':p.settings.narration?'Relisez et ajustez chaque passage. Votre texte sera prononcé tel quel.':`Une narration tirée de la description, adaptée à ${duration} secondes. Vous pouvez la modifier ; sinon BienVu sélectionnera les passages à la génération.`}</p></div>
        {p.sourceUrl&&!p.settings.narration?<div className="customizer-empty"><p>BienVu résumera la description importée pour une voix off de {duration} secondes.</p><button type="button" className="customizer-add" onClick={()=>patch({narration:['','','','']})}>Écrire ma narration</button></div>:narration.map((text,index)=><label className="customizer-narration" key={index}><span>{index===0?'Ouverture':index===narration.length-1?'Conclusion':`Passage ${index+1}`}</span><textarea value={text} rows={2} maxLength={500} disabled={p.busy}
          onChange={event=>patch({narration:narration.map((line,at)=>at===index?event.target.value:line)})}/></label>)}
        <p className={validNarration.success||p.sourceUrl&&!p.settings.narration?'customizer-hint':'customizer-error'} role="status">{p.sourceUrl&&!p.settings.narration?`Rédaction automatique · ${duration} secondes.`:validNarration.success?`${wordCount(narration.join(' '))} mots · ${duration} secondes · ${narrationWordLimit(duration)} mots conseillés maximum${wordCount(narration.join(' '))>narrationWordLimit(duration)?' — raccourcissez le texte ou choisissez une durée supérieure.':''}`:
          validNarration.error.issues[0].message}</p><button type="button" className="customizer-reset" disabled={p.busy} onClick={()=>patch({narration:undefined})}>Reprendre le texte proposé</button>
      </>}
      {tab==='map'&&<VideoMapControls map={p.settings.map} onChange={map=>patch({map})} onPreview={endpoint=>{setPlaying(false);setTime((interval.startFrame+(endpoint==='end'?interval.durationFrames-1:0))/30);}} locality={p.fields.locality} aspectRatio={p.aspectRatio??'9:16'} busy={p.busy} color={mapInk(p.settings.primaryColor,p.settings.secondaryColor)} duration={duration}/>}
      </div>
      <details className="customizer-advanced"><summary><HomeIcon name="settings" size={21}/>Réglages avancés<HomeIcon name="chevron" size={17}/></summary><div>
        <label className="customizer-checkbox"><input type="checkbox" checked={p.settings.photoMotion} onChange={event=>patch({photoMotion:event.target.checked})} disabled={p.busy}/>Zooms et translations des photos</label>
        <label>Transition<select value={p.settings.transition} onChange={event=>patch({transition:event.target.value as 'fade'|'cut'})} disabled={p.busy}><option value="fade">Fondu</option><option value="cut">Coupe franche</option></select></label></div></details>
      {!p.ready&&<p className="customizer-incomplete">Votre annonce reste à compléter. <button type="button" onClick={p.onEdit}>Revenir aux informations du bien →</button></p>}
    </div><aside className={`customizer-preview${p.aspectRatio==='16:9'?' is-horizontal':''}`}><div className="customizer-preview-title"><strong>Aperçu de votre vidéo</strong><span>{p.aspectRatio??'9:16'}</span></div>
      <div ref={preview} className={`customizer-poster poster-${p.settings.style}${playing&&p.settings.photoMotion?' is-playing':''}${time>=duration*.8?' is-ending':''}`} style={{'--preview-accent':p.settings.primaryColor,'--preview-secondary':p.settings.secondaryColor,'--preview-ink':secondaryInk()} as CSSProperties}>
        {photo?<PhotoPreviewImage key={photo.id} src={photo.preview} alt="Aperçu de la photo sélectionnée" fetchPriority="high"/>:<div className="customizer-preview-empty"><HomeIcon name="image" size={40}/></div>}
        <div className="customizer-poster-location">⌖ {p.fields.locality||'Votre localisation'}</div><button type="button" className="customizer-play" aria-label={playing?'Mettre l’aperçu en pause':'Lire l’aperçu visuel'} disabled={!chosen.length} onClick={()=>{if(time>=duration)setTime(0);setPlaying(!playing);}}>{playing?'Ⅱ':'▶'}</button>
        {p.subtitlesEnabled&&!p.sourceUrl&&<div className="customizer-preview-subtitle">{narration[line]}</div>}
        <div className="customizer-poster-copy"><h2>{p.settings.style==='cinematic'?p.fields.title||'Une nouvelle adresse':time>=duration*.8?p.agencyName||'Découvrez le bien':p.fields.title||'Une nouvelle adresse'}</h2><p>{[p.fields.area?`${p.fields.area} m²`:'',p.fields.rooms?`${p.fields.rooms} pièces`:''].filter(Boolean).join(' · ')}</p><strong>{price}</strong></div>
        <div className="customizer-poster-agency">{p.agencyName||'BienVu'}</div>
        {p.settings.map&&mapAt!==null&&<MapScenePreview map={p.settings.map} aspectRatio={p.aspectRatio??'9:16'} frame={mapAt} primaryColor={p.settings.primaryColor} secondaryColor={p.settings.secondaryColor} agencyName={p.agencyName}/>}
      </div><div className="customizer-player-controls"><button type="button" aria-label={playing?'Pause':'Lecture'} disabled={!chosen.length} onClick={()=>{if(time>=duration)setTime(0);setPlaying(!playing);}}>{playing?'Ⅱ':'▶'}</button><span>0:{String(Math.floor(time)).padStart(2,'0')} / 0:{duration}</span>
        <input type="range" min="0" max={duration} step=".1" value={time} aria-label="Position de l’aperçu" onChange={event=>{setPlaying(false);setTime(Number(event.target.value));}}/>
        <button type="button" aria-label="Aperçu en plein écran" onClick={()=>void preview.current?.requestFullscreen?.()}>⛶</button></div>
      <p className="customizer-preview-caption">Style {videoStyles.find(style=>style.id===p.settings.style)!.name}</p><p className="customizer-hint">Aperçu visuel indicatif · La voix et le montage final sont créés à la génération.</p>
    </aside></div>
  </section>;
}
