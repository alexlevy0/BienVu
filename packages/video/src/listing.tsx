import React from 'react';
import {
  DesignedPhotoScene as SharedDesignedPhotoScene,
  isDesignedStyle,
  photoStage,
  canvasColor,
  galleryMotion,
  VerticalBrand,
  EditorialPhotoScene as SharedEditorialPhotoScene,
  StyledPhotoScene as SharedStyledPhotoScene,
  CinematicPhotoScene as SharedCinematicPhotoScene,
} from '@bienvu/presentation';
import { useEffect, useState } from 'react';
import {
  AbsoluteFill,
  Audio,
  Img,
  OffthreadVideo,
  Freeze,
  Sequence,
  cancelRender,
  continueRender,
  delayRender,
  interpolate,
  useCurrentFrame,
} from 'remotion';
import { VideoManifest, type AvatarContentBounds } from '@bienvu/contracts';
import { fitFont, subtitleGroups, VIDEO_SAFE as safe } from './layout';
import { HorizontalPhotoScene } from './horizontal';
import { EditorFilm } from './editor';
import { BackgroundMusic } from './background-music';
import { AvatarOverlay } from './avatar';
import { MapOverlay } from './map';
import { SceneLayers } from './scene-layers';
import { MarketingLayerContext } from './marketing-layer';
import { TrialWatermark } from './watermark';

// Ces URL sont résolues uniquement par le renderer Node vers son serveur
// loopback privé. Le manifeste serveur n'accepte jamais d'URL d'asset cliente.
export type ListingVideoProps = {
  manifest: VideoManifest | null;
  media: Record<string, string>;
  logoBackground: string;
  fontUrl: string;
  displayFontUrl: string;
  serifFontUrl?: string;
  maplibreModuleUrl?: string;
  maplibreWorkerUrl?: string;
  avatarBounds?: Record<string, AvatarContentBounds>;
  marketingLayer?: 'background' | 'foreground';
};
const dark = '#132a23',
  paper = '#f5f7f0';
function PhotoScene({
  manifest: m,
  media,
  index,
}: {
  manifest: VideoManifest;
  media: Record<string, string>;
  index: number;
}) {
  const f = useCurrentFrame(),
    scene = m.scenes[index],
    photo = m.photos.find((a) => a.id === scene.photoAssetId)!;
  const last = scene.kind === 'contact';
  const groups = subtitleGroups(scene.narrationText),
    audio = m.audio.find((a) => a.id === scene.audioAssetId)!;
  const voiceFrames = Math.ceil(((audio?.durationMs ?? (scene.durationFrames * 1000) / 30) * 30) / 1000);
  const totalChars = groups.reduce((n, g) => n + g.length, 0);
  let threshold = 0;
  const current =
    groups.find((g) => {
      threshold += (g.length / totalChars) * voiceFrames;
      return f < threshold;
    }) ?? groups.at(-1)!;
  const intro = index === 0;
  const opacity = interpolate(f, [0, 7], [index ? 0 : 1, 1], { extrapolateRight: 'clamp' });
  return (
    <SceneLayers
      manifest={m}
      index={index}
      style={{ opacity }}
      audio={m.voiceEnabled !== false && audio && <Audio src={media[audio.id]} volume={1} />}
      background={
        <>
          <div style={{ position: 'absolute', inset: 0, overflow: 'hidden' }}>
            <Img
              src={media[photo.id]}
              style={{
                width: '100%',
                height: '100%',
                objectFit: 'cover',
                filter: 'blur(32px)',
                opacity: 0.2,
                transform: 'scale(1.08)',
              }}
            />
          </div>
          <div
            style={{
              position: 'absolute',
              left: safe.left,
              right: safe.right,
              top: 380,
              height: last ? 430 : 730,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              borderRadius: 28,
              overflow: 'hidden',
              background: '#ffffff38',
            }}
          >
            <Img
              src={media[photo.id]}
              style={{
                width: '97%',
                height: '97%',
                objectFit: 'contain',
                borderRadius: 16,
                transform: `scale(${interpolate(f, [0, scene.durationFrames], [1, 1.015], { extrapolateRight: 'clamp' })})`,
              }}
            />
          </div>
        </>
      }
    >
      {!last && (
        <div style={{ position: 'absolute', left: safe.left, right: safe.right, top: 1160, color: dark }}>
          <div style={{ fontSize: 22, letterSpacing: 3, textTransform: 'uppercase', fontWeight: 600, opacity: 0.7 }}>
            {intro
              ? 'Votre prochaine adresse'
              : scene.kind === 'gallery'
                ? 'La visite en images'
                : 'Les repères du bien'}
          </div>
          <div
            style={{
              marginTop: 16,
              fontSize: fitFont(scene.captionText, safe.width, 120, 66, 28),
              fontWeight: 650,
              lineHeight: 1.12,
              overflowWrap: 'anywhere',
              whiteSpace: 'pre-wrap',
            }}
          >
            {scene.captionText}
          </div>
        </div>
      )}
      {last && (
        <div style={{ position: 'absolute', top: 865, left: safe.left, right: safe.right, color: dark }}>
          <div style={{ fontSize: 25, letterSpacing: 3, textTransform: 'uppercase' }}>
            {m.contact === 'none' ? 'Découvrez le bien.' : 'Parlons de votre projet.'}
          </div>
          <div
            style={{
              marginTop: 26,
              fontSize: fitFont(m.brand.name, safe.width, 180, 76, 28),
              lineHeight: 1.1,
              fontWeight: 650,
              overflowWrap: 'anywhere',
            }}
          >
            {m.brand.name}
          </div>
          {m.contact !== 'none' && (
            <div
              style={{
                marginTop: 32,
                borderTop: `2px solid ${dark}30`,
                paddingTop: 30,
                fontSize: fitFont(m.brand[m.contact]!, safe.width, 160, 47, 25),
                lineHeight: 1.3,
                overflowWrap: 'anywhere',
                fontWeight: 550,
              }}
            >
              {m.brand[m.contact]}
            </div>
          )}
        </div>
      )}
      {m.subtitlesEnabled !== false && (
        <div
          data-bienvu-subtitle="true"
          style={{
            position: 'absolute',
            left: safe.left,
            right: safe.right,
            bottom: 390,
            background: dark,
            color: '#fff',
            padding: '22px 30px',
            borderRadius: 16,
            fontSize: fitFont(current, safe.width - 60, 150, 40, 25),
            lineHeight: 1.28,
            overflowWrap: 'anywhere',
            textAlign: 'left',
          }}
        >
          {current}
        </div>
      )}
    </SceneLayers>
  );
}
function GalleryBackground({ manifest: m, media }: { manifest: VideoManifest; media: Record<string, string> }) {
  let at = m.map?.settings.position === 'start' ? m.map.settings.durationSeconds * 30 : 0;
  const stage = photoStage(m.visualStyle, m.width, m.height);
  return (
    <AbsoluteFill style={{ overflow: 'hidden' }}>
      <div style={{ position: 'absolute', inset: 0, ...(stage ?? {}), overflow: 'hidden' }}>
        {m.photoTimeline!.map((photo, index) => {
          const from = at;
          at += photo.durationFrames;
          return (
            <Sequence
              key={photo.photoAssetId}
              from={from}
              durationInFrames={photo.durationFrames + (m.photoTransition === 'cut' ? 0 : 12)}
              premountFor={30}
            >
              <GalleryPhoto
                manifest={m}
                media={media}
                photoId={photo.photoAssetId}
                index={index}
                duration={photo.durationFrames}
              />
            </Sequence>
          );
        })}
      </div>
    </AbsoluteFill>
  );
}
function GalleryPhoto({
  manifest: m,
  media,
  photoId,
  index,
  duration,
}: {
  manifest: VideoManifest;
  media: Record<string, string>;
  photoId: string;
  index: number;
  duration: number;
}) {
  const frame = useCurrentFrame(),
    motion = galleryMotion(frame, duration, index, m.photoMotion !== false, m.visualStyle, m.width, m.height);
  const animation = m.photoAnimations?.find((a) => a.photoAssetId === photoId);
  const opacity =
    index && m.photoTransition !== 'cut'
      ? interpolate(frame, [0, 12], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' })
      : 1;
  const style = {
    position: 'absolute' as const,
    width: '100%',
    height: '100%',
    objectFit: 'cover' as const,
    objectPosition: 'center',
  };
  // The generated clip plays at normal speed for short slots and gently slows
  // for longer slots. Its last frame is held through the next crossfade.
  return (
    <AbsoluteFill style={{ opacity, overflow: 'hidden' }}>
      {animation ? (
        <Freeze frame={duration - 1} active={frame >= duration}>
          <OffthreadVideo
            src={media[animation.asset.id]}
            muted
            playbackRate={Math.min(1, (animation.asset.durationMs! * 30) / 1000 / duration)}
            style={style}
          />
        </Freeze>
      ) : (
        <Img src={media[photoId]} style={{ ...style, scale: motion.scale, translate: `${motion.x}px ${motion.y}px` }} />
      )}
    </AbsoluteFill>
  );
}
function EditorialPhotoScene({
  manifest,
  media,
  index,
}: {
  manifest: VideoManifest;
  media: Record<string, string>;
  index: number;
}) {
  const frame = useCurrentFrame(),
    asset = manifest.audio.find((a) => a.id === manifest.scenes[index].audioAssetId);
  return (
    <SharedEditorialPhotoScene
      manifest={manifest}
      media={media}
      index={index}
      frame={frame}
      Layers={SceneLayers}
      Image={Img}
      audio={manifest.voiceEnabled !== false && asset && <Audio src={media[asset.id]} volume={1} />}
    />
  );
}
function StyledPhotoScene({
  manifest,
  media,
  index,
}: {
  manifest: VideoManifest;
  media: Record<string, string>;
  index: number;
}) {
  const frame = useCurrentFrame(),
    asset = manifest.audio.find((a) => a.id === manifest.scenes[index].audioAssetId);
  return (
    <SharedStyledPhotoScene
      manifest={manifest}
      media={media}
      index={index}
      frame={frame}
      Layers={SceneLayers}
      Image={Img}
      audio={manifest.voiceEnabled !== false && asset && <Audio src={media[asset.id]} volume={1} />}
    />
  );
}
function CinematicPhotoScene({
  manifest,
  media,
  index,
}: {
  manifest: VideoManifest;
  media: Record<string, string>;
  index: number;
}) {
  const frame = useCurrentFrame(),
    asset = manifest.audio.find((a) => a.id === manifest.scenes[index].audioAssetId);
  return (
    <SharedCinematicPhotoScene
      manifest={manifest}
      media={media}
      index={index}
      frame={frame}
      Layers={SceneLayers}
      Image={Img}
      audio={manifest.voiceEnabled !== false && asset && <Audio src={media[asset.id]} volume={1} />}
    />
  );
}
function DesignedPhotoScene({
  manifest,
  media,
  index,
  logoBackground,
}: {
  manifest: VideoManifest;
  media: Record<string, string>;
  index: number;
  logoBackground: string;
}) {
  const frame = useCurrentFrame(),
    asset = manifest.audio.find((a) => a.id === manifest.scenes[index].audioAssetId);
  return (
    <SharedDesignedPhotoScene
      manifest={manifest}
      media={media}
      index={index}
      frame={frame}
      logoBackground={logoBackground}
      Layers={SceneLayers}
      Image={Img}
      audio={manifest.voiceEnabled !== false && asset && <Audio src={media[asset.id]} volume={1} />}
    />
  );
}
export function ListingFilm(props: ListingVideoProps) {
  const m = VideoManifest.parse(props.manifest),
    f = useCurrentFrame();
  const [fontWait] = useState(() => delayRender('Chargement de la police locale'));
  const [, setFontLoaded] = useState(false);
  useEffect(() => {
    const faces = [new FontFace('BienVu Video', `url('${props.fontUrl}')`, { weight: '100 900' })];
    if (m.templateVersion !== 'bienvu-vertical/1')
      faces.push(new FontFace('BienVu Display', `url('${props.displayFontUrl}')`, { weight: '400' }));
    if ((m.editor || m.visualStyle === 'signature') && props.serifFontUrl)
      faces.push(new FontFace('BienVu Serif', `url('${props.serifFontUrl}')`, { weight: '400' }));
    Promise.all(faces.map((face) => face.load()))
      .then((loaded) => {
        for (const face of loaded) document.fonts.add(face);
        setFontLoaded(true);
        requestAnimationFrame(() => continueRender(fontWait));
      })
      .catch(cancelRender);
  }, [fontWait, props.fontUrl, props.displayFontUrl, props.serifFontUrl, m.templateVersion, m.editor, m.visualStyle]);
  if (m.editor)
    return (
      <EditorFilm
        manifest={m}
        media={props.media}
        moduleUrl={props.maplibreModuleUrl}
        workerUrl={props.maplibreWorkerUrl}
        bounds={props.avatarBounds}
      />
    );
  let at = 0;
  const scenes = m.scenes.map((s, index) => {
    const from = at;
    at += s.durationFrames;
    return { s, index, from };
  });
  const horizontal = m.templateVersion === 'bienvu-horizontal/1';
  const editorial = m.templateVersion !== 'bienvu-vertical/1',
    cinematic = editorial && m.visualStyle === 'cinematic';
  return (
    <MarketingLayerContext.Provider value={props.marketingLayer}>
      <AbsoluteFill
        style={{
          background:
            props.marketingLayer === 'foreground' ? 'transparent' : editorial ? canvasColor(m.visualStyle) : paper,
          fontFamily: 'BienVu Video, DejaVu Sans, sans-serif',
          color: editorial ? '#fff' : dark,
        }}
      >
        {props.marketingLayer !== 'foreground' && <BackgroundMusic manifest={m} media={props.media} />}
        {props.marketingLayer !== 'foreground' && m.photoTimeline && (
          <GalleryBackground manifest={m} media={props.media} />
        )}
        {scenes.map(({ s, index, from }) => (
          <Sequence key={s.id} from={from} durationInFrames={s.durationFrames}>
            {isDesignedStyle(m.visualStyle) ? (
              <DesignedPhotoScene
                manifest={m}
                media={props.media}
                index={index}
                logoBackground={props.logoBackground}
              />
            ) : horizontal ? (
              <HorizontalPhotoScene
                manifest={m}
                media={props.media}
                logoBackground={props.logoBackground}
                index={index}
              />
            ) : editorial ? (
              cinematic ? (
                <CinematicPhotoScene manifest={m} media={props.media} index={index} />
              ) : m.visualStyle === 'minimal' ? (
                <StyledPhotoScene manifest={m} media={props.media} index={index} />
              ) : (
                <EditorialPhotoScene manifest={m} media={props.media} index={index} />
              )
            ) : (
              <PhotoScene manifest={m} media={props.media} index={index} />
            )}
          </Sequence>
        ))}
        {props.marketingLayer !== 'background' && !horizontal && !isDesignedStyle(m.visualStyle) && (
          <VerticalBrand manifest={m} frame={f} media={props.media} logoBackground={props.logoBackground} Image={Img} />
        )}
        <MapOverlay
          manifest={m}
          media={props.media}
          moduleUrl={props.maplibreModuleUrl}
          workerUrl={props.maplibreWorkerUrl}
        />
        {!props.marketingLayer && <AvatarOverlay manifest={m} media={props.media} bounds={props.avatarBounds} />}
        {props.marketingLayer !== 'background' && m.rights.watermarked && (
          <TrialWatermark width={m.width} height={m.height} />
        )}
      </AbsoluteFill>
    </MarketingLayerContext.Provider>
  );
}
