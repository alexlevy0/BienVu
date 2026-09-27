import {publicFailure, type PublicErrorCode} from '@bienvu/contracts';
import {logDiagnostic, requestContext} from '@bienvu/observability';
import {authOrigin, type AuthEnvironment} from './auth';

export class RequestFailure extends Error {
  constructor(readonly code: PublicErrorCode, readonly fields?: Record<string, string>) {super(code);}
}
export function assertSameOrigin(request: Request, env: AuthEnvironment) {
  if (request.headers.get('origin') !== authOrigin(env) || request.headers.get('sec-fetch-site') === 'cross-site')
    throw new RequestFailure('FORBIDDEN');
}
export async function boundedBytes(request: Request, maxBytes: number) {
  const length = request.headers.get('content-length');
  if (length !== null && (!/^\d+$/.test(length) || Number(length) > maxBytes)) throw new RequestFailure('FILE_TOO_LARGE');
  if (!request.body) throw new RequestFailure('VALIDATION_ERROR');
  const reader = request.body.getReader();
  const parts: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const {value, done} = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > maxBytes) {await reader.cancel(); throw new RequestFailure('FILE_TOO_LARGE');}
      parts.push(value);
    }
  } finally {reader.releaseLock();}
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const part of parts) {bytes.set(part, offset); offset += part.length;}
  return bytes;
}
export async function boundedJson(request: Request) {
  if (request.headers.get('content-type')?.split(';')[0] !== 'application/json') throw new RequestFailure('VALIDATION_ERROR');
  const bytes = await boundedBytes(request, 8192);
  try {return JSON.parse(new TextDecoder().decode(bytes)) as unknown;} catch {throw new RequestFailure('VALIDATION_ERROR');}
}
export async function respond(action: () => Promise<Response>) {
  const context = requestContext();
  let response: Response;
  try {response = await action();} catch (error) {
    const failure = publicFailure(error instanceof RequestFailure ? error.code : 'INTERNAL_ERROR', context.requestId);
    response = Response.json({...failure.body, ...(error instanceof RequestFailure && error.fields ? {fields: error.fields} : {})}, {status: failure.status});
    logDiagnostic(context, {event: 'request_completed', status: failure.status, code: failure.body.error.code});
  }
  response.headers.set('Cache-Control', 'private, no-store');
  response.headers.set('X-Request-ID', context.requestId);
  response.headers.set('X-Content-Type-Options', 'nosniff');
  response.headers.set('Referrer-Policy', 'no-referrer');
  return response;
}
