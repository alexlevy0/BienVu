import React,{useEffect,useRef,useState,type CSSProperties} from 'react';
import {Img,delayRender,continueRender,cancelRender} from 'remotion';
import {coastalMapSource} from '@bienvu/maps/coastal-raster';

export function SatelliteMapPlate({src,style}:{src:string;style:CSSProperties}){
  const [source,setSource]=useState<string|null>(null),[wait]=useState(()=>delayRender('Préparation du fond côtier')),released=useRef(false);
  const release=()=>{if(!released.current){released.current=true;continueRender(wait);}};
  useEffect(()=>{
    const controller=new AbortController();let dispose=()=>{};
    void coastalMapSource(src,controller.signal).then(value=>{dispose=value.dispose;setSource(value.url);},error=>{if(!controller.signal.aborted)cancelRender(error);});
    return()=>{controller.abort();dispose();release();};
  },[src,wait]);
  return source?<Img src={source} style={style} onLoad={release} onError={()=>cancelRender(Error('MAP_RASTER_LOAD'))}/>:null;
}
