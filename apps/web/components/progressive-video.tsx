'use client';
import {useEffect,useRef,useState} from 'react';
import type Hls from 'hls.js';
import {VideoBacklight} from './video-backlight';
import './progressive-video.css';

export function ProgressiveVideo({jobId,anonymous=false,active,finalUrl,poster,percent=0,label}:{
  jobId:string;anonymous?:boolean;active:boolean;finalUrl?:string|null;poster?:string|null;percent?:number;label:string}){
  const video=useRef<HTMLVideoElement>(null),started=useRef(false),latest=useRef({active,finalUrl});
  const resume=useRef<{time:number;playing:boolean}|null>(null),wantsPlayback=useRef(false);
  latest.current={active,finalUrl};
  const [streamUrl,setStreamUrl]=useState<string|null>(null),[waiting,setWaiting]=useState(false),[broken,setBroken]=useState(false),[streamReady,setStreamReady]=useState(false);
  const final=Boolean(finalUrl&&(!started.current||broken)),base=`/api/${anonymous?'trial':'generations'}/${encodeURIComponent(jobId)}/stream`;
  useEffect(()=>{
    if(!active||streamUrl||final)return;
    const abort=new AbortController();let timer:ReturnType<typeof setTimeout>|undefined;
    async function poll(){try{const response=await fetch(base,{cache:'no-store',signal:abort.signal});
      if(response.ok&&response.status!==204){const value=await response.json() as {url?:string};
        if(value.url===base+'/index.m3u8'){setStreamUrl(value.url);return;}}
    }catch{/* Rendering continues when the preview connection is interrupted. */}
      if(!abort.signal.aborted&&latest.current.active)timer=setTimeout(()=>void poll(),2000);
    }void poll();return()=>{abort.abort();if(timer)clearTimeout(timer);};
  },[base,active,streamUrl,final]);
  useEffect(()=>{
    const player=video.current;if(!streamUrl||final||broken||!player)return;
    let cancelled=false,engine:Hls|undefined;
    const failed=()=>{
      if(cancelled)return;
      resume.current={time:player.currentTime,playing:wantsPlayback.current};setBroken(true);setWaiting(false);
    };
    // Load and buffer the first frames immediately. Playback itself remains
    // controlled by the native video controls, without a second launch button.
    void (async()=>{
      try{
        const {default:Hls}=await import('hls.js');if(cancelled)return;
        if(!Hls.isSupported()){
          if(player.canPlayType('application/vnd.apple.mpegurl')){player.src=streamUrl;player.load();return;}
          failed();return;
        }
        engine=new Hls({autoStartLoad:true,startPosition:0,liveSyncMode:'buffered',liveSyncDurationCount:1,
          liveMaxLatencyDurationCount:Infinity,maxLiveSyncPlaybackRate:1,maxBufferLength:6,maxMaxBufferLength:40,
          backBufferLength:40,enableWorker:true});
        engine.on(Hls.Events.ERROR,(_,event)=>{if(event.fatal)failed();});
        engine.attachMedia(player);engine.loadSource(streamUrl);
      }catch{failed();}
    })();
    return()=>{cancelled=true;engine?.destroy();player.pause();};
  },[streamUrl,final,broken]);
  useEffect(()=>{if(final){
    setWaiting(false);
    // Detaching MSE removes the media source. Install the MP4 after detach,
    // then restore the position when its metadata becomes available.
    if(video.current&&finalUrl){video.current.src=finalUrl;video.current.load();}
  }},[final,finalUrl]);
  // A final upload can succeed while the last preview upload fails. Do not
  // leave a viewer stuck at the end of an incomplete playlist in that case.
  useEffect(()=>{
    if(!finalUrl||final||!waiting)return;
    const timer=setTimeout(()=>{resume.current={time:video.current?.currentTime??0,playing:wantsPlayback.current};setBroken(true);},8000);
    return()=>clearTimeout(timer);
  },[finalUrl,final,waiting]);
  return <div className="progressive-video video-backlight-frame" data-frames-ready={streamReady||undefined} data-streaming={streamReady&&!final||undefined}>
    <VideoBacklight video={video} poster={poster}/>
    <div className="progressive-video-surface">
    <video ref={video} src={final?finalUrl??undefined:undefined} poster={poster??undefined} controls={final||Boolean(streamUrl)} playsInline preload="auto" aria-label={label}
      onLoadedMetadata={()=>{const player=video.current,target=resume.current;if(final&&player&&target){resume.current=null;player.currentTime=Math.min(target.time,player.duration);if(target.playing)void player.play().catch(()=>setWaiting(false));}}}
      onEmptied={()=>setStreamReady(false)} onLoadedData={()=>setStreamReady(true)} onPlay={()=>{started.current=true;wantsPlayback.current=true;}}
      onWaiting={()=>{if(wantsPlayback.current)setWaiting(true);}} onPlaying={()=>{wantsPlayback.current=true;setWaiting(false);}} onPause={()=>{if(!resume.current)wantsPlayback.current=false;setWaiting(false);}}
      onEnded={()=>{wantsPlayback.current=false;setWaiting(false);}} onError={()=>{if(!final){resume.current={time:video.current?.currentTime??0,playing:wantsPlayback.current};setBroken(true);setWaiting(false);}}}/>
    {!final&&!streamReady&&!broken&&<div className="progressive-video-start" role="status">
      <span className="progressive-video-spinner" aria-hidden="true"/><strong>Assemblage · {percent} %</strong><span>Les premières secondes seront bientôt disponibles.</span>
    </div>}
    {waiting&&<div className="progressive-video-wait" role="status"><span className="progressive-video-spinner" aria-hidden="true"/><span>Assemblage de la suite…</span></div>}
    {broken&&!final&&<p className="progressive-video-feedback" role="status">L’aperçu est momentanément indisponible. La création continue ; la vidéo complète sera disponible à la fin.</p>}
    </div>
  </div>;
}
