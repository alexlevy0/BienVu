import {EntityId, JobStage, publicErrors, type PublicErrorCode} from '@bienvu/contracts';

export function requestContext() {
  // Ne pas faire confiance à un identifiant fourni par le navigateur.
  return {requestId: crypto.randomUUID(), startedAt: Date.now()};
}

export type RequestContext = ReturnType<typeof requestContext>;
type Diagnostic = {
  event: 'request_completed' | 'request_failed' | 'generation_paused';
  status: number;
  code?: PublicErrorCode;
  jobId?: string;
  stage?: string;
};

export function diagnosticRecord(context: RequestContext, input: Diagnostic) {
  // Liste blanche : ni Request, ni headers, URL, corps, message d'exception ou stack.
  return {
    requestId: context.requestId,
    event: ['request_completed', 'request_failed', 'generation_paused'].includes(input.event) ? input.event : 'request_failed',
    status: Number.isInteger(input.status) && input.status >= 100 && input.status <= 599 ? input.status : 500,
    durationMs: Math.max(0, Date.now() - context.startedAt),
    ...(input.code && Object.hasOwn(publicErrors, input.code) ? {code: input.code} : {}),
    ...(input.jobId && EntityId.safeParse(input.jobId).success ? {jobId: input.jobId} : {}),
    ...(input.stage && JobStage.safeParse(input.stage).success ? {stage: input.stage} : {}),
  };
}

export function logDiagnostic(context: RequestContext, input: Diagnostic) {
  const line = JSON.stringify(diagnosticRecord(context, input));
  if (input.status >= 500 && input.code !== 'GENERATIONS_PAUSED') console.error(line);
  else console.info(line);
}
