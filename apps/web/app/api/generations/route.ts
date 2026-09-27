import {getCloudflareContext} from '@opennextjs/cloudflare';
import {generationsEnabled} from '@bienvu/db';
import {publicFailure, type PublicErrorCode} from '@bienvu/contracts';
import {logDiagnostic, requestContext} from '@bienvu/observability';
export const dynamic = 'force-dynamic';
export async function POST() {
  const context = requestContext();
  let code: PublicErrorCode = 'GENERATIONS_PAUSED';
  try {
    const {env} = await getCloudflareContext({async: true});
    if (await generationsEnabled(env.DB, env.GENERATIONS_ENABLED)) code = 'UNAUTHORIZED';
    // Même si les deux interrupteurs sont activés, aucune génération sans auth.
  } catch {
    // Binding indisponible : refuser avant tout appel coûteux.
    code = 'GENERATIONS_PAUSED';
  }
  const failure = publicFailure(code, context.requestId);
  logDiagnostic(context, {event: code === 'GENERATIONS_PAUSED' ? 'generation_paused' : 'request_completed', status: failure.status, code});
  return Response.json(failure.body, {status: failure.status, headers: {'Cache-Control': 'no-store', 'X-Request-ID': context.requestId}});
}
export async function GET() {
  const context = requestContext();
  const failure = publicFailure('UNAUTHORIZED', context.requestId);
  return Response.json(failure.body, {status: failure.status, headers: {'Cache-Control': 'no-store', 'X-Request-ID': context.requestId}});
}
