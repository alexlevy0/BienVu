import {avatarContentBounds} from '@bienvu/contracts';
export function measureAvatarElement(element:HTMLImageElement|HTMLVideoElement){
  const width=element instanceof HTMLVideoElement?element.videoWidth:element.naturalWidth,height=element instanceof HTMLVideoElement?element.videoHeight:element.naturalHeight;
  if(!width||!height)return null;
  const canvas=document.createElement('canvas');canvas.width=width;canvas.height=height;
  const context=canvas.getContext('2d',{willReadFrequently:true});if(!context)return null;
  context.drawImage(element,0,0);
  const bounds=avatarContentBounds(context.getImageData(0,0,width,height).data,width,height);
  return bounds?{bounds,width,height}:null;
}
