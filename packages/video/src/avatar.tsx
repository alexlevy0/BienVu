import React from 'react';
import {Sequence,OffthreadVideo,useCurrentFrame,interpolate} from 'remotion';
import {avatarFrameStyle,type VideoManifest} from '@bienvu/contracts';

function AvatarClip({manifest:m,clip,src}:{manifest:VideoManifest;clip:NonNullable<VideoManifest['avatar']>['clips'][number];src:string}){
  const frame=useCurrentFrame(),duration=clip.durationFrames;
  const opacity=interpolate(frame,[0,Math.min(4,duration/3),Math.max(duration-5,duration*2/3),duration],[0,1,1,0],{extrapolateLeft:'clamp',extrapolateRight:'clamp'});
  return <div data-bienvu-avatar={clip.moment} style={{...avatarFrameStyle(m.avatar!.settings,m.width,m.height,clip.transparent),opacity}}>
    <OffthreadVideo src={src} muted transparent={clip.transparent} style={{width:'100%',height:'100%',objectFit:'cover',objectPosition:'center 30%'}}/>
  </div>;
}
export function AvatarOverlay({manifest:m,media}:{manifest:VideoManifest;media:Record<string,string>}){
  if(!m.avatar||m.avatar.settings.hidden)return null;
  return <>{m.avatar.clips.map(clip=><Sequence key={clip.id} from={clip.startFrame} durationInFrames={clip.durationFrames} premountFor={30}>
    <AvatarClip manifest={m} clip={clip} src={media[clip.asset.id]}/>
  </Sequence>)}</>;
}
