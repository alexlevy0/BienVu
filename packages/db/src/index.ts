import {CostEvent, EntityId, Job} from '@bienvu/contracts';
export * from './agency';
export * from './imports';
export * from './creation-drafts';
export * from './import-budget';
export * from './narration';
export * from './generation';
export * from './editor-voice';
export * from './animation-library';
export * from './retention';
export * from './homepage';

// Port structurel minimal compatible D1 ; pas de transaction interactive.
export interface SqlStatement {
  bind(...values: (string | number | null)[]): SqlStatement;
  first<T>(): Promise<T | null>;
  run(): Promise<unknown>;
}
export interface Database {prepare(sql: string): SqlStatement}

// agencyId vient du contexte serveur authentifié, jamais du corps client.
export async function findAgencyJob(db: Database, agencyId: string, jobId: string): Promise<Job | null> {
  EntityId.parse(agencyId); EntityId.parse(jobId);
  const row = await db.prepare(`SELECT id, agency_id AS agencyId, idempotency_key AS idempotencyKey,
    status, stage, attempt, lease_until AS leaseUntil, workflow_id AS workflowId,
    reservation_id AS reservationId, error_code AS errorCode, created_at AS createdAt, updated_at AS updatedAt
    FROM jobs WHERE agency_id = ? AND id = ?`).bind(agencyId, jobId).first();
  return row ? Job.parse(row) : null;
}

export async function generationsEnabled(db: Database, flag: string | undefined): Promise<boolean> {
  if (flag !== 'true') return false;
  const state = await db.prepare("SELECT enabled FROM generation_control WHERE id = 'generations'").first<{enabled: number}>();
  return state?.enabled === 1;
}

// Même événement rejoué = même écriture. Les estimations ne sont pas des factures.
export async function recordCost(db: Database, input: CostEvent): Promise<void> {
  const cost = CostEvent.parse(input);
  await db.prepare(`INSERT INTO cost_events(id, agency_id, job_id, request_id, provider, stage, kind,
    quantity, unit, currency, unit_price_micros, amount_micros, price_date, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT(id) DO NOTHING`)
    .bind(cost.id, cost.agencyId, cost.jobId, cost.requestId, cost.provider, cost.stage, cost.kind,
      cost.quantity, cost.unit, cost.currency, cost.unitPriceMicros, cost.amountMicros, cost.priceDate, cost.createdAt).run();
  const stored = await db.prepare(`SELECT id, agency_id AS agencyId, job_id AS jobId, request_id AS requestId,
    provider, stage, kind, quantity, unit, currency, unit_price_micros AS unitPriceMicros,
    amount_micros AS amountMicros, price_date AS priceDate, created_at AS createdAt
    FROM cost_events WHERE id = ?`).bind(cost.id).first<Record<string, unknown>>();
  if (!stored || Object.entries(cost).some(([key, value]) => stored[key] !== value))
    throw new Error('COST_EVENT_CONFLICT');
}

export * from './credits';
export * from './anonymous';
export * from './admin';
export * from './traffic';
export * from './teams';
