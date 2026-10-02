import React from 'react';
import {AbsoluteFill,Audio,Img,interpolate,useCurrentFrame} from 'remotion';
import type {VideoManifest} from '@bienvu/contracts';
import {contrastInk,displayArea,displayLocation,displayPrice,displayRooms,fitDisplayFont,fitFont,subtitleGroups} from './layout';

// Full-HD landscape has its own safe area. Portrait coordinates are never
// scaled or cropped: only the original photos/clips fill the new canvas.
export function HorizontalPhotoScene({manifest:m,media,logoBackground,index}:{manifest:VideoManifest;media:Record<string,string>;logoBackground:string;index:number}){
  const frame=useCurrentFrame(),scene=m.scenes[index],p=m.presentation!,contact=scene.kind==='contact';
  const cinematic=m.visualStyle==='cinematic',minimal=m.visualStyle==='minimal';
  const audio=m.audio.find(a=>a.id===scene.audioAssetId),voiceFrames=Math.ceil((audio?.durationMs??scene.durationFrames*1000/30)*30/1000);
  const groups=subtitleGroups(scene.narrationText,95),chars=groups.reduce((n,g)=>n+g.length,0);let threshold=0;
  const subtitle=groups.find(g=>{threshold+=g.length/chars*voiceFrames;return frame<threshold;})??groups.at(-1)!;
  const accent=m.brand.primaryColor,panel=m.brand.secondaryColor,ink=contrastInk(panel);
  const facts=[p.areaM2!==null?displayArea(p.areaM2):'',p.rooms!==null?displayRooms(p.rooms):''].filter(Boolean).join(' · ');
  const price=p.priceCents!==null?displayPrice(p.priceCents,p.transaction==='rent'):'';
  const label=contact?(m.contact==='none'?'À découvrir':'Votre contact'):p.transaction==='sale'?'À vendre':'À louer';
  const heading=scene.kind==='area'&&p.areaM2!==null?displayArea(p.areaM2):scene.kind==='rooms'&&p.rooms!==null?displayRooms(p.rooms)
    :scene.kind==='price'&&price?price:scene.kind==='gallery'?'En images':displayLocation(p.locality);
  const entrance=interpolate(frame,[8,28],[0,1],{extrapolateLeft:'clamp',extrapolateRight:'clamp'});
  return <AbsoluteFill data-bienvu-style={m.visualStyle??'editorial'} data-bienvu-orientation="horizontal" style={{color:'#fff'}}>
    {!m.photoTimeline&&<Img src={media[scene.photoAssetId]} style={{width:'100%',height:'100%',objectFit:'cover'}}/>}
    {(!cinematic||contact)&&<AbsoluteFill style={{opacity:cinematic?entrance:1,
      background:cinematic?`linear-gradient(180deg,transparent 28%,${panel}99 52%,${panel}f5 76%)`:'linear-gradient(180deg,#0005 0%,transparent 38%,#000b 100%)'}}/>}
    {!cinematic&&!minimal&&<>
      <div style={{position:'absolute',top:86,left:96,padding:'12px 24px',background:accent,color:contrastInk(accent),fontSize:30,letterSpacing:6,fontWeight:750,textTransform:'uppercase'}}>{label}</div>
      <div style={{position:'absolute',left:96,top:172,width:1250,fontFamily:'BienVu Display, Impact, sans-serif',
        fontSize:fitDisplayFont(heading,1250,210,175,45),lineHeight:.98,overflowWrap:'anywhere',textShadow:'0 4px 24px #0008'}}>{contact?'PARLONS-EN':heading}</div>
    </>}
    {(contact||!cinematic)&&<div data-bienvu-cinema-endcard={cinematic&&contact?'true':undefined} style={{position:'absolute',left:96,right:96,bottom:80,
      opacity:cinematic?entrance:1,display:'flex',alignItems:'flex-end',gap:80,color:cinematic||minimal?ink:'#fff',
      padding:minimal?'32px 40px':undefined,background:minimal?panel:undefined,borderTop:minimal?`6px solid ${accent}`:undefined}}>
      <div style={{flex:1,minWidth:0,maxWidth:contact?1000:1200}}>
        {cinematic&&<div style={{fontSize:25,letterSpacing:5,textTransform:'uppercase',marginBottom:14}}>{label}</div>}
        <div style={{fontFamily:cinematic?'Georgia, DejaVu Serif, serif':'BienVu Video, sans-serif',
          fontSize:fitFont(cinematic?displayLocation(p.locality):p.title,1000,140,cinematic?82:58,28,cinematic?'Georgia':'BienVu Video',cinematic?400:650,1.12),
          lineHeight:1.12,fontWeight:cinematic?400:650,overflowWrap:'anywhere'}}>{cinematic?displayLocation(p.locality):p.title}</div>
        {cinematic&&<div style={{marginTop:16,fontSize:fitFont(p.title,1000,95,42,26),lineHeight:1.2,overflowWrap:'anywhere'}}>{p.title}</div>}
        {facts&&<div style={{marginTop:18,fontSize:36,fontWeight:600}}>{facts}</div>}
        {price&&<div style={{marginTop:12,fontFamily:!cinematic&&!minimal?'BienVu Display, Impact, sans-serif':undefined,
          fontSize:!cinematic&&!minimal?fitDisplayFont(price,1000,130,110,38):58,lineHeight:1.15,fontWeight:!cinematic&&!minimal?400:650}}>{price}</div>}
      </div>
      {contact&&<div style={{width:550,flexShrink:0,borderLeft:`4px solid ${accent}`,paddingLeft:38}}>
        {m.logo&&<Img src={media[m.logo.id]} style={{width:90,height:90,objectFit:'contain',padding:10,background:logoBackground,marginBottom:14}}/>}
        <div style={{fontSize:fitFont(m.brand.name,510,145,52,25),fontWeight:650,lineHeight:1.15,overflowWrap:'anywhere'}}>{m.brand.name}</div>
        {m.contact!=='none'&&<div style={{marginTop:18,fontSize:fitFont(m.brand[m.contact]!,510,140,36,22),lineHeight:1.2,overflowWrap:'anywhere'}}>{m.brand[m.contact]}</div>}
      </div>}
    </div>}
    {m.subtitlesEnabled!==false&&<div data-bienvu-subtitle="true" style={{position:'absolute',left:384,right:384,
      ...(contact?{top:cinematic?80:400}:{bottom:cinematic?80:480}),background:'#0c110ed1',color:'#fff',padding:'16px 26px',
      fontSize:fitFont(subtitle,1100,135,43,28),lineHeight:1.25,textAlign:'center',overflowWrap:'anywhere'}}>{subtitle}</div>}
    {!contact&&(m.logo||m.brand.name)&&<div style={{position:'absolute',top:64,right:96,maxWidth:330,display:'flex',alignItems:'center',gap:12,
      background:'#111b',padding:'12px 18px',borderRadius:10,fontSize:25,lineHeight:1.2,overflowWrap:'anywhere'}}>
      {m.logo&&<Img src={media[m.logo.id]} style={{width:54,height:54,objectFit:'contain',background:logoBackground}}/>}{m.brand.name}</div>}
    {m.rights.watermarked&&<div style={{position:'absolute',left:600,top:460,transform:'rotate(-9deg)',padding:'20px 32px',background:'#132a23d9',
      border:'2px solid #ffffffa0',borderRadius:12,fontSize:36,fontWeight:750}}>BIENVU · VIDÉO D’ESSAI</div>}
    {m.voiceEnabled!==false&&audio&&<Audio src={media[audio.id]} volume={1}/>}
  </AbsoluteFill>;
}
