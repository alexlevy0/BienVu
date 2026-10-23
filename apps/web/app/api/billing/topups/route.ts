import { requireOwner } from '../../../../lib/owner';
import { respond, boundedJson, assertSameOrigin, RequestFailure } from '../../../../lib/http';
import { authOrigin } from '../../../../lib/auth';
import { createTopupCheckout, topupHistory } from '../../../../lib/credit-purchases';
import { isSuperAdmin } from '../../../../lib/admin-access';
export const dynamic = 'force-dynamic';
export async function GET(request: Request) {
  return respond(async () => {
    const { env, agency } = await requireOwner(request);
    return Response.json(
      { purchases: await topupHistory(env, agency.id) },
      { headers: { 'Cache-Control': 'private, no-store' } },
    );
  });
}
export async function POST(request: Request) {
  return respond(async () => {
    const { env, agency, user } = await requireOwner(request);
    assertSameOrigin(request, env);
    if (!isSuperAdmin(env, user)) throw new RequestFailure('FORBIDDEN');
    return Response.json(
      await createTopupCheckout(
        env,
        user,
        agency.id,
        agency.email ?? '',
        authOrigin(env),
        await boundedJson(request, 1024),
        request.headers.get('Idempotency-Key') ?? '',
      ),
    );
  });
}
