import { mapFrame, VIDEO_LAYERS, type VideoManifest, type VideoPresentation } from '@bienvu/contracts';
import type { ComponentType, CSSProperties, ReactNode } from 'react';
import React from 'react';
import { cameraMotion } from './camera-motion';
import {
  contrastInk,
  displayArea,
  displayLocation,
  displayPrice,
  displayRooms,
  fitDisplayFont,
  fitFont,
  VIDEO_SAFE as safe,
  subtitleGroups,
} from './layout';

export { cameraMotion } from './camera-motion';
export * from './layout';
export const interpolate = (value: number, range: number[], output: number[], _options?: unknown) =>
  output[0] + (output[1] - output[0]) * Math.max(0, Math.min(1, (value - range[0]) / (range[1] - range[0])));
const dark = '#132a23';
export type SceneLayerProps = {
  manifest: VideoManifest;
  index: number;
  background: ReactNode;
  children: ReactNode;
  audio?: ReactNode;
  style?: CSSProperties;
  frame?: number;
  'data-bienvu-style'?: string;
  'data-bienvu-orientation'?: string;
};
const fill: CSSProperties = {
  position: 'absolute',
  inset: 0,
  width: '100%',
  height: '100%',
  display: 'flex',
  flexDirection: 'column',
};
export function AbsoluteFill({ style, children, ...props }: { style?: CSSProperties; children?: ReactNode }) {
  return (
    <div {...props} style={{ ...fill, ...style }}>
      {children}
    </div>
  );
}
export function PreviewLayers({
  manifest,
  index,
  background,
  children,
  audio,
  style,
  frame = 0,
  ...attributes
}: SceneLayerProps) {
  const start = manifest.scenes.slice(0, index).reduce((n, s) => n + s.durationFrames, 0),
    total = manifest.scenes.reduce((n, s) => n + s.durationFrames, 0),
    visible = mapFrame(manifest.map?.settings, total, start + frame) === null;
  const { background: color, ...foreground } = style ?? {};
  return (
    <>
      <AbsoluteFill style={{ ...style, background: color }}>{background}</AbsoluteFill>
      <div
        {...attributes}
        style={{ ...fill, ...foreground, zIndex: VIDEO_LAYERS.content, visibility: visible ? 'visible' : 'hidden' }}
      >
        {children}
      </div>
      {audio}
    </>
  );
}
const PlainImage = ({ src, style }: { src: string; style?: CSSProperties }) => <img src={src} alt="" style={style} />;
export type PresentationProps = {
  manifest: VideoManifest;
  media: Record<string, string>;
  index: number;
  frame: number;
  audio?: ReactNode;
  logoBackground?: string;
  Image?: ComponentType<{ src: string; style?: CSSProperties }>;
  Layers: ComponentType<SceneLayerProps>;
};
const vehicleLabels = (p: VideoPresentation) =>
  p.vehicle
    ? [
        p.vehicle.year === null ? '' : String(p.vehicle.year),
        p.vehicle.mileageKm === null ? '' : `${new Intl.NumberFormat('fr-FR').format(p.vehicle.mileageKm)} km`,
        p.vehicle.fuel ?? '',
      ].filter(Boolean)
    : [];
const propertyName = (type: VideoPresentation['propertyType']) =>
  type === 'apartment' ? 'Appartement' : type === 'house' ? 'Maison' : 'Bien immobilier';
function posterHeadline(kind: VideoManifest['scenes'][number]['kind'], p: VideoPresentation, contact: boolean) {
  if (kind === 'intro' || kind === 'location') return displayLocation(p.locality);
  if (kind === 'area' && p.areaM2 !== null) return displayArea(p.areaM2).toLocaleUpperCase('fr-FR');
  if (kind === 'rooms' && p.rooms !== null) return displayRooms(p.rooms).toLocaleUpperCase('fr-FR');
  if (kind === 'price' && p.priceCents !== null) return displayPrice(p.priceCents).toLocaleUpperCase('fr-FR');
  if (kind === 'gallery') return 'EN IMAGES';
  return contact ? 'PARLONS-EN' : 'À DÉCOUVRIR';
}

function posterLabel(kind: VideoManifest['scenes'][number]['kind'], p: VideoPresentation, contact: boolean) {
  if (kind === 'intro') return p.transaction === 'sale' ? 'À VENDRE' : 'À LOUER';
  if (kind === 'area') return 'LA SURFACE';
  if (kind === 'rooms') return 'LES PIÈCES';
  if (kind === 'price') return p.transaction === 'sale' ? 'LE PRIX' : 'LE LOYER';
  if (kind === 'location') return p.vehicle ? 'LES CARACTÉRISTIQUES' : 'LA LOCALISATION';
  if (kind === 'gallery') return p.vehicle ? 'LE VÉHICULE EN IMAGES' : 'LA VISITE';
  return contact ? 'VOTRE CONTACT' : 'POUR EN SAVOIR PLUS';
}

export function EditorialPhotoScene({
  manifest: m,
  media,
  index,
  frame: currentFrame,
  audio: sound,
  Image: Img = PlainImage,
  Layers: SceneLayers,
}: PresentationProps) {
  const f = currentFrame,
    scene = m.scenes[index],
    photo = m.photos.find((a) => a.id === scene.photoAssetId)!;
  const p = m.presentation!,
    contact = scene.kind === 'contact',
    intro = scene.kind === 'intro';
  const shortTitle =
    p.title.length <= 75 ? p.title : p.vehicle ? 'Le véhicule en images' : propertyName(p.propertyType);
  const heading = posterHeadline(scene.kind, p, m.contact !== 'none');
  const audio = m.audio.find((a) => a.id === scene.audioAssetId)!,
    voiceFrames = Math.ceil(((audio?.durationMs ?? (scene.durationFrames * 1000) / 30) * 30) / 1000);
  const groups = subtitleGroups(scene.narrationText, 68),
    totalChars = groups.reduce((n, g) => n + g.length, 0);
  let threshold = 0;
  const subtitle =
    groups.find((g) => {
      threshold += (g.length / totalChars) * voiceFrames;
      return f < threshold;
    }) ?? groups.at(-1)!;
  const opacity = interpolate(f, [0, 7], [index ? 0 : 1, 1], { extrapolateRight: 'clamp' });
  const accent = m.brand.primaryColor,
    ink = contrastInk(accent),
    width = safe.width;
  const zoom =
    m.photoMotion === false
      ? 1
      : interpolate(f, [0, scene.durationFrames], [1.01, 1.055], { extrapolateRight: 'clamp' });
  return (
    <SceneLayers
      manifest={m}
      index={index}
      frame={currentFrame}
      style={{ opacity, background: m.photoTimeline ? undefined : '#151b16', color: '#fff', overflow: 'hidden' }}
      audio={sound}
      background={
        <>
          {!m.photoTimeline && (
            <Img
              src={media[photo.id]}
              style={{
                width: '100%',
                height: '100%',
                objectFit: m.presentation?.vehicle ? 'contain' : 'cover',
                backgroundColor: m.presentation?.vehicle ? '#14251d' : undefined,
                objectPosition: 'center',
                transform: `scale(${zoom})`,
              }}
            />
          )}
          <AbsoluteFill
            style={{
              background:
                'linear-gradient(180deg,rgba(8,13,10,.30) 0%,rgba(8,13,10,.06) 36%,rgba(8,13,10,.15) 51%,rgba(8,13,10,.54) 70%,rgba(8,13,10,.78) 100%)',
            }}
          />
        </>
      }
    >
      <div
        style={{
          position: 'absolute',
          left: safe.left,
          top: 186,
          maxWidth: width,
          background: accent,
          color: ink,
          padding: '13px 27px 11px',
          fontSize: 38,
          fontWeight: 750,
          letterSpacing: 8,
          lineHeight: 1.1,
        }}
      >
        {posterLabel(scene.kind, p, m.contact !== 'none')}
      </div>
      <div
        style={{
          position: 'absolute',
          left: safe.left,
          right: safe.right,
          top: 286,
          maxHeight: 385,
          fontFamily: 'BienVu Display, Impact, sans-serif',
          fontSize: fitDisplayFont(heading, width, 370, 240, 42),
          lineHeight: 0.98,
          letterSpacing: -2,
          textShadow: '0 4px 28px #0008',
          overflowWrap: 'anywhere',
        }}
      >
        {heading}
      </div>
      {m.subtitlesEnabled !== false && (
        <div
          data-bienvu-subtitle="true"
          style={{
            position: 'absolute',
            left: safe.left,
            right: safe.right,
            bottom: 675,
            background: 'rgba(15,23,18,.78)',
            borderLeft: `7px solid ${accent}`,
            padding: '20px 25px',
            fontSize: fitFont(subtitle, width - 57, 170, 49, 34),
            fontWeight: 600,
            lineHeight: 1.2,
            overflowWrap: 'anywhere',
            whiteSpace: 'pre-wrap',
          }}
        >
          {subtitle}
        </div>
      )}
      {intro && (
        <div style={{ position: 'absolute', left: safe.left, right: safe.right, bottom: 337 }}>
          {p.priceCents !== null && (
            <div
              style={{
                fontFamily: 'BienVu Display, Impact, sans-serif',
                fontSize: fitDisplayFont(displayPrice(p.priceCents), width, 190, 190, 45),
                lineHeight: 1,
                textShadow: '0 4px 20px #0008',
              }}
            >
              {displayPrice(p.priceCents)}
              {p.transaction === 'rent' && (
                <span style={{ fontFamily: 'BienVu Video, sans-serif', fontSize: 34, fontWeight: 650, marginLeft: 16 }}>
                  {' '}
                  / mois
                </span>
              )}
            </div>
          )}
          <div
            style={{
              fontSize: fitFont(shortTitle, width, 120, 57, 30),
              fontWeight: 700,
              lineHeight: 1.12,
              maxHeight: 130,
              overflowWrap: 'anywhere',
              textShadow: '0 3px 12px #000a',
            }}
          >
            {shortTitle}
          </div>
          <div style={{ display: 'flex', gap: 14, marginTop: 28, flexWrap: 'wrap' }}>
            {p.vehicle &&
              vehicleLabels(p).map((label) => (
                <span
                  key={label}
                  style={{ background: accent, color: ink, padding: '8px 19px', fontSize: 36, fontWeight: 750 }}
                >
                  {label}
                </span>
              ))}
            {p.areaM2 !== null && (
              <span style={{ background: accent, color: ink, padding: '8px 19px', fontSize: 42, fontWeight: 750 }}>
                {displayArea(p.areaM2)}
              </span>
            )}
            {p.rooms !== null && (
              <span style={{ background: accent, color: ink, padding: '8px 19px', fontSize: 42, fontWeight: 750 }}>
                {displayRooms(p.rooms)}
              </span>
            )}
          </div>
        </div>
      )}
      {!intro && !contact && (
        <div style={{ position: 'absolute', left: safe.left, right: safe.right, bottom: 350 }}>
          <div style={{ width: 136, height: 7, background: accent, marginBottom: 22 }} />
          <div
            style={{
              fontSize: fitFont(shortTitle, width, 170, 62, 30),
              fontWeight: 700,
              lineHeight: 1.15,
              overflowWrap: 'anywhere',
              textShadow: '0 3px 12px #000a',
            }}
          >
            {shortTitle}
          </div>
          <div style={{ fontSize: 34, marginTop: 22, opacity: 0.94 }}>
            {p.vehicle ? vehicleLabels(p).join(' · ') : `${propertyName(p.propertyType)} · ${p.locality}`}
          </div>
        </div>
      )}
      {contact && (
        <div
          style={{
            position: 'absolute',
            left: safe.left,
            right: safe.right,
            bottom: 340,
            padding: '26px 30px',
            background: 'rgba(225,232,217,.94)',
            color: dark,
            borderTop: `8px solid ${accent}`,
          }}
        >
          <div
            style={{
              fontSize: fitFont(m.brand.name, width - 60, 135, 73, 24),
              fontWeight: 750,
              lineHeight: 1.08,
              overflowWrap: 'anywhere',
            }}
          >
            {m.brand.name}
          </div>
          {m.contact !== 'none' && (
            <div
              style={{
                marginTop: 18,
                fontSize: fitFont(m.brand[m.contact]!, width - 60, 125, 51, 20),
                fontWeight: 600,
                lineHeight: 1.16,
                overflowWrap: 'anywhere',
              }}
            >
              {m.brand[m.contact]}
            </div>
          )}
        </div>
      )}
    </SceneLayers>
  );
}

export function StyledPhotoScene({
  manifest: m,
  media,
  index,
  frame: currentFrame,
  audio: sound,
  Image: Img = PlainImage,
  Layers: SceneLayers,
}: PresentationProps) {
  const frame = currentFrame,
    scene = m.scenes[index],
    p = m.presentation!,
    audio = m.audio.find((a) => a.id === scene.audioAssetId)!;
  const cinema = m.visualStyle === 'cinematic',
    contact = scene.kind === 'contact',
    width = safe.width;
  const heading = contact ? m.brand.name : index === 0 ? p.title : posterHeadline(scene.kind, p, m.contact !== 'none');
  const groups = subtitleGroups(scene.narrationText, 68),
    length = groups.reduce((n, g) => n + g.length, 0);
  const voiceFrames = Math.ceil(((audio?.durationMs ?? (scene.durationFrames * 1000) / 30) * 30) / 1000);
  let threshold = 0;
  const subtitle =
    groups.find((g) => {
      threshold += (g.length / length) * voiceFrames;
      return frame < threshold;
    }) ?? groups.at(-1)!;
  const panel = m.brand.secondaryColor,
    ink = contrastInk(panel),
    accent = m.brand.primaryColor;
  return (
    <SceneLayers
      manifest={m}
      index={index}
      frame={currentFrame}
      data-bienvu-style={m.visualStyle}
      style={{ color: '#fff' }}
      audio={sound}
      background={
        <>
          {!m.photoTimeline && (
            <Img
              src={media[scene.photoAssetId]}
              style={{
                width: '100%',
                height: '100%',
                objectFit: m.presentation?.vehicle ? 'contain' : 'cover',
                backgroundColor: m.presentation?.vehicle ? '#14251d' : undefined,
              }}
            />
          )}
          <AbsoluteFill
            style={{
              background: cinema
                ? 'linear-gradient(180deg,#0003 0%,transparent 38%,#000c 100%)'
                : 'linear-gradient(180deg,#0002 0%,transparent 50%,#0006 100%)',
            }}
          />
        </>
      }
    >
      <div
        style={{
          position: 'absolute',
          top: 210,
          left: safe.left,
          color: '#fff',
          fontSize: 35,
          letterSpacing: cinema ? 5 : 2,
          textTransform: 'uppercase',
          textShadow: '0 2px 12px #0008',
        }}
      >
        {p.locality}
      </div>
      {m.subtitlesEnabled !== false && (
        <div
          data-bienvu-subtitle="true"
          style={{
            position: 'absolute',
            left: safe.left,
            right: safe.right,
            bottom: 780,
            background: '#000a',
            padding: '18px 24px',
            fontSize: fitFont(subtitle, width - 48, 150, 45, 30),
            textAlign: cinema ? 'center' : 'left',
            lineHeight: 1.2,
          }}
        >
          {subtitle}
        </div>
      )}
      <div
        style={{
          position: 'absolute',
          left: safe.left,
          right: safe.right,
          bottom: 335,
          padding: cinema ? '28px 0' : '34px 38px',
          background: cinema ? undefined : panel,
          color: cinema ? '#fff' : ink,
          borderTop: cinema ? undefined : `6px solid ${accent}`,
          textAlign: cinema ? 'center' : 'left',
        }}
      >
        <div
          style={{
            color: cinema ? accent : ink,
            fontSize: 25,
            letterSpacing: 4,
            textTransform: 'uppercase',
            marginBottom: 20,
          }}
        >
          {posterLabel(scene.kind, p, m.contact !== 'none')}
        </div>
        <div
          style={{
            fontFamily: cinema ? 'Georgia, DejaVu Serif, serif' : 'BienVu Video, sans-serif',
            fontSize: fitFont(heading, width - 76, 260, cinema ? 92 : 65, 30),
            fontWeight: cinema ? 400 : 650,
            lineHeight: 1.08,
            overflowWrap: 'anywhere',
          }}
        >
          {heading}
        </div>
        {contact && m.contact !== 'none' ? (
          <div
            style={{
              fontSize: fitFont(m.brand[m.contact]!, width - 76, 160, 46, 23),
              lineHeight: 1.2,
              marginTop: 25,
              overflowWrap: 'anywhere',
            }}
          >
            {m.brand[m.contact]}
          </div>
        ) : (
          <>
            <div style={{ marginTop: 24, fontSize: 34 }}>
              {(p.vehicle
                ? vehicleLabels(p)
                : [p.areaM2 !== null ? displayArea(p.areaM2) : '', p.rooms !== null ? displayRooms(p.rooms) : '']
              )
                .filter(Boolean)
                .join(' · ')}
            </div>
            {p.priceCents !== null && (
              <div style={{ fontSize: 54, fontWeight: 650, marginTop: 12 }}>
                {displayPrice(p.priceCents)}
                {p.transaction === 'rent' ? ' / mois' : ''}
              </div>
            )}
          </>
        )}
      </div>
    </SceneLayers>
  );
}

export function CinematicPhotoScene({
  manifest: m,
  media,
  index,
  frame: currentFrame,
  audio: sound,
  Image: Img = PlainImage,
  Layers: SceneLayers,
}: PresentationProps) {
  const frame = currentFrame,
    scene = m.scenes[index],
    p = m.presentation!,
    contact = scene.kind === 'contact';
  const audio = m.audio.find((a) => a.id === scene.audioAssetId)!,
    voiceFrames = Math.ceil(((audio?.durationMs ?? (scene.durationFrames * 1000) / 30) * 30) / 1000);
  const groups = subtitleGroups(scene.narrationText, 68),
    chars = groups.reduce((n, g) => n + g.length, 0);
  let threshold = 0;
  const subtitle =
    groups.find((g) => {
      threshold += (g.length / chars) * voiceFrames;
      return frame < threshold;
    }) ?? groups.at(-1)!;
  const ink = contrastInk(m.brand.secondaryColor),
    width = safe.width;
  const entrance = interpolate(frame, [8, 32], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  const fallbackMotion = cameraMotion(frame, scene.durationFrames, index, m.photoMotion !== false, true);
  return (
    <SceneLayers
      manifest={m}
      index={index}
      frame={currentFrame}
      data-bienvu-style="cinematic"
      audio={sound}
      background={
        <>
          {!m.photoTimeline && (
            <Img
              src={media[scene.photoAssetId]}
              style={{
                width: '100%',
                height: '100%',
                objectFit: m.presentation?.vehicle ? 'contain' : 'cover',
                backgroundColor: m.presentation?.vehicle ? '#14251d' : undefined,
                scale: fallbackMotion.scale,
                translate: `${fallbackMotion.x}px ${fallbackMotion.y}px`,
              }}
            />
          )}
          {/* The upper half stays visible, including the last photo in a full gallery. */}
          {contact && (
            <AbsoluteFill
              style={{
                opacity: entrance,
                background: `linear-gradient(180deg,transparent 30%,${m.brand.secondaryColor}99 48%,${m.brand.secondaryColor}f5 64%)`,
              }}
            />
          )}
        </>
      }
    >
      {contact && (
        <div
          data-bienvu-cinema-endcard="true"
          style={{
            position: 'absolute',
            left: safe.left,
            right: safe.right,
            bottom: 350,
            color: ink,
            opacity: entrance,
            translate: `0 ${interpolate(frame, [8, 32], [20, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' })}px`,
          }}
        >
          <div style={{ fontSize: 28, letterSpacing: 5, textTransform: 'uppercase', marginBottom: 18 }}>
            {p.transaction === 'sale' ? 'À vendre' : 'À louer'}
          </div>
          <div
            style={{
              fontFamily: 'Georgia, DejaVu Serif, serif',
              fontSize: fitFont(displayLocation(p.locality), width, 155, 88, 30, 'Georgia', 400, 1.12),
              lineHeight: 1.12,
              overflowWrap: 'anywhere',
            }}
          >
            {displayLocation(p.locality)}
          </div>
          <div
            style={{
              marginTop: 20,
              fontSize: fitFont(p.title, width, 155, 47, 27),
              lineHeight: 1.2,
              overflowWrap: 'anywhere',
            }}
          >
            {p.title}
          </div>
          <div style={{ marginTop: 22, fontSize: 40 }}>
            {(p.vehicle
              ? vehicleLabels(p)
              : [p.areaM2 !== null ? displayArea(p.areaM2) : '', p.rooms !== null ? displayRooms(p.rooms) : '']
            )
              .filter(Boolean)
              .join(' · ')}
          </div>
          {p.priceCents !== null && (
            <div
              style={{
                marginTop: 16,
                fontSize: fitFont(displayPrice(p.priceCents, p.transaction === 'rent'), width, 100, 65, 30),
                fontWeight: 650,
                lineHeight: 1.2,
              }}
            >
              {displayPrice(p.priceCents, p.transaction === 'rent')}
            </div>
          )}
          <div style={{ width: 110, height: 4, background: m.brand.primaryColor, margin: '30px 0 24px' }} />
          <div
            style={{
              fontSize: fitFont(m.brand.name, width, 100, 46, 24),
              fontWeight: 650,
              lineHeight: 1.2,
              overflowWrap: 'anywhere',
            }}
          >
            {m.brand.name}
          </div>
          {m.contact !== 'none' && (
            <div
              style={{
                marginTop: 14,
                fontSize: fitFont(m.brand[m.contact]!, width, 100, 38, 22),
                lineHeight: 1.2,
                overflowWrap: 'anywhere',
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
            bottom: contact ? 1250 : 520,
            background: 'rgba(12,17,14,.72)',
            color: '#fff',
            padding: '16px 24px',
            fontSize: fitFont(subtitle, width - 48, 145, 43, 28),
            lineHeight: 1.25,
            textAlign: 'center',
            overflowWrap: 'anywhere',
          }}
        >
          {subtitle}
        </div>
      )}
    </SceneLayers>
  );
}

export function HorizontalPhotoScene({
  manifest: m,
  media,
  index,
  frame: currentFrame,
  audio: sound,
  logoBackground = '#fff',
  Image: Img = PlainImage,
  Layers: SceneLayers,
}: PresentationProps) {
  const frame = currentFrame,
    scene = m.scenes[index],
    p = m.presentation!,
    contact = scene.kind === 'contact';
  const cinematic = m.visualStyle === 'cinematic',
    minimal = m.visualStyle === 'minimal';
  const audio = m.audio.find((a) => a.id === scene.audioAssetId),
    voiceFrames = Math.ceil(((audio?.durationMs ?? (scene.durationFrames * 1000) / 30) * 30) / 1000);
  const groups = subtitleGroups(scene.narrationText, 95),
    chars = groups.reduce((n, g) => n + g.length, 0);
  let threshold = 0;
  const subtitle =
    groups.find((g) => {
      threshold += (g.length / chars) * voiceFrames;
      return frame < threshold;
    }) ?? groups.at(-1)!;
  const accent = m.brand.primaryColor,
    panel = m.brand.secondaryColor,
    ink = contrastInk(panel);
  const facts = [p.areaM2 !== null ? displayArea(p.areaM2) : '', p.rooms !== null ? displayRooms(p.rooms) : '']
    .filter(Boolean)
    .join(' · ');
  const price = p.priceCents !== null ? displayPrice(p.priceCents, p.transaction === 'rent') : '';
  const label = contact
    ? m.contact === 'none'
      ? 'À découvrir'
      : 'Votre contact'
    : p.transaction === 'sale'
      ? 'À vendre'
      : 'À louer';
  const heading =
    scene.kind === 'area' && p.areaM2 !== null
      ? displayArea(p.areaM2)
      : scene.kind === 'rooms' && p.rooms !== null
        ? displayRooms(p.rooms)
        : scene.kind === 'price' && price
          ? price
          : scene.kind === 'gallery'
            ? 'En images'
            : displayLocation(p.locality);
  const entrance = interpolate(frame, [8, 28], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  return (
    <SceneLayers
      manifest={m}
      index={index}
      frame={currentFrame}
      data-bienvu-style={m.visualStyle ?? 'editorial'}
      data-bienvu-orientation="horizontal"
      style={{ color: '#fff' }}
      audio={sound}
      background={
        <>
          {!m.photoTimeline && (
            <Img
              src={media[scene.photoAssetId]}
              style={{
                width: '100%',
                height: '100%',
                objectFit: m.presentation?.vehicle ? 'contain' : 'cover',
                backgroundColor: m.presentation?.vehicle ? '#14251d' : undefined,
              }}
            />
          )}
          {(!cinematic || contact) && (
            <AbsoluteFill
              style={{
                opacity: cinematic ? entrance : 1,
                background: cinematic
                  ? `linear-gradient(180deg,transparent 28%,${panel}99 52%,${panel}f5 76%)`
                  : 'linear-gradient(180deg,#0005 0%,transparent 38%,#000b 100%)',
              }}
            />
          )}
        </>
      }
    >
      {!cinematic && !minimal && (
        <>
          <div
            style={{
              position: 'absolute',
              top: 86,
              left: 96,
              padding: '12px 24px',
              background: accent,
              color: contrastInk(accent),
              fontSize: 30,
              letterSpacing: 6,
              fontWeight: 750,
              textTransform: 'uppercase',
            }}
          >
            {label}
          </div>
          <div
            style={{
              position: 'absolute',
              left: 96,
              top: 172,
              width: 1250,
              fontFamily: 'BienVu Display, Impact, sans-serif',
              fontSize: fitDisplayFont(heading, 1250, 210, 175, 45),
              lineHeight: 0.98,
              overflowWrap: 'anywhere',
              textShadow: '0 4px 24px #0008',
            }}
          >
            {contact ? 'PARLONS-EN' : heading}
          </div>
        </>
      )}
      {(contact || !cinematic) && (
        <div
          data-bienvu-cinema-endcard={cinematic && contact ? 'true' : undefined}
          style={{
            position: 'absolute',
            left: 96,
            right: 96,
            bottom: 80,
            opacity: cinematic ? entrance : 1,
            display: 'flex',
            alignItems: 'flex-end',
            gap: 80,
            color: cinematic || minimal ? ink : '#fff',
            padding: minimal ? '32px 40px' : undefined,
            background: minimal ? panel : undefined,
            borderTop: minimal ? `6px solid ${accent}` : undefined,
          }}
        >
          <div style={{ flex: 1, minWidth: 0, maxWidth: contact ? 1000 : 1200 }}>
            {cinematic && (
              <div style={{ fontSize: 25, letterSpacing: 5, textTransform: 'uppercase', marginBottom: 14 }}>
                {label}
              </div>
            )}
            <div
              style={{
                fontFamily: cinematic ? 'Georgia, DejaVu Serif, serif' : 'BienVu Video, sans-serif',
                fontSize: fitFont(
                  cinematic ? displayLocation(p.locality) : p.title,
                  1000,
                  140,
                  cinematic ? 82 : 58,
                  28,
                  cinematic ? 'Georgia' : 'BienVu Video',
                  cinematic ? 400 : 650,
                  1.12,
                ),
                lineHeight: 1.12,
                fontWeight: cinematic ? 400 : 650,
                overflowWrap: 'anywhere',
              }}
            >
              {cinematic ? displayLocation(p.locality) : p.title}
            </div>
            {cinematic && (
              <div
                style={{
                  marginTop: 16,
                  fontSize: fitFont(p.title, 1000, 95, 42, 26),
                  lineHeight: 1.2,
                  overflowWrap: 'anywhere',
                }}
              >
                {p.title}
              </div>
            )}
            {facts && <div style={{ marginTop: 18, fontSize: 36, fontWeight: 600 }}>{facts}</div>}
            {price && (
              <div
                style={{
                  marginTop: 12,
                  fontFamily: !cinematic && !minimal ? 'BienVu Display, Impact, sans-serif' : undefined,
                  fontSize: !cinematic && !minimal ? fitDisplayFont(price, 1000, 130, 110, 38) : 58,
                  lineHeight: 1.15,
                  fontWeight: !cinematic && !minimal ? 400 : 650,
                }}
              >
                {price}
              </div>
            )}
          </div>
          {contact && (
            <div style={{ width: 550, flexShrink: 0, borderLeft: `4px solid ${accent}`, paddingLeft: 38 }}>
              {m.logo && (
                <Img
                  src={media[m.logo.id]}
                  style={{
                    width: 90,
                    height: 90,
                    objectFit: 'contain',
                    padding: 10,
                    background: logoBackground,
                    marginBottom: 14,
                  }}
                />
              )}
              <div
                style={{
                  fontSize: fitFont(m.brand.name, 510, 145, 52, 25),
                  fontWeight: 650,
                  lineHeight: 1.15,
                  overflowWrap: 'anywhere',
                }}
              >
                {m.brand.name}
              </div>
              {m.contact !== 'none' && (
                <div
                  style={{
                    marginTop: 18,
                    fontSize: fitFont(m.brand[m.contact]!, 510, 140, 36, 22),
                    lineHeight: 1.2,
                    overflowWrap: 'anywhere',
                  }}
                >
                  {m.brand[m.contact]}
                </div>
              )}
            </div>
          )}
        </div>
      )}
      {m.subtitlesEnabled !== false && (
        <div
          data-bienvu-subtitle="true"
          style={{
            position: 'absolute',
            left: 384,
            right: 384,
            ...(contact ? { top: cinematic ? 80 : 400 } : { bottom: cinematic ? 80 : 480 }),
            background: '#0c110ed1',
            color: '#fff',
            padding: '16px 26px',
            fontSize: fitFont(subtitle, 1100, 135, 43, 28),
            lineHeight: 1.25,
            textAlign: 'center',
            overflowWrap: 'anywhere',
          }}
        >
          {subtitle}
        </div>
      )}
      {!contact && (m.logo || m.brand.name) && (
        <div
          style={{
            position: 'absolute',
            top: 64,
            right: 96,
            maxWidth: 330,
            display: 'flex',
            alignItems: 'center',
            gap: 12,
            background: '#111b',
            padding: '12px 18px',
            borderRadius: 10,
            fontSize: 25,
            lineHeight: 1.2,
            overflowWrap: 'anywhere',
          }}
        >
          {m.logo && (
            <Img
              src={media[m.logo.id]}
              style={{ width: 54, height: 54, objectFit: 'contain', background: logoBackground }}
            />
          )}
          {m.brand.name}
        </div>
      )}
    </SceneLayers>
  );
}

export function VerticalBrand(props: {
  manifest: VideoManifest;
  frame: number;
  media: Record<string, string>;
  logoBackground: string;
  Image?: ComponentType<{ src: string; style?: CSSProperties }>;
}) {
  const m = props.manifest,
    f = props.frame,
    at = m.scenes.reduce((n, s) => n + s.durationFrames, 0),
    editorial = m.templateVersion !== 'bienvu-vertical/1',
    cinematic = editorial && m.visualStyle === 'cinematic',
    compactBrand = m.brand.name.length <= 28 ? m.brand.name : null;
  let start = 0;
  const scenes = m.scenes.map((s) => {
    const from = start;
    start += s.durationFrames;
    return { from };
  });
  const Img = props.Image ?? PlainImage;
  return (
    <AbsoluteFill
      style={{
        zIndex: VIDEO_LAYERS.content,
        visibility: mapFrame(m.map?.settings, at, f) === null ? 'visible' : 'hidden',
      }}
    >
      {!editorial && (
        <div
          style={{
            position: 'absolute',
            left: safe.left,
            right: safe.right,
            top: 190,
            minHeight: 112,
            display: 'flex',
            alignItems: 'flex-start',
            gap: 24,
          }}
        >
          {m.logo && (
            <div
              style={{
                width: 112,
                height: 112,
                flexShrink: 0,
                borderRadius: 18,
                background: props.logoBackground,
                padding: 14,
                boxSizing: 'border-box',
              }}
            >
              <Img src={props.media[m.logo.id]} style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
            </div>
          )}
          <div style={{ minWidth: 0, flex: 1 }}>
            <div
              style={{
                fontSize: fitFont(m.brand.name, m.logo ? 690 : safe.width, 80, 42, 22),
                fontWeight: 650,
                lineHeight: 1.12,
                overflowWrap: 'anywhere',
              }}
            >
              {m.brand.name}
            </div>
            <div style={{ marginTop: 10, fontSize: 19, letterSpacing: 3, fontWeight: 500 }}>
              L’IMMOBILIER, EN MOUVEMENT
            </div>
          </div>
        </div>
      )}
      {cinematic && f < scenes.at(-1)!.from && (
        <div
          style={{
            position: 'absolute',
            bottom: 350,
            right: safe.right,
            padding: m.logo ? 14 : '13px 18px',
            borderRadius: m.logo ? '50%' : 12,
            background: m.logo ? props.logoBackground : '#111b',
            color: '#fff',
            fontSize: fitFont(m.brand.name, 224, 90, 24, 14),
            lineHeight: 1.2,
            overflowWrap: 'anywhere',
            maxWidth: 260,
          }}
        >
          {m.logo ? (
            <Img
              src={props.media[m.logo.id]}
              style={{ display: 'block', width: 90, height: 90, objectFit: 'contain' }}
            />
          ) : (
            m.brand.name
          )}
        </div>
      )}
      {editorial && !cinematic && (m.logo || compactBrand) && (
        <div
          style={{
            position: 'absolute',
            top: 132,
            right: safe.right,
            maxWidth: 260,
            display: 'flex',
            alignItems: 'center',
            gap: 11,
            padding: '8px 13px',
            background: 'rgba(15,23,18,.72)',
            fontSize: 25,
            fontWeight: 700,
            lineHeight: 1.08,
            overflowWrap: 'anywhere',
          }}
        >
          {m.logo && (
            <Img
              src={props.media[m.logo.id]}
              style={{ width: 44, height: 44, objectFit: 'contain', background: props.logoBackground }}
            />
          )}
          {compactBrand}
        </div>
      )}
      {!cinematic && (
        <>
          <div
            style={{
              position: 'absolute',
              left: safe.left,
              right: safe.right,
              top: editorial ? 118 : 338,
              height: 4,
              background: m.brand.primaryColor,
            }}
          />
          <div
            style={{
              position: 'absolute',
              left: safe.left,
              right: safe.right,
              top: editorial ? 118 : 338,
              height: 4,
              background: m.brand.secondaryColor,
              transformOrigin: 'left center',
              transform: `scaleX(${f / Math.max(1, at - 1)})`,
            }}
          />
        </>
      )}
    </AbsoluteFill>
  );
}

export {
  canvasColor,
  DesignedPhotoScene,
  galleryMotion,
  galleryPhotoIndex,
  isDesignedStyle,
  photoStage,
} from './new-styles';
