import type {VideoDuration} from '@bienvu/contracts';
import {suggestedPhotoDuration} from '../lib/photo-duration';
import {HomeIcon} from './home-icons';

export function PhotoDurationAdvice({photoCount,durationSeconds=20,onDuration,disabled=false}: {
  photoCount:number;durationSeconds?:VideoDuration;onDuration?(value:VideoDuration):void;disabled?:boolean;
}) {
  const suggested=suggestedPhotoDuration(photoCount,durationSeconds);
  if(!suggested)return null;
  return <div className="photo-duration-advice" role="status">
    <HomeIcon name="clock" size={18}/>
    <span><strong>{photoCount} photos : {suggested} s conseillées.</strong> Laissez plus de temps pour découvrir chaque espace.</span>
    {onDuration&&<button type="button" disabled={disabled} onClick={()=>onDuration(suggested)}>Passer à {suggested} s <HomeIcon name="arrow" size={15}/></button>}
  </div>;
}
