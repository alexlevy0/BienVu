import { getCloudflareContext } from '@opennextjs/cloudflare';
import { respond } from '../../../../../../../../lib/http';
import { publicShowcaseMedia } from '../../../../../../../../lib/showcases';
export const dynamic = 'force-dynamic';
export async function GET(
  request: Request,
  { params }: { params: Promise<{ slug: string; propertyId: string; id: string }> },
) {
  return respond(async () => {
    const { env } = await getCloudflareContext({ async: true }),
      p = await params;
    return publicShowcaseMedia(request, env, p.slug, p.id, p.propertyId);
  });
}
export const HEAD = GET;
