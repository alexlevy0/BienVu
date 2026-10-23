import React from 'react';
import { Img } from 'remotion';
import { VIDEO_LAYERS } from '@bienvu/contracts';
import { trialWatermarkLayout, TRIAL_WATERMARK_SVG } from './watermark-artwork';

const artwork = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(TRIAL_WATERMARK_SVG)}`;

export function TrialWatermark({ width, height }: { width: number; height: number }) {
  const layout = trialWatermarkLayout({ width, height });
  return (
    <Img
      src={artwork}
      style={{
        position: 'absolute',
        zIndex: VIDEO_LAYERS.watermark,
        left: layout.x,
        top: layout.y,
        width: layout.width,
        height: layout.height,
      }}
    />
  );
}
