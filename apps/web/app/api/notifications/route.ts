import { getCloudflareContext } from '@opennextjs/cloudflare';
import { browserPushConfigured, sendGenerationNotifications, type BrowserPushEnvironment } from '@bienvu/notifications';
import { browserNotificationAction, pushPrincipal } from '../../../lib/browser-notifications';
import { respond } from '../../../lib/http';
export const dynamic = 'force-dynamic';
export async function GET() {
  return respond(async () => {
    const { env } = await getCloudflareContext({ async: true });
    const push: BrowserPushEnvironment = env;
    return Response.json({
      enabled: browserPushConfigured(push),
      publicKey: browserPushConfigured(push) ? push.WEB_PUSH_PUBLIC_KEY : null,
    });
  });
}
export async function POST(request: Request) {
  return respond(async () => {
    const { env, ctx } = await getCloudflareContext({ async: true });
    const response = await browserNotificationAction(request, env, () => pushPrincipal(request, env));
    ctx.waitUntil(
      sendGenerationNotifications(env).catch(() =>
        console.warn(JSON.stringify({ event: 'browser_push_dispatch_failed' })),
      ),
    );
    return response;
  });
}
export async function DELETE(request: Request) {
  return respond(async () => {
    const { env } = await getCloudflareContext({ async: true });
    return browserNotificationAction(request, env, () => pushPrincipal(request, env));
  });
}
