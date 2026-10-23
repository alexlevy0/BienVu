import { getCloudflareContext } from '@opennextjs/cloudflare';
import { respond } from '../../../../../lib/http';
import { resolvePublicShowcase } from '../../../../../lib/showcases';
import { showcaseContactConfig, submitShowcaseContact } from '../../../../../lib/showcase-contacts';
export const dynamic = 'force-dynamic';
export async function GET(_request: Request, { params }: { params: Promise<{ slug: string }> }) {
  return respond(async () => {
    const { env } = await getCloudflareContext({ async: true });
    await resolvePublicShowcase(env, (await params).slug);
    return Response.json(showcaseContactConfig(env));
  });
}
export async function POST(request: Request, { params }: { params: Promise<{ slug: string }> }) {
  return respond(async () => {
    const { env, cf } = await getCloudflareContext({ async: true });
    return submitShowcaseContact(request, env, (await params).slug, Boolean(cf?.colo));
  });
}
