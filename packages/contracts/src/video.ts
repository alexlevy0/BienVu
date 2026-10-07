import {z} from 'zod';
import {AgencyBrand, EntityId, ObjectKey, Sha256, VideoDuration, type NormalizedListing} from './product';
import {ScriptScene} from './narration';
import {SYNTHETIC_VOICE_DISCLOSURE} from './voice';
import {VideoStyle} from './customization';
import {EditorDocument} from './editor';
import {MUSIC_LIMITS} from './music-library';
import {ConfirmedVideoMap,MapZoom,mapRasterLevels} from './maps';

export const VideoAsset = z.object({id: EntityId, objectKey: ObjectKey, sha256: Sha256,
  sizeBytes: z.number().int().positive().max(MUSIC_LIMITS.bytes),
  mime: z.enum(['image/jpeg', 'image/png', 'image/webp', 'audio/wav', 'video/mp4','application/json']),
  width: z.number().int().positive().max(12000).optional(), height: z.number().int().positive().max(12000).optional(),
  durationMs: z.number().int().positive().max(MUSIC_LIMITS.durationMs).optional(),
  normalizationGain:z.number().min(.1).max(4).optional(),
}).strict().superRefine((asset,ctx)=>{
  if(asset.mime!=='audio/wav'&&(asset.sizeBytes>10*1024*1024||(asset.durationMs??0)>40000))
    ctx.addIssue({code:'custom',message:'Média trop volumineux ou trop long.'});
});
export type VideoAsset = z.infer<typeof VideoAsset>;
export const PhotoAnimation=z.object({photoAssetId:EntityId,sourceSha256:Sha256,
  provider:z.literal('runway'),model:z.literal('gen4_turbo'),asset:VideoAsset}).strict();
export type PhotoAnimation=z.infer<typeof PhotoAnimation>;
export const VideoPresentation = z.object({
  transaction: z.enum(['sale', 'rent']), propertyType: z.enum(['apartment', 'house', 'other']),
  locality: z.string().trim().min(1).max(200), title: z.string().trim().min(1).max(200),
  priceCents: z.number().int().positive().max(Number.MAX_SAFE_INTEGER).nullable(),
  areaM2: z.number().positive().max(100_000).nullable(), rooms: z.number().int().positive().max(100).nullable(),
}).strict();
export type VideoPresentation = z.infer<typeof VideoPresentation>;
export function videoPresentation(listing: NormalizedListing): VideoPresentation {
  const {facts} = listing;
  const known = <T>(fact: {status: string; value: T | null} | undefined): T | null =>
    fact && (fact.status === 'verified' || fact.status === 'user_provided') ? fact.value : null;
  return VideoPresentation.parse({transaction: listing.transaction, propertyType: known(facts.propertyType),
    locality: known(facts.locality), title: known(facts.title),
    priceCents: known(facts.price)?.amountCents ?? null, areaM2: known(facts.area), rooms: known(facts.rooms)});
}
export const VideoManifest = z.object({schemaVersion: z.literal(2), templateVersion: z.enum(['bienvu-vertical/1', 'bienvu-vertical/2','bienvu-horizontal/1']),
  agencyId: EntityId, jobId: EntityId, listingId: EntityId, brand: AgencyBrand,
  contact: z.enum(['phone', 'email', 'website', 'none']), logo: VideoAsset.nullable(),
  width: z.union([z.literal(1080),z.literal(1920)]), height: z.union([z.literal(1920),z.literal(1080)]), fps: z.literal(30),
  disclosure: z.literal(SYNTHETIC_VOICE_DISCLOSURE),
  rights: z.discriminatedUnion('kind', [
    z.object({kind: z.literal('trial'), allocationId: EntityId, watermarked: z.literal(true)}).strict(),
    z.object({kind: z.literal('anonymous'), watermarked: z.literal(false), previewProvisionCents:z.number().int().min(0).max(50).default(30)}).strict(),
    z.object({kind: z.literal('free'), allocationId: EntityId, watermarked: z.literal(false)}).strict(),
    z.object({kind: z.literal('paid'), allocationId: EntityId, watermarked: z.literal(false)}).strict(),
  ]),
  photos: z.array(VideoAsset).min(3).max(12), audio: z.array(VideoAsset).max(6),
  scenes: z.array(ScriptScene.extend({audioAssetId: EntityId.nullable(), durationFrames: z.number().int().positive().max(1200)})).min(4).max(6),
  // Independent slideshow: speech scenes do not limit the number of photos.
  // Optional without a default to preserve historical immutable hashes.
  photoTimeline: z.array(z.object({photoAssetId: EntityId,
    durationFrames: z.number().int().min(30).max(1200)}).strict()).min(3).max(12).optional(),
  presentation: VideoPresentation.optional(),
  // Do not insert a default into old manifests: their stored hashes must remain valid.
  subtitlesEnabled: z.boolean().optional(),
  voiceEnabled:z.boolean().optional(),
  durationSeconds:VideoDuration.optional(),
  visualStyle:VideoStyle.optional(),photoMotion:z.boolean().optional(),photoTransition:z.enum(['fade','cut']).optional(),
  photoAnimations:z.array(PhotoAnimation).max(12).optional(),
  editor:EditorDocument.optional(),
  music:z.object({asset:VideoAsset}).strict().optional(),
  map:z.object({settings:ConfirmedVideoMap,asset:VideoAsset,capturedAt:z.iso.datetime(),buildings:VideoAsset.optional(),
    rasterZoom:MapZoom.optional(),details:z.array(z.object({zoom:MapZoom,asset:VideoAsset}).strict()).max(6).optional()}).strict().optional(),
}).strict().superRefine((m, ctx) => {
  const fail = (message: string) => ctx.addIssue({code: 'custom', message});
  if(m.voiceEnabled===false?m.audio.length!==0:m.audio.length<4)fail('Médias audio incompatibles avec le choix de voix.');
  if(m.voiceEnabled===false&&m.subtitlesEnabled!==false)fail('Les sous-titres exigent une voix off.');
  if (m.templateVersion !== 'bienvu-vertical/1' ? !m.presentation : Boolean(m.presentation)) fail('Présentation incompatible avec le modèle vidéo.');
  if(m.templateVersion==='bienvu-horizontal/1' ? m.width!==1920||m.height!==1080 : m.width!==1080||m.height!==1920)fail('Dimensions incompatibles avec le format vidéo.');
  if(m.rights.kind==='anonymous'&&(!m.brand.neutral||m.contact!=='none'))fail('Habillage anonyme invalide.');
  const assets = videoAssets(m), prefix = `agencies/${m.agencyId}/jobs/${m.jobId}/`;
  if (m.brand.id !== m.agencyId || (m.contact==='none' ? !m.brand.neutral : !m.brand[m.contact]) || Boolean(m.brand.logoAssetId) !== Boolean(m.logo)
    || m.logo && m.logo.id !== m.brand.logoAssetId) fail('Marque ou contact incohérent.');
  if(m.contact!=='none'&&(m.brand[m.contact]?.length??0)>180)fail('Coordonnée trop longue pour la carte de contact.');
  if (assets.some(a => !a.objectKey.startsWith(prefix)) || new Set(assets.map(a => a.id)).size !== assets.length
    || assets.reduce((n, a) => n + a.sizeBytes, 0) > 90 * 1024 * 1024) fail('Médias hors périmètre ou trop volumineux.');
  if(m.photoAnimations?.length&&(!m.photoTimeline||m.templateVersion==='bienvu-vertical/1'
    ||new Set(m.photoAnimations.map(c=>c.photoAssetId)).size!==m.photoAnimations.length
    ||m.photoAnimations.some(c=>!m.photos.some(p=>p.id===c.photoAssetId&&p.sha256===c.sourceSha256)
      ||c.asset.mime!=='video/mp4'||!((c.asset.width===720&&c.asset.height===1280)||(m.width===1920&&c.asset.width===1280&&c.asset.height===720))||c.asset.durationMs!==5000)))fail('Animation hors périmètre ou invalide.');
  if ([...m.photos, ...(m.logo ? [m.logo] : [])].some(a => !a.mime.startsWith('image/') || !a.width || !a.height || a.durationMs)
    || m.audio.some(a => a.mime !== 'audio/wav' || !a.durationMs || a.durationMs>35000 || a.width || a.height)) fail('Type de média invalide.');
  if(Boolean(m.music)!==Boolean(m.editor?.music)||m.music&&(!m.editor||m.music.asset.mime!=='audio/wav'||
    m.music.asset.id!==m.editor.music?.assetId||m.music.asset.durationMs!==m.editor.music.durationMs||m.music.asset.width||m.music.asset.height))fail('Musique hors périmètre ou invalide.');
  if (new Set(m.photos.map(a => a.sha256)).size !== m.photos.length
    || new Set(m.scenes.map(s => s.id)).size !== m.scenes.length
    || new Set(m.scenes.map(s => s.kind)).size !== m.scenes.length
    || m.scenes[0].kind !== 'intro' || m.scenes.at(-1)!.kind !== 'contact') fail('Scènes incohérentes.');
  for (const [index, s] of m.scenes.entries()) {
    const audio = m.audio.find(a => a.id === s.audioAssetId);
    if (!m.photos.some(p => p.id === s.photoAssetId) || (m.voiceEnabled===false?s.audioAssetId!==null:!audio)
      || audio && s.durationFrames < Math.ceil(audio.durationMs! * 30 / 1000)
      || index > 0 && m.scenes[index - 1].photoAssetId === s.photoAssetId) fail('Scène sans média valide ou voix tronquée.');
  }
  if (new Set(m.scenes.map(s => s.photoAssetId)).size < 3 || new Set(m.scenes.map(s => s.audioAssetId).filter(id=>id!==null)).size !== m.audio.length
    || !m.photoTimeline && m.photos.some(p => !m.scenes.some(s => s.photoAssetId === p.id))) fail('Médias inutilisés ou incomplets.');
  const frames = m.scenes.reduce((n, s) => n + s.durationFrames, 0);
  if(m.map&&(!['image/png','image/jpeg'].includes(m.map.asset.mime)||m.map.asset.width!==m.width*2||m.map.asset.height!==m.height*2||m.map.asset.durationMs||!m.photoTimeline||m.templateVersion==='bienvu-vertical/1'))fail('Fond de carte invalide.');
  if(m.map&&(Boolean(m.map.buildings)!==(m.map.settings.view==='buildings-3d')||m.map.buildings&&(m.map.buildings.mime!=='application/json'||m.map.buildings.sizeBytes>4*1024*1024||m.map.buildings.width||m.map.buildings.height||m.map.buildings.durationMs)))fail('Données de bâtiments invalides.');
  if(m.map){
    const levels=mapRasterLevels(m.map.settings,m.map.settings.location.precision),explicit=m.map.settings.zoomStart!==undefined||m.map.settings.zoomEnd!==undefined||m.map.settings.view==='satellite';
    if(explicit?(m.map.rasterZoom!==levels[0]||JSON.stringify(m.map.details?.map(d=>d.zoom)??[])!==JSON.stringify(levels.slice(1))):
      m.map.rasterZoom!==undefined||m.map.details!==undefined)fail('Niveaux de carte incomplets ou incompatibles avec le zoom.');
    if(m.map.details?.some(d=>!['image/png','image/jpeg'].includes(d.asset.mime)||d.asset.width!==m.width*2||d.asset.height!==m.height*2||d.asset.durationMs))fail('Détail de carte invalide.');
  }
  if (frames < 600 || frames > 1200) fail('Durée hors de la plage de 20 à 40 secondes.');
  if(m.durationSeconds!==undefined&&frames!==m.durationSeconds*m.fps)fail('La durée ne correspond pas au choix demandé.');
  if(m.editor&&(m.editor.durationSeconds*30!==frames||m.editor.aspectRatio!==(m.width===1920?'16:9':'9:16')||
    m.editor.voiceEnabled!==(m.voiceEnabled!==false)||m.editor.subtitlesEnabled!==(m.subtitlesEnabled!==false)||
    m.editor.clips.some(c=>c.photoSlot>=m.photos.length)||new Set(m.editor.clips.map(c=>c.photoSlot)).size!==m.photos.length))fail('Timeline incompatible avec la vidéo.');
  if (m.photoTimeline && (m.templateVersion === 'bienvu-vertical/1'
    || m.photoTimeline.length !== m.photos.length
    || m.photoTimeline.some((s, i) => s.photoAssetId !== m.photos[i].id)
    || m.photoTimeline.reduce((n, s) => n + s.durationFrames, 0) !== frames-(m.map?.settings.durationSeconds??0)*30)) fail('Galerie incomplète ou durée incohérente.');
});
export type VideoManifest = z.infer<typeof VideoManifest>;
// Integer frames cover the complete narration exactly, including its last frame.
// Preserve listing order; every distinct imported photo appears once.
export function videoPhotoTimeline(photos: Pick<VideoAsset, 'id'>[], frames: number, animatedIds:string[]=[],mapFrames=0): NonNullable<VideoManifest['photoTimeline']> {
  if (photos.length < 3 || photos.length > 12 || !Number.isInteger(frames) || frames < 600 || frames > 1200)
    throw new Error('VIDEO_PHOTO_TIMELINE_INVALID');
  if(!Number.isInteger(mapFrames)||mapFrames!==0&&(mapFrames<90||mapFrames>150))throw new Error('VIDEO_PHOTO_TIMELINE_INVALID');
  frames-=mapFrames;
  if(animatedIds.length>photos.length||new Set(animatedIds).size!==animatedIds.length||animatedIds.some(id=>!photos.some(p=>p.id===id)))throw new Error('VIDEO_PHOTO_TIMELINE_INVALID');
  if(animatedIds.length>2||frames-animatedIds.length*150<(photos.length-animatedIds.length)*30)return photos.map((photo,i)=>({photoAssetId:photo.id,
    durationFrames:Math.floor((i+1)*frames/photos.length)-Math.floor(i*frames/photos.length)}));
  if(animatedIds.length){
    // Play each paid five-second clip completely, while retaining every photo
    // and the exact narration duration. Even 12 photos retain at least 1 s.
    const remaining=frames-animatedIds.length*150,count=photos.length-animatedIds.length;let at=0;
    return photos.map(photo=>({photoAssetId:photo.id,durationFrames:animatedIds.includes(photo.id)?150:
      Math.floor(++at*remaining/count)-Math.floor((at-1)*remaining/count)}));
  }
  return photos.map((photo, i) => ({photoAssetId: photo.id,
    durationFrames: Math.floor((i + 1) * frames / photos.length) - Math.floor(i * frames / photos.length)}));
}
export function videoAssets(m: {photos: VideoAsset[]; audio: VideoAsset[]; logo: VideoAsset | null;photoAnimations?:PhotoAnimation[];music?:{asset:VideoAsset};map?:{asset:VideoAsset;buildings?:VideoAsset;details?:{asset:VideoAsset}[]}}): VideoAsset[] {
  return [...m.photos, ...m.audio, ...(m.logo ? [m.logo] : []),...(m.photoAnimations??[]).map(c=>c.asset),...(m.music?[m.music.asset]:[]),...(m.map?[m.map.asset,...(m.map.buildings?[m.map.buildings]:[]),...(m.map.details??[]).map(d=>d.asset)]:[])];
}
export function videoAssetFile(asset: VideoAsset) {
  return `${asset.sha256}.${({'image/jpeg':'jpg','image/png':'png','image/webp':'webp','audio/wav':'wav','video/mp4':'mp4','application/json':'json'} as const)[asset.mime]}`;
}
export const VideoSubmission = z.object({id: Sha256, manifest: VideoManifest}).strict();
export type VideoSubmission = z.infer<typeof VideoSubmission>;
const VideoArtifactFields = z.object({id: Sha256, manifestHash: Sha256, sha256: Sha256,
  sizeBytes: z.number().int().positive().max(50 * 1024 * 1024),
  width: z.union([z.literal(1080),z.literal(1920)]), height: z.union([z.literal(1920),z.literal(1080)]), fps: z.literal(30), codec: z.literal('h264'), audioCodec: z.literal('aac').nullable(),
  durationFrames: z.number().int().min(600).max(1200), durationSeconds: z.number().min(19.9).max(40.2),
  fastStart: z.literal(true), watermarked: z.boolean(), meanVolumeDb: z.number().finite().nullable(),
  startedAt: z.iso.datetime(), endedAt: z.iso.datetime(), renderAndVerifySeconds: z.number().nonnegative(),
}).strict();
export const VideoArtifactReport=VideoArtifactFields.refine(r=>r.width!==r.height,'Dimensions vidéo incompatibles.');
export const VideoReport = VideoArtifactFields.extend({preview:VideoArtifactReport.optional()}).superRefine((r,ctx)=>{
  if(r.width===r.height||r.preview&&(r.preview.width!==r.width||r.preview.height!==r.height))ctx.addIssue({code:'custom',message:'Dimensions vidéo incompatibles.'});
  if([r,...(r.preview?[r.preview]:[])].some(a=>(a.audioCodec===null)!==(a.meanVolumeDb===null))
    ||r.preview&&r.preview.audioCodec!==r.audioCodec)ctx.addIssue({code:'custom',message:'Rapport audio incohérent.'});
});
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
