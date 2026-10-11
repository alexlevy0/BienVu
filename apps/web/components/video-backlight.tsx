'use client';

import {useEffect,useRef,type ReactNode,type RefObject} from 'react';
import './video-backlight.css';

export function VideoBacklight({video,active=true,poster,posterLoading='eager',children,className=''}:{
  video?:RefObject<HTMLVideoElement|null>;active?:boolean;poster?:string|null;posterLoading?:'eager'|'lazy';children?:ReactNode;className?:string}){
  const canvas=useRef<HTMLCanvasElement>(null);
  useEffect(()=>{
    const player=video?.current,surface=canvas.current;
    if(!active||!player||!surface)return;
    const context=surface.getContext('2d',{alpha:false});
    if(!context)return;
    const reduced=matchMedia('(prefers-reduced-motion: reduce)');
    let visible=true,broken=false,disposed=false,lastDraw=-Infinity,lastTime=-1,frame:number|null=null,animation:number|null=null;
    const stop=()=>{
      if(frame!==null)player.cancelVideoFrameCallback(frame);
      if(animation!==null)cancelAnimationFrame(animation);
      frame=null;animation=null;
    };
    const available=()=>!disposed&&!broken&&visible&&!document.hidden&&!reduced.matches;
    const draw=()=>{
      if(!available()||player.readyState<2||!player.videoWidth||!player.videoHeight)return;
      // Project each decoded frame spatially, using a tiny 96 px surface.
      // No second video, pixel readback, media request or React render per frame.
      const scale=96/Math.max(player.videoWidth,player.videoHeight);
      const width=Math.max(1,Math.round(player.videoWidth*scale)),height=Math.max(1,Math.round(player.videoHeight*scale));
      if(surface.width!==width||surface.height!==height){surface.width=width;surface.height=height;}
      try{context.drawImage(player,0,0,width,height);lastTime=player.currentTime;if(!surface.dataset.painted)surface.dataset.painted='true';}
      catch{broken=true;delete surface.dataset.painted;stop();}
    };
    const schedule=()=>{
      if(!available()||player.paused||player.ended||frame!==null||animation!==null)return;
      if(typeof player.requestVideoFrameCallback==='function')frame=player.requestVideoFrameCallback(now=>tick(now,true));
      else animation=requestAnimationFrame(tick);
    };
    const tick=(now:number,decoded=false)=>{
      frame=null;animation=null;
      if(!available()||player.paused||player.ended)return;
      // Native callbacks follow the video's frames; older browsers sample only
      // changed frames, at up to 30 fps, instead of redrawing at screen rate.
      if(decoded||now-lastDraw>=1000/30&&player.currentTime!==lastTime){draw();lastDraw=now;}
      schedule();
    };
    const sync=()=>{stop();draw();schedule();};
    // Restore the poster while MSE detaches or the final MP4 is loading.
    const reset=()=>{stop();broken=false;lastTime=-1;delete surface.dataset.painted;};
    const observer=typeof IntersectionObserver==='undefined'?null:new IntersectionObserver(entries=>{
      visible=entries[0]?.isIntersecting??false;sync();
    });
    observer?.observe(player);
    for(const name of ['playing','pause','seeked','loadeddata'])player.addEventListener(name,sync);
    for(const name of ['emptied','error'])player.addEventListener(name,reset);
    document.addEventListener('visibilitychange',sync);reduced.addEventListener('change',sync);sync();
    return()=>{
      disposed=true;stop();observer?.disconnect();
      for(const name of ['playing','pause','seeked','loadeddata'])player.removeEventListener(name,sync);
      for(const name of ['emptied','error'])player.removeEventListener(name,reset);
      document.removeEventListener('visibilitychange',sync);reduced.removeEventListener('change',sync);
    };
  },[active,video]);
  return <div className={`video-backlight ${className}`} aria-hidden="true">
    {!children&&<span className="video-backlight-fallback"/>}
    {poster&&<img key={poster} src={poster} alt="" loading={posterLoading} decoding="async" fetchPriority="low"
      onLoad={event=>{event.currentTarget.dataset.loaded='true';}}
      onError={event=>{delete event.currentTarget.dataset.loaded;event.currentTarget.style.visibility='hidden';}}/>}
    {children}
    <canvas ref={canvas} width="54" height="96"/>
  </div>;
}
