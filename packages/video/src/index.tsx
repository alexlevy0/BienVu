import React from 'react';
import {AbsoluteFill, Audio, Composition, Img, Sequence, interpolate, registerRoot, staticFile, useCurrentFrame} from 'remotion';
import type {VideoFixture} from '@bienvu/contracts';
import {ListingFilm, type ListingVideoProps} from './listing';

const defaults: VideoFixture = {
  schemaVersion:1, kind:'synthetic-fixture', fps:30, width:1080, height:1920, durationSeconds:6,
  watermarked:true, audio:'tone.wav', scenes:[
    {image:'room-1.png',caption:'Des images de recette, entièrement synthétiques.'},
    {image:'room-2.png',caption:'Trois séquences pour vérifier le mouvement et la lisibilité.'},
    {image:'room-3.png',caption:'BienVu · Démonstration technique du sprint 00.'},
  ],
};
function Scene({image, caption, frames}: {image:string; caption:string; frames:number}) {
  const f = useCurrentFrame();
  return <AbsoluteFill>
    <Img src={staticFile(image)} style={{width:'100%',height:'100%',objectFit:'cover',transform:`scale(${interpolate(f,[0,frames],[1,1.06],{extrapolateRight:'clamp'})})`}}/>
    <AbsoluteFill style={{background:'linear-gradient(180deg,rgba(13,39,36,.25),transparent 35%,rgba(13,39,36,.9))'}}/>
    <div style={{position:'absolute',left:76,right:76,bottom:220,fontSize:54,lineHeight:1.25,color:'#fff',fontWeight:600}}>{caption}</div>
  </AbsoluteFill>;
}
function Film(props: VideoFixture) {
  const frames = props.durationSeconds * props.fps / props.scenes.length;
  return <AbsoluteFill style={{fontFamily:'Arial, sans-serif',background:'#193c34'}}>
    {props.scenes.map((scene,i)=><Sequence key={scene.image} from={i*frames} durationInFrames={frames}><Scene {...scene} frames={frames}/></Sequence>)}
    <Audio src={staticFile(props.audio)} volume={0.65}/>
    <div style={{position:'absolute',top:90,left:76,color:'#fff',fontSize:60,fontWeight:800}}>BienVu ↗</div>
    <div style={{position:'absolute',top:188,left:76,color:'#fff',fontSize:25,letterSpacing:4}}>RECETTE SYNTHÉTIQUE</div>
    <div style={{position:'absolute',top:830,left:130,right:130,transform:'rotate(-16deg)',border:'3px solid #ffffff80',padding:24,textAlign:'center',color:'#ffffffb0',fontWeight:800,fontSize:44}}>DÉMONSTRATION · BIENVU</div>
    <div style={{position:'absolute',bottom:105,left:76,color:'#d7e9db',fontSize:25}}>Images synthétiques · Signal audio de test · Aucune annonce réelle</div>
  </AbsoluteFill>;
}
const Root = () => <>
  <Composition id="BienVuProbe" component={Film} width={1080} height={1920} fps={30} durationInFrames={180} defaultProps={defaults} calculateMetadata={({props})=>({durationInFrames:props.durationSeconds*props.fps})}/>
  <Composition id="BienVuListing" component={ListingFilm} width={1080} height={1920} fps={30} durationInFrames={600}
    defaultProps={{manifest:null,media:{},logoBackground:'#ffffff',fontUrl:staticFile('video-font.woff2'),displayFontUrl:staticFile('video-display.ttf')}}
    calculateMetadata={({props}: {props: ListingVideoProps}) => ({durationInFrames:props.manifest?.scenes.reduce((n,s)=>n+s.durationFrames,0) ?? 600})}/>
</>;
registerRoot(Root);
