import { requireOwner } from '../../../../../lib/owner';
import { respond } from '../../../../../lib/http';
import { ownGeneration } from '../../../../../lib/generations';
import { trialResponse } from '../../../../../lib/trials';
import { confirmJobMap } from '../../../../../lib/generation-map-confirmation';
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  return respond(() =>
    trialResponse(async () => {
      const { env, agency } = await requireOwner(request),
        row = await ownGeneration(env, agency.id, (await params).id);
      return confirmJobMap(request, env, row, 'owner');
    }),
  );
}
