import { getCloudflareContext } from '@opennextjs/cloudflare';
import { publicHomeComparisonMedia } from '../../../../../lib/home-comparison-media';
export const dynamic = 'force-dynamic';
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { env } = await getCloudflareContext({ async: true });
  return publicHomeComparisonMedia(env.MEDIA, (await params).id, request);
}
export const HEAD = GET;
