import { UpdateGenerationQueue } from '@bienvu/contracts';
import { adminGenerationQueue, setGenerationQueueSettings } from '@bienvu/db';
import type { AuthEnvironment } from './auth';
import { requireAdmin } from './admin-access';
import { respond, RequestFailure, assertSameOrigin, boundedJson } from './http';

type Env = AuthEnvironment & { SUPER_ADMIN_EMAIL?: string; GENERATION_SERVICE?: Fetcher; GENERATION_TOKEN?: string };
export async function adminGenerationQueueRequest(request: Request, env: Env) {
  return respond(async () => {
    const actor = await requireAdmin(request, env);
    if (request.method === 'GET') return Response.json(await adminGenerationQueue(env.DB));
    assertSameOrigin(request, env);
    if (request.method === 'POST') {
      const body = await boundedJson(request, 128);
      if (
        !body ||
        typeof body !== 'object' ||
        Object.keys(body).length !== 1 ||
        !('action' in body) ||
        body.action !== 'refresh-runway'
      )
        throw new RequestFailure('VALIDATION_ERROR');
      if (!env.GENERATION_SERVICE || !env.GENERATION_TOKEN) throw new RequestFailure('GENERATIONS_PAUSED');
      const response = await env.GENERATION_SERVICE.fetch('https://generation.internal/operator/queue/runway', {
        method: 'POST',
        headers: { Authorization: `Bearer ${env.GENERATION_TOKEN}`, 'X-Agency-ID': actor.id },
      });
      if (!response.ok) throw new RequestFailure('SOURCE_UNAVAILABLE');
      await response.body?.cancel();
      return Response.json(await adminGenerationQueue(env.DB));
    }
    if (request.method !== 'PATCH') throw new RequestFailure('NOT_FOUND');
    const input = UpdateGenerationQueue.safeParse(await boundedJson(request, 2048));
    if (!input.success) throw new RequestFailure('VALIDATION_ERROR');
    try {
      return Response.json(
        await setGenerationQueueSettings(env.DB, actor.id, input.data.settings, input.data.revision),
      );
    } catch (cause) {
      if (String(cause).includes('GENERATION_QUEUE_SETTING_CONFLICT')) throw new RequestFailure('CONFLICT');
      if (String(cause).includes('GENERATION_QUEUE_SETTING_RATE_LIMIT')) throw new RequestFailure('RATE_LIMITED');
      throw cause;
    }
  });
}
