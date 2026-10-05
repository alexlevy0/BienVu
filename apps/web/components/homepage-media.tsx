'use client';
import {createContext,useContext,useEffect,useRef,type CSSProperties,type ReactNode} from 'react';
import {homepageSlots,type HomepageConfig,type HomepageSlot} from '@bienvu/contracts';

const Context=createContext<HomepageConfig>({version:0,slots:{}});
export function HomepageMediaProvider({config,children}:{config:HomepageConfig;children:ReactNode}){return <Context.Provider value={config}>{children}</Context.Provider>;}
export function useHomepageConfig(){return useContext(Context);}
export type HomeMediaView={src:string;poster:string|null;kind:'image'|'video';custom:boolean;title:string|null;agency:string|null;locality:string|null;duration:number|null;width:number|null;height:number|null};
export function useHomepageMedia(id:HomepageSlot):HomeMediaView {
 const config=useContext(Context),slot=homepageSlots.find(s=>s.id===id)!;
 let asset=config.slots[id],cover=false;
 if(!asset&&id.endsWith('.visual')){const partner=config.slots[id.replace(/\.visual$/,'.video') as HomepageSlot];if(partner){asset=partner;cover=true;}}
 if(!asset&&id.endsWith('.video')){const partner=config.slots[id.replace(/\.video$/,'.visual') as HomepageSlot];if(partner?.kind==='video')asset=partner;}
 if(asset)return {src:cover&&asset.posterUrl?asset.posterUrl:asset.url,poster:asset.posterUrl,kind:cover&&asset.posterUrl?'image':asset.kind,custom:true,title:asset.title,agency:asset.agency,locality:asset.locality,duration:asset.durationMs?asset.durationMs/1000:null,width:asset.width,height:asset.height};
 return {src:slot.src,poster:slot.kind==='video'?slot.src.replace('/videos/','/images/').replace(/\.mp4$/,'.webp'):null,
  kind:slot.kind==='video'?'video':'image',custom:false,title:null,agency:null,locality:null,duration:null,width:null,height:null};
}
// Static areas use the poster of a selected video. In the editor demonstration,
// the same component follows the selected clip and its timeline playhead.
export function HomeVisual({media,alt='',className,style,loading='lazy',fetchPriority,time,playing=false}:{media:HomeMediaView;alt?:string;className?:string;style?:CSSProperties;loading?:'eager'|'lazy';fetchPriority?:'high'|'low'|'auto';time?:number;playing?:boolean}){
 const ref=useRef<HTMLVideoElement>(null),moving=media.kind==='video'&&(!media.poster||time!==undefined);
 useEffect(()=>{
  const player=ref.current;if(!player||!moving)return;
  const sync=()=>{if(time!==undefined&&Number.isFinite(player.duration)&&player.duration>0){const target=time%player.duration;if(Math.abs(player.currentTime-target)>.2)player.currentTime=target;}
   if(playing){void player.play().catch(()=>{});}else player.pause();};
  sync();player.addEventListener('loadedmetadata',sync);return()=>player.removeEventListener('loadedmetadata',sync);
 },[moving,media.src,time,playing]);
 useEffect(()=>()=>ref.current?.pause(),[]);
 if(moving)return <video ref={ref} src={media.src} poster={media.poster??undefined} className={className} style={style} width="768" height="1024" muted playsInline loop={playing} preload="metadata" aria-label={alt||undefined}/>;
 return <img src={media.kind==='video'?media.poster!:media.src} className={className} style={style} width="768" height="1024" alt={alt} loading={loading} fetchPriority={fetchPriority} decoding="async"/>;
}

export function homeClock(seconds:number){const time=Math.max(0,Math.round(seconds));return `${Math.floor(time/60)}:${String(time%60).padStart(2,'0')}`;}
