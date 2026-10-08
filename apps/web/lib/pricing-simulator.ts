import {z} from 'zod';
import {PricingSimulationInput, PricingSimulationAction, defaultPricingSimulation, pricingSimulationSources,
  creditPacks, creditPlans, type PricingSavedScenario} from '@bienvu/contracts';
import {requireAdmin} from './admin-access';
import type {AuthEnvironment} from './auth';
import {RequestFailure, assertSameOrigin, boundedJson, respond} from './http';
import {calculatePricing} from './pricing-calculator';

type ScenarioRow = {id: string; revision: number; input: string; createdAt: string; updatedAt: string};
const scenarioSelect = 'SELECT id,revision,input_json AS input,created_at AS createdAt,updated_at AS updatedAt FROM pricing_scenarios';
const scenarioView = (row: ScenarioRow): PricingSavedScenario => ({...row, input: PricingSimulationInput.parse(JSON.parse(row.input))});
export async function pricingScenarios(db: D1Database) {
  const result = await db.prepare(scenarioSelect + ' WHERE deleted_at IS NULL ORDER BY updated_at DESC,id DESC LIMIT 100').all<ScenarioRow>();
  return result.results.map(scenarioView);
}
export async function pricingAction(db: D1Database, actor: string, input: unknown) {
  const parsed = PricingSimulationAction.safeParse(input);
  if (!parsed.success) throw new RequestFailure('VALIDATION_ERROR');
  const value = parsed.data;
  if (value.action === 'calculate') return {report: calculatePricing(value.input)};
  const at = new Date().toISOString(), mutation = crypto.randomUUID();
  const id = value.id ?? crypto.randomUUID();
  const audit = (action: 'create' | 'update' | 'delete') => db.prepare(`INSERT INTO pricing_scenario_audit(id,actor_id,scenario_id,action,revision,created_at)
    SELECT ?,?,id,?,revision,? FROM pricing_scenarios WHERE id=? AND mutation_id=?`)
    .bind(mutation, actor, action, at, id, mutation);
  try {
    if (value.action === 'delete') {
      const result = await db.batch([
        db.prepare('UPDATE pricing_scenarios SET deleted_at=?,updated_at=?,updated_by=?,revision=revision+1,mutation_id=? WHERE id=? AND revision=? AND deleted_at IS NULL')
          .bind(at, at, actor, mutation, id, value.revision), audit('delete'),
      ]);
      if (result[0].meta.changes !== 1) throw new RequestFailure('CONFLICT');
      return {deleted: id};
    }
    const json = JSON.stringify(value.input);
    if (new TextEncoder().encode(json).byteLength > 49152) throw new RequestFailure('VALIDATION_ERROR');
    if (value.id === null) {
      await db.batch([
        db.prepare('INSERT INTO pricing_scenarios(id,name,revision,input_json,mutation_id,created_by,updated_by,created_at,updated_at) VALUES(?,?,1,?,?,?,?,?,?)')
          .bind(id, value.input.name, json, mutation, actor, actor, at, at), audit('create'),
      ]);
    } else {
      const result = await db.batch([
        db.prepare('UPDATE pricing_scenarios SET name=?,input_json=?,revision=revision+1,updated_by=?,updated_at=?,mutation_id=? WHERE id=? AND revision=? AND deleted_at IS NULL')
          .bind(value.input.name, json, actor, at, mutation, id, value.revision), audit('update'),
      ]);
      if (result[0].meta.changes !== 1) throw new RequestFailure('CONFLICT');
    }
    // Return the revision written by this mutation, not an unguarded later save.
    const row = await db.prepare(scenarioSelect + ' WHERE id=? AND mutation_id=? AND deleted_at IS NULL').bind(id, mutation).first<ScenarioRow>();
    if (!row) throw new RequestFailure('CONFLICT');
    return {scenario: scenarioView(row)};
  } catch (error) {
    if (error instanceof RequestFailure) throw error;
    const message = error instanceof Error ? error.message : '';
    if (message.includes('PRICING_RATE_LIMIT')) throw new RequestFailure('RATE_LIMITED');
    if (message.includes('PRICING_SCENARIO_LIMIT')) throw new RequestFailure('CONFLICT', {scenario: 'La limite de 100 scénarios sauvegardés est atteinte.'});
    throw error;
  }
}

export type PricingObservation = {provider: string; realCalls: number; measuredCalls: number; completeJobs: number;
  estimatedTotalUsd: number | null; estimatedAverageJobUsd: number | null;
  reconciledJobs: number; reconciledAverageJobEur: number | null; reconciledTotalEur: number | null};
export type PricingObservations = {at: string; days: number; mode: 'all' | 'test' | 'live';
  activity: {jobs: number; ready: number; failed: number; consumedCredits: number; requestedAnimations: number; reusedAnimations: number};
  render: {reports: number; averageSeconds: number | null; averageOutputMB: number | null};
  providers: PricingObservation[]; unusedPackCredits: number;
  sales: {kind: string; transactions: number; credits: number; revenueHtEur: number; feeEur: number | null; missingFees: number}[]};
export async function pricingObservations(db: D1Database, query = new URLSearchParams(), now = Date.now()): Promise<PricingObservations> {
  const parsed = z.object({days: z.coerce.number().int().min(1).max(365).default(30),
    mode: z.enum(['all', 'test', 'live']).default('all')}).strict().safeParse(Object.fromEntries(query));
  if (!parsed.success) throw new RequestFailure('VALIDATION_ERROR');
  const {days, mode} = parsed.data, at = new Date(now).toISOString(), since = new Date(now - days * 86400_000).toISOString();
  const filter = "g.created_at>=? AND g.created_at<=? AND (?='all' OR g.financial_mode=?)";
  const args = [since, at, mode, mode];
  const number = (path: string) => `CASE WHEN json_valid(n.result_json) AND json_type(n.result_json,'${path}') IN ('integer','real')
    AND json_extract(n.result_json,'${path}') BETWEEN 0 AND 9007199254740991 THEN json_extract(n.result_json,'${path}') END`;
  const [activity, render, estimated, invoices, wallets, sales] = await Promise.all([
    db.prepare(`SELECT count(*) AS jobs,coalesce(sum(j.status='ready'),0) AS ready,coalesce(sum(j.status='failed'),0) AS failed,
      coalesce(sum(f.credits_used),0) AS consumedCredits,coalesce(sum(g.animations_requested),0) AS requestedAnimations,coalesce(sum(g.animations_reused),0) AS reusedAnimations
      FROM generation_runs g JOIN jobs j ON j.id=g.job_id LEFT JOIN finance_video_summary f ON f.job_id=g.job_id WHERE ${filter}`)
      .bind(...args).first<PricingObservations['activity']>(),
    db.prepare(`SELECT count(*) AS reports,avg(CASE WHEN json_type(v.report_json,'$.renderAndVerifySeconds') IN ('integer','real')
      AND json_extract(v.report_json,'$.renderAndVerifySeconds') BETWEEN 1 AND 3600 THEN json_extract(v.report_json,'$.renderAndVerifySeconds') END) AS averageSeconds,
      avg(CASE WHEN json_type(v.report_json,'$.sizeBytes')='integer' AND json_extract(v.report_json,'$.sizeBytes')>0
      THEN json_extract(v.report_json,'$.sizeBytes')/1000000.0 END) AS averageOutputMB
      FROM generation_artifacts v JOIN generation_runs g ON g.job_id=v.job_id JOIN jobs j ON j.id=g.job_id WHERE ${filter} AND j.status='ready'`)
      .bind(...args).first<PricingObservations['render']>(),
    db.prepare(`WITH calls AS (SELECT n.provider,n.job_id,j.status,CASE WHEN json_valid(n.result_json) AND json_extract(n.result_json,'$.metrics.cost.currency')='USD'
      THEN CASE WHEN n.provider='openai' THEN ${number('$.metrics.cost.estimatedMicrosBeforeCacheDiscount')}
      ELSE ${number('$.metrics.cost.estimatedMicrosBeforeFreeTier')} END END AS usdMicros
      FROM narration_calls n JOIN generation_runs g ON g.job_id=n.job_id JOIN jobs j ON j.id=n.job_id WHERE ${filter} AND n.provider_mode='real'),
      per_job AS (SELECT provider,job_id,status,count(*) calls,count(usdMicros) measured,sum(usdMicros) amount FROM calls GROUP BY provider,job_id,status)
      SELECT provider,sum(calls) realCalls,sum(measured) measuredCalls,sum(calls=measured AND status='ready') completeJobs,
      sum(amount)/1000000.0 estimatedTotalUsd,avg(CASE WHEN calls=measured AND status='ready' THEN amount/1000000.0 END) estimatedAverageJobUsd
      FROM per_job GROUP BY provider ORDER BY provider`).bind(...args)
      .all<{provider: string; realCalls: number; measuredCalls: number; completeJobs: number; estimatedTotalUsd: number | null; estimatedAverageJobUsd: number | null}>(),
    db.prepare(`SELECT f.provider,count(*) jobs,sum(f.amount_micros)/1000000.0 amountEur,avg(f.amount_micros)/1000000.0 averageEur
      FROM finance_supplier_costs f JOIN generation_runs g ON g.job_id=f.job_id JOIN jobs j ON j.id=f.job_id WHERE ${filter} AND f.covered=1 AND j.status='ready' GROUP BY f.provider ORDER BY f.provider`)
      .bind(...args).all<{provider: string; jobs: number; amountEur: number; averageEur: number}>(),
    db.prepare(`SELECT coalesce(sum(max(0,a.quota_limit-a.consumed-a.reserved)),0) AS credits
      FROM allocations a JOIN financial_receipts f ON f.allocation_id=a.id
      WHERE f.kind='topup' AND (?='all' OR f.mode=?) AND a.valid_from<=? AND a.valid_until>?`)
      .bind(mode, mode, at, at).first<{credits: number}>(),
    db.prepare(`SELECT kind,count(*) transactions,sum(credits) credits,
      sum(revenue_ht_cents*1.0*(max(0,gross_cents-refunded_cents-lost_cents))/gross_cents)/100.0 revenueHtEur,
      sum(fee_cents)/100.0 feeEur,sum(fees_complete=0 OR fee_cents IS NULL OR disputed=1) missingFees
      FROM financial_receipts WHERE paid_at>=? AND paid_at<=? AND (?='all' OR mode=?) GROUP BY kind`)
      .bind(...args).all<PricingObservations['sales'][number]>(),
  ]);
  const providers = [...new Set([...estimated.results.map(r => r.provider), ...invoices.results.map(r => r.provider)])].map(provider => {
    const estimate = estimated.results.find(r => r.provider === provider), invoice = invoices.results.find(r => r.provider === provider);
    return {provider, realCalls: estimate?.realCalls ?? 0, measuredCalls: estimate?.measuredCalls ?? 0,
      completeJobs: estimate?.completeJobs ?? 0, estimatedTotalUsd: estimate?.estimatedTotalUsd ?? null,
      estimatedAverageJobUsd: estimate?.estimatedAverageJobUsd ?? null, reconciledJobs: invoice?.jobs ?? 0,
      reconciledAverageJobEur: invoice?.averageEur ?? null, reconciledTotalEur: invoice?.amountEur ?? null};
  });
  return {at, days, mode, activity: activity ?? {jobs: 0, ready: 0, failed: 0, consumedCredits: 0, requestedAnimations: 0, reusedAnimations: 0},
    render: render ?? {reports: 0, averageSeconds: null, averageOutputMB: null}, providers,
    unusedPackCredits: wallets?.credits ?? 0, sales: sales.results};
}
export type PricingBootstrap = {defaults: PricingSimulationInput; scenarios: PricingSavedScenario[];
  observations: PricingObservations; sources: typeof pricingSimulationSources;
  catalog: {packs: typeof creditPacks; subscriptions: typeof creditPlans}};
export function pricingRequest(request: Request, env: AuthEnvironment & {DB: D1Database; SUPER_ADMIN_EMAIL?: string}) {
  return respond(async () => {
    const user = await requireAdmin(request, env);
    if (request.method === 'GET') {
      const query = new URL(request.url).searchParams;
      const [scenarios, observations] = await Promise.all([pricingScenarios(env.DB), pricingObservations(env.DB, query)]);
      const body: PricingBootstrap = {defaults: defaultPricingSimulation(), scenarios, observations,
        sources: pricingSimulationSources, catalog: {packs: creditPacks, subscriptions: creditPlans}};
      return Response.json(body);
    }
    if (request.method !== 'POST') throw new RequestFailure('FORBIDDEN');
    assertSameOrigin(request, env);
    return Response.json(await pricingAction(env.DB, user.id, await boundedJson(request, 65536)));
  });
}
