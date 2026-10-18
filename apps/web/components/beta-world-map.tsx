'use client';
import {useEffect,useRef,useState} from 'react';
import type {Map as LibreMap,Marker,StyleSpecification} from 'maplibre-gl';
import {HomeIcon} from './home-icons';
import {worldClusters,type WorldActivity,type WorldPlace} from '../lib/world-map-view';
import 'maplibre-gl/dist/maplibre-gl.css';
import './beta-world-map.css';

function loadMap(){
 // @ts-expect-error Pinned browser ESM is served locally, outside the module graph.
 return import(/* webpackIgnore: true */ '/maplibre/maplibre-gl.mjs') as Promise<typeof import('maplibre-gl')>;
}
const worldBounds=[[-174,-58],[180,80]] as [[number,number],[number,number]];
const style:StyleSpecification={version:8,sources:{land:{type:'geojson',data:'/maps/world-110m.geojson',attribution:'<a href="https://www.naturalearthdata.com/" target="_blank" rel="noopener">Natural Earth</a>'}},layers:[
 {id:'ocean',type:'background',paint:{'background-color':'#e8eee5'}},
 {id:'land',type:'fill',source:'land',paint:{'fill-color':'#fafaf4','fill-opacity':.98}},
 {id:'borders',type:'line',source:'land',paint:{'line-color':'#bdcbb7','line-width':.65,'line-opacity':.7}},
]};
const reduced=()=>window.matchMedia('(prefers-reduced-motion: reduce)').matches;

function WorldCanvas({places,selected,onSelect}:{places:WorldPlace[];selected:string|null;onSelect(place:WorldPlace,trigger?:HTMLButtonElement):void}){
 const host=useRef<HTMLDivElement>(null),map=useRef<LibreMap|null>(null),[error,setError]=useState(false);
 const select=useRef(onSelect),selection=useRef(selected);select.current=onSelect;selection.current=selected;
 const markers=useRef(new Map<string,{marker:Marker;button:HTMLButtonElement;placeId:string|null}>());
 useEffect(()=>{
  let disposed=false,value:LibreMap|undefined,resize:ResizeObserver|undefined;
  void loadMap().then(lib=>{
   if(disposed||!host.current)return;
   lib.setWorkerUrl('/maplibre/maplibre-gl-worker.mjs');
   value=new lib.Map({container:host.current,style,center:[0,25],zoom:.5,minZoom:.2,maxZoom:8,
    renderWorldCopies:false,dragRotate:false,pitchWithRotate:false,touchPitch:false,cooperativeGestures:true,
    attributionControl:{compact:true},locale:{'CooperativeGesturesHandler.WindowsHelpText':'Utilisez Ctrl + la molette pour zoomer','CooperativeGesturesHandler.MacHelpText':'Utilisez ⌘ + la molette pour zoomer','CooperativeGesturesHandler.MobileHelpText':'Utilisez deux doigts pour déplacer la carte'},canvasContextAttributes:{antialias:true},pixelRatio:Math.min(window.devicePixelRatio||1,2)});
   map.current=value;value.touchZoomRotate.disableRotation();
   value.fitBounds(worldBounds,{padding:28,duration:0});
   function refresh(){
    if(!value||disposed)return;
    const clusters=worldClusters(places,value.getZoom()),keep=new Set<string>();
    for(const cluster of clusters){
     keep.add(cluster.id);let entry=markers.current.get(cluster.id);
     if(!entry){const button=document.createElement('button');button.type='button';button.className='beta-world-pin';
      const marker=new lib.Marker({element:button,anchor:'center'}).setLngLat([cluster.longitude,cluster.latitude]).addTo(value);
      entry={marker,button,placeId:cluster.places.length===1?cluster.places[0].id:null};markers.current.set(cluster.id,entry);
      button.addEventListener('click',event=>{event.stopPropagation();
       if(cluster.places.length===1)select.current(cluster.places[0],button);
       else if(value&&value.getZoom()<7.5)value.easeTo({center:[cluster.longitude,cluster.latitude],zoom:Math.min(8,value.getZoom()+2),duration:reduced()?0:500});
       else select.current({id:cluster.id,locality:`Autour de ${cluster.places[0].locality}`,latitude:cluster.latitude,longitude:cluster.longitude,count:cluster.count,videos:cluster.places.flatMap(p=>p.videos).slice(0,30)},button);
      });}
     entry.button.textContent=cluster.count>1?String(cluster.count):'';
     entry.button.dataset.cluster=String(cluster.places.length>1);
     entry.button.dataset.selected=String(cluster.places.length===1&&cluster.places[0].id===selection.current);
     entry.button.setAttribute('aria-label',cluster.places.length===1?`${cluster.places[0].locality} · ${cluster.count} vidéo${cluster.count>1?'s':''} · ouvrir l’aperçu`:`${cluster.count} vidéos dans ${cluster.places.length} lieux · agrandir`);
     entry.button.title=entry.button.getAttribute('aria-label')!;
    }
    for(const [id,entry] of markers.current)if(!keep.has(id)){entry.marker.remove();markers.current.delete(id);}
   }
   value.on('load',refresh);value.on('zoomend',refresh);
   value.on('error',()=>{if(!disposed)setError(true);});
   resize=new ResizeObserver(()=>value?.resize());resize.observe(host.current);
  }).catch(()=>{if(!disposed)setError(true);});
  return()=>{disposed=true;resize?.disconnect();for(const entry of markers.current.values())entry.marker.remove();markers.current.clear();value?.remove();map.current=null;};
 },[places]);
 useEffect(()=>{for(const entry of markers.current.values())entry.button.dataset.selected=String(entry.placeId===selected);},[selected]);
 return <><div ref={host} className="beta-world-canvas" role="region" aria-label="Carte mondiale des vidéos BienVu"/>
  {!error&&<div className="beta-world-controls" role="group" aria-label="Navigation de la carte"><button type="button" aria-label="Agrandir la carte" onClick={()=>map.current?.zoomIn({duration:reduced()?0:250})}>+</button><button type="button" aria-label="Réduire la carte" onClick={()=>map.current?.zoomOut({duration:reduced()?0:250})}>−</button><button type="button" aria-label="Revenir à la vue du monde" onClick={()=>map.current?.fitBounds(worldBounds,{padding:28,duration:reduced()?0:650})}><HomeIcon name="globe" size={18}/></button></div>}
  {error&&<p className="beta-world-map-error" role="status">La carte est momentanément indisponible. Retrouvez les lieux et leurs vidéos ci-dessous.</p>}
 </>;
}

function VideoPreview({place,index,onIndex,onClose,onPlayingChange}:{place:WorldPlace;index:number;onIndex(index:number):void;onClose():void;onPlayingChange?(playing:boolean):void}){
 const player=useRef<HTMLVideoElement>(null),[started,setStarted]=useState(false),[error,setError]=useState(false),video=place.videos[index];
 useEffect(()=>{setStarted(false);setError(false);return()=>{onPlayingChange?.(false);};},[video?.id,onPlayingChange]);
 useEffect(()=>{const element=player.current;if(!element||!started||!('IntersectionObserver'in window))return;
  const observer=new IntersectionObserver(entries=>{if(entries.every(entry=>!entry.isIntersecting))element.pause();});observer.observe(element);return()=>observer.disconnect();},[started,video?.id]);
 async function play(){setError(false);try{await player.current?.play();setStarted(true);}catch{setError(true);}}
 return <aside className="beta-world-preview" aria-label={`Vidéos de ${place.locality}`}>
  <header><span><HomeIcon name="location" size={14}/>{place.locality}</span><button type="button" onClick={onClose} aria-label="Fermer l’aperçu"><HomeIcon name="close" size={17}/></button></header>
  {video?<><div className="beta-world-movie" style={{aspectRatio:`${video.width}/${video.height}`}}>
   <video key={video.id} ref={player} src={video.url} poster={video.poster??undefined} controls={started} playsInline preload="none" aria-label={video.title} style={{objectFit:started?'contain':'cover'}}
    onPlay={()=>{setStarted(true);onPlayingChange?.(true);}} onPause={()=>onPlayingChange?.(false)} onEnded={()=>onPlayingChange?.(false)} onError={()=>setError(true)}/>
   {!started&&!error&&<button type="button" className="beta-world-play" aria-label={`Lire : ${video.title}`} onClick={()=>void play()}><HomeIcon name="play" size={22} filled/></button>}
   {!started&&<span className="beta-world-duration">{Math.round(video.seconds)} s</span>}
   {error&&<p role="alert">Cet aperçu est momentanément indisponible.</p>}
  </div><p className="beta-world-video-title">{video.title}</p>
  {place.videos.length>1&&<nav aria-label="Autres vidéos de ce lieu"><button type="button" aria-label="Vidéo précédente" onClick={()=>onIndex((index-1+place.videos.length)%place.videos.length)}>←</button><span>{index+1} / {place.videos.length}</span><button type="button" aria-label="Vidéo suivante" onClick={()=>onIndex((index+1)%place.videos.length)}>→</button></nav>}
  {video.href&&<a href={video.href}>Voir le bien <HomeIcon name="arrow" size={13}/></a>}
  </>:<div className="beta-world-no-video"><HomeIcon name="video" size={25}/><p>{place.count} vidéo{place.count>1?'s ont':' a'} été créée{place.count>1?'s':''} ici.</p><small>Les aperçus de ce lieu ne sont pas encore publics.</small></div>}
 </aside>;
}

export function BetaWorldMap({onPlayingChange}:{onPlayingChange?(playing:boolean):void}){
 const section=useRef<HTMLElement>(null),close=useRef<HTMLButtonElement|null>(null);
 const [near,setNear]=useState(false),[data,setData]=useState<WorldActivity|null>(null),[error,setError]=useState(false),[revision,setRevision]=useState(0);
 const [active,setActive]=useState<WorldPlace|null>(null),[index,setIndex]=useState(0),[all,setAll]=useState(false);
 useEffect(()=>{const target=section.current;if(!target)return;if(!('IntersectionObserver'in window)){setNear(true);return;}
  const observer=new IntersectionObserver(entries=>{if(entries.some(e=>e.isIntersecting)){setNear(true);observer.disconnect();}},{rootMargin:'240px'});observer.observe(target);return()=>observer.disconnect();},[]);
 useEffect(()=>{if(!near)return;const controller=new AbortController();setError(false);
  void fetch('/api/beta/world',{signal:controller.signal,cache:'no-store'}).then(async r=>{if(!r.ok)throw Error('WORLD_MAP_UNAVAILABLE');return await r.json() as WorldActivity;})
   .then(setData).catch(()=>{if(!controller.signal.aborted)setError(true);});return()=>controller.abort();},[near,revision]);
 function select(place:WorldPlace,trigger?:HTMLButtonElement){if(trigger)close.current=trigger;setActive(place);setIndex(0);}
 function dismiss(){setActive(null);onPlayingChange?.(false);close.current?.focus({preventScroll:true});}
 useEffect(()=>{if(!active)return;const key=(event:KeyboardEvent)=>{if(event.key==='Escape'){setActive(null);onPlayingChange?.(false);close.current?.focus({preventScroll:true});}};
  const hide=()=>{if(document.hidden){setActive(null);onPlayingChange?.(false);}};
  document.addEventListener('keydown',key);document.addEventListener('visibilitychange',hide);return()=>{document.removeEventListener('keydown',key);document.removeEventListener('visibilitychange',hide);};},[active,onPlayingChange]);
 const places=data?.places??[];
 return <section ref={section} className="beta-section beta-world" aria-labelledby="beta-world-title">
  <header className="beta-world-heading"><div><span className="beta-eyebrow"><HomeIcon name="globe" size={15}/> LES BIENS FONT LEUR TOUR DU MONDE</span><h2 id="beta-world-title">Déjà vus.<br/><em>Un peu partout.</em></h2><p>Des biens qui prennent vie en vidéo. Cliquez sur un point pour découvrir les créations BienVu.</p></div>
   <div className="beta-world-stats" aria-live="polite"><div><strong>{data?data.videoCount:'—'}</strong><span>vidéos géolocalisées</span></div><div><strong>{data?data.placeCount:'—'}</strong><span>lieux à découvrir</span></div></div>
  </header>
  <div className="beta-world-stage" aria-busy={!data&&!error}>
   {data?<WorldCanvas places={places} selected={active?.id??null} onSelect={select}/>:<div className="beta-world-loading"><HomeIcon name="globe" size={38}/><span>{error?'La carte n’a pas pu être chargée.':near?'La carte se prépare…':'Le monde, bientôt sous vos yeux.'}</span>{error&&<button type="button" onClick={()=>setRevision(v=>v+1)}>Réessayer</button>}</div>}
   {data&&<div className="beta-world-legend"><i/> {active?active.locality:'Chaque point raconte un bien.'}</div>}
   {active&&<VideoPreview place={active} index={index} onIndex={setIndex} onClose={dismiss} onPlayingChange={onPlayingChange}/>}
  </div>
  {data&&places.length===0&&<p className="beta-world-empty">Les prochaines vidéos géolocalisées apparaîtront ici.</p>}
  {places.length>0&&<div className="beta-world-places" aria-label="Explorer les lieux">{(all?places:places.slice(0,7)).map(place=><button key={place.id} type="button" aria-pressed={active?.id===place.id}
   onClick={event=>{close.current=event.currentTarget;select(place);}}><HomeIcon name="location" size={13}/>{place.locality}<span>{place.count}</span></button>)}{places.length>7&&<button type="button" className="beta-world-more" aria-expanded={all} onClick={()=>setAll(v=>!v)}>{all?'Réduire':`+ ${places.length-7} lieux`}</button>}</div>}
  <footer><span><HomeIcon name="location" size={13}/> Localisations approximatives, regroupées par ville.</span><span>Explorez la carte. Lancez une vidéo.</span></footer>
 </section>;
}
