import {z} from 'zod';
import {creditPacks, creditPlans} from './credits';

const amount = z.number().finite().min(0).max(1_000_000);
const percent = z.number().finite().min(0).max(100);
const count = z.number().int().min(0).max(1_000_000);
const key = z.string().regex(/^[a-zA-Z0-9_-]{1,64}$/);

export const PricingOffer = z.object({
  id: key, name: z.string().trim().min(1).max(80), kind: z.enum(['pack', 'subscription']),
  credits: count.min(1).max(100_000), bonusCredits: count.max(100_000), priceHt: amount,
  quantity: count.max(100_000), enabled: z.boolean(), referenceCode: key.nullable(),
}).strict();
export const PricingUsageProfile = z.object({
  id: key, name: z.string().trim().min(1).max(80), share: percent,
  photos: z.number().int().min(1).max(12), animations: z.number().int().min(0).max(12),
  durationSeconds: z.number().min(5).max(300), renderSeconds: z.number().min(1).max(3600),
  voice: z.boolean(), map: z.boolean(),
}).strict().refine(p => p.animations <= p.photos, {path: ['animations'], message: 'Une animation maximum par photo.'});

export const PricingSimulationInput = z.object({
  version: z.literal(1), name: z.string().trim().min(1).max(100), notes: z.string().max(1500),
  market: z.object({
    eurPerUsd: z.number().min(0.1).max(10), vatPercent: percent,
    targetMargin: percent.max(99), consumptionPercent: percent,
    growthPercent: z.number().min(-50).max(50), horizonMonths: z.number().int().min(1).max(36),
    refundsPercent: percent, disputesPercent: percent, paymentPercent: percent,
    paymentFixedEur: amount, subscriptionFeePercent: percent, disputeFeeEur: amount,
    otherFixedMonthlyEur: amount, marketingMonthlyEur: amount, otherPerOrderEur: amount,
    supportMinutesPerVideo: z.number().min(0).max(240), supportHourlyEur: amount,
    freeVideosMonthly: count.max(100_000), freeRetentionDays: z.number().min(1).max(365),
    initialUnusedPackCredits: count, initialStorageGB: amount,
    storageRetentionMonths: z.number().int().min(0).max(120),
  }).strict().refine(m => m.refundsPercent + m.disputesPercent <= 100, {
    path: ['refundsPercent'], message: 'Remboursements et litiges ne peuvent pas dépasser 100 % des achats.',
  }),
  production: z.object({
    runwayCreditsPerSecond: amount, runwaySeconds: z.number().min(1).max(60), runwayUsdPerCredit: amount,
    animationReusePercent: percent, extraAnimationAttemptsPercent: z.number().min(0).max(300),
    extraRenderPercent: z.number().min(0).max(500), textEurPerVideo: amount,
    voiceMode: z.enum(['per_video', 'cartesia_plan']), voiceEurPerVideo: amount,
    cartesiaPlan: z.enum(['auto', 'free', 'pro', 'startup', 'scale', 'custom']),
    voiceCustomMonthlyUsd: amount, voiceCustomMinutes: amount, voiceCommercialLicense: z.boolean(),
    voiceExtraPercent: z.number().min(0).max(500), otherEurPerVideo: amount,
    importsPerVideo: z.number().min(0).max(5), importCpuSeconds: z.number().min(0).max(3600),
    importUptimeSeconds: z.number().min(0).max(7200), browserFallbackPercent: percent,
    browserEurPerImport: amount, mapExtraRenderSeconds: z.number().min(0).max(3600),
    outputMB: amount.max(1000), photoMB: amount.max(100), animationMB: amount.max(1000), voiceMB: amount.max(100),
    writesPerVideo: z.number().min(0).max(10_000), readsPerVideo: z.number().min(0).max(1_000_000),
    workerRequestsPerVideo: z.number().min(0).max(100_000), workerCpuMsPerVideo: z.number().min(0).max(1_000_000),
  }).strict(),
  cloudflare: z.object({
    fixedMonthlyUsd: amount, cpuUsdPerSecond: amount, memoryUsdPerGiBSecond: amount,
    diskUsdPerGBSecond: amount, ramGiB: z.number().min(0.25).max(128), diskGB: z.number().min(1).max(1000),
    vcpu: z.number().min(0.0625).max(64), idleSeconds: z.number().min(0).max(3600),
    renderInstances: z.number().int().min(1).max(100), quotaAvailablePercent: percent,
    includedCpuSeconds: amount, includedMemoryGiBSeconds: amount, includedDiskGBSeconds: amount,
    storageUsdPerGBMonth: amount, includedStorageGB: amount,
    writeUsdPerMillion: amount, readUsdPerMillion: amount,
    includedWrites: z.number().min(0).max(1_000_000_000), includedReads: z.number().min(0).max(1_000_000_000),
    workerUsdPerMillionRequests: amount, workerUsdPerMillionCpuMs: amount,
    includedWorkerRequests: z.number().min(0).max(1_000_000_000), includedWorkerCpuMs: z.number().min(0).max(1_000_000_000),
  }).strict(),
  offers: z.array(PricingOffer).min(1).max(16), profiles: z.array(PricingUsageProfile).min(1).max(6),
}).strict().superRefine((s, ctx) => {
  if (Math.abs(s.profiles.reduce((sum, p) => sum + p.share, 0) - 100) > 0.001)
    ctx.addIssue({code: 'custom', path: ['profiles'], message: 'La répartition des profils doit totaliser 100 %.'});
  if (new Set(s.offers.map(o => o.id)).size !== s.offers.length || new Set(s.profiles.map(p => p.id)).size !== s.profiles.length)
    ctx.addIssue({code: 'custom', path: ['offers'], message: 'Les identifiants des offres et profils doivent être uniques.'});
  if (s.production.importUptimeSeconds < s.production.importCpuSeconds)
    ctx.addIssue({code: 'custom', path: ['production', 'importUptimeSeconds'], message: 'Le temps alloué à l’import doit couvrir le temps de calcul.'});
  const largest = s.offers.reduce((sum, o) => sum + (o.enabled ? o.quantity * (o.credits + o.bonusCredits) : 0), 0)
    * Math.max(1, (1 + s.market.growthPercent / 100) ** (s.market.horizonMonths - 1));
  if (largest > 1_000_000_000) ctx.addIssue({code: 'custom', path: ['market', 'growthPercent'], message: 'La prévision est limitée à un milliard de crédits par mois.'});
});
export type PricingSimulationInput = z.infer<typeof PricingSimulationInput>;
export type PricingOffer = z.infer<typeof PricingOffer>;
export type PricingUsageProfile = z.infer<typeof PricingUsageProfile>;

export const cartesiaPricingPlans = [
  {id: 'free', name: 'Free', monthlyUsd: 0, minutes: 27, commercial: false},
  {id: 'pro', name: 'Pro', monthlyUsd: 5, minutes: 133, commercial: true},
  {id: 'startup', name: 'Startup', monthlyUsd: 49, minutes: 1667, commercial: true},
  {id: 'scale', name: 'Scale', monthlyUsd: 299, minutes: 10667, commercial: true},
] as const;
export const pricingSimulationSources = [
  {name: 'Runway · crédits API', url: 'https://docs.dev.runwayml.com/guides/pricing/', at: '2026-10-07'},
  {name: 'Cloudflare · conteneurs', url: 'https://developers.cloudflare.com/containers/platform/pricing/', at: '2026-10-07'},
  {name: 'Cloudflare · R2', url: 'https://developers.cloudflare.com/r2/pricing/', at: '2026-10-07'},
  {name: 'Cloudflare · Workers', url: 'https://developers.cloudflare.com/workers/platform/pricing/', at: '2026-10-07'},
  {name: 'Stripe · tarifs France', url: 'https://stripe.com/fr/pricing', at: '2026-10-07'},
  {name: 'Cartesia · forfaits et licence', url: 'https://www.cartesia.ai/pricing', at: '2026-10-07'},
] as const;

export function defaultPricingSimulation(): PricingSimulationInput {
  return PricingSimulationInput.parse({
    version: 1, name: 'Catalogue BienVu · scénario courant', notes: '',
    market: {eurPerUsd: 1, vatPercent: 20, targetMargin: 70, consumptionPercent: 100,
      growthPercent: 0, horizonMonths: 12, refundsPercent: 0, disputesPercent: 0,
      paymentPercent: 1.5, paymentFixedEur: 0.25, subscriptionFeePercent: 0.7, disputeFeeEur: 20,
      otherFixedMonthlyEur: 0, marketingMonthlyEur: 0, otherPerOrderEur: 0,
      supportMinutesPerVideo: 0, supportHourlyEur: 25, freeVideosMonthly: 10, freeRetentionDays: 1,
      initialUnusedPackCredits: 0, initialStorageGB: 0, storageRetentionMonths: 0},
    production: {runwayCreditsPerSecond: 5, runwaySeconds: 5, runwayUsdPerCredit: 0.01,
      animationReusePercent: 0, extraAnimationAttemptsPercent: 0, extraRenderPercent: 0, textEurPerVideo: 0.003,
      voiceMode: 'cartesia_plan', voiceEurPerVideo: 0.013, cartesiaPlan: 'auto',
      voiceCustomMonthlyUsd: 5, voiceCustomMinutes: 133, voiceCommercialLicense: true,
      voiceExtraPercent: 0, otherEurPerVideo: 0, importsPerVideo: 1, importCpuSeconds: 8, importUptimeSeconds: 38,
      browserFallbackPercent: 0, browserEurPerImport: 0.01, mapExtraRenderSeconds: 30,
      outputMB: 15, photoMB: 0.5, animationMB: 5, voiceMB: 2,
      writesPerVideo: 20, readsPerVideo: 100, workerRequestsPerVideo: 50, workerCpuMsPerVideo: 1000},
    cloudflare: {fixedMonthlyUsd: 5, cpuUsdPerSecond: 0.000020, memoryUsdPerGiBSecond: 0.0000025,
      diskUsdPerGBSecond: 0.00000007, ramGiB: 6, diskGB: 12, vcpu: 1, idleSeconds: 30,
      renderInstances: 1, quotaAvailablePercent: 100, includedCpuSeconds: 22500,
      includedMemoryGiBSeconds: 90000, includedDiskGBSeconds: 720000, storageUsdPerGBMonth: 0.015,
      includedStorageGB: 10, writeUsdPerMillion: 4.5, readUsdPerMillion: 0.36,
      includedWrites: 1_000_000, includedReads: 10_000_000,
      workerUsdPerMillionRequests: 0.30, workerUsdPerMillionCpuMs: 0.02,
      includedWorkerRequests: 10_000_000, includedWorkerCpuMs: 30_000_000},
    offers: [
      ...creditPacks.map((p, i) => ({id: p.code, name: `Recharge ${p.credits}`, kind: 'pack', credits: p.credits,
        bonusCredits: 0, priceHt: p.priceCents / 100, quantity: i === 1 ? 20 : 10, enabled: true, referenceCode: p.code})),
      ...creditPlans.filter(p => p.price > 0).map(p => ({id: p.code, name: p.name, kind: 'subscription', credits: p.credits,
        bonusCredits: 0, priceHt: p.price, quantity: p.code === 'plus' ? 20 : 10, enabled: true, referenceCode: p.code})),
    ],
    profiles: [
      {id: 'classic', name: 'Montage classique', share: 60, photos: 6, animations: 0, durationSeconds: 20, renderSeconds: 120, voice: true, map: false},
      {id: 'balanced', name: 'Deux photos animées', share: 30, photos: 6, animations: 2, durationSeconds: 20, renderSeconds: 150, voice: true, map: false},
      {id: 'intensive', name: 'Six photos animées', share: 10, photos: 6, animations: 6, durationSeconds: 30, renderSeconds: 180, voice: true, map: false},
    ],
  });
}

export type PricingSavedScenario = {id: string; revision: number; input: PricingSimulationInput; createdAt: string; updatedAt: string};
export const PricingSimulationAction = z.discriminatedUnion('action', [
  z.object({action: z.literal('calculate'), input: PricingSimulationInput}).strict(),
  z.object({action: z.literal('save'), id: z.uuid().nullable(), revision: z.number().int().positive().nullable(), input: PricingSimulationInput}).strict()
    .refine(a => (a.id === null) === (a.revision === null), {message: 'Identifiant et version sont requis ensemble.'}),
  z.object({action: z.literal('delete'), id: z.uuid(), revision: z.number().int().positive()}).strict(),
]);
