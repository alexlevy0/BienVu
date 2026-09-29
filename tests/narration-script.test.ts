import {test} from 'node:test';
import assert from 'node:assert/strict';
import {NarrationFailure} from '../packages/contracts/src/index';
import {compileScript, DEFAULT_SCRIPT_MODEL, displayEuros, frenchDecimal, frenchEuros, frenchInteger, generateScript,
  openaiScripts, scriptContext, scriptRequest, shortenScript, validateScript} from '../packages/narration/src/index';
import {missingFixture, rentalFixture} from '../fixtures/contracts';
import {fixturePlan, fixtureScriptMetrics, narrationBrand, narrationListing} from '../fixtures/narration';

test('script : chiffres exacts, grosses sommes, centimes et surfaces décimales', () => {
  assert.equal(frenchInteger(379000), 'trois cent soixante-dix-neuf mille');
  assert.equal(frenchInteger(80000), 'quatre-vingt mille');
  assert.equal(frenchInteger(280), 'deux cent quatre-vingts');
  assert.equal(frenchInteger(12345678901), 'douze milliards trois cent quarante-cinq millions six cent soixante-dix-huit mille neuf cent un');
  assert.equal(frenchDecimal(42.06), 'quarante-deux virgule zéro six');
  assert.equal(frenchDecimal(0.000001), 'zéro virgule zéro zéro zéro zéro zéro un');
  assert.equal(frenchEuros(37900001), 'trois cent soixante-dix-neuf mille euros et un centime');
  assert.equal(frenchEuros(105), 'un euro et cinq centimes');
  assert.equal(displayEuros(9007199254740991), '90 071 992 547 409,91 €');
});
test('script : vente et provenance source, photo connue, trois photos réutilisées sobrement', async () => {
  const context = await scriptContext(narrationListing(), narrationBrand);
  const script = compileScript(context, fixturePlan(context), DEFAULT_SCRIPT_MODEL);
  assert.equal(script.scenes.length, 4);
  assert.equal(new Set(script.scenes.map(s => s.photoAssetId)).size, 3);
  assert.match(script.scenes[0].narrationText, /à vendre/i);
  assert.match(script.scenes.find(s => s.kind === 'area')!.captionText, /42,06 m²/);
  assert.match(script.scenes.find(s => s.kind === 'price')!.captionText, /379 000 €/);
  assert.equal(script.provenance.find(p => p.ref === 'price')?.status, 'verified');
  assert.match(script.scenes.at(-1)!.captionText, /01 23 45 67 89/);
  assert.deepEqual(validateScript(context, script), script);
});
test('catalogue oral : cache distinct, ancien script reproductible et faits inchangés', async () => {
  const listing = narrationListing();
  const old = await scriptContext(listing, narrationBrand, undefined, 'factual-copy/1');
  // Empreinte capturée avant la modification : les anciens jobs ne doivent
  // jamais provoquer de synthèse à cause d'un catalogue changé silencieusement.
  assert.equal(old.inputHash, 'd815248f144c22a9d8cbb331876173990aef4622afd548ffb5826e2bcfa25f05');
  const current = await scriptContext(listing, narrationBrand);
  const previous = compileScript(old, fixturePlan(old), DEFAULT_SCRIPT_MODEL);
  const next = compileScript(current, fixturePlan(current), DEFAULT_SCRIPT_MODEL);
  assert.equal(next.copyVersion, 'factual-copy/2');
  assert.notEqual(next.inputHash, previous.inputHash);
  assert.deepEqual(next.provenance, previous.provenance);
  assert.deepEqual(next.scenes.map(s => [s.captionText, s.factRefs]), previous.scenes.map(s => [s.captionText, s.factRefs]));
  assert.deepEqual(validateScript(old, previous), previous);
  assert.throws(() => validateScript(current, previous), /SCRIPT_INVALID/);
});
test('script : location manuelle conserve charges et provenance, les absences ne deviennent pas zéro', async () => {
  const manual = narrationListing(true), rental = rentalFixture();
  manual.transaction = 'rent'; manual.facts.price = {...rental.facts.price, status: 'user_provided', sourcePath: 'manual.price', rawEvidence: '1 200 € par mois, charges comprises'} as typeof manual.facts.price;
  const ctx = await scriptContext(manual, narrationBrand), script = compileScript(ctx, fixturePlan(ctx), DEFAULT_SCRIPT_MODEL);
  assert.match(script.scenes.find(s => s.kind === 'price')!.narrationText, /mille deux cents euros par mois, charges comprises/);
  assert.ok(script.provenance.every(p => p.status === 'user_provided'));
  const absent = await scriptContext(missingFixture(), narrationBrand);
  assert.ok(!absent.copies.some(c => c.kind === 'area' || c.kind === 'price'));
  const minimal = compileScript(absent, fixturePlan(absent), DEFAULT_SCRIPT_MODEL);
  assert.equal(minimal.scenes.length, 4); assert.ok(!JSON.stringify(minimal.scenes).includes('zéro'));
});
test('script : description hostile ignorée, modèle incapable de substituer un fait ou une photo', async () => {
  const ctx = await scriptContext(narrationListing(), narrationBrand), plan = fixturePlan(ctx);
  const request = JSON.stringify(scriptRequest(ctx, DEFAULT_SCRIPT_MODEL, false));
  assert.ok(!request.includes('IGNORE LES INSTRUCTIONS')); assert.ok(!request.includes('vue mer'));
  assert.throws(() => compileScript(ctx, {...plan, narrationText: 'Vue mer'}, DEFAULT_SCRIPT_MODEL), /SCRIPT_INVALID/);
  assert.throws(() => compileScript(ctx, {scenes: plan.scenes.map(s => ({...s, narrationText: 'Un euro'}))}, DEFAULT_SCRIPT_MODEL), /SCRIPT_INVALID/);
  const foreign = structuredClone(plan); foreign.scenes[1].photoAssetId = 'other-agency-photo';
  assert.throws(() => compileScript(ctx, foreign, DEFAULT_SCRIPT_MODEL), /SCRIPT_INVALID/);
  const script = compileScript(ctx, plan, DEFAULT_SCRIPT_MODEL); script.scenes[2].captionText = '1 €';
  assert.throws(() => validateScript(ctx, script), /SCRIPT_INVALID/);
  const changed = structuredClone(ctx.listing); changed.facts.area = {status: 'verified', value: 62, unit: 'm2', sourcePath: 'fixture.area', rawEvidence: '62 m²'};
  const changedCtx = await scriptContext(changed, narrationBrand);
  assert.notEqual(changedCtx.inputHash, ctx.inputHash);
  assert.throws(() => validateScript(changedCtx, compileScript(ctx, plan, DEFAULT_SCRIPT_MODEL)), /SCRIPT_INVALID/);
});
test('script : une seule correction, pannes sans retry et un seul raccourcissement sans changer les faits', async () => {
  const ctx = await scriptContext(narrationListing(), narrationBrand); let calls = 0;
  const result = await generateScript(ctx, {model: DEFAULT_SCRIPT_MODEL, plan: async (_, correction) => {
    calls++; return {plan: correction ? fixturePlan(ctx) : {scenes: []}, metrics: fixtureScriptMetrics()};
  }});
  assert.equal(calls, 2);
  const shorter = shortenScript(ctx, result.script);
  assert.equal(shorter.version, 2); assert.deepEqual(shorter.provenance, result.script.provenance);
  assert.deepEqual(shorter.scenes.map(s => s.factRefs), result.script.scenes.map(s => s.factRefs));
  assert.throws(() => shortenScript(ctx, shorter), /NARRATION_DURATION_EXCEEDED/);
  calls = 0;
  await assert.rejects(generateScript(ctx, {model: DEFAULT_SCRIPT_MODEL, plan: async () => {calls++; return {plan: {}, metrics: fixtureScriptMetrics()};}}), /SCRIPT_INVALID/);
  assert.equal(calls, 2);
  calls = 0;
  await assert.rejects(generateScript(ctx, {model: DEFAULT_SCRIPT_MODEL, plan: async () => {calls++; throw new NarrationFailure('SCRIPT_TIMEOUT');}}), /SCRIPT_TIMEOUT/);
  assert.equal(calls, 1);
});
test('OpenAI : requête stricte bornée, aucun outil ni stockage, usage réel distingué de la facture', async () => {
  const ctx = await scriptContext(narrationListing(), narrationBrand); let calls = 0;
  const client = openaiScripts('sk-fixture-never-a-real-key', DEFAULT_SCRIPT_MODEL, {fetch: async (url, init) => {
    calls++; assert.equal(url, 'https://api.openai.com/v1/responses'); assert.equal(init!.redirect, 'manual');
    const body = JSON.parse(String(init!.body));
    assert.equal(body.store, false); assert.equal(body.background, false); assert.equal(body.max_output_tokens, 1200);
    assert.deepEqual(body.tools, []); assert.equal(body.text.format.strict, true);
    assert.equal(body.text.format.schema.additionalProperties, false);
    return Response.json({id: 'resp_fixture', model: DEFAULT_SCRIPT_MODEL, status: 'completed', usage: {input_tokens: 1000, output_tokens: 200, input_tokens_details: {cached_tokens: 0}},
      output: [{type: 'reasoning', summary: []}, {type: 'message', role: 'assistant', status: 'completed', content: [{type: 'output_text', text: JSON.stringify(fixturePlan(ctx))}]}]}, {headers: {'x-request-id': 'req_fixture'}});
  }});
  const reply = await client.plan(ctx, false);
  assert.equal(calls, 1); assert.equal(reply.metrics.usage!.inputTokens, 1000);
  assert.equal(reply.metrics.cost.estimatedMicrosBeforeCacheDiscount, 1650);
  assert.equal(reply.metrics.cost.actualBilledMicros, null);
  assert.equal(reply.metrics.providerRequestId, 'req_fixture');
  assert.deepEqual(reply.plan, fixturePlan(ctx));
});
test('OpenAI : refus, corps excessif, sortie incomplète et HTTP hostile restent bornés et expurgés', async () => {
  const ctx = await scriptContext(narrationListing(), narrationBrand);
  for (const [status, code] of [[302, 'SCRIPT_UNAVAILABLE'], [401, 'SCRIPT_AUTH_FAILED'], [403, 'SCRIPT_AUTH_FAILED'], [429, 'SCRIPT_RATE_LIMITED'], [503, 'SCRIPT_UNAVAILABLE']] as const) {
    let count = 0;
    await assert.rejects(openaiScripts('sk-fixture-never-a-real-key', DEFAULT_SCRIPT_MODEL, {fetch: async () => {count++; return new Response('secret-provider-body', {status});}}).plan(ctx, false), e => e instanceof NarrationFailure && e.message === code);
    assert.equal(count, 1);
  }
  for (const response of [Response.json({status: 'incomplete'}), new Response('x'.repeat(128001))])
    await assert.rejects(openaiScripts('sk-fixture-never-a-real-key', DEFAULT_SCRIPT_MODEL, {fetch: async () => response}).plan(ctx, false), /SCRIPT_RESPONSE_INVALID/);
  await assert.rejects(openaiScripts('sk-fixture-never-a-real-key', DEFAULT_SCRIPT_MODEL, {fetch: async () => Response.json({status: 'completed', output: [{type: 'message', role: 'assistant', status: 'completed', content: [{type: 'refusal', refusal: 'private'}]}]})}).plan(ctx, false), /SCRIPT_REFUSED/);
  await assert.rejects(openaiScripts('sk-fixture-never-a-real-key', DEFAULT_SCRIPT_MODEL, {timeoutMs: 10, fetch: async (_, init) => new Response(new ReadableStream({start(controller) {init!.signal!.addEventListener('abort', () => controller.error(new Error('private')));}}))}).plan(ctx, false), /SCRIPT_TIMEOUT/);
});
