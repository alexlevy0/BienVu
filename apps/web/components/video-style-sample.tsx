'use client';
import {useEffect,useRef,useState,type ComponentProps} from 'react';
import {CustomizerFilm} from './customizer-film';
export function VideoStyleSample(p:Pick<ComponentProps<typeof CustomizerFilm>,'settings'|'photos'|'fields'|'agencyName'|'brand'>){
 const container=useRef<HTMLDivElement>(null),[width,setWidth]=useState(140);
 useEffect(()=>{const element=container.current;if(!element)return;const observer=new ResizeObserver(entries=>setWidth(entries[0].contentRect.width));setWidth(element.clientWidth);observer.observe(element);return()=>observer.disconnect();},[]);
 const photos=p.photos.length?p.photos:[{id:'style-example-1',preview:'/images/studio-home/paris-320.webp'},{id:'style-example-2',preview:'/images/studio-home/lyon-320.webp'},{id:'style-example-3',preview:'/images/studio-home/sud-320.webp'}];
 return <div ref={container} className="customizer-style-render" aria-hidden="true"><CustomizerFilm {...p} settings={{...p.settings,avatar:undefined}} photos={photos} aspectRatio="9:16" duration={20} narration={['','','','']} subtitles={false} voice={false} automaticMap={false} mapAt={null} frame={45} width={width}/></div>;
}
