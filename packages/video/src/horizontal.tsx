import React from 'react';
import { Audio, Img, useCurrentFrame } from 'remotion';
import { HorizontalPhotoScene as SharedHorizontalPhotoScene } from '@bienvu/presentation';
import type { VideoManifest } from '@bienvu/contracts';
import { SceneLayers } from './scene-layers';
export function HorizontalPhotoScene({
  manifest,
  media,
  logoBackground,
  index,
}: {
  manifest: VideoManifest;
  media: Record<string, string>;
  logoBackground: string;
  index: number;
}) {
  const frame = useCurrentFrame(),
    asset = manifest.audio.find((a) => a.id === manifest.scenes[index].audioAssetId);
  return (
    <SharedHorizontalPhotoScene
      manifest={manifest}
      media={media}
      logoBackground={logoBackground}
      index={index}
      frame={frame}
      Layers={SceneLayers}
      Image={Img}
      audio={manifest.voiceEnabled !== false && asset && <Audio src={media[asset.id]} volume={1} />}
    />
  );
}
