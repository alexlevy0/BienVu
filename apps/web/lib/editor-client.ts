import {publicErrors,rebalanceEditorClips,type EditorDocument,type PublicErrorCode} from '@bienvu/contracts';
export async function editorResponse<T=unknown>(response:Response):Promise<T>{
  const body=await response.json() as {error?:{code?:PublicErrorCode}};
  if(!response.ok){const code=body.error?.code as PublicErrorCode|undefined;
    const error=new Error(code&&code in publicErrors?publicErrors[code][1]:'Cette action a échoué. Réessayez.') as Error&{code?:string};
    error.code=code;throw error;}
  return body as T;
}
export function distributeEditorClips(doc:EditorDocument,clips:EditorDocument['clips']):EditorDocument{
  return {...doc,clips:rebalanceEditorClips(doc.durationSeconds*30,clips)};
}
// Decode locally, retain at most 40 seconds, then upload a bounded PCM WAV.
// The server measures samples independently and never trusts browser metadata.
export async function editorMusicWav(file:File):Promise<Blob>{
  if(file.size>10*1024*1024)throw new Error('La musique doit peser moins de 10 Mo.');
  const context=new AudioContext();
  try{const decoded=await context.decodeAudioData(await file.arrayBuffer());
    if(decoded.duration<.5||decoded.duration>180)throw new Error('Choisissez une musique de 0,5 seconde à 3 minutes ; les 40 premières secondes seront importées.');
    const samples=Math.floor(Math.min(40,decoded.duration)*24000),offline=new OfflineAudioContext(1,samples,24000),source=offline.createBufferSource();
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
