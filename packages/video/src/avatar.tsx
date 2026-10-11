import React from 'react';
import {Sequence,OffthreadVideo,useCurrentFrame,interpolate} from 'remotion';
import {avatarFrameStyle,avatarContentStyle,type AvatarContentBounds,type VideoManifest} from '@bienvu/contracts';

function AvatarClip({manifest:m,clip,src,bounds}:{manifest:VideoManifest;clip:NonNullable<VideoManifest['avatar']>['clips'][number];src:string;bounds?:AvatarContentBounds}){
  const frame=useCurrentFrame(),duration=clip.durationFrames;
  const opacity=interpolate(frame,[0,Math.min(4,duration/3),Math.max(duration-5,duration*2/3),duration],[0,1,1,0],{extrapolateLeft:'clamp',extrapolateRight:'clamp'});
  const placement=avatarFrameStyle(m.avatar!.settings,m.width,m.height,clip.transparent);
  const content=clip.transparent&&bounds?avatarContentStyle(bounds,clip.asset.width!,clip.asset.height!,placement.width,placement.height):{width:'100%',height:'100%',objectFit:'cover' as const,objectPosition:'center 30%'};
  return <div data-bienvu-avatar={clip.moment} style={{...placement,opacity}}>
    <OffthreadVideo src={src} muted transparent={clip.transparent} style={content}/>
  </div>;
}
export function AvatarOverlay({manifest:m,media,bounds}:{manifest:VideoManifest;media:Record<string,string>;bounds?:Record<string,AvatarContentBounds>}){
  if(!m.avatar||m.avatar.settings.hidden)return null;
  return <>{m.avatar.clips.map(clip=><Sequence key={clip.id} from={clip.startFrame} durationInFrames={clip.durationFrames} premountFor={30}>
    <AvatarClip manifest={m} clip={clip} src={media[clip.asset.id]} bounds={bounds?.[clip.asset.id]}/>
  </Sequence>)}</>;
}
