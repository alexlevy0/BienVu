import React, {useEffect, useState} from 'react';
import {AbsoluteFill, Audio, Img, Sequence, cancelRender, continueRender, delayRender, interpolate, useCurrentFrame} from 'remotion';
import {VideoManifest} from '@bienvu/contracts';
import {fitFont, subtitleGroups, VIDEO_SAFE as safe} from './layout';

// Ces URL sont résolues uniquement par le renderer Node vers son serveur
// loopback privé. Le manifeste serveur n'accepte jamais d'URL d'asset cliente.
export type ListingVideoProps = {manifest: VideoManifest | null; media: Record<string, string>; logoBackground: string; fontUrl: string};
const dark = '#132a23', paper = '#f5f7f0';
function PhotoScene({manifest: m, media, index}: {manifest: VideoManifest; media: Record<string,string>; index: number}) {
  const f = useCurrentFrame(), scene = m.scenes[index], photo = m.photos.find(a => a.id === scene.photoAssetId)!;
  const last = scene.kind === 'contact';
  const groups = subtitleGroups(scene.narrationText), audio = m.audio.find(a => a.id === scene.audioAssetId)!;
  const voiceFrames = Math.ceil(audio.durationMs! * 30 / 1000);
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
      <div style={{fontSize:25,letterSpacing:3,textTransform:'uppercase'}}>Parlons de votre projet.</div>
      <div style={{marginTop:26,fontSize:fitFont(m.brand.name,safe.width,180,76,28),lineHeight:1.1,fontWeight:650,overflowWrap:'anywhere'}}>{m.brand.name}</div>
      <div style={{marginTop:32,borderTop:`2px solid ${dark}30`,paddingTop:30,
        fontSize:fitFont(m.brand[m.contact]!,safe.width,160,47,25),lineHeight:1.3,overflowWrap:'anywhere',fontWeight:550}}>{m.brand[m.contact]}</div>
    </div>}
    <div style={{position:'absolute',left:safe.left,right:safe.right,bottom:390,background:dark,color:'#fff',
      padding:'22px 30px',borderRadius:16,fontSize:fitFont(current,safe.width-60,150,40,25),lineHeight:1.28,
      overflowWrap:'anywhere',textAlign:'left'}}>{current}</div>
    <Audio src={media[audio.id]} volume={1}/>
  </AbsoluteFill>;
}
export function ListingFilm(props: ListingVideoProps) {
  const m = VideoManifest.parse(props.manifest), f = useCurrentFrame();
  const [fontWait] = useState(() => delayRender('Chargement de la police locale'));
  const [,setFontLoaded]=useState(false);
  useEffect(() => {
    const face = new FontFace('BienVu Video', `url('${props.fontUrl}')`, {weight:'100 900'});
    face.load().then(loaded => {document.fonts.add(loaded);setFontLoaded(true);requestAnimationFrame(()=>continueRender(fontWait));}).catch(cancelRender);
  }, [fontWait, props.fontUrl]);
  let at = 0;
  const scenes = m.scenes.map((s, index) => {const from = at; at += s.durationFrames; return {s,index,from};});
  return <AbsoluteFill style={{background:paper,fontFamily:'BienVu Video, DejaVu Sans, sans-serif',color:dark}}>
    {scenes.map(({s,index,from}) => <Sequence key={s.id} from={from} durationInFrames={s.durationFrames}>
      <PhotoScene manifest={m} media={props.media} index={index}/>
    </Sequence>)}
    <div style={{position:'absolute',left:safe.left,right:safe.right,top:190,minHeight:112,display:'flex',alignItems:'flex-start',gap:24}}>
      {m.logo && <div style={{width:112,height:112,flexShrink:0,borderRadius:18,background:props.logoBackground,padding:14,boxSizing:'border-box'}}>
        <Img src={props.media[m.logo.id]} style={{width:'100%',height:'100%',objectFit:'contain'}}/>
      </div>}
      <div style={{minWidth:0,flex:1}}>
        <div style={{fontSize:fitFont(m.brand.name,m.logo ? 690 : safe.width,80,42,22),fontWeight:650,lineHeight:1.12,overflowWrap:'anywhere'}}>{m.brand.name}</div>
        <div style={{marginTop:10,fontSize:19,letterSpacing:3,fontWeight:500}}>L’IMMOBILIER, EN MOUVEMENT</div>
      </div>
    </div>
    <div style={{position:'absolute',left:safe.left,right:safe.right,top:338,height:4,background:m.brand.primaryColor}}/>
    <div style={{position:'absolute',left:safe.left,right:safe.right,top:338,height:4,background:m.brand.secondaryColor,
      transformOrigin:'left center',transform:`scaleX(${f / Math.max(1,at-1)})`}}/>
    {m.rights.watermarked && <div style={{position:'absolute',left:262,top:f >= scenes.at(-1)!.from ? 540 : 780,transform:'rotate(-14deg)',
      background:'#132a23d9',border:'2px solid #ffffffa0',borderRadius:12,padding:'18px 30px',color:'#fff',
      fontWeight:750,fontSize:35,letterSpacing:2}}>BIENVU · VIDÉO D’ESSAI</div>}
    <div style={{position:'absolute',left:safe.left,right:safe.right,bottom:320,fontSize:26,fontWeight:500,color:dark,
      background:'#f5f7f0ee',padding:'6px 10px',borderRadius:8}}>Voix de synthèse générée par intelligence artificielle.</div>
  </AbsoluteFill>;
}
