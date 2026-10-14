import React from 'react';
import {AbsoluteFill,Audio,Img,Loop,OffthreadVideo,Sequence,staticFile,useCurrentFrame,interpolate} from 'remotion';
import {Button,C,Cursor,ease,Heading,Icon,ImageCard,Italic,lerp,Logo,Paper,photo,Pill,Play,Reveal,shadow,Topline,ui,editorial} from './design';

export const ImportScene=()=>{
 const f=useCurrentFrame(),url='https://votre-agence.fr/annonce/le-rouret',typed=url.slice(0,Math.max(0,Math.floor((f-48)*1.6))),ready=ease(f,104,18);
 return <AbsoluteFill style={{color:C.ink}}><Paper/><Topline label="Du mandat au marketing"/>
  <div style={{position:'absolute',left:86,top:195,width:860}}>
   <Reveal><Pill><Icon name="sparkle" size={22}/> Le studio marketing de votre agence</Pill></Reveal>
   <Reveal delay={8}><Heading style={{marginTop:35,fontSize:118}}>Vous rentrez<br/>le <Italic>mandat.</Italic></Heading></Reveal>
   <Reveal delay={20} style={{marginTop:28,fontSize:32,color:C.muted,lineHeight:1.5}}>BienVu s’occupe du marketing.</Reveal>
  </div>
  <div style={{position:'absolute',left:1090,top:210,width:600,height:600,transform:`translateY(${lerp(38,0,ease(f,5,40))}px)`}}>
   {[{n:3,x:160,y:30,r:9},{n:2,x:-65,y:100,r:-8},{n:1,x:40,y:185,r:2}].map((p,i)=><ImageCard key={p.n} n={p.n} style={{position:'absolute',left:p.x,top:p.y,width:485,height:340,transform:`rotate(${p.r}deg) scale(${lerp(.9,1,ease(f,i*8,30))})`,opacity:ease(f,i*8,25),border:'8px solid white'}}/>) }
   <div style={{position:'absolute',left:12,top:570,display:'flex',gap:12,opacity:ease(f,35,22)}}><Pill style={{background:'white'}}>Le Rouret</Pill><Pill style={{background:'white'}}>266 m² · 5 pièces</Pill></div>
  </div>
  <Reveal delay={38} style={{position:'absolute',left:86,top:705,width:970}}>
   <div style={{padding:20,borderRadius:26,background:C.sage,border:`1px solid ${C.line}`,boxShadow:shadow}}>
    <div style={{display:'flex',gap:16,alignItems:'center'}}>
     <div style={{height:93,flex:1,background:C.paper,borderRadius:15,border:`1px solid ${C.line}`,display:'flex',gap:22,alignItems:'center',padding:'0 25px',fontSize:25,color:typed?C.ink:C.muted}}><Icon name="link" size={31}/><span>{typed||'Collez le lien de votre annonce'}{f>=48&&f<104&&<span style={{opacity:Math.sin(f*.32)>0?1:.2}}>│</span>}</span></div>
     <div style={{background:C.ink,color:'white',height:93,width:180,borderRadius:15,display:'flex',alignItems:'center',justifyContent:'center',gap:10,fontSize:26,fontWeight:650}}>Créer <Icon name="arrow"/></div>
    </div>
    <div style={{marginTop:19,display:'flex',alignItems:'center',gap:12,fontSize:24,minHeight:30,color:C.green}}><span style={{display:'grid',placeItems:'center',width:28,height:28,borderRadius:'50%',background:ready?C.green:C.line,color:'white'}}><Icon name={ready?'check':'link'} size={19}/></span>{f<104?'Photos et informations, réunies au même endroit.':'Annonce importée. À vous de créer.'}</div>
   </div>
  </Reveal>
 </AbsoluteFill>;
};

export const AnimationScene=()=>{
 const f=useCurrentFrame();
 return <AbsoluteFill><Img src={photo(f<60?1:2)} style={{width:'100%',height:'100%',objectFit:'cover',transform:`scale(${1.03+f*.00015})`}}/>
  <AbsoluteFill style={{background:'linear-gradient(90deg,rgba(10,29,20,.77),rgba(10,29,20,.15) 65%,rgba(10,29,20,0))'}}/>
  <Topline label="01 / Des photos qui prennent vie" dark/>
  <div style={{position:'absolute',left:86,top:285,width:1040,color:'white'}}><Reveal><Pill dark><Icon name="sparkle"/> Animations IA</Pill></Reveal><Reveal delay={6}><Heading style={{fontSize:119,marginTop:36}}>Vos photos<br/><em>prennent vie.</em></Heading></Reveal><Reveal delay={18} style={{marginTop:34,fontSize:31,lineHeight:1.45,maxWidth:700}}>Du mouvement. De la lumière.<br/>Une autre façon de découvrir vos biens.</Reveal></div>
  <Reveal delay={8} style={{position:'absolute',right:119,top:173,width:443,height:787}}><div style={{height:'100%',border:'5px solid rgba(255,255,255,.8)',borderRadius:25,overflow:'hidden',boxShadow:'0 25px 65px #0006',transform:'rotate(2deg)',position:'relative'}}><Sequence durationInFrames={64}><OffthreadVideo src={staticFile('source/animation-1.mp4')} muted style={{width:'100%',height:'100%',objectFit:'cover'}}/></Sequence><Sequence from={60} durationInFrames={72}><OffthreadVideo src={staticFile('source/animation-2.mp4')} muted style={{width:'100%',height:'100%',objectFit:'cover'}}/></Sequence><Pill dark style={{position:'absolute',top:19,left:19,fontSize:19}}><Icon name="sparkle" size={19}/> Votre photo, animée</Pill></div></Reveal>
 </AbsoluteFill>;
};

export const VoiceScene=()=>{
 const f=useCurrentFrame();
 return <AbsoluteFill style={{color:C.ink}}><Paper color={C.sage}/><Topline label="02 / Une voix. Une présence."/>
  <div style={{position:'absolute',left:86,top:236,width:860}}><Reveal><Pill style={{background:'rgba(255,255,255,.65)'}}><Icon name="voice"/> Voix françaises · Avatars IA</Pill></Reveal><Reveal delay={6}><Heading style={{fontSize:118,marginTop:37}}>Vos annonces<br/><Italic>prennent<br/>la parole.</Italic></Heading></Reveal>
   <Reveal delay={16} style={{fontSize:31,lineHeight:1.5,color:C.muted,marginTop:30,maxWidth:715}}>Choisissez votre voix, votre présentateur.<br/>Gardez votre identité.</Reveal>
   <Reveal delay={32} style={{marginTop:39}}><div style={{display:'flex',alignItems:'center',gap:18}}><div style={{height:64,width:64,borderRadius:'50%',background:C.ink,color:'white',display:'grid',placeItems:'center'}}><Icon name="voice" size={30}/></div><div><div style={{fontSize:24,fontWeight:650}}>Écoutez un vrai extrait</div><div style={{display:'flex',alignItems:'center',gap:5,height:38,marginTop:6}}>{Array.from({length:37},(_,i)=><div key={i} style={{width:5,borderRadius:8,height:9+26*Math.abs(Math.sin(i*1.81+f*.27))*(f>15&&f<158?1:.15),background:C.green}}/>)}</div></div></div></Reveal>
  </div>
  <Reveal delay={4} style={{position:'absolute',right:100,top:205,width:670,height:731}}><div style={{position:'absolute',inset:0,borderRadius:31,overflow:'hidden',background:C.ink,boxShadow:shadow,transform:`rotate(${lerp(2,0,ease(f,0,60))}deg)`}}>
   <Img src={photo(3)} style={{width:'100%',height:'100%',objectFit:'cover',transform:`scale(${1.05+f*.00015})`}}/><AbsoluteFill style={{background:'linear-gradient(180deg,rgba(0,0,0,.05),transparent 50%,rgba(0,0,0,.55))'}}/>
   <div style={{position:'absolute',left:31,top:29,color:'white'}}><div style={{fontFamily:editorial,fontSize:44}}>Le Rouret</div><div style={{fontSize:22,marginTop:5}}>266 m² · 5 pièces</div></div>
   <Sequence from={15} durationInFrames={157}><OffthreadVideo src={staticFile('source/avatar.webm')} transparent muted trimBefore={633} style={{position:'absolute',height:950,width:535,objectFit:'contain',bottom:-200,right:-30}}/></Sequence>
   {f>=22&&f<161&&<div style={{position:'absolute',left:27,right:27,bottom:32,padding:'14px 20px',borderRadius:11,color:'white',fontSize:22,fontWeight:550,background:'rgba(12,31,22,.82)',lineHeight:1.35,textAlign:'center',opacity:Math.min(ease(f,22,8),1-ease(f,152,8))}}>Elle offre une vue imprenable et des volumes généreux<br/>avec un vaste séjour lumineux.</div>}
  </div></Reveal>
  <Sequence from={15} durationInFrames={150}><Audio src={staticFile('source/voice-3.wav')} trimAfter={150} volume={f=>f>145?Math.max(0,(150-f)/5):.93}/></Sequence>
 </AbsoluteFill>;
};

export const EditorScene=()=>{
 const f=useCurrentFrame(),move=ease(f,42,30),progress=interpolate(f,[0,180],[.12,.8],{extrapolateRight:'clamp'});
 return <AbsoluteFill style={{color:C.ink}}><Paper/><Topline label="03 / Votre vidéo, votre signature"/>
  <div style={{position:'absolute',left:88,top:188,width:1744,display:'flex',alignItems:'end',justifyContent:'space-between'}}><Reveal><Heading style={{fontSize:83}}>Le dernier mot<br/><Italic>est à vous.</Italic></Heading></Reveal><Reveal delay={8} style={{fontSize:28,color:C.muted,paddingBottom:9,width:725,lineHeight:1.5}}>Photos, textes, couleurs, rythme.<br/>Un éditeur pour les derniers détails.</Reveal></div>
  <Reveal delay={8} style={{position:'absolute',left:88,top:398,width:1744,height:557}}><div style={{height:'100%',borderRadius:23,border:`1px solid ${C.line}`,boxShadow:shadow,background:'white',overflow:'hidden',transform:`perspective(2500px) rotateX(${lerp(3,0,ease(f,8,38))}deg)`}}>
   <div style={{height:59,display:'flex',alignItems:'center',justifyContent:'space-between',padding:'0 28px',borderBottom:`1px solid ${C.line}`,background:C.paper,fontSize:21}}><span style={{display:'flex',alignItems:'center',gap:13}}><Icon name="edit"/> Éditeur <span style={{color:C.muted,marginLeft:22}}>Maison · Le Rouret</span></span><span style={{padding:'8px 18px',borderRadius:7,background:C.green,color:'white'}}>Exporter ma vidéo ↗</span></div>
   <div style={{display:'flex',height:337}}>
    <div style={{width:241,padding:22,borderRight:`1px solid ${C.line}`,background:C.paper}}>{['Photos','Textes','Voix et musique','Style de l’agence'].map((text,i)=><div key={text} style={{fontSize:21,padding:'13px 14px',marginBottom:9,borderRadius:8,background:i===3?C.sage:'transparent',color:i===3?C.ink:C.muted}}>{text}</div>)}</div>
    <div style={{flex:1,display:'flex',alignItems:'center',justifyContent:'center',background:'#f0f2ec',position:'relative'}}><div style={{position:'relative',width:620,height:297,borderRadius:8,overflow:'hidden'}}><Img src={photo(1)} style={{width:'100%',height:'100%',objectFit:'cover',transform:`scale(${1.03+f*.00015})`}}/><div style={{position:'absolute',inset:0,background:'linear-gradient(transparent 40%,#14291f99)'}}/><div style={{position:'absolute',left:26,bottom:23,color:'white',fontFamily:editorial,fontSize:37}}>Le Rouret<span style={{fontFamily:ui,fontSize:19,display:'block',marginTop:8}}>Un bien. Une nouvelle perspective.</span></div><div style={{position:'absolute',top:15,right:18,padding:'6px 12px',borderRadius:5,background:move>.5?C.green:C.ink,color:'white',fontSize:17}}>Votre agence</div></div></div>
    <div style={{width:289,padding:24,borderLeft:`1px solid ${C.line}`,fontSize:20}}><div style={{fontWeight:650,marginBottom:20}}>Votre identité</div><div style={{color:C.muted}}>Couleur principale</div><div style={{display:'flex',gap:12,marginTop:13,marginBottom:23}}>{[C.ink,C.green,'#8c9e82','#c6b17c'].map((c,i)=><div key={c} style={{width:40,height:40,borderRadius:'50%',background:c,outline:i===1&&move>.5?`2px solid ${C.green}`:'none',outlineOffset:4}}/>)}</div><div style={{color:C.muted}}>Votre logo</div><div style={{marginTop:12,padding:14,border:`1px solid ${C.line}`,borderRadius:8}}>Votre agence</div><div style={{marginTop:22,color:C.muted}}>Sous-titres</div><div style={{width:53,height:26,borderRadius:20,background:C.green,marginTop:11,padding:3}}><div style={{height:20,width:20,borderRadius:'50%',background:'white',marginLeft:27}}/></div></div>
   </div>
   <div style={{height:161,padding:'17px 31px',background:'#fcfcfa',borderTop:`1px solid ${C.line}`,position:'relative'}}><div style={{display:'flex',justifyContent:'space-between',fontSize:17,color:C.muted,marginBottom:11}}><span>00:00</span><span>00:10</span><span>00:20</span><span>00:30</span></div><div style={{display:'flex',gap:7,height:69}}>{[1,2,3,4,5,6,1,3].map((n,i)=><div key={i} style={{flex:1,borderRadius:8,overflow:'hidden',position:'relative',transform:i===2?`translateX(${Math.sin(move*Math.PI)*70}px) translateY(${-Math.sin(move*Math.PI)*12}px)`:'none',outline:i===2&&move<1&&move>0?`2px solid ${C.green}`:'none'}}><Img src={photo(n)} style={{width:'100%',height:'100%',objectFit:'cover'}}/><div style={{position:'absolute',bottom:4,left:8,fontSize:13,color:'white'}}>Plan {i+1}</div></div>)}</div><div style={{height:16,background:C.sage,marginTop:9,borderRadius:4,overflow:'hidden',display:'flex',alignItems:'center',justifyContent:'space-around'}}>{Array.from({length:140},(_,i)=><div key={i} style={{height:5+8*Math.abs(Math.sin(i*2.8)),width:3,background:'#8ea285'}}/>)}</div><div style={{position:'absolute',top:17,bottom:10,left:31+(1744-62)*progress,width:2,background:C.green}}><div style={{width:12,height:12,background:C.green,transform:'translateX(-5px) rotate(45deg)'}}/></div></div>
   <Cursor x={lerp(740,1524,ease(f,12,32))} y={lerp(446,168,ease(f,12,32))} click={f>=42&&f<48}/>
  </div></Reveal>
 </AbsoluteFill>;
};

export const ShowcaseScene=()=>{
 const f=useCurrentFrame();
 return <AbsoluteFill style={{color:C.ink}}><Paper color={C.sage}/><Topline label="04 / Ma vitrine"/>
  <div style={{position:'absolute',left:86,top:223,width:610}}><Reveal><Pill style={{background:'rgba(255,255,255,.7)'}}><Icon name="globe"/> Ma vitrine</Pill></Reveal><Reveal delay={5}><Heading style={{fontSize:111,marginTop:35}}>Une vitrine<br/>à votre<br/><Italic>image.</Italic></Heading></Reveal><Reveal delay={18} style={{fontSize:30,lineHeight:1.45,marginTop:34,color:C.muted,maxWidth:552}}>Votre agence, vos biens, vos vidéos.<br/>Une page à partager avec vos clients.</Reveal><Reveal delay={40} style={{marginTop:31}}><Pill style={{background:'white',fontSize:22}}><Icon name="check" size={21}/> À vos couleurs. Sur tous les écrans.</Pill></Reveal></div>
  <Reveal delay={7} style={{position:'absolute',left:753,top:207,width:990,height:728}}><div style={{height:'100%',borderRadius:22,background:C.paper,border:'8px solid #ffffff',boxShadow:shadow,overflow:'hidden',transform:`perspective(2400px) rotateY(${lerp(-4,-1,ease(f,0,100))}deg)`}}>
   <div style={{height:39,background:'#edf0e9',display:'flex',gap:7,alignItems:'center',padding:'0 13px'}}>{['#cc8e84','#d4bd81','#9dad8a'].map(c=><div key={c} style={{width:10,height:10,borderRadius:'50%',background:c}}/>)}<span style={{fontSize:14,color:C.muted,textAlign:'center',flex:1}}>bienvu.online/agences/votre-agence</span></div>
   <div style={{height:65,display:'flex',alignItems:'center',justifyContent:'space-between',padding:'0 27px'}}><span style={{fontSize:24,fontWeight:650}}>Votre agence</span><span style={{fontSize:14,color:C.muted}}>Nos biens&nbsp;&nbsp;&nbsp; À propos&nbsp;&nbsp;&nbsp; <span style={{background:C.ink,color:'white',padding:'10px 16px',borderRadius:25}}>Contact</span></span></div>
   <div style={{height:191,margin:'0 19px',borderRadius:14,overflow:'hidden',position:'relative'}}><Img src={photo(3)} style={{width:'100%',height:'100%',objectFit:'cover',objectPosition:'center 39%'}}/><div style={{position:'absolute',inset:0,background:'linear-gradient(90deg,#14291f9c,transparent)'}}/><div style={{position:'absolute',left:26,bottom:27,color:'white',fontFamily:editorial,fontSize:37}}>Des biens à vivre.<br/>Des vidéos à découvrir.</div></div>
   <div style={{padding:'17px 26px',display:'flex',alignItems:'center',gap:12,fontSize:13}}><span style={{borderRadius:30,padding:'9px 15px',background:C.sage}}>Tous les biens</span><span>À vendre</span><span>À louer</span></div>
   <div style={{fontSize:27,fontWeight:600,margin:'1px 26px 16px'}}>Trouvez votre prochain chez-vous.</div>
   <div style={{display:'flex',gap:14,padding:'0 25px'}}>{[1,4,6].map((n,i)=><div key={n} style={{flex:1,height:265,borderRadius:12,overflow:'hidden',position:'relative'}}><Img src={i===0?photo(n):staticFile(i===1?'images/lyon.webp':'images/sud.webp')} style={{height:'100%',width:'100%',objectFit:'cover'}}/><div style={{position:'absolute',inset:0,background:'linear-gradient(transparent 40%,#102419d9)'}}/><div style={{position:'absolute',left:'50%',top:'43%',transform:'translate(-50%,-50%)'}}><Play size={47}/></div><div style={{position:'absolute',left:16,bottom:15,color:'white'}}><div style={{fontSize:15}}>{i===0?'Le Rouret':i===1?'Lyon':'Provence'}</div><div style={{fontSize:24,fontWeight:650,margin:'5px 0'}}>{i===0?'2 290 000 €':i===1?'Appartement':'Maison'}</div><div style={{fontSize:12}}>{i===0?'266 m² · 5 pièces':'À découvrir en vidéo'}</div></div></div>)}</div>
  </div></Reveal>
  <Reveal delay={22} style={{position:'absolute',right:79,top:527,width:244,height:441}}><div style={{height:'100%',border:'8px solid #17241d',borderRadius:35,background:C.paper,overflow:'hidden',boxShadow:'0 20px 45px #14291f44',transform:'rotate(4deg)'}}><div style={{height:29,textAlign:'center',fontSize:10,paddingTop:8,fontWeight:650}}>9:41</div><div style={{fontSize:16,padding:'9px 14px',fontWeight:650}}>Votre agence</div><Img src={photo(3)} style={{width:'100%',height:106,objectFit:'cover'}}/><div style={{padding:'11px 13px',fontSize:17,fontWeight:650}}>Votre prochain<br/>chez-vous.</div><div style={{margin:'0 10px',height:178,borderRadius:10,overflow:'hidden',position:'relative'}}><Img src={photo(1)} style={{height:'100%',width:'100%',objectFit:'cover'}}/><div style={{position:'absolute',left:12,bottom:12,color:'white',fontSize:18,fontWeight:650}}>Le Rouret<br/>2 290 000 €</div></div></div></Reveal>
 </AbsoluteFill>;
};

export const SharingScene=()=>{
 const f=useCurrentFrame();
 return <AbsoluteFill style={{color:C.ink}}><Paper/><Topline label="05 / À voir. À partager."/>
  <div style={{position:'absolute',left:86,top:204}}><Reveal><Heading style={{fontSize:105}}>Une vidéo.<br/><Italic>Plusieurs façons<br/>de la partager.</Italic></Heading></Reveal><Reveal delay={14} style={{marginTop:32,fontSize:30,lineHeight:1.45,color:C.muted}}>Du grand écran au creux de la main.<br/>Votre communication garde le rythme.</Reveal>
   <Reveal delay={25} style={{display:'flex',gap:13,marginTop:36}}><Pill><Icon name="phone"/> Vertical</Pill><Pill><Icon name="share"/> Horizontal</Pill></Reveal>
  </div>
  <div style={{position:'absolute',left:921,top:229,width:880,height:660}}>
   <Reveal delay={3} style={{position:'absolute',left:28,top:62,width:372,height:604}}><div style={{height:'100%',borderRadius:26,overflow:'hidden',boxShadow:shadow,transform:'rotate(-5deg)',position:'relative'}}><OffthreadVideo src={staticFile('source/example.mp4')} muted trimBefore={360} style={{height:'100%',width:'100%',objectFit:'cover'}}/><Pill dark style={{position:'absolute',left:19,top:18,fontSize:19}}>Reels · Stories</Pill></div></Reveal>
   <Reveal delay={12} style={{position:'absolute',left:370,top:96,width:500,height:319}}><div style={{height:'100%',borderRadius:21,overflow:'hidden',background:'white',boxShadow:shadow,transform:'rotate(4deg)'}}><div style={{height:47,padding:'12px 18px',fontSize:18,fontWeight:550,display:'flex',justifyContent:'space-between'}}><span>Votre agence</span><span style={{color:C.muted}}>•••</span></div><Img src={photo(4)} style={{width:'100%',height:229,objectFit:'cover',transform:`scale(${1.015+f*.00015})`}}/><div style={{fontSize:17,padding:'10px 18px',color:C.muted}}>Une nouvelle visite à découvrir.</div></div></Reveal>
   <Reveal delay={23} style={{position:'absolute',left:442,top:456,width:385}}><div style={{background:C.sage,borderRadius:19,padding:25,boxShadow:shadow,transform:'rotate(2deg)'}}><div style={{display:'flex',alignItems:'center',gap:13,fontSize:23,fontWeight:650}}><Icon name="calendar" size={29}/> Publications</div><div style={{display:'flex',gap:10,marginTop:20}}>{[1,2,3].map((n,i)=><div key={n} style={{height:70,flex:1,borderRadius:9,overflow:'hidden',position:'relative'}}><Img src={photo(n)} style={{width:'100%',height:'100%',objectFit:'cover'}}/><div style={{position:'absolute',right:5,bottom:5,background:C.ink,color:'white',borderRadius:'50%',width:20,height:20,display:'grid',placeItems:'center',opacity:ease(f,36+i*12,10)}}><Icon name="check" size={12}/></div></div>)}</div><div style={{fontSize:18,color:C.green,marginTop:13}}>Votre calendrier, au même endroit.</div></div></Reveal>
  </div>
 </AbsoluteFill>;
};

export const SignatureScene=()=>{
 const f=useCurrentFrame(),p=ease(f,0,32);
 return <AbsoluteFill style={{color:C.ink}}><Paper color={C.sage}/>
  <div style={{position:'absolute',inset:0,background:'radial-gradient(ellipse at 50% 40%,#faf9f5a0,transparent 64%)'}}/>
  <div style={{position:'absolute',left:0,right:0,top:176,display:'flex',alignItems:'center',flexDirection:'column',transform:`scale(${lerp(.97,1,p)})`}}><Reveal><Logo size={175}/></Reveal><Reveal delay={5} style={{marginTop:55,textAlign:'center'}}><Heading style={{fontSize:103}}>Vous rentrez le mandat.<br/><Italic>BienVu s’occupe du marketing.</Italic></Heading></Reveal><Reveal delay={17} style={{fontSize:29,marginTop:31,color:C.muted}}>Le studio marketing IA de votre agence immobilière.</Reveal><Reveal delay={25} style={{marginTop:43}}><Button style={{padding:'24px 37px',fontSize:29}}>Créez votre première vidéo</Button></Reveal><Reveal delay={32} style={{fontSize:28,marginTop:25,fontWeight:550,letterSpacing:.5}}>bienvu.online</Reveal></div>
  <div style={{position:'absolute',left:86,right:86,bottom:66,display:'flex',alignItems:'center',justifyContent:'space-between',fontSize:20,color:C.muted}}><span>Vos biens méritent d’être bien vus.</span><span>Import · Vidéo · Éditeur · Vitrine</span></div>
 </AbsoluteFill>;
};
