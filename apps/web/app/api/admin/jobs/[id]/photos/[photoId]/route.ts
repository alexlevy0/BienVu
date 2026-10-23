import { getCloudflareContext } from '@opennextjs/cloudflare';
import { EntityId } from '@bienvu/contracts';
import { requireAdmin } from '../../../../../../../lib/admin-access';
import { respond, RequestFailure } from '../../../../../../../lib/http';
import { privateImportPhoto } from '../../../../../../../lib/imports';
export const dynamic = 'force-dynamic';
export async function GET(request: Request, { params }: { params: Promise<{ id: string; photoId: string }> }) {
  return respond(async () => {
    const { env } = await getCloudflareContext({ async: true });
    await requireAdmin(request, env);
    const { id, photoId } = await params;
    if (!EntityId.safeParse(id).success || !EntityId.safeParse(photoId).success) throw new RequestFailure('NOT_FOUND');
    const job = await env.DB.prepare(
      "SELECT g.agency_id AS agencyId,j.listing_id AS listingId FROM generation_runs g JOIN jobs j ON j.id=g.job_id WHERE g.job_id=? AND g.retention='available'",
    )
      .bind(id)
      .first<{ agencyId: string; listingId: string | null }>();
    if (!job?.listingId) throw new RequestFailure('NOT_FOUND');
    return privateImportPhoto(env, job.agencyId, job.listingId, photoId, true);
  });
}
