import {z} from 'zod';
import {sameSourceHost, sourceForHost, sourceListingId} from './import-sources';

export const EntityId = z.string().regex(/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,63}$/);
export const Sha256 = z.string().regex(/^[a-f0-9]{64}$/);
export const Timestamp = z.iso.datetime();
const boundedText = (maximum: number) => z.string().trim().min(1).max(maximum);

// Validation syntaxique seulement. Le transport doit aussi contrôler DNS,
// redirections et sous-requêtes avant chaque accès réseau.
export const ListingUrl = z.string().trim().max(2048).superRefine((value, context) => {
  let url: URL;
  try { url = new URL(value); } catch {
    context.addIssue({code: 'custom', message: 'Saisissez un lien d’annonce HTTPS valide.'});
    return;
  }
  const hostname = url.hostname;
  if (url.protocol !== 'https:' || url.username || url.password || url.port || url.hash
    || hostname.endsWith('.') || !hostname.includes('.') || hostname.includes(':')
    || /^[\d.]+$/.test(hostname)
    || /(?:^|\.)(localhost|local|internal|lan|home|test|invalid|onion|arpa)$/.test(hostname)) {
    context.addIssue({code: 'custom', message: 'Utilisez un domaine public en HTTPS, sans identifiants ni port personnalisé.'});
  }
});

// Les liens copiés depuis les résultats SeLoger portent ce fragment de suivi.
// Seule cette variante observée est nettoyée avant la validation habituelle.
export const ImportUrl = z.string().trim().max(2048).transform(value => {
  try {
    const url = new URL(value), source = sourceForHost(url.hostname);
    if (source?.id === 'seloger' && sourceListingId(source, url.pathname) && url.hash.startsWith('#ln=')) {
      url.hash = ''; return url.href;
    }
  } catch { /* ListingUrl fournit le message de validation. */ }
  return value;
}).pipe(ListingUrl);
export const ImportInput = z.object({url: ImportUrl}).strict();

export const ObjectKey = z.string().max(512)
  .regex(/^agencies\/[a-zA-Z0-9_-]+\/(?:jobs|brand|imports)\/[a-zA-Z0-9_./-]+$/)
  .refine(value => !value.includes('..') && !value.includes('//') && !value.endsWith('/'), 'Clé de fichier invalide.');

function fact<T extends z.ZodType, U extends string>(value: T, unit: U) {
  const evidence = {sourcePath: boundedText(160), rawEvidence: boundedText(500)};
  return z.discriminatedUnion('status', [
    z.object({status: z.literal('verified'), value, unit: z.literal(unit), ...evidence}).strict(),
    z.object({status: z.literal('user_provided'), value, unit: z.literal(unit), ...evidence}).strict(),
    z.object({status: z.literal('missing'), value: z.null(), unit: z.literal(unit), sourcePath: z.null(), rawEvidence: z.null()}).strict(),
    z.object({status: z.literal('conflicting'), value: z.null(), unit: z.literal(unit),
      candidates: z.array(z.object({value, ...evidence}).strict()).min(2).max(4)
        .refine(items => new Set(items.map(item => JSON.stringify(Reflect.get(item, 'value')))).size > 1, 'La contradiction doit contenir des valeurs différentes.')}).strict(),
  ]);
}

export const TextFact = fact(boundedText(200), 'text');
export const DESCRIPTION_MAX_CHARACTERS = 20_000;
// Texte de l'annonce, pas une preuve que chaque affirmation commerciale est vraie.
export const ListingDescription = z.object({text: boundedText(DESCRIPTION_MAX_CHARACTERS),
  sourcePath: boundedText(160), truncated: z.boolean()}).strict();
export type ListingDescription = z.infer<typeof ListingDescription>;
export const PropertyTypeFact = fact(z.enum(['apartment', 'house', 'other']), 'category');
export const AreaFact = fact(z.number().positive().max(100_000), 'm2');
export const RoomsFact = fact(z.number().int().positive().max(100), 'rooms');
export const PriceFact = fact(z.object({amountCents: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
  currency: z.literal('EUR'), period: z.enum(['total', 'month']),
  charges: z.enum(['included', 'excluded', 'not_applicable'])}).strict(), 'EUR_cent');

export const AgencyBrand = z.object({
  id: EntityId, ownerUserId: EntityId, name: boundedText(100), logoAssetId: EntityId.nullable(), neutral: z.literal(true).optional(),
  primaryColor: z.string().regex(/^#[0-9a-fA-F]{6}$/), secondaryColor: z.string().regex(/^#[0-9a-fA-F]{6}$/),
  phone: z.string().regex(/^\+?[0-9 ().-]{6,25}$/).nullable(), email: z.email().max(254).nullable(),
  website: ListingUrl.nullable(), createdAt: Timestamp,
}).strict().refine(agency => agency.neutral ? agency.name === 'BienVu' && !agency.phone && !agency.email && !agency.website && !agency.logoAssetId : Boolean(agency.phone || agency.email || agency.website), 'Ajoutez au moins un moyen de contact pour votre agence.');
export type AgencyBrand = z.infer<typeof AgencyBrand>;

export const PhotoAsset = z.object({
  id: EntityId, agencyId: EntityId, listingId: EntityId, sourceUrl: ListingUrl.nullable(),
  objectKey: ObjectKey, contentHash: Sha256, width: z.number().int().min(640).max(12000),
  height: z.number().int().min(360).max(12000), mime: z.enum(['image/jpeg', 'image/png', 'image/webp']),
  sizeBytes: z.number().int().positive().max(10 * 1024 * 1024), sourceOrder: z.number().int().min(0).max(11),
}).strict().refine(asset => asset.objectKey.startsWith(`agencies/${asset.agencyId}/jobs/`)
  || asset.objectKey.startsWith(`agencies/${asset.agencyId}/imports/${asset.listingId}/`), 'Le fichier doit appartenir à cette agence et à cet import.');

export const NormalizedListing = z.object({
  id: EntityId, agencyId: EntityId, sourceKind: z.enum(['url', 'manual']).default('url'),
  sourceUrl: ListingUrl.nullable(), canonicalUrl: ListingUrl.nullable(),
  sourceHost: boundedText(253).nullable(), sourceListingId: boundedText(100).nullable(),
  fetchedAt: Timestamp, adapterVersion: boundedText(64), transaction: z.enum(['sale', 'rent']),
  description: ListingDescription.nullable().default(null),
  facts: z.object({title: TextFact, propertyType: PropertyTypeFact, locality: TextFact, price: PriceFact, area: AreaFact, rooms: RoomsFact.optional()}).strict(),
  photos: z.array(PhotoAsset).max(12), warnings: z.array(boundedText(300)).max(12),
}).strict().superRefine((listing, context) => {
  try {
    if (listing.sourceKind === 'url' && (!listing.sourceUrl || !listing.canonicalUrl || !listing.sourceHost
      || new URL(listing.sourceUrl).hostname !== listing.sourceHost || !sameSourceHost(new URL(listing.canonicalUrl).hostname, listing.sourceHost)))
      context.addIssue({code: 'custom', path: ['sourceHost'], message: 'Le domaine canonique ne correspond pas à la source.'});
  } catch { /* Les champs URL portent déjà leur erreur de validation. */ }
  if (listing.sourceKind === 'manual' && (listing.sourceUrl !== null || listing.canonicalUrl !== null || listing.sourceHost !== null || listing.sourceListingId !== null))
    context.addIssue({code: 'custom', message: 'Une saisie manuelle ne possède pas de source web.'});
  for (const value of Object.values(listing.facts)) {
    if (listing.sourceKind === 'manual' && (value.status === 'verified' || value.status === 'conflicting'))
      context.addIssue({code: 'custom', path: ['facts'], message: 'La provenance doit correspondre au mode de création.'});
  }
  if (listing.photos.some(photo => listing.sourceKind === 'manual' && photo.sourceUrl !== null))
    context.addIssue({code: 'custom', path: ['photos'], message: 'La source des photos doit correspondre au mode de création.'});
  for (const price of listing.facts.price.status === 'verified' || listing.facts.price.status === 'user_provided' ? [listing.facts.price.value]
    : listing.facts.price.status === 'conflicting' ? listing.facts.price.candidates.map(item => item.value) : []) {
    if (listing.transaction === 'sale' ? price.period !== 'total' || price.charges !== 'not_applicable'
      : price.period !== 'month' || price.charges === 'not_applicable')
      context.addIssue({code: 'custom', path: ['facts', 'price'], message: 'L’unité du prix doit correspondre à une vente ou à un loyer mensuel avec charges explicites.'});
  }
  if (listing.photos.some(photo => photo.agencyId !== listing.agencyId || photo.listingId !== listing.id))
    context.addIssue({code: 'custom', path: ['photos'], message: 'Une photo appartient à une autre annonce ou agence.'});
  if (new Set(listing.photos.map(photo => photo.id)).size !== listing.photos.length
    || new Set(listing.photos.map(photo => photo.contentHash)).size !== listing.photos.length)
    context.addIssue({code: 'custom', path: ['photos'], message: 'Les photos doivent être distinctes.'});
  if (listing.photos.reduce((sum, photo) => sum + photo.sizeBytes, 0) > 50 * 1024 * 1024)
    context.addIssue({code: 'custom', path: ['photos'], message: 'Le poids total des photos dépasse la limite.'});
});
export type NormalizedListing = z.infer<typeof NormalizedListing>;

export const GeneratableListing = NormalizedListing.superRefine((listing, context) => {
  if (['title', 'propertyType', 'locality'].some(key => !['verified','user_provided'].includes(listing.facts[key as 'title' | 'propertyType' | 'locality'].status)))
    context.addIssue({code: 'custom', path: ['facts'], message: 'Le titre, le type et la localisation doivent être vérifiés.'});
  if (Object.values(listing.facts).some(item => item.status === 'conflicting'))
    context.addIssue({code: 'custom', path: ['facts'], message: 'Des informations contradictoires empêchent la génération.'});
  if (listing.photos.length < 3)
    context.addIssue({code: 'custom', path: ['photos'], message: 'Au moins trois photos distinctes du bien sont nécessaires.'});
});

export const jobStatuses = ['queued', 'importing', 'scripting', 'voicing', 'rendering', 'retry_wait', 'ready', 'failed'] as const;
export const JobStatus = z.enum(jobStatuses);
export const JobStage = z.enum(['importing', 'scripting', 'voicing', 'rendering']);
export const Job = z.object({
  id: EntityId, agencyId: EntityId, idempotencyKey: z.string().min(16).max(128).regex(/^[a-zA-Z0-9_-]+$/),
  status: JobStatus, stage: JobStage, attempt: z.number().int().min(1).max(2),
  leaseUntil: Timestamp.nullable(), workflowId: EntityId.nullable(), reservationId: EntityId,
  errorCode: z.string().regex(/^[A-Z_]{3,64}$/).nullable(), createdAt: Timestamp, updatedAt: Timestamp,
}).strict().superRefine((job, context) => {
  if (Date.parse(job.updatedAt) < Date.parse(job.createdAt))
    context.addIssue({code: 'custom', message: 'La mise à jour ne peut pas précéder la création.'});
  if (job.status === 'failed' && !job.errorCode || job.status === 'ready' && job.errorCode
    || ['ready', 'failed'].includes(job.status) && job.leaseUntil !== null)
    context.addIssue({code: 'custom', message: 'L’état terminal du traitement est incohérent.'});
  if (['importing', 'scripting', 'voicing', 'rendering'].includes(job.status) && job.status !== job.stage)
    context.addIssue({code: 'custom', message: 'L’étape ne correspond pas à l’état du traitement.'});
});
export type Job = z.infer<typeof Job>;

export const RenderManifest = z.object({
  schemaVersion: z.literal(1), agencyId: EntityId, jobId: EntityId, listingId: EntityId, templateVersion: boundedText(64),
  brand: AgencyBrand, width: z.literal(1080), height: z.literal(1920), fps: z.literal(30),
  rights: z.discriminatedUnion('kind', [
    z.object({kind: z.literal('trial'), allocationId: EntityId, watermarked: z.literal(true)}).strict(),
    z.object({kind: z.literal('paid'), allocationId: EntityId, watermarked: z.literal(false)}).strict(),
  ]),
  photos: z.array(PhotoAsset).min(3).max(6),
  audio: z.array(z.object({id: EntityId, objectKey: ObjectKey, sha256: Sha256,
    durationMs: z.number().int().positive().max(35000)}).strict()).min(3).max(6),
  scenes: z.array(z.object({id: EntityId, photoAssetId: EntityId, audioAssetId: EntityId,
    narrationText: boundedText(500), captionText: boundedText(180),
    factRefs: z.array(z.enum(['title', 'propertyType', 'locality', 'price', 'area'])).min(1).max(5),
    durationFrames: z.number().int().positive().max(1050)}).strict()).min(3).max(6),
}).strict().superRefine((manifest, context) => {
  const fail = (message: string) => context.addIssue({code: 'custom', message});
  const prefix = `agencies/${manifest.agencyId}/jobs/${manifest.jobId}/`;
  if (manifest.brand.id !== manifest.agencyId || manifest.photos.some(photo => photo.agencyId !== manifest.agencyId || photo.listingId !== manifest.listingId))
    fail('Les médias et la marque doivent appartenir à la même agence et à la même annonce.');
  if ([...manifest.photos, ...manifest.audio].some(asset => !asset.objectKey.startsWith(prefix)))
    fail('Le rendu ne peut lire que les fichiers de son traitement.');
  for (const items of [manifest.photos, manifest.audio, manifest.scenes])
    if (new Set(items.map(item => item.id)).size !== items.length) fail('Un identifiant de média ou de scène est dupliqué.');
  if (new Set(manifest.photos.map(photo => photo.contentHash)).size !== manifest.photos.length) fail('Les photos du rendu doivent être distinctes.');
  for (const scene of manifest.scenes) {
    const audio = manifest.audio.find(asset => asset.id === scene.audioAssetId);
    if (!manifest.photos.some(asset => asset.id === scene.photoAssetId) || !audio) fail('Une scène référence un média absent.');
    if (audio && scene.durationFrames < Math.ceil(audio.durationMs * manifest.fps / 1000)) fail('La scène couperait la narration avant sa fin.');
  }
  const frames = manifest.scenes.reduce((sum, scene) => sum + scene.durationFrames, 0);
  if (frames < 600 || frames > 1050) fail('La vidéo cible doit durer entre 20 et 35 secondes, sans couper la narration.');
});
export type RenderManifest = z.infer<typeof RenderManifest>;

export const CostEvent = z.object({
  id: EntityId, agencyId: EntityId.nullable(), jobId: EntityId.nullable(), requestId: z.uuid(),
  provider: z.enum(['cloudflare', 'openai', 'remotion']), stage: z.enum(['hosting', 'importing', 'scripting', 'voicing', 'rendering', 'storage']),
  kind: z.enum(['estimate', 'reconciled', 'fixed', 'prepayment']), quantity: z.number().nonnegative().max(Number.MAX_SAFE_INTEGER),
  unit: z.enum(['request', 'second', 'token', 'byte_month', 'month']), currency: z.enum(['EUR', 'USD']),
  unitPriceMicros: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
  amountMicros: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER), priceDate: z.iso.date(), createdAt: Timestamp,
}).strict().refine(event => !event.jobId || Boolean(event.agencyId), 'Un coût de traitement doit être rattaché à une agence.');
export type CostEvent = z.infer<typeof CostEvent>;

// Optional preserves existing admission hashes; omitted means subtitles enabled.
export const GenerationInput = z.union([
  z.object({url:ImportUrl,subtitlesEnabled:z.boolean().optional()}).strict(),
  z.object({listingId:EntityId,subtitlesEnabled:z.boolean().optional()}).strict(),
]);
