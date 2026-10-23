import { confirmGenerationMap, findGeneration, generationView, type GenerationRow } from '@bienvu/db';
import { assertSameOrigin, boundedJson, RequestFailure } from './http';
import type { TrialEnv } from './trials';

export async function confirmJobMap(
  request: Request,
  env: TrialEnv,
  row: GenerationRow,
  audience: 'owner' | 'anonymous',
) {
  assertSameOrigin(request, env);
  await confirmGenerationMap(env.DB, row.agencyId, row.jobId, await boundedJson(request, 1024));
  const fresh = await findGeneration(env.DB, row.agencyId, row.jobId);
  if (!fresh) throw new RequestFailure('NOT_FOUND');
  return Response.json(generationView(fresh, Date.now(), audience));
}
