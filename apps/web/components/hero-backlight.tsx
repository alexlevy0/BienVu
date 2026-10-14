'use client';

import type {RefObject} from 'react';
import {HomeVisual,type HomeMediaView} from './homepage-media';
import {VideoBacklight} from './video-backlight';

export function HeroBacklight({video,active,poster}:{video:RefObject<HTMLVideoElement|null>;active:boolean;poster:HomeMediaView|null}){
  return <VideoBacklight video={video} active={active} className="home-hero-backlight">
    {poster&&<HomeVisual media={poster} alt="" sizes="(max-width: 760px) 310px, (max-width: 1250px) 250px, (max-width: 1600px) 330px, 440px" loading="eager" fetchPriority="low"/>}
  </VideoBacklight>;
}
