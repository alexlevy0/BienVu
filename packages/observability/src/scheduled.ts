import { publicErrors, type PublicErrorCode } from '@bienvu/contracts';
import { PostHog } from 'posthog-node/edge';

const taskNames = [
  'purge_traffic',
  'purge_seo',
  'cleanup_social',
  'cleanup_homepage_assets',
  'cleanup_mail_uploads',
  'cleanup_partner_applications',
  'purge_ai_quality',
  'cleanup_showcases',
  'cleanup_push_devices',
  'run_social_batch',
  'send_mailbox_outbox',
  'run_ai_quality_batch',
  'send_showcase_notifications',
  'send_generation_notifications',
  'run_admin_alerts',
  'sync_runway_limits',
  'reconcile_generations',
  'reconcile_avatars',
  'run_admin_recovery',
  'cleanup_anonymous_trials',
  'cleanup_animations',
  'purge_hosted_imports',
] as const;
export type ScheduledTask = { name: (typeof taskNames)[number]; run: () => Promise<unknown> };
export type ScheduledWorker = 'web' | 'generation' | 'import';
export type ScheduledTrackingEnv = {
  POSTHOG_ENABLED?: string;
  POSTHOG_PROJECT_TOKEN?: string;
  POSTHOG_HOST?: string;
  POSTHOG_ERROR_TRACKING_ENABLED?: string;
  BIENVU_RELEASE?: string;
  PROBE_MODE?: string;
};

export function scheduledErrorCode(error: unknown): PublicErrorCode | 'GENERATION_RECONCILE_FAILED' {
  const code =
    error && typeof error === 'object' && 'code' in error ? error.code : error instanceof Error ? error.message : null;
  if (code === 'GENERATION_RECONCILE_FAILED') return code;
  return typeof code === 'string' && Object.hasOwn(publicErrors, code) ? (code as PublicErrorCode) : 'INTERNAL_ERROR';
}
export function scheduledFailureRecord(worker: string, task: string, error: unknown) {
  // Closed lists only: never copy an exception message, cause, provider response or payload.
  return {
    event: 'scheduled_task_failed' as const,
    worker: ['web', 'generation', 'import'].includes(worker) ? worker : 'unknown',
    task: (taskNames as readonly string[]).includes(task) ? task : 'unknown',
    code: scheduledErrorCode(error),
  };
}
type Failure = ReturnType<typeof scheduledFailureRecord>;
export class ScheduledTasksFailed extends Error {
  constructor(public readonly failures: readonly Failure[]) {
    super('SCHEDULED_TASKS_FAILED');
  }
}

async function captureFailure(env: ScheduledTrackingEnv, failure: Failure, fetcher: typeof fetch) {
  if (
    env.POSTHOG_ENABLED !== 'true' ||
    env.POSTHOG_ERROR_TRACKING_ENABLED === 'false' ||
    env.POSTHOG_HOST !== 'https://eu.i.posthog.com' ||
    !/^phc_[A-Za-z0-9_-]{20,150}$/.test(env.POSTHOG_PROJECT_TOKEN ?? '')
  )
    return;
  const release = /^[A-Za-z0-9._-]{1,100}$/.test(env.BIENVU_RELEASE ?? '') ? env.BIENVU_RELEASE : 'unknown';
  // The edge SDK is shared with the web, without AsyncLocalStorage or Node imports.
  // Create a new, safe error: even a provider message containing PII never reaches the SDK.
  const error = new Error(`${failure.worker}.${failure.task}: ${failure.code}`);
  error.name = 'ScheduledTaskError';
  const client = new PostHog(env.POSTHOG_PROJECT_TOKEN!, {
    host: 'https://eu.i.posthog.com',
    flushAt: 1,
    flushInterval: 0,
    requestTimeout: 2500,
    fetchRetryCount: 0,
    enableExceptionAutocapture: false,
    disableGeoip: true,
    fetch: (url, options) => fetcher.call(globalThis, url, options),
    before_send: (event) =>
      event?.event === '$exception'
        ? {
            ...event,
            properties: {
              $exception_list: event.properties?.$exception_list,
              $exception_fingerprint: `${failure.worker}:${failure.task}:${failure.code}`,
              bv_error_source: 'scheduled',
              bv_worker: failure.worker,
              bv_scheduled_task: failure.task,
              bv_error_code: failure.code,
              bv_release: release,
              is_test: env.PROBE_MODE === 'true',
              $process_person_profile: false,
              $geoip_disable: true,
              $ip: null,
            },
          }
        : null,
  });
  let warned = false;
  const warn = () => {
    if (!warned)
      console.warn(
        JSON.stringify({
          event: 'scheduled_error_tracking_delivery_failed',
          worker: failure.worker,
          task: failure.task,
        }),
      );
    warned = true;
  };
  client.on('error', warn);
  try {
    await client.captureExceptionImmediate(error, 'bienvu:server');
  } catch {
    warn();
  } finally {
    await client.shutdown(3000).catch(warn);
  }
}

export async function runScheduledTasks(
  worker: ScheduledWorker,
  env: ScheduledTrackingEnv,
  tasks: readonly ScheduledTask[],
  options: { parallel?: boolean; fetcher?: typeof fetch } = {},
) {
  const failures: Failure[] = [],
    reports: Promise<void>[] = [];
  const run = async (task: ScheduledTask) => {
    try {
      await task.run();
    } catch (error) {
      const failure = scheduledFailureRecord(worker, task.name, error);
      failures.push(failure);
      console.error(JSON.stringify(failure));
      // Attach a catch immediately; telemetry failure must not skip the remaining tasks.
      reports.push(
        captureFailure(env, failure, options.fetcher ?? fetch).catch(() => {
          console.warn(
            JSON.stringify({ event: 'scheduled_error_tracking_delivery_failed', worker, task: failure.task }),
          );
        }),
      );
    }
  };
  if (options.parallel) await Promise.all(tasks.map(run));
  else for (const task of tasks) await run(task);
  await Promise.all(reports);
  // Reject only after ALL tasks and their reports have settled. The cron stays visibly failed.
  if (failures.length) throw new ScheduledTasksFailed(failures);
}
