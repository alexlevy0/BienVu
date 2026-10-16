import {VIDEO_PHOTO_MAXIMUM,type VideoCustomization} from '@bienvu/contracts';

// Use source slots, including photos chosen beyond the first twelve imported.
// The same settings feed the estimate, the customizer and the generation request.
export function withPhotoAnimationChoice(settings:VideoCustomization,selectedSlots:number[],enabled:boolean):VideoCustomization{
  const order=selectedSlots.slice(0,VIDEO_PHOTO_MAXIMUM);
  return {...settings,photoOrder:[...order],runwayClips:undefined,runwayPhotos:enabled?[...order]:[],
    ...(enabled?{photoMotion:true}:{})};
}
export type PhotoAnimationSelection={selected:number;total:number};
