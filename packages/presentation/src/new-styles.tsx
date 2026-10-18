import React from 'react';
import type {VideoManifest,VideoStyle} from '@bienvu/contracts';
import type {PresentationProps} from './index';
import {contrastInk,displayArea,displayLocation,displayPrice,displayRooms,fitFont,subtitleGroups} from './layout';
import {cameraMotion} from './camera-motion';

export const designedStyles=['signature','mosaic','dynamic'] as const;
export function isDesignedStyle(style:VideoStyle|undefined){return designedStyles.some(id=>id===style);}
export function photoStage(style:VideoStyle|undefined,width:number,height:number){
 const horizontal=width>height;
 if(style==='signature')return horizontal?{left:72,top:188,width:1110,height:760,borderRadius:12}:{left:64,top:370,width:952,height:840,borderRadius:12};
 if(style==='mosaic')return horizontal?{left:72,top:200,width:1150,height:650,borderRadius:18}:{left:56,top:340,width:612,height:940,borderRadius:18};
 return null;
}
export function canvasColor(style:VideoStyle|undefined){return style==='signature'?'#f5f1e9':style==='mosaic'?'#131e1b':'#151b16';}
export function galleryMotion(frame:number,duration:number,index:number,enabled:boolean,style:VideoStyle|undefined,width:number,height:number){
 const motion=cameraMotion(frame,duration,index,enabled,style==='cinematic'),stage=photoStage(style,width,height);
 return stage?{...motion,x:motion.x*stage.width/width,y:motion.y*stage.height/height}:motion;
}
export function galleryPhotoIndex(m:VideoManifest,frame:number){
 let at=m.map?.settings.position==='start'?m.map.settings.durationSeconds*30:0;
 if(!m.photoTimeline)return Math.max(0,m.photos.findIndex(p=>p.id===m.scenes[0]?.photoAssetId));
 for(const [index,photo]of m.photoTimeline.entries()){at+=photo.durationFrames;if(frame<at)return index;}
 return Math.max(0,m.photos.length-1);
}
const ease=(frame:number,delay=0)=>{const t=Math.max(0,Math.min(1,(frame-delay)/22));return 1-(1-t)**3;};
const full={position:'absolute' as const,inset:0};
const PlainImage=({src,style}:{src:string;style?:React.CSSProperties})=><img src={src} alt="" style={style}/>;

// This is the same frame-driven markup in the browser and in Remotion.
export function DesignedPhotoScene({manifest:m,media,index,frame,audio,Image:Img=PlainImage,Layers,logoBackground='#fff'}:PresentationProps){
 const scene=m.scenes[index],p=m.presentation!,contact=scene.kind==='contact',wide=m.width>m.height,style=m.visualStyle!,signature=style==='signature',mosaic=style==='mosaic';
 const accent=m.brand.primaryColor,mosaicHighlight=contrastInk(m.brand.primaryColor)==='#ffffff'?'#e7eee8':m.brand.primaryColor,panel=m.brand.secondaryColor,ink=contrastInk(accent),paper='#f5f1e9',dark='#172a23';
 const globalFrame=m.scenes.slice(0,index).reduce((n,s)=>n+s.durationFrames,0)+frame,photoIndex=galleryPhotoIndex(m,globalFrame),count=m.photos.length;
 const heading=displayLocation(p.locality),price=p.priceCents===null?'':displayPrice(p.priceCents,p.transaction==='rent');
 const facts=[p.areaM2===null?'':displayArea(p.areaM2),p.rooms===null?'':displayRooms(p.rooms)].filter(Boolean);
 const label=contact?(m.contact==='none'?'Pour en savoir plus':'Votre contact'):p.transaction==='rent'?'À louer':'À vendre';
 const title=contact?m.brand.name:p.title,contactText=contact&&m.contact!=='none'?m.brand[m.contact]:null;
 const groups=subtitleGroups(scene.narrationText,wide?95:68),chars=groups.reduce((n,s)=>n+s.length,0),voiceFrames=Math.ceil((m.audio.find(a=>a.id===scene.audioAssetId)?.durationMs??scene.durationFrames*1000/30)*30/1000);let threshold=0;
 const subtitle=groups.find(group=>{threshold+=group.length/Math.max(1,chars)*voiceFrames;return frame<threshold;})??groups.at(-1)??'';
 const stage=photoStage(style,m.width,m.height),move=1-ease(frame),font='BienVu Serif';
 const sideImages=mosaic?[1,2].map((offset)=>m.photos[(photoIndex+offset)%Math.max(1,count)]):[];
 const mainPhoto=m.photos.find(photo=>photo.id===scene.photoAssetId);
 const branding=<div style={{display:'flex',alignItems:'center',gap:16,maxWidth:wide?600:740,minWidth:0}}>{m.logo&&<Img src={media[m.logo.id]} style={{width:signature?54:58,height:signature?54:58,objectFit:'contain',background:logoBackground,borderRadius:signature?0:12}}/>}<span style={{fontSize:fitFont(m.brand.name,wide?490:660,68,29,19),fontWeight:600,lineHeight:1.15,overflowWrap:'anywhere'}}>{m.brand.name}</span></div>;
 return <Layers manifest={m} index={index} frame={frame} audio={audio} data-bienvu-style={style} data-bienvu-orientation={wide?'horizontal':undefined} style={{color:signature?dark:'#fff'}} background={<>
  {!m.photoTimeline&&mainPhoto&&<div style={{position:'absolute',...stage??{inset:0},overflow:'hidden'}}><Img src={media[mainPhoto.id]} style={{width:'100%',height:'100%',objectFit:'cover'}}/></div>}
  {!signature&&!mosaic&&<div style={{...full,background:'linear-gradient(180deg,#06130c88,transparent 40%,#06130c66)'}}/>}
  {sideImages.map((photo,i)=>photo&&<div key={`${photo.id}-${i}`} data-bienvu-mosaic-photo={photo.id} style={{position:'absolute',left:wide?1244:686,top:wide?200+i*336:340+i*482,width:wide?604:338,height:wide?314:458,overflow:'hidden',borderRadius:18,translate:`${move*18}px 0`}}><Img src={media[photo.id]} style={{width:'100%',height:'100%',objectFit:'cover',scale:m.photoMotion===false?1:1.025}}/></div>)}
 </>}>
  {signature?<>
   <div style={{position:'absolute',left:wide?72:88,top:wide?74:128,right:wide?72:160,display:'flex',alignItems:'center',justifyContent:'space-between',gap:24}}>{branding}<span style={{fontSize:wide?23:25,letterSpacing:4,textTransform:'uppercase'}}>{label}</span></div>
   <div style={{position:'absolute',left:wide?72:88,right:wide?72:160,top:wide?153:226,height:2,background:dark,opacity:.22}}/>
   {!wide&&<div style={{position:'absolute',left:88,right:160,top:260,fontFamily:font,fontSize:fitFont(heading,832,95,86,20,font,400,1.05),lineHeight:1.05,overflowWrap:'anywhere'}}>{heading}</div>}
   <div style={{position:'absolute',left:wide?1256:88,top:wide?238:1262,width:wide?540:832,translate:`0 ${move*12}px`}}>
    {wide&&<div style={{fontFamily:font,fontSize:fitFont(heading,540,190,88,22,font,400,1.05),lineHeight:1.05,overflowWrap:'anywhere',marginBottom:40}}>{heading}</div>}
    <div style={{fontSize:fitFont(title,wide?540:832,wide?155:126,wide?46:54,28),fontWeight:550,lineHeight:1.16,overflowWrap:'anywhere'}}>{title}</div>
    {facts.length>0&&<div style={{display:'flex',gap:24,marginTop:wide?28:22,fontSize:wide?31:35,color:'#526354'}}>{facts.map(fact=><span key={fact}>{fact}</span>)}</div>}
    {price&&<div style={{fontFamily:font,fontSize:fitFont(price,wide?540:832,115,wide?70:92,30,font,400,1.1),lineHeight:1.1,marginTop:wide?32:22,overflowWrap:'anywhere'}}>{price}</div>}
    <div style={{width:80,height:4,background:accent,marginTop:wide?36:26,marginBottom:24}}/>
    {contactText&&<div style={{fontSize:fitFont(contactText,wide?540:832,120,wide?32:40,22),lineHeight:1.2,overflowWrap:'anywhere'}}>{contactText}</div>}
    {!contact&&<div style={{fontSize:wide?24:28,letterSpacing:3,textTransform:'uppercase'}}>Une nouvelle adresse.</div>}
   </div>
   <div style={{position:'absolute',left:wide?98:90,top:wide?895:1155,padding:'9px 16px',background:paper,color:dark,fontSize:24,letterSpacing:3,fontVariantNumeric:'tabular-nums'}}>{String(photoIndex+1).padStart(2,'0')} / {String(count).padStart(2,'0')}</div>
  </>:mosaic?<>
   <div style={{position:'absolute',left:wide?76:88,top:wide?76:138,right:wide?76:160,display:'flex',justifyContent:'space-between',alignItems:'center',gap:24}}>{branding}<div style={{fontSize:wide?26:28,color:mosaicHighlight,letterSpacing:4,textTransform:'uppercase'}}>{label}</div></div>
   {!wide&&<div style={{position:'absolute',left:88,top:244,color:'#c4cec8',fontSize:27,letterSpacing:5,textTransform:'uppercase'}}>Les lieux, en images.</div>}
   <div style={{position:'absolute',left:wide?96:88,top:wide?894:1346,right:wide?96:160,display:wide?'flex':'block',justifyContent:'space-between',alignItems:'flex-start',gap:50,translate:`0 ${move*14}px`}}>
    <div style={{flex:1,minWidth:0}}><div style={{fontSize:fitFont(contact?m.brand.name:heading,wide?1000:832,wide?88:130,wide?63:90,18),fontWeight:650,lineHeight:1.05,letterSpacing:-2,overflowWrap:'anywhere'}}>{contact?m.brand.name:heading}</div><div style={{fontSize:fitFont(contactText||p.title,wide?1000:832,wide?85:120,wide?29:40,23),lineHeight:1.2,marginTop:wide?14:22,color:'#ced7d1',overflowWrap:'anywhere'}}>{contactText||p.title}</div></div>
    <div style={{textAlign:wide?'right':'left',maxWidth:wide?680:832,marginTop:wide?0:30}}>{price&&<div style={{fontSize:fitFont(price,wide?680:832,100,wide?58:80,30),fontWeight:650,lineHeight:1.1,color:mosaicHighlight,overflowWrap:'anywhere'}}>{price}</div>}{facts.length>0&&<div style={{fontSize:wide?29:36,marginTop:14,color:'#ced7d1'}}>{facts.join('  ·  ')}</div>}</div>
   </div>
   <div style={{position:'absolute',left:wide?98:82,top:wide?228:368,background:'#111c18d9',border:'1px solid #ffffff50',borderRadius:24,padding:'10px 18px',fontSize:25,fontVariantNumeric:'tabular-nums'}}>{String(photoIndex+1).padStart(2,'0')} <span style={{opacity:.6}}>/ {String(count).padStart(2,'0')}</span></div>
  </>:<>
   <div style={{position:'absolute',left:wide?96:88,top:wide?78:146,right:wide?96:160,display:'flex',alignItems:'center',justifyContent:'space-between',gap:26}}><div style={{background:accent,color:ink,borderRadius:40,padding:'15px 28px',fontSize:wide?26:30,fontWeight:700,textTransform:'uppercase',letterSpacing:3}}>{label}</div><div style={{background:'#0b1913b8',borderRadius:28,padding:'13px 22px'}}>{branding}</div></div>
   <div style={{position:'absolute',left:wide?102:88,top:wide?174:274,right:wide?96:160,fontSize:fitFont(heading,wide?1722:832,90,wide?56:68,18),fontWeight:650,letterSpacing:-1,textShadow:'0 2px 14px #0008',lineHeight:1.1,overflowWrap:'anywhere'}}>{heading}</div>
   <div style={{position:'absolute',left:wide?76:64,top:wide?676:1224,width:wide?1768:952,boxSizing:'border-box',padding:wide?'34px 42px':'38px 40px',borderRadius:wide?38:44,background:accent,color:ink,boxShadow:'0 18px 65px #0003',translate:`0 ${move*36}px`}}>
    <div style={{display:wide?'flex':'block',alignItems:'center',gap:60}}><div style={{flex:1,minWidth:0}}><div style={{fontSize:fitFont(title,wide?970:872,wide?132:170,wide?61:72,30),fontWeight:750,lineHeight:1.05,letterSpacing:-1.5,overflowWrap:'anywhere'}}>{title}</div>
     {facts.length>0&&<div style={{display:'flex',flexWrap:'wrap',gap:12,marginTop:26}}>{facts.map((fact,i)=><span key={fact} style={{background:panel,color:contrastInk(panel),borderRadius:28,padding:'11px 20px',fontSize:wide?29:33,fontWeight:600,translate:`0 ${(1-ease(frame,i*4))*10}px`}}>{fact}</span>)}</div>}</div>
     <div style={{maxWidth:wide?620:872,marginTop:wide?0:24}}>{price&&<div style={{fontSize:fitFont(price,wide?620:872,115,wide?78:104,34),fontWeight:750,lineHeight:1.05,letterSpacing:-2,overflowWrap:'anywhere'}}>{price}</div>}{contactText&&<div style={{fontSize:fitFont(contactText,wide?620:872,100,wide?32:39,22),lineHeight:1.2,marginTop:18,overflowWrap:'anywhere'}}>{contactText}</div>}</div>
    </div>
   </div>
  </>}
  {m.subtitlesEnabled!==false&&subtitle&&<div data-bienvu-subtitle="true" style={{position:'absolute',left:wide?110:108,right:wide?(signature?792:mosaic?792:250):180,top:wide?(signature?748:mosaic?686:514):(signature?1036:mosaic?1092:968),padding:'18px 24px',borderRadius:signature?0:18,background:signature?'#f5f1e9ed':'#0c1814e8',color:signature?dark:'#fff',fontSize:fitFont(subtitle,wide?(signature||mosaic?970:1512):744,140,wide?37:42,27),lineHeight:1.2,overflowWrap:'anywhere',textAlign:signature?'left':'center'}}>{subtitle}</div>}
 </Layers>;
}
