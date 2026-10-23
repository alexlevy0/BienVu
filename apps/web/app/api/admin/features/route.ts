import { getCloudflareContext } from '@opennextjs/cloudflare';
import { adminSiteFeaturesRequest } from '../../../../lib/site-features';
export const dynamic = 'force-dynamic';
export async function GET(request: Request) {
  return adminSiteFeaturesRequest(request, (await getCloudflareContext({ async: true })).env);
}
export const PATCH = GET;
