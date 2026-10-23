import {
  mapInterval,
  videoPhotoTimeline,
  selectedAnimationIndices,
  type AgencyBrand,
  type VideoCustomization,
  type VideoDuration,
  type VideoAspectRatio,
  type VideoMap,
  type VideoManifest,
  SYNTHETIC_VOICE_DISCLOSURE,
} from '@bienvu/contracts';
import type { ManualDraftFields } from './listing-draft';
// This model stays in the browser. It is never persisted, billed or sent to a provider.
// Voice timings are provisional until narration has actually been synthesized.
export function customizationPreview(input: {
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
}) {
  const { settings, fields, photos, duration } = input,
    total = duration * 30,
    interval = mapInterval(input.map, total),
    count = Math.max(1, photos.length);
  const animated = selectedAnimationIndices(
    photos.map((p, i) => p.slot ?? i),
    settings,
  )
    .map((index) => photos[index]?.id)
    .filter((id): id is string => Boolean(id));
  const durations =
    photos.length >= 3
      ? videoPhotoTimeline(photos, total, animated, interval.durationFrames)
      : photos.map((photo, index) => ({
          photoAssetId: photo.id,
          durationFrames:
            Math.floor(((index + 1) * interval.photoFrames) / count) -
            Math.floor((index * interval.photoFrames) / count),
        }));
  let start = interval.photoStartFrame;
  const timeline = durations.map((photo) => {
    const current = { ...photo, start };
    start += photo.durationFrames;
    return current;
  });
  const number = (value: string) => {
    const parsed = Number(value.replace(/\s/g, '').replace(',', '.'));
    return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
  };
  const kinds: VideoManifest['scenes'][number]['kind'][] = ['intro', 'gallery', 'gallery', 'contact'];
  const scenes = input.narration.map((text, index) => ({
    id: `preview-scene-${index}`,
    kind: index === 0 ? kinds[0] : index === input.narration.length - 1 ? ('contact' as const) : ('gallery' as const),
    copyId: 'preview',
    photoAssetId: photos[0]?.id ?? 'preview-photo',
    narrationText: text,
    captionText: '',
    factRefs: [],
    audioAssetId: null,
    durationFrames:
      Math.floor(((index + 1) * total) / input.narration.length) - Math.floor((index * total) / input.narration.length),
  }));
  const brand = {
    ...input.brand,
    id: 'preview-agency',
    ownerUserId: 'preview-owner',
    name: input.agencyName || 'Votre agence',
    logoAssetId: input.brand?.logoAssetId ?? null,
    primaryColor: settings.primaryColor,
    secondaryColor: settings.secondaryColor,
    phone: input.brand?.phone ?? null,
    email: input.brand?.email ?? null,
    website: input.brand?.website ?? null,
    createdAt: '2026-01-01T00:00:00.000Z',
  };
  const manifest: VideoManifest = {
    schemaVersion: 2,
    templateVersion: input.aspectRatio === '16:9' ? 'bienvu-horizontal/1' : 'bienvu-vertical/2',
    agencyId: brand.id,
    jobId: 'preview-job',
    listingId: 'preview-listing',
    brand,
    contact: brand.phone ? 'phone' : brand.email ? 'email' : brand.website ? 'website' : 'none',
    logo: brand.logoAssetId
      ? { id: brand.logoAssetId, objectKey: 'preview/logo', sha256: '0'.repeat(64), sizeBytes: 1, mime: 'image/png' }
      : null,
    width: input.aspectRatio === '16:9' ? 1920 : 1080,
    height: input.aspectRatio === '16:9' ? 1080 : 1920,
    fps: 30,
    disclosure: SYNTHETIC_VOICE_DISCLOSURE,
    rights: { kind: 'paid', allocationId: 'preview-allocation', watermarked: false },
    photos: photos.map((p) => ({
      id: p.id,
      objectKey: `preview/${p.id}`,
      sha256: '0'.repeat(64),
      sizeBytes: 1,
      mime: 'image/jpeg',
    })),
    audio: [],
    scenes,
    photoTimeline: timeline.map(({ photoAssetId, durationFrames }) => ({ photoAssetId, durationFrames })),
    presentation: {
      title: fields.title || 'Votre bien',
      locality: fields.locality || 'Votre localisation',
      transaction: fields.transaction === 'rent' ? 'rent' : 'sale',
      propertyType:
        fields.propertyType === 'house' ? 'house' : fields.propertyType === 'apartment' ? 'apartment' : 'other',
      priceCents: number(fields.priceCents)! * 100 || null,
      areaM2: number(fields.area),
      rooms: number(fields.rooms),
    },
    visualStyle: settings.style,
    photoMotion: settings.photoMotion,
    photoTransition: settings.transition,
    subtitlesEnabled: input.subtitles && input.voice && input.narration.some((text) => Boolean(text.trim())),
  };
  return {
    manifest,
    timeline,
    media: {
      ...Object.fromEntries(photos.map((p) => [p.id, p.preview])),
      ...(brand.logoAssetId
        ? { [brand.logoAssetId]: `/api/agency/logo/${encodeURIComponent(brand.logoAssetId)}` }
        : {}),
    },
  };
}
export function previewFrame(model: ReturnType<typeof customizationPreview>, frame: number) {
  const total = model.manifest.scenes.reduce((n, s) => n + s.durationFrames, 0),
    at = Math.max(0, Math.min(total - 1, Math.floor(frame)));
  let start = 0;
  const sceneIndex = model.manifest.scenes.findIndex((s) => {
    start += s.durationFrames;
    return at < start;
  });
  const scene = model.manifest.scenes[sceneIndex],
    sceneFrame = at - (start - scene.durationFrames);
  const photoIndex = Math.max(
    0,
    model.timeline.findIndex(
      (photo, index) => at < photo.start + photo.durationFrames || index === model.timeline.length - 1,
    ),
  );
  return { at, sceneIndex, sceneFrame, photoIndex };
}
