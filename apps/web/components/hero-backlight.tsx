'use client';

import type {RefObject} from 'react';
import {HomeVisual,type HomeMediaView} from './homepage-media';
import {VideoBacklight} from './video-backlight';

export function HeroBacklight({video,active,poster}:{video:RefObject<HTMLVideoElement|null>;active:boolean;poster:HomeMediaView|null}){
  return <VideoBacklight video={video} active={active} className="home-hero-backlight">
    {poster&&<HomeVisual media={poster} alt="" loading="eager" fetchPriority="low"/>}
  </VideoBacklight>;
}
