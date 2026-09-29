import {getCloudflareContext} from '@opennextjs/cloudflare';
import {respond} from '../../../../../lib/http';
import {findPublic, generationPoster} from '../../../../../lib/sharing';
export const dynamic = 'force-dynamic';
export async function GET(_request: Request, context: {params: Promise<{id: string}>}) {return respond(async () => {
  const {env} = await getCloudflareContext({async: true});
  const {row} = await findPublic(env.DB, (await context.params).id);
  return generationPoster(env, row.agencyId, row.jobId);
});}
