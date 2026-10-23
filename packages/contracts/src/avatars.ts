import { z } from 'zod';
import { cartesiaParisianVoices } from './cartesia-voices';
import { VIDEO_LAYERS } from './video-layers';

export const AvatarId = z.string().regex(/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,127}$/);
export const AvatarFavorites = z.object({ ids: z.array(AvatarId).max(5000) }).strict();
export const AvatarFavoriteUpdate = z.object({ lookId: AvatarId, favorite: z.boolean() }).strict();
export type AvatarFavoriteUpdate = z.infer<typeof AvatarFavoriteUpdate>;
// Stable partition: favourites move first without changing the selected avatar
// or the catalogue's ordering within either group.
export function prioritizeAvatarFavorites<T extends { id: string }>(looks: readonly T[], ids: readonly string[]): T[] {
  const favorites = new Set(ids);
  return [...looks.filter((look) => favorites.has(look.id)), ...looks.filter((look) => !favorites.has(look.id))];
}
export const AvatarGender = z.enum(['female', 'male', 'unknown']);
export const AvatarEngine = z.enum(['avatar_iii', 'avatar_iv']);
export type AvatarMoment = 'intro' | 'outro' | 'full';
export const AvatarCustomization = z
  .object({
    lookId: AvatarId,
    engine: AvatarEngine,
    moments: z.enum(['intro', 'outro', 'both', 'full']),
    appearance: z.enum(['circle', 'card', 'cutout']),
    x: z.number().min(10).max(90),
    y: z.number().min(15).max(85),
    width: z.number().min(15).max(100),
    maxSeconds: z.number().int().min(3).max(8),
    hidden: z.boolean().optional(),
  })
  .strict();
export type AvatarCustomization = z.infer<typeof AvatarCustomization>;
export function avatarMoments(settings?: AvatarCustomization): readonly AvatarMoment[] {
  return !settings || settings.hidden
    ? []
    : settings.moments === 'both'
      ? (['intro', 'outro'] as const)
      : [settings.moments];
}
export const AVATAR_SECONDS_PER_CREDIT = 10;
export const MAX_AVATAR_CREDITS = 4;
export const AVATAR_AUDIO_BYTES = 4 * 1024 * 1024;
export const AVATAR_VIDEO_BYTES = 32 * 1024 * 1024;
export function avatarCreditCost(settings?: AvatarCustomization, durationSeconds = 20) {
  if (!avatarMoments(settings).length) return 0;
  if (settings!.moments !== 'full') return 1;
  if (!Number.isFinite(durationSeconds) || durationSeconds <= 0 || durationSeconds > 40)
    throw Error('INVALID_AVATAR_DURATION');
  return Math.ceil(durationSeconds / AVATAR_SECONDS_PER_CREDIT);
}
export const AvatarAudioSources = z
  .array(
    z
      .object({
        audioAssetId: AvatarId,
        audioSha256: z.string().regex(/^[a-f0-9]{64}$/),
        startFrame: z.number().int().min(0).max(1199),
        durationMs: z.number().int().min(1).max(35000),
      })
      .strict(),
  )
  .min(4)
  .max(6);
export type AvatarAudioSources = z.infer<typeof AvatarAudioSources>;
export const avatarPriceUsdPerMinute = (engine: AvatarCustomization['engine'], type: string) =>
  engine === 'avatar_iii' ? (type === 'digital_twin' ? 0.6 : 0.99) : type === 'photo_avatar' ? 2.31 : 4.83;
export const AvatarGroupPreview = z
  .object({
    id: AvatarId,
    name: z.string().min(1).max(160),
    thumbnail: z.string().nullable(),
    preview: z.string().nullable(),
  })
  .strict();
export type AvatarGroupPreview = z.infer<typeof AvatarGroupPreview>;
export const AvatarIdentity = z
  .object({ id: AvatarId, groupId: AvatarId.optional(), groupName: z.string().min(1).max(100).optional() })
  .strict();
export const AvatarLook = z
  .object({
    id: AvatarId,
    name: z.string().min(1).max(160),
    gender: AvatarGender,
    groupId: AvatarId.optional(),
    groupName: z.string().min(1).max(100).optional(),
    tags: z.array(z.string().max(100)).max(32).optional(),
    groupPreviews: z.array(AvatarGroupPreview).min(1).max(3).optional(),
    variantsCount: z.number().int().min(1).max(5000).optional(),
    type: z.enum(['studio_avatar', 'photo_avatar', 'digital_twin']),
    engines: z.array(AvatarEngine).min(1).max(2),
    enabled: z.boolean(),
    thumbnail: z.string().nullable(),
    preview: z.string().nullable(),
    transparentVerified: z.boolean(),
    ownership: z.enum(['public', 'private']),
    updatedAt: z.string(),
    transparency: z.enum(['supported', 'unsupported']).optional(),
    publication: z
      .object({ presenterId: AvatarId, name: z.string().min(1).max(100), recommended: z.boolean() })
      .strict()
      .optional(),
  })
  .strict();
export type AvatarLook = z.infer<typeof AvatarLook>;
export const AvatarPublicationGroup = z
  .object({
    id: AvatarId,
    name: z.string().trim().min(1).max(100),
    recommended: z.boolean(),
    lookIds: z.array(AvatarId).min(1).max(256),
  })
  .strict();
export const AvatarPublication = z
  .object({ groups: z.array(AvatarPublicationGroup).max(200), defaultLookId: AvatarId.nullable() })
  .strict()
  .superRefine((value, ctx) => {
    const ids = value.groups.flatMap((group) => group.lookIds);
    if (
      ids.length > 5000 ||
      new Set(ids).size !== ids.length ||
      new Set(value.groups.map((group) => group.id)).size !== value.groups.length
    )
      ctx.addIssue({ code: 'custom', message: 'Un avatar ne peut apparaître qu’une fois dans la sélection.' });
    if ((value.defaultLookId && !ids.includes(value.defaultLookId)) || (value.groups.length && !value.defaultLookId))
      ctx.addIssue({ code: 'custom', message: 'Choisissez un présentateur par défaut dans la sélection.' });
  });
export type AvatarPublication = z.infer<typeof AvatarPublication>;
export type AvatarPublicationGroup = z.infer<typeof AvatarPublicationGroup>;
export type AvatarPresenter = { id: string; name: string; recommended: boolean; looks: AvatarLook[]; total: number };
export function avatarPresenters(looks: readonly AvatarLook[], favorites: readonly string[] = []): AvatarPresenter[] {
  const groups = new Map<string, AvatarPresenter>();
  for (const look of prioritizeAvatarFavorites(looks, favorites)) {
    const id = look.publication?.presenterId ?? look.groupId ?? look.id;
    let group = groups.get(id);
    if (!group) {
      group = {
        id,
        name: look.publication?.name ?? look.groupName ?? look.name,
        recommended: look.publication?.recommended ?? false,
        looks: [],
        total: 0,
      };
      groups.set(id, group);
    }
    group.looks.push(look);
    group.total = Math.max(group.looks.length, group.total, look.variantsCount ?? 0);
  }
  return [...groups.values()];
}
// Provider identity wins over old editorial groups. Never merge on first name:
// homonyms are different people. Existing look IDs and the default stay intact.
export function groupAvatarPublication(
  publication: AvatarPublication,
  looks: readonly Pick<AvatarLook, 'id' | 'groupId' | 'groupName'>[],
): AvatarPublication {
  const metadata = new Map<string, Pick<AvatarLook, 'id' | 'groupId' | 'groupName'>>(),
    groups = new Map<string, AvatarPublicationGroup>();
  for (const look of looks) {
    const prior = metadata.get(look.id);
    metadata.set(look.id, {
      ...look,
      groupId: look.groupId ?? prior?.groupId,
      groupName: look.groupName ?? prior?.groupName,
    });
  }
  for (const previous of publication.groups)
    for (const id of previous.lookIds) {
      const look = metadata.get(id),
        identity = look?.groupId ?? previous.id;
      let group = groups.get(identity);
      if (!group) {
        group = {
          id: identity,
          name: look?.groupId && previous.id !== identity ? (look.groupName ?? previous.name) : previous.name,
          recommended: previous.recommended,
          lookIds: [],
        };
        groups.set(identity, group);
      }
      group.recommended ||= previous.recommended;
      group.lookIds.push(id);
    }
  return AvatarPublication.parse({ groups: [...groups.values()], defaultLookId: publication.defaultLookId });
}
export function addAvatarGroupToPublication(
  publication: AvatarPublication,
  groupId: string,
  looks: readonly AvatarLook[],
): AvatarPublication {
  if (!looks.length || looks.some((look) => (look.groupId ?? look.id) !== groupId))
    throw Error('AVATAR_GROUP_MISMATCH');
  const prior = publication.groups.find((group) => group.id === groupId),
    ids = [...new Set([...(prior?.lookIds ?? []), ...looks.map((look) => look.id)])];
  const group = {
    id: groupId,
    name: prior?.name ?? looks[0].groupName ?? looks[0].name.slice(0, 100),
    recommended: prior?.recommended ?? false,
    lookIds: ids,
  };
  return AvatarPublication.parse({
    groups: prior
      ? publication.groups.map((item) => (item.id === groupId ? group : item))
      : [...publication.groups, group],
    defaultLookId: publication.defaultLookId ?? ids[0],
  });
}
export function catalogAvatarLook(
  catalog: AvatarCatalog | null | undefined,
  id: string | undefined,
): AvatarLook | undefined {
  if (!catalog || !id) return undefined;
  return catalog.looks.find((look) => look.id === id) ?? (catalog.current?.id === id ? catalog.current : undefined);
}
// The v3 catalogue does not expose matting support. A legacy false verification
// flag means untested, not incompatible. Only a confirmed refusal blocks WebM.
export function avatarCutoutStatus(look: AvatarLook): 'supported' | 'unsupported' | 'unknown' {
  return look.transparency ?? (look.transparentVerified ? 'supported' : 'unknown');
}
export function avatarSupportsCutout(look: AvatarLook | undefined, engine?: z.infer<typeof AvatarEngine>) {
  return Boolean(look && (!engine || look.engines.includes(engine)) && avatarCutoutStatus(look) !== 'unsupported');
}
export const AvatarSettings = z
  .object({
    enabled: z.boolean(),
    allowPremium: z.boolean(),
    defaultLookId: AvatarId.nullable(),
    maxSeconds: z.number().int().min(3).max(8),
    monthlyUsd: z.number().min(0).max(10000),
    perVideoUsd: z.number().min(0.05).max(10),
    concurrent: z.number().int().min(1).max(10),
    priceIII: z.number().min(0.01).max(100),
    priceIVPhoto: z.number().min(0.01).max(100),
    priceIVStudio: z.number().min(0.01).max(100),
  })
  .strict();
export type AvatarSettings = z.infer<typeof AvatarSettings>;
export const DEFAULT_AVATAR_SETTINGS: AvatarSettings = {
  enabled: false,
  allowPremium: false,
  defaultLookId: null,
  maxSeconds: 6,
  monthlyUsd: 5,
  perVideoUsd: 1,
  concurrent: 2,
  priceIII: 0.99,
  priceIVPhoto: 2.31,
  priceIVStudio: 4.83,
};
export const AvatarCatalog = z
  .object({
    enabled: z.boolean(),
    allowPremium: z.boolean(),
    maxSeconds: z.number(),
    defaultLookId: AvatarId.nullable(),
    looks: z.array(AvatarLook).max(5000),
    current: AvatarLook.nullable().default(null),
    revision: z.number().int().nonnegative().default(0),
  })
  .strict();
export type AvatarCatalog = z.infer<typeof AvatarCatalog>;
export const AvatarGalleryQuery = z
  .object({
    query: z.string().trim().max(100).default(''),
    gender: AvatarGender.or(z.literal('all')).default('all'),
    groupId: AvatarId.optional(),
    offset: z.coerce.number().int().min(0).max(5000).default(0),
  })
  .strict();
export type AvatarGalleryQuery = z.infer<typeof AvatarGalleryQuery>;
export const AdminAvatarCatalogQuery = AvatarGalleryQuery.safeExtend({
  catalog: z.literal('1'),
  type: z.enum(['all', 'studio_avatar', 'photo_avatar', 'digital_twin']).default('all'),
  availability: z.enum(['all', 'available', 'unavailable']).default('all'),
});
export type AdminAvatarCatalogQuery = z.infer<typeof AdminAvatarCatalogQuery>;
export const AvatarGallery = z
  .object({
    looks: z.array(AvatarLook).max(256),
    total: z.number().int().min(0),
    offset: z.number().int().min(0),
    hasMore: z.boolean(),
    revision: z.number().int().nonnegative().default(0),
  })
  .strict();
export type AvatarGallery = z.infer<typeof AvatarGallery>;
export const AvatarAdmission = z
  .object({ settings: AvatarSettings, look: AvatarLook, voice: z.string().min(1).max(128) })
  .strict();
export type AvatarAdmission = z.infer<typeof AvatarAdmission>;
export const AdminAvatarData = z
  .object({
    settings: AvatarSettings,
    revision: z.number().int().positive(),
    looks: z.array(AvatarLook).max(5000),
    identities: z.array(AvatarIdentity).max(5000).default([]),
    publication: AvatarPublication,
    publicationRevision: z.number().int().positive(),
    catalogTotal: z.number().int().nonnegative(),
    connected: z.boolean(),
    wallet: z
      .object({
        currency: z.string().nullable(),
        balance: z.number().nullable(),
        autoReload: z.boolean(),
        billingType: z.string().nullable(),
      })
      .nullable(),
    usage: z.object({
      month: z.string(),
      reservedUsd: z.number(),
      ready: z.number(),
      reused: z.number(),
      active: z.number(),
      uncertain: z.number(),
    }),
    tasks: z
      .array(
        z.object({
          id: AvatarId,
          jobId: z.string(),
          moment: z.string(),
          engine: AvatarEngine,
          state: z.string(),
          reused: z.boolean(),
          estimatedUsd: z.number(),
          error: z.string().nullable(),
          createdAt: z.string(),
        }),
      )
      .max(100),
  })
  .strict();
export type AdminAvatarData = z.infer<typeof AdminAvatarData>;
export function voiceGender(id: string): z.infer<typeof AvatarGender> {
  const voice = cartesiaParisianVoices.find((v) => v.id === id);
  if (voice) return voice.gender === 'feminine' ? 'female' : voice.gender === 'masculine' ? 'male' : 'unknown';
  return (
    (
      {
        'fr-FR-Chirp3-HD-Aoede': 'female',
        'fr-FR-Chirp3-HD-Kore': 'female',
        'fr-FR-Chirp3-HD-Charon': 'male',
        'fish-manon': 'female',
        'fish-lucas': 'male',
      } as Record<string, z.infer<typeof AvatarGender>>
    )[id] ?? 'unknown'
  );
}
export function avatarVoiceWarning(voice: string, gender: z.infer<typeof AvatarGender>) {
  const selected = voiceGender(voice);
  if (selected === 'unknown' || gender === 'unknown' || selected === gender) return null;
  return selected === 'female'
    ? 'Vous avez choisi une voix féminine et un avatar masculin. Vous pouvez conserver ce choix ou changer la voix ou le présentateur.'
    : 'Vous avez choisi une voix masculine et un avatar féminin. Vous pouvez conserver ce choix ou changer la voix ou le présentateur.';
}
export const defaultAvatarCustomization = (id: string): AvatarCustomization => ({
  lookId: id,
  engine: 'avatar_iii',
  moments: 'both',
  appearance: 'circle',
  x: 78,
  y: 38,
  width: 25,
  maxSeconds: 6,
});
export const AvatarPreviewClip = z
  .object({
    id: AvatarId,
    moment: z.enum(['intro', 'outro', 'full']),
    startFrame: z.number().int().min(0).max(1199),
    durationFrames: z.number().int().min(1).max(1200),
    audioSha256: z.string().regex(/^[a-f0-9]{64}$/),
    url: z.string(),
    sources: AvatarAudioSources.optional(),
    lookId: AvatarId,
    engine: AvatarEngine,
    transparent: z.boolean(),
    width: z.number().int().positive(),
    height: z.number().int().positive(),
  })
  .strict();
export type AvatarPreviewClip = z.infer<typeof AvatarPreviewClip>;
export function avatarFrameStyle(settings: AvatarCustomization, width: number, height: number, transparent = false) {
  const size = (width * settings.width) / 100,
    h = settings.appearance === 'circle' ? size : size * 1.3;
  return {
    position: 'absolute' as const,
    zIndex: VIDEO_LAYERS.avatar,
    left: Math.max(0, Math.min(width - size, (width * settings.x) / 100 - size / 2)),
    top:
      settings.y === 85
        ? Math.max(0, height - h)
        : Math.max(0, Math.min(height - h, (height * settings.y) / 100 - h / 2)),
    width: size,
    height: h,
    borderRadius:
      settings.appearance === 'circle' ? '50%' : settings.appearance === 'card' ? Math.round(size * 0.05) : 0,
    overflow: 'hidden' as const,
    background: transparent ? 'transparent' : '#e6eddf',
    boxShadow: transparent ? 'none' : '0 4px 18px #0003',
    pointerEvents: 'none' as const,
  };
}
export type AvatarContentBounds = { left: number; top: number; width: number; height: number };
// Pure pixel/geometry helpers shared by the browser and the native renderer.
export function avatarContentBounds(
  rgba: Uint8Array | Uint8ClampedArray,
  width: number,
  height: number,
): AvatarContentBounds | null {
  if (
    !Number.isInteger(width) ||
    !Number.isInteger(height) ||
    width < 1 ||
    height < 1 ||
    rgba.length !== width * height * 4
  )
    throw Error('AVATAR_PIXELS_INVALID');
  let left = width,
    top = height,
    right = -1,
    bottom = -1;
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++) {
      if (rgba[(y * width + x) * 4 + 3] < 16) continue;
      left = Math.min(left, x);
      right = Math.max(right, x);
      top = Math.min(top, y);
      bottom = Math.max(bottom, y);
    }
  return right < 0 ? null : { left, top, width: right - left + 1, height: bottom - top + 1 };
}
export function avatarContentStyle(
  bounds: AvatarContentBounds,
  sourceWidth: number,
  sourceHeight: number,
  width: number,
  height: number,
) {
  const scale = Math.min(width / bounds.width, height / bounds.height);
  return {
    position: 'absolute' as const,
    left: (width - bounds.width * scale) / 2 - bounds.left * scale,
    top: height - (bounds.top + bounds.height) * scale,
    width: sourceWidth * scale,
    height: sourceHeight * scale,
    objectFit: 'fill' as const,
  };
}
