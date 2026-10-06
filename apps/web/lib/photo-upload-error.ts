import {publicErrors,type PublicErrorCode} from '@bienvu/contracts';

// Use the finite public error contract, never arbitrary server text or filenames.
export async function photoUploadError(response:Response,fallback:string){
  try{
    const body=await response.json() as {error?:{code?:string}};
    const code=body.error?.code;
    if(code==='DUPLICATE_PHOTO')return 'Cette photo est déjà présente. Retirez ce doublon.';
    if(code==='CONFLICT')return 'Le brouillon a changé. Rechargez-le avant de réessayer.';
    if(code==='NOT_FOUND')return 'Ce brouillon n’est plus disponible. Retirez la photo ou ouvrez une nouvelle annonce.';
    if(code==='UNAUTHORIZED')return 'Reconnectez-vous pour envoyer vos photos.';
    if(code&&Object.hasOwn(publicErrors,code))return publicErrors[code as PublicErrorCode][1];
  }catch{}
  return fallback;
}
