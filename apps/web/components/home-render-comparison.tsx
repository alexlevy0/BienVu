'use client';
import {useEffect,useRef,useState} from 'react';
import {HomeIcon} from './home-icons';
import {HomeVisual,useHomepageMedia,type HomeMediaView} from './homepage-media';
import {previewVideoUrl} from '../lib/home-media-view';
import {synchronizeVideoGroup,type VideoPairState} from '../lib/synchronized-videos';
import {homeRenderPresets,homeRenderExampleCredits,type HomeRenderPreset} from '../lib/home-render-presets';

const clock=(seconds:number)=>`${String(Math.floor(Math.max(0,seconds)/60)).padStart(2,'0')}:${String(Math.floor(Math.max(0,seconds)%60)).padStart(2,'0')}`;
type Mode='all'|0|1|2;
type Props={paused:boolean;selected?:HomeRenderPreset|null;onChoose(preset:HomeRenderPreset):void;onPlayingChange?(playing:boolean):void};
export function HomeRenderComparison(props:Props){
  const standard=useHomepageMedia('renders.standard.video'),avatar=useHomepageMedia('renders.avatar.video'),ai=useHomepageMedia('renders.avatar-ai.video');
  return <RenderPlayers key={[standard,avatar,ai].map(m=>m.src).join('|')} media={[standard,avatar,ai]} {...props}/>;
}
function SoundIcon({muted}:{muted:boolean}){return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M11 4 6 8H2v8h4l5 4V4Z"/>{muted?<path d="m16 9 6 6m0-6-6 6"/>:<><path d="M15 8a6 6 0 0 1 0 8m3-11a10 10 0 0 1 0 14"/></>}</svg>;}
function RenderPlayers({media,paused,selected,onChoose,onPlayingChange}:Props&{media:[HomeMediaView,HomeMediaView,HomeMediaView]}){
  const players=useRef<(HTMLVideoElement|null)[]>([]),section=useRef<HTMLElement>(null),frame=useRef<HTMLDivElement>(null),
    controller=useRef<ReturnType<typeof synchronizeVideoGroup>|null>(null),modeRef=useRef<Mode|null>(null);
  const [mode,setMode]=useState<Mode|null>(null),[muted,setMuted]=useState(true),[shown,setShown]=useState<boolean[]>([false,false,false]),
    [state,setState]=useState<VideoPairState>({requested:false,playing:false,loading:false,ready:false,error:false,time:0,duration:20});
  useEffect(()=>{
    const observer=typeof IntersectionObserver==='undefined'?null:new IntersectionObserver(entries=>{if(!entries.some(e=>e.isIntersecting))controller.current?.pause();});
    if(section.current)observer?.observe(section.current);
    const hidden=()=>{if(document.hidden)controller.current?.pause();};
    const other=(event:Event)=>{if(event.target instanceof HTMLMediaElement&&!players.current.includes(event.target as HTMLVideoElement)&&!event.target.muted)controller.current?.pause();};
    document.addEventListener('visibilitychange',hidden);document.addEventListener('play',other,true);
    return()=>{observer?.disconnect();controller.current?.destroy();document.removeEventListener('visibilitychange',hidden);document.removeEventListener('play',other,true);};
  },[]);
  useEffect(()=>{if(paused)controller.current?.pause();},[paused]);
  useEffect(()=>{onPlayingChange?.(state.playing);return()=>onPlayingChange?.(false);},[state.playing,onPlayingChange]);
  function prepare(next:Mode,time:number){
    controller.current?.destroy();players.current.forEach(player=>player?.pause());
    const indices=next==='all'?[0,1,2]:[next],videos=indices.map(index=>players.current[index]!);
    modeRef.current=next;setMode(next);
    for(const [position,index] of indices.entries()){
      const player=videos[position];player.muted=position!==0||muted;
      // No MP4 request is made before an explicit playback interaction.
      if(!player.getAttribute('src')){player.preload='auto';player.src=previewVideoUrl(media[index].src,540);player.load();}
      else if(player.error){player.load();}
    }
    controller.current=synchronizeVideoGroup(videos,setState,time,Math.min(...indices.map(index=>media[index].duration??20)));
  }
  function toggle(next:Mode){
    if(paused)return;
    if(modeRef.current===next&&!state.error){if(state.requested)controller.current?.pause();else controller.current?.play();return;}
    prepare(next,0);controller.current?.play();
  }
  function seek(next:Mode,time:number){if(modeRef.current!==next||state.error)prepare(next,time);controller.current?.seek(time);}
  function sound(index?:0|1|2){
    if(index!==undefined&&(modeRef.current==='all'?index!==0:modeRef.current!==index)){
      const resume=state.requested;prepare(index,players.current[index]?.currentTime??0);setMuted(false);
      players.current.forEach((player,i)=>{if(player)player.muted=i!==index;});if(resume)controller.current?.play();return;
    }
    const next=!muted;setMuted(next);
    const audible=typeof modeRef.current==='number'?modeRef.current:0;
    players.current.forEach((player,i)=>{if(player)player.muted=i!==audible||next;});
  }
  const expand=async(index?:number)=>{try{if(document.fullscreenElement)await document.exitFullscreen();else await(index===undefined?frame.current:players.current[index]?.parentElement)?.requestFullscreen?.();}catch{/* Controls remain usable when fullscreen is unavailable. */}};
  return <section ref={section} className="home-renders" aria-labelledby="home-renders-title">
    <header className="home-renders-heading"><h2 id="home-renders-title">Une annonce. <em>Trois rendus.</em></h2><p>Comparez les fonctionnalités et les crédits, sur le même bien.</p>
      <span className="home-renders-example"><HomeIcon name="image" size={16}/>Exemple : 20 s · 4 photos</span></header>
    <div ref={frame} className="home-renders-frame"><div className="home-renders-grid">
      {homeRenderPresets.map((preset,index)=>{
        const own=mode==='all'||mode===index,current=own?state.time:players.current[index]?.currentTime??0,duration=own?state.duration:media[index].duration??20,
          isPlaying=own&&state.playing,isLoading=own&&state.loading,isError=own&&state.error,credits=homeRenderExampleCredits(preset.id),cardMuted=muted||!own||mode==='all'&&index!==0,
          poster={...media[index],kind:'image' as const,src:media[index].poster??`/images/studio-home/renders-${preset.id}.webp`};
        return <article key={preset.id} className={`home-render-card${index===2?' is-featured':''}${selected===preset.id?' is-selected':''}`}>
          <header><span className="home-render-number">0{index+1}</span><div><h3>{preset.title}</h3><p>{preset.subtitle}</p></div></header>
          <div className="home-render-video" aria-busy={isLoading}>
            <HomeVisual media={poster} alt={`Aperçu du rendu ${preset.title}`} sizes="(max-width: 620px) 82vw, (max-width: 900px) 30vw, (max-width: 1500px) calc((100vw - 400px) / 3), 440px"/>
            <video ref={element=>{players.current[index]=element;}} muted playsInline preload="none" tabIndex={-1} className={shown[index]&&!isError?'is-shown':undefined}
              onLoadedData={()=>setShown(current=>current.map((value,i)=>i===index||value))} aria-label={`Vidéo ${preset.title}`}/>
            {index===2&&<span className="home-render-ai"><HomeIcon name="sparkle" size={14} filled/>Animations IA</span>}
            {!isPlaying&&!isLoading&&<button type="button" className="home-render-big-play" disabled={paused} onClick={()=>toggle(index as 0|1|2)} aria-label={`${isError?'Réessayer':'Lire'} le rendu ${preset.title}`}><HomeIcon name={isError?'refresh':'play'} size={30} filled={!isError}/></button>}
            {isLoading&&<span className="home-render-loading" role="status"><span/>Chargement{mode==='all'?' synchronisé':''}…</span>}
            <div className="home-render-controls">
              <button type="button" disabled={paused} aria-label={`${own&&state.requested?'Mettre en pause':'Lire'} ${preset.title}`} onClick={()=>toggle(index as 0|1|2)}><HomeIcon name={own&&state.requested?'pause':'play'} size={16} filled/></button>
              <span>{clock(current)} / {clock(duration)}</span><input type="range" min="0" max={duration||20} step=".05" value={Math.min(current,duration)} aria-label={`Position de lecture ${preset.title}`} onChange={event=>seek(index as 0|1|2,Number(event.target.value))}/>
              <button type="button" aria-label={`${cardMuted?'Activer':'Couper'} le son ${preset.title}`} aria-pressed={!cardMuted} onClick={()=>sound(index as 0|1|2)}><SoundIcon muted={cardMuted}/></button>
              <button type="button" aria-label={`Plein écran ${preset.title}`} onClick={()=>void expand(index)}><HomeIcon name="fullscreen" size={16}/></button>
            </div>
          </div>
          <div className="home-render-price"><strong>{credits} crédit{credits>1?'s':''}</strong><p>{preset.description}</p></div>
          <ul>{preset.features.map(feature=><li key={feature}><span aria-hidden="true"><HomeIcon name="check" size={14}/></span>{feature}</li>)}</ul>
          <button type="button" className="home-render-choose" aria-pressed={selected===preset.id} onClick={()=>{controller.current?.pause();onChoose(preset.id);}}>Choisir ce rendu<HomeIcon name="arrow" size={19}/></button>
        </article>;
      })}
    </div>
    <div className="home-renders-controls" role="group" aria-label="Lecture synchronisée des trois rendus">
      <button type="button" className="home-renders-play-all" disabled={paused} onClick={()=>toggle('all')}><HomeIcon name={mode==='all'&&state.requested?'pause':'play'} size={17} filled/>{mode==='all'&&state.requested?'Mettre les 3 en pause':'Lire les 3 vidéos'}</button>
      <input type="range" min="0" max={mode==='all'?state.duration||20:20} step=".05" value={mode==='all'?state.time:0} aria-label="Position de lecture des trois rendus" onChange={event=>seek('all',Number(event.target.value))}/>
      <span>{clock(mode==='all'?state.time:0)} / {clock(mode==='all'?state.duration:20)}</span>
      <button type="button" aria-label={muted?'Activer le son des trois rendus':'Couper le son des trois rendus'} aria-pressed={!muted} onClick={()=>sound()}><SoundIcon muted={muted}/></button>
      <button type="button" aria-label="Afficher les trois rendus en plein écran" onClick={()=>void expand()}><HomeIcon name="fullscreen" size={20}/></button>
    </div></div>
    {state.error&&<p className="home-renders-feedback" role="alert">Une vidéo n’a pas pu être chargée. Relancez sa lecture ou essayez un autre rendu.</p>}
    <p className="home-renders-note"><HomeIcon name="coins" size={17}/>Coûts totaux pour cet exemple de 20 secondes : 1, 3 et 7 crédits.<span>Le coût de votre vidéo s’adapte à sa durée et aux photos animées choisies.</span></p>
  </section>;
}
