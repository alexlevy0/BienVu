import { getCloudflareContext } from '@opennextjs/cloudflare';
import { readBetaWorldMap } from '../../../../lib/beta-world-map';
import { respond } from '../../../../lib/http';
export const dynamic = 'force-dynamic';
export async function GET() {
  return respond(async () => {
    const { env } = await getCloudflareContext({ async: true });
    return Response.json(await readBetaWorldMap(env), { headers: { 'X-Robots-Tag': 'noindex, nofollow' } });
  });
}
