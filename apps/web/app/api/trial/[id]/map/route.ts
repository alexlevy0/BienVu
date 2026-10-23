import { getCloudflareContext } from '@opennextjs/cloudflare';
import { respond } from '../../../../../lib/http';
import { ownAnonymousJob, trialResponse } from '../../../../../lib/trials';
import { confirmJobMap } from '../../../../../lib/generation-map-confirmation';
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  return respond(() =>
    trialResponse(async () => {
      const { env } = await getCloudflareContext({ async: true }),
        row = await ownAnonymousJob(request, env, (await params).id);
      return confirmJobMap(request, env, row, 'anonymous');
    }),
  );
}
