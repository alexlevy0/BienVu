import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Miniflare, convertV4MiniflareOptions } from 'miniflare';
import { GoogleVoiceConfig, quantityCompletenessCheck } from '../packages/contracts/src/index';
import {
  descriptionPassages,
  suggestedNarration,
  scriptContext,
  compileScript,
  filledNarrationPlan,
  validateScript,
  narrationWordLimit,
  wordCount,
  hashJson,
  scriptPromptVersion,
  DEFAULT_SCRIPT_MODEL,
  DESCRIPTION_SEGMENTATION_VERSION,
  LEGACY_DESCRIPTION_SEGMENTATION_VERSION,
} from '../packages/narration/src/index';
import { narrationListing, narrationBrand, fixturePlan, fixtureScriptMetrics } from '../fixtures/narration';
import { rochellePropertyDescription } from '../fixtures/listing-description';
import { toneFixture } from '../fixtures/voice';
import { googleTts } from '../packages/voice/src/index';
import { migrateNarrationProbe, seedNarrationFixture } from '../scripts/narration-fixtures';
import { admitGeneration, findNarration, startNarration, releaseNarration } from '../packages/db/src/index';
import { prepareJobNarration } from '../apps/pipeline/src/narration';

const rochelleListing = () => {
  const listing = narrationListing(true);
  listing.facts.locality = {
    status: 'user_provided',
    value: 'La Rochelle',
    unit: 'text',
    sourcePath: 'manual.locality',
    rawEvidence: 'La Rochelle',
  };
  listing.facts.area = { status: 'missing', value: null, unit: 'm2', sourcePath: null, rawEvidence: null };
  listing.facts.rooms = { status: 'missing', value: null, unit: 'rooms', sourcePath: null, rawEvidence: null };
  listing.facts.price = {
    status: 'user_provided',
    unit: 'EUR_cent',
    sourcePath: 'manual.price',
    rawEvidence: '2 060 000 €',
    value: { amountCents: 206000000, currency: 'EUR', period: 'total', charges: 'not_applicable' },
  };
  listing.description = { text: rochellePropertyDescription, sourcePath: 'manual.description', truncated: false };
  return listing;
};
const assertComplete = (text: string) => {
  assert.doesNotMatch(text, /arborée de 133\b|(?:^|[.!?])\s*(?:Dédié aux espaces|Ouvrant directement)/u);
  assert.equal(quantityCompletenessCheck(text).status === 'fail', false);
};

test('description : virgules décimales, points décimaux et séparateurs de milliers ne créent aucun morceau numérique', () => {
  for (const area of ['133,50', '133.50', '1 133,50', '1\u202f133,50', '20,55', '159,20']) {
    const description = `Une terrasse privative et arborée de ${area} m². Le jardin est au calme.`;
    for (const expanded of [false, true]) {
      const passages = descriptionPassages(description, expanded);
      assert.deepEqual(
        passages.map((p) => p.narrationText),
        ['Le jardin est au calme.'],
      );
    }
  }
});

test('description : appositions et participes restent avec leur sujet, les clauses autonomes restent utilisables', () => {
  const source =
    'Le premier niveau, dédié aux espaces de vie et aux chambres, accueille un séjour lumineux. Une cuisine équipée, ouvrant sur le jardin, permet de profiter de la vue. Une terrasse au calme, un jardin arboré et une piscine.';
  const passages = descriptionPassages(source, true).map((p) => p.narrationText);
  assert.ok(
    passages.includes('Le premier niveau, dédié aux espaces de vie et aux chambres, accueille un séjour lumineux.'),
  );
  assert.ok(passages.includes('Une cuisine équipée, ouvrant sur le jardin, permet de profiter de la vue.'));
  assert.ok(passages.includes('Vous trouverez une terrasse au calme.'));
  assert.ok(passages.includes('Vous trouverez un jardin arboré et une piscine.'));
  assert.deepEqual(
    descriptionPassages(
      'Dédié aux espaces de vie et aux chambres. Ouvrant directement sur une terrasse. Idéale pour une cuisine d’été.',
      true,
    ),
    [],
  );
  assertComplete(passages.join(' '));
});

test('description : conditions, suppléments, négations et aménagement possible ne sont pas détachés', () => {
  const text = descriptionPassages(
    "Une cave et un garage, en supplément. La terrasse est sans vis-à-vis, sous réserve de travaux à prévoir. Une cuisine pouvant s'ouvrir sur le séjour, avec des rangements.",
    true,
  )
    .map((p) => p.narrationText)
    .join(' ');
  assert.match(text, /garage, en supplément/);
  assert.match(text, /sans vis-à-vis, sous réserve de travaux à prévoir/);
  assert.match(text, /pouvant s'ouvrir sur le séjour, avec des rangements/);
});

test('description : une quantité déjà tronquée dans la saisie ne reçoit jamais une unité inventée', () => {
  for (const text of ['Une terrasse arborée de 133.', 'Une loggia de 20,55.', 'Son prix de 200 000.']) {
    assert.deepEqual(descriptionPassages(text, true), []);
    assert.equal(quantityCompletenessCheck(text).status, 'fail');
  }
  for (const text of [
    'Une terrasse de 133,50 m².',
    'Une terrasse de 133.50 mètres carrés.',
    'Un loyer de 1 200 euros.',
    'Une maison de 3 pièces.',
  ])
    assert.notEqual(quantityCompletenessCheck(text).status, 'fail');
});

test('La Rochelle : suggestion et catalogue final restent complets à 20, 30 et 40 secondes', async () => {
  const listing = rochelleListing();
  assert.ok(descriptionPassages(rochellePropertyDescription, true).length > 0);
  for (const duration of [20, 30, 40] as const) {
    const suggestion = suggestedNarration(
      {
        propertyType: 'apartment',
        transaction: 'sale',
        locality: 'La Rochelle',
        priceCents: '2060000',
        area: '',
        rooms: '',
        description: rochellePropertyDescription,
      },
      'Lyon Immo',
      duration,
    );
    assertComplete(suggestion.join(' '));
    const context = await scriptContext(listing, narrationBrand, undefined, 'description-copy/2', undefined, duration);
    assert.equal(context.descriptionSegmentationVersion, DESCRIPTION_SEGMENTATION_VERSION);
    const script = compileScript(context, filledNarrationPlan(context, fixturePlan(context)), DEFAULT_SCRIPT_MODEL);
    assertComplete(script.scenes.map((s) => s.narrationText).join(' '));
    assert.ok(script.scenes.some((s) => s.factRefs.includes('description')));
    assert.ok(wordCount(script.scenes.map((s) => s.narrationText).join(' ')) <= narrationWordLimit(duration));
    assert.deepEqual(validateScript(context, script), script);
  }
});

test('compilation : une quantité incomplète est refusée avant la voix, une narration utilisateur reste prioritaire', async () => {
  const context = await scriptContext(
    rochelleListing(),
    narrationBrand,
    undefined,
    'description-copy/2',
    undefined,
    20,
  );
  const script = compileScript(context, filledNarrationPlan(context, fixturePlan(context)), DEFAULT_SCRIPT_MODEL);
  const plan = { scenes: script.scenes.map((s) => ({ copyId: s.copyId, photoAssetId: s.photoAssetId })) };
  context.copies.find((c) => c.id === plan.scenes[1].copyId)!.narrationText = 'Une terrasse arborée de 133.';
  assert.throws(() => compileScript(context, plan, DEFAULT_SCRIPT_MODEL), /SCRIPT_INVALID/);
  const custom = ['Mon introduction.', 'Le jardin est au calme.', 'La terrasse privative.', 'Ma conclusion.'];
  const user = await scriptContext(rochelleListing(), narrationBrand, undefined, 'description-copy/2', custom, 20);
  assert.deepEqual(
    user.copies.map((c) => c.narrationText),
    custom,
  );
});

test('pipeline : nouveau texte vocal sûr, version sauvegardée et anciennes reprises sans conflit de cache', async (t) => {
  const mf = new Miniflare(
    convertV4MiniflareOptions({
      modules: true,
      script: 'export default {fetch(){return new Response("fixture")}}',
      compatibilityDate: '2026-09-27',
      d1Databases: ['DB'],
      r2Buckets: ['MEDIA'],
    }),
  );
  t.after(() => mf.dispose());
  const env = await mf.getBindings<{ DB: D1Database; MEDIA: R2Bucket }>();
  await migrateNarrationProbe(env.DB);
  const scope = await seedNarrationFixture(env.DB, 'rochelle-boundaries'),
    listing = rochelleListing();
  listing.id = 'listing-rochelle-boundaries';
  listing.agencyId = scope.agencyId;
  for (const photo of listing.photos) {
    photo.agencyId = scope.agencyId;
    photo.listingId = listing.id;
    photo.objectKey = `agencies/${scope.agencyId}/imports/${listing.id}/${photo.id}.png`;
  }
  await env.DB.prepare('UPDATE listing_imports SET result_json=? WHERE id=?')
    .bind(JSON.stringify(listing), listing.id)
    .run();
  await env.DB.prepare("UPDATE jobs SET status='failed',error_code='FIXTURE',lease_until=NULL WHERE id=?")
    .bind(scope.jobId)
    .run();
  await env.DB.prepare('INSERT INTO hosted_import_budget(month,baseline_cents,ceiling_cents,paused) VALUES(?,0,9500,0)')
    .bind(new Date().toISOString().slice(0, 7))
    .run();
  await env.DB.exec('UPDATE generation_control SET enabled=1');
  await env.DB.prepare('INSERT INTO generation_access VALUES(?,?,1)')
    .bind(scope.agencyId, 'allocation-rochelle-boundaries')
    .run();
  await env.DB.prepare(
    "UPDATE allocations SET kind='paid',period_key='description-regression',quota_limit=2 WHERE agency_id=?",
  )
    .bind(scope.agencyId)
    .run();
  const config = GoogleVoiceConfig.parse({ projectId: 'fixture-rochelle-boundaries' }),
    spoken: string[] = [];
  const voice = googleTts(config, async () => 'fixture-token-never-sent', {
    fetch: async () => Response.json({ audioContent: Buffer.from(toneFixture(1000)).toString('base64') }),
  });
  let scripts = 0;
  const providers = {
    mode: 'mock' as const,
    script: {
      model: DEFAULT_SCRIPT_MODEL,
      plan: async (c: Parameters<typeof fixturePlan>[0]) => {
        scripts++;
        return { plan: fixturePlan(c), metrics: fixtureScriptMetrics() };
      },
    },
    voice: {
      config,
      synthesize: async (text: string) => {
        spoken.push(text);
        return voice.synthesize(text);
      },
    },
  };
  const admit = async (key: string) => {
    const job = await admitGeneration(
      env.DB,
      scope.agencyId,
      key,
      { listingId: listing.id, durationSeconds: 20 },
      'true',
    );
    await env.DB.prepare("UPDATE jobs SET status='scripting',stage='scripting',listing_id=? WHERE id=?")
      .bind(listing.id, job.jobId)
      .run();
    return job;
  };
  const fresh = await admit('rochelle-new-001');
  const prepared = await prepareJobNarration(env, scope.agencyId, fresh.jobId, providers);
  for (const text of spoken) assertComplete(text);
  const snapshot = JSON.parse((await findNarration(env.DB, scope.agencyId, fresh.jobId))!.snapshot);
  assert.equal(snapshot.descriptionSegmentationVersion, DESCRIPTION_SEGMENTATION_VERSION);
  const before = { voice: spoken.length, scripts };
  assert.deepEqual(await prepareJobNarration(env, scope.agencyId, fresh.jobId, providers), prepared);
  assert.deepEqual({ voice: spoken.length, scripts }, before);

  // Simulate a pre-fix run: the stored snapshot has no segmentation version.
  const previous = await admit('rochelle-legacy-001');
  const brand = { ...narrationBrand, id: scope.agencyId };
  const legacy = await scriptContext(
    listing,
    brand,
    undefined,
    'description-copy/2',
    undefined,
    20,
    LEGACY_DESCRIPTION_SEGMENTATION_VERSION,
  );
  const corrected = await scriptContext(listing, brand, undefined, 'description-copy/2', undefined, 20);
  assert.notEqual(legacy.inputHash, corrected.inputHash);
  assert.ok(legacy.copies.some((c) => c.narrationText.includes('arborée de 133.')));
  const configHash = await hashJson({
    voice: config,
    scriptModel: providers.script.model,
    promptVersion: scriptPromptVersion(legacy),
    mode: providers.mode,
    durationSeconds: 20,
  });
  const { lease } = await startNarration(env.DB, {
    agencyId: scope.agencyId,
    jobId: previous.jobId,
    inputHash: legacy.inputHash,
    configHash,
    snapshot: JSON.stringify({ listing, brand, contact: legacy.contact, copyVersion: legacy.copyVersion }),
    mode: 'mock',
    attempt: 1,
  });
  await releaseNarration(env.DB, lease);
  const resumed = await prepareJobNarration(env, scope.agencyId, previous.jobId, providers);
  assert.equal(resumed.script.inputHash, legacy.inputHash);
  const legacyBefore = { voice: spoken.length, scripts };
  assert.deepEqual(await prepareJobNarration(env, scope.agencyId, previous.jobId, providers), resumed);
  assert.deepEqual({ voice: spoken.length, scripts }, legacyBefore);
});
