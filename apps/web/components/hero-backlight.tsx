'use client';

import type {RefObject} from 'react';
import {VideoBacklight} from './video-backlight';

export function HeroBacklight({video,active,posterImage}:{video:RefObject<HTMLVideoElement|null>;active:boolean;posterImage:RefObject<HTMLImageElement|null>}){
  return <VideoBacklight video={video} active={active} posterImage={posterImage} className="home-hero-backlight"/>;
}
