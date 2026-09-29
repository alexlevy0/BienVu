import {getCloudflareContext} from '@opennextjs/cloudflare';
import {respond} from '../../../../../lib/http';
import {generationVideo} from '../../../../../lib/generations';
import {findPublic} from '../../../../../lib/sharing';
export const dynamic = 'force-dynamic';
export async function GET(request: Request, context: {params: Promise<{id: string}>}) {return respond(async () => {
  const {env} = await getCloudflareContext({async: true});
  const {row} = await findPublic(env.DB, (await context.params).id);
  return generationVideo(request, env, row.agencyId, row.jobId);
});}
export const HEAD = GET;
