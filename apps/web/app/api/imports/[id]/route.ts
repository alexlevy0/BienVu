import {findImport} from '@bienvu/db';
import {requireOwner} from '../../../../lib/owner';
import {assertSameOrigin, RequestFailure, respond} from '../../../../lib/http';
import {importResult, purgeImport} from '../../../../lib/imports';
export const dynamic = 'force-dynamic';
type Context = {params: Promise<{id: string}>};
export async function GET(request: Request, context: Context) {
  return respond(async () => {const {env, agency} = await requireOwner(request);
    return Response.json(importResult(await findImport(env.DB, agency.id, (await context.params).id)));});
}
export async function DELETE(request: Request, context: Context) {
  return respond(async () => {const {env, agency} = await requireOwner(request); assertSameOrigin(request, env);
    const id = (await context.params).id;
    if (!await findImport(env.DB, agency.id, id)) throw new RequestFailure('NOT_FOUND');
    if (!await purgeImport(env, agency.id, id, Date.now(), true)) throw new RequestFailure('CONFLICT');
    return Response.json({ok: true});});
}
