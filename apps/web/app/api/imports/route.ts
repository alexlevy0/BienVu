import {GenerationInput} from '@bienvu/contracts';
import {listImports} from '@bienvu/db';
import {requireOwner} from '../../../lib/owner';
import {assertSameOrigin, boundedJson, RequestFailure, respond} from '../../../lib/http';
import {createPrivateImport, importResult} from '../../../lib/imports';
import {localImportTransport} from '../../../lib/import-transport';
export const dynamic = 'force-dynamic';
export async function GET(request: Request) {
  return respond(async () => {const {env, agency} = await requireOwner(request); return Response.json({imports: await listImports(env.DB, agency.id)});});
}
export async function POST(request: Request) {
  return respond(async () => {
    const {env, agency} = await requireOwner(request); assertSameOrigin(request, env);
    const input = GenerationInput.safeParse(await boundedJson(request));
    if (!input.success) throw new RequestFailure('INVALID_URL');
    const key = request.headers.get('Idempotency-Key') ?? '';
    if (!/^[a-zA-Z0-9_-]{16,128}$/.test(key)) throw new RequestFailure('VALIDATION_ERROR');
    const transport = localImportTransport(request, env);
    const row = await createPrivateImport(env, agency.id, input.data.url, key, transport, request.signal);
    return Response.json(importResult(row), {status: row.status === 'importing' ? 202 : 200});
  });
}
