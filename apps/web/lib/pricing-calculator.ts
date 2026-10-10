import {PricingSimulationInput, cartesiaPricingPlans, creditPacks, creditPlans, legacyCreditPacks, legacyCreditPlans, defaultPricingSimulation,
  type PricingUsageProfile, VIDEO_CREDITS, PHOTO_ANIMATION_CREDITS,AVATAR_SECONDS_PER_CREDIT} from '@bienvu/contracts';

// Forecast amounts are decimal euros, not a ledger of billable transactions.
// The same pure engine runs in the browser, API, saved scenarios and exports.
export type PricingCostParts = {avatar:number;runway: number; text: number; voice: number; compute: number;
  browser: number; storage: number; operations: number; workers: number; support: number; other: number};
const zero = (): PricingCostParts => ({avatar:0,runway: 0, text: 0, voice: 0, compute: 0, browser: 0,
  storage: 0, operations: 0, workers: 0, support: 0, other: 0});
const sum = (p: PricingCostParts) => Object.values(p).reduce((a, b) => a + b, 0);
const positive = (n: number) => Math.max(0, n);
const ratio = (numerator: number, denominator: number) => denominator > 0 ? numerator / denominator : null;
const margin = (profit: number, revenue: number) => revenue > 0 ? profit / revenue * 100 : null;
type VoicePlan = {name: string; monthlyEur: number; minutes: number; commercial: boolean; exceeded: boolean; referenceEurPerMinute: number};

function voicePlan(s: PricingSimulationInput, minutes: number): VoicePlan {
  const p = s.production, fx = s.market.eurPerUsd;
  const reference = cartesiaPricingPlans.find(p => p.id === 'pro')!;
  if (p.voiceMode === 'per_video') return {name: 'Coût par vidéo', monthlyEur: 0, minutes: 0,
    commercial: p.voiceCommercialLicense, exceeded: false, referenceEurPerMinute: 0};
  if (p.cartesiaPlan === 'custom') return {name: 'Forfait personnalisé', monthlyEur: p.voiceCustomMonthlyUsd * fx,
    minutes: p.voiceCustomMinutes, commercial: p.voiceCommercialLicense, exceeded: minutes > p.voiceCustomMinutes,
    referenceEurPerMinute: p.voiceCustomMinutes > 0 ? p.voiceCustomMonthlyUsd * fx / p.voiceCustomMinutes : reference.monthlyUsd * fx / reference.minutes};
  if (p.cartesiaPlan === 'auto' && minutes === 0) return {name: 'Aucun forfait nécessaire', monthlyEur: 0, minutes: 0,
    commercial: true, exceeded: false, referenceEurPerMinute: reference.monthlyUsd * fx / reference.minutes};
  const selected = p.cartesiaPlan === 'auto'
    ? cartesiaPricingPlans.find(p => p.commercial && p.minutes >= minutes) ?? cartesiaPricingPlans.at(-1)!
    : cartesiaPricingPlans.find(plan => plan.id === p.cartesiaPlan)!;
  // A Free quote does not price commercial production at zero. Its allocation
  // and lack of commercial license are also explicit feasibility warnings.
  const priced = selected.commercial ? selected : reference;
  return {name: `Cartesia ${selected.name}`, monthlyEur: selected.monthlyUsd * fx, minutes: selected.minutes,
    commercial: selected.commercial, exceeded: minutes > selected.minutes,
    referenceEurPerMinute: priced.monthlyUsd * fx / priced.minutes};
}

type VideoMeasures = {credits: number; newAnimations: number; storageGB: number; voiceMinutes: number;
  cpuSeconds: number; memoryGiBSeconds: number; diskGBSeconds: number; rendererSeconds: number;
  writes: number; reads: number; workerRequests: number; workerCpuMs: number; voiceCalls: number};
function measures(s: PricingSimulationInput, p: PricingUsageProfile): VideoMeasures {
  const production = s.production, c = s.cloudflare;
  const newAnimations = p.animations * (1 - production.animationReusePercent / 100);
  const active = (p.renderSeconds + (p.map ? production.mapExtraRenderSeconds : 0)) * (1 + production.extraRenderPercent / 100);
  const uptime = active + c.idleSeconds * (1 + production.extraRenderPercent / 100);
  const imports = production.importsPerVideo;
  return {credits: VIDEO_CREDITS + newAnimations * PHOTO_ANIMATION_CREDITS+(p.avatar?(p.avatar.coverage==='full'?Math.ceil(p.durationSeconds/AVATAR_SECONDS_PER_CREDIT):1)*(1-(production.avatar?.reusePercent??0)/100):0), newAnimations,
    storageGB: (production.outputMB + production.photoMB * p.photos + production.animationMB * p.animations + (p.voice ? production.voiceMB : 0)+(p.avatar?production.avatar?.mediaMB??4:0)) / 1000,
    voiceMinutes: p.voice ? p.durationSeconds / 60 * (1 + production.voiceExtraPercent / 100) : 0,
    voiceCalls: p.voice ? 1 + production.voiceExtraPercent / 100 : 0,
    cpuSeconds: active * c.vcpu + imports * production.importCpuSeconds * 0.25,
    memoryGiBSeconds: uptime * c.ramGiB + imports * production.importUptimeSeconds,
    diskGBSeconds: uptime * c.diskGB + imports * production.importUptimeSeconds * 4,
    rendererSeconds: uptime, writes: production.writesPerVideo, reads: production.readsPerVideo,
    workerRequests: production.workerRequestsPerVideo, workerCpuMs: production.workerCpuMsPerVideo};
}
function videoCosts(s: PricingSimulationInput, p: PricingUsageProfile, plan: VoicePlan, storageMonths: number) {
  const m = measures(s, p), r = s.production, c = s.cloudflare, fx = s.market.eurPerUsd;
  const parts: PricingCostParts = {avatar:p.avatar?(p.avatar.coverage==='full'?p.durationSeconds:p.avatar.seconds)/60*(p.avatar.engine==='avatar_iii'?r.avatar?.priceIII??.99:r.avatar?.priceIV??4.83)*(1-(r.avatar?.reusePercent??0)/100)*fx:0,
    runway: m.newAnimations * r.runwayCreditsPerSecond * r.runwaySeconds * r.runwayUsdPerCredit * fx * (1 + r.extraAnimationAttemptsPercent / 100),
    text: r.textEurPerVideo,
    voice: r.voiceMode === 'per_video' ? m.voiceCalls * r.voiceEurPerVideo : m.voiceMinutes * plan.referenceEurPerMinute,
    compute: (m.cpuSeconds * c.cpuUsdPerSecond + m.memoryGiBSeconds * c.memoryUsdPerGiBSecond + m.diskGBSeconds * c.diskUsdPerGBSecond) * fx,
    browser: r.importsPerVideo * r.browserFallbackPercent / 100 * r.browserEurPerImport,
    storage: m.storageGB * c.storageUsdPerGBMonth * fx * storageMonths,
    operations: (m.writes * c.writeUsdPerMillion + m.reads * c.readUsdPerMillion) / 1_000_000 * fx,
    workers: (m.workerRequests * c.workerUsdPerMillionRequests + m.workerCpuMs * c.workerUsdPerMillionCpuMs) / 1_000_000 * fx,
    support: s.market.supportMinutesPerVideo / 60 * s.market.supportHourlyEur,
    other: r.otherEurPerVideo,
  };
  return {profile: p, measures: m, parts, grossEur: sum(parts)};
}
export type PricingProfileResult = ReturnType<typeof videoCosts>;
export type PricingMonth = {month: number; orders: number; soldCredits: number; consumedCredits: number;
  paidVideos: number; freeVideos: number; newAnimations: number; voiceMinutes: number; voicePlan: VoicePlan;
  revenueHt: number; receivedTtc: number; vat: number; paymentFees: number; fixedEur: number;
  costs: PricingCostParts; totalCosts: number; profit: number; marginPercent: number | null;
  storedGB: number; unusedPackCredits: number; exposureEur: number; capacityPercent: number;
  cumulativeRevenueHt: number; cumulativeProfit: number; cumulativeAfterExposureEur: number};
export type PricingOfferResult = {id: string; name: string; enabled: boolean; kind: 'pack' | 'subscription';
  credits: number; priceHt: number; priceTtc: number; pricePerCredit: number; currentPriceHt: number | null;
  expectedVideos: number; productionEur: number; sharedEur: number; paymentFees: number; revenueHt: number;
  profit: number; marginPercent: number | null; minimumPriceHt: number | null; maxDiscountPercent: number | null;
  maxExtraPerOrderEur: number; status: 'loss' | 'below_target' | 'target' | 'inactive'};
export type PricingComparison = {id: string; name: string; firstProfit: number; finalProfit: number;
  cumulativeProfit: number; cumulativeAfterExposureEur: number; minMargin: number | null; closingExposureEur: number; feasible: boolean};
export type PricingReport = {profiles: PricingProfileResult[]; averageCreditsPerVideo: number;
  averageGrossVideoEur: number; grossEurPerCredit: number; runwayClipEur: number;
  holdingMonths: number; offers: PricingOfferResult[]; months: PricingMonth[];
  comparisons: PricingComparison[]; warnings: {code: string; message: string}[];
  breakEvenOrders: number | null; breakEvenRevenueHt: number | null; sharedEurPerSoldCredit: number | null};

function weighted<K extends keyof VideoMeasures>(profiles: PricingProfileResult[], key: K) {
  return profiles.reduce((sum, row) => sum + row.measures[key] * row.profile.share / 100, 0);
}
function averageParts(profiles: PricingProfileResult[]): PricingCostParts {
  const result = zero();
  for (const row of profiles) for (const key of Object.keys(result) as (keyof PricingCostParts)[])
    result[key] += row.parts[key] * row.profile.share / 100;
  return result;
}

function project(s: PricingSimulationInput) {
  const market = s.market, c = s.cloudflare, r = s.production;
  const holdingMonths = market.storageRetentionMonths || market.horizonMonths;
  // A finite retention commitment must be funded in full, including months
  // beyond the forecast. Permanent retention uses the stated forecast horizon.
  const paidHolding = holdingMonths;
  const freeProfile: PricingUsageProfile = {...s.profiles[0], id: 'free', name: 'Essai gratuit classique',
    animations: 0, share: 100, photos: 6, durationSeconds: 20, renderSeconds: 120, voice: true, map: false};
  const provisional = voicePlan(s, 0);
  let profiles = s.profiles.map(p => videoCosts(s, p, provisional, paidHolding));
  const creditsPerVideo = weighted(profiles, 'credits');
  const average = averageParts(profiles);
  let packBalance = market.initialUnusedPackCredits;
  const cohorts: {month: number; gb: number}[] = [];
  const freeCohorts: {month: number; gb: number}[] = [];
  const months: PricingMonth[] = [];
  let cumulativeRevenueHt = 0, cumulativeProfit = 0;
  const quota = c.quotaAvailablePercent / 100, fx = market.eurPerUsd;
  for (let month = 1; month <= market.horizonMonths; month++) {
    const multiplier = (1 + market.growthPercent / 100) ** (month - 1);
    const active = s.offers.filter(o => o.enabled);
    const orders = active.reduce((n, o) => n + o.quantity * multiplier, 0);
    const soldCredits = active.reduce((n, o) => n + o.quantity * multiplier * (o.credits + o.bonusCredits), 0);
    const newPackCredits = active.filter(o => o.kind === 'pack').reduce((n, o) => n + o.quantity * multiplier * (o.credits + o.bonusCredits), 0);
    const availablePackCredits = packBalance + newPackCredits;
    const consumedPack = availablePackCredits * market.consumptionPercent / 100;
    packBalance = Math.max(0, availablePackCredits - consumedPack);
    const subscriptionCredits = soldCredits - newPackCredits;
    const consumedCredits = consumedPack + subscriptionCredits * market.consumptionPercent / 100;
    const paidVideos = consumedCredits / creditsPerVideo, freeVideos = market.freeVideosMonthly * multiplier;
    const free = videoCosts(s, freeProfile, provisional, market.freeRetentionDays / 30);
    const voiceMinutes = paidVideos * weighted(profiles, 'voiceMinutes') + freeVideos * free.measures.voiceMinutes;
    const plan = voicePlan(s, voiceMinutes);
    if (month === 1) {
      profiles = s.profiles.map(p => videoCosts(s, p, plan, paidHolding));
      Object.assign(average, averageParts(profiles));
    }
    const cpu = paidVideos * weighted(profiles, 'cpuSeconds') + freeVideos * free.measures.cpuSeconds;
    const memory = paidVideos * weighted(profiles, 'memoryGiBSeconds') + freeVideos * free.measures.memoryGiBSeconds;
    const disk = paidVideos * weighted(profiles, 'diskGBSeconds') + freeVideos * free.measures.diskGBSeconds;
    const costs = zero();
    for (const k of ['runway', 'text', 'browser', 'support', 'other'] as const) costs[k] = average[k] * paidVideos + free.parts[k] * freeVideos;
    costs.other += market.otherPerOrderEur * orders;
    costs.voice = r.voiceMode === 'cartesia_plan' ? plan.monthlyEur
      : (paidVideos * weighted(profiles, 'voiceCalls') + freeVideos * free.measures.voiceCalls) * r.voiceEurPerVideo;
    costs.compute = (positive(cpu - c.includedCpuSeconds * quota) * c.cpuUsdPerSecond
      + positive(memory - c.includedMemoryGiBSeconds * quota) * c.memoryUsdPerGiBSecond
      + positive(disk - c.includedDiskGBSeconds * quota) * c.diskUsdPerGBSecond) * fx;
    cohorts.push({month, gb: paidVideos * weighted(profiles, 'storageGB')});
    freeCohorts.push({month, gb: freeVideos * free.measures.storageGB});
    // Conservatively assume each cohort's media are available from the start of
    // its month. Retention 0 is permanent, not zero months of storage.
    const storedGB = market.initialStorageGB + cohorts.reduce((n, row) => n + (!market.storageRetentionMonths || month - row.month < market.storageRetentionMonths ? row.gb : 0), 0)
      + freeCohorts.reduce((n, row) => n + row.gb * Math.min(1, Math.max(0, market.freeRetentionDays / 30 - (month - row.month))), 0);
    costs.storage = Math.ceil(positive(storedGB - c.includedStorageGB * quota)) * c.storageUsdPerGBMonth * fx;
    const writes = paidVideos * weighted(profiles, 'writes') + freeVideos * free.measures.writes;
    const reads = paidVideos * weighted(profiles, 'reads') + freeVideos * free.measures.reads;
    // R2 rounds chargeable operations up to each million, separately per class.
    costs.operations = (Math.ceil(positive(writes - c.includedWrites * quota) / 1_000_000) * c.writeUsdPerMillion
      + Math.ceil(positive(reads - c.includedReads * quota) / 1_000_000) * c.readUsdPerMillion) * fx;
    const requests = paidVideos * weighted(profiles, 'workerRequests') + freeVideos * free.measures.workerRequests;
    const workerCpu = paidVideos * weighted(profiles, 'workerCpuMs') + freeVideos * free.measures.workerCpuMs;
    costs.workers = (positive(requests - c.includedWorkerRequests * quota) / 1_000_000 * c.workerUsdPerMillionRequests
      + positive(workerCpu - c.includedWorkerCpuMs * quota) / 1_000_000 * c.workerUsdPerMillionCpuMs) * fx;
    const losses = (market.refundsPercent + market.disputesPercent) / 100;
    const grossHt = active.reduce((n, o) => n + o.priceHt * o.quantity * multiplier, 0);
    const revenueHt = grossHt * (1 - losses), receivedTtc = revenueHt * (1 + market.vatPercent / 100);
    const paymentFees = active.reduce((n, o) => n + o.quantity * multiplier * (market.paymentFixedEur
      + o.priceHt * (1 + market.vatPercent / 100) * (market.paymentPercent + (o.kind === 'subscription' ? market.subscriptionFeePercent : 0)) / 100
      + market.disputesPercent / 100 * market.disputeFeeEur), 0);
    const fixedEur = c.fixedMonthlyUsd * fx + market.otherFixedMonthlyEur + market.marketingMonthlyEur;
    const totalCosts = sum(costs) + fixedEur + paymentFees, profit = revenueHt - totalCosts;
    cumulativeRevenueHt += revenueHt; cumulativeProfit += profit;
    months.push({month, orders, soldCredits, consumedCredits, paidVideos, freeVideos,
      newAnimations: paidVideos * weighted(profiles, 'newAnimations'), voiceMinutes, voicePlan: plan,
      revenueHt, receivedTtc, vat: receivedTtc - revenueHt, paymentFees, fixedEur, costs, totalCosts,
      profit, marginPercent: margin(profit, revenueHt), storedGB, unusedPackCredits: packBalance,
      exposureEur: packBalance * sum(average) / creditsPerVideo,
      capacityPercent: (paidVideos * weighted(profiles, 'rendererSeconds') + freeVideos * free.measures.rendererSeconds) / (30 * 86400 * c.renderInstances) * 100,
      cumulativeRevenueHt, cumulativeProfit,
      cumulativeAfterExposureEur: cumulativeProfit - packBalance * sum(average) / creditsPerVideo});
  }
  const grossVideo = sum(average), grossCredit = grossVideo / creditsPerVideo;
  const first = months[0];
  const free = videoCosts(s, freeProfile, first.voicePlan, market.freeRetentionDays / 30);
  const billedVoiceUnused = r.voiceMode === 'cartesia_plan'
    ? positive(first.costs.voice - (average.voice * first.paidVideos + free.parts.voice * first.freeVideos)) : 0;
  const overhead = first.fixedEur + free.grossEur * first.freeVideos + billedVoiceUnused
    + market.initialUnusedPackCredits * market.consumptionPercent / 100 * grossCredit
    + market.initialStorageGB * c.storageUsdPerGBMonth * fx
    + positive(first.costs.operations - (average.operations * first.paidVideos + free.parts.operations * first.freeVideos))
    + positive(first.costs.storage - first.storedGB * c.storageUsdPerGBMonth * fx);
  const sharedPerCredit = ratio(overhead, first.soldCredits);
  const offers: PricingOfferResult[] = s.offers.map(o => {
    const credits = o.credits + o.bonusCredits;
    const productionEur = credits * grossCredit, sharedEur = credits * (sharedPerCredit ?? 0);
    const percentFee = (market.paymentPercent + (o.kind === 'subscription' ? market.subscriptionFeePercent : 0)) / 100;
    const fixedFees = market.paymentFixedEur + market.disputesPercent / 100 * market.disputeFeeEur;
    const paymentFees = fixedFees + o.priceHt * (1 + market.vatPercent / 100) * percentFee;
    const kept = 1 - (market.refundsPercent + market.disputesPercent) / 100;
    const revenueHt = o.priceHt * kept;
    const profit = revenueHt - productionEur - sharedEur - paymentFees - market.otherPerOrderEur;
    const denominator = kept * (1 - market.targetMargin / 100) - percentFee * (1 + market.vatPercent / 100);
    const minimumPriceHt = denominator > 0 && sharedPerCredit !== null
      ? Math.ceil((productionEur + sharedEur + fixedFees + market.otherPerOrderEur) / denominator * 100 - 1e-9) / 100 : null;
    const pct = margin(profit, revenueHt);
    const ref = [...creditPacks,...legacyCreditPacks].find(p => p.code === o.referenceCode);
    const plan = [...creditPlans,...legacyCreditPlans].find(p => p.code === o.referenceCode);
    const currentPriceHt = ref ? ref.priceCents / 100 : plan ? plan.price : null;
    return {id: o.id, name: o.name, enabled: o.enabled, kind: o.kind, credits, priceHt: o.priceHt,
      priceTtc: o.priceHt * (1 + market.vatPercent / 100), pricePerCredit: o.priceHt / credits, currentPriceHt,
      expectedVideos: credits / creditsPerVideo, productionEur, sharedEur, paymentFees, revenueHt, profit,
      marginPercent: pct, minimumPriceHt,
      maxDiscountPercent: minimumPriceHt !== null && o.priceHt > 0 ? positive((1 - minimumPriceHt / o.priceHt) * 100) : null,
      maxExtraPerOrderEur: revenueHt * (1 - market.targetMargin / 100) - productionEur - sharedEur - paymentFees - market.otherPerOrderEur,
      status: !o.enabled ? 'inactive' : profit < 0 ? 'loss' : pct === null || pct + 1e-7 < market.targetMargin ? 'below_target' : 'target'};
  });
  const active = s.offers.filter(o => o.enabled);
  const currentOrders = active.reduce((n, o) => n + o.quantity, 0);
  const contribution = active.reduce((n, o) => {
    const row = offers.find(r => r.id === o.id)!;
    return n + (row.profit + row.sharedEur) * o.quantity;
  }, 0);
  const breakEvenOrders = currentOrders > 0 && contribution > 0 ? Math.ceil(overhead / (contribution / currentOrders)) : null;
  const meanRevenue = first.orders > 0 ? first.revenueHt / first.orders : 0;
  return {profiles, averageCreditsPerVideo: creditsPerVideo, averageGrossVideoEur: grossVideo,
    grossEurPerCredit: grossCredit, holdingMonths: paidHolding, offers, months,
    breakEvenOrders, breakEvenRevenueHt: breakEvenOrders === null ? null : breakEvenOrders * meanRevenue,
    sharedEurPerSoldCredit: sharedPerCredit};
}

export function pricingPreset(input: PricingSimulationInput, preset: 'current' | 'intensive' | 'growth'): PricingSimulationInput {
  const s = structuredClone(input);
  if (preset === 'intensive') {
    s.name = 'IA intensive · consommation intégrale'; s.market.consumptionPercent = 100;
    s.profiles = s.profiles.map(p => ({...p, animations: p.photos}));
    s.production.animationReusePercent = 0;
  } else if (preset === 'growth') {
    s.name = 'Croissance · volume × 3'; s.market.growthPercent = 10;
    s.offers = s.offers.map(o => ({...o, quantity: Math.min(100_000, o.quantity * 3)}));
  } else {
    s.name = 'Scénario courant'; s.profiles = defaultPricingSimulation().profiles;
    s.market.consumptionPercent = 100; s.market.growthPercent = 0;
  }
  return PricingSimulationInput.parse(s);
}

export function calculatePricing(input: unknown, includeComparisons = true): PricingReport {
  const s = PricingSimulationInput.parse(input), base = project(s);
  const warnings: PricingReport['warnings'] = [];
  const add = (code: string, message: string) => warnings.push({code, message});
  if (base.months.some(m => !m.voicePlan.commercial && m.voiceMinutes > 0)) add('VOICE_LICENSE', 'Le forfait voix choisi ne prévoit pas de licence commerciale. Utilisez un forfait adapté pour une offre commerciale.');
  if (base.months.some(m => m.voicePlan.exceeded)) add('VOICE_CAPACITY', 'La capacité du forfait voix est dépassée sur la période. Un contrat supérieur ou personnalisé est nécessaire ; le dépassement ne vaut pas un tarif de facturation.');
  if (base.months.some(m => m.capacityPercent > 100)) add('RENDER_CAPACITY', 'Le volume dépasse la capacité théorique des instances de rendu configurées. Les pics de trafic nécessitent une marge de capacité supplémentaire.');
  if (!base.months[0].soldCredits) add('NO_SALES', 'Aucun volume de vente actif : les frais partagés et le prix cible ne peuvent pas être répartis.');
  if (base.offers.some(o => o.enabled && o.minimumPriceHt === null) && base.months[0].soldCredits > 0)
    add('UNREACHABLE_MARGIN', 'L’objectif de marge est incompatible avec les frais et pertes paramétrés pour au moins une offre.');
  if (s.market.storageRetentionMonths === 0) add('PERMANENT_STORAGE', `Les médias sont conservés durablement. Le prix cible provisionne ${s.market.horizonMonths} mois de stockage ; les frais continuent au-delà de cet horizon.`);
  if (s.market.consumptionPercent < 100) add('UNUSED_CREDITS', 'Les recharges inutilisées sont reportées et peuvent être consommées plus tard. Leur coût potentiel reste affiché ; les nouvelles offres mensuelles payantes ont un report plafonné à une mensualité après renouvellement payé. La projection de consommation mensuelle doit inclure l’utilisation de ces reports.');
  if (s.market.eurPerUsd === 1) add('FX_ASSUMPTION', 'Le taux 1 USD = 1 EUR est une hypothèse prudente, à remplacer par votre taux de conversion effectif.');
  const enabled = base.offers.filter(o => o.enabled);
  const subscriptions = enabled.filter(o => o.kind === 'subscription');
  if (enabled.some(o => o.kind === 'pack' && subscriptions.some(p => o.pricePerCredit <= p.pricePerCredit)))
    add('CATALOG_POSITIONING', 'Une recharge est aussi avantageuse au crédit qu’un abonnement. Vérifiez que la différence correspond au positionnement commercial souhaité.');
  const packs = enabled.filter(o => o.kind === 'pack').sort((a, b) => a.credits - b.credits);
  if (packs.some((p, i) => i > 0 && p.pricePerCredit > packs[i - 1].pricePerCredit))
    add('PACK_DISCOUNT', 'Le prix au crédit augmente pour une recharge plus grande. La remise de volume mérite d’être vérifiée.');
  const last = base.months.at(-1)!;
  if (last.profit < 0) add('MONTHLY_LOSS', 'Le dernier mois projeté est déficitaire après production, frais de paiement et frais fixes.');
  const comparisons: PricingComparison[] = [];
  if (includeComparisons) {
    const allUsed = structuredClone(s); allUsed.market.consumptionPercent = 100;
    const supplier = structuredClone(s); supplier.production.runwayUsdPerCredit *= 1.2;
    supplier.production.textEurPerVideo *= 1.2; supplier.production.voiceEurPerVideo *= 1.2;
    supplier.market.eurPerUsd *= 1.2;
    const discounted = structuredClone(s); discounted.offers = discounted.offers.map(o => ({...o, priceHt: o.priceHt * 0.9}));
    const intensive = structuredClone(s); intensive.market.consumptionPercent = 100;
    intensive.production.animationReusePercent = 0;
    intensive.profiles = intensive.profiles.map(p => ({...p, animations: p.photos}));
    const growth = structuredClone(s); growth.market.growthPercent = 10;
    growth.offers = growth.offers.map(o => ({...o, quantity: Math.min(100_000, o.quantity * 3)}));
    const variants: [string, string, PricingSimulationInput][] = [
      ['current', 'Scénario saisi', s], ['consumed', '100 % des crédits consommés', allUsed],
      ['intensive', 'Toutes les photos animées', intensive],
      ['suppliers', 'Fournisseurs et change défavorables', supplier],
      ['discount', 'Promotion de 10 %', discounted], ['growth', 'Volume × 3 et croissance de 10 %', growth],
    ];
    for (const [id, name, input] of variants) {
      const result = project(input), first = result.months[0], last = result.months.at(-1)!;
      const margins = result.months.flatMap(m => m.marginPercent === null ? [] : [m.marginPercent]);
      comparisons.push({id, name, firstProfit: first.profit, finalProfit: last.profit, cumulativeProfit: last.cumulativeProfit,
        cumulativeAfterExposureEur: last.cumulativeAfterExposureEur,
        minMargin: margins.length ? Math.min(...margins) : null, closingExposureEur: last.exposureEur,
        feasible: result.months.every(m => !m.voicePlan.exceeded && (m.voicePlan.commercial || m.voiceMinutes === 0) && m.capacityPercent <= 100)});
    }
  }
  return {...base, warnings, comparisons, runwayClipEur: s.production.runwayCreditsPerSecond * s.production.runwaySeconds * s.production.runwayUsdPerCredit * s.market.eurPerUsd};
}

export function pricingCsv(input: PricingSimulationInput, report = calculatePricing(input)) {
  const cell = (value: string | number | null) => {
    if (value === null) return '';
    if (typeof value === 'number') return Number.isFinite(value) ? String(Math.round(value * 1e6) / 1e6).replace('.', ',') : '';
    const safe = /^[\s]*[=+@-]/.test(value) ? "'" + value : value;
    return '"' + safe.replaceAll('"', '""') + '"';
  };
  const rows: (string | number | null)[][] = [
    ['Simulation BienVu', input.name], ['Tous les montants sont des prévisions en EUR HT ; les tarifs publics ne sont pas modifiés.'],
    ['USD vers EUR', input.market.eurPerUsd], ['TVA %', input.market.vatPercent], ['Objectif de marge %', input.market.targetMargin],
    ['Consommation mensuelle %', input.market.consumptionPercent], ['Mois de stockage provisionnés par crédit', report.holdingMonths], [],
    ['Offre', 'Type', 'Crédits avec bonus', 'Prix HT', 'Prix TTC', 'Prix par crédit', 'Production à consommation intégrale', 'Frais partagés', 'Paiement', 'Marge EUR', 'Marge %', 'Prix cible HT', 'Remise maximale %'],
    ...report.offers.map(o => [o.name, o.kind, o.credits, o.priceHt, o.priceTtc, o.pricePerCredit, o.productionEur, o.sharedEur, o.paymentFees, o.profit, o.marginPercent, o.minimumPriceHt, o.maxDiscountPercent]), [],
    ['Mois', 'Recettes HT après pertes', 'TVA estimée', 'Frais paiement', 'Runway', 'Texte', 'Voix', 'Calcul Cloudflare', 'Navigateur import', 'R2 stockage', 'R2 opérations', 'Workers', 'Support', 'Autres coûts', 'Fixes', 'Coût total', 'Résultat', 'Marge %', 'Stock Go', 'Crédits recharge en attente', 'Exposition coût futur', 'Résultat cumulé', 'Cumul après provision indicative des crédits'],
    ...report.months.map(m => [m.month, m.revenueHt, m.vat, m.paymentFees, m.costs.runway, m.costs.text, m.costs.voice, m.costs.compute, m.costs.browser, m.costs.storage, m.costs.operations, m.costs.workers, m.costs.support, m.costs.other, m.fixedEur, m.totalCosts, m.profit, m.marginPercent, m.storedGB, m.unusedPackCredits, m.exposureEur, m.cumulativeProfit, m.cumulativeAfterExposureEur]), [],
    ['Sensibilité', 'Résultat mois 1', 'Résultat dernier mois', 'Résultat cumulé', 'Cumul après provision indicative des crédits', 'Marge minimale %', 'Coût futur des crédits en attente', 'Capacité compatible'],
    ...report.comparisons.map(c => [c.name, c.firstProfit, c.finalProfit, c.cumulativeProfit, c.cumulativeAfterExposureEur, c.minMargin, c.closingExposureEur, c.feasible ? 'Oui' : 'À adapter']), [],
    ['Hypothèses complètes', JSON.stringify(input)],
  ];
  return '\uFEFF' + rows.map(row => row.map(cell).join(';')).join('\r\n');
}
