import RunwayML from '@runwayml/sdk';

type Env = { DB: D1Database; RUNWAYML_API_SECRET?: string; RUNWAY_ENABLED?: string };
type Account = Awaited<ReturnType<RunwayML['organization']['retrieve']>>;

// Free, read-only metadata. Capture reservations BEFORE the HTTP request so
// concurrent submissions are deducted even during this read. Pending tasks may
// not yet appear in the provider debit: reserve them too, conservatively.
export async function syncRunwayAccount(env: Env, force = false, read?: () => Promise<Account>) {
  if (env.RUNWAY_ENABLED !== 'true' || !env.RUNWAYML_API_SECRET) return { checked: false };
  const startedAt = new Date().toISOString();
  const previous = await env.DB.prepare(
    "SELECT balance_checked_at AS checkedAt,balance_error AS error FROM generation_provider_limits WHERE provider='runway'",
  ).first<{ checkedAt: string | null; error: string | null }>();
  if (!force && !previous?.error && previous?.checkedAt && Date.now() - Date.parse(previous.checkedAt) < 60_000)
    return { checked: false };
  const usage = await env.DB.prepare(
    'SELECT reserved_credits AS reserved,pending_credits AS pending FROM runway_local_usage',
  ).first<{ reserved: number; pending: number }>();
  try {
    const details = await (read?.() ??
      new RunwayML({ apiKey: env.RUNWAYML_API_SECRET, maxRetries: 0, timeout: 15_000 }).organization.retrieve());
    const model = details.tier.models.gen4_turbo;
    if (
      !model ||
      typeof model.maxConcurrentGenerations !== 'number' ||
      !Number.isInteger(model.maxConcurrentGenerations) ||
      model.maxConcurrentGenerations < 1 ||
      model.maxConcurrentGenerations > 100 ||
      typeof model.maxDailyGenerations !== 'number' ||
      !Number.isInteger(model.maxDailyGenerations) ||
      model.maxDailyGenerations < 1 ||
      !Number.isFinite(details.creditBalance) ||
      details.creditBalance < 0
    )
      throw Error('RUNWAY_ACCOUNT_INVALID');
    await env.DB.prepare(`UPDATE generation_provider_limits SET concurrency=?,daily_limit=?,checked_at=?,last_error=NULL,
      credit_balance=?,balance_reserved_credits=?,balance_pending_credits=?,balance_checked_at=?,balance_error=NULL
      WHERE provider='runway' AND (balance_checked_at IS NULL OR balance_checked_at<=?)`)
      .bind(
        model.maxConcurrentGenerations,
        model.maxDailyGenerations,
        startedAt,
        details.creditBalance,
        usage?.reserved ?? 0,
        usage?.pending ?? 0,
        startedAt,
        startedAt,
      )
      .run();
    return { checked: true };
  } catch {
    await env.DB.prepare(`UPDATE generation_provider_limits SET last_error='RUNWAY_LIMITS_UNAVAILABLE',balance_error='RUNWAY_ACCOUNT_UNAVAILABLE'
      WHERE provider='runway' AND (balance_checked_at IS NULL OR balance_checked_at<=?)`)
      .bind(startedAt)
      .run();
    return { checked: false };
  }
}
