import {MANUAL_PHOTO_LIMITS} from '@bienvu/contracts';
import {requireOwner} from '../../../../../../lib/owner';
import {assertSameOrigin, boundedBytes, RequestFailure, respond} from '../../../../../../lib/http';
import {photoNormalizer} from '../../../../../../lib/import-transport';
import {manualDraft, uploadManualPhoto} from '../../../../../../lib/manual-listings';
export const dynamic = 'force-dynamic';
export async function PUT(request: Request, {params}: {params: Promise<{id: string; index: string}>}) {
  return respond(async () => {
    const {env, agency} = await requireOwner(request); assertSameOrigin(request, env);
    const {id, index} = await params, normalize = photoNormalizer(request, env, agency.id, id);
    if (!/^(?:[0-9]|1[01])$/.test(index)) throw new RequestFailure('VALIDATION_ERROR');
    await manualDraft(env.DB, agency.id, id);
    const bytes = await boundedBytes(request, MANUAL_PHOTO_LIMITS.fileBytes, 'PHOTO_TOO_LARGE');
    const photo = await uploadManualPhoto(env, agency.id, id, Number(index), bytes, request.headers.get('content-type')?.split(';')[0] ?? '', normalize, request.signal);
    return Response.json({photo});
  });
}
