import {requireOwner} from '../../../../lib/owner';
import {assertSameOrigin, boundedJson, RequestFailure, respond} from '../../../../lib/http';
import {assertImportMode, reserveCloudflareImport} from '../../../../lib/import-transport';
import {createManualListing} from '../../../../lib/manual-listings';
import {importResult} from '../../../../lib/imports';
import {failImport} from '@bienvu/db';
export const dynamic = 'force-dynamic';
export async function POST(request: Request) {
  return respond(async () => {
    const {env, agency} = await requireOwner(request); assertSameOrigin(request, env);
    const mode = assertImportMode(request, env);
    const key = request.headers.get('Idempotency-Key') ?? '';
    if (!/^[a-zA-Z0-9_-]{16,128}$/.test(key)) throw new RequestFailure('VALIDATION_ERROR');
    const row = await createManualListing(env, agency.id, key, await boundedJson(request, 120_000));
    if (mode === 'cloudflare' && row.status === 'importing') {
      try {await reserveCloudflareImport(env, agency.id, row.id);}
      catch (error) {await failImport(env.DB, agency.id, row.id, 'SOURCE_UNAVAILABLE', {stage: 'budget'}); throw error;}
    }
    return Response.json(importResult(row), {status: row.status === 'ready' ? 200 : 201});
  });
}
