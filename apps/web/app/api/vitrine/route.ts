import { ShowcaseSlug } from '@bienvu/contracts';
import { showcaseSlugAvailable, showcaseLimit } from '@bienvu/db';
import { requireOwner } from '../../../lib/owner';
import { assertSameOrigin, boundedJson, respond, RequestFailure } from '../../../lib/http';
import { showcaseManagement } from '../../../lib/showcase-management';
import { mutateShowcase } from '../../../lib/showcases';
import { mutateShowcaseLead } from '../../../lib/showcase-contacts';
export const dynamic = 'force-dynamic';
export async function GET(request: Request) {
  return respond(async () => {
    const { env, agency, role } = await requireOwner(request),
      params = new URL(request.url).searchParams;
    if (params.has('slug')) {
      const slug = ShowcaseSlug.safeParse(params.get('slug'));
      if (!slug.success) throw new RequestFailure('VALIDATION_ERROR');
      return Response.json({ available: await showcaseSlugAvailable(env.DB, agency.id, slug.data) });
    }
    if (params.has('days') && !['7', '30'].includes(params.get('days')!)) throw new RequestFailure('VALIDATION_ERROR');
    return Response.json(await showcaseManagement(env, agency, role, params));
  });
}
export async function POST(request: Request) {
  return respond(async () => {
    const { env, agency, role } = await requireOwner(request);
    assertSameOrigin(request, env);
    const body = await boundedJson(request, 24576);
    if (!(await showcaseLimit(env.DB, 'manage:' + agency.id, 60, 60000))) throw new RequestFailure('RATE_LIMITED');
    if (
      body &&
      typeof body === 'object' &&
      'action' in body &&
      typeof body.action === 'string' &&
      body.action.startsWith('lead')
    )
      return Response.json(await mutateShowcaseLead(env, agency.id, role, body));
    const row = await mutateShowcase(env, agency, role, body);
    return Response.json({ version: row!.version, status: row!.status });
  });
}
