import {test} from 'node:test';
import assert from 'node:assert/strict';
import {defaultPricingSimulation, PricingSimulationInput, PricingSimulationAction, creditPacks, creditPlans} from '../packages/contracts/src/index';
import {calculatePricing, pricingPreset, pricingCsv} from '../apps/web/lib/pricing-calculator';

const close = (actual: number, expected: number, message?: string) => assert.ok(Math.abs(actual - expected) < 1e-8, `${message ?? 'Montant'} : ${actual} ≠ ${expected}`);
function isolated() {
  const s = defaultPricingSimulation();
  Object.assign(s.market, {vatPercent: 0, refundsPercent: 0, disputesPercent: 0, paymentPercent: 0,
    paymentFixedEur: 0, subscriptionFeePercent: 0, freeVideosMonthly: 0, horizonMonths: 3});
  Object.assign(s.production, {textEurPerVideo: 0, voiceMode: 'per_video', voiceEurPerVideo: 0,
    importsPerVideo: 0, outputMB: 0, photoMB: 0, animationMB: 0, voiceMB: 0,
    writesPerVideo: 0, readsPerVideo: 0, workerRequestsPerVideo: 0, workerCpuMsPerVideo: 0});
  Object.assign(s.cloudflare, {fixedMonthlyUsd: 0, cpuUsdPerSecond: 0, memoryUsdPerGiBSecond: 0,
    diskUsdPerGBSecond: 0, storageUsdPerGBMonth: 0, writeUsdPerMillion: 0, readUsdPerMillion: 0,
    workerUsdPerMillionRequests: 0, workerUsdPerMillionCpuMs: 0});
  s.profiles = [{...s.profiles[0], share: 100, voice: false}];
  s.offers = [{id: 'pack', name: 'Recharge', kind: 'pack', credits: 100, bonusCredits: 0,
    priceHt: 50, quantity: 1, enabled: true, referenceCode: null}];
  return s;
}

test('Tarifs de départ : le catalogue réellement proposé est la référence de la simulation', () => {
  const s = defaultPricingSimulation(), report = calculatePricing(s);
  assert.equal(s.offers.length, creditPacks.length + creditPlans.filter(p => p.price > 0).length);
  for (const pack of creditPacks) assert.equal(report.offers.find(o => o.id === pack.code)!.currentPriceHt, pack.priceCents / 100);
  for (const plan of creditPlans.filter(p => p.price > 0)) assert.equal(report.offers.find(o => o.id === plan.code)!.priceHt, plan.price);
  assert.equal(report.comparisons.length, 6);
  close(report.runwayClipEur, 0.25);
  assert.ok(report.warnings.some(w => w.code === 'FX_ASSUMPTION'));
});

test('Une vidéo avec quatre nouvelles animations de cinq secondes coûte 1 USD et consomme cinq crédits BienVu', () => {
  const s = isolated(); s.profiles[0].animations = 4;
  const report = calculatePricing(s);
  close(report.averageCreditsPerVideo, 5); close(report.averageGrossVideoEur, 1);
  close(report.grossEurPerCredit, 0.2); close(report.months[0].paidVideos, 20);
  close(report.months[0].costs.runway, 20);
  s.market.eurPerUsd = 0.9; close(calculatePricing(s).grossEurPerCredit, 0.18);
  s.production.extraAnimationAttemptsPercent = 20; close(calculatePricing(s).grossEurPerCredit, 0.216);
});

test('La réutilisation réduit à la fois les clips facturés et les crédits BienVu, sans supprimer les médias utilisés', () => {
  const s = isolated(); s.profiles[0].animations = 4; s.production.animationMB = 5;
  s.production.animationReusePercent = 100;
  const report = calculatePricing(s);
  close(report.averageCreditsPerVideo, 1); close(report.averageGrossVideoEur, 0);
  close(report.months[0].newAnimations, 0); close(report.months[0].storedGB, 2);
  s.production.animationReusePercent = 50;
  const half = calculatePricing(s); close(half.averageCreditsPerVideo, 3); close(half.averageGrossVideoEur, 0.5);
});

test('Les frais Stripe portent sur le TTC, Billing ne porte que sur les abonnements, et la TVA ne devient pas une recette', () => {
  const s = isolated(); Object.assign(s.market, {vatPercent: 20, paymentPercent: 1.5, paymentFixedEur: 0.25, subscriptionFeePercent: 0.7});
  Object.assign(s.offers[0], {credits: 30, priceHt: 19}); s.production.otherEurPerVideo = 0.2;
  const report = calculatePricing(s), offer = report.offers[0], month = report.months[0];
  close(offer.productionEur, 6); close(offer.priceTtc, 22.8); close(offer.paymentFees, 0.592);
  close(month.revenueHt, 19); close(month.receivedTtc, 22.8); close(month.vat, 3.8);
  close(offer.profit, 12.408);
  s.offers[0].kind = 'subscription'; close(calculatePricing(s).offers[0].paymentFees, 0.7516);
});

test('Le prix cible garantit la marge demandée après frais, pertes et production intégrale', () => {
  const s = isolated(); Object.assign(s.market, {vatPercent: 20, paymentPercent: 1.5, paymentFixedEur: 0.25, targetMargin: 70});
  Object.assign(s.offers[0], {credits: 30, priceHt: 19}); s.production.otherEurPerVideo = 0.2;
  let report = calculatePricing(s); assert.equal(report.offers[0].minimumPriceHt, 22.17);
  s.offers[0].priceHt = 22.17;
  assert.ok(calculatePricing(s).offers[0].marginPercent! >= 70);
  s.offers[0].priceHt = 22.16; assert.ok(calculatePricing(s).offers[0].marginPercent! < 70);
  s.market.refundsPercent = 20; s.offers[0].priceHt = 19;
  report = calculatePricing(s); close(report.offers[0].revenueHt, 15.2);
  close(report.offers[0].paymentFees, 0.592); close(report.offers[0].productionEur, 6);
  assert.equal(report.offers[0].minimumPriceHt, 28.16);
  s.market.disputesPercent = 10; s.market.disputeFeeEur = 20;
  close(calculatePricing(s).offers[0].paymentFees, 2.592);
});

test('Bonus, remises et frais fixes restent à financer même avec un faible prix au crédit', () => {
  const s = isolated(); Object.assign(s.offers[0], {credits: 10, priceHt: 10});
  s.production.otherEurPerVideo = 0.1; s.market.otherFixedMonthlyEur = 5;
  const single = calculatePricing(s).offers[0]; close(single.sharedEur, 5); close(single.productionEur, 1);
  s.offers[0].quantity = 10;
  const volume = calculatePricing(s).offers[0]; close(volume.sharedEur, 0.5);
  assert.ok(volume.minimumPriceHt! < single.minimumPriceHt!);
  s.offers[0].bonusCredits = 10;
  const bonus = calculatePricing(s).offers[0]; close(bonus.productionEur, 2); close(bonus.pricePerCredit, 0.5);
  assert.ok(bonus.minimumPriceHt! > volume.minimumPriceHt!);
  assert.ok(bonus.maxDiscountPercent! > 0);
  const discount = bonus.maxDiscountPercent!;
  s.offers[0].priceHt *= 1 - discount / 100;
  assert.ok(calculatePricing(s).offers[0].marginPercent! >= s.market.targetMargin - 1e-6);
});

test('Les recharges inutilisées se reportent, les allocations mensuelles expirent, et une dette initiale n’apporte pas de nouvelles recettes', () => {
  const s = isolated(); s.market.consumptionPercent = 50; s.production.otherEurPerVideo = 0.1;
  const report = calculatePricing(s);
  assert.deepEqual(report.months.map(m => m.consumedCredits), [50, 75, 87.5]);
  assert.deepEqual(report.months.map(m => m.unusedPackCredits), [50, 75, 87.5]);
  close(report.months[2].exposureEur, 8.75);
  close(report.months[2].cumulativeAfterExposureEur, 120, 'La provision des crédits restants rétablit le coût de tous les crédits vendus.');
  assert.equal(report.offers[0].productionEur, 10, 'La rentabilité unitaire provisionne tous les crédits, pas seulement les crédits consommés ce mois-ci.');
  s.offers[0].kind = 'subscription';
  assert.deepEqual(calculatePricing(s).months.map(m => m.consumedCredits), [50, 50, 50]);
  assert.ok(calculatePricing(s).months.every(m => m.unusedPackCredits === 0));
  s.offers[0].quantity = 0; s.market.initialUnusedPackCredits = 100;
  const debt = calculatePricing(s); close(debt.months[0].revenueHt, 0); close(debt.months[0].profit, -5);
  assert.equal(debt.offers[0].minimumPriceHt, null); close(debt.months[0].exposureEur, 5);
});

test('Le calcul Cloudflare déduit les quotas une seule fois du volume mensuel, selon les ressources allouées', () => {
  const s = isolated(); Object.assign(s.offers[0], {credits: 1000});
  const c = defaultPricingSimulation().cloudflare;
  Object.assign(s.cloudflare, {cpuUsdPerSecond: c.cpuUsdPerSecond, memoryUsdPerGiBSecond: c.memoryUsdPerGiBSecond, diskUsdPerGBSecond: c.diskUsdPerGBSecond});
  const report = calculatePricing(s);
  // 1 000 rendus : 120 000 secondes CPU, 900 000 GiB-s RAM et 1 800 000 Go-s disque.
  close(report.months[0].costs.compute, 4.0506);
  close(report.profiles[0].parts.compute, 0.004776);
  s.offers[0].credits = 100; close(calculatePricing(s).months[0].costs.compute, 0);
  s.offers[0].credits = 101; close(calculatePricing(s).months[0].costs.compute, 0.00225);
  s.cloudflare.quotaAvailablePercent = 0;
  close(calculatePricing(s).months[0].costs.compute, 101 * 0.004776);
  s.production.extraRenderPercent = 100;
  close(calculatePricing(s).months[0].costs.compute, 202 * 0.004776);
});

test('Les imports et la carte contribuent au calcul ; le support et les reprises voix ne sont pas oubliés', () => {
  const s = isolated(); s.offers[0].credits = 1; s.cloudflare.quotaAvailablePercent = 0;
  s.cloudflare.cpuUsdPerSecond = 0.000020; s.cloudflare.memoryUsdPerGiBSecond = 0.0000025; s.cloudflare.diskUsdPerGBSecond = 0.00000007;
  s.profiles[0].map = true; s.production.importsPerVideo = 1;
  const report = calculatePricing(s);
  close(report.months[0].costs.compute, 0.004776 + 30 * (0.000020 + 6 * 0.0000025 + 12 * 0.00000007) + 2 * 0.000020 + 38 * 0.0000025 + 152 * 0.00000007);
  s.profiles[0].voice = true; s.production.voiceEurPerVideo = 0.1; s.production.voiceExtraPercent = 50;
  s.market.supportMinutesPerVideo = 6; s.market.supportHourlyEur = 20;
  const support = calculatePricing(s).months[0]; close(support.costs.voice, 0.15); close(support.costs.support, 2);
});

test('R2 : stockage et opérations sont arrondis aux unités facturées après le gratuit', () => {
  const s = isolated(); const rates = defaultPricingSimulation().cloudflare;
  Object.assign(s.cloudflare, {storageUsdPerGBMonth: rates.storageUsdPerGBMonth, writeUsdPerMillion: rates.writeUsdPerMillion, readUsdPerMillion: rates.readUsdPerMillion});
  for (const [gb, eur] of [[5, 0], [10.1, 0.015], [50, 0.6], [500, 7.35]]) {
    s.market.initialStorageGB = gb; close(calculatePricing(s).months[0].costs.storage, eur);
  }
  s.offers[0].credits = 1000; s.production.writesPerVideo = 1000.001; s.production.readsPerVideo = 10000.001;
  close(calculatePricing(s).months[0].costs.operations, 4.86);
  s.production.writesPerVideo = 1000; s.production.readsPerVideo = 10000;
  close(calculatePricing(s).months[0].costs.operations, 0);
});

test('Le stockage permanent s’accumule et les vidéos gratuites n’occupent pas un mois entier', () => {
  const s = isolated(); s.offers[0].credits = 10; s.production.outputMB = 1000;
  const retained = calculatePricing(s); assert.deepEqual(retained.months.map(m => m.storedGB), [10, 20, 30]);
  assert.equal(retained.holdingMonths, 3);
  s.market.storageRetentionMonths = 1;
  assert.deepEqual(calculatePricing(s).months.map(m => m.storedGB), [10, 10, 10]);
  s.market.freeVideosMonthly = 30; s.market.freeRetentionDays = 1;
  assert.deepEqual(calculatePricing(s).months.map(m => m.storedGB), [11, 11, 11]);
  s.market.storageRetentionMonths = 24; s.cloudflare.storageUsdPerGBMonth = 0.015;
  const long = calculatePricing(s); assert.equal(long.holdingMonths, 24); close(long.grossEurPerCredit, 0.36);
});

test('Cartesia : les paliers mensuels, limites et licence commerciale sont visibles, le Free ne définit pas un coût prudent nul', () => {
  const s = isolated(); s.profiles[0].voice = true; s.production.voiceMode = 'cartesia_plan';
  for (const [videos, plan, price] of [[399, 'Cartesia Pro', 5], [400, 'Cartesia Startup', 49], [5002, 'Cartesia Scale', 299]] as const) {
    s.offers[0].credits = videos;
    const m = calculatePricing(s).months[0]; assert.equal(m.voicePlan.name, plan); close(m.costs.voice, price);
  }
  s.production.cartesiaPlan = 'free'; s.offers[0].credits = 100;
  const free = calculatePricing(s); assert.ok(free.grossEurPerCredit > 0); close(free.months[0].costs.voice, 0);
  assert.ok(free.warnings.some(w => w.code === 'VOICE_LICENSE'));
  assert.ok(free.warnings.some(w => w.code === 'VOICE_CAPACITY'));
  s.production.cartesiaPlan = 'custom'; s.production.voiceCustomMinutes = 0;
  const custom = calculatePricing(s); assert.ok(Number.isFinite(custom.grossEurPerCredit));
  assert.ok(custom.warnings.some(w => w.code === 'VOICE_CAPACITY'));
});

test('Une prévision irréalisable signale la capacité et un objectif inaccessible plutôt que de calculer un faux prix cible', () => {
  const s = isolated(); s.offers[0].quantity = 1000; s.market.targetMargin = 99; s.market.paymentPercent = 20;
  const report = calculatePricing(s); assert.equal(report.offers[0].minimumPriceHt, null);
  assert.ok(report.warnings.some(w => w.code === 'UNREACHABLE_MARGIN'));
  assert.ok(report.warnings.some(w => w.code === 'RENDER_CAPACITY'));
  assert.ok(report.comparisons.some(c => !c.feasible));
  const visit = (value: unknown): void => {if (typeof value === 'number') assert.ok(Number.isFinite(value));
    else if (Array.isArray(value)) value.forEach(visit); else if (value && typeof value === 'object') Object.values(value).forEach(visit);};
  visit(report);
  s.offers[0].quantity = 0; s.offers[0].priceHt = 0;
  const empty = calculatePricing(s); visit(empty); assert.equal(empty.months[0].marginPercent, null);
  assert.equal(empty.breakEvenOrders, null);
});

test('Les paramètres incohérents, doublons et propriétés imprévues sont refusés avant tout calcul ou sauvegarde', () => {
  const s = isolated();
  for (const mutate of [
    (s: PricingSimulationInput) => {s.profiles[0].share = 90;},
    (s: PricingSimulationInput) => {s.profiles[0].animations = 7;},
    (s: PricingSimulationInput) => {s.offers.push({...s.offers[0]});},
    (s: PricingSimulationInput) => {s.market.refundsPercent = 60; s.market.disputesPercent = 50;},
    (s: PricingSimulationInput) => {s.market.eurPerUsd = NaN;},
    (s: PricingSimulationInput) => {s.production.importUptimeSeconds = 1; s.production.importCpuSeconds = 30;},
  ]) {const invalid = structuredClone(s); mutate(invalid); assert.equal(PricingSimulationInput.safeParse(invalid).success, false);}
  assert.equal(PricingSimulationInput.safeParse({...s, unexpected: true}).success, false);
  assert.equal(PricingSimulationAction.safeParse({action: 'save', id: null, revision: 1, input: s}).success, false);
  assert.equal(PricingSimulationAction.safeParse({action: 'save', id: crypto.randomUUID(), revision: null, input: s}).success, false);
});

test('Les comparaisons sont pures, le cas intensif garde les durées et les poids, et le profil courant restaure sa répartition', () => {
  const s = defaultPricingSimulation(), before = JSON.stringify(s), report = calculatePricing(s);
  assert.equal(JSON.stringify(s), before);
  const intensive = pricingPreset(s, 'intensive');
  assert.deepEqual(intensive.profiles.map(p => p.share), [60, 30, 10]);
  assert.ok(intensive.profiles.every(p => p.animations === p.photos));
  assert.deepEqual(intensive.profiles.map(p => p.durationSeconds), s.profiles.map(p => p.durationSeconds));
  close(report.comparisons.find(c => c.id === 'intensive')!.firstProfit, calculatePricing(intensive, false).months[0].profit);
  assert.deepEqual(pricingPreset(intensive, 'current').profiles, s.profiles);
  s.market.horizonMonths = 36; s.market.growthPercent = 0; s.offers = [{...s.offers[0], credits: 100000, quantity: 5000}];
  assert.doesNotThrow(() => calculatePricing(s), 'Les comparaisons internes peuvent dépasser le plafond de saisie sans planter un scénario valide.');
});

test('Les exports gardent les hypothèses et les montants négatifs, tout en neutralisant les formules CSV injectées', () => {
  const s = isolated(); s.name = '=HYPERLINK("https://example.com")'; s.offers[0].name = ' +SUM(1,2)';
  s.production.otherEurPerVideo = 1;
  const csv = pricingCsv(s);
  assert.ok(csv.startsWith('\uFEFF')); assert.ok(csv.includes('"\'=HYPERLINK(""https://example.com"")"'));
  assert.ok(csv.includes('"\'+SUM(1,2)"')); assert.ok(csv.includes('-50'));
  assert.ok(csv.includes('Hypothèses complètes'));
  assert.deepEqual(PricingSimulationInput.parse(JSON.parse(JSON.stringify(s))), PricingSimulationInput.parse(s));
});
