import type {VideoDuration} from '@bienvu/contracts';

// Leave more time to discover larger galleries; this is advice, never an override.
export function suggestedPhotoDuration(photoCount:number,current:VideoDuration):VideoDuration|null {
  if(!Number.isInteger(photoCount)||photoCount<7)return null;
  const suggested:VideoDuration=photoCount>=10?40:30;
  return suggested>current?suggested:null;
}
