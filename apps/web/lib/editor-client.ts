import {publicErrors,rebalanceEditorClips,MUSIC_LIMITS,type EditorDocument,type PublicErrorCode,type VideoCustomization,type PhotoAsset,type AvatarPreviewClip} from '@bienvu/contracts';
export type EditorResources={avatars?:AvatarPreviewClip[];avatarVoiceId?:string;version:number;sourceKey:string;cost:number;animations:{slot:number;url:string}[];availableAnimations:{slot:number;url:string}[]};
// Visual/text edits must not replace retained videos with stills while saving.
// A different source photo or format does invalidate the cached files.
export function editorMediaSourcesKey(settings:VideoCustomization,photos:PhotoAsset[]){
  return JSON.stringify([settings.editor?.aspectRatio??'9:16',photos.map(photo=>
    [photo.sourceOrder,photo.id,photo.contentHash]).sort((a,b)=>Number(a[0])-Number(b[0]))]);
}
export async function editorResponse<T=unknown>(response:Response):Promise<T>{
  const body=await response.json() as {error?:{code?:PublicErrorCode};fields?:Record<string,string>};
  if(!response.ok){const code=body.error?.code as PublicErrorCode|undefined;
    const error=new Error(body.fields?.music??(code&&code in publicErrors?publicErrors[code][1]:'Cette action a échoué. Réessayez.')) as Error&{code?:string};
    error.code=code;throw error;}
  return body as T;
}
export function distributeEditorClips(doc:EditorDocument,clips:EditorDocument['clips']):EditorDocument{
  return {...doc,clips:rebalanceEditorClips(doc.durationSeconds*30,clips)};
}
// Decode locally and retain the complete, bounded source for excerpt selection.
// The server measures samples independently and never trusts browser metadata.
export async function editorMusicWav(file:File):Promise<Blob>{
  if(file.size>MUSIC_LIMITS.sourceBytes)throw new Error('Le fichier doit peser moins de 50 Mo.');
  const context=new AudioContext();
  try{let decoded:AudioBuffer;
    try{decoded=await context.decodeAudioData(await file.arrayBuffer());}catch{throw new Error('Aucune piste audio lisible. Essayez un fichier MP3, WAV ou M4A, ou une vidéo contenant une piste audio compatible.');}
    if(decoded.duration<.5||decoded.duration>MUSIC_LIMITS.durationMs/1000)throw new Error('Choisissez une musique de 0,5 seconde à 5 minutes.');
    const samples=Math.floor(decoded.duration*24000),offline=new OfflineAudioContext(1,samples,24000),source=offline.createBufferSource();
    source.buffer=decoded;source.connect(offline.destination);source.start();
    const normalized=await offline.startRendering(),pcm=normalized.getChannelData(0),bytes=new ArrayBuffer(44+pcm.length*2),view=new DataView(bytes);
    const tag=(offset:number,value:string)=>{for(let i=0;i<value.length;i++)view.setUint8(offset+i,value.charCodeAt(i));};
    tag(0,'RIFF');view.setUint32(4,bytes.byteLength-8,true);tag(8,'WAVE');tag(12,'fmt ');view.setUint32(16,16,true);
    view.setUint16(20,1,true);view.setUint16(22,1,true);view.setUint32(24,24000,true);view.setUint32(28,48000,true);
    view.setUint16(32,2,true);view.setUint16(34,16,true);tag(36,'data');view.setUint32(40,pcm.length*2,true);
    for(let i=0;i<pcm.length;i++)view.setInt16(44+i*2,Math.round(Math.max(-1,Math.min(1,pcm[i]))*32767),true);
    return new Blob([bytes],{type:'audio/wav'});
  }finally{await context.close();}
}
