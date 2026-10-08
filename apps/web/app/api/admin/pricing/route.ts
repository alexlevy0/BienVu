import {getCloudflareContext} from '@opennextjs/cloudflare';
import {pricingRequest} from '../../../../lib/pricing-simulator';

export const dynamic = 'force-dynamic';
export async function GET(request: Request) {
  return pricingRequest(request, (await getCloudflareContext({async: true})).env);
}
export const POST = GET;
