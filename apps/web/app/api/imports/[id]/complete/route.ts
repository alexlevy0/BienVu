import {requireOwner} from '../../../../../lib/owner';
import {assertSameOrigin, respond} from '../../../../../lib/http';
import {assertImportMode} from '../../../../../lib/import-transport';
import {finishManualListing} from '../../../../../lib/manual-listings';
import {importResult} from '../../../../../lib/imports';
import {findImport} from '@bienvu/db';
import {boundedJson,RequestFailure} from '../../../../../lib/http';
import {finishCreationDraft} from '../../../../../lib/creation-drafts';
export const dynamic = 'force-dynamic';
export async function POST(request: Request, {params}: {params: Promise<{id: string}>}) {
  return respond(async () => {
    const {env, agency} = await requireOwner(request); assertSameOrigin(request, env); assertImportMode(request, env);
    const id=(await params).id,row=await findImport(env.DB,agency.id,id);
    if(row?.draftPending){const input=await boundedJson(request,1024) as {version?:unknown};
      if(!input||typeof input!=='object'||!Number.isSafeInteger(input.version))throw new RequestFailure('VALIDATION_ERROR');
      return Response.json(importResult(await finishCreationDraft(env,agency.id,id,input.version as number)));
    }
    return Response.json(importResult(await finishManualListing(env, agency.id, id)));
  });
}
