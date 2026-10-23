'use client';
import { useMemo, type CSSProperties } from 'react';
import {
  DesignedPhotoScene,
  isDesignedStyle,
  photoStage,
  canvasColor,
  galleryMotion,
  VerticalBrand,
  EditorialPhotoScene,
  StyledPhotoScene,
  CinematicPhotoScene,
  HorizontalPhotoScene,
  PreviewLayers,
} from '@bienvu/presentation';
import type {
  AgencyBrand,
  AvatarLook,
  VideoCustomization,
  VideoDuration,
  VideoAspectRatio,
  VideoMap,
} from '@bienvu/contracts';
import { customizationPreview, previewFrame } from '../lib/customizer-preview';
import type { ManualDraftFields } from '../lib/listing-draft';
import { useVideoFonts } from '../lib/video-fonts';
import { AvatarPoster } from './avatar-controls';
import { MapScenePreview } from './video-map';

type Props = {
  settings: VideoCustomization;
  fields: ManualDraftFields;
  agencyName: string;
  duration: VideoDuration;
  aspectRatio: VideoAspectRatio;
  narration: string[];
  subtitles: boolean;
  voice: boolean;
  photos: { id: string; preview: string; slot?: number }[];
  brand?: AgencyBrand;
  map?: VideoMap;
  automaticMap: boolean;
  mapAt: number | null;
  frame: number;
  look?: AvatarLook;
  width: number;
};
export function CustomizerFilm(p: Props) {
  const fontsReady = useVideoFonts();
  const model = useMemo(
    () =>
      customizationPreview({
        settings: p.settings,
        fields: p.fields,
        agencyName: p.agencyName,
        duration: p.duration,
        aspectRatio: p.aspectRatio,
        narration: p.narration,
        subtitles: p.subtitles,
        voice: p.voice,
        photos: p.photos,
        map: p.map,
        brand: p.brand,
      }),
    [
      p.settings,
      p.fields,
      p.agencyName,
      p.duration,
      p.aspectRatio,
      p.narration,
      p.subtitles,
      p.voice,
      p.photos,
      p.map,
      p.brand,
    ],
  );
  const { manifest: m, timeline, media } = model,
    { at, sceneIndex, sceneFrame, photoIndex } = previewFrame(model, p.frame),
    cinema = p.settings.style === 'cinematic';
  const stage = photoStage(p.settings.style, m.width, m.height);
  const Scene = isDesignedStyle(p.settings.style)
    ? DesignedPhotoScene
    : p.aspectRatio === '16:9'
      ? HorizontalPhotoScene
      : cinema
        ? CinematicPhotoScene
        : p.settings.style === 'minimal'
          ? StyledPhotoScene
          : EditorialPhotoScene;
  return (
    <div
      className="customizer-native-film"
      data-fonts-ready={fontsReady}
      style={
        {
          position: 'absolute',
          left: 0,
          top: 0,
          width: m.width,
          height: m.height,
          transform: `scale(${p.width / m.width})`,
          transformOrigin: 'top left',
          fontFamily: 'BienVu Video, sans-serif',
          color: '#fff',
          overflow: 'hidden',
          isolation: 'isolate',
          background: canvasColor(p.settings.style),
        } as CSSProperties
      }
    >
      {[photoIndex - 1, photoIndex]
        .filter((index) => index >= 0 && timeline[index])
        .map((index) => {
          const photo = timeline[index],
            elapsed = at - photo.start,
            motion = galleryMotion(
              elapsed,
              photo.durationFrames,
              index,
              p.settings.photoMotion,
              p.settings.style,
              m.width,
              m.height,
            );
          return (
            <div
              key={photo.photoAssetId}
              style={{
                position: 'absolute',
                inset: 0,
                ...(stage ?? {}),
                overflow: 'hidden',
                opacity:
                  index === photoIndex && index > 0 && p.settings.transition === 'fade'
                    ? Math.max(0, Math.min(1, elapsed / 12))
                    : 1,
              }}
            >
              <img
                src={media[photo.photoAssetId]}
                alt=""
                draggable={false}
                style={{
                  width: '100%',
                  height: '100%',
                  objectFit: 'cover',
                  scale: motion.scale,
                  translate: `${motion.x}px ${motion.y}px`,
                }}
              />
            </div>
          );
        })}
      {p.photos.length > 0 && p.mapAt === null && (
        <Scene manifest={m} media={media} index={sceneIndex} frame={sceneFrame} Layers={PreviewLayers} />
      )}
      {p.mapAt === null && p.aspectRatio === '9:16' && !isDesignedStyle(p.settings.style) && (
        <VerticalBrand manifest={m} frame={at} media={media} logoBackground="#fff" />
      )}
      {p.map && p.mapAt !== null && (
        <MapScenePreview
          map={p.map}
          automatic={p.automaticMap}
          aspectRatio={p.aspectRatio}
          frame={p.mapAt}
          primaryColor={p.settings.primaryColor}
          secondaryColor={p.settings.secondaryColor}
          agencyName={p.agencyName}
          contact={m.contact === 'none' ? undefined : (m.brand[m.contact] ?? undefined)}
        />
      )}
      <AvatarPoster
        avatar={p.settings.avatar}
        look={p.look}
        frame={at}
        total={p.duration * 30}
        width={m.width}
        height={m.height}
      />
    </div>
  );
}
