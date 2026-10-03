import type {EditorDocument} from './editor';
import type {EditorVoicePreview} from './editor-voice';
export const defaultEditorMix={ducking:true,normalize:true,duckLevel:.25,fadeInFrames:15,fadeOutFrames:30} as const;
export function audioNormalizationGain(rmsDbfs:number,peak:number,target=-20){
  if(!Number.isFinite(rmsDbfs)||!Number.isFinite(peak)||peak<=0)return 1;
  return Math.max(.1,Math.min(4,10**((target-rmsDbfs)/20),.8/peak));
}
export function editorMusicFrames(doc:EditorDocument){
  const music=doc.music;if(!music)return 0;
  return Math.min(doc.durationSeconds*30-music.startFrame,music.durationFrames??1200,
    music.loop?1200:Math.floor(music.durationMs*30/1000)-music.trimFromFrame);
}
// Loop only the selected source excerpt, never alter playback speed.
export function editorMusicSourceFrame(doc:EditorDocument,frame:number){
  const music=doc.music,at=music?frame-music.startFrame:-1;
  if(!music||at<0||at>=editorMusicFrames(doc))return null;
  const available=Math.floor(music.durationMs*30/1000)-music.trimFromFrame;
  return music.trimFromFrame+(music.loop?at%available:at);
}
export function fitEditorMusic(doc:EditorDocument):EditorDocument{
  if(!doc.music)return doc;
  return {...doc,music:{...doc.music,startFrame:0,durationFrames:doc.durationSeconds*30,
    loop:Math.floor(doc.music.durationMs*30/1000)-doc.music.trimFromFrame<doc.durationSeconds*30}};
}
// Aggregate the actual source peaks into the visible, trimmed (or repeated) clip.
export function editorMusicWaveform(doc:EditorDocument,count=128){
  const music=doc.music,peaks=music?.waveform;if(!music||!peaks)return [];
  const source=Math.floor(music.durationMs*30/1000),length=editorMusicFrames(doc),available=source-music.trimFromFrame;
  return Array.from({length:count},(_,i)=>{let peak=0;
    const from=Math.floor(i*length/count),to=Math.max(from+1,Math.ceil((i+1)*length/count));
    for(let f=from;f<to;f++){const position=music.trimFromFrame+(music.loop?f%available:f);
      const first=Math.floor(position/source*peaks.length),last=Math.ceil((position+1)/source*peaks.length);
      for(let j=first;j<last;j++)peak=Math.max(peak,peaks[Math.min(peaks.length-1,j)]??0);}
    return peak;
  });
}
export function editorMusicGain(doc:EditorDocument,frame:number,intervals:{startFrame:number;durationMs:number}[]=[]){
  const music=doc.music;if(!music)return 0;const length=editorMusicFrames(doc),at=frame-music.startFrame;
  if(at<0||at>=length)return 0;
  const mix=doc.audioMix;const fadeIn=mix?.fadeInFrames??12,fadeOut=mix?.fadeOutFrames??18,
    fade=Math.max(0,Math.min(1,fadeIn?at/fadeIn:1,fadeOut?(length-at)/fadeOut:1));
  let duck=1;
  if(doc.voiceEnabled&&mix?.ducking)for(const clip of intervals){const end=clip.startFrame+Math.ceil(clip.durationMs*30/1000),distance=frame<clip.startFrame?clip.startFrame-frame:frame>=end?frame-end:0;
    const blend=frame<clip.startFrame?Math.max(0,1-distance/6):Math.max(0,1-distance/12);duck=Math.min(duck,1-(1-mix.duckLevel)*blend);}
  return music.volume*fade*duck*(mix?.normalize?music.normalizationGain??1:1);
}
export type EditorQualityIssue={id:string;level:'warning'|'error';kind:'photo'|'text'|'audio'|'project';targetId?:string;message:string};
export function editorQuality(doc:EditorDocument,photos:{sourceOrder:number;width:number;height:number}[],voice?:EditorVoicePreview|null,narration?:string[]){
  const issues:EditorQualityIssue[]=[],width=doc.aspectRatio==='16:9'?1920:1080,height=doc.aspectRatio==='16:9'?1080:1920;
  if(new Set(doc.clips.map(c=>c.photoSlot)).size<3)issues.push({id:'photos',level:'error',kind:'project',message:'Ajoutez au moins trois photos différentes.'});
  for(const clip of doc.clips){const photo=photos.find(p=>p.sourceOrder===clip.photoSlot);
    if(!photo)issues.push({id:clip.id,level:'error',kind:'photo',targetId:clip.id,message:'Ce plan ne possède plus sa photo.'});
    else if(photo.width<640||photo.height<640)issues.push({id:clip.id,level:'warning',kind:'photo',targetId:clip.id,message:'Cette photo est petite : vérifiez sa netteté dans le cadrage choisi.'});}
  if(doc.textsVisible)for(const layer of doc.layers){if(layer.kind!=='text'||!layer.text.trim())continue;
    const columns=Math.max(1,Math.floor(width*layer.width/100/(layer.fontSize*.52))),lines=layer.text.split('\n').reduce((n,t)=>n+Math.max(1,Math.ceil(t.length/columns)),0),h=lines*layer.fontSize*1.15+(layer.background?32:0),w=width*layer.width/100;
    if(layer.x*width/100-w/2<0||layer.x*width/100+w/2>width||layer.y*height/100-h/2<0||layer.y*height/100+h/2>height)
      issues.push({id:layer.id,level:'warning',kind:'text',targetId:layer.id,message:'Ce texte risque de dépasser le cadre. Vérifiez sa taille et sa position.'});}
  if(doc.voiceEnabled&&!voice&&narration?.length){const words=narration.join(' ').trim().split(/\s+/).length;
    if(words>doc.durationSeconds*2.6)issues.push({id:'narration',level:'warning',kind:'audio',message:'La narration risque d’être trop longue. Préparez son aperçu ou raccourcissez-la.'});}
  if(doc.voiceEnabled&&doc.music&&doc.music.volume>.45&&!doc.audioMix?.ducking)issues.push({id:'music',level:'warning',kind:'audio',message:'La musique peut couvrir la voix. Activez la baisse automatique ou réduisez son volume.'});
  if(doc.voiceEnabled&&doc.voiceVolume<.2)issues.push({id:'volume',level:'warning',kind:'audio',message:'Le volume de la voix est faible : vérifiez l’écoute avant export.'});
  return issues;
}
