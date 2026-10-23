import { EntityId } from '@bienvu/contracts';
import { disablePushDevice, savePushDevice, watchPushGeneration, type PushPrincipal } from '@bienvu/db';
import { browserPushConfigured, validatePushSubscription, type BrowserPushEnvironment } from '@bienvu/notifications';
import { createAuth, type AuthEnvironment } from './auth';
import { requireTrial, type TrialEnv } from './trials';
import { assertSameOrigin, boundedJson, RequestFailure } from './http';
import { browserPushCookie } from './browser-push-cookie';

type Env = CloudflareEnv & BrowserPushEnvironment;
export async function pushPrincipal(request: Request, env: Env): Promise<PushPrincipal> {
  const session = await createAuth(env).api.getSession({ headers: request.headers });
  if (session?.user.emailVerified) return { kind: 'user', id: session.user.id };
  const trial = await requireTrial(request, env as TrialEnv);
  return { kind: 'trial', id: trial.id };
}
export async function browserNotificationAction(
  request: Request,
  env: BrowserPushEnvironment & AuthEnvironment,
  resolvePrincipal: () => Promise<PushPrincipal>,
) {
  assertSameOrigin(request, env);
  const value = await boundedJson(request, 8192);
  if (
    !value ||
    typeof value !== 'object' ||
    Array.isArray(value) ||
    !('token' in value) ||
    typeof value.token !== 'string' ||
    !/^[\w-]{43}$/.test(value.token)
  )
    throw new RequestFailure('VALIDATION_ERROR');
  if (request.method === 'DELETE') {
    await disablePushDevice(env.DB, value.token);
    return Response.json({ enabled: false }, { headers: { 'Set-Cookie': browserPushCookie(request, null) } });
  }
  if (!browserPushConfigured(env)) throw new RequestFailure('FEATURE_UNAVAILABLE');
  const principal = await resolvePrincipal();
  if (!('action' in value) || !['subscribe', 'watch'].includes(String(value.action)))
    throw new RequestFailure('VALIDATION_ERROR');
  if (
    !('jobs' in value) ||
    !Array.isArray(value.jobs) ||
    value.jobs.length > 12 ||
    value.jobs.some((id) => !EntityId.safeParse(id).success)
  )
    throw new RequestFailure('VALIDATION_ERROR');
  if (value.action === 'subscribe') {
    const subscription = await validatePushSubscription('subscription' in value ? value.subscription : null);
    if (!subscription) throw new RequestFailure('VALIDATION_ERROR');
    if (!(await savePushDevice(env.DB, principal, value.token, subscription))) throw new RequestFailure('RATE_LIMITED');
  }
  for (const job of new Set(value.jobs as string[])) await watchPushGeneration(env.DB, principal, value.token, job);
  return Response.json(
    { enabled: true },
    {
      status: 202,
      headers: value.action === 'subscribe' ? { 'Set-Cookie': browserPushCookie(request, value.token) } : {},
    },
  );
}
