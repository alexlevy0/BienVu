import {z} from 'zod';
import {AgencyBrand, EntityId, ObjectKey, Sha256} from './product';
import {ScriptScene} from './narration';
import {SYNTHETIC_VOICE_DISCLOSURE} from './voice';

export const VideoAsset = z.object({id: EntityId, objectKey: ObjectKey, sha256: Sha256,
  sizeBytes: z.number().int().positive().max(10 * 1024 * 1024),
  mime: z.enum(['image/jpeg', 'image/png', 'image/webp', 'audio/wav']),
  width: z.number().int().positive().max(12000).optional(), height: z.number().int().positive().max(12000).optional(),
  durationMs: z.number().int().positive().max(35000).optional(),
}).strict();
export type VideoAsset = z.infer<typeof VideoAsset>;
export const VideoManifest = z.object({schemaVersion: z.literal(2), templateVersion: z.literal('bienvu-vertical/1'),
  agencyId: EntityId, jobId: EntityId, listingId: EntityId, brand: AgencyBrand,
  contact: z.enum(['phone', 'email', 'website', 'none']), logo: VideoAsset.nullable(),
  width: z.literal(1080), height: z.literal(1920), fps: z.literal(30),
  disclosure: z.literal(SYNTHETIC_VOICE_DISCLOSURE),
  rights: z.discriminatedUnion('kind', [
    z.object({kind: z.literal('trial'), allocationId: EntityId, watermarked: z.literal(true)}).strict(),
    z.object({kind: z.literal('anonymous'), watermarked: z.literal(false), previewProvisionCents:z.number().int().min(0).max(50).default(30)}).strict(),
    z.object({kind: z.literal('free'), allocationId: EntityId, watermarked: z.literal(false)}).strict(),
    z.object({kind: z.literal('paid'), allocationId: EntityId, watermarked: z.literal(false)}).strict(),
  ]),
  photos: z.array(VideoAsset).min(3).max(6), audio: z.array(VideoAsset).min(4).max(6),
  scenes: z.array(ScriptScene.extend({audioAssetId: EntityId, durationFrames: z.number().int().positive().max(1050)})).min(4).max(6),
}).strict().superRefine((m, ctx) => {
  const fail = (message: string) => ctx.addIssue({code: 'custom', message});
  if(m.rights.kind==='anonymous'&&(!m.brand.neutral||m.contact!=='none'))fail('Habillage anonyme invalide.');
  const assets = videoAssets(m), prefix = `agencies/${m.agencyId}/jobs/${m.jobId}/`;
  if (m.brand.id !== m.agencyId || (m.contact==='none' ? !m.brand.neutral : !m.brand[m.contact]) || Boolean(m.brand.logoAssetId) !== Boolean(m.logo)
    || m.logo && m.logo.id !== m.brand.logoAssetId) fail('Marque ou contact incohérent.');
  if(m.contact!=='none'&&(m.brand[m.contact]?.length??0)>180)fail('Coordonnée trop longue pour la carte de contact.');
  if (assets.some(a => !a.objectKey.startsWith(prefix)) || new Set(assets.map(a => a.id)).size !== assets.length
    || assets.reduce((n, a) => n + a.sizeBytes, 0) > 70 * 1024 * 1024) fail('Médias hors périmètre ou trop volumineux.');
  if ([...m.photos, ...(m.logo ? [m.logo] : [])].some(a => !a.mime.startsWith('image/') || !a.width || !a.height || a.durationMs)
    || m.audio.some(a => a.mime !== 'audio/wav' || !a.durationMs || a.width || a.height)) fail('Type de média invalide.');
  if (new Set(m.photos.map(a => a.sha256)).size !== m.photos.length
    || new Set(m.scenes.map(s => s.id)).size !== m.scenes.length
    || new Set(m.scenes.map(s => s.kind)).size !== m.scenes.length
    || m.scenes[0].kind !== 'intro' || m.scenes.at(-1)!.kind !== 'contact') fail('Scènes incohérentes.');
  for (const [index, s] of m.scenes.entries()) {
    const audio = m.audio.find(a => a.id === s.audioAssetId);
    if (!m.photos.some(p => p.id === s.photoAssetId) || !audio
      || audio && s.durationFrames < Math.ceil(audio.durationMs! * 30 / 1000)
      || index > 0 && m.scenes[index - 1].photoAssetId === s.photoAssetId) fail('Scène sans média valide ou voix tronquée.');
  }
  if (new Set(m.scenes.map(s => s.photoAssetId)).size < 3 || new Set(m.scenes.map(s => s.audioAssetId)).size !== m.audio.length
    || m.photos.some(p => !m.scenes.some(s => s.photoAssetId === p.id))) fail('Médias inutilisés ou incomplets.');
  const frames = m.scenes.reduce((n, s) => n + s.durationFrames, 0);
  if (frames < 600 || frames > 1050) fail('Durée hors de la plage de 20 à 35 secondes.');
});
export type VideoManifest = z.infer<typeof VideoManifest>;
export function videoAssets(m: {photos: VideoAsset[]; audio: VideoAsset[]; logo: VideoAsset | null}): VideoAsset[] {
  return [...m.photos, ...m.audio, ...(m.logo ? [m.logo] : [])];
}
export function videoAssetFile(asset: VideoAsset) {
  return `${asset.sha256}.${({'image/jpeg':'jpg','image/png':'png','image/webp':'webp','audio/wav':'wav'} as const)[asset.mime]}`;
}
export const VideoSubmission = z.object({id: Sha256, manifest: VideoManifest}).strict();
export type VideoSubmission = z.infer<typeof VideoSubmission>;
export const VideoArtifactReport = z.object({id: Sha256, manifestHash: Sha256, sha256: Sha256,
  sizeBytes: z.number().int().positive().max(50 * 1024 * 1024),
  width: z.literal(1080), height: z.literal(1920), fps: z.literal(30), codec: z.literal('h264'), audioCodec: z.literal('aac'),
  durationFrames: z.number().int().min(600).max(1050), durationSeconds: z.number().min(19.9).max(35.2),
  fastStart: z.literal(true), watermarked: z.boolean(), meanVolumeDb: z.number().finite(),
  startedAt: z.iso.datetime(), endedAt: z.iso.datetime(), renderAndVerifySeconds: z.number().nonnegative(),
}).strict();
export const VideoReport = VideoArtifactReport.extend({preview:VideoArtifactReport.optional()});
export type VideoReport = z.infer<typeof VideoReport>;
export async function videoManifestHash(input: unknown) {
  const data = new TextEncoder().encode(JSON.stringify(VideoManifest.parse(input)));
  return [...new Uint8Array(await crypto.subtle.digest('SHA-256', data))].map(n => n.toString(16).padStart(2, '0')).join('');
}
export function videoObjectKey(manifest: VideoManifest, hash: string) {
  Sha256.parse(hash);
  return `agencies/${manifest.agencyId}/jobs/${manifest.jobId}/video/${hash}.mp4`;
}
export function videoPreviewKey(manifest:VideoManifest,hash:string){return videoObjectKey(manifest,hash).replace(/\.mp4$/,'.preview.mp4');}
export class VideoFailure extends Error {
  constructor(readonly code: string) {super(/^[A-Z_]{3,64}$/.test(code) ? code : 'VIDEO_FAILED'); this.name = 'VideoFailure';}
}
