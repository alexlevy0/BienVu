import { startManualCreationDraft } from '../../../../lib/creation-drafts';
import { assertSameOrigin, boundedJson, RequestFailure, respond } from '../../../../lib/http';
import { requireOwner } from '../../../../lib/owner';
export const dynamic = 'force-dynamic';
export async function POST(request: Request) {
  return respond(async () => {
    const { env, agency } = await requireOwner(request);
    assertSameOrigin(request, env);
    const key = request.headers.get('Idempotency-Key') ?? '';
    if (!/^[a-zA-Z0-9_-]{16,128}$/.test(key)) throw new RequestFailure('VALIDATION_ERROR');
    const input = request.body ? ((await boundedJson(request, 1000)) as { category?: unknown }) : {};
    if (
      !input ||
      typeof input !== 'object' ||
      Array.isArray(input) ||
      Object.keys(input).some((key) => key !== 'category') ||
      (input.category !== undefined && input.category !== 'vehicle')
    )
      throw new RequestFailure('VALIDATION_ERROR');
    const draft = await startManualCreationDraft(env.DB, agency.id, key, null, input.category as 'vehicle' | undefined);
    // Créer un projet ou copier la démo n'utilise pas le transport d'import.
    // Le budget des photos personnelles est réservé à leur envoi, pas ici.
    return Response.json(draft, { status: 201 });
  });
}
