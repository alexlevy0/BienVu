import {ImportInput} from '@bienvu/contracts';
import {listImportPage,ImportStateFailure} from '@bienvu/db';
import {requireOwner} from '../../../lib/owner';
import {assertSameOrigin, boundedJson, RequestFailure, respond} from '../../../lib/http';
import {createPrivateImport, importResult} from '../../../lib/imports';
import {importPorts} from '../../../lib/import-transport';
export const dynamic = 'force-dynamic';
export async function GET(request: Request) {
  return respond(async () => {const {env,agency}=await requireOwner(request),params=new URL(request.url).searchParams;
    try{return Response.json(await listImportPage(env.DB,agency.id,params.get('cursor')??undefined,params.get('drafts')==='1'));}
    catch(error){if(error instanceof ImportStateFailure)throw new RequestFailure(error.code);throw error;}
  });
}
export async function POST(request: Request) {
  return respond(async () => {
    const {env, agency} = await requireOwner(request); assertSameOrigin(request, env);
    const input = ImportInput.safeParse(await boundedJson(request));
    if (!input.success) throw new RequestFailure('INVALID_URL');
    const key = request.headers.get('Idempotency-Key') ?? '';
    if (!/^[a-zA-Z0-9_-]{16,128}$/.test(key)) throw new RequestFailure('VALIDATION_ERROR');
    const ports = importPorts(request, env, agency.id);
    const row = await createPrivateImport(env, agency.id, input.data.url, key, ports.transport, request.signal, {...ports,estimate:input.data.estimate});
    return Response.json(importResult(row), {status: row.status === 'importing' ? 202 : 200});
  });
}
