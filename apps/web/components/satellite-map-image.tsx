'use client';
import {useEffect,useRef,useState,type ImgHTMLAttributes} from 'react';
import {coastalMapSource} from '@bienvu/maps/coastal-raster';

export function SatelliteMapImage({src,onError,...props}:Omit<ImgHTMLAttributes<HTMLImageElement>,'onError'>&{src:string;onError?():void}){
  const [prepared,setPrepared]=useState<{source:string;url:string}|null>(null),failure=useRef(onError);failure.current=onError;
  useEffect(()=>{
    const controller=new AbortController();let dispose=()=>{};
    void coastalMapSource(src,controller.signal).then(value=>{dispose=value.dispose;setPrepared({source:src,url:value.url});},()=>{if(!controller.signal.aborted)failure.current?.();});
    return()=>{controller.abort();dispose();};
  },[src]);
  // Never flash the original white mosaic while the corrected image is prepared.
  return prepared?.source===src?<img {...props} src={prepared.url} onError={onError}/>:null;
}
