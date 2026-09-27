import {getCloudflareContext} from '@opennextjs/cloudflare';
import {handleAuthRequest} from '../../../../lib/auth-handler';
export const dynamic = 'force-dynamic';
async function handle(request: Request) {
  const {env, ctx} = await getCloudflareContext({async: true});
  return handleAuthRequest(request, env, task => ctx.waitUntil(task));
}
export const GET = handle;
export const POST = handle;
