'use client';

import type {PhotoAnimationSelection} from '../lib/photo-animation-choice';
import {HomeIcon} from './home-icons';
import {PhotoAnimationToggle} from './photo-animation-toggle';
import {m} from './creation-motion';
import './home-composer-settings.css';

type Props={
 aspectRatio:'9:16'|'16:9';durationSeconds:20|30|40;voiceEnabled:boolean;subtitlesEnabled:boolean;
 disabled:boolean;animationsEnabled:boolean;animationSelection:PhotoAnimationSelection;animationsDisabled:boolean;requiresLogin:boolean;
 personalizing:boolean;personalizeDisabled:boolean;
 onAspectRatio(value:'9:16'|'16:9'):void;onDuration(value:20|30|40):void;onVoice(value:boolean):void;onSubtitles(value:boolean):void;onAnimations(value:boolean):void;onPersonalize():void;
};

export function HomeComposerSettings(props:Props){
 return <div className="home-settings" role="group" aria-label="Réglages de la vidéo">
  <div className="home-settings-fields">
   <label className="home-settings-field"><span>Format</span><span className="home-settings-select"><HomeIcon name={props.aspectRatio==='16:9'?'landscape':'phone'} size={17}/>
    <select aria-label="Format de la vidéo" value={props.aspectRatio} disabled={props.disabled} onChange={event=>props.onAspectRatio(event.target.value==='16:9'?'16:9':'9:16')}><option value="9:16">Vertical 9:16</option><option value="16:9">Horizontal 16:9</option></select><HomeIcon name="chevron" size={14}/>
   </span></label>
   <label className="home-settings-field"><span>Durée</span><span className="home-settings-select"><HomeIcon name="clock" size={17}/>
    <select aria-label="Durée de la vidéo" value={props.durationSeconds} disabled={props.disabled} onChange={event=>props.onDuration(Number(event.target.value) as 20|30|40)}><option value={20}>20 s</option><option value={30}>30 s</option><option value={40}>40 s</option></select><HomeIcon name="chevron" size={14}/>
   </span></label>
  </div>
  <div className="home-settings-switches">
   <button type="button" className="home-setting-toggle" aria-pressed={props.voiceEnabled} aria-label="Voix off" title="Activer ou désactiver la voix off" disabled={props.disabled} onClick={()=>props.onVoice(!props.voiceEnabled)}><span className="home-option-label">Voix off</span><span className="home-toggle-track" aria-hidden="true"/></button>
   <button type="button" className="home-setting-toggle" aria-pressed={props.subtitlesEnabled} aria-label="Sous-titres de la voix off" title={props.voiceEnabled?'Afficher ou masquer les sous-titres de la voix off':'Activez la voix off pour ajouter des sous-titres'} disabled={!props.voiceEnabled||props.disabled} onClick={()=>props.onSubtitles(!props.subtitlesEnabled)}><span className="home-option-label">Sous-titres</span><span className="home-toggle-track" aria-hidden="true"/></button>
   <PhotoAnimationToggle enabled={props.animationsEnabled} selection={props.animationSelection} requiresLogin={props.requiresLogin} disabled={props.animationsDisabled} onChange={props.onAnimations}/>
  </div>
  <div className="home-settings-footer"><m.button type="button" whileTap={{scale:.98}} className="home-settings-personalize" aria-pressed={props.personalizing} disabled={props.personalizeDisabled} onClick={props.onPersonalize}><HomeIcon name="settings" size={16}/>Personnaliser<HomeIcon name="arrow" size={15}/></m.button></div>
 </div>;
}
