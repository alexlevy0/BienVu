import { UpdateSiteFeatures } from '@bienvu/contracts';
import { siteFeatures, setSiteFeatures } from '@bienvu/db';
import type { AuthEnvironment } from './auth';
import { requireAdmin } from './admin-access';
import { respond, RequestFailure, assertSameOrigin, boundedJson } from './http';

export async function publicSiteFeaturesRequest(db: AuthEnvironment['DB']) {
  return respond(async () => {
    const { revision, features } = await siteFeatures(db);
    return Response.json({ revision, features });
  });
}
export async function adminSiteFeaturesRequest(
  request: Request,
  env: AuthEnvironment & { SUPER_ADMIN_EMAIL?: string },
) {
  return respond(async () => {
    const actor = await requireAdmin(request, env);
    if (request.method === 'GET') return Response.json(await siteFeatures(env.DB));
    if (request.method !== 'PATCH') throw new RequestFailure('NOT_FOUND');
    assertSameOrigin(request, env);
    const input = UpdateSiteFeatures.safeParse(await boundedJson(request, 1024));
    if (!input.success) throw new RequestFailure('VALIDATION_ERROR');
    try {
      return Response.json(await setSiteFeatures(env.DB, actor.id, input.data.features, input.data.revision));
    } catch (cause) {
      const message = String(cause);
      if (message.includes('SITE_FEATURE_CONFLICT')) throw new RequestFailure('CONFLICT');
      if (message.includes('SITE_FEATURE_RATE_LIMIT')) throw new RequestFailure('RATE_LIMITED');
      throw cause;
    }
  });
}
