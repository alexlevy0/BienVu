import React, {useEffect, useState} from 'react';
import {AbsoluteFill, Audio, Img, OffthreadVideo, Freeze, Sequence, cancelRender, continueRender, delayRender, interpolate, useCurrentFrame} from 'remotion';
import {VideoManifest, type VideoPresentation} from '@bienvu/contracts';
import {contrastInk, displayArea, displayLocation, displayPrice, displayRooms, fitDisplayFont, fitFont, subtitleGroups, VIDEO_SAFE as safe} from './layout';
import {cameraMotion} from './camera-motion';
import {HorizontalPhotoScene} from './horizontal';

// Ces URL sont résolues uniquement par le renderer Node vers son serveur
// loopback privé. Le manifeste serveur n'accepte jamais d'URL d'asset cliente.
export type ListingVideoProps = {manifest: VideoManifest | null; media: Record<string, string>; logoBackground: string; fontUrl: string; displayFontUrl: string};
const dark = '#132a23', paper = '#f5f7f0';
function PhotoScene({manifest: m, media, index}: {manifest: VideoManifest; media: Record<string,string>; index: number}) {
  const f = useCurrentFrame(), scene = m.scenes[index], photo = m.photos.find(a => a.id === scene.photoAssetId)!;
  const last = scene.kind === 'contact';
  const groups = subtitleGroups(scene.narrationText), audio = m.audio.find(a => a.id === scene.audioAssetId)!;
  const voiceFrames = Math.ceil((audio?.durationMs??scene.durationFrames*1000/30) * 30 / 1000);
  const totalChars = groups.reduce((n, g) => n + g.length, 0);
  let threshold = 0;
  const current = groups.find(g => {threshold += g.length / totalChars * voiceFrames; return f < threshold;}) ?? groups.at(-1)!;
  const intro = index === 0;
  const opacity = interpolate(f, [0, 7], [index ? 0 : 1, 1], {extrapolateRight: 'clamp'});
  return <AbsoluteFill style={{opacity}}>
    <div style={{position:'absolute',inset:0,overflow:'hidden'}}>
      <Img src={media[photo.id]} style={{width:'100%',height:'100%',objectFit:'cover',filter:'blur(32px)',opacity:.2,transform:'scale(1.08)'}}/>
    </div>
    <div style={{position:'absolute',left:safe.left,right:safe.right,top:380,height:last ? 430 : 730,
      display:'flex',alignItems:'center',justifyContent:'center',borderRadius:28,overflow:'hidden',background:'#ffffff38'}}>
      <Img src={media[photo.id]} style={{width:'97%',height:'97%',objectFit:'contain',borderRadius:16,
        transform:`scale(${interpolate(f,[0,scene.durationFrames],[1,1.015],{extrapolateRight:'clamp'})})`}}/>
    </div>
    {!last && <div style={{position:'absolute',left:safe.left,right:safe.right,top:1160,color:dark}}>
      <div style={{fontSize:22,letterSpacing:3,textTransform:'uppercase',fontWeight:600,opacity:.7}}>{intro ? 'Votre prochaine adresse' : scene.kind === 'gallery' ? 'La visite en images' : 'Les repères du bien'}</div>
      <div style={{marginTop:16,fontSize:fitFont(scene.captionText,safe.width,120,66,28),fontWeight:650,lineHeight:1.12,
        overflowWrap:'anywhere',whiteSpace:'pre-wrap'}}>{scene.captionText}</div>
    </div>}
    {last && <div style={{position:'absolute',top:865,left:safe.left,right:safe.right,color:dark}}>
      <div style={{fontSize:25,letterSpacing:3,textTransform:'uppercase'}}>{m.contact==='none'?'Découvrez le bien.':'Parlons de votre projet.'}</div>
      <div style={{marginTop:26,fontSize:fitFont(m.brand.name,safe.width,180,76,28),lineHeight:1.1,fontWeight:650,overflowWrap:'anywhere'}}>{m.brand.name}</div>
      {m.contact!=='none' && <div style={{marginTop:32,borderTop:`2px solid ${dark}30`,paddingTop:30,
        fontSize:fitFont(m.brand[m.contact]!,safe.width,160,47,25),lineHeight:1.3,overflowWrap:'anywhere',fontWeight:550}}>{m.brand[m.contact]}</div>}
    </div>}
    {m.subtitlesEnabled!==false&&<div data-bienvu-subtitle="true" style={{position:'absolute',left:safe.left,right:safe.right,bottom:390,background:dark,color:'#fff',
      padding:'22px 30px',borderRadius:16,fontSize:fitFont(current,safe.width-60,150,40,25),lineHeight:1.28,
      overflowWrap:'anywhere',textAlign:'left'}}>{current}</div>}
    {m.voiceEnabled!==false&&audio&&<Audio src={media[audio.id]} volume={1}/>}
  </AbsoluteFill>;
}
const propertyName = (type: VideoPresentation['propertyType']) => type==='apartment'?'Appartement':type==='house'?'Maison':'Bien immobilier';
function posterHeadline(kind: VideoManifest['scenes'][number]['kind'], p: VideoPresentation, contact: boolean) {
  if(kind==='intro'||kind==='location')return displayLocation(p.locality);
  if(kind==='area'&&p.areaM2!==null)return displayArea(p.areaM2).toLocaleUpperCase('fr-FR');
  if(kind==='rooms'&&p.rooms!==null)return displayRooms(p.rooms).toLocaleUpperCase('fr-FR');
  if(kind==='price'&&p.priceCents!==null)return displayPrice(p.priceCents).toLocaleUpperCase('fr-FR');
  if(kind==='gallery')return 'EN IMAGES';
  return contact?'PARLONS-EN':'À DÉCOUVRIR';
}
function posterLabel(kind: VideoManifest['scenes'][number]['kind'], p: VideoPresentation, contact: boolean) {
  if(kind==='intro')return p.transaction==='sale'?'À VENDRE':'À LOUER';
  if(kind==='area')return 'LA SURFACE';
  if(kind==='rooms')return 'LES PIÈCES';
  if(kind==='price')return p.transaction==='sale'?'LE PRIX':'LE LOYER';
  if(kind==='location')return 'LA LOCALISATION';
  if(kind==='gallery')return 'LA VISITE';
  return contact?'VOTRE CONTACT':'POUR EN SAVOIR PLUS';
}
function GalleryBackground({manifest:m,media}: {manifest:VideoManifest;media:Record<string,string>}) {
  let at=0;
  return <AbsoluteFill style={{overflow:'hidden'}}>
    {m.photoTimeline!.map((photo,index)=>{const from=at;at+=photo.durationFrames;
      return <Sequence key={photo.photoAssetId} from={from} durationInFrames={photo.durationFrames+(m.photoTransition==='cut'?0:12)} premountFor={30}>
        <GalleryPhoto manifest={m} media={media} photoId={photo.photoAssetId} index={index} duration={photo.durationFrames}/>
      </Sequence>;})}
  </AbsoluteFill>;
}
function GalleryPhoto({manifest:m,media,photoId,index,duration}:{manifest:VideoManifest;media:Record<string,string>;photoId:string;index:number;duration:number}){
  const frame=useCurrentFrame(),motion=cameraMotion(frame,duration,index,m.photoMotion!==false,m.visualStyle==='cinematic');
  const animation=m.photoAnimations?.find(a=>a.photoAssetId===photoId);
  const opacity=index&&m.photoTransition!=='cut'?interpolate(frame,[0,12],[0,1],{extrapolateLeft:'clamp',extrapolateRight:'clamp'}):1;
  const style={position:'absolute' as const,width:'100%',height:'100%',objectFit:'cover' as const,objectPosition:'center'};
  // The generated clip plays at normal speed for short slots and gently slows
  // for longer slots. Its last frame is held through the next crossfade.
  return <AbsoluteFill style={{opacity,overflow:'hidden'}}>{animation?
    <Freeze frame={duration-1} active={frame>=duration}><OffthreadVideo src={media[animation.asset.id]} muted
      playbackRate={Math.min(1,animation.asset.durationMs!*30/1000/duration)} style={style}/></Freeze>:
    <Img src={media[photoId]} style={{...style,scale:motion.scale,translate:`${motion.x}px ${motion.y}px`}}/>}
  </AbsoluteFill>;
}
function EditorialPhotoScene({manifest:m,media,index}: {manifest:VideoManifest;media:Record<string,string>;index:number}) {
  const f=useCurrentFrame(),scene=m.scenes[index],photo=m.photos.find(a=>a.id===scene.photoAssetId)!;
  const p=m.presentation!,contact=scene.kind==='contact',intro=scene.kind==='intro';
  const shortTitle=p.title.length<=75?p.title:propertyName(p.propertyType);
  const heading=posterHeadline(scene.kind,p,m.contact!=='none');
  const audio=m.audio.find(a=>a.id===scene.audioAssetId)!,voiceFrames=Math.ceil((audio?.durationMs??scene.durationFrames*1000/30)*30/1000);
  const groups=subtitleGroups(scene.narrationText,68),totalChars=groups.reduce((n,g)=>n+g.length,0);
  let threshold=0;
  const subtitle=groups.find(g=>{threshold+=g.length/totalChars*voiceFrames;return f<threshold;})??groups.at(-1)!;
  const opacity=interpolate(f,[0,7],[index?0:1,1],{extrapolateRight:'clamp'});
  const accent=m.brand.primaryColor,ink=contrastInk(accent),width=safe.width;
  const zoom=m.photoMotion===false?1:interpolate(f,[0,scene.durationFrames],[1.01,1.055],{extrapolateRight:'clamp'});
  return <AbsoluteFill style={{opacity,background:m.photoTimeline?undefined:'#151b16',color:'#fff',overflow:'hidden'}}>
    {!m.photoTimeline&&<Img src={media[photo.id]} style={{width:'100%',height:'100%',objectFit:'cover',objectPosition:'center',transform:`scale(${zoom})`}}/>}
    <AbsoluteFill style={{background:'linear-gradient(180deg,rgba(8,13,10,.30) 0%,rgba(8,13,10,.06) 36%,rgba(8,13,10,.15) 51%,rgba(8,13,10,.54) 70%,rgba(8,13,10,.78) 100%)'}}/>
    <div style={{position:'absolute',left:safe.left,top:186,maxWidth:width,background:accent,color:ink,
      padding:'13px 27px 11px',fontSize:38,fontWeight:750,letterSpacing:8,lineHeight:1.1}}>{posterLabel(scene.kind,p,m.contact!=='none')}</div>
    <div style={{position:'absolute',left:safe.left,right:safe.right,top:286,maxHeight:385,
      fontFamily:'BienVu Display, Impact, sans-serif',fontSize:fitDisplayFont(heading,width,370,240,42),
      lineHeight:.98,letterSpacing:-2,textShadow:'0 4px 28px #0008',overflowWrap:'anywhere'}}>{heading}</div>
    {m.subtitlesEnabled!==false&&<div data-bienvu-subtitle="true" style={{position:'absolute',left:safe.left,right:safe.right,bottom:675,
      background:'rgba(15,23,18,.78)',borderLeft:`7px solid ${accent}`,padding:'20px 25px',
      fontSize:fitFont(subtitle,width-57,170,49,34),fontWeight:600,lineHeight:1.2,
      overflowWrap:'anywhere',whiteSpace:'pre-wrap'}}>{subtitle}</div>}
    {intro && <div style={{position:'absolute',left:safe.left,right:safe.right,bottom:337}}>
      {p.priceCents!==null && <div style={{fontFamily:'BienVu Display, Impact, sans-serif',
        fontSize:fitDisplayFont(displayPrice(p.priceCents),width,190,190,45),lineHeight:1,
        textShadow:'0 4px 20px #0008'}}>{displayPrice(p.priceCents)}{p.transaction==='rent'&&<span style={{fontFamily:'BienVu Video, sans-serif',fontSize:34,fontWeight:650,marginLeft:16}}> / mois</span>}</div>}
      <div style={{fontSize:fitFont(shortTitle,width,120,57,30),fontWeight:700,lineHeight:1.12,
        maxHeight:130,overflowWrap:'anywhere',textShadow:'0 3px 12px #000a'}}>{shortTitle}</div>
      <div style={{display:'flex',gap:14,marginTop:28,flexWrap:'wrap'}}>
        {p.areaM2!==null&&<span style={{background:accent,color:ink,padding:'8px 19px',fontSize:42,fontWeight:750}}>{displayArea(p.areaM2)}</span>}
        {p.rooms!==null&&<span style={{background:accent,color:ink,padding:'8px 19px',fontSize:42,fontWeight:750}}>{displayRooms(p.rooms)}</span>}
      </div>
    </div>}
    {!intro&&!contact&&<div style={{position:'absolute',left:safe.left,right:safe.right,bottom:350}}>
      <div style={{width:136,height:7,background:accent,marginBottom:22}}/>
      <div style={{fontSize:fitFont(shortTitle,width,170,62,30),fontWeight:700,lineHeight:1.15,
        overflowWrap:'anywhere',textShadow:'0 3px 12px #000a'}}>{shortTitle}</div>
      <div style={{fontSize:34,marginTop:22,opacity:.94}}>{propertyName(p.propertyType)} · {p.locality}</div>
    </div>}
    {contact&&<div style={{position:'absolute',left:safe.left,right:safe.right,bottom:340,
      padding:'26px 30px',background:'rgba(225,232,217,.94)',color:dark,borderTop:`8px solid ${accent}`}}>
      <div style={{fontSize:fitFont(m.brand.name,width-60,135,73,24),fontWeight:750,lineHeight:1.08,overflowWrap:'anywhere'}}>{m.brand.name}</div>
      {m.contact!=='none'&&<div style={{marginTop:18,fontSize:fitFont(m.brand[m.contact]!,width-60,125,51,20),
        fontWeight:600,lineHeight:1.16,overflowWrap:'anywhere'}}>{m.brand[m.contact]}</div>}
    </div>}
    {m.voiceEnabled!==false&&audio&&<Audio src={media[audio.id]} volume={1}/>}
  </AbsoluteFill>;
}
function StyledPhotoScene({manifest:m,media,index}:{manifest:VideoManifest;media:Record<string,string>;index:number}){
  const frame=useCurrentFrame(),scene=m.scenes[index],p=m.presentation!,audio=m.audio.find(a=>a.id===scene.audioAssetId)!;
  const cinema=m.visualStyle==='cinematic',contact=scene.kind==='contact',width=safe.width;
  const heading=contact?m.brand.name:index===0?p.title:posterHeadline(scene.kind,p,m.contact!=='none');
  const groups=subtitleGroups(scene.narrationText,68),length=groups.reduce((n,g)=>n+g.length,0);
  const voiceFrames=Math.ceil((audio?.durationMs??scene.durationFrames*1000/30)*30/1000);let threshold=0;
  const subtitle=groups.find(g=>{threshold+=g.length/length*voiceFrames;return frame<threshold;})??groups.at(-1)!;
  const panel=m.brand.secondaryColor,ink=contrastInk(panel),accent=m.brand.primaryColor;
  return <AbsoluteFill data-bienvu-style={m.visualStyle} style={{color:'#fff'}}>
    {!m.photoTimeline&&<Img src={media[scene.photoAssetId]} style={{width:'100%',height:'100%',objectFit:'cover'}}/>}
    <AbsoluteFill style={{background:cinema?'linear-gradient(180deg,#0003 0%,transparent 38%,#000c 100%)':'linear-gradient(180deg,#0002 0%,transparent 50%,#0006 100%)'}}/>
    <div style={{position:'absolute',top:210,left:safe.left,color:'#fff',fontSize:35,letterSpacing:cinema?5:2,textTransform:'uppercase',textShadow:'0 2px 12px #0008'}}>{p.locality}</div>
    {m.subtitlesEnabled!==false&&<div data-bienvu-subtitle="true" style={{position:'absolute',left:safe.left,right:safe.right,bottom:780,
      background:'#000a',padding:'18px 24px',fontSize:fitFont(subtitle,width-48,150,45,30),textAlign:cinema?'center':'left',lineHeight:1.2}}>{subtitle}</div>}
    <div style={{position:'absolute',left:safe.left,right:safe.right,bottom:335,padding:cinema?'28px 0':'34px 38px',
      background:cinema?undefined:panel,color:cinema?'#fff':ink,borderTop:cinema?undefined:`6px solid ${accent}`,textAlign:cinema?'center':'left'}}>
      <div style={{color:cinema?accent:ink,fontSize:25,letterSpacing:4,textTransform:'uppercase',marginBottom:20}}>{posterLabel(scene.kind,p,m.contact!=='none')}</div>
      <div style={{fontFamily:cinema?'Georgia, DejaVu Serif, serif':'BienVu Video, sans-serif',fontSize:fitFont(heading,width-76,260,cinema?92:65,30),
        fontWeight:cinema?400:650,lineHeight:1.08,overflowWrap:'anywhere'}}>{heading}</div>
      {contact&&m.contact!=='none'?<div style={{fontSize:fitFont(m.brand[m.contact]!,width-76,160,46,23),lineHeight:1.2,marginTop:25,overflowWrap:'anywhere'}}>{m.brand[m.contact]}</div>:
        <><div style={{marginTop:24,fontSize:34}}>{[p.areaM2!==null?displayArea(p.areaM2):'',p.rooms!==null?displayRooms(p.rooms):''].filter(Boolean).join(' · ')}</div>
        {p.priceCents!==null&&<div style={{fontSize:54,fontWeight:650,marginTop:12}}>{displayPrice(p.priceCents)}{p.transaction==='rent'?' / mois':''}</div>}</>}
    </div>{m.voiceEnabled!==false&&audio&&<Audio src={media[audio.id]} volume={1}/>}
  </AbsoluteFill>;
}
function CinematicPhotoScene({manifest:m,media,index}:{manifest:VideoManifest;media:Record<string,string>;index:number}){
  const frame=useCurrentFrame(),scene=m.scenes[index],p=m.presentation!,contact=scene.kind==='contact';
  const audio=m.audio.find(a=>a.id===scene.audioAssetId)!,voiceFrames=Math.ceil((audio?.durationMs??scene.durationFrames*1000/30)*30/1000);
  const groups=subtitleGroups(scene.narrationText,68),chars=groups.reduce((n,g)=>n+g.length,0);let threshold=0;
  const subtitle=groups.find(g=>{threshold+=g.length/chars*voiceFrames;return frame<threshold;})??groups.at(-1)!;
  const ink=contrastInk(m.brand.secondaryColor),width=safe.width;
  const entrance=interpolate(frame,[8,32],[0,1],{extrapolateLeft:'clamp',extrapolateRight:'clamp'});
  const fallbackMotion=cameraMotion(frame,scene.durationFrames,index,m.photoMotion!==false,true);
  return <AbsoluteFill data-bienvu-style="cinematic">
    {!m.photoTimeline&&<Img src={media[scene.photoAssetId]} style={{width:'100%',height:'100%',objectFit:'cover',scale:fallbackMotion.scale,translate:`${fallbackMotion.x}px ${fallbackMotion.y}px`}}/>}
    {/* The upper half stays visible, including the last photo in a full gallery. */}
    {contact&&<AbsoluteFill style={{opacity:entrance,background:`linear-gradient(180deg,transparent 30%,${m.brand.secondaryColor}99 48%,${m.brand.secondaryColor}f5 64%)`}}/>}
    {contact&&<div data-bienvu-cinema-endcard="true" style={{position:'absolute',left:safe.left,right:safe.right,bottom:350,color:ink,
      opacity:entrance,translate:`0 ${interpolate(frame,[8,32],[20,0],{extrapolateLeft:'clamp',extrapolateRight:'clamp'})}px`}}>
      <div style={{fontSize:28,letterSpacing:5,textTransform:'uppercase',marginBottom:18}}>{p.transaction==='sale'?'À vendre':'À louer'}</div>
      <div style={{fontFamily:'Georgia, DejaVu Serif, serif',fontSize:fitFont(displayLocation(p.locality),width,155,88,30,'Georgia',400,1.12),lineHeight:1.12,overflowWrap:'anywhere'}}>{displayLocation(p.locality)}</div>
      <div style={{marginTop:20,fontSize:fitFont(p.title,width,155,47,27),lineHeight:1.2,overflowWrap:'anywhere'}}>{p.title}</div>
      <div style={{marginTop:22,fontSize:40}}>{[p.areaM2!==null?displayArea(p.areaM2):'',p.rooms!==null?displayRooms(p.rooms):''].filter(Boolean).join(' · ')}</div>
      {p.priceCents!==null&&<div style={{marginTop:16,fontSize:fitFont(displayPrice(p.priceCents,p.transaction==='rent'),width,100,65,30),fontWeight:650,lineHeight:1.2}}>{displayPrice(p.priceCents,p.transaction==='rent')}</div>}
      <div style={{width:110,height:4,background:m.brand.primaryColor,margin:'30px 0 24px'}}/>
      <div style={{fontSize:fitFont(m.brand.name,width,100,46,24),fontWeight:650,lineHeight:1.2,overflowWrap:'anywhere'}}>{m.brand.name}</div>
      {m.contact!=='none'&&<div style={{marginTop:14,fontSize:fitFont(m.brand[m.contact]!,width,100,38,22),lineHeight:1.2,overflowWrap:'anywhere'}}>{m.brand[m.contact]}</div>}
    </div>}
    {m.subtitlesEnabled!==false&&<div data-bienvu-subtitle="true" style={{position:'absolute',left:safe.left,right:safe.right,bottom:contact?1250:520,
      background:'rgba(12,17,14,.72)',color:'#fff',padding:'16px 24px',fontSize:fitFont(subtitle,width-48,145,43,28),lineHeight:1.25,textAlign:'center',overflowWrap:'anywhere'}}>{subtitle}</div>}
    {m.voiceEnabled!==false&&audio&&<Audio src={media[audio.id]} volume={1}/>}
  </AbsoluteFill>;
}
export function ListingFilm(props: ListingVideoProps) {
  const m = VideoManifest.parse(props.manifest), f = useCurrentFrame();
  const [fontWait] = useState(() => delayRender('Chargement de la police locale'));
  const [,setFontLoaded]=useState(false);
  useEffect(() => {
    const faces=[new FontFace('BienVu Video', `url('${props.fontUrl}')`, {weight:'100 900'})];
    if(m.templateVersion!=='bienvu-vertical/1')faces.push(new FontFace('BienVu Display',`url('${props.displayFontUrl}')`,{weight:'400'}));
    Promise.all(faces.map(face=>face.load())).then(loaded=>{for(const face of loaded)document.fonts.add(face);
      setFontLoaded(true);requestAnimationFrame(()=>continueRender(fontWait));}).catch(cancelRender);
  }, [fontWait, props.fontUrl, props.displayFontUrl, m.templateVersion]);
  let at = 0;
  const scenes = m.scenes.map((s, index) => {const from = at; at += s.durationFrames; return {s,index,from};});
  const horizontal=m.templateVersion==='bienvu-horizontal/1';
  const editorial=m.templateVersion!=='bienvu-vertical/1',cinematic=editorial&&m.visualStyle==='cinematic';
  const compactBrand=m.brand.name.length<=28?m.brand.name:null;
  return <AbsoluteFill style={{background:editorial?'#151b16':paper,fontFamily:'BienVu Video, DejaVu Sans, sans-serif',color:editorial?'#fff':dark}}>
    {m.photoTimeline&&<GalleryBackground manifest={m} media={props.media}/>}
    {scenes.map(({s,index,from}) => <Sequence key={s.id} from={from} durationInFrames={s.durationFrames}>
      {horizontal?<HorizontalPhotoScene manifest={m} media={props.media} logoBackground={props.logoBackground} index={index}/>:editorial?cinematic?<CinematicPhotoScene manifest={m} media={props.media} index={index}/>:m.visualStyle==='minimal'?<StyledPhotoScene manifest={m} media={props.media} index={index}/>:<EditorialPhotoScene manifest={m} media={props.media} index={index}/>:<PhotoScene manifest={m} media={props.media} index={index}/>}
    </Sequence>)}
    {!horizontal&&<>
    {!editorial&&<div style={{position:'absolute',left:safe.left,right:safe.right,top:190,minHeight:112,display:'flex',alignItems:'flex-start',gap:24}}>
      {m.logo && <div style={{width:112,height:112,flexShrink:0,borderRadius:18,background:props.logoBackground,padding:14,boxSizing:'border-box'}}>
        <Img src={props.media[m.logo.id]} style={{width:'100%',height:'100%',objectFit:'contain'}}/>
      </div>}
      <div style={{minWidth:0,flex:1}}>
        <div style={{fontSize:fitFont(m.brand.name,m.logo ? 690 : safe.width,80,42,22),fontWeight:650,lineHeight:1.12,overflowWrap:'anywhere'}}>{m.brand.name}</div>
        <div style={{marginTop:10,fontSize:19,letterSpacing:3,fontWeight:500}}>L’IMMOBILIER, EN MOUVEMENT</div>
      </div>
    </div>}
    {cinematic&&f<scenes.at(-1)!.from&&<div style={{position:'absolute',bottom:350,right:safe.right,
      padding:m.logo?14:'13px 18px',borderRadius:m.logo?'50%':12,background:m.logo?props.logoBackground:'#111b',color:'#fff',
      fontSize:fitFont(m.brand.name,224,90,24,14),lineHeight:1.2,overflowWrap:'anywhere',maxWidth:260}}>
      {m.logo?<Img src={props.media[m.logo.id]} style={{display:'block',width:90,height:90,objectFit:'contain'}}/>:m.brand.name}
    </div>}
    {editorial&&!cinematic&&(m.logo||compactBrand)&&<div style={{position:'absolute',top:132,right:safe.right,maxWidth:260,display:'flex',alignItems:'center',gap:11,
      padding:'8px 13px',background:'rgba(15,23,18,.72)',fontSize:25,fontWeight:700,lineHeight:1.08,
      overflowWrap:'anywhere'}}>{m.logo&&<Img src={props.media[m.logo.id]} style={{width:44,height:44,objectFit:'contain',background:props.logoBackground}}/>}{compactBrand}</div>}
    {!cinematic&&<><div style={{position:'absolute',left:safe.left,right:safe.right,top:editorial?118:338,height:4,background:m.brand.primaryColor}}/>
      <div style={{position:'absolute',left:safe.left,right:safe.right,top:editorial?118:338,height:4,background:m.brand.secondaryColor,
        transformOrigin:'left center',transform:`scaleX(${f / Math.max(1,at-1)})`}}/></>}
    {m.rights.watermarked && <div style={{position:'absolute',left:editorial?235:262,top:editorial?785:f >= scenes.at(-1)!.from ? 540 : 780,transform:'rotate(-14deg)',
      background:'#132a23d9',border:'2px solid #ffffffa0',borderRadius:12,padding:'18px 30px',color:'#fff',
      fontWeight:750,fontSize:35,letterSpacing:2}}>BIENVU · VIDÉO D’ESSAI</div>}
    </>}
  </AbsoluteFill>;
}
