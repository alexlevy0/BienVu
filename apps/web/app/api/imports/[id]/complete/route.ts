import {requireOwner} from '../../../../../lib/owner';
import {assertSameOrigin, respond} from '../../../../../lib/http';
import {assertImportMode} from '../../../../../lib/import-transport';
import {finishManualListing} from '../../../../../lib/manual-listings';
import {importResult} from '../../../../../lib/imports';
export const dynamic = 'force-dynamic';
export async function POST(request: Request, {params}: {params: Promise<{id: string}>}) {
  return respond(async () => {
    const {env, agency} = await requireOwner(request); assertSameOrigin(request, env); assertImportMode(request, env);
    return Response.json(importResult(await finishManualListing(env, agency.id, (await params).id)));
  });
}
