'use client';
import {useEffect,useMemo,useState,type CSSProperties} from 'react';
import {VerticalBrand,EditorialPhotoScene,StyledPhotoScene,CinematicPhotoScene,HorizontalPhotoScene,PreviewLayers,cameraMotion,VIDEO_SAFE,fitFont,type SceneLayerProps} from '@bienvu/presentation';
import {VIDEO_LAYERS,type AgencyBrand,type AvatarLook,type VideoCustomization,type VideoDuration,type VideoAspectRatio,type VideoMap} from '@bienvu/contracts';
import {customizationPreview,previewFrame} from '../lib/customizer-preview';
import type {ManualDraftFields} from '../lib/listing-draft';
import {AvatarPoster} from './avatar-controls';
import {MapScenePreview} from './video-map';

type Props={settings:VideoCustomization;fields:ManualDraftFields;agencyName:string;duration:VideoDuration;aspectRatio:VideoAspectRatio;narration:string[];subtitles:boolean;voice:boolean;photos:{id:string;preview:string;slot?:number}[];brand?:AgencyBrand;map?:VideoMap;automaticMap:boolean;mapAt:number|null;frame:number;look?:AvatarLook;width:number};
export function CustomizerFilm(p:Props){
 const [fontsReady,setFontsReady]=useState(false);
 useEffect(()=>{let alive=true;const faces=[new FontFace('BienVu Video',"url('/fonts/inter-tight.woff2')",{weight:'100 900'}),new FontFace('BienVu Display',"url('/fonts/anton-regular.ttf')",{weight:'400'})];
  void Promise.all(faces.map(face=>face.load())).then(loaded=>{if(alive){loaded.forEach(face=>document.fonts.add(face));setFontsReady(true);}}).catch(()=>{});return()=>{alive=false;};},[]);
 const model=useMemo(()=>customizationPreview(p),[p.settings,p.fields,p.agencyName,p.duration,p.aspectRatio,p.narration,p.subtitles,p.voice,p.photos,p.map,p.brand]);
 const {manifest:m,timeline,media}=model,{at,sceneIndex,sceneFrame,photoIndex}=previewFrame(model,p.frame),cinema=p.settings.style==='cinematic';
 const Scene=p.aspectRatio==='16:9'?HorizontalPhotoScene:cinema?CinematicPhotoScene:p.settings.style==='minimal'?StyledPhotoScene:EditorialPhotoScene;
 return <><div className="customizer-native-film" data-fonts-ready={fontsReady} style={{position:'absolute',left:0,top:0,width:m.width,height:m.height,transform:`scale(${p.width/m.width})`,transformOrigin:'top left',fontFamily:'BienVu Video, sans-serif',color:'#fff',overflow:'hidden',isolation:'isolate'} as CSSProperties}>
  {[photoIndex-1,photoIndex].filter(index=>index>=0&&timeline[index]).map(index=>{const photo=timeline[index],elapsed=at-photo.start,motion=cameraMotion(elapsed,photo.durationFrames,index,p.settings.photoMotion,cinema);return <div key={photo.photoAssetId} style={{position:'absolute',inset:0,opacity:index===photoIndex&&index>0&&p.settings.transition==='fade'?Math.max(0,Math.min(1,elapsed/12)):1}}><img src={media[photo.photoAssetId]} alt="" draggable={false} style={{width:'100%',height:'100%',objectFit:'cover',scale:motion.scale,translate:`${motion.x}px ${motion.y}px`}}/></div>;})}
  {p.photos.length>0&&p.mapAt===null&&<Scene manifest={m} media={media} index={sceneIndex} frame={sceneFrame} Layers={PreviewLayers}/>}
  {p.mapAt===null&&p.aspectRatio==='9:16'&&<VerticalBrand manifest={m} frame={at} media={media} logoBackground="#fff"/>}
  {p.map&&p.mapAt!==null&&<MapScenePreview map={p.map} automatic={p.automaticMap} aspectRatio={p.aspectRatio} frame={p.mapAt} primaryColor={p.settings.primaryColor} secondaryColor={p.settings.secondaryColor} agencyName={p.agencyName} contact={m.contact==='none'?undefined:m.brand[m.contact]??undefined}/>}
  <AvatarPoster avatar={p.settings.avatar} look={p.look} frame={at} total={p.duration*30} width={m.width} height={m.height}/>
 </div></>;
}
