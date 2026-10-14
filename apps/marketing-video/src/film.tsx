import React from 'react';
import {AbsoluteFill,Audio,Sequence,interpolate,staticFile,useCurrentFrame} from 'remotion';
import campaign from '../campaigns/2026-10-launch.json';
import {C,Fonts,ui} from './design';
import {AnimationScene,EditorScene,ImportScene,SharingScene,ShowcaseScene,SignatureScene,VoiceScene} from './scenes';

export const scenes=[ImportScene,AnimationScene,VoiceScene,EditorScene,ShowcaseScene,SharingScene,SignatureScene];
function SceneFade({children,duration,first=false}:{children:React.ReactNode;duration:number;first?:boolean}){
 const f=useCurrentFrame();
 const opacity=first?1:interpolate(f,[0,12],[0,1],{extrapolateLeft:'clamp',extrapolateRight:'clamp'});
 return <AbsoluteFill style={{opacity,overflow:'hidden'}}>{children}</AbsoluteFill>;
}
export const BienVuMarketing=()=>{
 const f=useCurrentFrame();
 return <AbsoluteFill style={{fontFamily:ui,background:C.paper}}><Fonts/>
  {campaign.scenes.map((s,i)=>{const Component=scenes[i],start=s.start*30,duration=(s.end-s.start)*30;return <Sequence key={s.id} name={s.id} from={start} durationInFrames={duration+(i<6?12:0)} premountFor={30}><SceneFade duration={duration} first={i===0}><Component/></SceneFade></Sequence>;})}
  <Audio src={staticFile('audio/bienvu-momentum.wav')} volume={.86}/>
  {f<960&&<div style={{position:'absolute',left:86,right:86,bottom:41,height:3,background:'rgba(109,128,100,.18)'}}><div style={{width:`${f/960*100}%`,height:'100%',background:f>=180&&f<300?'#ffffff99':C.green,opacity:.6}}/></div>}
 </AbsoluteFill>;
};
