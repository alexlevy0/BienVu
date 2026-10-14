import React,{useEffect,useState,type CSSProperties,type ReactNode} from 'react';
import {AbsoluteFill,Img,continueRender,delayRender,Easing,interpolate,staticFile,useCurrentFrame} from 'remotion';

export const C={paper:'#faf9f5',sage:'#e1e9da',ink:'#14291f',green:'#214f43',muted:'#67756b',line:'#d4ddce',gold:'#c6b17c'};
export const ui='Inter Tight, sans-serif', editorial='Newsreader, serif';
export const ease=(f:number,start=0,duration=24)=>interpolate(f,[start,start+duration],[0,1],{extrapolateLeft:'clamp',extrapolateRight:'clamp',easing:Easing.out(Easing.cubic)});
export const lerp=(a:number,b:number,p:number)=>a+(b-a)*p;
export const photo=(n:number)=>staticFile(`source/photo-${n}.jpg`);
export const shadow='0 28px 70px rgba(20,41,31,.15), 0 2px 5px rgba(20,41,31,.05)';

export function Fonts(){
 const [handle]=useState(()=>delayRender('BienVu brand fonts'));
 useEffect(()=>{Promise.all([document.fonts.load('700 50px "Inter Tight"'),document.fonts.load('400 50px "Newsreader"'),document.fonts.load('italic 400 50px "Newsreader"')]).then(()=>continueRender(handle));},[handle]);
 return <style>{`@font-face{font-family:'Inter Tight';src:url('${staticFile('fonts/inter-tight.woff2')}') format('woff2');font-weight:100 900;font-display:block;}@font-face{font-family:'Newsreader';src:url('${staticFile('fonts/newsreader.woff2')}') format('woff2');font-weight:200 800;font-style:normal;font-display:block;}@font-face{font-family:'Newsreader';src:url('${staticFile('fonts/newsreader-italic.woff2')}') format('woff2');font-weight:200 800;font-style:italic;font-display:block;}*{box-sizing:border-box}body{margin:0}`}</style>;
}

export function Logo({size=66,color=C.ink}: {size?:number;color?:string}){
 return <div style={{display:'flex',alignItems:'center',gap:size*.28,color,lineHeight:1}}><svg width={size*.66} height={size*.66} viewBox="0 0 40 40" fill="none"><path d="M14 3H3v11M26 3h11v11M3 26v11h11m12 0h11V26" stroke="currentColor" strokeWidth="3.5"/></svg><span style={{fontFamily:ui,fontWeight:900,fontSize:size,letterSpacing:'-.085em',paddingRight:size*.07}}>bienvu</span></div>;
}

export function Icon({name,size=28,color='currentColor'}:{name:'arrow'|'link'|'sparkle'|'play'|'check'|'house'|'voice'|'edit'|'globe'|'share'|'calendar'|'phone'|'cursor'|'heart';size?:number;color?:string}){
 const paths:Record<string,ReactNode>={
  arrow:<path d="M4 12h16m-6-6 6 6-6 6"/>,link:<><path d="m10 13 4-4M8 15l-2 2a4 4 0 0 1-6-6l5-5a4 4 0 0 1 6 0M16 9l2-2a4 4 0 0 1 6 6l-5 5a4 4 0 0 1-6 0" transform="translate(1 0) scale(.9)"/></>,
  sparkle:<path d="m12 2 2.8 7.2L22 12l-7.2 2.8L12 22l-2.8-7.2L2 12l7.2-2.8Z"/>,play:<path d="m9 5 10 7-10 7Z" fill={color} stroke="none"/>,check:<path d="m5 12 4 4 10-11"/>,house:<><path d="m3 10 9-8 9 8v12H3Z"/><path d="M9 22v-9h6v9"/></>,voice:<><rect x="8" y="2" width="8" height="13" rx="4"/><path d="M5 10v2a7 7 0 0 0 14 0v-2M12 19v3m-4 0h8"/></>,edit:<><path d="m4 16 11-11 4 4-11 11-5 1ZM15 5l3-3 4 4-3 3"/></>,globe:<><circle cx="12" cy="12" r="9"/><ellipse cx="12" cy="12" rx="4" ry="9"/><path d="M3 12h18"/></>,share:<><circle cx="6" cy="12" r="3"/><circle cx="18" cy="5" r="3"/><circle cx="18" cy="19" r="3"/><path d="m9 10 6-4m-6 8 6 4"/></>,calendar:<><rect x="3" y="5" width="18" height="17" rx="2"/><path d="M7 2v6m10-6v6M3 11h18m-14 4h2m6 0h2m-10 4h2m6 0h2"/></>,phone:<><rect x="6" y="2" width="12" height="20" rx="2"/><path d="M10 18h4"/></>,cursor:<path d="M4 2v18l5-5 4 7 3-2-4-7 8-1Z" fill={color}/>,heart:<path d="M12 21C-5 10 3-2 12 7c9-9 17 3 0 14Z"/>
 };
 return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.65" strokeLinecap="round" strokeLinejoin="round">{paths[name]}</svg>;
}

export function Paper({color=C.paper}:{color?:string}){return <AbsoluteFill style={{background:color}}><Img src={staticFile('images/home-paper-noise.svg')} style={{position:'absolute',width:'100%',height:'100%',objectFit:'cover',opacity:.025,mixBlendMode:'multiply'}}/></AbsoluteFill>;}
export function Reveal({children,delay=0,style={}}:{children:ReactNode;delay?:number;style?:CSSProperties}){const f=useCurrentFrame(),p=ease(f,delay,24);return <div style={{opacity:p,transform:`translateY(${(1-p)*24}px)`,...style}}>{children}</div>;}
export function Pill({children,dark=false,style={}}:{children:ReactNode;dark?:boolean;style?:CSSProperties}){return <div style={{display:'inline-flex',alignItems:'center',gap:12,padding:'13px 21px',borderRadius:99,background:dark?'rgba(20,41,31,.72)':C.sage,color:dark?'white':C.green,fontSize:23,fontWeight:550,...style}}>{children}</div>;}
export function Topline({label,dark=false}:{label:string;dark?:boolean}){return <div style={{position:'absolute',left:86,right:86,top:58,display:'flex',justifyContent:'space-between',alignItems:'center',color:dark?'white':C.ink}}><Logo size={53} color={dark?'white':C.ink}/><span style={{fontSize:18,fontWeight:550,letterSpacing:3,textTransform:'uppercase',opacity:.76}}>{label}</span></div>;}
export function Heading({children,style={}}:{children:ReactNode;style?:CSSProperties}){return <h1 style={{fontFamily:editorial,fontWeight:450,fontSize:112,lineHeight:.98,letterSpacing:'-.045em',margin:0,...style}}>{children}</h1>;}
export function Italic({children}:{children:ReactNode}){return <em style={{fontWeight:450,color:C.green}}>{children}</em>;}
export function Cursor({x,y,click=false}:{x:number;y:number;click?:boolean}){return <div style={{position:'absolute',left:x,top:y,filter:'drop-shadow(0 3px 4px #0003)',transform:`scale(${click?.9:1})`}}><Icon name="cursor" size={40} color="white"/></div>;}
export function Play({size=75}:{size?:number}){return <div style={{width:size,height:size,border:'2px solid #fff',borderRadius:'50%',background:'rgba(20,41,31,.2)',display:'grid',placeItems:'center',backdropFilter:'blur(3px)'}}><Icon name="play" size={size*.48} color="white"/></div>;}
export function ImageCard({n,style={},children}:{n:number;style?:CSSProperties;children?:ReactNode}){return <div style={{position:'relative',overflow:'hidden',borderRadius:24,boxShadow:shadow,...style}}><Img src={photo(n)} style={{width:'100%',height:'100%',objectFit:'cover'}}/>{children}</div>;}
export function Button({children,light=false,style={}}:{children:ReactNode;light?:boolean;style?:CSSProperties}){return <div style={{display:'inline-flex',gap:24,alignItems:'center',justifyContent:'center',padding:'23px 33px',borderRadius:13,background:light?C.sage:C.ink,color:light?C.ink:'white',fontSize:27,fontWeight:650,...style}}>{children}<Icon name="arrow" size={28}/></div>;}
