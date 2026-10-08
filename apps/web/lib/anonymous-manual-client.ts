import {analyticsFetch as fetch} from './product-analytics';
import {GenerationView,publicErrors,type PublicErrorCode,type VideoCustomization,type VideoDuration,type VideoAspectRatio,type ManualListingInput} from '@bienvu/contracts';

export type TrialManualSettings={subtitlesEnabled:boolean;voiceEnabled:boolean;durationSeconds:VideoDuration;aspectRatio:VideoAspectRatio;customization?:VideoCustomization};
export type TrialManualInput={listing:ManualListingInput;photos:File[]};
export type TrialManualIntent={fingerprint:string;key:string};
export class TrialManualFailure extends Error{
  constructor(readonly code:PublicErrorCode|undefined,message:string){super(message);}
}
async function reply<T>(response:Response):Promise<T>{
  let body:T&{error?:{code?:PublicErrorCode;message?:string}};
  try{body=await response.json() as typeof body;}catch{throw new TrialManualFailure(undefined,'La connexion a été interrompue. Réessayez pour reprendre votre annonce.');}
  if(!response.ok)throw new TrialManualFailure(body.error?.code,body.error?.message??publicErrors.INTERNAL_ERROR[1]);return body;
}
// Each upload is bounded and journaled by the same decoder as signed-in
// imports. Replaying this sequence resumes its manifest and completed slots.
export async function submitTrialManual(input:TrialManualInput,settings:TrialManualSettings,intent:TrialManualIntent,token:string,
  onProgress:(message:string)=>void,fetcher:typeof fetch=fetch){
  onProgress('Préparation de votre annonce…');
  const draft=await reply<{id:string;status:string}>(await fetcher('/api/trial/manual',{method:'POST',signal:AbortSignal.timeout(30_000),
    headers:{'Content-Type':'application/json','Idempotency-Key':intent.key},body:JSON.stringify({listing:input.listing,turnstileToken:token})}));
  if(draft.status!=='ready'){
    for(const [index,file] of input.photos.entries()){
      onProgress(`Envoi des photos · ${index+1}/${input.photos.length}`);
      await reply(await fetcher(`/api/trial/manual/${draft.id}/uploads/${index}`,{method:'PUT',signal:AbortSignal.timeout(65_000),
        headers:{'Content-Type':file.type},body:file}));
    }
    onProgress('Validation des photos…');
    await reply(await fetcher(`/api/trial/manual/${draft.id}/complete`,{method:'POST',signal:AbortSignal.timeout(30_000)}));
  }
  onProgress('Démarrage de votre vidéo…');
  return GenerationView.parse(await reply(await fetcher('/api/trial',{method:'POST',signal:AbortSignal.timeout(30_000),
    headers:{'Content-Type':'application/json','Idempotency-Key':intent.key},body:JSON.stringify({listingId:draft.id,...settings,turnstileToken:token})})));
}
