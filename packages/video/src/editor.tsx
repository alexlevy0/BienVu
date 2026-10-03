import React from 'react';
import {AbsoluteFill,Audio,Img,OffthreadVideo,Freeze,Sequence,useCurrentFrame} from 'remotion';
import {editorClipStarts,editorLayerStyle,editorPhotoMotion,editorCaptionStyle,editorMusicGain,type VideoManifest,type EditorCamera} from '@bienvu/contracts';
import {subtitleGroups} from './layout';

function EditorPhoto({m,media,slot,index,duration,camera}:{m:VideoManifest;media:Record<string,string>;slot:number;index:number;duration:number;camera?:EditorCamera}){
  const frame=useCurrentFrame(),photo=m.photos[slot],animation=m.photoAnimations?.find(a=>a.photoAssetId===photo.id),
    motion=editorPhotoMotion(frame,duration,index,m.photoMotion!==false,camera),fade=m.photoTransition==='cut'||index===0?1:Math.min(1,frame/12);
  return <AbsoluteFill style={{opacity:fade,overflow:'hidden'}}>{animation?<Freeze frame={Math.min(frame,149)}>
    <OffthreadVideo src={media[animation.asset.id]} muted style={{width:'100%',height:'100%',objectFit:'cover'}}/>
    </Freeze>:<Img src={media[photo.id]} style={{width:'100%',height:'100%',objectFit:'cover',...motion}}/>}</AbsoluteFill>;
}
function EditorSpeech({m,media,index}:{m:VideoManifest;media:Record<string,string>;index:number}){
  const frame=useCurrentFrame(),scene=m.scenes[index],audio=m.audio.find(a=>a.id===scene.audioAssetId),
    voiceFrames=Math.ceil((audio?.durationMs??0)*30/1000),groups=subtitleGroups(scene.narrationText,65),total=groups.reduce((n,g)=>n+g.length,0);
  let threshold=0;
  const line=groups.find(g=>{threshold+=g.length/total*voiceFrames;return frame<threshold;})??groups.at(-1);
  return <>{audio&&<Audio src={media[audio.id]} volume={m.editor!.voiceVolume*(m.editor!.audioMix?.normalize?audio.normalizationGain??1:1)}/>}
    {m.editor!.textsVisible&&m.subtitlesEnabled!==false&&frame<voiceFrames&&<div data-bienvu-subtitle="true" style={editorCaptionStyle(m.width)}>{line}</div>}</>;
}
export function EditorFilm({manifest:m,media}:{manifest:VideoManifest;media:Record<string,string>}){
  const doc=m.editor!,frame=useCurrentFrame(),total=doc.durationSeconds*30;let at=0;
  const music=doc.music&&m.music?{...doc.music,asset:m.music.asset}:null,
    musicFrames=music?Math.min(total-music.startFrame,Math.floor(music.durationMs*30/1000)-music.trimFromFrame):0;
  let speechAt=0;const intervals=m.scenes.map(scene=>{const startFrame=speechAt;speechAt+=scene.durationFrames;return {startFrame,durationMs:m.audio.find(a=>a.id===scene.audioAssetId)?.durationMs??0};});
  return <AbsoluteFill style={{background:'#151b16',overflow:'hidden'}}>
    {doc.photosVisible&&editorClipStarts(doc).map((clip,index)=><Sequence key={clip.id} from={clip.startFrame}
      durationInFrames={Math.min(total-clip.startFrame,clip.durationFrames+(m.photoTransition==='cut'?0:12))} premountFor={30}>
      <EditorPhoto m={m} media={media} slot={clip.photoSlot} index={index} duration={clip.durationFrames} camera={clip.camera}/>
    </Sequence>)}
    <AbsoluteFill style={{background:'linear-gradient(180deg,rgba(0,0,0,.15),transparent 35%,rgba(0,0,0,.42))'}}/>
    {doc.textsVisible&&doc.layers.filter(l=>frame>=l.startFrame&&frame<l.startFrame+l.durationFrames).map(layer=><div key={layer.id}
      data-editor-layer={layer.id} style={editorLayerStyle(layer,frame)}>{layer.kind==='logo'?m.logo&&<Img src={media[m.logo.id]}
        style={{display:'block',width:'100%',maxHeight:m.height*.12,objectFit:'contain'}}/>:layer.text}</div>)}
    {m.voiceEnabled!==false&&m.scenes.map((scene,index)=>{const from=at;at+=scene.durationFrames;return <Sequence key={scene.id}
      from={from} durationInFrames={scene.durationFrames} premountFor={30}><EditorSpeech m={m} media={media} index={index}/></Sequence>;})}
    {music&&music.volume>0&&musicFrames>0&&<Sequence from={music.startFrame} durationInFrames={musicFrames} premountFor={30}>
      <Audio src={media[music.asset.id]} startFrom={music.trimFromFrame} volume={f=>editorMusicGain({...doc,music:{...music,normalizationGain:music.asset.normalizationGain??music.normalizationGain}},music.startFrame+f,intervals)}/>
    </Sequence>}
    {m.rights.watermarked&&<div style={{position:'absolute',top:'45%',left:'15%',width:'70%',textAlign:'center',fontSize:42,color:'#fff',background:'#132a23d9',padding:24,
      transform:'rotate(-14deg)'}}>BIENVU · VIDÉO D’ESSAI</div>}
  </AbsoluteFill>;
}
