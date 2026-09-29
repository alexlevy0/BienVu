import {getCloudflareContext} from '@opennextjs/cloudflare';
import {respond} from '../../../../lib/http';
import {findPublic} from '../../../../lib/sharing';
export const dynamic = 'force-dynamic';
export async function GET(_request: Request, context: {params: Promise<{id: string}>}) {return respond(async () => {
  const {env} = await getCloudflareContext({async: true});
  return Response.json((await findPublic(env.DB, (await context.params).id)).view);
});}
