import React,{useEffect,useRef,useState} from 'react';
import {cancelRender,continueRender,delayRender} from 'remotion';
import {mapBuildingCamera,mapBuildingStyle,mapPlaneGeometry,type VideoManifest} from '@bienvu/contracts';

export function MapBuildingsScene(p:{manifest:VideoManifest;media:Record<string,string>;frame:number;moduleUrl?:string;workerUrl?:string}){
  const ref=useRef<HTMLDivElement>(null),[map,setMap]=useState<import('maplibre-gl').Map|null>(null),[initial]=useState(()=>delayRender('Préparation des bâtiments 3D')),
    currentFrame=useRef(p.frame);currentFrame.current=p.frame;
  useEffect(()=>{
    const settings=p.manifest.map!.settings,buildings=p.manifest.map!.buildings;
    if(!p.moduleUrl||!p.workerUrl||!buildings){cancelRender(new Error('MAP_3D_ASSETS_MISSING'));return;}
    const workerUrl=p.workerUrl;
    void (import(/* webpackIgnore: true */ p.moduleUrl) as Promise<typeof import('maplibre-gl')>).then(libre=>{
      libre.setWorkerCount(1);
      libre.setWorkerUrl(URL.createObjectURL(new Blob([`import ${JSON.stringify(workerUrl)};`],{type:'text/javascript'})));
      const value=new libre.Map({container:ref.current!,interactive:false,attributionControl:false,fadeDuration:0,pixelRatio:1,
        canvasContextAttributes:{preserveDrawingBuffer:true},
        ...mapBuildingCamera(settings.location,currentFrame.current,settings.durationSeconds*30,settings),
        style:mapBuildingStyle(p.media[p.manifest.map!.asset.id],mapPlaneGeometry(settings.location,p.manifest.width===1920?'16:9':'9:16','buildings-3d',p.manifest.map!.rasterZoom).bounds,
          p.media[buildings.id],p.manifest.brand.primaryColor,(p.manifest.map!.details??[]).map(d=>({url:p.media[d.asset.id],zoom:d.zoom,
            bounds:mapPlaneGeometry(settings.location,p.manifest.width===1920?'16:9':'9:16','buildings-3d',d.zoom).bounds})))});
      value.on('error',event=>cancelRender(event.error));
      value.once('idle',()=>{setMap(value);continueRender(initial);});
    }).catch(cancelRender);
    // Remotion owns the browser lifetime; removing the map during a render can destroy an active frame.
  },[]);
  useEffect(()=>{
    if(!map)return;const wait=delayRender('Caméra de la carte 3D'),settings=p.manifest.map!.settings;
    map.once('idle',()=>continueRender(wait));map.jumpTo(mapBuildingCamera(settings.location,p.frame,settings.durationSeconds*30,settings));map.triggerRepaint();
  },[p.frame,map]);
  return <div ref={ref} data-bienvu-buildings="true" style={{position:'absolute',inset:0}}/>;
}
