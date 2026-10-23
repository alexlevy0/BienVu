import React from 'react';
import type { CSSProperties, ReactNode } from 'react';
import { AbsoluteFill, useCurrentFrame } from 'remotion';
import { mapFrame, VIDEO_LAYERS, type VideoManifest } from '@bienvu/contracts';
import { useMarketingLayer } from './marketing-layer';

// Fades create stacking contexts: keep each scene's imagery and text in
// separate fills so the global avatar can sit between them during transitions.
export function SceneLayers({
  manifest,
  index,
  background,
  children,
  audio,
  style,
  frame: _previewFrame,
  ...attributes
}: {
  manifest: VideoManifest;
  index: number;
  background: ReactNode;
  children: ReactNode;
  audio?: ReactNode;
  style?: CSSProperties;
  frame?: number;
  'data-bienvu-style'?: string;
  'data-bienvu-orientation'?: string;
}) {
  const layer = useMarketingLayer(),
    frame = useCurrentFrame(),
    start = manifest.scenes.slice(0, index).reduce((n, s) => n + s.durationFrames, 0),
    total = manifest.scenes.reduce((n, s) => n + s.durationFrames, 0),
    visible = mapFrame(manifest.map?.settings, total, start + frame) === null;
  const { background: color, ...foregroundStyle } = style ?? {};
  return (
    <>
      {layer !== 'foreground' && (
        <AbsoluteFill data-bienvu-layer="background" style={{ ...style, background: color }}>
          {background}
        </AbsoluteFill>
      )}
      {layer !== 'background' && (
        <AbsoluteFill
          {...attributes}
          data-bienvu-layer="content"
          style={{ ...foregroundStyle, zIndex: VIDEO_LAYERS.content, visibility: visible ? 'visible' : 'hidden' }}
        >
          {children}
        </AbsoluteFill>
      )}
      {layer !== 'foreground' && audio}
    </>
  );
}
