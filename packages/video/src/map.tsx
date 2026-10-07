import React from 'react';
import {AbsoluteFill,Img,useCurrentFrame} from 'remotion';
import {mapFrame,mapInk,mapRasterScale,mapRasterOpacity,mapZoomAt,editorCaptionStyle,type VideoManifest} from '@bienvu/contracts';
import {subtitleGroups} from './layout';
import {MapBuildingsScene} from './map-buildings';

export function MapOverlay({manifest:m,media,moduleUrl,workerUrl}:{manifest:VideoManifest;media:Record<string,string>;moduleUrl?:string;workerUrl?:string}){
  const globalFrame=useCurrentFrame(),total=m.scenes.reduce((n,s)=>n+s.durationFrames,0),frame=mapFrame(m.map?.settings,total,globalFrame);
  if(!m.map||frame===null)return null;
  const settings=m.map.settings,location=settings.location,approximate=location.precision==='approximate',ink=mapInk(m.brand.primaryColor,m.brand.secondaryColor);
  let at=0,caption:string|undefined;
  if(m.voiceEnabled!==false&&m.subtitlesEnabled!==false&&m.editor?.textsVisible!==false){
    const scene=m.scenes.find(s=>{const start=at;at+=s.durationFrames;return globalFrame>=start&&globalFrame<at;});
    if(scene){const elapsed=globalFrame-(at-scene.durationFrames),audio=m.audio.find(a=>a.id===scene.audioAssetId),voiceFrames=Math.ceil((audio?.durationMs??0)*30/1000);
      if(elapsed<voiceFrames){const groups=subtitleGroups(scene.narrationText,65),sum=groups.reduce((n,s)=>n+s.length,0);let threshold=0;
        caption=groups.find(g=>{threshold+=g.length/Math.max(1,sum)*voiceFrames;return elapsed<threshold;})??groups.at(-1);}}
  }
  return <AbsoluteFill data-bienvu-map="true" style={{overflow:'hidden',background:m.brand.primaryColor,color:ink,fontFamily:'"BienVu Video", Arial, sans-serif'}}>
    {settings.view==='buildings-3d'?<MapBuildingsScene manifest={m} media={media} frame={frame} moduleUrl={moduleUrl} workerUrl={workerUrl}/>:
      [{asset:m.map.asset,zoom:m.map.rasterZoom},...m.map.details??[]].map((layer,i)=><Img key={layer.asset.id} src={media[layer.asset.id]} style={{position:'absolute',left:'50%',top:'50%',width:m.width*2,height:m.height*2,
        opacity:i?mapRasterOpacity(settings.view,mapZoomAt(settings,frame,settings.durationSeconds*30,location.precision),layer.zoom!):1,
        transform:`translate(-50%,-50%) scale(${mapRasterScale(settings,frame,layer.zoom)})`}}/>)}
    <AbsoluteFill style={{background:'linear-gradient(180deg,#ffffff55,transparent 30%,transparent 60%,#ffffff99)'}}/>
    {m.logo&&<Img src={media[m.logo.id]} style={{position:'absolute',right:'6%',top:'7%',width:80,height:80,objectFit:'contain',background:'#fff',borderRadius:12}}/>}
    {approximate&&<div style={{position:'absolute',left:'50%',top:'50%',width:220,height:220,transform:'translate(-50%,-50%)',borderRadius:'50%',
      background:m.brand.primaryColor,opacity:.45,border:`5px solid ${ink}`}}/>}
    <div style={{position:'absolute',left:'50%',top:'50%',width:36,height:36,transform:'translate(-50%,-50%)',background:ink,border:'6px solid white',borderRadius:'50%',boxShadow:'0 5px 16px #0004'}}/>
    <div style={{position:'absolute',left:'6%',right:'6%',bottom:'7%',padding:'30px 36px',borderRadius:24,background:'#fffffff0',borderLeft:`8px solid ${ink}`,overflowWrap:'anywhere'}}>
      <div style={{fontSize:28,marginBottom:14}}>{settings.position==='end'?'Retrouvons-nous ici':'Découvrez le quartier'}</div>
      <div style={{fontFamily:'"BienVu Serif", Georgia, serif',fontSize:m.width===1080?66:60,fontWeight:600,lineHeight:1.12}}>{location.label}</div>
      <div style={{fontSize:30,marginTop:22}}>{m.brand.name}</div>
      {settings.position==='end'&&m.contact!=='none'&&<div style={{fontSize:30,marginTop:12}}>{m.brand[m.contact]}</div>}
    </div>
    {caption&&<div data-bienvu-subtitle="true" style={{...editorCaptionStyle(m.width),top:'27%'}}>{caption}</div>}
  </AbsoluteFill>;
}
