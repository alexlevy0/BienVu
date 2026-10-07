'use client';
import {useEffect,useRef,useState} from 'react';
import {MapImageInfo,MapLocation,MapSearchResult,mapCredits,mapPublicLocation,mapInk,mapRasterScale,mapRasterOpacity,mapRasterStyle,mapZoomAt,mapZooms,mapDefaultZooms,mapRasterLevels,mapBuildingCamera,mapBuildingStyle,type VideoMap,type MapView} from '@bienvu/contracts';
import {HomeIcon} from './home-icons';
import 'maplibre-gl/dist/maplibre-gl.css';
import './video-map.css';

const images=new Map<string,Promise<MapImageInfo>>();
// Load the pinned browser ESM directly: no SDK payload or worker is included in the home bundle.
function loadMapLibre(){
  // @ts-expect-error The generated public asset is served at runtime, outside the TypeScript module graph.
  return import(/* webpackIgnore: true */ '/maplibre/maplibre-gl.mjs') as Promise<typeof import('maplibre-gl')>;
}
async function mapJson(url:string,body:unknown){
  const response=await fetch(url,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body),signal:AbortSignal.timeout(url.endsWith('/preview')?120000:30000)}),value=await response.json();
  if(!response.ok){const failure=value as {error?:{message?:string}};throw new Error(failure?.error?.message??'La carte est indisponible. Réessayez.');}return value;
}
export function useMapImage(location:MapLocation|null|undefined,aspectRatio:'9:16'|'16:9',view:MapView='plan',zooms:Pick<VideoMap,'zoomStart'|'zoomEnd'>={}){
  const [state,setState]=useState<{image?:MapImageInfo;error?:string;loading:boolean}>({loading:false}),[retry,setRetry]=useState(0);
  const normalized=location?mapPublicLocation(location):null,levels=view==='satellite'||zooms.zoomStart!==undefined||zooms.zoomEnd!==undefined?mapRasterLevels({view,...zooms},normalized?.precision):[],
    key=normalized?JSON.stringify([normalized.latitude,normalized.longitude,normalized.precision,aspectRatio,view,...levels]):'';
  useEffect(()=>{let alive=true;if(!key){setState({loading:false});return;}
    setState({loading:true});
    const timer=setTimeout(()=>{let request=images.get(key);
      if(!request){if(images.size>20)images.delete(images.keys().next().value!);
        request=mapJson('/api/maps/preview',{location:normalized,aspectRatio,view,...zooms}).then(v=>MapImageInfo.parse(v));images.set(key,request);}
      void request.then(image=>{if(alive)setState({image,loading:false});},error=>{images.delete(key);if(alive)setState({loading:false,error:error.message});});
    },images.has(key)?0:450);
    return()=>{alive=false;clearTimeout(timer);};
  },[key,retry]);
  return {...state,retry:()=>{images.delete(key);setRetry(v=>v+1);}};
}
function MapBuildingsPreview(p:{image:MapImageInfo;location:MapLocation;settings:VideoMap;frame:number;duration:number;color:string;width:number;height:number}){
  const ref=useRef<HTMLDivElement>(null),map=useRef<import('maplibre-gl').Map>(null),[ready,setReady]=useState(false),[error,setError]=useState(false),frame=useRef(p.frame);frame.current=p.frame;
  useEffect(()=>{let disposed=false;setReady(false);setError(false);
    void loadMapLibre().then(libre=>{
      if(disposed||!ref.current||!p.image.buildingsUrl)return;libre.setWorkerUrl('/maplibre/maplibre-gl-worker.mjs');
      const value=new libre.Map({container:ref.current,interactive:false,attributionControl:false,fadeDuration:0,pixelRatio:1,
        style:mapBuildingStyle(p.image.url,p.image.bounds,p.image.buildingsUrl,p.color,p.image.details),...mapBuildingCamera(p.location,frame.current,p.duration,p.settings)});
      map.current=value;value.once('idle',()=>{if(!disposed)setReady(true);});value.on('error',()=>{if(!disposed)setError(true);});
    }).catch(()=>{if(!disposed)setError(true);});
    return()=>{disposed=true;map.current?.remove();map.current=null;};
  },[p.image.id,p.location.latitude,p.location.longitude,p.color,p.width,p.height]);
  useEffect(()=>{if(ready)map.current?.jumpTo(mapBuildingCamera(p.location,p.frame,p.duration,p.settings));},[p.frame,p.duration,p.settings.zoomStart,p.settings.zoomEnd,ready]);
  return <><div className="map-buildings-preview" ref={ref} style={{position:'absolute',inset:0}}/>{(!ready||error)&&<div className="map-scene-status" style={{fontSize:p.width/24}}>{error?'L’aperçu 3D n’est pas disponible dans ce navigateur. Choisissez le plan pour un aperçu sans 3D.':'Chargement de l’aperçu 3D…'}</div>}</>;
}
export function MapScenePreview(p:{map:VideoMap;aspectRatio:'9:16'|'16:9';frame:number;primaryColor:string;secondaryColor:string;agencyName:string;contact?:string}){
  const state=useMapImage(p.map.location,p.aspectRatio,p.map.view,{zoomStart:p.map.zoomStart,zoomEnd:p.map.zoomEnd}),ref=useRef<HTMLDivElement>(null),[scale,setScale]=useState(0),
    [decoded,setDecoded]=useState<string[]>([]),[failed,setFailed]=useState<string[]>([]),width=p.aspectRatio==='16:9'?1920:1080,height=p.aspectRatio==='16:9'?1080:1920,ink=mapInk(p.primaryColor,p.secondaryColor),
    plates=state.image?[state.image,...state.image.details??[]]:[],imageError=p.map.view!=='buildings-3d'&&plates.some(i=>failed.includes(i.id)),
    imagesLoading=p.map.view!=='buildings-3d'&&plates.some(i=>!decoded.includes(i.id));
  useEffect(()=>{const node=ref.current;if(!node)return;const observer=new ResizeObserver(entries=>setScale(entries[0].contentRect.width/width));observer.observe(node);return()=>observer.disconnect();},[width]);
  return <div className="map-scene-preview" ref={ref}>
    <div className="map-scene-canvas" style={{width,height,transform:`scale(${scale})`,background:p.primaryColor,color:ink}}>
      {state.image&&(p.map.view==='buildings-3d'&&p.map.location?<MapBuildingsPreview image={state.image} location={p.map.location} settings={p.map} frame={p.frame} duration={p.map.durationSeconds*30} color={p.primaryColor} width={width} height={height}/>:
        plates.map((image,i)=><img key={image.id} className="map-scene-plate" src={image.url} alt={i?'':p.map.view==='satellite'?'Photographie aérienne':'Fond de carte'}
          onLoad={e=>{const node=e.currentTarget;void node.decode().then(()=>{setDecoded(ids=>ids.includes(image.id)?ids:[...ids,image.id]);setFailed(ids=>ids.filter(id=>id!==image.id));},()=>setFailed(ids=>[...ids,image.id]));}}
          onError={()=>setFailed(ids=>[...ids,image.id])} style={{width:width*2,height:height*2,
          opacity:i?mapRasterOpacity(p.map.view,mapZoomAt(p.map,p.frame,p.map.durationSeconds*30,p.map.location?.precision),image.zoom!):1,
          transform:`translate(-50%,-50%) scale(${mapRasterScale(p.map,p.frame,image.zoom)})`}}/>))}
      <div className="map-scene-tint"/>
      {p.map.location&&<>
        {p.map.location.precision==='approximate'&&<div className="map-scene-zone" style={{borderColor:ink,background:p.primaryColor}}/>}
        <div className="map-scene-pin" style={{background:ink}}/>
        <div className="map-scene-card" style={{borderColor:ink,fontSize:width===1080?66:60}}><small>{p.map.position==='end'?'Retrouvons-nous ici':'Découvrez le quartier'}</small><strong>{p.map.location.label}</strong><span>{p.agencyName}</span>{p.contact&&<span>{p.contact}</span>}</div></>}
    </div>
    {(!p.map.location||state.loading||state.error||imagesLoading||imageError)&&<div className="map-scene-status" role={state.error||imageError?'alert':'status'}>{!p.map.location?'Confirmez une localisation dans l’onglet Carte.':state.error||imageError?<>{state.error??'L’image de la carte n’a pas pu être chargée.'}<button type="button" onClick={state.retry}>Réessayer</button></>:state.loading?'Préparation de la carte…':'Chargement de l’aperçu…'}</div>}
  </div>;
}
function MapLocator(p:{location:MapLocation;image:MapImageInfo;settings:VideoMap;color:string;onMove(location:MapLocation):void}){
  const ref=useRef<HTMLDivElement>(null),[error,setError]=useState(false),move=useRef(p.onMove);move.current=p.onMove;
  useEffect(()=>{let disposed=false,map:import('maplibre-gl').Map|undefined;setError(false);
    void loadMapLibre().then(libre=>{
      if(disposed||!ref.current)return;libre.setWorkerUrl('/maplibre/maplibre-gl-worker.mjs');
      const [west,south,east,north]=p.image.bounds;
      map=new libre.Map({container:ref.current,center:[p.location.longitude,p.location.latitude],zoom:mapZooms(p.settings,p.location.precision).zoomEnd,
        maxBounds:[[west,south],[east,north]],minZoom:11,maxZoom:18,attributionControl:false,
        ...(p.image.buildingsUrl?mapBuildingCamera(p.location,119,120,p.settings):{}),
        style:p.image.buildingsUrl?mapBuildingStyle(p.image.url,p.image.bounds,p.image.buildingsUrl,p.color,p.image.details):mapRasterStyle(p.image.url,p.image.bounds,p.image.details,p.settings.view)});
      map.addControl(new libre.NavigationControl({showCompass:false}));
      map.on('load',()=>{if(!map||disposed)return;map.addSource('pin',{type:'geojson',data:{type:'Feature',properties:{},geometry:{type:'Point',coordinates:[p.location.longitude,p.location.latitude]}}});
        map.addLayer({id:'pin',type:'circle',source:'pin',paint:{'circle-radius':10,'circle-color':p.color,'circle-stroke-color':'#fff','circle-stroke-width':3}});});
      map.on('click',event=>move.current({...p.location,longitude:event.lngLat.lng,latitude:event.lngLat.lat,sourceType:'manual'}));
      map.on('error',()=>{if(!disposed)setError(true);});
    }).catch(()=>{if(!disposed)setError(true);});
    return()=>{disposed=true;map?.remove();};
  },[p.image.id,p.location.latitude,p.location.longitude,p.color,p.settings.zoomEnd]);
  return <><div ref={ref} className="map-locator" aria-label="Carte du repère à confirmer"/>{error&&<p className="customizer-hint">L’aperçu interactif n’est pas disponible dans ce navigateur. Vous pouvez confirmer le résultat de la recherche.</p>}</>;
}
export function VideoMapControls(p:{map?:VideoMap;onChange(map:VideoMap|undefined):void;onPreview?(endpoint:'start'|'end'):void;locality:string;aspectRatio:'9:16'|'16:9';busy:boolean;color:string;duration:number}){
  const [query,setQuery]=useState(p.map?.location?.label??p.locality),[results,setResults]=useState<MapLocation[]>([]),[candidate,setCandidate]=useState<MapLocation|null>(p.map?.location??null),[searching,setSearching]=useState(false),[error,setError]=useState('');
  const searchRef=useRef(0),state=useMapImage(p.map?candidate:null,p.aspectRatio,p.map?.view,{zoomStart:p.map?.zoomStart,zoomEnd:p.map?.zoomEnd}),zooms=mapZooms(p.map??{},candidate?.precision);
  useEffect(()=>{if(!p.busy&&p.map&&p.map.zoomStart===undefined&&p.map.zoomEnd===undefined)p.onChange({...p.map,...mapDefaultZooms(p.map.view,candidate?.precision)});},[Boolean(p.map),p.map?.zoomStart,p.map?.zoomEnd,p.busy]);
  useEffect(()=>{if(!p.map){setCandidate(null);setResults([]);searchRef.current++;setSearching(false);}},[Boolean(p.map)]);
  async function search(){const token=++searchRef.current;setSearching(true);setError('');
    try{const value=await mapJson('/api/maps/search',{query}),locations=MapSearchResult.parse(value).locations;if(searchRef.current!==token)return;
      setResults(locations);if(!locations.length)setError('Aucun résultat. Précisez la ville ou l’adresse.');
    }catch(cause){if(searchRef.current===token)setError(cause instanceof Error?cause.message:'Recherche indisponible.');}finally{if(searchRef.current===token)setSearching(false);}}
  const patch=(value:Partial<VideoMap>)=>p.map&&p.onChange({...p.map,...value});
  return <div className="map-controls"><div className="customizer-section-title"><strong>Le bien sur la carte</strong><p>Un zoom animé pour situer votre bien. La carte reste facultative et ne coûte aucun crédit supplémentaire.</p></div>
    <label className="customizer-checkbox"><input type="checkbox" checked={Boolean(p.map)} disabled={p.busy} onChange={e=>p.onChange(e.target.checked?{position:'start',durationSeconds:4,location:null,...mapDefaultZooms()}:undefined)}/>Ajouter une séquence de carte</label>
    {p.map&&<><label>Style de carte<select value={p.map.view??'plan'} disabled={p.busy} onChange={e=>{const view=e.target.value as MapView,
      suggested=(['approximate','exact'] as const).some(precision=>{const d=mapDefaultZooms(p.map?.view,precision);return zooms.zoomStart===d.zoomStart&&zooms.zoomEnd===d.zoomEnd;});
      patch({view,...(suggested?mapDefaultZooms(view,candidate?.precision):{})});p.onPreview?.('start');}}><option value="plan">Plan · sans satellite</option><option value="buildings-3d">Bâtiments en 3D</option><option value="satellite">Satellite · vue aérienne</option></select></label>
      <div className="map-options"><label>Emplacement<select value={p.map.position} disabled={p.busy} onChange={e=>patch({position:e.target.value as 'start'|'end'})}><option value="start">Au début</option><option value="end">À la fin</option></select></label>
      <label>Durée<select value={p.map.durationSeconds} disabled={p.busy} onChange={e=>patch({durationSeconds:Number(e.target.value)})}>{[3,4,5].map(n=><option key={n} value={n}>{n} secondes</option>)}</select></label></div>
      <p className="customizer-hint">{p.map.durationSeconds} s de carte + {p.duration-p.map.durationSeconds} s de photos = {p.duration} s au total. La voix off conserve sa durée.</p>
      <div className="map-options map-zooms">{(['start','end'] as const).map(endpoint=>{const field=endpoint==='start'?'zoomStart':'zoomEnd',value=zooms[field],title=endpoint==='start'?'Zoom au départ':'Zoom à l’arrivée';
        const update=(value:number)=>{if(!Number.isFinite(value)||value<12||value>18)return;patch({...zooms,[field]:value});p.onPreview?.(endpoint);};
        return <div key={endpoint}><label htmlFor={`map-zoom-${endpoint}`}>{title}</label><input id={`map-zoom-${endpoint}`} type="range" min="12" max="18" step="0.25" value={value} disabled={p.busy} onChange={e=>update(Number(e.target.value))}/>
          <input type="number" aria-label={`${title} : niveau précis`} min="12" max="18" step="0.25" value={value} disabled={p.busy} onChange={e=>{if(e.target.value)update(Number(e.target.value));}}/>
          {p.onPreview&&<button type="button" className="customizer-reset" disabled={p.busy||!p.map?.location} onClick={()=>p.onPreview?.(endpoint)}>{endpoint==='start'?'Voir le départ':'Voir l’arrivée'}</button>}</div>;})}</div>
      <p className="customizer-hint">Un niveau plus bas montre une zone plus large. Choisissez deux niveaux identiques pour une vue fixe, ou un départ plus élevé pour un dézoom.</p>
      <button type="button" className="customizer-reset" disabled={p.busy} onClick={()=>{patch(mapDefaultZooms(p.map?.view,candidate?.precision));p.onPreview?.('start');}}>Réinitialiser les zooms</button>
      <label htmlFor="map-search">Ville ou adresse du bien</label><div className="map-search"><input id="map-search" value={query} maxLength={120} disabled={p.busy||searching} onChange={e=>setQuery(e.target.value)} onKeyDown={e=>{if(e.key==='Enter'){e.preventDefault();if(query.trim().length>=2&&!searching)void search();}}} placeholder="Lyon 6e ou une adresse"/>
        <button type="button" className="customizer-add" disabled={p.busy||searching||query.trim().length<2} onClick={()=>void search()}>{searching?'Recherche…':'Rechercher'}</button></div>
      {error&&<p className="customizer-error" role="alert">{error}</p>}
      {results.length>0&&<div className="map-results" aria-label="Résultats de localisation">{results.map((location,i)=><button type="button" key={i} disabled={p.busy} aria-pressed={candidate?.label===location.label} onClick={()=>{setCandidate(location);patch({location:null});}}><HomeIcon name="pin" size={17}/>{location.label}<small>{location.precision==='exact'?'Adresse':'Zone approximative'}</small></button>)}</div>}
      {candidate&&<><div className="map-options"><label>Précision<select value={candidate.precision} disabled={p.busy} onChange={e=>{setCandidate({...candidate,precision:e.target.value as 'exact'|'approximate'});patch({location:null});}}><option value="approximate">Zone approximative</option><option value="exact" disabled={!['housenumber','manual'].includes(candidate.sourceType)}>Adresse précise</option></select></label></div>
        <p className="customizer-hint">{candidate.precision==='exact'?'L’adresse sera visible dans la vidéo.':'Seule une zone arrondie est utilisée dans la vidéo.'} Vous pouvez cliquer sur la carte pour affiner le repère.</p>
        {state.image?<MapLocator location={mapPublicLocation(candidate)} image={state.image} settings={p.map} color={p.color} onMove={location=>{if(p.busy)return;setCandidate(location);patch({location:null});}}/>:state.loading?<p role="status">Chargement de la carte…</p>:state.error?<p role="alert" className="customizer-error">{state.error}<button type="button" onClick={state.retry}>Réessayer</button></p>:null}
        <button type="button" className="customizer-add map-confirm" disabled={p.busy||!state.image} onClick={()=>patch({location:mapPublicLocation(candidate)})}>{p.map.location?'✓ Localisation confirmée':'Confirmer cette localisation'}</button>
        {state.image&&<details className="map-source-credits"><summary>Crédits cartographiques</summary><p>{mapCredits(state.image.capturedAt,p.map.view)}</p></details>}
        {p.map.view==='buildings-3d'&&state.image?.buildingCount===0&&<p className="customizer-hint">Aucun bâtiment avec une hauteur connue dans cette zone. Le plan reste disponible.</p>}
      </>}
      {!p.map.location&&<p className="customizer-hint">Confirmez le repère avant de créer votre vidéo.</p>}
    </>}
  </div>;
}
