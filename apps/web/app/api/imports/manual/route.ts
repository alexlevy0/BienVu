import {requireOwner} from '../../../../lib/owner';
import {assertSameOrigin, boundedJson, RequestFailure, respond} from '../../../../lib/http';
import {localPhotoNormalizer} from '../../../../lib/import-transport';
import {createManualListing} from '../../../../lib/manual-listings';
import {importResult} from '../../../../lib/imports';
export const dynamic = 'force-dynamic';
export async function POST(request: Request) {
  return respond(async () => {
    const {env, agency} = await requireOwner(request); assertSameOrigin(request, env);
    localPhotoNormalizer(request, env); // Même barrière locale que l’import URL.
    const key = request.headers.get('Idempotency-Key') ?? '';
    if (!/^[a-zA-Z0-9_-]{16,128}$/.test(key)) throw new RequestFailure('VALIDATION_ERROR');
    const row = await createManualListing(env, agency.id, key, await boundedJson(request, 120_000));
    return Response.json(importResult(row), {status: row.status === 'ready' ? 200 : 201});
  });
}
